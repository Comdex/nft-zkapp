import { CircuitValue, Field, isReady, Poseidon, prop } from 'snarkyjs';

await isReady;

export { RollupState };

class RollupState extends CircuitValue {
  @prop nftsCommitment: Field;
  @prop currentIndex: Field;
  @prop currentActionsHash: Field;

  constructor(
    nftsCommitment: Field,
    currentIndex: Field,
    currentActionsHash: Field
  ) {
    super();
    this.nftsCommitment = nftsCommitment;
    this.currentIndex = currentIndex;
    this.currentActionsHash = currentActionsHash;
  }

  static from(state: {
    nftsCommitment: Field;
    currentIndex: Field;
    currentActionsHash: Field;
  }) {
    return new this(
      state.nftsCommitment,
      state.currentIndex,
      state.currentActionsHash
    );
  }

  hash(): Field {
    return Poseidon.hash(this.toFields());
  }
}
