const DEFAULT_ORIGINS = [
  "https://imobiliariaoliveira.vercel.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
];

const normalizeOrigin = (value: string) => value.trim().replace(/\/$/, "");

export function buildAllowedOrigins(siteUrl = "", configuredOrigins = "") {
  return new Set(
    [...DEFAULT_ORIGINS, siteUrl, ...configuredOrigins.split(",")]
      .map(normalizeOrigin)
      .filter(Boolean),
  );
}

export function isAllowedOrigin(
  origin: string | null,
  siteUrl = "",
  configuredOrigins = "",
) {
  if (!origin) return true;
  return buildAllowedOrigins(siteUrl, configuredOrigins).has(
    normalizeOrigin(origin),
  );
}

export function hasElevatedClaims(
  claims: { aal?: unknown; iat?: unknown },
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  if (claims.aal === "aal2") return true;
  const issuedAt = Number(claims.iat);
  if (!Number.isFinite(issuedAt)) return false;
  const ageSeconds = nowSeconds - issuedAt;
  return ageSeconds >= -60 && ageSeconds <= 15 * 60;
}
