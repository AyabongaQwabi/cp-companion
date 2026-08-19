import crypto from 'crypto';

/**
 * Yoco Checkout API client. Docs pulled live 2026 from
 * https://developer.yoco.com/docs/checkout-api (and sub-pages) per Part E's explicit instruction
 * not to guess at Yoco's integration details:
 * - Checkout creation: POST https://payments.yoco.com/api/checkouts, Bearer auth, amount in cents.
 * - Webhook registration: POST https://payments.yoco.com/api/webhooks, returns a one-time secret.
 * - Webhook verification: HMAC-SHA256(base64) over `{webhook-id}.{webhook-timestamp}.{raw-body}`,
 *   using the secret with its `whsec_` prefix stripped and base64-decoded; timestamp must be
 *   within 3 minutes of now; compare with a constant-time comparison.
 */

const YOCO_SECRET_KEY = process.env.YOCO_SECRET_KEY;
const YOCO_WEBHOOK_SECRET = process.env.YOCO_WEBHOOK_SECRET;

function requireSecretKey(): string {
  if (!YOCO_SECRET_KEY) {
    throw new Error('YOCO_SECRET_KEY not set');
  }
  return YOCO_SECRET_KEY;
}

export interface CreateCheckoutParams {
  amountCents: number;
  successUrl: string;
  cancelUrl: string;
  failureUrl: string;
  metadata?: Record<string, string>;
  idempotencyKey: string;
}

/**
 * Yoco has no "get checkout by id" endpoint and does not append its own checkout id (or
 * anything else) to successUrl/cancelUrl/failureUrl on redirect. So the caller must generate its
 * own reference up front, thread it through both `metadata` (which the webhook echoes back) and
 * the successUrl query string itself — never rely on matching the webhook payload's `payload.id`
 * (Yoco's charge id) back to the checkout-creation response's `id` (the checkout id); those are
 * two different Yoco-side identifiers and will not match.
 */
export function randomPaymentReference(): string {
  return crypto.randomUUID();
}

export interface YocoCheckoutResponse {
  id: string;
  status: 'created' | 'started' | 'processing' | 'completed';
  amount: number;
  currency: string;
  redirectUrl: string;
  processingMode: 'live' | 'test';
}

export async function createCheckout(params: CreateCheckoutParams): Promise<YocoCheckoutResponse> {
  const res = await fetch('https://payments.yoco.com/api/checkouts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${requireSecretKey()}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': params.idempotencyKey,
    },
    body: JSON.stringify({
      amount: params.amountCents,
      currency: 'ZAR',
      successUrl: params.successUrl,
      cancelUrl: params.cancelUrl,
      failureUrl: params.failureUrl,
      metadata: params.metadata,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Yoco checkout creation failed (${res.status}): ${body}`);
  }

  return res.json();
}

/**
 * Verifies a Yoco webhook per their documented scheme. Must be called with the raw request body
 * string (not re-serialized JSON) — the signature covers exact bytes.
 */
export function verifyWebhookSignature(params: {
  webhookId: string;
  webhookTimestamp: string;
  signatureHeader: string;
  rawBody: string;
}): boolean {
  if (!YOCO_WEBHOOK_SECRET) {
    throw new Error('YOCO_WEBHOOK_SECRET not set');
  }

  const timestampSeconds = parseInt(params.webhookTimestamp, 10);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestampSeconds) > 3 * 60) {
    return false; // Outside the 3-minute replay window.
  }

  const secretBytes = Buffer.from(YOCO_WEBHOOK_SECRET.replace(/^whsec_/, ''), 'base64');
  const signedContent = `${params.webhookId}.${params.webhookTimestamp}.${params.rawBody}`;
  const expectedSignature = crypto
    .createHmac('sha256', secretBytes)
    .update(signedContent)
    .digest('base64');

  // webhook-signature header can carry multiple space-separated "v1,<sig>" entries.
  const candidates = params.signatureHeader
    .split(' ')
    .map((entry) => entry.split(',')[1])
    .filter(Boolean);

  return candidates.some((candidate) => {
    try {
      return crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(expectedSignature));
    } catch {
      return false; // Length mismatch etc. — not a match.
    }
  });
}
