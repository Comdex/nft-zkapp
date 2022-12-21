import {
  Bool,
  Circuit,
  Field,
  isReady,
  PrivateKey,
  Provable,
  ProvablePure,
  Struct,
} from 'snarkyjs';
await isReady;

let priKey = PrivateKey.random();

console.log('priKey: ', priKey.toBase58());

let pubKey = priKey.toPublicKey();

console.log('pubKey: ', pubKey.toBase58());

console.log('pow: ', pow(Field(10), Field(5), 20).toString());

function pow(base: Field, exp: Field, expBits: number = 32): Field {
  let r = Field(1);
  let b = exp.toBits(expBits);

  for (let i = 1; i < expBits + 1; i++) {
    r = r.mul(r);
    r = b[expBits - i]
      .toField()
      .mul(r.mul(base))
      .add(
        Field(1)
          .sub(b[expBits - i].toField())
          .mul(r)
      );
  }

  return r;
}
