import {
  createEmptyValue,
  DeepMerkleSubTree,
  ProvableMerkleTreeUtils,
} from 'snarky-smt';
import {
  Circuit,
  Experimental,
  Field,
  isReady,
  SelfProof,
  Struct,
  AccountUpdate,
} from 'snarkyjs';
import { NFT_SUPPLY } from './constant';
import { Action } from './models/action';
import { ActionBatch } from './models/action_batch';
import { DUMMY_NFT_HASH, DUMMY_NFT_ID, NFT } from './models/nft';
import { MerkleProof } from './models/proofs';
import { RollupState } from './models/rollup_state';
import { RollupStateTransition } from './models/rollup_state_transition';

export { NftRollupProver, NftRollupProof, NftRollupProverHelper };

await isReady;

class NFTResult extends Struct({ id: Field, hash: Field }) {}

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
  let eventHash = AccountUpdate.SequenceEvents.hash([currAction.toFields()]);
  currentActionsHash = Circuit.if(
    currAction.isDummyData(),
    currentActionsHash,
    AccountUpdate.SequenceEvents.updateSequenceState(
      currentActionsHash,
      eventHash
    )
  );

  // process mint
  let isMint = currAction.isMint();
  currentIndex = Circuit.if(
    isMint.and(currentIndex.lt(NFT_SUPPLY)),
    currentIndex.add(1),
    currentIndex
  );
  let mintNftHash = (currAction.nft as NFT).assignId(currentIndex).hash();
  let mintResult = { id: currentIndex, hash: mintNftHash };

  // process transfer
  let isTransfer = currAction.isTransfer();
  let transferNftHash = (currAction.nft as NFT).hash();
  let transferResult = {
    id: currAction.nft.id,
    hash: transferNftHash,
  };

  // process dummy data
  let isDummyData = currAction.isDummyData();
  let dummyResult = { id: DUMMY_NFT_ID, hash: DUMMY_NFT_HASH };

  let originalHashValid = ProvableMerkleTreeUtils.checkMembership(
    currMerkleProof,
    currentNftsCommitment,
    Circuit.if(isMint, currentIndex, currAction.nft.id),
    currAction.originalNFTHash,
    Field,
    { hashValue: false }
  );

  let nftResult = Circuit.switch([isMint, isTransfer, isDummyData], NFTResult, [
    Circuit.if(
      currentIndex.lt(NFT_SUPPLY).and(originalHashValid),
      mintResult,
      dummyResult
    ),
    Circuit.if(originalHashValid, transferResult, dummyResult),
    dummyResult,
  ]);

  Circuit.log('isProofValid: ', originalHashValid);

  currentNftsCommitment = Circuit.if(
    Circuit.equal(nftResult, dummyResult),
    currentNftsCommitment,
    ProvableMerkleTreeUtils.computeRoot(
      currMerkleProof,
      nftResult.id,
      nftResult.hash,
      Field,
      { hashValue: false }
    )
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
            currAction: currAction as Action,
            currMerkleProof,
            currentActionsHash,
            currentIndex,
            currentNftsCommitment,
          });

          currentActionsHash = newState.currentActionsHash;
          currentIndex = newState.currentIndex;
          currentNftsCommitment = newState.currentNftsCommitment;
        }

        currentActionsHash.assertEquals(
          afterCurrActonsHash,
          'currentActionsHash assertion failed'
        );

        currentIndex.assertEquals(
          afterCurrIndex,
          'currentIndex assertion failed'
        );

        currentNftsCommitment.assertEquals(
          afterNfsCommitment,
          'currentNftsCommitment assertion failed'
        );
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

        currentActionsHash.assertEquals(
          afterCurrActonsHash,
          'currentActionsHash assertion failed'
        );

        currentIndex.assertEquals(
          afterCurrIndex,
          'currentIndex assertion failed'
        );

        currentNftsCommitment.assertEquals(
          afterNfsCommitment,
          'currentNftsCommitment assertion failed'
        );
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

        (p1.publicInput.source as RollupState).assertEquals(
          stateTransition.source as RollupState
        );
        (p1.publicInput.target as RollupState).assertEquals(
          p2.publicInput.source as RollupState
        );
        (p2.publicInput.target as RollupState).assertEquals(
          stateTransition.target as RollupState
        );
      },
    },
  },
});

