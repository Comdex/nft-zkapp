import { NumIndexSparseMerkleProof } from 'snarky-smt';
import { arrayProp, CircuitValue, Field, isReady, prop } from 'snarkyjs';
import { treeHeight } from '../constant';

await isReady;

export { MerkleProof, ProofWithIndex, Proofs };

class MerkleProof extends NumIndexSparseMerkleProof(treeHeight) {}

class ProofWithIndex extends CircuitValue {
  @prop index: Field;
  @prop proof: MerkleProof;

  constructor(index: Field, proof: MerkleProof) {
    super();
    this.index = index;
    this.proof = proof;
  }
}

class Proofs extends CircuitValue {
  @arrayProp(ProofWithIndex, 33) arr: ProofWithIndex[];

  constructor(arr: ProofWithIndex[]) {
    super();
    this.arr = arr;
  }
}
