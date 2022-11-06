import { Field, Poseidon } from 'snarkyjs';
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
import { RollupState } from './models/rollup_state';
import { DeepMerkleSubTree, ProvableMerkleTreeUtils } from 'snarky-smt';

export { runRollupProve, runRollupBatchProve };

function getIndexes(pendingActions: Action[], currentIndex: Field): bigint[] {
  let curIdx: bigint = currentIndex.toBigInt();

  let indexes: Set<bigint> = new Set<bigint>();

  for (let i = 0, len = pendingActions.length; i < len; i++) {
    let action = pendingActions[i];
    if (action.isMint().toBoolean()) {
      curIdx = curIdx + 1n;
      indexes.add(curIdx);
    } else {
      indexes.add(action.nft.id.toBigInt());
    }
  }

  return Array.from(indexes);
}

async function getProofValuesByIndexes(indexes: bigint[]): Promise<{
  proofValues: ProofWithValueHash[];
  zeroProof: MerkleProof;
}> {
  let proofValues: ProofWithValueHash[] = [];

  let zeroProof = await merkleTree.prove(0n);
  proofValues.push(
    new ProofWithValueHash(zeroProof, 0n, ProvableMerkleTreeUtils.EMPTY_VALUE)
  );

  for (let i = 0, len = indexes.length; i < len; i++) {
    let id = indexes[i];
    let proof = await merkleTree.prove(id);
    let valueHash = ProvableMerkleTreeUtils.EMPTY_VALUE;
    let value = await merkleTree.get(id);

    if (value !== null) {
      valueHash = value.hash();
    }
    proofValues.push(new ProofWithValueHash(proof, id, valueHash));
  }

  return { proofValues, zeroProof };
}

function constructDeepSubTree(
  proofValues: ProofWithValueHash[],
  nftsCommitment: Field
): DeepMerkleSubTree<Field> {
  let deepSubTree = new DeepMerkleSubTree(nftsCommitment, TREE_HEIGHT, {
    hasher: Poseidon.hash,
    hashValue: false,
  });

  for (let i = 0, len = proofValues.length; i < len; i++) {
    let proofValueHash = proofValues[i];
    deepSubTree.addBranch(
      proofValueHash.proof,
      proofValueHash.index,
      proofValueHash.valueHash,
      true
    );
  }

  return deepSubTree;
}

async function prepareForRollup(zkapp: NftZkapp): Promise<{
  pendingActions: Action[];
  deepSubTree: DeepMerkleSubTree<Field>;
  currentState: RollupState;
  indexes: bigint[];
  zeroProof: MerkleProof;
}> {
  let currentState = zkapp.state.get();
  let endActionHash = currentState.currentActionsHash;
  let currentIndex = currentState.currentIndex;
  let nftsCommitment = currentState.nftsCommitment;
  console.log(
    `client-current state - endActionHash: ${endActionHash}, currentIndex: ${currentIndex}, nftsCommitment: ${nftsCommitment}`
  );

  let pendingActions = getPendingActions(zkapp, endActionHash);
  console.log('pendingActions: ', pendingActions.toString());

  let indexes = getIndexes(pendingActions, currentIndex);
  console.log('indexes: ', indexes.toString());

  console.time('get proofValues');
  let { proofValues, zeroProof } = await getProofValuesByIndexes(indexes);
  console.timeEnd('get proofValues');

  console.time('construct DeepSubTree');
  let deepSubTree = constructDeepSubTree(proofValues, nftsCommitment);
  console.timeEnd('construct DeepSubTree');

  return {
    pendingActions,
    deepSubTree,
    currentState,
    indexes,
    zeroProof,
  };
}

async function runRollupProve(zkapp: NftZkapp): Promise<NftRollupProof | null> {
  console.log('run rollup prove start');
  console.time('run rollup prove');

  let { pendingActions, deepSubTree, currentState, indexes } =
    await prepareForRollup(zkapp);
  if (pendingActions.length === 0) {
    return null;
  }

  let proofs: NftRollupProof[] = [];
  let currState = currentState;
  for (let i = 0, len = pendingActions.length; i < len; i++) {
    let currAction = pendingActions[i];
    let index = indexes[i];
    console.log('index: ', index);

    let { stateTransition, merkleProof } = NftRollupProverHelper.commitAction(
      currAction,
      index,
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

  let mergedProof = proofs[0];
  if (proofs.length > 1) {
    for (let i = 1, len = proofs.length; i < len; i++) {
      let p1 = mergedProof;
      let p2 = proofs[i];
      let stateTransition = NftRollupProverHelper.merge(p1, p2);
      console.time('generate merged proof');
      mergedProof = await NftRollupProver.merge(stateTransition, p1, p2);
      console.timeEnd('generate merged proof');
    }
  }

  console.timeEnd('run rollup prove');

  console.log('run rollup prove end');
  return mergedProof;
}

async function runRollupBatchProve(
  zkapp: NftZkapp
): Promise<NftRollupProof | null> {
  console.log('run rollup batch prove start');
  console.time('run rollup batch prove');

  let { pendingActions, deepSubTree, currentState, zeroProof } =
    await prepareForRollup(zkapp);
  if (pendingActions.length === 0) {
    return null;
  }

  let proofs: NftRollupProof[] = [];
  let currState = currentState;

  let batchNum = pendingActions.length / ActionBatch.batchSize;
  let restActionsNum = pendingActions.length % ActionBatch.batchSize;

  let curPos = 0;
  for (let i = 0; i < batchNum; i++) {
    let currentActions = pendingActions.slice(
      curPos,
      curPos + ActionBatch.batchSize
    );
    curPos = curPos + ActionBatch.batchSize;

    let { stateTransition, actionBatch } =
      NftRollupProverHelper.commitActionBatch(
        currentActions,
        currState,
        deepSubTree,
        zeroProof
      );

    console.log('stateTransition: ', stateTransition.toPretty());

    console.time('generate commitActionBatch proof');
    let currProof = await NftRollupProver.commitActionBatch(
      stateTransition,
      actionBatch
    );
    console.timeEnd('generate commitActionBatch proof');

    proofs.push(currProof);
    currState = stateTransition.target;
  }

  // process rest actions
  if (restActionsNum > 0) {
    console.log('process rest actions');
    let { stateTransition, actionBatch } =
      NftRollupProverHelper.commitActionBatch(
        pendingActions.slice(curPos, curPos + restActionsNum),
        currState,
        deepSubTree,
        zeroProof
      );

    console.log('stateTransition: ', stateTransition.toPretty());

    console.time('generate commitActionBatch proof');
    let currProof = await NftRollupProver.commitActionBatch(
      stateTransition,
      actionBatch
    );
    console.timeEnd('generate commitActionBatch proof');

    proofs.push(currProof);
  }

  let mergedProof = proofs[0];
  if (proofs.length > 1) {
    for (let i = 1, len = proofs.length; i < len; i++) {
      let p1 = mergedProof;
      let p2 = proofs[i];
      let stateTransition = NftRollupProverHelper.merge(p1, p2);
      console.time('generate merged proof');
      mergedProof = await NftRollupProver.merge(stateTransition, p1, p2);
      console.timeEnd('generate merged proof');
    }
  }

  console.timeEnd('run rollup batch prove');

  console.log('run rollup batch prove end');
  return mergedProof;
}
