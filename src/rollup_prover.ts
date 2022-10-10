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
import { DUMMY_NFT_ID } from './models/nft';
import { MerkleProof } from './models/proofs';
import { RollupState } from './models/rollup_state';
import { RollupStateTransition } from './models/rollup_state_transition';

export { NftRollupProver, NftRollupProof, NftRollupProverHelper };

await isReady;

let NftRollupProver = Experimental.ZkProgram({
  publicInput: RollupStateTransition,

  methods: {
    commitAction: {
      privateInputs: [Action, MerkleProof],

      method(
        stateTransition: RollupStateTransition,
        currAction: Action,
        merkleProof: MerkleProof
      ) {
        let prevStateRoot = stateTransition.source.nftsCommitment;
        let prevCurrIndex = stateTransition.source.currentIndex;
        let prevCurrActionsHash = stateTransition.source.currentActionsHash;
        let afterStateRoot = stateTransition.target.nftsCommitment;
        let afterCurrIndex = stateTransition.target.currentIndex;
        let afterCurrActonsHash = stateTransition.target.currentActionsHash;

        // validate actions hash
        let eventHash = SequenceEvents.hash([currAction.toFields()]);
        let newCurrActionsHash = SequenceEvents.updateSequenceState(
          prevCurrActionsHash,
          eventHash
        );
        newCurrActionsHash.assertEquals(afterCurrActonsHash);

        // validate current index
        let newCurrIdx = Circuit.if(
          currAction.isMint().and(prevCurrIndex.lt(NFT_SUPPLY)),
          prevCurrIndex.add(1),
          prevCurrIndex
        );
        newCurrIdx.assertEquals(afterCurrIndex);

        // validate nfts commitment
        merkleProof.root.assertEquals(prevStateRoot);
        let idx1 = Circuit.if(
          prevCurrIndex.lt(NFT_SUPPLY),
          newCurrIdx,
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
              merkleProof.verifyByFieldInCircuit(
                prevStateRoot,
                currAction.originalNFTHash
              ),
              currAction.nft.hash(),
              SMT_EMPTY_VALUE
            )
          )
        );

        let newStateRoot = Circuit.if(
          updateNFTHash.equals(SMT_EMPTY_VALUE),
          prevStateRoot,
          merkleProof.computeRootByFieldInCircuit(updateNFTHash)
        );

        newStateRoot.assertEquals(afterStateRoot);
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
  commitAction(
    currAction: Action,
    merkleProof: MerkleProof,
    currState: RollupState,
    deepSubTree: NumIndexDeepSparseMerkleSubTree
  ): RollupStateTransition {
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
    if (currAction.isMint().toBoolean() && newCurrentIndex < supply) {
      // mint
      newCurrentIndex = newCurrentIndex + 1n;
      currentNftId = Field(newCurrentIndex);
      let currentNftHash = currAction.nft.assignId(currentNftId).hash();
      nftsCommitment = merkleProof.computeRootByField(currentNftHash);
      deepSubTree.update(currentNftId, currentNftHash);
    }

    if (currAction.isTransfer().toBoolean()) {
      let exist = merkleProof.verifyByField(
        nftsCommitment,
        currAction.originalNFTHash
      );
      if (exist) {
        let currentNftHash = currAction.nft.hash();
        nftsCommitment = merkleProof.computeRootByField(currentNftHash);
        deepSubTree.update(currentNftId, currentNftHash);
      }
    }

    return RollupStateTransition.from({
      source: currState,
      target: RollupState.from({
        nftsCommitment,
        currentIndex: Field(newCurrentIndex),
        currentActionsHash: newCurrentActionsHash,
      }),
    });
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
