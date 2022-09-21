import { SMT_EMPTY_VALUE } from 'snarky-smt';
import { NumIndexSparseMerkleProof } from 'snarky-smt';
import { NumIndexDeepSparseMerkleSubTreeForField } from 'snarky-smt/build/module/lib/deep_subtree';
import {
  Field,
  SmartContract,
  state,
  State,
  method,
  DeployArgs,
  Permissions,
  Experimental,
  PublicKey,
  Circuit,
  Mina,
  PrivateKey,
  AccountUpdate,
  shutdown,
  CircuitString,
  UInt32,
} from 'snarkyjs';
import {
  Action,
  ACTION_TYPE_MINT,
  ACTION_TYPE_TRANSFER,
} from './models/action';
import { NFT } from './models/nft';
import { NFTWithIndex } from './models/nft_with_index';
import { OwnerSecret } from './models/owner_secret';

export { NftZkapp };

const doProofs = true;
const treeHeight = 13;

const initCommitment = Field(
  '16414894720763442886261603851925762864778244212151669304308726942427436045416'
);
const initIndex = Field.zero;
const dummyIdx = Field.zero;
const dummySourceNftHash = SMT_EMPTY_VALUE;
const nftName = 'MinaGenesis';
const nftSymbol = 'MG';

class MerkleProof extends NumIndexSparseMerkleProof(treeHeight) {}

class NftZkapp extends SmartContract {
  MAX_SUPPLY = UInt32.from(8000);

  reducer = Experimental.Reducer({ actionType: Action });

  @state(Field) nftsCommitment = State<Field>();
  @state(Field) currentIndex = State<Field>();
  @state(Field) actionsHash = State<Field>();

  proofStore: Map<bigint, MerkleProof>;

  setProofStore(proofStore: Map<bigint, MerkleProof>) {
    this.proofStore = proofStore;
  }

  deploy(args: DeployArgs) {
    super.deploy(args);
    this.nftsCommitment.set(initCommitment);
    this.currentIndex.set(initIndex);
    this.actionsHash.set(Experimental.Reducer.initialActionsHash);
  }

  name(): CircuitString {
    return CircuitString.fromString(nftName);
  }

  symbol(): CircuitString {
    return CircuitString.fromString(nftSymbol);
  }

  @method
  mint(nft: NFT) {
    this.reducer.dispatch(
      new Action(ACTION_TYPE_MINT, nft, dummyIdx, dummySourceNftHash)
    );
  }

  @method
  transfer(
    receiver: PublicKey,
    nftwithindex: NFTWithIndex,
    senderKey: PrivateKey
  ) {
    let { nft: sourceNft, index } = nftwithindex;
    sourceNft.ownerSecret.checkOwner(senderKey).assertTrue();
    let newNft = sourceNft.clone();
    newNft.ownerSecret = new OwnerSecret(receiver).encrypt();

    this.reducer.dispatch(
      new Action(ACTION_TYPE_TRANSFER, newNft, index, sourceNft.hash())
    );
  }

