import { Experimental, PrivateKey } from 'snarkyjs';
import { NFT } from './models/nft';
import { OwnershipStatement } from './models/ownership_statement';

export { OwnershipProver, OwnershipProverHelper };

let OwnershipProver = Experimental.ZkProgram({
  publicInput: OwnershipStatement as any,

  methods: {
    proveOwnership: {
      privateInputs: [PrivateKey, NFT],

      method(
        statement: OwnershipStatement,
        ownerPrivateKey: PrivateKey,
        ownedNFT: NFT
      ) {
        let ownerPublicKey = ownerPrivateKey.toPublicKey();
        statement.ownerSign
          .verify(ownerPublicKey, statement.statement)
          .assertTrue();
        ownedNFT.id.assertEquals(statement.nftId);
        ownedNFT.hash().assertEquals(statement.nftHash);
        ownedNFT.checkOwner(ownerPrivateKey).assertTrue();
      },
    },
  },
});

let OwnershipProverHelper = {
  proveOwnership(
    statementStr: string,
    ownerPrivateKey: PrivateKey,
    nft: NFT
  ): OwnershipStatement {
    let statement = OwnershipStatement.create(
      statementStr,
      ownerPrivateKey,
      nft
    );
    return statement;
  },
};
