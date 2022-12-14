import { isReady, PrivateKey, shutdown } from 'snarkyjs';
import { NFT } from '../models/nft';

await isReady;

// let fs = Encoding.Bijective.Fp
//   .fromString(`<svg xmlns="http://www.w3.org/2000/svg" version="1.1"><text x="0" y="15" fill="red"></text></svg>
// `);

// let str = Encoding.Bijective.Fp.toString(fs);

// let data = NFTData.generate('hello world!', PrivateKey.random().toPublicKey());

// console.log('str: ', data.getNFTString());
const str = process.cwd();
console.log('path: ', str);

let priKey = PrivateKey.random();
let pubKey = priKey.toPublicKey();

let nft1 = NFT.createNFT('test1', pubKey);
let nft2 = NFT.createNFT('test2', pubKey);

let check1 = nft1.checkOwner(priKey);
console.log('check1 pass');
let check2 = nft1.checkOwner(priKey);
console.log('check2 pass');
let check3 = nft2.checkOwner(priKey);
console.log('check3 pass');
let check4 = nft2.checkOwner(priKey);
console.log('check4 pass');

console.log(
  `${check1.toString()}, ${check2.toString()}, ${check3.toString()}, ${check4.toString()}`
);

// let tree = await NumIndexSparseMerkleTree.buildNewTree<NFT>(
//   new MemoryStore(),
//   13
// );

// let root = tree.getRoot();

// root = await tree.update(0n, createEmptyValue(NFT));

// console.log('tree root: ', root.toString());

// let a = Field(1);
// let b = a.add(1);
// console.log('a: ', a.toString());
// console.log('b: ', b.toString());

shutdown();

// import {
//   Field,
//   state,
//   State,
//   method,
//   PrivateKey,
//   SmartContract,
//   Experimental,
//   Mina,
//   AccountUpdate,
//   isReady,
//   Permissions,
//   Circuit,
// } from 'snarkyjs';

// await isReady;

// const INCREMENT = Field.one;

// class CounterZkapp extends SmartContract {
//   // the "reducer" field describes a type of action that we can dispatch, and reduce later
//   reducer = Experimental.Reducer({ actionType: Field });

//   // on-chain version of our state. it will typically lag behind the
//   // version that's implicitly represented by the list of actions
//   @state(Field) counter = State<Field>();
//   // helper field to store the point in the action history that our on-chain state is at
//   @state(Field) actionsHash = State<Field>();

//   @method incrementCounter() {
//     this.reducer.dispatch(INCREMENT);
//   }

//   @method rollupIncrements() {
//     // get previous counter & actions hash, assert that they're the same as on-chain values
//     let counter = this.counter.get();
//     this.counter.assertEquals(counter);
//     let actionsHash = this.actionsHash.get();
//     this.actionsHash.assertEquals(actionsHash);

//     // compute the new counter and hash from pending actions
//     let pendingActions = this.reducer.getActions({
//       fromActionHash: actionsHash,
//     });

//     let { state: newCounter, actionsHash: newActionsHash } =
//       this.reducer.reduce(
//         pendingActions,
//         // state type
//         Field,
//         // function that says how to apply an action
//         (state: Field, _action: Field) => {
//           Circuit.asProver(() => {
//             console.log('now state: ', state.toString());
//           });
//           return state.add(1);
//         },
//         { state: counter, actionsHash }
//       );

//     // update on-chain state
//     this.counter.set(newCounter);
//     this.actionsHash.set(newActionsHash);
//   }
// }

// const doProofs = false;
// const initialCounter = Field.zero;

// let Local = Mina.LocalBlockchain();
// Mina.setActiveInstance(Local);

// // a test account that pays all the fees, and puts additional funds into the zkapp
// let feePayer = Local.testAccounts[0].privateKey;

// // the zkapp account
// let zkappKey = PrivateKey.fromBase58(
//   'EKEQc95PPQZnMY9d9p1vq1MWLeDJKtvKj4V75UDG3rjnf32BerWD'
// );
// let zkappAddress = zkappKey.toPublicKey();
// let zkapp = new CounterZkapp(zkappAddress);
// if (doProofs) {
//   console.log('compile');
//   await CounterZkapp.compile();
// }

// console.log('deploy');
// let tx = await Mina.transaction(feePayer, () => {
//   AccountUpdate.fundNewAccount(feePayer);
//   zkapp.deploy({ zkappKey });
//   if (!doProofs) {
//     zkapp.setPermissions({
//       ...Permissions.default(),
//       editState: Permissions.proofOrSignature(),
//       editSequenceState: Permissions.proofOrSignature(),
//     });
//   }
//   zkapp.counter.set(initialCounter);
//   zkapp.actionsHash.set(Experimental.Reducer.initialActionsHash);
// });
// tx.send();

// console.log('applying actions..');

// console.log('action 1');

// tx = await Mina.transaction(feePayer, () => {
//   zkapp.incrementCounter();
//   if (!doProofs) zkapp.sign(zkappKey);
// });
// if (doProofs) await tx.prove();
// tx.send();

// console.log('action 2');
// tx = await Mina.transaction(feePayer, () => {
//   zkapp.incrementCounter();
//   if (!doProofs) zkapp.sign(zkappKey);
// });
// if (doProofs) await tx.prove();
// tx.send();

// console.log('action 3');
// tx = await Mina.transaction(feePayer, () => {
//   zkapp.incrementCounter();
//   if (!doProofs) zkapp.sign(zkappKey);
// });
// if (doProofs) await tx.prove();
// tx.send();

// console.log('rolling up pending actions..');

// console.log('state before: ' + zkapp.counter.get());

// tx = await Mina.transaction(feePayer, () => {
//   zkapp.rollupIncrements();
//   if (!doProofs) zkapp.sign(zkappKey);
// });
// if (doProofs) await tx.prove();
// tx.send();

// console.log('state after rollup: ' + zkapp.counter.get());

// console.log('applying more actions');

// console.log('action 4');
// tx = await Mina.transaction(feePayer, () => {
//   zkapp.incrementCounter();
//   if (!doProofs) zkapp.sign(zkappKey);
// });
// if (doProofs) await tx.prove();
// tx.send();

// console.log('action 5');
// tx = await Mina.transaction(feePayer, () => {
//   zkapp.incrementCounter();
//   if (!doProofs) zkapp.sign(zkappKey);
// });
// if (doProofs) await tx.prove();
// tx.send();

// console.log('rolling up pending actions..');

// console.log('state before: ' + zkapp.counter.get());

// tx = await Mina.transaction(feePayer, () => {
//   zkapp.rollupIncrements();
//   if (!doProofs) zkapp.sign(zkappKey);
// });
// if (doProofs) await tx.prove();
// tx.send();

// console.log('state after rollup: ' + zkapp.counter.get());
