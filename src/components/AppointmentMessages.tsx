'use client';

import { useEffect, useState, useCallback } from 'react';
import { MessageSquareText, Send } from 'lucide-react';
import { useChargedAction } from '@/lib/useChargedAction';
import ConfirmSpendModal from './ConfirmSpendModal';
import LoadingState from './LoadingState';
import { Button } from '@/components/ui/Button';
import type { AppointmentMessage } from '@/lib/types';
import type { Session } from '@/lib/session';

interface AppointmentMessagesProps {
  appointmentId: string;
  session: Session;
}

/**
 * Appointment message thread — same underlying storage/shape as the real apps' messages array
 * (see /api/appointments/[id]/messages), read/written over REST rather than Socket.IO since
 * cp-companion has no existing real-time client. Polls on a short interval instead of subscribing
 * to a live channel, so a message sent from ClinicPlus admin or the client apps shows up here
 * within one poll cycle rather than instantly.
 */
export default function AppointmentMessages({ appointmentId, session }: AppointmentMessagesProps) {
  const { pending, balance, confirming, requestAction, confirm, cancel } = useChargedAction(session.id);
  const [messages, setMessages] = useState<AppointmentMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(
      `/api/appointments/${appointmentId}/messages?userId=${encodeURIComponent(session.id)}`
    );
    const data = await res.json();
    setMessages(data.messages ?? []);
    setLoading(false);
  }, [appointmentId, session.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [load]);

  const send = () => {
    if (!draft.trim()) return;
    requestAction(
      'appointment.sendMessage',
      'Send message',
      async () => {
        setSending(true);
        try {
          await fetch(`/api/appointments/${appointmentId}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: session.id,
              userName: `${session.name} ${session.surname}`,
              userRole: 'client',
              message: draft.trim(),
            }),
          });
          setDraft('');
          await load();
        } finally {
          setSending(false);
        }
      },
      { chargeSeparately: true }
    );
  };

  return (
    <div className="border border-gray-200 rounded-card p-4 bg-white">
      <h2 className="text-sm font-semibold text-gray-900 mb-3 inline-flex items-center gap-2">
        <MessageSquareText className="h-4 w-4 text-red-500" aria-hidden="true" />
        Messages
      </h2>

      {loading && <LoadingState label="Loading messages..." className="py-2" />}

      {!loading && (
        <div className="flex flex-col gap-2 max-h-80 overflow-y-auto mb-3">
          {messages.length === 0 && (
            <p className="text-sm text-gray-500">No messages yet.</p>
          )}
          {messages.map((m, i) => {
            const isMine = m.author?.id === session.id;
            return (
              <div key={i} className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                <div
                  className={`max-w-[80%] rounded-card px-3 py-2 text-sm ${
                    isMine ? 'bg-red-50 text-gray-900' : 'bg-gray-100 text-gray-900'
                  }`}
                >
                  {m.message}
                </div>
                <span className="text-[10px] text-gray-400 mt-0.5">
                  {m.author?.name} · {m.createdAt}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Write a message…"
          rows={2}
          className="flex-1 border border-gray-300 rounded-input px-3 py-1.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-400 transition-shadow"
        />
        <Button onClick={send} disabled={sending || !draft.trim()} variant="primary" className="px-3 py-2 self-end">
          <Send className="h-3.5 w-3.5" aria-hidden="true" />
          {sending ? 'Sending…' : 'Send'}
        </Button>
      </div>

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
    </div>
  );
}
