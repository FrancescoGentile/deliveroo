//
//
//

import * as crypto from 'crypto';

/**
 * Cryptographer
 *
 * This is a simple wrapper around the NodeJS crypto module.
 * It uses AES-256-CBC to encrypt and decrypt
 */
export class Cryptographer {
  private readonly _cipher: crypto.Cipher;

  private readonly _decipher: crypto.Decipher;

  /**
   * Constructor
   * @param key 32 character key
   * @param seed seed to generate iv
   */
  public constructor(key: string, seed: string) {
    if (key.length !== 32) {
      throw new Error('Key must be 32 characters long.');
    }

    // generate random iv using seed
    const iv = crypto.createHash('sha256').update(seed).digest('hex').slice(0, 16);
    this._cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    this._decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  }

  public encrypt(data: string): string {
    return this._cipher.update(data, 'utf8', 'hex') + this._cipher.final('hex');
  }

  public decrypt(data: string): string {
    return this._decipher.update(data, 'hex', 'utf8') + this._decipher.final('utf8');
  }
}
