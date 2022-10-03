import {
  AccountUpdate,
  Circuit,
  DeployArgs,
  Experimental,
  Field,
  isReady,
  Mina,
  PrivateKey,
  SmartContract,
  State,
  state,
  Permissions,
  shutdown,
} from 'snarkyjs';

await isReady;

const doProofs = false;

class TestActions extends SmartContract {
  reducer = Experimental.Reducer({ actionType: Field });

  @state(Field) currentActionsHash = State<Field>();

  deploy(args: DeployArgs) {
    super.deploy(args);
    this.currentActionsHash.set(Experimental.Reducer.initialActionsHash);
  }

  commit(f: Field) {
    this.reducer.dispatch(f);
  }

  rollup() {
    let currentActionsHash = this.currentActionsHash.get();
    this.currentActionsHash.assertEquals(currentActionsHash);

    let pendingActions = this.reducer.getActions({
      fromActionHash: currentActionsHash,
    });
    let { actionsHash: newActionsHash } = this.reducer.reduce(
      pendingActions,
      Field,
      // eslint-disable-next-line no-unused-vars
      (curIdx: Field, _: Field) => {
        return curIdx;
      },
      { state: Field.zero, actionsHash: currentActionsHash }
    );

    Circuit.asProver(() => {
      console.log('new actionsHash: ', newActionsHash.toString());
    });
    this.currentActionsHash.set(newActionsHash);
  }
}

let Local = Mina.LocalBlockchain();
Mina.setActiveInstance(Local);

let feePayerKey = Local.testAccounts[0].privateKey;
let callerKey = PrivateKey.fromBase58(
  'EKE51yW4HbYD9Xf1mLAechtFLHM8vRWGqJuowJXDGBy8VbMvTeiZ'
); //Local.testAccounts[1].privateKey;
let callerPublicKey = callerKey.toPublicKey();
let receiverKey = Local.testAccounts[2].privateKey;
let receiverPublicKey = receiverKey.toPublicKey();
let zkappKey = PrivateKey.random();
let zkappAddress = zkappKey.toPublicKey();

async function test() {
  let zkapp = new TestActions(zkappAddress);

  if (doProofs) {
    console.log('start compiling TestActions');
    console.time('TestActions compile');
    await TestActions.compile();
    console.timeEnd('TestActions compile');
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
    zkapp.commit(Field(1));
    if (!doProofs) zkapp.sign(zkappKey);
  });
  if (doProofs) await tx.prove();
  tx.send();

  tx = await Mina.transaction(feePayerKey, () => {
    zkapp.commit(Field(2));
    if (!doProofs) zkapp.sign(zkappKey);
  });
  if (doProofs) await tx.prove();
  tx.send();

  tx = await Mina.transaction(feePayerKey, () => {
    zkapp.commit(Field(3));
    if (!doProofs) zkapp.sign(zkappKey);
  });
  if (doProofs) await tx.prove();
  tx.send();

  tx = await Mina.transaction(feePayerKey, () => {
    zkapp.rollup();
    if (!doProofs) zkapp.sign(zkappKey);
  });
  if (doProofs) await tx.prove();
  tx.send();

  shutdown();
}

await test();
