import { CircuitValue, Field, isReady, Poseidon, prop } from 'snarkyjs';

await isReady;

export { RollupState };

class RollupState extends CircuitValue {
  @prop nftsCommitment: Field;
  @prop lastIndex: Field;
  @prop currentIndex: Field;

  constructor(nftsCommitment: Field, lastIndex: Field, currentIndex: Field) {
    super();
    this.nftsCommitment = nftsCommitment;
    this.lastIndex = lastIndex;
    this.currentIndex = currentIndex;
  }

  static from(state: {
    nftsCommitment: Field;
    lastINdex: Field;
    currentIndex: Field;
  }) {
    return new this(state.nftsCommitment, state.lastINdex, state.currentIndex);
  }

  hash(): Field {
    return Poseidon.hash(this.toFields());
  }
}
