import { CircuitValue, Field, prop } from 'snarkyjs';
import { NFT } from './nft';

export class NFTWithIndex extends CircuitValue {
  @prop index: Field;
  @prop nft: NFT;

  constructor(index: Field, nft: NFT) {
    super();
    this.index = index;
    this.nft = nft;
  }
}
