import { MemoryStore, NumIndexSparseMerkleTree } from 'snarky-smt';
import { Field } from 'snarkyjs';
import { treeHeight } from './constant';
import { Action } from './models/action';
import { NFT } from './models/nft';
import { MerkleProof, NftZkapp } from './nft_zkapp';

export {
  getProofsByIndexes,
  getPendingActions,
  getIndexes,
  indexerUpdate,
  merkleTree,
  getNFTFromIndexer,
};

let merkleTree = await NumIndexSparseMerkleTree.buildNewTree<NFT>(
  new MemoryStore(),
  treeHeight
);

async function getNFTFromIndexer(id: bigint): Promise<NFT> {
  let nft = await merkleTree.get(id);
  return nft!;
}

async function indexerUpdate(
  zkapp: NftZkapp,
  fromActionHash: Field,
  endActionHash: Field,
  nftsCommitment: Field,
  lastIndex: Field,
  currentIndex: Field
): Promise<Field> {
  let pendingActions = getPendingActions(zkapp, fromActionHash, endActionHash);
  let root = await updateIndexerMerkleTree(
    merkleTree,
    pendingActions,
    nftsCommitment,
    lastIndex,
    currentIndex
  );
  return root;
}

async function getProofsByIndexes(
  indexes: bigint[]
): Promise<Map<bigint, MerkleProof>> {
  let proofStore = new Map<bigint, MerkleProof>();

  for (let i = 0; i < indexes.length; i++) {
    let id = indexes[i];
    let proof = await merkleTree.prove(id);
    proofStore.set(id, proof);
  }

  return proofStore;
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

function getIndexes(pendingActions: Action[], currentIndex: Field): bigint[] {
  let curIdx: bigint = currentIndex.toBigInt();

  // Dummy Index is added by default
  let indexes: bigint[] = [0n];
  pendingActions.forEach((v: Action) => {
    if (v.isMint().toBoolean()) {
      curIdx = curIdx + 1n;
      indexes.push(curIdx);
    } else {
      indexes.push(v.nft.id.toBigInt());
    }
  });

  // // TO REMOVE, for test
  // indexes.push(curIdx + 1n);

  return indexes;
}

async function updateIndexerMerkleTree(
  tree: NumIndexSparseMerkleTree<NFT>,
  pendingActions: Action[],
  nftsCommitment: Field,
  lastIndex: Field,
  currentIndex: Field
): Promise<Field> {
  let root = tree.getRoot();
  let curPos = lastIndex;
  for (let i = 0; i < pendingActions.length; i++) {
    let action = pendingActions[i];
    if (action.isMint().toBoolean() && curPos.lte(currentIndex).toBoolean()) {
      curPos = curPos.add(1);
      console.log('indexer-mint nft id: ', curPos.toString());
      root = await tree.update(curPos.toBigInt(), action.nft.assignId(curPos));
    } else {
      // transfer action
      let proof = await tree.prove(action.nft.id.toBigInt());
      console.log('indexer-transfer nft id: ', action.nft.id.toString());
      let isMember = proof.verifyByField(
        nftsCommitment,
        action.originalNFTHash
      );
      if (isMember) {
        root = await tree.update(currentIndex.toBigInt(), action.nft);
      }
    }
  }

  return root;
}
