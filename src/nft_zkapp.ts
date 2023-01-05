import {
  Field,
  SmartContract,
  state,
  State,
  method,
  DeployArgs,
  PublicKey,
  PrivateKey,
  CircuitString,
  Reducer,
  Circuit,
} from 'snarkyjs';

import { Action } from './models/action';
import { NFT } from './models/nft';
import { RollupState } from './models/rollup_state';
import { merkleTree } from './global';
import { NFT_SUPPLY } from './constant';
import { NftRollupProof } from './rollup_prover';

export { NftZkapp, NFT_INIT_INDEX, NFT_INIT_ACTIONSHASH };

const NFT_INIT_COMMITMENT = merkleTree.getRoot();
const NFT_INIT_INDEX = Field(0);
const NFT_INIT_ACTIONSHASH = Reducer.initialActionsHash;
const NFT_NAME = 'MinaGenesis';
const NFT_SYMBOL = 'MG';

console.log('nft initCommitment: ', NFT_INIT_COMMITMENT.toString());

class NftZkapp extends SmartContract {
  // constant supply
  SUPPLY = Field(NFT_SUPPLY);

  reducer = Reducer({ actionType: Action as any });

  @state(RollupState) state = State<RollupState>();

  indexerUrl: string;

  deploy(args: DeployArgs) {
    super.deploy(args);
    this.state.set(
      new RollupState({
        nftsCommitment: NFT_INIT_COMMITMENT,
        currentIndex: NFT_INIT_INDEX,
        currentActionsHash: NFT_INIT_ACTIONSHASH,
      })
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

    // TODO: Due to a bug in the decryption of snarkyjs, this assertion is not enabled for the time being
    // See https://github.com/Comdex/nft-zkapp/issues/5
    // nft.checkOwner(senderKey).assertTrue();
    senderKey.toPublicKey().equals(receiver).assertFalse();

    const originalNFTHash = nft.hash();

    // TODO: A bug to fix, in order to run normally, it can only be commented temporarily
    // See https://github.com/Comdex/nft-zkapp/issues/5 and https://github.com/Comdex/nft-zkapp/issues/6
    // nft.changeOwner(receiver);

    this.reducer.dispatch(Action.transfer(nft, originalNFTHash));
  }

  @method
  rollup(proof: NftRollupProof) {
    proof.verify();

    let state = this.state.get();
    this.state.assertEquals(state);

    this.account.sequenceState.assertEquals(
      proof.publicInput.target.currentActionsHash
    );
    (proof.publicInput.source as RollupState).assertEquals(state);
    this.state.set(proof.publicInput.target as RollupState);
    Circuit.log('circuit-rollup success');
  }
}
