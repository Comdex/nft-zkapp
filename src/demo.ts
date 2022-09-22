import {
  createEmptyValue,
  MemoryStore,
  NumIndexSparseMerkleTree,
} from 'snarky-smt';
import { Encoding, Field, isReady, shutdown } from 'snarkyjs';
import { NFT } from './models/nft';

await isReady;

// let fs = Encoding.Bijective.Fp
//   .fromString(`<svg xmlns="http://www.w3.org/2000/svg" version="1.1"><text x="0" y="15" fill="red"></text></svg>
// `);

// console.log('fs length: ', fs.length);

// let tree = await NumIndexSparseMerkleTree.buildNewTree<NFT>(
//   new MemoryStore(),
//   13
// );

// let root = tree.getRoot();

// root = await tree.update(0n, createEmptyValue(NFT));

// console.log('tree root: ', root.toString());

let a = Field(1);
let b = a.add(1);
console.log('a: ', a.toString());
console.log('b: ', b.toString());

shutdown();
