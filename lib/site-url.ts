/** Public base URL for OAuth redirects (no trailing slash). */

/** Previous Vercel deployment hostnames → redirect to the current app. */
const LEGACY_PROJECT_HOSTS = new Set([
  "thevault-rachel-higleys-projects.vercel.app",
  "the-vault-gray-five.vercel.app",
]);

const DEFAULT_CANONICAL_ORIGIN = "https://tracy-blueprint.vercel.app";

function normalizeOrigin(value: string): string {
  const trimmed = value.trim().replace(/\/$/, "");
  if (!trimmed) return DEFAULT_CANONICAL_ORIGIN;
  return trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
}

/**
 * Runtime canonical URL (set BLUEPRINT_SITE_URL in Vercel — no rebuild
 * required).
 */
export function getCanonicalSiteUrl(): string | null {
  const raw = process.env.BLUEPRINT_SITE_URL?.trim();
  if (!raw) return null;
  return normalizeOrigin(raw);
}

export function getDefaultCanonicalSiteUrl(): string {
  return getCanonicalSiteUrl() ?? DEFAULT_CANONICAL_ORIGIN;
}

export function isLegacyProjectHost(host: string): boolean {
  return LEGACY_PROJECT_HOSTS.has(host.toLowerCase());
}

function hostFromHeaders(h: { get(name: string): string | null }): string | null {
  const raw = h.get("x-forwarded-host") ?? h.get("host");
  if (!raw) return null;
  const host = raw.split(",")[0]?.trim();
  if (!host || host.startsWith("localhost")) return null;
  return host;
}

/**
 * OAuth and calendar setup use BLUEPRINT_SITE_URL
 * when set, else the request host, else NEXT_PUBLIC_SITE_URL (may be stale
 * until the next build).
 */
export function getSiteUrlFromHeaders(h: { get(name: string): string | null }): string {
  const canonical = getCanonicalSiteUrl();
  if (canonical) return canonical;

  const host = hostFromHeaders(h);
  if (host) {
    const proto =
      h.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? "https";
    return `${proto}://${host}`;
  }
  const env = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "").trim();
  if (env) return env;
  return "http://localhost:3000";
}

/** Env-only URL (cron / background jobs with no request host). */
export function getSiteUrlFromEnv(): string {
  return getCanonicalSiteUrl() ?? getDefaultCanonicalSiteUrl();
}
