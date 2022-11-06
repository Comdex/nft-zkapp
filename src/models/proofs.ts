import { ProvableMerkleTreeUtils } from 'snarky-smt';
import { Field, isReady } from 'snarkyjs';
import { TREE_HEIGHT } from '../constant';

await isReady;

export { MerkleProof, ProofWithValueHash };

class MerkleProof extends ProvableMerkleTreeUtils.MerkleProof(TREE_HEIGHT) {}

class ProofWithValueHash {
  proof: MerkleProof;
  index: bigint;
  valueHash: Field;

  constructor(proof: MerkleProof, index: bigint, valueHash: Field) {
    this.proof = proof;
    this.index = index;
    this.valueHash = valueHash;
  }
}
