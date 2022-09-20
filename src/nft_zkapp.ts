import {
  createEmptyValue,
  NumIndexDeepSparseMerkleSubTree,
  NumIndexSparseMerkleProof,
} from 'snarky-smt';
import {
  Field,
  SmartContract,
  state,
  State,
  method,
  DeployArgs,
  Permissions,
  Experimental,
  PublicKey,
  Poseidon,
  Circuit,
} from 'snarkyjs';
import {
  Action,
  ACTION_TYPE_MINT,
  ACTION_TYPE_TRANSFER,
} from './models/action';
import { NFT } from './models/nft';
import { NFTWithIndex } from './models/nftwithindex';
import { Permit, PERMIT_NFT_TRANSFER } from './models/permit';

const treeHeight = 13;

const initCommitment = Field.zero;
const initIndex = Field(1);

class MerkeProof extends NumIndexSparseMerkleProof(treeHeight) {}

export class nft_zkapp extends SmartContract {
  reducer = Experimental.Reducer({ actionType: Action });

  @state(Field) nftsCommitment = State<Field>();
  @state(Field) nextIndex = State<Field>();
  @state(Field) actionsHash = State<Field>();

  proofStore: Map<bigint, MerkeProof>;

  setProofStore(proofStore: Map<bigint, MerkeProof>) {
    this.proofStore = proofStore;
  }

  deploy(args: DeployArgs) {
    super.deploy(args);
    this.setPermissions({
      ...Permissions.default(),
      editState: Permissions.proofOrSignature(),
    });

    this.nftsCommitment.set(initCommitment);
    this.nextIndex.set(initIndex);
    this.actionsHash.set(Experimental.Reducer.initialActionsHash);
  }

  @method
  mintNFT(nft: NFT) {
    this.reducer.dispatch(
      new Action(ACTION_TYPE_MINT, NFT.empty(), nft, Field.zero)
    );
  }

  @method
  transfer(receiver: PublicKey, nftwithindex: NFTWithIndex, permit: Permit) {
    let { nft, index } = nftwithindex;
    permit.permitData.permitType.assertEquals(PERMIT_NFT_TRANSFER);
    permit.permitData.data.assertEquals(Poseidon.hash(receiver.toFields()));
    permit.verify(nft.owner).assertTrue();

    let newNFT = nft.clone();
    newNFT.owner = receiver;

    this.reducer.dispatch(new Action(ACTION_TYPE_TRANSFER, nft, newNFT, index));
  }

  @method
  rollup() {
    let nftsCommitment = this.nftsCommitment.get();
    this.nftsCommitment.assertEquals(nftsCommitment);

    let nextIndex = this.nextIndex.get();
    this.nextIndex.assertEquals(nextIndex);

    let currentIndex = nextIndex;

    let actionsHash = this.actionsHash.get();
    this.actionsHash.assertEquals(actionsHash);

    let pendingActions = this.reducer.getActions({
      fromActionHash: actionsHash,
    });

    let actions: Action[] = [];

    let deepSubTree = new NumIndexDeepSparseMerkleSubTree<NFT>(
      nftsCommitment,
      NFT,
      treeHeight
    );

    let { state: newNextIndex, actionsHash: newActionsHash } =
      this.reducer.reduce(
        pendingActions,
        Field,
        (nextIndex: Field, action: Action) => {
          actions.push(action);

          let newNextIndex = Circuit.if(
            action.type.equals(ACTION_TYPE_MINT),
            nextIndex.add(1),
            nextIndex
          );
          let proof = Circuit.witness(MerkeProof, () => {
            return this.proofStore.get(newNextIndex.toBigInt())!;
          });
          deepSubTree.addBranch(proof, createEmptyValue(NFT));

          let nftIndex = action.nftIndex;
          let proof2 = Circuit.witness(MerkeProof, () => {
            return this.proofStore.get(nftIndex.toBigInt())!;
          });
          deepSubTree.addBranch(proof2, action.oldNFT);

          return newNextIndex;
        },
        { state: nextIndex, actionsHash }
      );

    for (let i = 0; i < actions.length; i++) {
      let action = actions[i];
      currentIndex = Circuit.if(
        action.type.equals(ACTION_TYPE_MINT),
        currentIndex.add(1),
        currentIndex
      );

      let finalIndex = Circuit.if(
        action.type.equals(ACTION_TYPE_TRANSFER),
        action.nftIndex,
        currentIndex
      );
      deepSubTree.update(finalIndex, action.newNFT);
    }

    this.actionsHash.set(newActionsHash);
    this.nextIndex.set(newNextIndex);
  }
}
