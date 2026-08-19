'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Banknote, CreditCard, ReceiptText } from 'lucide-react';
import { getSession, type Session } from '@/lib/session';
import { calculateBonus, calculatePriceZAR, calculateTotalCredited } from '@/lib/credit-bonus';
import NavBar from '@/components/NavBar';
import PageIntro from '@/components/PageIntro';
import Pagination from '@/components/Pagination';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import dashboardPages from '../../../config/dashboard-pages.json';
import creditPurchasingConfig from '../../../config/credit-purchasing.json';

const BUNDLES = creditPurchasingConfig.bundles;
// Anchored on the biggest-bonus bundle — shown first so smaller bundles are judged against it
// (Part E's anchoring instruction). Configurable per config/credit-purchasing.json.
const ANCHOR_BUNDLE = creditPurchasingConfig.anchorBundle;

interface Transaction {
  _id: string;
  type: 'topup' | 'debit';
  credits: number;
  action?: string;
  balanceAfter: number;
  createdAt: string;
}

type TxFilter = 'all' | 'topup' | 'debit';

const rand = (amount: number) => `R${amount.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;

export default function FinancesPage() {
  return (
    <Suspense fallback={null}>
      <FinancesPageContent />
    </Suspense>
  );
}

function FinancesPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [session] = useState<Session | null>(() => getSession());
  const [balance, setBalance] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [txFilter, setTxFilter] = useState<TxFilter>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [checkingOut, setCheckingOut] = useState<number | null>(null);
  const checkoutStatus = searchParams.get('checkout');

  const loadWallet = useCallback(async (uid: string) => {
    const res = await fetch(`/api/wallet?userId=${encodeURIComponent(uid)}`);
    const data = await res.json();
    setBalance(data.balance);
  }, []);

  const loadTransactions = useCallback(
    async (uid: string, filter: TxFilter, p: number, ps: number) => {
      const params = new URLSearchParams({
        userId: uid,
        page: String(p),
        pageSize: String(ps),
      });
      if (filter !== 'all') params.set('type', filter);
      const res = await fetch(`/api/billing/transactions?${params.toString()}`);
      const data = await res.json();
      setTransactions(data.transactions ?? []);
      setTotal(data.total ?? 0);
    },
    []
  );

  useEffect(() => {
    if (!session) {
      router.push('/login');
    }
  }, [session, router]);

  useEffect(() => {
    // Data fetch triggered on mount once session resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (session) loadWallet(session.id);
  }, [session, loadWallet]);

  useEffect(() => {
    // Data fetch triggered by filter/page/pageSize changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (session) loadTransactions(session.id, txFilter, page, pageSize);
  }, [session, txFilter, page, pageSize, loadTransactions]);

  const changeFilter = (filter: TxFilter) => {
    setTxFilter(filter);
    setPage(1);
  };

  const changePageSize = (size: number) => {
    setPageSize(size);
    setPage(1);
  };

  const buyBundle = async (credits: number) => {
    if (!session) return;
    setCheckingOut(credits);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: session.id, credits }),
      });
      const data = await res.json();
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
      }
    } finally {
      setCheckingOut(null);
    }
  };

  if (!session) return null;

  return (
    <main className="flex-1 p-6 max-w-3xl mx-auto w-full bg-background">
      <NavBar session={session} />
      <PageIntro
        title={dashboardPages.finances.title}
        description={dashboardPages.finances.description}
        icon={Banknote}
      />

      {checkoutStatus === 'success' && (
        <p className="text-sm text-green-700 mb-4 border border-green-200 rounded-card p-3 bg-green-50">
          Payment received — your balance updates once Yoco confirms the payment (usually within
          a few seconds). Refresh if it doesn&apos;t appear right away.
        </p>
      )}
      {checkoutStatus === 'cancelled' && (
        <p className="text-sm text-gray-500 mb-4">Checkout was cancelled.</p>
      )}
      {checkoutStatus === 'failed' && (
        <p className="text-sm text-red-600 mb-4">Payment failed. No credits were charged.</p>
      )}

      <Card premium className="p-5 mb-8">
        <p className="text-xs text-gray-500">Current balance</p>
        <p className="text-3xl font-semibold text-gray-900 mt-0.5">
          {balance ?? '—'} <span className="text-lg font-normal text-gold-700">credits</span>
        </p>
        <p className="text-xs text-gray-500 mt-2">{dashboardPages.finances.helpers.balance}</p>
      </Card>

      <section className="mb-10">
        <h2 className="text-sm font-semibold text-gray-900 mb-1">
          Stop retyping the same 100 employees every booking
        </h2>
        <p className="text-xs text-gray-500 mb-4">
          Buy credits once, use them across your whole roster — saved employees, saved sites, and
          appointments built in minutes instead of retyped from scratch.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[ANCHOR_BUNDLE, ...BUNDLES.filter((b) => b !== ANCHOR_BUNDLE)].map((credits) => {
            const bonus = calculateBonus(credits);
            const total = calculateTotalCredited(credits);
            const price = calculatePriceZAR(credits);
            const isAnchor = credits === ANCHOR_BUNDLE;
            return (
              <Card
                key={credits}
                premium={isAnchor}
                className={`p-4 flex flex-col ${isAnchor ? 'border-2' : ''}`}
              >
                {isAnchor && (
                  <span className="text-[10px] font-medium text-gold-700 mb-1 uppercase tracking-wide">
                    Biggest bonus
                  </span>
                )}
                <p className="text-lg font-semibold text-gray-900">{rand(price)}</p>
                <p className="text-sm text-gray-700">
                  Buy {credits}, get <span className="font-medium text-gray-900">{total}</span>
                </p>
                <p className="text-xs text-green-700 mb-3">+{bonus} bonus credits, free</p>
                <Button
                  onClick={() => buyBundle(credits)}
                  disabled={checkingOut !== null}
                  variant={isAnchor ? 'primary' : 'secondary'}
                  className="mt-auto text-sm px-3 py-1.5"
                >
                  <CreditCard className="h-3.5 w-3.5" aria-hidden="true" />
                  {checkingOut === credits ? 'Redirecting…' : 'Buy'}
                </Button>
              </Card>
            );
          })}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Transactions</h2>
            <p className="text-xs text-gray-500 mt-1">{dashboardPages.finances.helpers.transactions}</p>
          </div>
          <div className="flex gap-1 text-xs border border-gray-200 rounded-pill p-0.5 bg-white">
            {(['all', 'topup', 'debit'] as const).map((f) => (
              <button
                key={f}
                onClick={() => changeFilter(f)}
                className={`px-2.5 py-1 rounded-pill transition-colors ${
                  txFilter === f ? 'bg-red-500 text-white' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {f === 'all' ? 'All' : f === 'topup' ? 'Purchases' : 'Actions'}
              </button>
            ))}
          </div>
        </div>

        {/* No reversal/refund controls here by design — this page is for visibility and topping
            up, not for disputing past charges. */}
        <ul className="divide-y divide-gray-200 border border-gray-200 rounded-card overflow-hidden">
          {transactions.map((t) => (
            <li key={t._id} className="flex items-center justify-between px-3 py-2 text-sm bg-white">
              <span className="text-gray-700">
                <ReceiptText className="inline-block h-3.5 w-3.5 mr-1 text-gray-400" aria-hidden="true" />
                {new Date(t.createdAt).toLocaleString('en-ZA')}
                {t.type === 'debit' && t.action ? ` · ${t.action}` : ''}
              </span>
              <span className={t.type === 'topup' ? 'text-green-700' : 'text-red-600'}>
                {t.type === 'topup' ? '+' : ''}
                {t.credits} credits
              </span>
            </li>
          ))}
          {transactions.length === 0 && (
            <li className="px-3 py-4 text-sm text-gray-500">No transactions yet.</li>
          )}
        </ul>

        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
          onPageSizeChange={changePageSize}
        />
      </section>
    </main>
  );
}
