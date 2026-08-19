'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Lightbulb, Plus, Send } from 'lucide-react';
import { getSession, type Session } from '@/lib/session';
import NavBar from '@/components/NavBar';
import PageIntro from '@/components/PageIntro';
import ConfirmSpendModal from '@/components/ConfirmSpendModal';
import { Button, LinkButton } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { useChargedAction } from '@/lib/useChargedAction';
import dashboardPages from '../../../../config/dashboard-pages.json';
import featureRequestConfig from '../../../../config/feature-request.json';

export default function FeatureRequestPage() {
  const router = useRouter();
  const [session] = useState<Session | null>(() => getSession());
  const { pending, balance, confirming, requestAction, confirm, cancel } = useChargedAction(
    session?.id ?? ''
  );
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [impact, setImpact] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!session) {
      router.push('/login');
    }
  }, [session, router]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session) return;

    requestAction(
      'featureRequest.submit',
      'Submit feature suggestion',
      async () => {
        setSubmitting(true);
        setError('');
        try {
          const res = await fetch('/api/feature-requests', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: session.id,
              userName: `${session.name} ${session.surname}`.trim(),
              userEmail: session.email,
              title,
              description,
              impact,
            }),
          });
          const data = await res.json();
          if (!res.ok) {
            setError(data.error || featureRequestConfig.form.genericError);
            return;
          }
          setSubmitted(true);
          setTitle('');
          setDescription('');
          setImpact('');
        } finally {
          setSubmitting(false);
        }
      },
      { chargeSeparately: true }
    );
  };

  if (!session) return null;

  return (
    <main className="flex-1 p-6 max-w-3xl mx-auto w-full bg-background">
      <NavBar session={session} />
      <PageIntro
        title={dashboardPages.featureRequest.title}
        description={dashboardPages.featureRequest.description}
        icon={Lightbulb}
      />

      <Card className="p-4">
        {submitted ? (
          <div className="space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-900 mb-1">
                {featureRequestConfig.success.title}
              </h2>
              <p className="text-sm text-gray-600">
                {featureRequestConfig.success.description}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button type="button" onClick={() => setSubmitted(false)} className="text-sm px-4 py-2">
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                {featureRequestConfig.success.suggestAnotherLabel}
              </Button>
              <LinkButton href="/settings" variant="secondary" className="text-sm px-4 py-2">
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                {featureRequestConfig.success.backToSettingsLabel}
              </LinkButton>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-900 mb-1">
                {featureRequestConfig.form.title}
              </h2>
              <p className="text-xs text-gray-500">
                {featureRequestConfig.form.helperText} {dashboardPages.featureRequest.helpers.form}
              </p>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">
                {featureRequestConfig.form.titleLabel}
              </label>
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={featureRequestConfig.form.titlePlaceholder}
                className="w-full"
                maxLength={120}
                required
              />
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">
                {featureRequestConfig.form.descriptionLabel}
              </label>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="w-full min-h-32 border border-gray-300 rounded-input px-3 py-2 text-sm text-gray-900 bg-white transition-shadow duration-150 motion-reduce:transition-none focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-400 placeholder:text-gray-400 disabled:opacity-50 disabled:bg-gray-50"
                placeholder={featureRequestConfig.form.descriptionPlaceholder}
                maxLength={2000}
                required
              />
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">
                {featureRequestConfig.form.impactLabel}
              </label>
              <textarea
                value={impact}
                onChange={(event) => setImpact(event.target.value)}
                className="w-full min-h-24 border border-gray-300 rounded-input px-3 py-2 text-sm text-gray-900 bg-white transition-shadow duration-150 motion-reduce:transition-none focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-400 placeholder:text-gray-400 disabled:opacity-50 disabled:bg-gray-50"
                placeholder={featureRequestConfig.form.impactPlaceholder}
                maxLength={1000}
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex flex-wrap gap-3">
              <Button
                type="submit"
                disabled={submitting || !title.trim() || !description.trim()}
                className="text-sm px-4 py-2"
              >
                <Send className="h-3.5 w-3.5" aria-hidden="true" />
                {submitting
                  ? featureRequestConfig.form.submittingLabel
                  : featureRequestConfig.form.submitLabel}
              </Button>
              <LinkButton href="/settings" variant="secondary" className="text-sm px-4 py-2">
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                {featureRequestConfig.form.cancelLabel}
              </LinkButton>
            </div>
          </form>
        )}
      </Card>
      {pending && balance !== null && (
        <ConfirmSpendModal
          actionLabel={pending.label}
          creditCost={pending.creditCost}
          currentBalance={balance}
          onConfirm={confirm}
          onCancel={cancel}
          confirming={confirming}
        />
      )}
    </main>
  );
}
