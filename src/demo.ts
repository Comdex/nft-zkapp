import { Encoding, isReady } from "snarkyjs";

await isReady;

let fs = Encoding.Bijective.Fp.fromString(`<svg xmlns="http://www.w3.org/2000/svg" version="1.1"><text x="0" y="15" fill="red"></text></svg>
`);

console.log("fs length: ", fs.length);