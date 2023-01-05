# nft-zkapp: a simple private NFT based on mina zkApp

2022-12-21 Update: Refactor the logic of the RollupProver circuit to make the logic easier to understand and reduce the size of the circuit, using the latest snarkyjs version to migrate the data type from CircuitValue to Struct.

2022-11-06 Update: Add OwnershipStatement Prover. Anyone can choose any of their own private NFTs to generate a claim with proof of ownership, which can credibly demonstrate ownership of an NFT on social media without revealing their address.

Update: The reducer feature is no longer used, and zkProgram was used to develop rollup merged proof to prove the legality of state transitions.

## Description

This is a simple NFT project that tries to use snarkyjs's ~~actions/reducer feature~~ and merkle tree. It also uses mina's zk proof to protect the nft's owner address from being public. This project allows you to enter arbitrary short strings to mint nfts, protect your privacy by encrypting your address, and use zero-knowledge proofs to prove your ownership, please note that this is just a proof of concept project as ~~actions/reducer~~(zkProgram) is still an experimental feature and not available on qanet(This project mocks the simple functionality of a nft data indexer locally for testing).

### The main circuit logic

Contract: [src/nft_zkapp.ts](./src/nft_zkapp.ts)

Rollup Prover: [src/rollup_prover.ts](./src/rollup_prover.ts)

Ownership Prover: [src/ownership_prover.ts](./src/ownership_prover.ts)

## Off-chain NFT solution

In fact, the solution shown in this project requires developers or anyone else to run an indexer off-chain (a web service that monitors mina network events to update the merkle tree and provides NFT data and merkle proof data queries to the public).

The main function of this indexer is to monitor the state changes of the contract under the chain, and construct the merkle tree corresponding to the contract by obtaining sequence events from the mina network, and provide users with NFT data query services and merkle proof query services. Since any user can obtain the source code of indexer to run the indexer, get all the event data from mina's archive node and initiate rollup transactions in the contract, so we can consider this solution to be decentralized and permissionless.

![flow](./docs/nftzkapp.png)

## Project Vision

Due to the limitation of single transaction event size and circuit size in mina zkApp, it is difficult for us to use actions/reducer + merkle tree to develop scalable applications that need to use off-chain storage. Therefore, the purpose of this project is to explore a lighter-weight zk application development solution than building a complete rollup chain application by implementing recursive proofs based on Actions + ZkProgram.

For more context and details please refer to: https://github.com/o1-labs/snarkyjs/issues/659#issuecomment-1361320687

## How to build

```sh
npm run build
```

## How to run test

```sh
npm run nft
```

## License

[Apache-2.0](LICENSE)
