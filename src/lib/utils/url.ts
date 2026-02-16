import { z } from "zod";

const HTTPS_URL_SCHEMA = z
  .string()
  .trim()
  .transform((val) => {
    // If the user typed a bare domain like "openai.com", prepend https://
    if (!val.startsWith("http://") && !val.startsWith("https://")) {
      return `https://${val}`;
    }
    return val;
  })
  .pipe(z.string().url("Input must be a valid URL"))
  .refine(
    (val) => {
      const parsed = new URL(val);
      return parsed.protocol === "https:";
    },
    { message: "Only HTTPS URLs are allowed" }
  )
  .refine(
    (val) => {
      const hostname = new URL(val).hostname;
      return !isPrivateHostname(hostname);
    },
    { message: "Private or internal URLs are not allowed" }
  );

/**
 * Returns true if the hostname resolves to a private/internal IP range
 * or is a known internal hostname pattern.
 */
function isPrivateHostname(hostname: string): boolean {
  // Reject localhost and common internal hostnames
  if (
    hostname === "localhost" ||
    hostname === "0.0.0.0" ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    return true;
  }

  // Reject raw IP addresses in private ranges
  const ipv4Match = hostname.match(
    /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/
  );
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number);
    // 10.x.x.x
    if (a === 10) return true;
    // 172.16.x.x - 172.31.x.x
    if (a === 172 && b !== undefined && b >= 16 && b <= 31) return true;
    // 192.168.x.x
    if (a === 192 && b === 168) return true;
    // 127.x.x.x
    if (a === 127) return true;
    // 0.x.x.x
    if (a === 0) return true;
    // 169.254.x.x (link-local)
    if (a === 169 && b === 254) return true;
  }

  // Reject IPv6 loopback
  if (hostname === "[::1]" || hostname === "::1") {
    return true;
  }

  return false;
}

export interface SanitizedUrl {
  /** The fully qualified HTTPS URL */
  url: string;
  /** The hostname extracted from the URL */
  hostname: string;
}

/**
 * Validates and normalizes a user-supplied URL.
 * - Prepends https:// if missing
 * - Rejects non-HTTPS schemes
 * - Rejects private/internal IP ranges
 * - Returns a cleaned URL and hostname
 *
 * Throws a descriptive error if validation fails.
 */
export function sanitizeUrl(input: string): SanitizedUrl {
  const result = HTTPS_URL_SCHEMA.safeParse(input);

  if (!result.success) {
    const firstIssue = result.error.issues[0];
    throw new Error(`Invalid URL: ${firstIssue?.message ?? "Unknown error"}`);
  }

  const parsed = new URL(result.data);

  return {
    url: parsed.origin,
    hostname: parsed.hostname,
  };
}
