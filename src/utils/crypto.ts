//
//
//

import * as crypto from "crypto";

/**
 * Cryptographer
 *
 * This is a simple wrapper around the NodeJS crypto module.
 * It uses AES-256-CBC to encrypt and decrypt
 */
export class Cryptographer {
    private readonly _key: string;

    private readonly _iv: string;

    /**
     * Constructor
     * @param key 32 character key
     * @param seed seed to generate iv
     */
    public constructor(key: string, seed: string) {
        if (key.length !== 32) {
            throw new Error("Key must be 32 characters long.");
        }
        this._key = key;

        // generate random iv using seed
        const iv = crypto
            .createHash("sha256")
            .update(seed)
            .digest("hex")
            .slice(0, 16);
        this._iv = iv;
    }

    public encrypt(data: string): string {
        const cipher = crypto.createCipheriv(
            "aes-256-cbc",
            this._key,
            this._iv,
        );
        return cipher.update(data, "utf8", "hex") + cipher.final("hex");
    }

    public decrypt(data: string): string {
        const decipher = crypto.createDecipheriv(
            "aes-256-cbc",
            this._key,
            this._iv,
        );
        return decipher.update(data, "hex", "utf8") + decipher.final("utf8");
    }
}
