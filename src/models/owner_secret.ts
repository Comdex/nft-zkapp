import {
  Bool,
  Circuit,
  Encryption,
  Field,
  Group,
  isReady,
  PrivateKey,
  PublicKey,
  Struct,
} from 'snarkyjs';

await isReady;

export { OwnerSecret, OwnerSecretCipherText };

class OwnerSecret extends Struct({ owner: PublicKey, blinding: Field }) {
  encrypt(): OwnerSecretCipherText {
    let newFields = OwnerSecret.toFields(this).slice();
    let newPublicKey = PublicKey.fromFields(this.owner.toFields());
    const cipherText = Encryption.encrypt(newFields, newPublicKey);

    return new OwnerSecretCipherText({
      publicKey: [cipherText.publicKey.x, cipherText.publicKey.y],
      cipherText: cipherText.cipherText,
    });
  }
}

const CIPHER_TEXT_LENGTH = OwnerSecret.sizeInFields() + 1;

class OwnerSecretCipherText extends Struct({
  publicKey: Circuit.array(Field, 2),
  cipherText: Circuit.array(Field, CIPHER_TEXT_LENGTH),
}) {
  static create(
    owner: PublicKey,
    blinding: Field = Field.random()
  ): OwnerSecretCipherText {
    return new OwnerSecret({ owner, blinding }).encrypt();
  }

  toPretty(): any {
    return {
      publicKey: this.publicKey.toString(),
      cipherText: this.cipherText.toString(),
    };
  }

  decrypt(ownerPrivateKey: PrivateKey): OwnerSecret {
    let newCipherText: Field[] = this.cipherText.slice();
    let newPublicKey = new Group(this.publicKey[0], this.publicKey[1]);

    const decryptedFields = Encryption.decrypt(
      { publicKey: newPublicKey, cipherText: newCipherText },
      ownerPrivateKey
    );

    return OwnerSecret.fromFields(decryptedFields) as OwnerSecret;
  }

  checkOwner(ownerPrivateKey: PrivateKey): Bool {
    const owner = ownerPrivateKey.toPublicKey();
    const ownerSecret = this.decrypt(ownerPrivateKey);
    return ownerSecret.owner.equals(owner);
  }

  clone(): OwnerSecretCipherText {
    let newCipherText = this.cipherText.slice();
    let newPublicKey = this.publicKey.slice();

    return new OwnerSecretCipherText({
      publicKey: newPublicKey,
      cipherText: newCipherText,
    });
  }
}
