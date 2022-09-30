import { createEmptyValue } from 'snarky-smt';
import {
  arrayProp,
  Bool,
  CircuitValue,
  Encoding,
  Field,
  isReady,
  Poseidon,
  PrivateKey,
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

  constructor(content: Field[]) {
    super();
    if (content.length > MAX_CONTENT_LENGTH) {
      throw new Error('The character limit is exceeded');
    }
    for (let i = content.length; i < MAX_CONTENT_LENGTH; i++) {
      content.push(DUMMY_DATA_FIELD);
    }
    this.content = content;
  }

  hash(): Field {
    return Poseidon.hash(this.toFields());
  }

  clone(): NFTData {
    let newContent = this.content.map((v) => v);
    return new NFTData(newContent);
  }

  getNFTString(): string {
    let realStr: Field[] = [];
    for (let i = 0; i < this.content.length; i++) {
      let f = this.content[i];
      if (f.equals(DUMMY_DATA_FIELD).toBoolean()) {
        break;
      }
      realStr.push(f);
    }

    return Encoding.Bijective.Fp.toString(realStr);
  }

  toPretty(): any {
    return {
      content: this.content.toString(),
    };
  }
}

class NFT extends CircuitValue {
  @prop id: Field;
  @prop ownerSecret: OwnerSecretCipherText;
  @prop data: NFTData;

  private constructor(
    id: Field,
    ownerSecret: OwnerSecretCipherText,
    data: NFTData
  ) {
    super();
    this.id = id;
    this.ownerSecret = ownerSecret;
    this.data = data;
  }

  static createNFT(str: string, owner: PublicKey): NFT {
    let fs = Encoding.Bijective.Fp.fromString(str);
    let nftData = new NFTData(fs);
    let ownerSecret = new OwnerSecret(owner).encrypt();
    return new NFT(DUMMY_NFT_ID, ownerSecret, nftData);
  }

  changeOwner(newOwner: PublicKey): NFT {
    this.ownerSecret = new OwnerSecret(newOwner).encrypt();
    return this;
  }

  assignId(id: Field): NFT {
    this.id = id;
    return this;
  }

  isAssignedId(): Bool {
    return this.id.equals(DUMMY_NFT_ID).not();
  }

  checkOwner(ownerPrivateKey: PrivateKey): Bool {
    return this.ownerSecret.checkOwner(ownerPrivateKey);
  }

  clone(): NFT {
    return new NFT(this.id, this.ownerSecret.clone(), this.data.clone());
  }

  hash(): Field {
    return Poseidon.hash(this.toFields());
  }

  getNFTString(): string {
    return this.data.getNFTString();
  }

  toPretty(): any {
    return {
      id: this.id.toString(),
      data: this.data.toPretty(),
    };
  }

  static empty(): NFT {
    return createEmptyValue(NFT);
  }
}
