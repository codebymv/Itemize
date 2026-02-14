/**
 * Vault Client-Side Encryption Utilities
 * Uses Web Crypto API for zero-knowledge encryption
 * 
 * When a vault is "locked" with a master password:
 * 1. The master password is used to derive an encryption key using PBKDF2
 * 2. Data is encrypted client-side before being sent to the server
 * 3. The server stores only the encrypted data and cannot decrypt it
 * 4. Only someone with the master password can decrypt the data
 */

// Constants for PBKDF2 key derivation
const PBKDF2_ITERATIONS = 100000; // High iteration count for security
const KEY_LENGTH = 256; // bits for AES-256
const SALT_LENGTH = 16; // bytes
const IV_LENGTH = 12; // bytes for AES-GCM

/**
 * Generate a random salt for key derivation
 * @returns Base64-encoded salt
 */
export function generateSalt(): string {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  return arrayBufferToBase64(salt.buffer);
}

/**
 * Derive an encryption key from a master password using PBKDF2
 * @param password - The master password
 * @param salt - Base64-encoded salt
 * @returns CryptoKey for AES-GCM encryption
 */
export async function deriveKey(password: string, salt: string): Promise<CryptoKey> {
  // Convert password to ArrayBuffer
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);
  
  // Import password as raw key material
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );
  
  // Convert salt from base64
  const saltBuffer = base64ToArrayBuffer(salt);
  
  // Derive the actual encryption key
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: KEY_LENGTH },
    false, // not extractable
    ['encrypt', 'decrypt']
  );
  
  return key;
}

/**
 * Encrypt a plaintext string using AES-GCM
 * @param plaintext - The text to encrypt
 * @param key - CryptoKey from deriveKey()
 * @returns Object with encrypted data and IV (both base64-encoded)
 */
export async function encrypt(plaintext: string, key: CryptoKey): Promise<{ encrypted: string; iv: string }> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);
  
  // Generate random IV
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  
  // Encrypt
  const encryptedBuffer = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv
    },
    key,
    data
  );
  
  return {
    encrypted: arrayBufferToBase64(encryptedBuffer),
    iv: arrayBufferToBase64(iv.buffer)
  };
}

/**
 * Decrypt an encrypted string using AES-GCM
 * @param encryptedBase64 - Base64-encoded encrypted data
 * @param ivBase64 - Base64-encoded initialization vector
 * @param key - CryptoKey from deriveKey()
 * @returns Decrypted plaintext string
 */
export async function decrypt(encryptedBase64: string, ivBase64: string, key: CryptoKey): Promise<string> {
  const encryptedBuffer = base64ToArrayBuffer(encryptedBase64);
  const iv = base64ToArrayBuffer(ivBase64);
  
  const decryptedBuffer = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv
    },
    key,
    encryptedBuffer
  );
  
  const decoder = new TextDecoder();
  return decoder.decode(decryptedBuffer);
}

/**
 * Encrypt multiple vault items with the same key
 * @param items - Array of items with label and value
 * @param password - Master password
 * @param salt - Base64-encoded salt
 * @returns Array of encrypted items
 */
export async function encryptVaultItems(
  items: Array<{ label: string; value: string }>,
  password: string,
  salt: string
): Promise<Array<{ label: string; encrypted: string; iv: string }>> {
  const key = await deriveKey(password, salt);
  
  const encryptedItems = await Promise.all(
    items.map(async (item) => {
      const { encrypted, iv } = await encrypt(item.value, key);
      return {
        label: item.label,
        encrypted,
        iv
      };
    })
  );
  
  return encryptedItems;
}

/**
 * Decrypt multiple vault items with the same key
 * @param items - Array of encrypted items
 * @param password - Master password
 * @param salt - Base64-encoded salt
 * @returns Array of decrypted items
 */
export async function decryptVaultItems(
  items: Array<{ label: string; encrypted: string; iv: string }>,
  password: string,
  salt: string
): Promise<Array<{ label: string; value: string }>> {
  const key = await deriveKey(password, salt);
  
  const decryptedItems = await Promise.all(
    items.map(async (item) => {
      try {
        const value = await decrypt(item.encrypted, item.iv, key);
        return {
          label: item.label,
          value
        };
      } catch (error) {
        // If decryption fails (wrong password), return error placeholder
        return {
          label: item.label,
          value: '[DECRYPTION_FAILED]'
        };
      }
    })
  );
  
  return decryptedItems;
}

/**
 * Verify if a password is correct by attempting to decrypt a known piece of data
 * @param password - Password to verify
 * @param salt - Base64-encoded salt
 * @param testEncrypted - Base64-encoded test ciphertext
 * @param testIv - Base64-encoded test IV
 * @param expectedPlaintext - Expected decrypted value
 * @returns Boolean indicating if password is correct
 */
export async function verifyPassword(
  password: string,
  salt: string,
  testEncrypted: string,
  testIv: string,
  expectedPlaintext: string
): Promise<boolean> {
  try {
    const key = await deriveKey(password, salt);
    const decrypted = await decrypt(testEncrypted, testIv, key);
    return decrypted === expectedPlaintext;
  } catch {
    return false;
  }
}

/**
 * Hash a password for local verification (not for storage - server handles that)
 * This is for quick client-side password validation before attempting decryption
 * @param password - Password to hash
 * @param salt - Base64-encoded salt
 * @returns Base64-encoded hash
 */
export async function hashPasswordForVerification(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return arrayBufferToBase64(hashBuffer);
}

// Utility functions for base64 encoding/decoding

/**
 * Convert ArrayBuffer to base64 string
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert base64 string to ArrayBuffer
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Check if Web Crypto API is available
 */
export function isWebCryptoAvailable(): boolean {
  return typeof crypto !== 'undefined' && 
         typeof crypto.subtle !== 'undefined' &&
         typeof crypto.getRandomValues !== 'undefined';
}

/**
 * Generate a secure random password suggestion
 * @param length - Length of the password
 * @returns Random password string
 */
export function generateSecurePassword(length: number = 16): string {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
  const randomValues = crypto.getRandomValues(new Uint8Array(length));
  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset[randomValues[i] % charset.length];
  }
  return password;
}
