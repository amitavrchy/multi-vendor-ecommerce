'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowUpRight, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { api, json } from '@/lib/api';
import { useStore } from '@/components/provider';
import { Loading } from '@/components/ui';
function Login() {
  const params = useSearchParams(),
    router = useRouter(),
    { refresh } = useStore(),
    [mode, setMode] = useState<'login' | 'register'>('login'),
    [show, setShow] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <div className="container auth-page">
      <div className="auth-story">
        <span className="auth-symbol">✳</span>
        <p className="eyebrow">GOOD TO HAVE YOU HERE</p>
        <h1>
          Your everyday,
          <br />a little <em>better.</em>
        </h1>
        <p>
          One account. Independent stores.
          <br />A world of thoughtful little discoveries.
        </p>
        <span>
          <ShieldCheck size={20} /> Your details stay safe with us.
        </span>
      </div>
      <section className="auth-form">
        <p className="eyebrow">YOUR BAZAAR</p>
        <h2>{mode === 'login' ? 'Welcome back.' : 'Make yourself at home.'}</h2>
        <p className="muted">
          {mode === 'login'
            ? 'Sign in to pick up where you left off.'
            : 'Create an account and find your kind of good.'}
        </p>
        <div className="tabs">
          <button
            className={mode === 'login' ? 'active' : ''}
            onClick={() => {
              setMode('login');
              setError('');
            }}
          >
            Sign in
          </button>
          <button
            className={mode === 'register' ? 'active' : ''}
            onClick={() => {
              setMode('register');
              setError('');
            }}
          >
            Create account
          </button>
        </div>
        <form
          className="form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError('');
            const f = new FormData(e.currentTarget);
            try {
              await api(`/auth/${mode}`, json(Object.fromEntries(f)));
              await refresh();
              const next = params.get('next');
              router.push(next?.startsWith('/') && !next.startsWith('//') ? next : '/account');
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {mode === 'register' && (
            <label>
              Your name
              <input
                required
                name="name"
                minLength={2}
                maxLength={80}
                autoComplete="name"
                placeholder="Alex Morgan"
              />
            </label>
          )}
          <label>
            Email address
            <input
              required
              type="email"
              name="email"
              autoComplete="email"
              placeholder="you@example.com"
            />
          </label>
          <label>
            Password
            <div className="password-input">
              <input
                required
                type={show ? 'text' : 'password'}
                name="password"
                minLength={10}
                maxLength={128}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                placeholder="At least 10 characters"
              />
              <button
                type="button"
                aria-label={show ? 'Hide password' : 'Show password'}
                onClick={() => setShow(!show)}
              >
                {show ? <EyeOff size={19} /> : <Eye size={19} />}
              </button>
            </div>
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="button" disabled={busy}>
            {busy ? 'One moment…' : mode === 'login' ? 'Sign in' : 'Create your account'}
            <ArrowUpRight size={19} />
          </button>
          <p className="fine-print">
            By continuing, you agree to our <Link href="/help">marketplace policies</Link>.
          </p>
        </form>
      </section>
    </div>
  );
}
export default function LoginPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Login />
    </Suspense>
  );
}
