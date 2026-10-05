import {
  CredentialVaultError,
  decryptSecret,
  encryptSecret,
  safeEqual,
} from './credential-vault';

const KEY = 'a-sufficiently-long-test-key-value';

describe('credential-vault', () => {
  describe('round trip', () => {
    it('recovers the original secret', () => {
      const token = 'ya29.refresh-token-value';
      const sealed = encryptSecret(token, { BACKUP_TOKEN_ENCRYPTION_KEY: KEY } as NodeJS.ProcessEnv);

      expect(decryptSecret(sealed, { BACKUP_TOKEN_ENCRYPTION_KEY: KEY } as NodeJS.ProcessEnv)).toBe(
        token,
      );
    });

    it('handles an empty string, a very long token, and unicode', () => {
      const env = { BACKUP_TOKEN_ENCRYPTION_KEY: KEY } as NodeJS.ProcessEnv;
      for (const value of ['', 'x'.repeat(5000), 'टोकन-🔐-ok']) {
        expect(decryptSecret(encryptSecret(value, env), env)).toBe(value);
      }
    });

    it('is not reversible with the wrong key', () => {
      const sealed = encryptSecret('refresh-token', {
        BACKUP_TOKEN_ENCRYPTION_KEY: KEY,
      } as NodeJS.ProcessEnv);

      expect(() =>
        decryptSecret(sealed, { BACKUP_TOKEN_ENCRYPTION_KEY: `${KEY}-different` } as NodeJS.ProcessEnv),
      ).toThrow(CredentialVaultError);
    });

    it('does not leak the plaintext into the ciphertext', () => {
      const token = 'ya29.super-secret-refresh-token';
      const sealed = encryptSecret(token, { BACKUP_TOKEN_ENCRYPTION_KEY: KEY } as NodeJS.ProcessEnv);

      expect(sealed).not.toContain(token);
      expect(sealed).not.toContain('ya29');
    });
  });

  describe('randomness', () => {
    it('produces a different ciphertext each time', () => {
      // A fixed IV would be a serious weakness: identical plaintexts would be identical ciphertexts,
      // which leaks that two tenants hold the same token and enables offline analysis.
      const env = { BACKUP_TOKEN_ENCRYPTION_KEY: KEY } as NodeJS.ProcessEnv;
      const a = encryptSecret('same-token', env);
      const b = encryptSecret('same-token', env);

      expect(a).not.toBe(b);
      // Both still read back correctly.
      expect(decryptSecret(a, env)).toBe('same-token');
      expect(decryptSecret(b, env)).toBe('same-token');
    });
  });

  describe('tamper detection', () => {
    it('rejects a ciphertext whose body was modified', () => {
      const env = { BACKUP_TOKEN_ENCRYPTION_KEY: KEY } as NodeJS.ProcessEnv;
      const [version, iv, tag, data] = encryptSecret('refresh-token', env).split('.');

      // Flip a byte in the ciphertext.
      const flipped = Buffer.from(data!, 'base64url');
      flipped[0] = flipped[0]! ^ 0xff;
      const tampered = [version, iv, tag, flipped.toString('base64url')].join('.');

      expect(() => decryptSecret(tampered, env)).toThrow(/decrypt|tampered/i);
    });

    it('rejects a ciphertext whose auth tag was modified', () => {
      const env = { BACKUP_TOKEN_ENCRYPTION_KEY: KEY } as NodeJS.ProcessEnv;
      const [version, iv, tag, data] = encryptSecret('refresh-token', env).split('.');
      const tamperedTag = Buffer.from(tag!, 'base64url');
      tamperedTag[0] = tamperedTag[0]! ^ 0xff;

      expect(() =>
        decryptSecret([version, iv, tamperedTag.toString('base64url'), data].join('.'), env),
      ).toThrow(CredentialVaultError);
    });

    it('rejects a truncated value instead of returning garbage', () => {
      const env = { BACKUP_TOKEN_ENCRYPTION_KEY: KEY } as NodeJS.ProcessEnv;
      const sealed = encryptSecret('refresh-token', env);

      expect(() => decryptSecret(sealed.slice(0, sealed.length - 8), env)).toThrow(
        CredentialVaultError,
      );
      expect(() => decryptSecret('', env)).toThrow(CredentialVaultError);
      expect(() => decryptSecret('not-a-sealed-value', env)).toThrow(/malformed/i);
    });

    it('refuses an unknown version rather than guessing', () => {
      const env = { BACKUP_TOKEN_ENCRYPTION_KEY: KEY } as NodeJS.ProcessEnv;
      const sealed = encryptSecret('refresh-token', env).split('.');
      sealed[0] = 'v9';

      const err = (() => {
        try {
          decryptSecret(sealed.join('.'), env);
          return null;
        } catch (e) {
          return e as CredentialVaultError;
        }
      })();

      expect(err).toBeInstanceOf(CredentialVaultError);
      expect(err?.code).toBe('UNKNOWN_VERSION');
    });
  });

  describe('refusing to run without a key', () => {
    // The failure mode this prevents is the dangerous one: silently falling back to plaintext so
    // that "saving a credential" always succeeds.
    it('refuses to encrypt when no key is configured', () => {
      const err = (() => {
        try {
          encryptSecret('token', {} as NodeJS.ProcessEnv);
          return null;
        } catch (e) {
          return e as CredentialVaultError;
        }
      })();

      expect(err).toBeInstanceOf(CredentialVaultError);
      expect(err?.code).toBe('KEY_MISSING');
      expect(err?.message).toMatch(/cannot be stored unencrypted/i);
    });

    it('refuses to encrypt with a short key', () => {
      expect(() => encryptSecret('token', { BACKUP_TOKEN_ENCRYPTION_KEY: 'short' } as NodeJS.ProcessEnv)).toThrow(
        /at least 16/,
      );
    });

    it('refuses to decrypt when no key is configured', () => {
      expect(() => decryptSecret('v1.a.b.c', {} as NodeJS.ProcessEnv)).toThrow(/BACKUP_TOKEN_ENCRYPTION_KEY/);
    });

    it('treats a whitespace-only key as missing', () => {
      expect(() => encryptSecret('token', { BACKUP_TOKEN_ENCRYPTION_KEY: '   ' } as NodeJS.ProcessEnv)).toThrow(
        /not set/i,
      );
    });
  });

  describe('safeEqual', () => {
    it('is true for identical strings and false otherwise', () => {
      expect(safeEqual('abc', 'abc')).toBe(true);
      expect(safeEqual('abc', 'abd')).toBe(false);
      expect(safeEqual('abc', 'abcd')).toBe(false);
      expect(safeEqual('', '')).toBe(true);
    });
  });
});