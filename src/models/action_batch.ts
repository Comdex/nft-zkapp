import { arrayProp, CircuitValue, isReady } from 'snarkyjs';
import { ACTION_BATCH_SIZE } from '../constant';
import { Action } from './action';
import { MerkleProof } from './proofs';

await isReady;

export { ActionBatch };

class ActionBatch extends CircuitValue {
  static batchSize = ACTION_BATCH_SIZE;

  @arrayProp(Action, ACTION_BATCH_SIZE) actions: Action[];
  @arrayProp(MerkleProof, ACTION_BATCH_SIZE) merkleProofs: MerkleProof[];

  constructor(actions: Action[], merkleProofs: MerkleProof[]) {
    super();
    this.actions = actions;
    this.merkleProofs = merkleProofs;
  }
}
