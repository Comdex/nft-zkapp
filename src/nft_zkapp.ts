import { SMT_EMPTY_VALUE } from 'snarky-smt';
import { NumIndexDeepSparseMerkleSubTreeForField } from 'snarky-smt';
import {
  Field,
  SmartContract,
  state,
  State,
  method,
  DeployArgs,
  Experimental,
  PublicKey,
  Circuit,
  PrivateKey,
  CircuitString,
} from 'snarkyjs';
import { TREE_HEIGHT } from './constant';
import { merkleTree } from './indexer';
import { Action } from './models/action';
import { DUMMY_NFT_ID, NFT } from './models/nft';
import { MerkleProof, Proofs } from './models/proofs';

export { NftZkapp };

const initCommitment = merkleTree.getRoot();
const initIndex = Field.zero;
const nftName = 'MinaGenesis';
const nftSymbol = 'MG';

console.log('initCommitment: ', initCommitment.toString());

class NftZkapp extends SmartContract {
  // constant supply
  SUPPLY = Field.fromNumber(1000);

  reducer = Experimental.Reducer({ actionType: Action });

  @state(Field) nftsCommitment = State<Field>();
  @state(Field) lastIndex = State<Field>();
  @state(Field) currentIndex = State<Field>();
  @state(Field) lastActionsHash = State<Field>();
  @state(Field) currentActionsHash = State<Field>();

  proofStore: Map<bigint, MerkleProof>;
  indexerUrl: string;

  deploy(args: DeployArgs) {
    super.deploy(args);
    this.nftsCommitment.set(initCommitment);
    this.lastIndex.set(initIndex);
    this.currentIndex.set(initIndex);
    this.lastActionsHash.set(Experimental.Reducer.initialActionsHash);
    this.currentActionsHash.set(Experimental.Reducer.initialActionsHash);
  }

  setProofStore(proofStore: Map<bigint, MerkleProof>) {
    this.proofStore = proofStore;
  }

  name(): CircuitString {
    return CircuitString.fromString(nftName);
  }

  symbol(): CircuitString {
    return CircuitString.fromString(nftSymbol);
  }

  // TODO
  // eslint-disable-next-line no-unused-vars
  getNFT(id: Field): NFT {
    return NFT.empty();
  }

  // TODO
  // eslint-disable-next-line no-unused-vars
  tokenURI(id: Field): string {
    return '';
  }

  canMint(): boolean {
    let currentIndex = this.currentIndex.get();
    if (currentIndex.toBigInt() < this.SUPPLY.toBigInt()) {
      return true;
    }

    return false;
  }

  @method
  mint(nft: NFT) {
    nft.isAssignedId().assertFalse();
    this.reducer.dispatch(Action.mint(nft));
  }

  @method
  transfer(receiver: PublicKey, nft: NFT, senderKey: PrivateKey) {
    Circuit.asProver(() => {
      console.log('receiver: ', receiver.toBase58());
      //console.log('senderKey: ', senderKey.toBase58());
      //console.log('transfer nft: ', nft.toPretty());
    });
    nft.isAssignedId().assertTrue();
    Circuit.asProver(() => {
      console.log('dummy id check success');
    });

    //TODO: Due to a bug in the decryption of snarkyjs, this assertion is not enabled for the time being
    //nft.checkOwner(senderKey).assertTrue();
    senderKey.toPublicKey().equals(receiver).assertFalse();

    Circuit.asProver(() => {
      console.log('nft owner check success');
    });

    const originalNFTHash = nft.hash();

    //TODO: a bug to fix
    //nft.changeOwner(receiver);

    this.reducer.dispatch(Action.transfer(nft, originalNFTHash));
  }

