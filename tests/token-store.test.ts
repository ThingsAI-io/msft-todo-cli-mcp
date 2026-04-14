import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { encrypt, decrypt, save, load } from '../src/auth/token-store.js';
import type { TokenData } from '../src/types.js';

const sampleTokens: TokenData = {
  accessToken: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.test-access-token',
  refreshToken: 'M.R3_BAY.refresh-token-value-1234567890',
  expiresAt: Date.now() + 3600_000,
  clientId: 'test-client-id-abc123',
  tenant: 'consumers',
};

describe('token-store', () => {
  let tmpDir: string;
  let originalAppData: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'token-store-test-'));
    originalAppData = process.env['APPDATA'];
    // Point APPDATA to tmpDir so save/load use it on Windows
    process.env['APPDATA'] = tmpDir;
  });

  afterEach(() => {
    if (originalAppData !== undefined) {
      process.env['APPDATA'] = originalAppData;
    } else {
      delete process.env['APPDATA'];
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('encrypt/decrypt', () => {
    it('round-trip preserves all TokenData fields exactly', () => {
      const encrypted = encrypt(sampleTokens);
      const decrypted = decrypt(encrypted);
      expect(decrypted).toEqual(sampleTokens);
    });

    it('different TokenData values produce different ciphertexts', () => {
      const tokens2: TokenData = {
        ...sampleTokens,
        accessToken: 'completely-different-access-token',
      };
      const enc1 = encrypt(sampleTokens);
      const enc2 = encrypt(tokens2);
      expect(enc1.toString('hex')).not.toBe(enc2.toString('hex'));
    });

    it('same TokenData produces different ciphertexts (random salt/IV)', () => {
      const enc1 = encrypt(sampleTokens);
      const enc2 = encrypt(sampleTokens);
      expect(enc1.toString('hex')).not.toBe(enc2.toString('hex'));
    });

    it('decrypt with corrupted data throws descriptive error', () => {
      expect(() => decrypt(Buffer.from('not valid json'))).toThrow(/corrupted/i);
    });

    it('decrypt with missing fields throws descriptive error', () => {
      const incomplete = Buffer.from(JSON.stringify({ salt: 'aa', iv: 'bb' }));
      expect(() => decrypt(incomplete)).toThrow(/corrupted/i);
    });

    it('decrypt with tampered ciphertext throws descriptive error', () => {
      const encrypted = encrypt(sampleTokens);
      const stored = JSON.parse(encrypted.toString('utf8'));
      // Tamper with the encrypted data
      stored.data = 'ff'.repeat(32);
      const tampered = Buffer.from(JSON.stringify(stored));
      expect(() => decrypt(tampered)).toThrow(/corrupted|failed/i);
    });
  });

  describe('stored format', () => {
    it('salt, IV, and tag are present and correct lengths', () => {
      const encrypted = encrypt(sampleTokens);
      const stored = JSON.parse(encrypted.toString('utf8'));

      expect(stored).toHaveProperty('salt');
      expect(stored).toHaveProperty('iv');
      expect(stored).toHaveProperty('tag');
      expect(stored).toHaveProperty('data');

      // salt: 16 bytes = 32 hex chars
      expect(stored.salt).toHaveLength(32);
      // iv: 12 bytes = 24 hex chars
      expect(stored.iv).toHaveLength(24);
      // tag: 16 bytes = 32 hex chars (AES-GCM auth tag)
      expect(stored.tag).toHaveLength(32);
    });

    it('encrypted output does NOT contain plaintext token strings', () => {
      const encrypted = encrypt(sampleTokens);
      const content = encrypted.toString('utf8');

      expect(content).not.toContain(sampleTokens.accessToken);
      expect(content).not.toContain(sampleTokens.refreshToken);
      expect(content).not.toContain(sampleTokens.clientId);

      // Also check the hex-encoded data field
      const stored = JSON.parse(content);
      const dataHex = stored.data as string;
      const accessHex = Buffer.from(sampleTokens.accessToken).toString('hex');
      const refreshHex = Buffer.from(sampleTokens.refreshToken).toString('hex');
      expect(dataHex).not.toContain(accessHex);
      expect(dataHex).not.toContain(refreshHex);
    });
  });

  describe('save/load filesystem', () => {
    it('load returns null when file does not exist', () => {
      const result = load();
      expect(result).toBeNull();
    });

    it('save then load round-trip via filesystem', () => {
      save(sampleTokens);
      const loaded = load();
      expect(loaded).toEqual(sampleTokens);
    });

    it('save creates parent directories', () => {
      save(sampleTokens);
      const tokenDir = path.join(tmpDir, 'todo-mcp');
      expect(fs.existsSync(tokenDir)).toBe(true);
    });
  });
});
