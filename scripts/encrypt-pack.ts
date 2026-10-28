// Encrypts the private data pack for publishing: PASSCODE=... npx tsx scripts/encrypt-pack.ts <pack.json> public/private-pack.enc.json
import { readFileSync, writeFileSync } from "node:fs";
import { encryptPack } from "../src/lib/privatePack";
const [src, dest] = process.argv.slice(2);
const pass = process.env.PASSCODE;
if (!src || !dest || !pass) throw new Error("usage: PASSCODE=... encrypt-pack.ts <pack.json> <out.json>");
const out = await encryptPack(readFileSync(src, "utf8"), pass);
writeFileSync(dest, JSON.stringify(out));
console.log("encrypted", out.ciphertext.length, "b64 chars");
