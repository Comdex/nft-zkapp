import {
  NumIndexDeepSparseMerkleSubTreeForField,
  SMT_EMPTY_VALUE,
} from 'snarky-smt';
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
import { ProofWithValueHash } from './models/proofs';
import { NftZkapp } from './nft_zkapp';

export { runRecursiveProve };

function getIndexes(pendingActions: Action[], currentIndex: Field): bigint[] {
  let curIdx: bigint = currentIndex.toBigInt();

  let indexes: bigint[] = [];

  for (let i = 0; i < pendingActions.length; i++) {
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

async function getProofValuesByIndexes(
  indexes: bigint[]
): Promise<ProofWithValueHash[]> {
  let proofValues: ProofWithValueHash[] = [];

  for (let i = 0; i < indexes.length; i++) {
    let id = indexes[i];
    let proof = await merkleTree.prove(id);
    let valueHash = SMT_EMPTY_VALUE;
    let value = await merkleTree.get(id);
    if (value !== null) {
      valueHash = value.hash();
    }
    proofValues.push(new ProofWithValueHash(proof, valueHash));
  }

  return proofValues;
}

function constructDeepSubTree(
  proofValues: ProofWithValueHash[],
  nftsCommitment: Field
): NumIndexDeepSparseMerkleSubTreeForField {
  let deepSubTree = new NumIndexDeepSparseMerkleSubTreeForField(
    nftsCommitment,
    TREE_HEIGHT
  );
  for (let i = 0; i < proofValues.length; i++) {
    let proofValueHash = proofValues[i];
    deepSubTree.addBranch(proofValueHash.proof, proofValueHash.valueHash);
  }

  return deepSubTree;
}

async function runRecursiveProve(
  zkapp: NftZkapp
): Promise<NftRollupProof | null> {
  console.log('run recursive prove start');
  console.time('run recursive prove');

  let currentState = zkapp.state.get();
  let endActionHash = zkapp.currentActionsHash.get();
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
  let proofValues = await getProofValuesByIndexes(indexes);
  console.timeEnd('get proofValues');

  console.time('construct DeepSubTree');
  let deepSubTree = constructDeepSubTree(proofValues, nftsCommitment);
  console.timeEnd('construct DeepSubTree');

  let initialStateTransition = NftRollupProverHelper.init(currentState);
  let initialProof = await NftRollupProver.init(initialStateTransition);

  let recuriseProofs: NftRollupProof[] = [];
  let previousProof = initialProof;
  for (let i = 0; i < pendingActions.length; i++) {
    let currAction = pendingActions[i];
    let index = indexes[i];
    console.log('index: ', index);

    let merkleProof = deepSubTree.prove(Field(index));
    let stateTransition = NftRollupProverHelper.commitAction(
      currAction,
      merkleProof,
      previousProof,
      deepSubTree
    );

    console.time('generate commitAction proof');
    let currProof = await NftRollupProver.commitAction(
      stateTransition,
      currAction,
      merkleProof,
      previousProof
    );
    console.timeEnd('generate commitAction proof');

    recuriseProofs.push(currProof);
    previousProof = currProof;
  }

  let finalProof = recuriseProofs[0];

  if (recuriseProofs.length >= 2) {
    let p1 = recuriseProofs[0];
    let p2 = recuriseProofs[1];
    let stateTransition = NftRollupProverHelper.merge(p1, p2);
    let mergeProof = await NftRollupProver.merge(stateTransition, p1, p2);
    for (let i = 2; i < recuriseProofs.length; i++) {
      let currProof = recuriseProofs[i];
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

  console.timeEnd('run recursive prove');
  console.log('run recursive prove end');
  return finalProof;
}
