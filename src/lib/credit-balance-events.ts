'use client';

const CREDIT_BALANCE_EVENT = 'clinicplus-companion:credit-balance';
const CREDIT_BALANCE_CHANNEL = 'clinicplus-companion-credit-balance';

interface CreditBalancePayload {
  userId: string;
  balance: number;
}

function isCreditBalancePayload(value: unknown): value is CreditBalancePayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as CreditBalancePayload).userId === 'string' &&
    typeof (value as CreditBalancePayload).balance === 'number'
  );
}

export function publishCreditBalance(userId: string, balance: number) {
  const payload: CreditBalancePayload = { userId, balance };
  window.dispatchEvent(new CustomEvent(CREDIT_BALANCE_EVENT, { detail: payload }));

  try {
    localStorage.setItem(CREDIT_BALANCE_EVENT, JSON.stringify({ ...payload, updatedAt: Date.now() }));
  } catch {}

  if ('BroadcastChannel' in window) {
    const channel = new BroadcastChannel(CREDIT_BALANCE_CHANNEL);
    channel.postMessage(payload);
    channel.close();
  }
}

export function subscribeToCreditBalance(
  userId: string,
  onBalance: (balance: number) => void
): () => void {
  const handlePayload = (payload: unknown) => {
    if (isCreditBalancePayload(payload) && payload.userId === userId) {
      onBalance(payload.balance);
    }
  };

  const handleWindowEvent = (event: Event) => {
    handlePayload((event as CustomEvent<CreditBalancePayload>).detail);
  };

  const handleStorage = (event: StorageEvent) => {
    if (event.key !== CREDIT_BALANCE_EVENT || !event.newValue) return;
    try {
      handlePayload(JSON.parse(event.newValue));
    } catch {}
  };

  window.addEventListener(CREDIT_BALANCE_EVENT, handleWindowEvent);
  window.addEventListener('storage', handleStorage);

  let channel: BroadcastChannel | null = null;
  if ('BroadcastChannel' in window) {
    channel = new BroadcastChannel(CREDIT_BALANCE_CHANNEL);
    channel.onmessage = (event) => handlePayload(event.data);
  }

  return () => {
    window.removeEventListener(CREDIT_BALANCE_EVENT, handleWindowEvent);
    window.removeEventListener('storage', handleStorage);
    channel?.close();
  };
}
