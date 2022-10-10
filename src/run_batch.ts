import {
  AccountUpdate,
  Mina,
  PrivateKey,
  Permissions,
  shutdown,
} from 'snarkyjs';
import { runRollupBatchProve } from './client';
import { getNFTFromIndexer, runIndexer } from './indexer';
import { NFT } from './models/nft';
import { NftZkappBatch } from './nft_zkapp_batch';
import { NftRollupBatchProver } from './rollup_batch_prover';

const doProofs = true;
const mintTxns = 5;
const transferTxns = 5;

let Local = Mina.LocalBlockchain();
Mina.setActiveInstance(Local);

let feePayerKey = Local.testAccounts[0].privateKey;
let callerKey = PrivateKey.fromBase58(
  'EKE51yW4HbYD9Xf1mLAechtFLHM8vRWGqJuowJXDGBy8VbMvTeiZ'
); //Local.testAccounts[1].privateKey;
let callerPublicKey = callerKey.toPublicKey();
let receiverKey = Local.testAccounts[2].privateKey;
let receiverPublicKey = receiverKey.toPublicKey();
let zkappKey = PrivateKey.random();
let zkappAddress = zkappKey.toPublicKey();

async function test() {
  let zkapp = new NftZkappBatch(zkappAddress);

  //analyze methods
  let result = NftZkappBatch.analyzeMethods();
  console.log('analyze result: ', result);

  console.log('start compiling NftRollupBatchProver');
  console.time('NftRollupBatchProver compile');
  await NftRollupBatchProver.compile();
  console.timeEnd('NftRollupBatchProver compile');

  if (doProofs) {
    console.log('start compiling NftZkappBatch');
    console.time('NftZkappBatch compile');
    await NftZkappBatch.compile();
    console.timeEnd('NftZkappBatch compile');
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
  tx.send();
  console.log('deploy done');

  // mint nft
  for (let i = 1; i <= mintTxns; i++) {
    tx = await Mina.transaction(feePayerKey, () => {
      zkapp.mint(NFT.createNFT('Mina Genesis ' + i, callerPublicKey));
      if (!doProofs) zkapp.sign(zkappKey);
    });
    if (doProofs) await tx.prove();
    tx.send();
  }

  let sequenceState = zkapp.account.sequenceState.get();
  console.log(
    'after submit mint action, sequence state: ',
    sequenceState.toString()
  );

  // first rollup
  // 1. execute the contract rollup method
  let mergedProof = await runRollupBatchProve(zkapp);

  console.log('zkapp rollup tx 1 start');

  tx = await Mina.transaction(feePayerKey, () => {
    zkapp.rollup(mergedProof!);
    if (!doProofs) zkapp.sign(zkappKey);
  });
  if (doProofs) await tx.prove();
  tx.send();

  console.log('zkapp rollup tx 1 end');

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

  // transfer nft
  for (let i = 1; i <= transferTxns; i++) {
    let nft = await getNFTFromIndexer(BigInt(i));
    console.log('current nft: ', nft.toPretty());
    tx = await Mina.transaction(feePayerKey, () => {
      zkapp.transfer(receiverPublicKey, nft, callerKey);
      if (!doProofs) zkapp.sign(zkappKey);
    });
    if (doProofs) await tx.prove();
    tx.send();
    console.log('nft transfer tx success, id: ', i);
  }

  // second rollup
  // 1. execute the contract rollup method
  mergedProof = await runRollupBatchProve(zkapp);

  console.log('zkapp rollup tx 2 start');

  tx = await Mina.transaction(feePayerKey, () => {
    zkapp.rollup(mergedProof!);
    if (!doProofs) zkapp.sign(zkappKey);
  });
  if (doProofs) await tx.prove();
  tx.send();

  console.log('zkapp rollup tx 2 end');

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
