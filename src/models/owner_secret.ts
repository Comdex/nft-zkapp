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

  constructor(owner: PublicKey, blinding: Field = Field.random()) {
    super();
    this.owner = owner;
    this.blinding = blinding;
  }

  encrypt(): OwnerSecretCipherText {
    let newFields = this.toFields().map((v) => v);
    let newOwner = PublicKey.fromGroup(this.owner.toGroup());
    const cipherText = Encryption.encrypt(newFields, newOwner);

    return new OwnerSecretCipherText(
      cipherText.publicKey,
      cipherText.cipherText
    );
  }
}

const CIPHER_TEXT_LENGTH = OwnerSecret.sizeInFields() + 1;

class OwnerSecretCipherText extends CircuitValue {
  @prop publicKey: Group;
  @arrayProp(Field, CIPHER_TEXT_LENGTH) cipherText: Field[];

  constructor(publicKey: Group, cipherText: Field[]) {
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
      publicKey: this.publicKey.toJSON(),
      cipherText: this.cipherText.toString(),
    };
  }

  decrypt(ownerPrivateKey: PrivateKey): OwnerSecret {
    let newCipherText: Field[] = this.cipherText.map((v) => v);
    let newPublicKey = Group.ofFields([this.publicKey.x, this.publicKey.y]);

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
