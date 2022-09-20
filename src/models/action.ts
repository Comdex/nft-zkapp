import { CircuitValue, Field, isReady, prop } from 'snarkyjs';
import { NFT } from './nft';

await isReady;

export const ACTION_TYPE_MINT = Field(0);
export const ACTION_TYPE_TRANSFER = Field(1);

export class Action extends CircuitValue {
  @prop type: Field;
  @prop oldNFT: NFT;
  @prop newNFT: NFT;
  @prop nftIndex: Field;

  constructor(type: Field, oldNFT: NFT, newNFT: NFT, nftIndex: Field) {
    super();
    this.type = type;
    this.oldNFT = oldNFT;
    this.newNFT = newNFT;
    this.nftIndex = nftIndex;
  }
}
