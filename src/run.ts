import {
  AccountUpdate,
  Mina,
  PrivateKey,
  Permissions,
  shutdown,
} from 'snarkyjs';
import {
  getIndexes,
  getNFTFromIndexer,
  getPendingActions,
  getProofsByIndexes,
  indexerUpdate,
} from './indexer';
import { NFT } from './models/nft';
import { NftZkapp } from './nft_zkapp';

const doProofs = true;
let Local = Mina.LocalBlockchain();
Mina.setActiveInstance(Local);

let feePayerKey = Local.testAccounts[0].privateKey;
let callerKey = Local.testAccounts[1].privateKey;
let callerPublicKey = callerKey.toPublicKey();
let receiverKey = Local.testAccounts[2].privateKey;
let receiverPublicKey = receiverKey.toPublicKey();
let zkappKey = PrivateKey.random();
let zkappAddress = zkappKey.toPublicKey();

async function test() {
  let zkapp = new NftZkapp(zkappAddress);

  if (doProofs) {
    console.log('start compiling');
    console.time('compile');
    await NftZkapp.compile();
    console.timeEnd('compile');
  }

  console.log('deploying');
  let tx = await Mina.transaction(feePayerKey, () => {
    AccountUpdate.fundNewAccount(feePayerKey);
    zkapp.deploy({ zkappKey });

    if (!doProofs) {
      zkapp.setPermissions({
        ...Permissions.default(),
        editState: Permissions.proofOrSignature(),
        editSequenceState: Permissions.proofOrSignature(),
      });
    }
  });

  if (doProofs) await tx.prove();
  tx.send();
  console.log('deploy done');

  // mint nft
  tx = await Mina.transaction(feePayerKey, () => {
    zkapp.mint(NFT.createNFTwithoutID('Mina Genesis 1', callerPublicKey));
    if (!doProofs) zkapp.sign(zkappKey);
  });
  if (doProofs) await tx.prove();
  tx.send();

  tx = await Mina.transaction(feePayerKey, () => {
    zkapp.mint(NFT.createNFTwithoutID('Mina Genesis 2', callerPublicKey));
    if (!doProofs) zkapp.sign(zkappKey);
  });
  if (doProofs) await tx.prove();
  tx.send();

  tx = await Mina.transaction(feePayerKey, () => {
    zkapp.mint(NFT.createNFTwithoutID('Mina Genesis 3', callerPublicKey));
    if (!doProofs) zkapp.sign(zkappKey);
  });
  if (doProofs) await tx.prove();
  tx.send();

  let fromActionHash = zkapp.lastActionsHash.get();
  let endActionHash = zkapp.currentActionsHash.get();
  let currentIndex = zkapp.currentIndex.get();
  let nftsCommitment = zkapp.nftsCommitment.get();

  // first rollup
  // 1. execute the contract rollup method
  let pendingActions = getPendingActions(zkapp, fromActionHash);
  console.log('pendingActions: ', pendingActions.toString());
  let indexes = getIndexes(pendingActions, currentIndex);
  console.log('indexes: ', indexes.toString());
  let proofStore = await getProofsByIndexes(indexes);
  zkapp.setProofStore(proofStore);
  tx = await Mina.transaction(feePayerKey, () => {
    zkapp.rollup();
    if (!doProofs) zkapp.sign(zkappKey);
  });
  if (doProofs) await tx.prove();
  tx.send();

  let rollupCompletedRoot1 = zkapp.nftsCommitment.get();
  console.log('rollupCompletedRoot1: ', rollupCompletedRoot1.toString());

  // 2. indexer update
  fromActionHash = zkapp.lastActionsHash.get();
  endActionHash = zkapp.currentActionsHash.get();
  currentIndex = zkapp.currentIndex.get();
  nftsCommitment = zkapp.nftsCommitment.get();
  let indexerUpdateRoot1 = await indexerUpdate(
    zkapp,
    fromActionHash,
    endActionHash,
    nftsCommitment,
    currentIndex
  );
  console.log('indexerUpdateRoot1: ', indexerUpdateRoot1.toString());
  // root must be equal
  indexerUpdateRoot1.assertEquals(rollupCompletedRoot1);

  let nft1 = await getNFTFromIndexer(1n);
  tx = await Mina.transaction(feePayerKey, () => {
    zkapp.transfer(receiverPublicKey, nft1, callerKey);
    if (!doProofs) zkapp.sign(zkappKey);
  });
  if (doProofs) await tx.prove();
  tx.send();

  let nft2 = await getNFTFromIndexer(2n);
  tx = await Mina.transaction(feePayerKey, () => {
    zkapp.transfer(receiverPublicKey, nft2, callerKey);
    if (!doProofs) zkapp.sign(zkappKey);
  });
  if (doProofs) await tx.prove();
  tx.send();

  // second rollup
  // 1. execute the contract rollup method
  fromActionHash = zkapp.lastActionsHash.get();
  endActionHash = zkapp.currentActionsHash.get();
  pendingActions = getPendingActions(zkapp, fromActionHash, endActionHash);
  console.log('second rollup - pendingActions: ', pendingActions.toString());
  indexes = getIndexes(pendingActions, currentIndex);
  console.log('second rollup - indexes: ', indexes.toString());
  proofStore = await getProofsByIndexes(indexes);
  zkapp.setProofStore(proofStore);

  tx = await Mina.transaction(feePayerKey, () => {
    zkapp.rollup();
    if (!doProofs) zkapp.sign(zkappKey);
  });
  if (doProofs) await tx.prove();
  tx.send();
  let rollupCompletedRoot2 = zkapp.nftsCommitment.get();
  console.log('rollupCompletedRoot2: ', rollupCompletedRoot2.toString());

  // 2. indexer update
  fromActionHash = zkapp.lastActionsHash.get();
  endActionHash = zkapp.currentActionsHash.get();
  currentIndex = zkapp.currentIndex.get();
  nftsCommitment = zkapp.nftsCommitment.get();
  let indexerUpdateRoot2 = await indexerUpdate(
    zkapp,
    fromActionHash,
    endActionHash,
    nftsCommitment,
    currentIndex
  );
  console.log('indexerUpdateRoot2: ', indexerUpdateRoot2.toString());

  // root must be equal
  indexerUpdateRoot2.assertEquals(rollupCompletedRoot2);

  shutdown();
}

await test();
