import { Circuit, Field, isReady, Poseidon, Struct } from 'snarkyjs';

await isReady;

export { RollupState };

class RollupState extends Struct({
  nftsCommitment: Field,
  currentIndex: Field,
  currentActionsHash: Field,
}) {
  static from(state: {
    nftsCommitment: Field;
    currentIndex: Field;
    currentActionsHash: Field;
  }) {
    return new this({
      nftsCommitment: state.nftsCommitment,
      currentIndex: state.currentIndex,
      currentActionsHash: state.currentActionsHash,
    });
  }

  assertEquals(other: RollupState) {
    Circuit.assertEqual(RollupState, this, other);
  }

  hash(): Field {
    return Poseidon.hash(RollupState.toFields(this));
  }

  toPretty(): any {
    return {
      nftsCommitment: this.nftsCommitment.toString(),
      currentIndex: this.currentIndex.toString(),
      currentActionsHash: this.currentActionsHash.toString(),
    };
  }
}
