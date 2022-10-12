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

export { NftRollupProver, NftRollupProof, NftRollupProverHelper };

await isReady;

function rollupStateTransform(currStateData: {
  currAction: Action;
  currMerkleProof: MerkleProof;
  currentActionsHash: Field;
  currentIndex: Field;
  currentNftsCommitment: Field;
}): {
  currentActionsHash: Field;
  currentIndex: Field;
  currentNftsCommitment: Field;
} {
  let {
    currAction,
    currMerkleProof,
    currentActionsHash,
    currentIndex,
    currentNftsCommitment,
  } = currStateData;
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
  let idxAfterCheckSupply = Circuit.if(
    currentIndex.lt(NFT_SUPPLY),
    currentIndex,
    DUMMY_NFT_ID
  );
  let idxAfterCheckIsTransfer = Circuit.if(
    currAction.isTransfer(),
    currAction.nft.id,
    idxAfterCheckSupply
  );
  let finalIdx = Circuit.if(
    currAction.isDummyData(),
    DUMMY_NFT_ID,
    idxAfterCheckIsTransfer
  );

  let [updateNftId, updateNFTHash] = Circuit.if(
    finalIdx.equals(DUMMY_NFT_ID),
    [DUMMY_NFT_ID, SMT_EMPTY_VALUE],
    Circuit.if(
      currAction.isMint(),
      [finalIdx, currAction.nft.assignId(finalIdx).hash()],
      // Check whether the transfer is valid
      Circuit.if(
        currMerkleProof.verifyByFieldInCircuit(
          currentNftsCommitment,
          currAction.originalNFTHash
        ),
        [finalIdx, currAction.nft.hash()],
        [DUMMY_NFT_ID, SMT_EMPTY_VALUE]
      )
    )
  );

  currentNftsCommitment = Circuit.if(
    updateNftId.equals(DUMMY_NFT_ID).and(updateNFTHash.equals(SMT_EMPTY_VALUE)),
    currentNftsCommitment,
    currMerkleProof.computeRootByFieldInCircuit(updateNFTHash)
  );

  return { currentActionsHash, currentIndex, currentNftsCommitment };
}

