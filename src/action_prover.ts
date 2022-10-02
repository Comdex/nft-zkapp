import {
  NumIndexDeepSparseMerkleSubTreeForField,
  SMT_EMPTY_VALUE,
} from 'snarky-smt';
import { Circuit, Experimental, Field, SelfProof } from 'snarkyjs';
import { Action } from './models/action';
import { DUMMY_NFT_ID } from './models/nft';
import { MerkleProof } from './models/proofs';
import { RollupState } from './models/rollup_state';
import { RollupStateTransition } from './models/rollup_state_transition';
import { NftZkapp } from './nft_zkapp';

export { NftActionProver, ActionProof, NftActionProverHelper };

let NftActionProver = Experimental.ZkProgram({
  publicInput: RollupStateTransition,

  methods: {
    init: {
      privateInputs: [],

      method(stateTransition: RollupStateTransition) {
        stateTransition.target.assertEquals(stateTransition.source);
      },
    },

    commitAction: {
      privateInputs: [Action, MerkleProof, SelfProof],

      method(
        stateTransition: RollupStateTransition,
        currAction: Action,
        merkleProof: MerkleProof,
        selfProof: SelfProof<RollupStateTransition>
      ) {
        selfProof.verify();
        selfProof.publicInput.target.assertEquals(stateTransition.source);

        let prevStateRoot = stateTransition.source.nftsCommitment;
        let prevCurrIndex = stateTransition.source.currentIndex;
        let afterStateRoot = stateTransition.target.nftsCommitment;
        let afterLastIndex = stateTransition.target.lastIndex;
        let afterCurrIndex = stateTransition.target.currentIndex;

        afterLastIndex.assertEquals(prevCurrIndex);
        merkleProof.root.assertEquals(prevStateRoot);

        let newCurIdx = Circuit.if(
          currAction.isMint().and(prevCurrIndex.lt(NftZkapp.SUPPLY)),
          prevCurrIndex.add(1),
          prevCurrIndex
        );
        newCurIdx.assertEquals(afterCurrIndex);

        let idx1 = Circuit.if(
          prevCurrIndex.lt(NftZkapp.SUPPLY),
          newCurIdx,
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

class ActionProof extends Experimental.ZkProgram.Proof(NftActionProver) {}

let NftActionProverHelper = {
  init(state: RollupState): RollupStateTransition {
    return new RollupStateTransition(state, state);
  },

  commitAction(
    currAction: Action,
    merkleProof: MerkleProof,
    previousProof: SelfProof<RollupStateTransition>,
    deepSubTree: NumIndexDeepSparseMerkleSubTreeForField
  ): RollupStateTransition {
    let currState = previousProof.publicInput.target;
    let currentIndex = currState.currentIndex;
    let newCurrentIndex = currentIndex.toBigInt();
    let nftsCommitment = currState.nftsCommitment;
    let supply = NftZkapp.SUPPLY.toBigInt();

    let currentNftId = currAction.nft.id;
    if (currAction.isMint().toBoolean() && newCurrentIndex < supply) {
      // mint
      newCurrentIndex = newCurrentIndex + 1n;
      currentNftId = Field(currentIndex);
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
        lastINdex: currentIndex,
        currentIndex: Field(newCurrentIndex),
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
