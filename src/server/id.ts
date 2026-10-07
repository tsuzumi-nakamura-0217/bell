const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
/** 36 の倍数のうち 256 以下で最大の値。これ以上のバイトは捨てて偏りをなくす。 */
const UNBIASED_LIMIT = 252;

export function generateId(length = 10): string {
  let id = "";
  const bytes = new Uint8Array(length * 2);
  while (id.length < length) {
    crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      if (byte < UNBIASED_LIMIT) id += ALPHABET[byte % ALPHABET.length];
      if (id.length === length) break;
    }
  }
  return id;
}
