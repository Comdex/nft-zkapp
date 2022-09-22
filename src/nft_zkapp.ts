import { SMT_EMPTY_VALUE } from 'snarky-smt';
import { NumIndexSparseMerkleProof } from 'snarky-smt';
import { NumIndexDeepSparseMerkleSubTreeForField } from 'snarky-smt/build/module/lib/deep_subtree';
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
  Circuit,
  Mina,
  PrivateKey,
  AccountUpdate,
  shutdown,
  CircuitString,
} from 'snarkyjs';
import { treeHeight } from './constant';
import { merkleTree } from './indexer';
import { Action } from './models/action';
import { DUMMY_NFT_ID, NFT } from './models/nft';
import { OwnerSecret } from './models/owner_secret';

export { NftZkapp, MerkleProof };

const initCommitment = merkleTree.getRoot();
const initIndex = Field.zero;
const nftName = 'MinaGenesis';
const nftSymbol = 'MG';

class MerkleProof extends NumIndexSparseMerkleProof(treeHeight) {}

class NftZkapp extends SmartContract {
  reducer = Experimental.Reducer({ actionType: Action });

  @state(Field) nftsCommitment = State<Field>();
  @state(Field) currentIndex = State<Field>();
  @state(Field) lastActionsHash = State<Field>();
  @state(Field) currentActionsHash = State<Field>();

  proofStore: Map<bigint, MerkleProof>;
  indexerUrl: string;

  deploy(args: DeployArgs) {
    super.deploy(args);
    this.nftsCommitment.set(initCommitment);
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

  @method
  mint(nft: NFT) {
    nft.id.assertEquals(DUMMY_NFT_ID);
    this.reducer.dispatch(Action.mint(nft));
  }

  @method
  transfer(receiver: PublicKey, nft: NFT, senderKey: PrivateKey) {
    nft.id.equals(DUMMY_NFT_ID).assertFalse();
    nft.data.ownerSecret.checkOwner(senderKey).assertTrue();

    const originalNFTHash = nft.hash();
    nft.data.ownerSecret = new OwnerSecret(receiver).encrypt();

    this.reducer.dispatch(Action.transfer(nft, originalNFTHash));
  }

  @method
  rollup() {
    let nftsCommitment = this.nftsCommitment.get();
    this.nftsCommitment.assertEquals(nftsCommitment);

    let currentIndex = this.currentIndex.get();
    this.currentIndex.assertEquals(currentIndex);

    let lastActionsHash = this.lastActionsHash.get();
    this.lastActionsHash.assertEquals(lastActionsHash);

    let currentActionsHash = this.currentActionsHash.get();
    this.currentActionsHash.assertEquals(currentActionsHash);

    this.lastActionsHash.set(currentActionsHash);

    let pendingActions = this.reducer.getActions({
      fromActionHash: currentActionsHash,
    });

    let actions: Action[] = [];

    let deepSubTree = new NumIndexDeepSparseMerkleSubTreeForField(
      nftsCommitment,
      treeHeight
    );

    let dummyProof = Circuit.witness(MerkleProof, () => {
      let proof = this.proofStore.get(0n);
      if (proof === undefined) {
        throw new Error(`Merkle Proof with index: 0 could not be found`);
      }

      return proof.toConstant();
    });
    deepSubTree.addBranch(dummyProof, SMT_EMPTY_VALUE);

    let { actionsHash: newActionsHash } = this.reducer.reduce(
      pendingActions,
      Field,
      (curIdx: Field, action: Action) => {
        Circuit.asProver(() => {
          console.log('curIdx: ', curIdx.toString());
        });
        actions.push(action);

        let newCurIdx = Circuit.if(action.isMint(), curIdx.add(1), curIdx);
        let finalIdx = Circuit.if(
          action.isTransfer(),
          action.nft.id,
          newCurIdx
        );

        Circuit.asProver(() => {
          console.log('finalIdx: ', finalIdx.toString());
        });

        let merkleProof = Circuit.witness(MerkleProof, () => {
          let idxNum = finalIdx.toBigInt();
          let proof = this.proofStore.get(idxNum);
          if (proof === undefined) {
            throw new Error(
              `Merkle Proof with index: ${idxNum} could not be found`
            );
          }
          return proof.toConstant();
        });

        deepSubTree.addBranch(merkleProof, action.originalNFTHash);
        return newCurIdx;
      },
      { state: currentIndex, actionsHash: currentActionsHash }
    );

    let tempCurIdx = currentIndex;
    for (let i = 0; i < actions.length; i++) {
      let action = actions[i];

      tempCurIdx = Circuit.if(action.isMint(), tempCurIdx.add(1), tempCurIdx);
      let finalIdx = Circuit.if(action.isTransfer(), action.nft.id, tempCurIdx);

      let membershipProof = Circuit.witness(MerkleProof, () => {
        let indexNum = finalIdx.toBigInt();
        let proof = this.proofStore.get(indexNum);
        if (proof === undefined) {
          throw new Error(
            `Merkle Proof with index: ${indexNum} could not be found`
          );
        }
        return proof.toConstant();
      });

      let [updateIndex, updateNFTHash] = Circuit.if(
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
      );

      deepSubTree.update(updateIndex, updateNFTHash);
    }

    let finalRoot = deepSubTree.getRoot();
    this.nftsCommitment.set(finalRoot);
    this.currentActionsHash.set(newActionsHash);
    this.currentIndex.set(tempCurIdx);
  }
}
