import { NumIndexSparseMerkleProof } from 'snarky-smt';
import { arrayProp, CircuitValue, Field, isReady, prop } from 'snarkyjs';
import { TREE_HEIGHT } from '../constant';

await isReady;

export { MerkleProof, Proofs };

class MerkleProof extends NumIndexSparseMerkleProof(TREE_HEIGHT) {}

class Proofs extends CircuitValue {
  @arrayProp(MerkleProof, 33) arr: MerkleProof[];

  constructor(arr: MerkleProof[]) {
    super();
    this.arr = arr;
  }
}
