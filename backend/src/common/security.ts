import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
export function encrypt(value: string, keyHex: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((b) => b.toString('base64')).join('.');
}
export function decrypt(value: string, keyHex: string) {
  const [iv, tag, encrypted] = value.split('.').map((v) => Buffer.from(v, 'base64'));
  const cipher = createDecipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), iv);
  cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(encrypted), cipher.final()]).toString('utf8');
}
