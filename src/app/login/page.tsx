'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSession, saveSession } from '@/lib/session';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export default function LoginPage() {
  const router = useRouter();
  const [session] = useState(() => getSession());
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Already logged in — no reason to show the login form again.
    if (session) {
      router.replace('/roster');
    }
  }, [session, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Login failed');
        return;
      }
      saveSession(data);
      router.push('/roster');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (session) return null;

  return (
    <main className="flex-1 flex items-center justify-center p-6 bg-background min-h-screen">
      <div className="w-full max-w-sm">
        <Image
          src="/logo-wide.png"
          alt="ClinicPlus Companion"
          width={1942}
          height={809}
          priority
          className="mb-4 h-14 w-auto"
        />
        <p className="text-sm text-gray-500 mb-6">
          Log in with your existing ClinicPlus email and password.
        </p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <Input
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            type="password"
            required
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" disabled={loading} variant="primary" className="px-3 py-2">
            {loading ? 'Logging in…' : 'Log in'}
          </Button>
        </form>
      </div>
    </main>
  );
}
