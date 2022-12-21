import { createEmptyValue, ProvableMerkleTreeUtils } from 'snarky-smt';
import {
  Bool,
  Circuit,
  Encoding,
  Field,
  isReady,
  Poseidon,
  PrivateKey,
  PublicKey,
  Struct,
} from 'snarkyjs';
import { OwnerSecret, OwnerSecretCipherText } from './owner_secret';

await isReady;

export { NFT, NFTData, DUMMY_NFT_ID, DUMMY_NFT_HASH };

const DUMMY_NFT_ID = Field(0);
const DUMMY_NFT_HASH = ProvableMerkleTreeUtils.EMPTY_VALUE;
const MAX_CONTENT_LENGTH = 2;

class NFTData extends Struct({
  content: Circuit.array(Field, MAX_CONTENT_LENGTH),
}) {
  hash(): Field {
    return Poseidon.hash(NFTData.toFields(this));
  }

  clone(): NFTData {
    let content = this.content.slice();
    return new NFTData({ content });
  }

  getNFTString(): string {
    return Encoding.Bijective.Fp.toString(this.content);
  }

  toPretty(): any {
    return {
      content: this.content.toString(),
    };
  }
}

class NFT extends Struct({
  id: Field,
  ownerSecret: OwnerSecretCipherText,
  data: NFTData,
}) {
  static createNFT(str: string, owner: PublicKey): NFT {
    let fs = Encoding.Bijective.Fp.fromString(str);
    let padFs = fs.concat(Array(MAX_CONTENT_LENGTH - fs.length).fill(Field(0)));
    let data = new NFTData({ content: padFs });
    let blinding = Field.random();
    let ownerSecret = new OwnerSecret({ owner, blinding }).encrypt();
    return new NFT({ id: DUMMY_NFT_ID, ownerSecret, data });
  }

  changeOwner(newOwner: PublicKey) {
    let blinding: Field = Circuit.witness(Field, () => Field.random());
    this.ownerSecret = new OwnerSecret({ owner: newOwner, blinding }).encrypt();
  }

  assignId(id: Field): NFT {
    let newNFT = this.clone();
    newNFT.id = id;
    return newNFT;
  }

  isAssignedId(): Bool {
    return this.id.equals(DUMMY_NFT_ID).not();
  }

  checkOwner(ownerPrivateKey: PrivateKey): Bool {
    // mock
    return Bool(true);
    // return this.ownerSecret.checkOwner(ownerPrivateKey);
  }

  clone(): NFT {
    return new NFT({
      id: this.id,
      ownerSecret: (this.ownerSecret as OwnerSecretCipherText).clone(),
      data: this.data,
    });
  }

  hash(): Field {
    return Poseidon.hash(NFT.toFields(this));
  }

  getNFTString(): string {
    return (this.data as NFTData).getNFTString();
  }

  toPretty(): any {
    return {
      id: this.id.toString(),
      data: (this.data as NFTData).toPretty(),
    };
  }

  static empty(): NFT {
    return createEmptyValue(NFT) as NFT;
  }
}
