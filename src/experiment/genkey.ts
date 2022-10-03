import { isReady, PrivateKey } from 'snarkyjs';

await isReady;

let priKey = PrivateKey.random();

console.log('priKey: ', priKey.toBase58());

let pubKey = priKey.toPublicKey();

console.log('pubKey: ', pubKey.toBase58());
