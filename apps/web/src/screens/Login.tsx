import { useState } from 'react';
import type PocketBase from 'pocketbase';

type Provider = 'google' | 'apple';

export function Login({ pb, onAuthed, onSkip }: { pb: PocketBase; onAuthed(): void; onSkip(): void }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const users = pb.collection('users');

  async function attempt(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      onAuthed();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const submit = () =>
    attempt(async () => {
      if (mode === 'signup') await users.create({ email, password, passwordConfirm: password });
      await users.authWithPassword(email, password);
    });

  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <h2>{mode === 'signin' ? 'Sign in' : 'Create account'}</h2>
      <label className="field">
        <span>Email</span>
        <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="field">
        <span>Password</span>
        <input
          type="password"
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button type="submit" className="primary" disabled={busy}>
          {mode === 'signin' ? 'Sign in' : 'Sign up'}
        </button>
        <button type="button" disabled={busy} onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
          {mode === 'signin' ? 'Create account' : 'I have an account'}
        </button>
      </div>
      <h3>Or continue with</h3>
      <div className="actions">
        {(['google', 'apple'] as Provider[]).map((provider) => (
          <button key={provider} type="button" disabled={busy} onClick={() => void attempt(() => users.authWithOAuth2({ provider }))}>
            {provider === 'google' ? 'Google' : 'Apple'}
          </button>
        ))}
      </div>
      <p>
        <button type="button" onClick={onSkip}>
          Use without an account
        </button>
      </p>
    </form>
  );
}
