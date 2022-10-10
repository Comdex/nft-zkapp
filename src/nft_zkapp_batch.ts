import {
  Field,
  SmartContract,
  state,
  State,
  method,
  DeployArgs,
  Experimental,
  PublicKey,
  PrivateKey,
  CircuitString,
} from 'snarkyjs';

import { Action } from './models/action';
import { NFT } from './models/nft';
import { RollupState } from './models/rollup_state';
import { merkleTree } from './global';
import { NFT_SUPPLY } from './constant';
import { NftRollupBatchProof } from './rollup_batch_prover';

export { NftZkappBatch, NFT_INIT_INDEX, NFT_INIT_ACTIONSHASH };

const NFT_INIT_COMMITMENT = merkleTree.getRoot();
const NFT_INIT_INDEX = Field.zero;
const NFT_INIT_ACTIONSHASH = Experimental.Reducer.initialActionsHash;
const NFT_NAME = 'MinaGenesis';
const NFT_SYMBOL = 'MG';

console.log('nft initCommitment: ', NFT_INIT_COMMITMENT.toString());

class NftZkappBatch extends SmartContract {
  // constant supply
  SUPPLY = Field.fromNumber(NFT_SUPPLY);

  reducer = Experimental.Reducer({ actionType: Action });

  @state(RollupState) state = State<RollupState>();

  indexerUrl: string;

  deploy(args: DeployArgs) {
    super.deploy(args);
    this.state.set(
      new RollupState(NFT_INIT_COMMITMENT, NFT_INIT_INDEX, NFT_INIT_ACTIONSHASH)
    );
  }

  name(): CircuitString {
    return CircuitString.fromString(NFT_NAME);
  }

  symbol(): CircuitString {
    return CircuitString.fromString(NFT_SYMBOL);
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
    nft.isAssignedId().assertTrue();

    //TODO: Due to a bug in the decryption of snarkyjs, this assertion is not enabled for the time being
    //nft.checkOwner(senderKey).assertTrue();
    senderKey.toPublicKey().equals(receiver).assertFalse();

    const originalNFTHash = nft.hash();

    //TODO: a bug to fix
    //nft.changeOwner(receiver);

    this.reducer.dispatch(Action.transfer(nft, originalNFTHash));
  }

  @method
  rollup(proof: NftRollupBatchProof) {
    proof.verify();

    let state = this.state.get();
    this.state.assertEquals(state);

    proof.publicInput.source.assertEquals(state);
    this.state.set(proof.publicInput.target);
  }
}
