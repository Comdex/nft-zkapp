import { createEmptyValue, SMT_EMPTY_VALUE } from 'snarky-smt';
import { Bool, CircuitValue, Field, isReady, prop } from 'snarkyjs';
import { NFT } from './nft';

await isReady;

export { ACTION_TYPE_MINT, ACTION_TYPE_TRANSFER, Action };

const ACTION_TYPE_DUMMY = Field(0);
const ACTION_TYPE_MINT = Field(1);
const ACTION_TYPE_TRANSFER = Field(2);
const DUMMY_ORIGINALNFTHASH = SMT_EMPTY_VALUE;

class Action extends CircuitValue {
  @prop type: Field;
  @prop originalNFTHash: Field;
  @prop nft: NFT;

  constructor(type: Field, nft: NFT, originalNFTHash: Field) {
    super();
    this.type = type;
    this.nft = nft;
    this.originalNFTHash = originalNFTHash;
  }

  isMint(): Bool {
    return this.type.equals(ACTION_TYPE_MINT);
  }

  isTransfer(): Bool {
    return this.type.equals(ACTION_TYPE_TRANSFER);
  }

  isDummyData(): Bool {
    return this.type.equals(ACTION_TYPE_DUMMY);
  }

  toString(): string {
    return JSON.stringify({
      type: this.type.toString(),
      nft: this.nft.toPlainJsObj(),
      originalNFTHash: this.originalNFTHash.toString(),
    });
  }

  static mint(nft: NFT): Action {
    return new Action(ACTION_TYPE_MINT, nft, DUMMY_ORIGINALNFTHASH);
  }

  static transfer(nft: NFT, originalNFTHash: Field) {
    return new Action(ACTION_TYPE_TRANSFER, nft, originalNFTHash);
  }

  static empty(): Action {
    return createEmptyValue(Action);
  }
}
