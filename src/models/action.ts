import { createEmptyValue, ProvableMerkleTreeUtils } from 'snarky-smt';
import { Bool, Field, isReady, Struct } from 'snarkyjs';
import { NFT } from './nft';

await isReady;

export { ACTION_TYPE_MINT, ACTION_TYPE_TRANSFER, Action };

const ACTION_TYPE_DUMMY = Field(0);
const ACTION_TYPE_MINT = Field(1);
const ACTION_TYPE_TRANSFER = Field(2);
const DUMMY_ORIGINALNFTHASH = ProvableMerkleTreeUtils.EMPTY_VALUE;

class Action extends Struct({ type: Field, originalNFTHash: Field, nft: NFT }) {
  isMint(): Bool {
    return this.type.equals(ACTION_TYPE_MINT);
  }

  isTransfer(): Bool {
    return this.type.equals(ACTION_TYPE_TRANSFER);
  }

  isDummyData(): Bool {
    return this.type.equals(ACTION_TYPE_DUMMY);
  }

  toPretty(): any {
    return {
      type: this.type.toString(),
      nft: (this.nft as NFT).toPretty(),
      originalNFTHash: this.originalNFTHash.toString(),
    };
  }

  toFields(): Field[] {
    return Action.toFields(this);
  }

  toString(): string {
    return JSON.stringify(this.toPretty());
  }

  static empty(): Action {
    return createEmptyValue(Action) as Action;
  }

  static mint(nft: NFT): Action {
    return new Action({
      type: ACTION_TYPE_MINT,
      originalNFTHash: DUMMY_ORIGINALNFTHASH,
      nft,
    });
  }

  static transfer(nft: NFT, originalNFTHash: Field): Action {
    return new Action({ type: ACTION_TYPE_TRANSFER, originalNFTHash, nft });
  }
}
