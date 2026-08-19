const FILE_SIGNATURES: Record<string, (bytes: Uint8Array) => boolean> = {
  "image/jpeg": (bytes) =>
    bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  "image/png": (bytes) =>
    bytes.slice(0, 8).every(
      (value, index) =>
        value === [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a][index],
    ),
  "image/webp": (bytes) =>
    new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
    new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP",
  "application/pdf": (bytes) =>
    new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-",
};

export const allowedPrivateFileMimes = new Set(Object.keys(FILE_SIGNATURES));

export function hasExpectedFileSignature(bytes: Uint8Array, mime: string) {
  return FILE_SIGNATURES[mime]?.(bytes) === true;
}

export async function fileSha256(bytes: Uint8Array) {
  const input = new Uint8Array(bytes.byteLength);
  input.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", input.buffer);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export function safeStorageFileName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .slice(-120) || "arquivo";
}