let NftRollupProver = Experimental.ZkProgram({
  publicInput: RollupStateTransition,

  methods: {
    commitActionBatch: {
      privateInputs: [ActionBatch],

      method(stateTransition: RollupStateTransition, actionBatch: ActionBatch) {
        let prevNftsCommitment = stateTransition.source.nftsCommitment;
        let prevCurrIndex = stateTransition.source.currentIndex;
        let prevCurrActionsHash = stateTransition.source.currentActionsHash;
        let afterNfsCommitment = stateTransition.target.nftsCommitment;
        let afterCurrIndex = stateTransition.target.currentIndex;
        let afterCurrActonsHash = stateTransition.target.currentActionsHash;

        let currentActionsHash = prevCurrActionsHash;
        let currentIndex = prevCurrIndex;
        let currentNftsCommitment = prevNftsCommitment;

        for (let i = 0, len = ActionBatch.batchSize; i < len; i++) {
          let currAction = actionBatch.actions[i];
          let currMerkleProof = actionBatch.merkleProofs[i];

          let newState = rollupStateTransform({
            currAction,
            currMerkleProof,
            currentActionsHash,
            currentIndex,
            currentNftsCommitment,
          });

          currentActionsHash = newState.currentActionsHash;
          currentIndex = newState.currentIndex;
          currentNftsCommitment = newState.currentNftsCommitment;
        }

        currentActionsHash.assertEquals(afterCurrActonsHash);
        Circuit.asProver(() => {
          console.log(
            `currentActionsHash: ${currentActionsHash.toString()} assert success`
          );
        });
        currentIndex.assertEquals(afterCurrIndex);
        Circuit.asProver(() => {
          console.log(
            `currentIndex: ${currentIndex.toString()} assert success`
          );
        });
        currentNftsCommitment.assertEquals(afterNfsCommitment);
        Circuit.asProver(() => {
          console.log(
            `currentNftsCommitment: ${currentNftsCommitment.toString()} assert success`
          );
        });
      },
    },

    commitAction: {
      privateInputs: [Action, MerkleProof],

      method(
        stateTransition: RollupStateTransition,
        currAction: Action,
        currMerkleProof: MerkleProof
      ) {
        let prevNftsCommitment = stateTransition.source.nftsCommitment;
        let prevCurrIndex = stateTransition.source.currentIndex;
        let prevCurrActionsHash = stateTransition.source.currentActionsHash;
        let afterNfsCommitment = stateTransition.target.nftsCommitment;
        let afterCurrIndex = stateTransition.target.currentIndex;
        let afterCurrActonsHash = stateTransition.target.currentActionsHash;

        let { currentActionsHash, currentIndex, currentNftsCommitment } =
          rollupStateTransform({
            currAction,
            currMerkleProof,
            currentActionsHash: prevCurrActionsHash,
            currentIndex: prevCurrIndex,
            currentNftsCommitment: prevNftsCommitment,
          });

        currentActionsHash.assertEquals(afterCurrActonsHash);
        Circuit.asProver(() => {
          console.log(
            `currentActionsHash: ${currentActionsHash.toString()} assert success`
          );
        });
        currentIndex.assertEquals(afterCurrIndex);
        Circuit.asProver(() => {
          console.log(
            `currentIndex: ${currentIndex.toString()} assert success`
          );
        });
        currentNftsCommitment.assertEquals(afterNfsCommitment);
        Circuit.asProver(() => {
          console.log(
            `currentNftsCommitment: ${currentNftsCommitment.toString()} assert success`
          );
        });
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

class NftRollupProof extends Experimental.ZkProgram.Proof(NftRollupProver) {}

let NftRollupProverHelper = {
  commitActionBatch(
    actions: Action[],
    currState: RollupState,
    deepSubTree: NumIndexDeepSparseMerkleSubTree,
    zeroProof: MerkleProof
  ): { stateTransition: RollupStateTransition; actionBatch: ActionBatch } {
    if (actions.length > ActionBatch.batchSize) {
      throw new Error(
        `Actions exceeding a fixed batch size of ${ActionBatch.batchSize} cannot be processed`
      );
    }

    let currentActionsHash = currState.currentActionsHash;
    let currentIndex = currState.currentIndex.toBigInt();
    let newMerkleProofs: MerkleProof[] = [];

    let dummyProof = zeroProof;

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
          newMerkleProofs.push(dummyProof);
        }
      }

      if (currAction.isTransfer().toBoolean()) {
        let nftExist = deepSubTree.has(
          currentNftId,
          currAction.originalNFTHash
        );
        if (nftExist) {
          console.log('nft exist, id: ', currentNftId.toString());
          let currentMerkleProof = deepSubTree.prove(currentNftId);
          newMerkleProofs.push(currentMerkleProof);

          let currentNftHash = currAction.nft.hash();
          deepSubTree.update(currentNftId, currentNftHash);
        } else {
          console.log('fake nft, id: ', currentNftId.toString());
          newMerkleProofs.push(dummyProof);
        }
      }
    }

    // pad action array
    let dummyAction = Action.empty();
    for (let i = actions.length; i < ActionBatch.batchSize; i++) {
      actions.push(dummyAction);
      newMerkleProofs.push(dummyProof);
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

  commitAction(
    currAction: Action,
    index: bigint,
    currState: RollupState,
    deepSubTree: NumIndexDeepSparseMerkleSubTree
  ): { stateTransition: RollupStateTransition; merkleProof: MerkleProof } {
    let currentIndex = currState.currentIndex;
    let newCurrentIndex = currentIndex.toBigInt();
    let nftsCommitment = currState.nftsCommitment;
    let currentActionsHash = currState.currentActionsHash;
    let supply = NFT_SUPPLY;

    // compute new actions hash
    let eventHash = SequenceEvents.hash([currAction.toFields()]);
    let newCurrentActionsHash = SequenceEvents.updateSequenceState(
      currentActionsHash,
      eventHash
    );

    let currentNftId = currAction.nft.id;
    let currentNftHash = currAction.nft.hash();
    let merkleProof = deepSubTree.prove(Field(index));

    if (currAction.isMint().toBoolean() && newCurrentIndex < supply) {
      // mint
      newCurrentIndex = newCurrentIndex + 1n;
      currentNftId = Field(newCurrentIndex);
      currentNftHash = currAction.nft.assignId(currentNftId).hash();
      nftsCommitment = deepSubTree.update(currentNftId, currentNftHash);
    }

    if (currAction.isTransfer().toBoolean()) {
      let nftExist = deepSubTree.has(currentNftId, currAction.originalNFTHash);

      if (nftExist) {
        nftsCommitment = deepSubTree.update(currentNftId, currentNftHash);
      }
    }

    return {
      stateTransition: RollupStateTransition.from({
        source: currState,
        target: RollupState.from({
          nftsCommitment,
          currentIndex: Field(newCurrentIndex),
          currentActionsHash: newCurrentActionsHash,
        }),
      }),
      merkleProof,
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
