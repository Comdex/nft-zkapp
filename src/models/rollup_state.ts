import { CircuitValue, Field, isReady, Poseidon, prop } from 'snarkyjs';

await isReady;

export { RollupState };

class RollupState extends CircuitValue {
  @prop nftsCommitment: Field;
  @prop currentIndex: Field;

  constructor(nftsCommitment: Field, currentIndex: Field) {
    super();
    this.nftsCommitment = nftsCommitment;
    this.currentIndex = currentIndex;
  }

  static from(state: { nftsCommitment: Field; currentIndex: Field }) {
    return new this(state.nftsCommitment, state.currentIndex);
  }

  hash(): Field {
    return Poseidon.hash(this.toFields());
  }
}
