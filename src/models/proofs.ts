import { NumIndexSparseMerkleProof } from 'snarky-smt';
import { CircuitValue, Field, isReady, prop } from 'snarkyjs';
import { TREE_HEIGHT } from '../constant';

await isReady;

export { MerkleProof, ProofWithValueHash };

class MerkleProof extends NumIndexSparseMerkleProof(TREE_HEIGHT) {}

class ProofWithValueHash extends CircuitValue {
  @prop proof: MerkleProof;
  @prop valueHash: Field;

  constructor(proof: MerkleProof, valueHash: Field) {
    super();
    this.proof = proof;
    this.valueHash = valueHash;
  }
}
