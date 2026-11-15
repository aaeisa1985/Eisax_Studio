import { randomBytes, scryptSync, timingSafeEqual, createHash } from "node:crypto";

const N = 16384;
const KEYLEN = 64;

/** scrypt password hash, format: scrypt$N$salt$hash */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password.normalize("NFKC"), salt, KEYLEN, { N }).toString("hex");
  return `scrypt$${N}$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [scheme, nRaw, salt, hash] = stored.split("$");
    if (scheme !== "scrypt" || !nRaw || !salt || !hash) return false;
    const derived = scryptSync(password.normalize("NFKC"), salt, hash.length / 2, {
      N: Number(nRaw),
    });
    const expected = Buffer.from(hash, "hex");
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Sessions are stored only as SHA-256(token) so DB leaks can't mint sessions. */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
