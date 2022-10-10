import { NumIndexDeepSparseMerkleSubTree, SMT_EMPTY_VALUE } from 'snarky-smt';
import { Field } from 'snarkyjs';
import {
  NftRollupProof,
  NftRollupProver,
  NftRollupProverHelper,
} from './rollup_prover';
import { TREE_HEIGHT } from './constant';
import { merkleTree } from './global';
import { getPendingActions } from './indexer';
import { Action } from './models/action';
import { MerkleProof, ProofWithValueHash } from './models/proofs';
import { NftZkapp } from './nft_zkapp';
import { ActionBatch } from './models/action_batch';
import {
  NftRollupBatchProver,
  NftRollupBatchProverHelper,
} from './rollup_batch_prover';

export { runRollupProve, runRollupBatchProve };

function getIndexes(pendingActions: Action[], currentIndex: Field): bigint[] {
  let curIdx: bigint = currentIndex.toBigInt();

  let indexes: bigint[] = [];

  for (let i = 0, len = pendingActions.length; i < len; i++) {
    let action = pendingActions[i];
    if (action.isMint().toBoolean()) {
      curIdx = curIdx + 1n;
      indexes.push(curIdx);
    } else {
      indexes.push(action.nft.id.toBigInt());
    }
  }

  return indexes;
}

async function getProofValuesByIndexes(indexes: bigint[]): Promise<{
  proofValues: ProofWithValueHash[];
  proofs: Map<bigint, MerkleProof>;
}> {
  let proofValues: ProofWithValueHash[] = [];
  let proofs = new Map<bigint, MerkleProof>();

  for (let i = 0, len = indexes.length; i < len; i++) {
    let id = indexes[i];
    let proof = await merkleTree.prove(id);
    let valueHash = SMT_EMPTY_VALUE;
    let value = await merkleTree.get(id);
    if (value !== null) {
      valueHash = value.hash();
    }
    proofValues.push(new ProofWithValueHash(proof, valueHash));
    proofs.set(id, proof);
  }

  return { proofValues, proofs };
}

function constructDeepSubTree(
  proofValues: ProofWithValueHash[],
  nftsCommitment: Field
): NumIndexDeepSparseMerkleSubTree {
  let deepSubTree = new NumIndexDeepSparseMerkleSubTree(
    nftsCommitment,
    TREE_HEIGHT
  );
  for (let i = 0, len = proofValues.length; i < len; i++) {
    let proofValueHash = proofValues[i];
    deepSubTree.addBranch(proofValueHash.proof, proofValueHash.valueHash);
  }

  return deepSubTree;
}

async function runRollupProve(zkapp: NftZkapp): Promise<NftRollupProof | null> {
  console.log('run rollup prove start');
  console.time('run rollup prove');

  let currentState = zkapp.state.get();
  let endActionHash = currentState.currentActionsHash;
  let currentIndex = currentState.currentIndex;
  let nftsCommitment = currentState.nftsCommitment;
  console.log(
    `client-current state - endActionHash: ${endActionHash}, currentIndex: ${currentIndex}, nftsCommitment: ${nftsCommitment}`
  );

  let pendingActions = getPendingActions(zkapp, endActionHash);
  console.log('pendingActions: ', pendingActions.toString());

  if (pendingActions.length === 0) {
    return null;
  }

  let indexes = getIndexes(pendingActions, currentIndex);
  console.log('indexes: ', indexes.toString());

  console.time('get proofValues');
  let { proofValues } = await getProofValuesByIndexes(indexes);
  console.timeEnd('get proofValues');

  console.time('construct DeepSubTree');
  let deepSubTree = constructDeepSubTree(proofValues, nftsCommitment);
  console.timeEnd('construct DeepSubTree');

  let proofs: NftRollupProof[] = [];
  let currState = currentState;
  for (let i = 0, len = pendingActions.length; i < len; i++) {
    let currAction = pendingActions[i];
    let index = indexes[i];
    console.log('index: ', index);

    let merkleProof = deepSubTree.prove(Field(index));
    let stateTransition = NftRollupProverHelper.commitAction(
      currAction,
      merkleProof,
      currState,
      deepSubTree
    );

    console.time('generate commitAction proof');
    let currProof = await NftRollupProver.commitAction(
      stateTransition,
      currAction,
      merkleProof
    );
    console.timeEnd('generate commitAction proof');

    proofs.push(currProof);

    currState = stateTransition.target;
  }

  let finalProof = proofs[0];

  if (proofs.length >= 2) {
    console.log('start merge proof');
    let p1 = proofs[0];
    let p2 = proofs[1];
    let stateTransition = NftRollupProverHelper.merge(p1, p2);
    let mergeProof = await NftRollupProver.merge(stateTransition, p1, p2);

    console.log('merge proof > 2');
    for (let i = 2, len = proofs.length; i < len; i++) {
      let currProof = proofs[i];
      stateTransition = NftRollupProverHelper.merge(mergeProof, currProof);

      console.time('generate merge proof');
      let tempProof = await NftRollupProver.merge(
        stateTransition,
        mergeProof,
        currProof
      );
      console.timeEnd('generate merge proof');
      mergeProof = tempProof;
    }

    finalProof = mergeProof;
  }

  console.timeEnd('run rollup prove');
  console.log('run rollup prove end');
  return finalProof;
}

