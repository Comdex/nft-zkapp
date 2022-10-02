import {
  arrayProp,
  Bool,
  Circuit,
  CircuitValue,
  Encryption,
  Field,
  Group,
  isReady,
  PrivateKey,
  prop,
  PublicKey,
} from 'snarkyjs';

await isReady;

export { OwnerSecret, OwnerSecretCipherText };

class OwnerSecret extends CircuitValue {
  @prop owner: PublicKey;
  @prop blinding: Field; //random number

  constructor(owner: PublicKey, blinding: Field) {
    super();
    this.owner = owner;
    this.blinding = blinding;
  }

  encrypt(): OwnerSecretCipherText {
    let newFields = this.toFields().map((v) => v);
    let newPublicKey = PublicKey.ofFields(this.owner.toFields());
    const cipherText = Encryption.encrypt(newFields, newPublicKey);
    Circuit.asProver(() => {
      console.log('encrypt success');
    });
    return new OwnerSecretCipherText(
      [cipherText.publicKey.x, cipherText.publicKey.y],
      cipherText.cipherText
    );
  }
}

const CIPHER_TEXT_LENGTH = OwnerSecret.sizeInFields() + 1;

class OwnerSecretCipherText extends CircuitValue {
  @arrayProp(Field, 2) publicKey: Field[];
  @arrayProp(Field, CIPHER_TEXT_LENGTH) cipherText: Field[];

  constructor(publicKey: Field[], cipherText: Field[]) {
    super();
    this.publicKey = publicKey;
    this.cipherText = cipherText;
  }

  static create(
    owner: PublicKey,
    blinding: Field = Field.random()
  ): OwnerSecretCipherText {
    return new OwnerSecret(owner, blinding).encrypt();
  }

  toPlainJsObj(): any {
    return {
      publicKey: this.publicKey.toString(),
      cipherText: this.cipherText.toString(),
    };
  }

  decrypt(ownerPrivateKey: PrivateKey): OwnerSecret {
    let newCipherText: Field[] = this.cipherText.map((v) => v);
    let newPublicKey = new Group(this.publicKey[0], this.publicKey[1]);

    const decryptedFields = Encryption.decrypt(
      { publicKey: newPublicKey, cipherText: newCipherText },
      ownerPrivateKey
    );

    Circuit.asProver(() => {
      console.log('decrypt success');
    });
    return OwnerSecret.ofFields(decryptedFields);
  }

  checkOwner(ownerPrivateKey: PrivateKey): Bool {
    const owner = ownerPrivateKey.toPublicKey();
    const ownerSecret = this.decrypt(ownerPrivateKey);
    return ownerSecret.owner.equals(owner);
  }

  clone(): OwnerSecretCipherText {
    let newCipherText: Field[] = [];
    this.cipherText.forEach((v) => {
      newCipherText.push(v);
    });

    return new OwnerSecretCipherText(this.publicKey, newCipherText);
  }
}
