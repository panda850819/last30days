import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts as [number, number, number, number];
  return a === 10
    || a === 127
    || a === 0
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 100 && b >= 64 && b <= 127)
    || a >= 224;
}

function mappedIpv4(hostname: string): string | undefined {
  const match = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(hostname);
  if (!match) return undefined;
  const high = Number.parseInt(match[1]!, 16);
  const low = Number.parseInt(match[2]!, 16);
  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
}

function isPrivateIpv6(hostname: string): boolean {
  const lower = hostname.toLowerCase().split("%")[0]!;
  const mapped = mappedIpv4(lower);
  if (mapped) return isPrivateIpv4(mapped);
  return lower === "::" || lower === "::1" || lower.startsWith("fc") || lower.startsWith("fd") || /^fe[89ab]/.test(lower);
}

function isPrivateAddress(address: string): boolean {
  const normalized = address.replace(/^\[|\]$/g, "");
  const version = isIP(normalized);
  return (version === 4 && isPrivateIpv4(normalized)) || (version === 6 && isPrivateIpv6(normalized));
}

export function publicHttpUrl(raw: string): URL | undefined {
  let url: URL;
  try { url = new URL(raw); } catch { return undefined; }
  if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
  if (url.username || url.password) return undefined;
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal")) return undefined;
  if (isPrivateAddress(hostname)) return undefined;
  return url;
}

export async function resolvePublicHttpUrl(raw: string): Promise<URL | undefined> {
  const url = publicHttpUrl(raw);
  if (!url) return undefined;
  if (isIP(url.hostname.replace(/^\[|\]$/g, ""))) return url;
  try {
    const addresses = await lookup(url.hostname, { all: true, verbatim: true });
    if (addresses.length === 0 || addresses.some((entry) => isPrivateAddress(entry.address))) return undefined;
    return url;
  } catch {
    return undefined;
  }
}
