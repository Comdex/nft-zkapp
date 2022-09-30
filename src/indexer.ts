import { MemoryStore, NumIndexSparseMerkleTree } from 'snarky-smt';
import { Field } from 'snarkyjs';
import { ACTIONS_LENGTH, TREE_HEIGHT } from './constant';
import { Action } from './models/action';
import { NFT } from './models/nft';
import { MerkleProof, Proofs } from './models/proofs';
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
  TREE_HEIGHT
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

async function getProofsByIndexes(
  indexes: bigint[]
): Promise<{ store: Map<bigint, MerkleProof>; proofs: Proofs }> {
  let proofStore = new Map<bigint, MerkleProof>();
  let proofs: MerkleProof[] = [];

  let zeroProof = await merkleTree.prove(0n);

  for (let i = 0; i < indexes.length; i++) {
    let id = indexes[i];
    let proof = zeroProof;
    if (id !== 0n) {
      proof = await merkleTree.prove(id);
    }
    proofStore.set(id, proof);
    proofs.push(proof);
  }

  return { store: proofStore, proofs: new Proofs(proofs) };
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

function getIndexes(
  pendingActions: Action[],
  currentIndex: Field,
  supply: Field
): bigint[] {
  let curIdx: bigint = currentIndex.toBigInt();
  let curSupply: bigint = supply.toBigInt();

  // Dummy Index is added by default
  let indexes: bigint[] = [0n];

  let idxesLen =
    pendingActions.length < ACTIONS_LENGTH
      ? pendingActions.length
      : ACTIONS_LENGTH;

  for (let i = 0; i < idxesLen; i++) {
    let action = pendingActions[i];
    if (action.isMint().toBoolean()) {
      if (curIdx < curSupply) {
        curIdx = curIdx + 1n;
        indexes.push(curIdx);
      } else {
        indexes.push(0n);
      }
    } else {
      indexes.push(action.nft.id.toBigInt());
    }
  }

  if (idxesLen < ACTIONS_LENGTH) {
    for (let i = idxesLen; i < ACTIONS_LENGTH; i++) {
      indexes.push(0n);
    }
  }

  return indexes;
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
