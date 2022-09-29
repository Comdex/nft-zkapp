import { MemoryStore, NumIndexSparseMerkleTree } from 'snarky-smt';
import { Field } from 'snarkyjs';
import { treeHeight } from './constant';
import { Action } from './models/action';
import { NFT } from './models/nft';
import { MerkleProof, Proofs, ProofWithIndex } from './models/proofs';
import { NftZkapp } from './nft_zkapp';

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
  lastIndex: Field,
  currentIndex: Field
): Promise<Field> {
  let pendingActions = getPendingActions(zkapp, fromActionHash, endActionHash);
  let root = await updateIndexerMerkleTree(
    merkleTree,
    pendingActions,
    lastIndex,
    currentIndex
  );
  return root;
}

async function getProofsByIndexes(
  indexes: bigint[]
): Promise<{ store: Map<bigint, MerkleProof>; arr: ProofWithIndex[] }> {
  let proofStore = new Map<bigint, MerkleProof>();
  let proofs = [];
  for (let i = 0; i < indexes.length; i++) {
    let id = indexes[i];
    let proof = await merkleTree.prove(id);
    proofStore.set(id, proof);
    proofs.push(new ProofWithIndex(Field(id), proof));
  }

  //let zeroProof = await merkleTree.prove(0n);
  for (let i = proofs.length; i < 33; i++) {
    proofs.push(new ProofWithIndex(Field.zero, proofs[0].proof));
  }

  return { store: proofStore, arr: proofs };
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
  lastIndex: Field,
  currentIndex: Field
): Promise<Field> {
  let root = tree.getRoot();
  let lastNftsCommitment = root;
  console.log('currentRoot: ', root.toString());
  let curPos = lastIndex;

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
    if (
      action.isMint().toBoolean() &&
      curPos.toBigInt() <= currentIndex.toBigInt()
    ) {
      curPos = curPos.add(1);
      console.log('indexer-mint nft id: ', curPos.toString());
      root = await tree.update(curPos.toBigInt(), action.nft.assignId(curPos));
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
