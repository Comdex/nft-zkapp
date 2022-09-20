import {
  arrayProp,
  CircuitValue,
  Field,
  isReady,
  prop,
  PublicKey,
} from 'snarkyjs';

await isReady;

export const MAX_CONTENT_LENGTH = 8;

export class NFT extends CircuitValue {
  @arrayProp(Field, MAX_CONTENT_LENGTH) content: Field[];
  @prop owner: PublicKey;

  constructor(content: Field[], owner: PublicKey) {
    super();
    this.content = content;
    this.owner = owner;
  }

  static empty(): NFT {
    return new NFT(
      new Array(MAX_CONTENT_LENGTH).fill(Field.zero),
      PublicKey.empty()
    );
  }

  clone(): NFT {
    return new NFT(this.content, this.owner);
  }
}
