import { CircuitValue, isReady, prop, PublicKey } from 'snarkyjs';
import { DTSignature } from '../dt_signature';

await isReady;

export class OwnerSecretWithPublicKey extends CircuitValue {
  @prop publicKey: PublicKey;
  @prop sign: DTSignature;

  constructor(publicKey: PublicKey, sign: DTSignature) {
    super();
    this.publicKey = publicKey;
    this.sign = sign;
  }
}
