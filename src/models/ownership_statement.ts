import {
  Circuit,
  Encoding,
  Field,
  PrivateKey,
  Signature,
  Struct,
} from 'snarkyjs';
import { NFT } from './nft';

export { OwnershipStatement };

const MAX_STRING_FIELD = 8;
class OwnershipStatement extends Struct({
  statement: Circuit.array(Field, MAX_STRING_FIELD),
  ownerSign: Signature,
  nftId: Field,
  nftHash: Field,
}) {
  static create(statement: string, ownerPrivateKey: PrivateKey, nft: NFT) {
    let statementFs = Encoding.Bijective.Fp.fromString(statement);
    if (statementFs.length > MAX_STRING_FIELD) {
      throw new Error(`Exceeded Fields limit: ${MAX_STRING_FIELD}`);
    }

    let fs = statementFs.concat(
      Array(MAX_STRING_FIELD - statementFs.length).fill(Field(0))
    );

    let sign = Signature.create(ownerPrivateKey, fs);

    return new OwnershipStatement({
      statement: fs,
      ownerSign: sign,
      nftId: nft.id,
      nftHash: nft.hash(),
    });
  }
}