async function runRollupBatchProve(
  zkapp: NftZkapp
): Promise<NftRollupProof | null> {
  console.log('run rollup prove start');
  console.time('run rollup prove');

  let currentState = zkapp.state.get();
  let endActionHash = currentState.currentActionsHash;
  let currentIndex = currentState.currentIndex;
  let nftsCommitment = currentState.nftsCommitment;
  console.log(
    `client-current state - endActionHash: ${endActionHash}, currentIndex: ${currentIndex}, nftsCommitment: ${nftsCommitment}`
  );

  let pendingActions = getPendingActions(zkapp, endActionHash);
  console.log('pendingActions: ', pendingActions.toString());

  if (pendingActions.length === 0) {
    return null;
  }

  let indexes = getIndexes(pendingActions, currentIndex);
  console.log('indexes: ', indexes.toString());

  console.time('get proofValues');
  let { proofValues, proofs: merkleProofs } = await getProofValuesByIndexes(
    indexes
  );
  console.timeEnd('get proofValues');

  console.time('construct DeepSubTree');
  let deepSubTree = constructDeepSubTree(proofValues, nftsCommitment);
  console.timeEnd('construct DeepSubTree');

  let proofs: NftRollupProof[] = [];
  let currState = currentState;

  let batch = pendingActions.length / ActionBatch.batchSize;
  let restActionsNum = pendingActions.length % ActionBatch.batchSize;

  let curPos = 0;
  for (let i = 0; i < batch; i++) {
    let currentActions = pendingActions.slice(
      curPos,
      curPos + ActionBatch.batchSize
    );
    curPos = curPos + ActionBatch.batchSize;

    let { stateTransition, actionBatch } =
      NftRollupBatchProverHelper.commitActions(
        currentActions,
        currState,
        deepSubTree,
        merkleProofs
      );

    console.time('generate commitActions proof');
    let currProof = await NftRollupBatchProver.commitActions(
      stateTransition,
      actionBatch
    );
    console.timeEnd('generate commitActions proof');

    proofs.push(currProof);

    currState = stateTransition.target;
  }

  // process rest actions
  let { stateTransition, actionBatch } =
    NftRollupBatchProverHelper.commitActions(
      pendingActions.slice(curPos, curPos + restActionsNum),
      currState,
      deepSubTree,
      merkleProofs
    );

  console.time('generate commitActions proof');
  let currProof = await NftRollupBatchProver.commitActions(
    stateTransition,
    actionBatch
  );
  console.timeEnd('generate commitActions proof');
  proofs.push(currProof);

  let finalProof = proofs[0];
  if (proofs.length >= 2) {
    console.log('start merge proof');
    let p1 = proofs[0];
    let p2 = proofs[1];
    let stateTransition = NftRollupProverHelper.merge(p1, p2);
    let mergeProof = await NftRollupProver.merge(stateTransition, p1, p2);

    console.log('merge proof > 2');
    for (let i = 2, len = proofs.length; i < len; i++) {
      let currProof = proofs[i];
      stateTransition = NftRollupProverHelper.merge(mergeProof, currProof);

      console.time('generate merge proof');
      let tempProof = await NftRollupProver.merge(
        stateTransition,
        mergeProof,
        currProof
      );
      console.timeEnd('generate merge proof');
      mergeProof = tempProof;
    }

    finalProof = mergeProof;
  }

  console.timeEnd('run rollup prove');
  console.log('run rollup prove end');
  return finalProof;
}
