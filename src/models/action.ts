import { CircuitValue, Field, isReady, prop } from 'snarkyjs';
import { NFT } from './nft';

await isReady;

export const ACTION_TYPE_MINT = Field(0);
export const ACTION_TYPE_TRANSFER = Field(1);

export class Action extends CircuitValue {
  @prop type: Field;
  @prop nft: NFT;
  @prop index: Field;
  @prop sourceNftHash: Field;

  constructor(type: Field, nft: NFT, index: Field, sourceNftHash: Field) {
    super();
    this.type = type;
    this.nft = nft;
    this.index = index;
    this.sourceNftHash = sourceNftHash;
  }
}
