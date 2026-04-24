/**
 * AES-256-GCM symmetric encryption for sensitive values stored at rest.
 * CB-5: Shopify access tokens are encrypted before writing to the DB and
 * decrypted on read, so a DB dump does not expose live store credentials.
 *
 * Key derivation: the TOKEN_ENCRYPTION_KEY env var must be a 32-byte
 * hex string (64 hex chars). Generate one with:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * In development, a deterministic fallback key is used so the app starts
 * without configuration. A warning is logged and the app THROWS in production
 * if TOKEN_ENCRYPTION_KEY is not set.
 */

import crypto from "crypto";
import { logger } from "./logger";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // 96-bit IV — recommended for GCM
const TAG_BYTES = 16;

// ─── Key bootstrap ───────────────────────────────────────────────────────────

const DEV_FALLBACK_KEY = "00000000000000000000000000000000000000000000000000000000deadbeef";

function loadKey(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw || raw.trim() === "") {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "TOKEN_ENCRYPTION_KEY must be set in production (32-byte hex string). " +
        'Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
      );
    }
    logger.warn(
      "TOKEN_ENCRYPTION_KEY not set — using insecure dev fallback. " +
      "Set this variable before deploying to production."
    );
    return Buffer.from(DEV_FALLBACK_KEY, "hex");
  }
  const stripped = raw.trim();
  if (!/^[0-9a-fA-F]{64}$/.test(stripped)) {
    throw new Error("TOKEN_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes).");
  }
  return Buffer.from(stripped, "hex");
}

let _key: Buffer | null = null;
function getKey(): Buffer {
  if (!_key) _key = loadKey();
  return _key;
}

// ─── Encrypt / Decrypt ────────────────────────────────────────────────────────

/**
 * Encrypt a plaintext string. Returns a compact base64 string:
 *   <iv:12 bytes><ciphertext><authTag:16 bytes>
 * all concatenated and base64url-encoded.
 */
export function encryptToken(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: base64url( iv || ciphertext || tag )
  return Buffer.concat([iv, encrypted, tag]).toString("base64url");
}

/**
 * Decrypt a value produced by encryptToken. Returns the original plaintext.
 * Throws if the ciphertext has been tampered with (GCM auth tag mismatch).
 */
export function decryptToken(ciphertext: string): string {
  const key = getKey();
  const buf = Buffer.from(ciphertext, "base64url");
  if (buf.length < IV_BYTES + TAG_BYTES + 1) {
    throw new Error("Encrypted token too short — data may be corrupted.");
  }
  const iv = buf.subarray(0, IV_BYTES);
  const tag = buf.subarray(buf.length - TAG_BYTES);
  const encryptedData = buf.subarray(IV_BYTES, buf.length - TAG_BYTES);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encryptedData).toString("utf8") + decipher.final("utf8");
}

/**
 * Transparently decrypt a stored access token.
 * - If the value was encrypted by encryptToken, decrypts and returns the plaintext.
 * - If the value is a legacy plain-text token (pre-encryption migration), returns it as-is.
 * This allows the app to work with both old and new records during migration rollout.
 */
export function resolveAccessToken(storedValue: string): string {
  if (!storedValue) return storedValue;
  if (looksEncrypted(storedValue)) {
    try {
      return decryptToken(storedValue);
    } catch (err) {
      // Decryption failure could mean the value is not actually encrypted (collision with
      // base64url-looking plain text). Fall back to returning as-is and log a warning.
      logger.warn({ err }, "resolveAccessToken: decryption failed — returning value as-is");
      return storedValue;
    }
  }
  // Legacy plaintext token — return unchanged
  return storedValue;
}

/**
 * Returns true if the value looks like one of our encrypted tokens
 * (base64url-encoded blob of at least IV+1byte+tag length).
 * Used to transparently handle legacy plain-text tokens during migration.
 */
export function looksEncrypted(value: string): boolean {
  if (!value) return false;
  try {
    const buf = Buffer.from(value, "base64url");
    return buf.length >= IV_BYTES + TAG_BYTES + 1;
  } catch {
    return false;
  }
}
