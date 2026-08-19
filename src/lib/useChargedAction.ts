'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { publishCreditBalance } from './credit-balance-events';

interface PendingAction {
  actionKey: string;
  label: string;
  creditCost: number;
  run: () => Promise<void> | void;
  /**
   * When true, this hook does NOT call /api/charge itself — the action's own endpoint performs
   * the authoritative charge (e.g. appointment creation, where the charge must be atomic with
   * the production.appointments write, not a separate round trip that could charge without the
   * write happening or vice versa). The modal still shows cost/balance for confirmation.
   */
  chargeSeparately: boolean;
}

/**
 * Client-side helper for the confirm-before-spending flow (Part E): looks up an action's price,
 * shows the plain confirm modal via the returned `pending` state, and only calls the action's
 * `run()` after the user explicitly confirms. For most actions this hook performs the charge
 * itself via /api/charge before running the action; for actions whose own endpoint must charge
 * atomically with a write, pass chargeSeparately and that endpoint is responsible for enforcing
 * the charge (see /api/appointments for the example). Either way, the debit is never trusted as
 * client-computed — the server is always the authority on price and balance.
 */
export function useChargedAction(userId: string, onBalanceChange?: (balance: number) => void) {
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  // Settings-page toggle: when true, a priced action is charged and run immediately, with no
  // confirm modal shown at all — the user opted out of being asked. Cached in a ref (not state)
  // since it only needs to be read at request time, not drive a render. Starts true to match the
  // /api/preferences default, so there's no flash of confirm-required behavior before the
  // preferences fetch below resolves.
  const autoConfirmRef = useRef(true);

  const publishBalance = useCallback(
    (nextBalance: number) => {
      setBalance(nextBalance);
      onBalanceChange?.(nextBalance);
      publishCreditBalance(userId, nextBalance);
    },
    [userId, onBalanceChange]
  );

  const refreshBalance = useCallback(async () => {
    if (!userId) return null;
    const walletRes = await fetch(`/api/wallet?userId=${encodeURIComponent(userId)}`);
    const walletData = await walletRes.json();
    if (typeof walletData.balance === 'number') {
      publishBalance(walletData.balance);
      return walletData.balance;
    }
    return null;
  }, [userId, publishBalance]);

  useEffect(() => {
    if (!userId) return;
    fetch(`/api/preferences?userId=${encodeURIComponent(userId)}`)
      .then((r) => r.json())
      .then((d) => {
        autoConfirmRef.current = d.autoConfirmSpend ?? true;
      })
      .catch(() => {});
  }, [userId]);

  // Performs the actual charge + run, shared by both the auto-confirm path (requestAction, when
  // the preference is on) and the manual confirm path below.
  const chargeAndRun = useCallback(
    async (action: PendingAction) => {
      if (action.chargeSeparately) {
        // The action's own endpoint charges — just run it and let its response speak for the
        // outcome (including insufficient-credit failures, which the caller's own error state
        // should surface).
        await action.run();
        await refreshBalance();
        return true;
      }

      const res = await fetch('/api/charge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, actionKey: action.actionKey }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        if (typeof data.balanceAfter === 'number') publishBalance(data.balanceAfter);
        else setBalance(null);
        return false;
      }
      publishBalance(data.balanceAfter);
      await action.run();
      return true;
    },
    [userId, publishBalance, refreshBalance]
  );

  const requestAction = useCallback(
    async (
      actionKey: string,
      label: string,
      run: () => Promise<void> | void,
      opts?: { chargeSeparately?: boolean; quantity?: number }
    ) => {
      const [priceRes, walletRes] = await Promise.all([
        fetch(`/api/action-price?actionKey=${encodeURIComponent(actionKey)}`),
        fetch(`/api/wallet?userId=${encodeURIComponent(userId)}`),
      ]);
      const priceData = await priceRes.json();
      const walletData = await walletRes.json();
      if (typeof walletData.balance === 'number') publishBalance(walletData.balance);

      // For batched actions priced per-unit (e.g. import N employees at 3 credits each), the
      // caller passes quantity so the confirm modal shows the real total, not the per-unit price
      // — the server still enforces the actual per-unit charges independently.
      const quantity = opts?.quantity ?? 1;
      const creditCost = (priceData.creditCost ?? 0) * quantity;
      const action: PendingAction = {
        actionKey,
        label,
        creditCost,
        run,
        chargeSeparately: !!opts?.chargeSeparately,
      };

      if (creditCost === 0) {
        // Free actions skip the confirm modal entirely — nothing irreversible-feeling to guard.
        await run();
        return;
      }

      if (autoConfirmRef.current) {
        // User opted out of the confirm-before-spending modal in Settings — charge and run
        // immediately, exactly as if they'd clicked Confirm, with no modal ever shown.
        await chargeAndRun(action);
        return;
      }

      setPending(action);
    },
    [userId, chargeAndRun, publishBalance]
  );

  const confirm = useCallback(async () => {
    if (!pending) return;
    setConfirming(true);
    try {
      const ok = await chargeAndRun(pending);
      if (ok) setPending(null);
      // On failure, modal stays open showing the insufficient-credits state via balance/cost
      // props — chargeAndRun already updated `balance`.
    } finally {
      setConfirming(false);
    }
  }, [pending, chargeAndRun]);

  const cancel = useCallback(() => setPending(null), []);

  return { pending, balance, confirming, requestAction, confirm, cancel };
}
