import { NumIndexSparseMerkleTree } from 'snarky-smt';
import { Field } from 'snarkyjs';
import { MAX_ACTIONS_NUM, NFT_SUPPLY } from './constant';
import { merkleTree } from './global';
import { Action } from './models/action';
import { NFT } from './models/nft';
import { MerkleProof } from './models/proofs';
import { NftZkapp, NFT_INIT_ACTIONSHASH, NFT_INIT_INDEX } from './nft_zkapp';

export { getPendingActions, getNFTFromIndexer, runIndexer };

let indexerState = {
  lastProcessedIndex: NFT_INIT_INDEX.toBigInt(),
  lastProcessedActionsHash: NFT_INIT_ACTIONSHASH,
};

async function getNFTFromIndexer(id: bigint): Promise<NFT> {
  let nft = await merkleTree.get(id);
  return nft!;
}

async function runIndexer(zkapp: NftZkapp): Promise<Field> {
  console.log('run indexer start');
  console.time('run indexer');

  let supply = Field(NFT_SUPPLY);
  let currentState = zkapp.state.get();
  let endActionHash = currentState.currentActionsHash;
  let currentIndex = currentState.currentIndex;
  let nftsCommitment = currentState.nftsCommitment;

  let fromActionHash = indexerState.lastProcessedActionsHash;
  let lastIndex = indexerState.lastProcessedIndex;
  console.log(
    `indexer-current state - fromActionHash: ${fromActionHash}, endActionHash: ${endActionHash}, lastIndex: ${lastIndex}, currentIndex: ${currentIndex}, nftsCommitment: ${nftsCommitment}`
  );

  let newIndexerRoot = indexerUpdate(
    zkapp,
    fromActionHash,
    endActionHash,
    lastIndex,
    currentIndex,
    supply
  );

  console.timeEnd('run indexer');
  console.log('run indexer end');
  return newIndexerRoot;
}

async function indexerUpdate(
  zkapp: NftZkapp,
  fromActionHash: Field,
  endActionHash: Field,
  lastIndex: bigint,
  currentIndex: Field,
  supply: Field
): Promise<Field> {
  let pendingActions = getPendingActions(zkapp, fromActionHash, endActionHash);
  let root = await updateIndexerMerkleTree(
    merkleTree,
    pendingActions,
    lastIndex,
    currentIndex,
    supply
  );

  indexerState.lastProcessedIndex = currentIndex.toBigInt();
  indexerState.lastProcessedActionsHash = endActionHash;
  return root;
}

function getPendingActions(
  zkapp: NftZkapp,
  fromActionHash: Field,
  endActionHash?: Field
): Action[] {
  let pendingActions = zkapp.reducer.getActions({
    fromActionHash,
    endActionHash,
  });
  let actions: Action[] = [];
  let currActionsNum = 0;

  for (let i = 0, len = pendingActions.length; i < len; i++) {
    let actionList = pendingActions[i];
    for (let j = 0, acLen = actionList.length; j < acLen; j++) {
      let action = actionList[j];
      if (currActionsNum < MAX_ACTIONS_NUM) {
        actions.push(action);
        currActionsNum++;
      } else {
        break;
      }
    }
  }

  return actions;
}

async function updateIndexerMerkleTree(
  tree: NumIndexSparseMerkleTree<NFT>,
  pendingActions: Action[],
  lastIndex: bigint,
  currentIndex: Field,
  supply: Field
): Promise<Field> {
  let root = tree.getRoot();
  let lastNftsCommitment = root;
  console.log('indexer-currentRoot: ', root.toString());
  let curPos = lastIndex;
  let curIdx = currentIndex.toBigInt();
  let curSupply = supply.toBigInt();

  let originProofs: Map<bigint, MerkleProof> = new Map();
  for (let i = 0, len = pendingActions.length; i < len; i++) {
    let action = pendingActions[i];
    if (!action.isMint().toBoolean()) {
      let id = action.nft.id.toBigInt();
      let proof = await tree.prove(id);
      originProofs.set(id, proof);
    }
  }

  for (let i = 0, len = pendingActions.length; i < len; i++) {
    let action = pendingActions[i];

    let currentId = action.nft.id;
    if (action.isMint().toBoolean() && curPos <= curIdx && curPos < curSupply) {
      curPos = curPos + 1n;
      console.log('indexer-mint nft id: ', curPos.toString());
      root = await tree.update(curPos, action.nft.assignId(Field(curPos)));
    } else {
      // transfer action
      let proof = originProofs.get(currentId.toBigInt())!;
      console.log('indexer-transfer nft id: ', currentId.toString());
      let isMember = proof.verifyByField(
        lastNftsCommitment,
        action.originalNFTHash
      );
      if (isMember) {
        console.log('nft isMember, id: ', currentId.toString());
        root = await tree.update(currentId.toBigInt(), action.nft);
      }
    }
  }

  return root;
}
