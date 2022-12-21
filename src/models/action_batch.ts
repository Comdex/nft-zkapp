import { Circuit, isReady, Struct } from 'snarkyjs';
import { ACTION_BATCH_SIZE } from '../constant';
import { Action } from './action';
import { MerkleProof } from './proofs';

await isReady;

export { ActionBatch };

class ActionBatch extends Struct({
  actions: Circuit.array(Action, ACTION_BATCH_SIZE),
  merkleProofs: Circuit.array(MerkleProof, ACTION_BATCH_SIZE),
}) {
  static batchSize = ACTION_BATCH_SIZE;
}
