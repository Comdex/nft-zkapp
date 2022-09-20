import {
  Bool,
  CircuitValue,
  Field,
  Group,
  Poseidon,
  PrivateKey,
  prop,
  PublicKey,
  Scalar,
} from 'snarkyjs';

export class DTSignature extends CircuitValue {
  @prop r: Field;
  @prop s: Scalar;

  static create(privKey: PrivateKey, msg: Field[]): DTSignature {
    const publicKey = PublicKey.fromPrivateKey(privKey).toGroup();
    const d = privKey.s;
    let kBits = Poseidon.hash(privKey.toFields().concat(msg)).toBits();
    const kPrime = Scalar.ofBits(kBits);
    let { x: r, y: ry } = Group.generator.scale(kPrime);
    const k = ry.toBits()[0].toBoolean() ? kPrime.neg() : kPrime;
    const e = Scalar.ofBits(
      Poseidon.hash(msg.concat([publicKey.x, publicKey.y, r])).toBits()
    );
    const s = e.mul(d).add(k);
    return new DTSignature(r, s);
  }

  verify(publicKey: PublicKey, msg: Field[]): Bool {
    const point = publicKey.toGroup();
    let e = Scalar.ofBits(
      Poseidon.hash(msg.concat([point.x, point.y, this.r])).toBits()
    );
    let r = point.scale(e).neg().add(Group.generator.scale(this.s));
    return Bool.and(r.x.equals(this.r), r.y.toBits()[0].equals(false));
  }
}
