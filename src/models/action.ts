import { createEmptyValue, ProvableMerkleTreeUtils } from 'snarky-smt';
import { Bool, CircuitValue, Field, isReady, prop } from 'snarkyjs';
import { NFT } from './nft';

await isReady;

export { ACTION_TYPE_MINT, ACTION_TYPE_TRANSFER, Action };

const ACTION_TYPE_DUMMY = Field(0);
const ACTION_TYPE_MINT = Field(1);
const ACTION_TYPE_TRANSFER = Field(2);
const DUMMY_ORIGINALNFTHASH = ProvableMerkleTreeUtils.EMPTY_VALUE;

class Action extends CircuitValue {
  @prop type: Field;
  @prop originalNFTHash: Field;
  @prop nft: NFT;

  constructor(type: Field, originalNFTHash: Field, nft: NFT) {
    super();
    this.type = type;
    this.originalNFTHash = originalNFTHash;
    this.nft = nft;
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

  toPretty(): any {
    return {
      type: this.type.toString(),
      nft: this.nft.toPretty(),
      originalNFTHash: this.originalNFTHash.toString(),
    };
  }

  toString(): string {
    return JSON.stringify(this.toPretty());
  }

  static empty(): Action {
    return createEmptyValue(Action);
  }

  static mint(nft: NFT): Action {
    return new Action(ACTION_TYPE_MINT, DUMMY_ORIGINALNFTHASH, nft);
  }

  static transfer(nft: NFT, originalNFTHash: Field) {
    return new Action(ACTION_TYPE_TRANSFER, originalNFTHash, nft);
  }
}
