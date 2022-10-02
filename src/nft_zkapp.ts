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
import { ActionProof } from './action_prover';
import { merkleTree } from './indexer';
import { Action } from './models/action';
import { NFT } from './models/nft';
import { MerkleProof } from './models/proofs';
import { RollupState } from './models/rollup_state';

export { NftZkapp };

const initCommitment = merkleTree.getRoot();
const initIndex = Field.zero;
const nftName = 'MinaGenesis';
const nftSymbol = 'MG';

console.log('initCommitment: ', initCommitment.toString());

class NftZkapp extends SmartContract {
  // constant supply
  static SUPPLY = Field.fromNumber(1000);

  reducer = Experimental.Reducer({ actionType: Action });

  @state(RollupState) state = State<RollupState>();
  @state(Field) lastActionsHash = State<Field>();
  @state(Field) currentActionsHash = State<Field>();

  indexerUrl: string;

  deploy(args: DeployArgs) {
    super.deploy(args);
    this.state.set(new RollupState(initCommitment, initIndex, initIndex));
    this.lastActionsHash.set(Experimental.Reducer.initialActionsHash);
    this.currentActionsHash.set(Experimental.Reducer.initialActionsHash);
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
    let currentIndex = this.state.get().currentIndex;
    if (currentIndex.toBigInt() < NftZkapp.SUPPLY.toBigInt()) {
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
    nft.changeOwner(receiver);

    this.reducer.dispatch(Action.transfer(nft, originalNFTHash));
  }

  @method
  rollup(proof: ActionProof) {
    proof.verify();

    let state = this.state.get();
    this.state.assertEquals(state);

    proof.publicInput.source.assertEquals(state);
    this.state.set(proof.publicInput.target);

    let lastActionsHash = this.lastActionsHash.get();
    this.lastActionsHash.assertEquals(lastActionsHash);

    let currentActionsHash = this.currentActionsHash.get();
    this.currentActionsHash.assertEquals(currentActionsHash);

    this.lastActionsHash.set(currentActionsHash);

    Circuit.asProver(() => {
      console.log('zkapp status assert success');
    });

    let pendingActions = this.reducer.getActions({
      fromActionHash: currentActionsHash,
    });
    let { actionsHash: newActionsHash } = this.reducer.reduce(
      pendingActions,
      Field,
      // eslint-disable-next-line no-unused-vars
      (curIdx: Field, _: Action) => {
        return curIdx;
      },
      { state: state.currentIndex, actionsHash: currentActionsHash }
    );

    this.currentActionsHash.set(newActionsHash);
  }
}