  @method
  rollup(proofs: Proofs) {
    let nftsCommitment = this.nftsCommitment.get();
    this.nftsCommitment.assertEquals(nftsCommitment);

    Circuit.asProver(() => {
      console.log('rollup-nftsCommitment: ', nftsCommitment.toString());
      console.log('proofs length: ', proofs.arr.length);
    });

    let lastIndex = this.lastIndex.get();
    this.lastIndex.assertEquals(lastIndex);

    let currentIndex = this.currentIndex.get();
    this.currentIndex.assertEquals(currentIndex);

    let lastActionsHash = this.lastActionsHash.get();
    this.lastActionsHash.assertEquals(lastActionsHash);

    let currentActionsHash = this.currentActionsHash.get();
    this.currentActionsHash.assertEquals(currentActionsHash);

    this.lastIndex.set(currentIndex);
    this.lastActionsHash.set(currentActionsHash);

    Circuit.asProver(() => {
      console.log('zkapp status assert success');
    });

    let deepSubTree = new NumIndexDeepSparseMerkleSubTreeForField(
      nftsCommitment,
      TREE_HEIGHT
    );
    let dummyProof = proofs.arr[0];
    deepSubTree.addBranch(dummyProof, SMT_EMPTY_VALUE);

    let pendingActions = this.reducer.getActions({
      fromActionHash: currentActionsHash,
    });
    let actions: Action[] = [];
    let finalIdxs: Field[] = [];

    let currPos = 1;
    let { state: newCurrentIndex, actionsHash: newActionsHash } =
      this.reducer.reduce(
        pendingActions,
        Field,
        (curIdx: Field, action: Action) => {
          // Circuit.asProver(() => {
          //   console.log('curIdx: ', curIdx.toString());
          //   console.log('curAction: ', action.toString());
          // });
          actions.push(action);
          let newCurIdx = Circuit.if(
            action.isMint().and(curIdx.lt(this.SUPPLY)),
            curIdx.add(1),
            curIdx
          );
          let idx1 = Circuit.if(
            curIdx.lt(this.SUPPLY),
            newCurIdx,
            DUMMY_NFT_ID
          );
          let idx2 = Circuit.if(action.isTransfer(), action.nft.id, idx1);
          let finalIdx = Circuit.if(action.isDummyData(), DUMMY_NFT_ID, idx2);
          finalIdxs.push(finalIdx);

          let merkleProof = proofs.arr[currPos];
          currPos = currPos + 1;
          deepSubTree.addBranch(merkleProof, action.originalNFTHash);

          return newCurIdx;
        },
        { state: currentIndex, actionsHash: currentActionsHash }
      );

    Circuit.asProver(() => {
      console.log('actions length: ', actions.length);
    });

    for (let i = 0; i < actions.length; i++) {
      let action = actions[i];
      let finalIdx = finalIdxs[i];

      let membershipProof = proofs.arr[i + 1];

      // let [updateIndex, updateNFTHash] = Circuit.if(
      //   action.isMint(),
      //   [finalIdx, action.nft.assignId(finalIdx).hash()],
      //   Circuit.if(
      //     action.isDummyData(),
      //     [DUMMY_NFT_ID, SMT_EMPTY_VALUE],
      //     // Check whether the transfer is valid
      //     Circuit.if(
      //       membershipProof.verifyByFieldInCircuit(
      //         nftsCommitment,
      //         action.originalNFTHash
      //       ),
      //       [finalIdx, action.nft.hash()],
      //       [DUMMY_NFT_ID, SMT_EMPTY_VALUE]
      //     )
      //   )
      // );
      let [updateIndex, updateNFTHash] = Circuit.if(
        finalIdx.equals(DUMMY_NFT_ID),
        [finalIdx, SMT_EMPTY_VALUE],
        Circuit.if(
          action.isMint(),
          [finalIdx, action.nft.assignId(finalIdx).hash()],
          // Check whether the transfer is valid
          Circuit.if(
            membershipProof.verifyByFieldInCircuit(
              nftsCommitment,
              action.originalNFTHash
            ),
            [finalIdx, action.nft.hash()],
            [DUMMY_NFT_ID, SMT_EMPTY_VALUE]
          )
        )
      );

      Circuit.asProver(() => {
        console.log(
          `updateIndex: ${updateIndex}, updateNFTHash: ${updateNFTHash}`
        );
      });
      deepSubTree.update(updateIndex, updateNFTHash);
    }

    let finalRoot = deepSubTree.getRoot();
    this.nftsCommitment.set(finalRoot);
    this.currentActionsHash.set(newActionsHash);
    this.currentIndex.set(newCurrentIndex);
  }
}
