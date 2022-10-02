import {
  AccountUpdate,
  Mina,
  PrivateKey,
  Permissions,
  shutdown,
} from 'snarkyjs';
import { NftActionProver } from './action_prover';
import { runRecuriseProve } from './client';
import { getNFTFromIndexer, runIndexer } from './indexer';
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

  //analyze methods
  let result = NftZkapp.analyzeMethods();
  console.log('analyze result: ', result);

  if (doProofs) {
    console.log('start compiling NftZkapp');
    console.time('NftZkapp compile');
    await NftZkapp.compile();
    console.timeEnd('NftZkapp compile');
  }

  console.log('start compiling NftActionProver');
  console.time('NftActionProver compile');
  await NftActionProver.compile();
  console.timeEnd('NftActionProver compile');

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
    zkapp.mint(NFT.createNFT('Mina Genesis 1', callerPublicKey));
    if (!doProofs) zkapp.sign(zkappKey);
  });
  if (doProofs) await tx.prove();
  tx.send();

  tx = await Mina.transaction(feePayerKey, () => {
    zkapp.mint(NFT.createNFT('Mina Genesis 2', callerPublicKey));
    if (!doProofs) zkapp.sign(zkappKey);
  });
  if (doProofs) await tx.prove();
  tx.send();

  tx = await Mina.transaction(feePayerKey, () => {
    zkapp.mint(NFT.createNFT('Mina Genesis 3', callerPublicKey));
    if (!doProofs) zkapp.sign(zkappKey);
  });
  if (doProofs) await tx.prove();
  tx.send();

  // first rollup
  // 1. execute the contract rollup method
  let mergedProof = await runRecuriseProve(zkapp);

  tx = await Mina.transaction(feePayerKey, () => {
    zkapp.rollup(mergedProof!);
    if (!doProofs) zkapp.sign(zkappKey);
  });
  if (doProofs) await tx.prove();
  tx.send();

  console.log('zkapp rollup end');

  let rollupCompletedRoot1 = zkapp.state.get().nftsCommitment;
  console.log('rollupCompletedRoot1: ', rollupCompletedRoot1.toString());

  // 2. indexer update

  let indexerUpdateRoot1 = await runIndexer(zkapp);

  console.log('indexerUpdateRoot1: ', indexerUpdateRoot1.toString());
  // root must be equal
  if (rollupCompletedRoot1.toString() === indexerUpdateRoot1.toString()) {
    console.log('rollup 1 commitment results match');
    console.log(
      '----------------------------------------------------------------'
    );
  } else {
    throw new Error('rollup 1 execution error');
  }

  // ------------------------------------------------------------------------

  let nft1 = await getNFTFromIndexer(1n);
  console.log('nft1: ', nft1.toPretty());
  tx = await Mina.transaction(feePayerKey, () => {
    zkapp.transfer(receiverPublicKey, nft1, callerKey);
    if (!doProofs) zkapp.sign(zkappKey);
  });
  if (doProofs) await tx.prove();
  tx.send();
  console.log('nft1 transfer tx success');

  let nft2 = await getNFTFromIndexer(2n);
  console.log('nft2: ', nft2.toPretty());
  tx = await Mina.transaction(feePayerKey, () => {
    zkapp.transfer(receiverPublicKey, nft2, callerKey);
    if (!doProofs) zkapp.sign(zkappKey);
  });
  if (doProofs) await tx.prove();
  tx.send();
  console.log('nft2 transfer tx success');

  // second rollup
  // 1. execute the contract rollup method
  mergedProof = await runRecuriseProve(zkapp);

  tx = await Mina.transaction(feePayerKey, () => {
    //zkapp.setProofStore(proofStore2);
    zkapp.rollup(mergedProof!);
    if (!doProofs) zkapp.sign(zkappKey);
  });
  if (doProofs) await tx.prove();
  tx.send();
  let rollupCompletedRoot2 = zkapp.state.get().nftsCommitment;
  console.log('rollupCompletedRoot2: ', rollupCompletedRoot2.toString());

  // 2. indexer update

  let indexerUpdateRoot2 = await runIndexer(zkapp);
  console.log('indexerUpdateRoot2: ', indexerUpdateRoot2.toString());

  // root must be equal
  if (rollupCompletedRoot2.toString() === indexerUpdateRoot2.toString()) {
    console.log('rollup 2 commitment results match');
  } else {
    throw new Error('rollup 2 execution error');
  }

  shutdown();
}

await test();
