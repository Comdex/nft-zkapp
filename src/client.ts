import {
  NumIndexDeepSparseMerkleSubTreeForField,
  SMT_EMPTY_VALUE,
} from 'snarky-smt';
import { Field } from 'snarkyjs';
import {
  ActionProof,
  NftActionProver,
  NftActionProverHelper,
} from './action_prover';
import { TREE_HEIGHT } from './constant';
import { getPendingActions, merkleTree } from './indexer';
import { Action } from './models/action';
import { ProofWithValueHash } from './models/proofs';
import { NftZkapp } from './nft_zkapp';

export { runRecuriseProve };

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

async function runRecuriseProve(zkapp: NftZkapp): Promise<ActionProof | null> {
  let currentState = zkapp.state.get();
  let fromActionHash = zkapp.lastActionsHash.get();
  let endActionHash = zkapp.currentActionsHash.get();
  let lastIndex = currentState.lastIndex;
  let currentIndex = currentState.currentIndex;
  let nftsCommitment = currentState.nftsCommitment;
  console.log(
    `client-current state - fromActionHash: ${fromActionHash}, endActionHash: ${endActionHash}, lastIndex: ${lastIndex}, currentIndex: ${currentIndex}, nftsCommitment: ${nftsCommitment}`
  );

  let pendingActions = getPendingActions(zkapp, endActionHash);
  console.log('pendingActions: ', pendingActions.toString());

  if (pendingActions.length === 0) {
    return null;
  }

  let indexes = getIndexes(pendingActions, currentIndex);
  console.log('indexes: ', indexes.toString());

  let proofValues = await getProofValuesByIndexes(indexes);
  let deepSubTree = constructDeepSubTree(proofValues, nftsCommitment);

  let initialStateTransition = NftActionProverHelper.init(currentState);
  let initialProof = await NftActionProver.init(initialStateTransition);

  let recuriseProofs: ActionProof[] = [];
  let previousProof = initialProof;
  for (let i = 0; i < pendingActions.length; i++) {
    let currAction = pendingActions[i];
    let index = indexes[i];
    let merkleProof = deepSubTree.prove(Field(index));
    let stateTransition = NftActionProverHelper.commitAction(
      currAction,
      merkleProof,
      previousProof,
      deepSubTree
    );
    let currProof = await NftActionProver.commitAction(
      stateTransition,
      currAction,
      merkleProof,
      previousProof
    );
    recuriseProofs.push(currProof);
    previousProof = currProof;
  }

  let finalProof = recuriseProofs[0];

  if (recuriseProofs.length >= 2) {
    let p1 = recuriseProofs[0];
    let p2 = recuriseProofs[1];
    let stateTransition = NftActionProverHelper.merge(p1, p2);
    let mergeProof = await NftActionProver.merge(stateTransition, p1, p2);
    for (let i = 2; i < recuriseProofs.length; i++) {
      let currProof = recuriseProofs[i];
      stateTransition = NftActionProverHelper.merge(mergeProof, currProof);
      let tempProof = await NftActionProver.merge(
        stateTransition,
        mergeProof,
        currProof
      );
      mergeProof = tempProof;
    }

    finalProof = mergeProof;
  }

  return finalProof;
}
