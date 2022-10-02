import { MemoryStore, NumIndexSparseMerkleTree } from 'snarky-smt';
import { Field } from 'snarkyjs';
import { TREE_HEIGHT } from './constant';
import { Action } from './models/action';
import { NFT } from './models/nft';
import { MerkleProof } from './models/proofs';
import { NftZkapp } from './nft_zkapp';

export { getPendingActions, merkleTree, getNFTFromIndexer, runIndexer };

let merkleTree = await NumIndexSparseMerkleTree.buildNewTree<NFT>(
  new MemoryStore(),
  TREE_HEIGHT
);

async function getNFTFromIndexer(id: bigint): Promise<NFT> {
  let nft = await merkleTree.get(id);
  return nft!;
}

async function runIndexer(zkapp: NftZkapp): Promise<Field> {
  let supply = NftZkapp.SUPPLY;
  let currentState = zkapp.state.get();
  let fromActionHash = zkapp.lastActionsHash.get();
  let endActionHash = zkapp.currentActionsHash.get();
  let lastIndex = currentState.lastIndex;
  let currentIndex = currentState.currentIndex;
  let nftsCommitment = currentState.nftsCommitment;
  console.log(
    `indexer-current state - fromActionHash: ${fromActionHash}, endActionHash: ${endActionHash}, lastIndex: ${lastIndex}, currentIndex: ${currentIndex}, nftsCommitment: ${nftsCommitment}`
  );

  return indexerUpdate(
    zkapp,
    fromActionHash,
    endActionHash,
    lastIndex,
    currentIndex,
    supply
  );
}

async function indexerUpdate(
  zkapp: NftZkapp,
  fromActionHash: Field,
  endActionHash: Field,
  lastIndex: Field,
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
  pendingActions.forEach((arr: Action[]) => {
    arr.forEach((v: Action) => {
      actions.push(v);
    });
  });

  return actions;
}

async function updateIndexerMerkleTree(
  tree: NumIndexSparseMerkleTree<NFT>,
  pendingActions: Action[],
  lastIndex: Field,
  currentIndex: Field,
  supply: Field
): Promise<Field> {
  let root = tree.getRoot();
  let lastNftsCommitment = root;
  console.log('currentRoot: ', root.toString());
  let curPos = lastIndex.toBigInt();
  let curIdx = currentIndex.toBigInt();
  let curSupply = supply.toBigInt();

  let proofs: Map<bigint, MerkleProof> = new Map();
  for (let i = 0; i < pendingActions.length; i++) {
    let action = pendingActions[i];
    let id = action.nft.id.toBigInt();
    let proof = await tree.prove(id);
    proofs.set(id, proof);
  }

  for (let i = 0; i < pendingActions.length; i++) {
    let action = pendingActions[i];

    let currentId = action.nft.id;
    if (action.isMint().toBoolean() && curPos <= curIdx && curPos < curSupply) {
      curPos = curPos + 1n;
      console.log('indexer-mint nft id: ', curPos.toString());
      root = await tree.update(curPos, action.nft.assignId(Field(curPos)));
    } else {
      // transfer action
      let proof = proofs.get(currentId.toBigInt())!;
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
