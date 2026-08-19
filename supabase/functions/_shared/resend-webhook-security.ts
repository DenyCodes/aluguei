const encoder = new TextEncoder();

const decodeSecret = (secret: string) => {
  const encoded = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  const decoded = atob(encoded);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
};

const encodeBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const constantTimeEqual = (left: string, right: string) => {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
};

type VerifySvixInput = {
  rawBody: string;
  svixId: string;
  svixTimestamp: string;
  svixSignature: string;
  secret: string;
  nowSeconds?: number;
  toleranceSeconds?: number;
};

export async function verifySvixSignature({
  rawBody,
  svixId,
  svixTimestamp,
  svixSignature,
  secret,
  nowSeconds = Math.floor(Date.now() / 1000),
  toleranceSeconds = 5 * 60,
}: VerifySvixInput) {
  if (!rawBody || !svixId || !svixTimestamp || !svixSignature || !secret)
    return false;

  const timestamp = Number(svixTimestamp);
  if (!Number.isInteger(timestamp) || Math.abs(nowSeconds - timestamp) > toleranceSeconds)
    return false;

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      decodeSecret(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signature = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(`${svixId}.${svixTimestamp}.${rawBody}`),
    );
    const expected = encodeBase64(new Uint8Array(signature));
    return svixSignature
      .split(/\s+/)
      .map((candidate) => candidate.split(",", 2))
      .some(
        ([version, value]) =>
          version === "v1" && Boolean(value) && constantTimeEqual(expected, value),
      );
  } catch {
    return false;
  }
}
