import { NumIndexDeepSparseMerkleSubTree, SMT_EMPTY_VALUE } from 'snarky-smt';
import {
  Circuit,
  Experimental,
  Field,
  isReady,
  SelfProof,
  SequenceEvents,
} from 'snarkyjs';
import { NFT_SUPPLY } from './constant';
import { Action } from './models/action';
import { ActionBatch } from './models/action_batch';
import { DUMMY_NFT_ID } from './models/nft';
import { MerkleProof } from './models/proofs';
import { RollupState } from './models/rollup_state';
import { RollupStateTransition } from './models/rollup_state_transition';

export {
  NftRollupBatchProver,
  NftRollupBatchProof,
  NftRollupBatchProverHelper,
};

await isReady;

let NftRollupBatchProver = Experimental.ZkProgram({
  publicInput: RollupStateTransition,

  methods: {
    commitActions: {
      privateInputs: [ActionBatch],

      method(stateTransition: RollupStateTransition, actionBatch: ActionBatch) {
        let prevStateRoot = stateTransition.source.nftsCommitment;
        let prevCurrIndex = stateTransition.source.currentIndex;
        let prevCurrActionsHash = stateTransition.source.currentActionsHash;
        let afterStateRoot = stateTransition.target.nftsCommitment;
        let afterCurrIndex = stateTransition.target.currentIndex;
        let afterCurrActonsHash = stateTransition.target.currentActionsHash;

        let currentActionsHash = prevCurrActionsHash;
        let currentIndex = prevCurrIndex;
        let currentStateRoot = prevStateRoot;

        for (let i = 0, len = ActionBatch.batchSize; i < len; i++) {
          let currAction = actionBatch.actions[i];
          let currMerkleProof = actionBatch.merkleProofs[i];

          // compute actions hash
          let eventHash = SequenceEvents.hash([currAction.toFields()]);
          currentActionsHash = Circuit.if(
            currAction.isDummyData(),
            currentActionsHash,
            SequenceEvents.updateSequenceState(currentActionsHash, eventHash)
          );

          // compute current index
          currentIndex = Circuit.if(
            currAction.isMint().and(currentIndex.lt(NFT_SUPPLY)),
            currentIndex.add(1),
            currentIndex
          );

          // compute nft id
          let idx1 = Circuit.if(
            currentIndex.lt(NFT_SUPPLY),
            currentIndex,
            DUMMY_NFT_ID
          );
          let finalIdx = Circuit.if(
            currAction.isTransfer(),
            currAction.nft.id,
            idx1
          );

          let updateNFTHash = Circuit.if(
            finalIdx.equals(DUMMY_NFT_ID),
            SMT_EMPTY_VALUE,
            Circuit.if(
              currAction.isMint(),
              currAction.nft.assignId(finalIdx).hash(),
              // Check whether the transfer is valid
              Circuit.if(
                currMerkleProof.verifyByFieldInCircuit(
                  currentStateRoot,
                  currAction.originalNFTHash
                ),
                currAction.nft.hash(),
                SMT_EMPTY_VALUE
              )
            )
          );

          currentStateRoot = Circuit.if(
            updateNFTHash.equals(SMT_EMPTY_VALUE),
            currentStateRoot,
            currMerkleProof.computeRootByFieldInCircuit(updateNFTHash)
          );
        }

        currentActionsHash.assertEquals(afterCurrActonsHash);
        currentIndex.assertEquals(afterCurrIndex);
        currentStateRoot.assertEquals(afterStateRoot);
      },
    },

    merge: {
      privateInputs: [SelfProof, SelfProof],

      method(
        stateTransition: RollupStateTransition,
        p1: SelfProof<RollupStateTransition>,
        p2: SelfProof<RollupStateTransition>
      ) {
        p1.verify();
        p2.verify();

        p1.publicInput.source.assertEquals(stateTransition.source);
        p1.publicInput.target.assertEquals(p2.publicInput.source);
        p2.publicInput.target.assertEquals(stateTransition.target);
      },
    },
  },
});

class NftRollupBatchProof extends Experimental.ZkProgram.Proof(
  NftRollupBatchProver
) {}

let NftRollupBatchProverHelper = {
  commitActions(
    actions: Action[],
    currState: RollupState,
    deepSubTree: NumIndexDeepSparseMerkleSubTree,
    currProofs: Map<bigint, MerkleProof>
  ): { stateTransition: RollupStateTransition; actionBatch: ActionBatch } {
    let currentActionsHash = currState.currentActionsHash;
    let currentIndex = currState.currentIndex.toBigInt();
    let newMerkleProofs: MerkleProof[] = [];

    let dummyProof = currProofs.get(0n);

    for (let i = 0, len = actions.length; i < len; i++) {
      let currAction = actions[i];

      // compute new actions hash
      let eventHash = SequenceEvents.hash([currAction.toFields()]);
      currentActionsHash = SequenceEvents.updateSequenceState(
        currentActionsHash,
        eventHash
      );

      let currentNftId = currAction.nft.id;

      // compute new current index and root
      if (currAction.isMint().toBoolean()) {
        // mint

        if (currentIndex < NFT_SUPPLY) {
          currentIndex = currentIndex + 1n;
          currentNftId = Field(currentIndex);
          let currentNftHash = currAction.nft.assignId(currentNftId).hash();

          let currentMerkleProof = deepSubTree.prove(currentNftId);
          newMerkleProofs.push(currentMerkleProof);

          deepSubTree.update(currentNftId, currentNftHash);
        } else {
          newMerkleProofs.push(dummyProof!);
        }
      }

      if (currAction.isTransfer().toBoolean()) {
        let originProof = currProofs.get(currentNftId.toBigInt());
        if (originProof === undefined) {
          throw new Error(
            `proof with nft id: ${currentNftId.toString()} does not exist`
          );
        }

        let exist = originProof.verifyByField(
          currState.nftsCommitment,
          currAction.originalNFTHash
        );
        if (exist) {
          let currentMerkleProof = deepSubTree.prove(currentNftId);
          newMerkleProofs.push(currentMerkleProof);

          let currentNftHash = currAction.nft.hash();
          deepSubTree.update(currentNftId, currentNftHash);
        } else {
          newMerkleProofs.push(dummyProof!);
        }
      }
    }

    let dummyAction = Action.empty();
    for (let i = actions.length; i < ActionBatch.batchSize; i++) {
      actions.push(dummyAction);
      newMerkleProofs.push(dummyProof!);
    }

    let actionBatch = new ActionBatch(actions, newMerkleProofs);

    return {
      stateTransition: RollupStateTransition.from({
        source: currState,
        target: RollupState.from({
          nftsCommitment: deepSubTree.getRoot(),
          currentIndex: Field(currentIndex),
          currentActionsHash,
        }),
      }),
      actionBatch,
    };
  },

  merge(
    p1: SelfProof<RollupStateTransition>,
    p2: SelfProof<RollupStateTransition>
  ): RollupStateTransition {
    let source = p1.publicInput.source;
    let target = p2.publicInput.target;

    return RollupStateTransition.from({ source, target });
  },
};
