/**
 * Document CSP. Scripts use a per-request nonce (Next reads it from the
 * request `Content-Security-Policy` header and stamps its own tags).
 * Styles stay `'unsafe-inline'`: KaTeX and React `style` attributes are not
 * nonce-bearing elements, and a nonce in `style-src` would make browsers
 * ignore `'unsafe-inline'`.
 */
export function contentSecurityPolicy(nonce: string, dev: boolean): string {
  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    ...(dev ? ["'unsafe-eval'"] : []),
  ].join(" ");

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self' https://secure.wayforpay.com",
    "object-src 'none'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    `script-src ${scriptSrc}`,
    "connect-src 'self'",
  ].join("; ");
}

/** Same generator the Next.js CSP guide uses. The value matches Next's nonce parser. */
export function createRequestNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString("base64");
}
