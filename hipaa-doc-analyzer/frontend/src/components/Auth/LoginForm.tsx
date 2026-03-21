import { useState } from 'react';
import { signIn, confirmSignIn } from 'aws-amplify/auth';

type AuthStep = 'signIn' | 'newPassword' | 'mfa' | 'success';

export function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [step, setStep] = useState<AuthStep>('signIn');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await signIn({ username, password });
      if (result.nextStep?.signInStep === 'CONFIRM_SIGN_IN_WITH_TOTP_CODE') {
        setStep('mfa');
      } else if (result.nextStep?.signInStep === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED') {
        setStep('newPassword');
      } else if (result.isSignedIn) {
        setStep('success');
        onSuccess();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      setLoading(false);
    }
  };

  const handleNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await confirmSignIn({ challengeResponse: newPassword });
      setStep('success');
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update password failed');
    } finally {
      setLoading(false);
    }
  };

  const handleMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await confirmSignIn({ challengeResponse: mfaCode });
      setStep('success');
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid MFA code');
    } finally {
      setLoading(false);
    }
  };

  if (step === 'newPassword') {
    return (
      <div className="w-full max-w-sm mx-auto mt-16 p-8 bg-white rounded-2xl shadow-lg border border-slate-200">
        <h1 className="text-xl font-semibold text-slate-800 mb-2">Set new password</h1>
        <p className="text-sm text-slate-500 mb-6">Choose a permanent password (min 12 chars, upper, lower, number, symbol).</p>
        <form onSubmit={handleNewPassword} className="space-y-4">
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="New password"
            className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            required
            minLength={12}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={loading} className="w-full py-3 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50">
            {loading ? 'Updating…' : 'Update password'}
          </button>
        </form>
      </div>
    );
  }

  if (step === 'mfa') {
    return (
      <div className="w-full max-w-sm mx-auto mt-16 p-8 bg-white rounded-2xl shadow-lg border border-slate-200">
        <h1 className="text-xl font-semibold text-slate-800 mb-2">Two-factor authentication</h1>
        <p className="text-sm text-slate-500 mb-6">Enter the 6-digit code from your authenticator app.</p>
        <form onSubmit={handleMfa} className="space-y-4">
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={mfaCode}
            onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-center text-lg tracking-widest"
            maxLength={6}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={loading || mfaCode.length !== 6} className="w-full py-3 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50">
            {loading ? 'Verifying…' : 'Verify'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm mx-auto mt-16 p-8 bg-white rounded-2xl shadow-lg border border-slate-200">
      <h1 className="text-xl font-semibold text-slate-800 mb-2">Clinical Document Analyzer</h1>
      <p className="text-sm text-slate-500 mb-6">Sign in with your credentials. MFA required.</p>
      <form onSubmit={handleSignIn} className="space-y-4">
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username or email"
          className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          required
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          required
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={loading} className="w-full py-3 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50">
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
