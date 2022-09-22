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

export { NFT, NFTData, DUMMY_NFT_ID };

const DUMMY_NFT_ID = Field.zero;
const DUMMY_DATA_FIELD = Field.zero;
const MAX_CONTENT_LENGTH = 2;

class NFTData extends CircuitValue {
  @arrayProp(Field, MAX_CONTENT_LENGTH) content: Field[];
  @prop ownerSecret: OwnerSecretCipherText;

  constructor(content: Field[], ownerSecret: OwnerSecretCipherText) {
    super();
    for (let i = content.length; i < MAX_CONTENT_LENGTH; i++) {
      content.push(DUMMY_DATA_FIELD);
    }
    this.content = content;
    this.ownerSecret = ownerSecret;
  }

  static generate(str: string, owner: PublicKey): NFTData {
    let fs = Encoding.Bijective.Fp.fromString(str);
    if (fs.length > MAX_CONTENT_LENGTH) {
      throw new Error('The character limit is exceeded');
    }

    return new NFTData(fs, new OwnerSecret(owner).encrypt());
  }

  hash(): Field {
    return Poseidon.hash(this.toFields());
  }

  getNFTString(): string {
    let realStr: Field[] = [];
    for (let i = 0; i < this.content.length; i++) {
      let f = this.content[i];
      if (f.equals(DUMMY_DATA_FIELD)) {
        break;
      }
      realStr.push(f);
    }

    return Encoding.Bijective.Fp.toString(realStr);
  }
}

class NFT extends CircuitValue {
  @prop id: Field;
  @prop data: NFTData;

  private constructor(id: Field, data: NFTData) {
    super();
    this.id = id;
    this.data = data;
  }

  static createNFTwithoutID(str: string, owner: PublicKey): NFT {
    let nftData = NFTData.generate(str, owner);
    return new NFT(DUMMY_NFT_ID, nftData);
  }

  static empty(): NFT {
    return new NFT(DUMMY_NFT_ID, createEmptyValue(NFTData));
  }

  assignId(id: Field): NFT {
    this.id = id;
    return this;
  }

  hash(): Field {
    return Poseidon.hash(this.toFields());
  }

  getNFTString(): string {
    return this.data.getNFTString();
  }
}