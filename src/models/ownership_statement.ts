import {
  arrayProp,
  CircuitValue,
  Encoding,
  Field,
  PrivateKey,
  prop,
  Signature,
} from 'snarkyjs';
import { NFT } from './nft';

export { OwnershipStatement };

const MAX_STRING_FIELD = 8;
class OwnershipStatement extends CircuitValue {
  @arrayProp(Field, MAX_STRING_FIELD) statement: Field[];
  @prop ownerSign: Signature;
  @prop nftId: Field;
  @prop nftHash: Field;

  constructor(
    statement: Field[],
    ownerSign: Signature,
    nftId: Field,
    nftHash: Field
  ) {
    super();
    this.statement = statement;
    this.ownerSign = ownerSign;
    this.nftId = nftId;
    this.nftHash = nftHash;
  }

  static create(statement: string, ownerPrivateKey: PrivateKey, nft: NFT) {
    let statementFs = Encoding.Bijective.Fp.fromString(statement);
    if (statementFs.length > MAX_STRING_FIELD) {
      throw new Error(`Exceeded Fields limit: ${MAX_STRING_FIELD}`);
    }

    let fs = statementFs.concat(
      Array(MAX_STRING_FIELD - statementFs.length).fill(Field(0))
    );

    let sign = Signature.create(ownerPrivateKey, fs);

    return new OwnershipStatement(fs, sign, nft.id, nft.hash());
  }
}
