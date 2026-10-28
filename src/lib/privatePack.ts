/**
 * Encrypted private data pack. Customer-confidential history and precedents ship
 * with the public app only as AES-256-GCM ciphertext; the key is derived from
 * Anthony's passcode (PBKDF2-SHA256). Nothing is readable without the passcode.
 */

export interface EncryptedPack {
  format: "orkin-private-pack-encrypted";
  version: 1;
  kdf: "PBKDF2-SHA256";
  iterations: number;
  salt: string; // base64
  iv: string; // base64
  ciphertext: string; // base64
}

const subtle = () => globalThis.crypto.subtle;
const enc = new TextEncoder();

export const normalizePasscode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

const b64 = (u: Uint8Array) => {
  let s = "";
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function key(passcode: string, salt: Uint8Array, iterations: number, usage: KeyUsage[]) {
  const base = await subtle().importKey("raw", enc.encode(normalizePasscode(passcode)), "PBKDF2", false, ["deriveKey"]);
  return subtle().deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations }, base, { name: "AES-GCM", length: 256 }, false, usage);
}

export async function encryptPack(json: string, passcode: string, iterations = 600_000): Promise<EncryptedPack> {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const k = await key(passcode, salt, iterations, ["encrypt"]);
  const ct = new Uint8Array(await subtle().encrypt({ name: "AES-GCM", iv }, k, enc.encode(json)));
  return { format: "orkin-private-pack-encrypted", version: 1, kdf: "PBKDF2-SHA256", iterations, salt: b64(salt), iv: b64(iv), ciphertext: b64(ct) };
}

export class WrongPasscodeError extends Error {}

export async function decryptPack(pack: EncryptedPack, passcode: string): Promise<unknown> {
  const k = await key(passcode, unb64(pack.salt), pack.iterations, ["decrypt"]);
  let plain: ArrayBuffer;
  try {
    plain = await subtle().decrypt({ name: "AES-GCM", iv: unb64(pack.iv) as BufferSource }, k, unb64(pack.ciphertext) as BufferSource);
  } catch {
    throw new WrongPasscodeError("That passcode didn’t unlock your data. Check it and try again.");
  }
  return JSON.parse(new TextDecoder().decode(plain));
}
