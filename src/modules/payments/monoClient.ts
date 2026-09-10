import {
  MONO_CCY_UAH,
  TEACHER_FEE_KOPIYKY,
  isSafeCheckoutUrl,
} from "./constants";
import {
  readMonoAcquiringConfig,
  type MonoAcquiringConfig,
} from "./config";

export class MonoClientError extends Error {
  constructor(
    message: string,
    public readonly code: "not_configured" | "http_error" | "invalid_response",
  ) {
    super(message);
    this.name = "MonoClientError";
  }
}

export type CreateMonoInvoiceInput = {
  reference: string;
  redirectUrl: string;
  webHookUrl: string;
  destination?: string;
  amountKopiyky?: number;
  ccy?: number;
};

export type MonoInvoice = {
  invoiceId: string;
  pageUrl: string;
};

export type CreateMonoInvoiceDeps = {
  getConfig?: () => MonoAcquiringConfig;
  fetch?: typeof fetch;
};

const DEFAULT_DESTINATION = "Кабінет викладача nmt.in.ua";

export function buildMonoInvoiceRequestBody(input: CreateMonoInvoiceInput): {
  amount: number;
  ccy: number;
  merchantPaymInfo: { reference: string; destination: string };
  redirectUrl: string;
  webHookUrl: string;
  validity: number;
} {
  return {
    amount: input.amountKopiyky ?? TEACHER_FEE_KOPIYKY,
    ccy: input.ccy ?? MONO_CCY_UAH,
    merchantPaymInfo: {
      reference: input.reference,
      destination: input.destination ?? DEFAULT_DESTINATION,
    },
    redirectUrl: input.redirectUrl,
    webHookUrl: input.webHookUrl,
    validity: 3600,
  };
}

/**
 * POST /api/merchant/invoice/create
 * Never sends a request when the token is missing — scaffold must not crash.
 */
export async function createMonoInvoice(
  input: CreateMonoInvoiceInput,
  deps: CreateMonoInvoiceDeps = {},
): Promise<MonoInvoice> {
  const config = (deps.getConfig ?? readMonoAcquiringConfig)();
  if (!config.configured) {
    throw new MonoClientError(
      "MONO_ACQUIRING_TOKEN is not configured.",
      "not_configured",
    );
  }

  const fetchImpl = deps.fetch ?? fetch;
  const body = buildMonoInvoiceRequestBody(input);
  const response = await fetchImpl(
    `${config.baseUrl}/api/merchant/invoice/create`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Token": config.token,
      },
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    console.error("Mono invoice create failed", { status: response.status });
    throw new MonoClientError(
      `Mono invoice create failed with HTTP ${response.status}.`,
      "http_error",
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new MonoClientError(
      "Mono invoice create returned non-JSON.",
      "invalid_response",
    );
  }

  if (
    !payload ||
    typeof payload !== "object" ||
    typeof (payload as { invoiceId?: unknown }).invoiceId !== "string" ||
    typeof (payload as { pageUrl?: unknown }).pageUrl !== "string"
  ) {
    throw new MonoClientError(
      "Mono invoice create returned an unexpected payload.",
      "invalid_response",
    );
  }

  const invoiceId = (payload as { invoiceId: string }).invoiceId.trim();
  const pageUrl = (payload as { pageUrl: string }).pageUrl.trim();
  if (!invoiceId || !isSafeCheckoutUrl(pageUrl)) {
    throw new MonoClientError(
      "Mono invoice create returned an unsafe checkout URL.",
      "invalid_response",
    );
  }

  return { invoiceId, pageUrl };
}
