import { CircuitValue, Field, isReady, Poseidon, prop } from 'snarkyjs';
import { RollupState } from './rollup_state';

await isReady;

export { RollupStateTransition };

class RollupStateTransition extends CircuitValue {
  @prop source: RollupState;
  @prop target: RollupState;

  constructor(source: RollupState, target: RollupState) {
    super();
    this.source = source;
    this.target = target;
  }

  static from(stateTransition: {
    source: RollupState;
    target: RollupState;
  }): RollupStateTransition {
    return new this(stateTransition.source, stateTransition.target);
  }

  hash(): Field {
    return Poseidon.hash(this.toFields());
  }
}