  @method
  rollup() {
    let nftsCommitment = this.nftsCommitment.get();
    this.nftsCommitment.assertEquals(nftsCommitment);

    let currentIndex = this.currentIndex.get();
    this.currentIndex.assertEquals(currentIndex);

    let actionsHash = this.actionsHash.get();
    this.actionsHash.assertEquals(actionsHash);

    let pendingActions = this.reducer.getActions({
      fromActionHash: actionsHash,
    });

    let actions: Action[] = [];

    let deepSubTree = new NumIndexDeepSparseMerkleSubTreeForField(
      nftsCommitment,
      treeHeight
    );

    let dummyProof = Circuit.witness(MerkleProof, () => {
      let proof = this.proofStore.get(0n);
      if (proof === undefined) {
        throw new Error(`Merkle Proof with index: 0 could not be found`);
      }

      return proof.toConstant();
    });

    deepSubTree.addBranch(dummyProof, SMT_EMPTY_VALUE);

    let { state: newCurrentIndex, actionsHash: newActionsHash } =
      this.reducer.reduce(
        pendingActions,
        Field,
        (nextIndex: Field, action: Action) => {
          actions.push(action);

          let newNextIndex = Circuit.if(
            action.type.equals(ACTION_TYPE_MINT),
            nextIndex.add(1),
            nextIndex
          );
          let index2 = Circuit.if(
            action.type.equals(ACTION_TYPE_TRANSFER),
            action.index,
            newNextIndex
          );

          let finalIndex = Circuit.if(
            index2.gt(this.MAX_SUPPLY.value),
            Field.zero,
            index2
          );

          let merkleProof = Circuit.witness(MerkleProof, () => {
            let indexNum = finalIndex.toBigInt();
            let proof = this.proofStore.get(finalIndex.toBigInt());
            if (proof === undefined) {
              throw new Error(
                `Merkle Proof with index: ${indexNum} could not be found`
              );
            }

            return proof.toConstant();
          });
          deepSubTree.addBranch(merkleProof, action.sourceNftHash);

          return newNextIndex;
        },
        { state: currentIndex, actionsHash }
      );

    let tempCurrentIndex = currentIndex;
    for (let i = 0; i < actions.length; i++) {
      let action = actions[i];
      tempCurrentIndex = Circuit.if(
        action.type.equals(ACTION_TYPE_MINT),
        tempCurrentIndex.add(1),
        tempCurrentIndex
      );

      let finalIndex = Circuit.if(
        action.type.equals(ACTION_TYPE_TRANSFER),
        action.index,
        tempCurrentIndex
      );

      let membershipProof = Circuit.witness(MerkleProof, () => {
        let indexNum = finalIndex.toBigInt();
        let proof = this.proofStore.get(finalIndex.toBigInt());
        if (proof === undefined) {
          throw new Error(
            `Merkle Proof with index: ${indexNum} could not be found`
          );
        }

        return proof.toConstant();
      });

      let [updateIndex, updateNFTHash] = Circuit.if(
        action.type.equals(ACTION_TYPE_MINT),
        Circuit.if(
          finalIndex.gt(this.MAX_SUPPLY.value),
          [Field.zero, SMT_EMPTY_VALUE],
          [finalIndex, action.nft.hash()]
        ),
        // Check whether the transfer is valid
        Circuit.if(
          membershipProof.verifyByFieldInCircuit(
            nftsCommitment,
            action.sourceNftHash
          ),
          [finalIndex, action.nft.hash()],
          [Field.zero, SMT_EMPTY_VALUE]
        )
      );

      deepSubTree.update(updateIndex, updateNFTHash);
    }

    let finalRoot = deepSubTree.getRoot();
    this.nftsCommitment.set(finalRoot);
    this.actionsHash.set(newActionsHash);
    this.currentIndex.set(newCurrentIndex);
  }
}

let Local = Mina.LocalBlockchain();
Mina.setActiveInstance(Local);

let feePayerKey = Local.testAccounts[0].privateKey;
let callerKey = Local.testAccounts[1].privateKey;
let callerPublicKey = callerKey.toPublicKey();
let receiverKey = Local.testAccounts[2].privateKey;
let receiverPublicKey = receiverKey.toPublicKey();
let zkappKey = PrivateKey.random();
let zkappAddress = zkappKey.toPublicKey();

async function test() {
  let zkapp = new NftZkapp(zkappAddress);

  if (doProofs) {
    console.log('start compiling');
    console.time('compile');
    await NftZkapp.compile();
    console.timeEnd('compile');
  }

  console.log('deploying');
  let tx = await Mina.transaction(feePayerKey, () => {
    AccountUpdate.fundNewAccount(feePayerKey);
    zkapp.deploy({ zkappKey });

    if (!doProofs) {
      zkapp.setPermissions({
        ...Permissions.default(),
        editState: Permissions.proofOrSignature(),
        editSequenceState: Permissions.proofOrSignature(),
      });
    }
  });

  if (doProofs) await tx.prove();
  tx.send();
  console.log('deploy done');

  tx = await Mina.transaction(feePayerKey, () => {
    zkapp.mint(NFT.generate('hello world!', receiverPublicKey));
    if (!doProofs) zkapp.sign(zkappKey);
  });
  if (doProofs) await tx.prove();
  tx.send();

  tx = await Mina.transaction(feePayerKey, () => {
    zkapp.mint(NFT.generate('Mina Genesis!', receiverPublicKey));
    if (!doProofs) zkapp.sign(zkappKey);
  });
  if (doProofs) await tx.prove();
  tx.send();

  shutdown();
}

await test();
