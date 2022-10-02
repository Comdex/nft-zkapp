import { MemoryStore, NumIndexSparseMerkleTree } from 'snarky-smt';
import { TREE_HEIGHT } from './constant';
import { NFT } from './models/nft';

export { merkleTree };

let merkleTree = await NumIndexSparseMerkleTree.buildNewTree<NFT>(
  new MemoryStore(),
  TREE_HEIGHT
);