class NftRollupProof extends Experimental.ZkProgram.Proof(NftRollupProver) {}

let NftRollupProverHelper = {
  commitActionBatch(
    actions: Action[],
    currState: RollupState,
    deepSubTree: DeepMerkleSubTree<Field>
  ): { stateTransition: RollupStateTransition; actionBatch: ActionBatch } {
    if (actions.length > ActionBatch.batchSize) {
      throw new Error(
        `Actions exceeding a fixed batch size of ${ActionBatch.batchSize} cannot be processed`
      );
    }

    let currentActionsHash = currState.currentActionsHash;
    let currentIndex = currState.currentIndex.toBigInt();
    let newMerkleProofs: MerkleProof[] = [];

    let dummyProof = createEmptyValue(MerkleProof);

    for (let i = 0, len = actions.length; i < len; i++) {
      let currAction = actions[i];

      // compute new actions hash
      let eventHash = AccountUpdate.SequenceEvents.hash([
        currAction.toFields(),
      ]);
      currentActionsHash = AccountUpdate.SequenceEvents.updateSequenceState(
        currentActionsHash,
        eventHash
      );

      let currentNftId = currAction.nft.id;
      let currentNftIdBigInt = currentNftId.toBigInt();

      // compute new current index and root
      if (currAction.isMint().toBoolean()) {
        // mint
        if (currentIndex < NFT_SUPPLY) {
          currentIndex = currentIndex + 1n;
          let currentNftHash = (currAction.nft as NFT)
            .assignId(Field(currentIndex))
            .hash();

          let currentMerkleProof = deepSubTree.prove(currentIndex);
          newMerkleProofs.push(currentMerkleProof);

          deepSubTree.update(currentIndex, currentNftHash);
        } else {
          newMerkleProofs.push(dummyProof);
        }
      }

      if (currAction.isTransfer().toBoolean()) {
        let nftExist = deepSubTree.has(
          currentNftIdBigInt,
          currAction.originalNFTHash
        );
        if (nftExist) {
          console.log('nft exist, id: ', currentNftId.toString());
          let currentMerkleProof = deepSubTree.prove(currentNftIdBigInt);
          newMerkleProofs.push(currentMerkleProof);

          let currentNftHash = (currAction.nft as NFT).hash();
          deepSubTree.update(currentNftIdBigInt, currentNftHash);
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

    let actionBatch = new ActionBatch({
      actions,
      merkleProofs: newMerkleProofs,
    });

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
    deepSubTree: DeepMerkleSubTree<Field>
  ): { stateTransition: RollupStateTransition; merkleProof: MerkleProof } {
    let currentIndex = currState.currentIndex;
    let newCurrentIndex = currentIndex.toBigInt();
    let nftsCommitment = currState.nftsCommitment;
    let currentActionsHash = currState.currentActionsHash;
    let supply = NFT_SUPPLY;

    // compute new actions hash
    let eventHash = AccountUpdate.SequenceEvents.hash([currAction.toFields()]);
    let newCurrentActionsHash =
      AccountUpdate.SequenceEvents.updateSequenceState(
        currentActionsHash,
        eventHash
      );

    let currentNftId = currAction.nft.id;
    let currentNftIdBigInt = currentNftId.toBigInt();
    let currentNftHash = (currAction.nft as NFT).hash();
    let merkleProof = deepSubTree.prove(index);

    if (currAction.isMint().toBoolean() && newCurrentIndex < supply) {
      // mint
      newCurrentIndex = newCurrentIndex + 1n;

      currentNftHash = (currAction.nft as NFT).assignId(currentNftId).hash();
      nftsCommitment = deepSubTree.update(newCurrentIndex, currentNftHash);
    }

    if (currAction.isTransfer().toBoolean()) {
      let nftExist = deepSubTree.has(
        currentNftIdBigInt,
        currAction.originalNFTHash
      );

      if (nftExist) {
        nftsCommitment = deepSubTree.update(currentNftIdBigInt, currentNftHash);
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

    return RollupStateTransition.from({
      source: source as RollupState,
      target: target as RollupState,
    });
  },
};
