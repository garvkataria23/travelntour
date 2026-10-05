import { createCipheriv, createDecipheriv, randomBytes, scryptSync, timingSafeEqual } from 'crypto';

/**
 * Encryption for the Drive refresh token.
 *
 * WHY THIS EXISTS
 *
 * A Google refresh token grants standing, unattended access to the entire Drive of the account that
 * granted it. Storing that value in plaintext would make a database leak - a stolen backup, a
 * careless `pg_dump`, a compromised admin panel - equivalent to handing over the operator's Google
 * account. That is a strictly worse outcome than losing a backup, so the token is encrypted at rest
 * and this file is the only thing that can read it.
 *
 * FORMAT
 *
 *     v1.<iv>.<authTag>.<ciphertext>     each part base64url
 *
 * The version prefix is not ceremony: when the key is rotated the old token must still be readable,
 * or every connected destination would have to be reconnected. A reader that does not recognise the
 * version refuses rather than guessing.
 *
 * AUTHENTICATED, NOT JUST ENCRYPTED
 *
 * AES-256-GCM, so a tampered ciphertext fails to decrypt rather than yielding attacker-chosen
 * plaintext. With a bare cipher an attacker who could write to the database could steer what the
 * server sends to Google.
 */

const VERSION = 'v1';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;
/** scrypt cost parameters. N=2^15 keeps a single decrypt around 100ms on server hardware. */
const SCRYPT_N = 32768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

export class CredentialVaultError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'KEY_MISSING'
      | 'KEY_MALFORMED'
      | 'MALFORMED_CIPHERTEXT'
      | 'UNKNOWN_VERSION'
      | 'DECRYPT_FAILED',
  ) {
    super(message);
    this.name = 'CredentialVaultError';
  }
}

function base64Url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Buffer {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(padded + '='.repeat((4 - (padded.length % 4)) % 4), 'base64');
}

/**
 * Derives the 32-byte key from the configured secret.
 *
 * A scrypt KDF rather than the secret bytes directly, so that a weak or short passphrase still
 * produces a full-strength key. The salt is a constant: this is not a password store, the secret
 * comes from the environment, and using a random salt here would make the derived key depend on
 * data that must be identical on every node in a multi-instance deployment.
 */
function deriveKey(secret: string): Buffer {
  return scryptSync(secret.normalize('NFKC'), 'flyconnect-backup-credential-v1', KEY_BYTES, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 128 * SCRYPT_N * SCRYPT_R * 2,
  });
}

/**
 * Encrypts a secret for storage.
 *
 * @throws CredentialVaultError when no key is configured. Deliberately fatal rather than falling
 * back to plaintext: a silent fallback is how a refresh token ends up in the database unencrypted.
 */
export function encryptSecret(plaintext: string, env: NodeJS.ProcessEnv = process.env): string {
  const secret = env.BACKUP_TOKEN_ENCRYPTION_KEY;
  if (!secret || !secret.trim()) {
    throw new CredentialVaultError(
      'BACKUP_TOKEN_ENCRYPTION_KEY is not set. A Drive refresh token cannot be stored unencrypted.',
      'KEY_MISSING',
    );
  }
  if (secret.trim().length < 16) {
    throw new CredentialVaultError(
      'BACKUP_TOKEN_ENCRYPTION_KEY must be at least 16 characters.',
      'KEY_MALFORMED',
    );
  }

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [VERSION, base64Url(iv), base64Url(tag), base64Url(ciphertext)].join('.');
}

/**
 * Decrypts a value produced by `encryptSecret`.
 *
 * @throws CredentialVaultError on any tampering, truncation or unknown version. Never returns
 * partial or garbage output, because the caller would then present it to Google.
 */
export function decryptSecret(payload: string, env: NodeJS.ProcessEnv = process.env): string {
  const secret = env.BACKUP_TOKEN_ENCRYPTION_KEY;
  if (!secret || !secret.trim()) {
    throw new CredentialVaultError(
      'BACKUP_TOKEN_ENCRYPTION_KEY is not set, so an encrypted token cannot be read.',
      'KEY_MISSING',
    );
  }

  const parts = payload.split('.');
  if (parts.length !== 4) {
    throw new CredentialVaultError(
      'Encrypted value is malformed (expected v1.iv.tag.ciphertext).',
      'MALFORMED_CIPHERTEXT',
    );
  }
  const [version, ivPart, tagPart, dataPart] = parts as [string, string, string, string];
  if (version !== VERSION) {
    throw new CredentialVaultError(
      `Unsupported ciphertext version "${version}". Reconnect the destination.`,
      'UNKNOWN_VERSION',
    );
  }

  try {
    const iv = fromBase64Url(ivPart);
    const tag = fromBase64Url(tagPart);
    const data = fromBase64Url(dataPart);
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
      throw new Error('bad iv/tag length');
    }
    const decipher = createDecipheriv('aes-256-gcm', deriveKey(secret), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    // GCM auth failure and malformed input are indistinguishable by design. Both mean the value
    // cannot be trusted, so neither is reported with detail an attacker could act on.
    throw new CredentialVaultError(
      'Could not decrypt the stored credential. The encryption key may have changed, or the value was tampered with.',
      'DECRYPT_FAILED',
    );
  }
}

/**
 * Constant-time string comparison.
 *
 * Used where a boolean decision depends on a secret, so the comparison does not leak its
 * position through timing.
 */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}