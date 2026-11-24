/** Public host that must not be indexed. Apex is https://nmt.in.ua. */
const WWW_HOST = "www.nmt.in.ua";
const APEX_ORIGIN = "https://nmt.in.ua";

function headerValues(headers, name) {
  if (!headers) return [];
  const raw = headers[name] ?? headers[name.toLowerCase()];
  if (raw == null) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  return list.flatMap((item) => String(item).split(","));
}

/** Hostname without port. `www.nmt.in.ua:443` and `WWW.nmt.in.ua` both match. */
function hostnameOf(value) {
  const trimmed = String(value).trim().toLowerCase();
  if (!trimmed) return "";
  return trimmed.replace(/:\d+$/, "");
}

/**
 * True when the browser asked for www. The panel proxy may leave Host as the
 * loopback upstream and put the public host in X-Forwarded-Host.
 */
function isWwwHost(headers) {
  const names = [
    ...headerValues(headers, "x-forwarded-host"),
    ...headerValues(headers, "host"),
  ].map(hostnameOf);
  return names.includes(WWW_HOST);
}

/** Path and query as received. Rejects absolute and protocol-relative URLs. */
function requestPath(rawUrl) {
  const raw = typeof rawUrl === "string" ? rawUrl : "";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return "/";
  if (raw.includes("\r") || raw.includes("\n")) return "/";
  const hash = raw.indexOf("#");
  return (hash === -1 ? raw : raw.slice(0, hash)) || "/";
}

/**
 * Absolute https URL on the apex, or null when this request is not for www.
 * Query string is copied as-is (`?plan=a%20b` stays encoded).
 */
function wwwRedirectLocation(headers, rawUrl) {
  if (!isWwwHost(headers)) return null;
  return `${APEX_ORIGIN}${requestPath(rawUrl)}`;
}

module.exports = {
  APEX_ORIGIN,
  WWW_HOST,
  wwwRedirectLocation,
};
