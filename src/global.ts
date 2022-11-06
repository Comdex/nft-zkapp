import { MemoryStore, MerkleTree } from 'snarky-smt';
import { TREE_HEIGHT } from './constant';
import { NFT } from './models/nft';

export { merkleTree };

let merkleTree = await MerkleTree.build<NFT>(new MemoryStore(), TREE_HEIGHT);
