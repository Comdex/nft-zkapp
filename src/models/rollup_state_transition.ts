import { Field, isReady, Poseidon, Struct } from 'snarkyjs';
import { RollupState } from './rollup_state';

await isReady;

export { RollupStateTransition };

class RollupStateTransition extends Struct({
  source: RollupState,
  target: RollupState,
}) {
  static from(stateTransition: {
    source: RollupState;
    target: RollupState;
  }): RollupStateTransition {
    return new this({
      source: stateTransition.source,
      target: stateTransition.target,
    });
  }

  hash(): Field {
    return Poseidon.hash(RollupStateTransition.toFields(this));
  }

  toPretty(): any {
    return {
      source: (this.source as RollupState).toPretty(),
      target: (this.target as RollupState).toPretty(),
    };
  }
}
