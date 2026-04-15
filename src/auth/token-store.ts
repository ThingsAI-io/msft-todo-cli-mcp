import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { TokenData } from '../types.js';

const ALGORITHM = 'aes-256-gcm';
const PBKDF2_ITERATIONS = 100_000;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const DIGEST = 'sha512';

interface StoredData {
  salt: string;
  iv: string;
  tag: string;
  data: string;
}

function deriveKey(salt: Buffer): Buffer {
  const passphrase = os.hostname() + os.userInfo().username;
  return crypto.pbkdf2Sync(passphrase, salt, PBKDF2_ITERATIONS, KEY_LENGTH, DIGEST);
}

function getTokenPath(): string {
  if (process.platform === 'win32') {
    return path.join(process.env['APPDATA'] || '', 'todo-mcp', 'tokens.enc');
  }
  return path.join(os.homedir(), '.config', 'todo-mcp', 'tokens.enc');
}

export function encrypt(data: TokenData): Buffer {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = deriveKey(salt);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const plaintext = JSON.stringify(data);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  const stored: StoredData = {
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    data: encrypted.toString('hex'),
  };

  return Buffer.from(JSON.stringify(stored), 'utf8');
}

export function decrypt(buffer: Buffer): TokenData {
  let stored: StoredData;
  try {
    stored = JSON.parse(buffer.toString('utf8')) as StoredData;
  } catch {
    throw new Error('Token file is corrupted: invalid JSON format');
  }

  if (!stored.salt || !stored.iv || !stored.tag || !stored.data) {
    throw new Error('Token file is corrupted: missing required fields');
  }

  let salt: Buffer, iv: Buffer, tag: Buffer, encrypted: Buffer;
  try {
    salt = Buffer.from(stored.salt, 'hex');
    iv = Buffer.from(stored.iv, 'hex');
    tag = Buffer.from(stored.tag, 'hex');
    encrypted = Buffer.from(stored.data, 'hex');
  } catch {
    throw new Error('Token file is corrupted: invalid hex encoding');
  }

  const key = deriveKey(salt);

  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8')) as TokenData;
  } catch {
    throw new Error('Token decryption failed: data is corrupted or was encrypted on a different machine');
  }
}

export function save(tokens: TokenData): void {
  const filePath = getTokenPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const encrypted = encrypt(tokens);
  fs.writeFileSync(filePath, encrypted, { mode: 0o600 });
}

export function load(): TokenData | null {
  const filePath = getTokenPath();
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const buffer = fs.readFileSync(filePath);
  return decrypt(buffer);
}
