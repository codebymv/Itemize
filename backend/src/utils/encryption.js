/**
 * Encryption Utilities for Vault
 * Uses AES-256-GCM for authenticated encryption
 */
const crypto = require('crypto');
const { logger } = require('./logger');

// Encryption algorithm and key length
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits
const KEY_LENGTH = 32; // 256 bits

/**
 * Get the encryption key from environment variable
 * Key should be a 64-character hex string (32 bytes)
 * @returns {Buffer} The encryption key as a buffer
 */
const getEncryptionKey = () => {
    const keyHex = process.env.VAULT_ENCRYPTION_KEY;
    
    if (!keyHex) {
        // Generate a warning but provide a fallback for development
        // In production, this should always be set
        if (process.env.NODE_ENV === 'production') {
            logger.error('VAULT_ENCRYPTION_KEY is not set in production!');
            throw new Error('VAULT_ENCRYPTION_KEY environment variable is required in production');
        }
        
        // Development fallback - generate a consistent key from JWT_SECRET
        logger.warn('VAULT_ENCRYPTION_KEY not set, deriving from JWT_SECRET (not recommended for production)');
        const jwtSecret = process.env.JWT_SECRET || 'development-secret';
        return crypto.createHash('sha256').update(jwtSecret).digest();
    }
    
    // Validate key length (should be 64 hex characters = 32 bytes)
    if (keyHex.length !== 64) {
        throw new Error('VAULT_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)');
    }
    
    return Buffer.from(keyHex, 'hex');
};

/**
 * Encrypt a plaintext string using AES-256-GCM
 * @param {string} plaintext - The text to encrypt
 * @returns {{ encrypted: string, iv: string }} The encrypted data and IV (both base64 encoded)
 */
const encrypt = (plaintext) => {
    try {
        const key = getEncryptionKey();
        const iv = crypto.randomBytes(IV_LENGTH);
        
        const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
            authTagLength: AUTH_TAG_LENGTH
        });
        
        let encrypted = cipher.update(plaintext, 'utf8', 'base64');
        encrypted += cipher.final('base64');
        
        // Get the authentication tag
        const authTag = cipher.getAuthTag();
        
        // Combine encrypted data with auth tag
        const combined = Buffer.concat([
            Buffer.from(encrypted, 'base64'),
            authTag
        ]);
        
        return {
            encrypted: combined.toString('base64'),
            iv: iv.toString('base64')
        };
    } catch (error) {
        logger.error('Encryption error', { error: error.message });
        throw new Error('Failed to encrypt data');
    }
};

/**
 * Decrypt an encrypted string using AES-256-GCM
 * @param {string} encryptedBase64 - The encrypted data (base64 encoded, includes auth tag)
 * @param {string} ivBase64 - The initialization vector (base64 encoded)
 * @returns {string} The decrypted plaintext
 */
const decrypt = (encryptedBase64, ivBase64) => {
    try {
        const key = getEncryptionKey();
        const iv = Buffer.from(ivBase64, 'base64');
        const encryptedBuffer = Buffer.from(encryptedBase64, 'base64');
        
        // Split encrypted data and auth tag
        const authTag = encryptedBuffer.slice(-AUTH_TAG_LENGTH);
        const encrypted = encryptedBuffer.slice(0, -AUTH_TAG_LENGTH);
        
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
            authTagLength: AUTH_TAG_LENGTH
        });
        
        decipher.setAuthTag(authTag);
        
        let decrypted = decipher.update(encrypted, undefined, 'utf8');
        decrypted += decipher.final('utf8');
        
        return decrypted;
    } catch (error) {
        logger.error('Decryption error', { error: error.message });
        throw new Error('Failed to decrypt data - data may be corrupted or tampered with');
    }
};

/**
 * Generate a random encryption key (for initial setup)
 * @returns {string} A 64-character hex string suitable for VAULT_ENCRYPTION_KEY
 */
const generateEncryptionKey = () => {
    return crypto.randomBytes(KEY_LENGTH).toString('hex');
};

/**
 * Hash a master password for storage
 * Uses bcrypt with 12 rounds
 * @param {string} password - The master password
 * @returns {Promise<string>} The hashed password
 */
const hashMasterPassword = async (password) => {
    const bcrypt = require('bcryptjs');
    return bcrypt.hash(password, 12);
};

/**
 * Verify a master password against a stored hash
 * @param {string} password - The password to verify
 * @param {string} hash - The stored hash
 * @returns {Promise<boolean>} Whether the password is correct
 */
const verifyMasterPassword = async (password, hash) => {
    const bcrypt = require('bcryptjs');
    return bcrypt.compare(password, hash);
};

/**
 * Generate a salt for client-side key derivation
 * @returns {string} A base64-encoded salt
 */
const generateSalt = () => {
    return crypto.randomBytes(16).toString('base64');
};

/**
 * Re-encrypt a value with a new key (for key rotation)
 * @param {string} encryptedBase64 - The currently encrypted data
 * @param {string} ivBase64 - The current IV
 * @param {Buffer} oldKey - The old encryption key
 * @param {Buffer} newKey - The new encryption key
 * @returns {{ encrypted: string, iv: string }} The re-encrypted data
 */
const reEncrypt = (encryptedBase64, ivBase64, oldKey, newKey) => {
    // Decrypt with old key
    const iv = Buffer.from(ivBase64, 'base64');
    const encryptedBuffer = Buffer.from(encryptedBase64, 'base64');
    
    const authTag = encryptedBuffer.slice(-AUTH_TAG_LENGTH);
    const encrypted = encryptedBuffer.slice(0, -AUTH_TAG_LENGTH);
    
    const decipher = crypto.createDecipheriv(ALGORITHM, oldKey, iv, {
        authTagLength: AUTH_TAG_LENGTH
    });
    decipher.setAuthTag(authTag);
    
    let plaintext = decipher.update(encrypted, undefined, 'utf8');
    plaintext += decipher.final('utf8');
    
    // Re-encrypt with new key
    const newIv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, newKey, newIv, {
        authTagLength: AUTH_TAG_LENGTH
    });
    
    let newEncrypted = cipher.update(plaintext, 'utf8', 'base64');
    newEncrypted += cipher.final('base64');
    
    const newAuthTag = cipher.getAuthTag();
    const combined = Buffer.concat([
        Buffer.from(newEncrypted, 'base64'),
        newAuthTag
    ]);
    
    return {
        encrypted: combined.toString('base64'),
        iv: newIv.toString('base64')
    };
};

module.exports = {
    encrypt,
    decrypt,
    generateEncryptionKey,
    hashMasterPassword,
    verifyMasterPassword,
    generateSalt,
    reEncrypt,
    ALGORITHM,
    IV_LENGTH,
    KEY_LENGTH
};
