import "server-only";

import https from "node:https";
import {
  absoluteSiteUrl,
  resolveSiteUrl,
  type SiteOriginEnv,
} from "@/lib/siteOrigin";

const BREVO_SMTP_URL = "https://api.brevo.com/v3/smtp/email";
const DEFAULT_MAIL_FROM = "NMT.in.ua <noreply@nmt.in.ua>";

export type SendMailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

export type SendMailResult =
  | { ok: true; mode: "brevo" | "log" }
  | { ok: false; error: string };

export type MailSiteEnv = SiteOriginEnv;

export type MailSender = {
  name: string;
  email: string;
};

export const resolveMailSiteUrl = resolveSiteUrl;
export const absoluteUrl = absoluteSiteUrl;

/** `Name <email@domain>` or a bare address. Brevo wants name and email apart. */
export function parseMailFrom(raw: string): MailSender | null {
  const value = raw.trim();
  const wrapped = /^(.*?)<([^<>]+)>$/.exec(value);
  const email = (wrapped ? wrapped[2] : value).trim();
  const name = (wrapped ? wrapped[1] : "").trim().replace(/^["']|["']$/g, "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return { name: name || email, email };
}

export function mailDeliveryMode(
  env: MailSiteEnv = process.env,
): "brevo" | "log" | "unavailable" {
  if (env.BREVO_API_KEY?.trim()) return "brevo";
  if (env.NODE_ENV === "production") return "unavailable";
  return "log";
}

const TRANSIENT_BREVO_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const BREVO_ATTEMPTS = 2;

export type BrevoPostResult = {
  status: number;
  statusText: string;
  raw: string;
};

export type SendMailDeps = {
  /** Test seam. Production does not use global `fetch` — Next patches it. */
  fetchImpl?: (url: string, init: RequestInit) => Promise<Response>;
  /** Test seam for the production transport (`node:https`). */
  postImpl?: (input: {
    body: string;
    headers: Record<string, string>;
  }) => Promise<BrevoPostResult>;
  env?: MailSiteEnv;
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const BREVO_TIMEOUT_MS = 8_000;

/**
 * `node:https`, not global `fetch`. Next's patched fetch is tied to the
 * server-action request. Registration calls `redirect()` as soon as this
 * returns; a body that was only queued, not read, used to die with that
 * request. Resend never redirects, so the same letter left on the second click.
 * The full response is read before this promise resolves.
 */
function postViaHttps(
  body: string,
  headers: Record<string, string>,
): Promise<BrevoPostResult> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (run: () => void) => {
      if (settled) return;
      settled = true;
      run();
    };

    const req = https.request(
      BREVO_SMTP_URL,
      {
        method: "POST",
        headers: {
          ...headers,
          "content-length": String(Buffer.byteLength(body)),
        },
        timeout: BREVO_TIMEOUT_MS,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => {
          chunks.push(chunk);
        });
        res.on("end", () => {
          finish(() =>
            resolve({
              status: res.statusCode ?? 0,
              statusText: res.statusMessage ?? "",
              raw: Buffer.concat(chunks).toString("utf8"),
            }),
          );
        });
      },
    );
    req.on("timeout", () => {
      req.destroy(new Error("Brevo request timed out"));
    });
    req.on("error", (error) => {
      finish(() => reject(error));
    });
    req.end(body);
  });
}

/**
 * Sends transactional email via Brevo when `BREVO_API_KEY` is set.
 * Without a key, local/dev logs the message and returns ok. Production
 * without a key fails closed — otherwise the UI pretends the letter left.
 * One retry covers a reset connection or a transient Brevo status.
 */
export async function sendMail(
  input: SendMailInput,
  deps: SendMailDeps = {},
): Promise<SendMailResult> {
  const to = input.to.trim().toLowerCase();
  if (!to) return { ok: false, error: "missing_to" };

  const env = deps.env ?? process.env;
  const apiKey = env.BREVO_API_KEY?.trim();
  const mode = mailDeliveryMode(env);
  if (mode !== "brevo" || !apiKey) {
    if (mode === "unavailable") {
      console.error("sendMail: BREVO_API_KEY is missing");
      return { ok: false, error: "missing_api_key" };
    }
    console.info(
      "[mail:log]",
      JSON.stringify({
        to,
        subject: input.subject,
        text: input.text ?? null,
        html: input.html,
      }),
    );
    return { ok: true, mode: "log" };
  }

  const fromRaw = env.MAIL_FROM?.trim() || DEFAULT_MAIL_FROM;
  const sender = parseMailFrom(fromRaw);
  if (!sender) {
    console.error("sendMail: MAIL_FROM is not an email address");
    return { ok: false, error: "bad_from" };
  }

  const sleep = deps.sleep ?? defaultSleep;
  const headers = {
    accept: "application/json",
    "content-type": "application/json",
    "api-key": apiKey,
  };
  const body = JSON.stringify({
    sender,
    to: [{ email: to }],
    subject: input.subject,
    htmlContent: input.html,
    ...(input.text ? { textContent: input.text } : {}),
  });

  let lastError = "send_failed";
  for (let attempt = 1; attempt <= BREVO_ATTEMPTS; attempt += 1) {
    try {
      const posted = await postBrevo(body, headers, deps);
      if (posted.status < 200 || posted.status >= 300) {
        const detail = readBrevoError(posted.raw, posted.statusText);
        console.error("sendMail: Brevo error", {
          to,
          status: posted.status,
          detail,
          attempt,
        });
        lastError = "brevo_error";
        if (
          !TRANSIENT_BREVO_STATUS.has(posted.status) ||
          attempt === BREVO_ATTEMPTS
        ) {
          return { ok: false, error: "brevo_error" };
        }
      } else {
        console.info("sendMail: accepted", {
          to,
          messageId: readMessageId(posted.raw),
          attempt,
        });
        return { ok: true, mode: "brevo" };
      }
    } catch (error) {
      console.error("sendMail: unexpected error", { to, attempt, error });
      const message = error instanceof Error ? error.message : "";
      lastError = /timed out/i.test(message) ? "timeout" : "send_failed";
      if (attempt === BREVO_ATTEMPTS) {
        return { ok: false, error: "send_failed" };
      }
    }
    await sleep(200);
  }
  return { ok: false, error: lastError };
}

async function postBrevo(
  body: string,
  headers: Record<string, string>,
  deps: SendMailDeps,
): Promise<BrevoPostResult> {
  if (deps.fetchImpl) {
    const response = await deps.fetchImpl(BREVO_SMTP_URL, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
      headers,
      body,
    });
    return {
      status: response.status,
      statusText: response.statusText,
      raw: await response.text(),
    };
  }
  if (deps.postImpl) return deps.postImpl({ body, headers });
  return postViaHttps(body, headers);
}

function readMessageId(raw: string): string | null {
  try {
    const body = JSON.parse(raw) as { messageId?: unknown };
    if (typeof body.messageId === "string" && body.messageId.trim()) {
      return body.messageId.trim();
    }
  } catch {
    // A 201 with an empty body still means Brevo accepted the letter.
  }
  return null;
}

function readBrevoError(raw: string, statusText: string): string {
  try {
    const body = JSON.parse(raw) as { message?: unknown };
    if (typeof body.message === "string" && body.message.trim()) {
      return body.message.trim();
    }
  } catch {
    // Brevo sometimes returns an empty or non-JSON body.
  }
  return statusText || "brevo_error";
}
