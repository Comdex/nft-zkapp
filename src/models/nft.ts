import { createEmptyValue } from 'snarky-smt';
import {
  arrayProp,
  CircuitValue,
  Encoding,
  Field,
  isReady,
  Poseidon,
  prop,
  PublicKey,
} from 'snarkyjs';
import { OwnerSecret, OwnerSecretCipherText } from './owner_secret';

await isReady;

export const MAX_CONTENT_LENGTH = 6;

const dummyField = Field.zero;

export class NFT extends CircuitValue {
  @arrayProp(Field, MAX_CONTENT_LENGTH) content: Field[];
  @prop ownerSecret: OwnerSecretCipherText;

  constructor(content: Field[], ownerSecret: OwnerSecretCipherText) {
    super();
    for (let i = content.length; i < MAX_CONTENT_LENGTH; i++) {
      content.push(dummyField);
    }
    this.content = content;
    this.ownerSecret = ownerSecret;
  }

  getNFTString(): string {
    let realStr: Field[] = [];
    for (let i = 0; i < this.content.length; i++) {
      let f = this.content[i];
      if (f.equals(dummyField)) {
        break;
      }
      realStr.push(f);
    }

    return Encoding.Bijective.Fp.toString(realStr);
  }

  static empty(): NFT {
    return createEmptyValue(NFT);
  }

  static generate(str: string, owner: PublicKey): NFT {
    let fs = Encoding.Bijective.Fp.fromString(str);
    if (fs.length > MAX_CONTENT_LENGTH) {
      throw new Error('The character limit is exceeded');
    }

    return new NFT(fs, new OwnerSecret(owner).encrypt());
  }

  hash(): Field {
    return Poseidon.hash(this.toFields());
  }

  clone(): NFT {
    return new NFT(this.content, this.ownerSecret);
  }
}
