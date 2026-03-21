import { useCallback, useState, type ReactNode } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  signIn,
  confirmSignIn,
  resetPassword,
  confirmResetPassword,
  type SignInOutput
} from 'aws-amplify/auth';

type AuthStep =
  | 'signIn'
  | 'newPassword'
  | 'mfa'
  | 'smsCode'
  | 'emailCode'
  | 'mfaPick'
  | 'mfaSetupPick'
  | 'totpSetup'
  | 'forgotRequest'
  | 'forgotConfirm'
  | 'success';

const RETURNING_USER_KEY = 'hipaa-returning-user';

function markReturningUser(): void {
  try {
    localStorage.setItem(RETURNING_USER_KEY, '1');
  } catch {
    /* ignore quota / private mode */
  }
}

function readReturningUser(): boolean {
  try {
    return localStorage.getItem(RETURNING_USER_KEY) === '1';
  } catch {
    return false;
  }
}

/** 50/50 split: left white (form), right panel with background image only. */
function LoginLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen min-h-[100dvh] w-full flex-col lg:flex-row">
      <div className="flex w-full flex-1 flex-col bg-white px-6 py-8 sm:px-10 lg:w-1/2 lg:px-14 lg:py-10">
        <div className="shrink-0">
          <img
            src="/logo.png"
            alt=""
            className="h-10 w-auto max-w-[220px] object-contain object-left"
            decoding="async"
          />
        </div>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center pt-10 lg:pt-12">
          {children}
        </div>
        <p className="shrink-0 pt-10 text-center text-xs text-slate-700">
          © Foundry360, LLC. All Rights Reserved
        </p>
      </div>
      <div
        className="relative min-h-[40vh] w-full flex-1 overflow-hidden bg-sky-100 bg-cover bg-center bg-no-repeat lg:min-h-0 lg:w-1/2"
        style={{ backgroundImage: "url('/loginbg.png')" }}
        aria-hidden
      />
    </div>
  );
}

export function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [step, setStep] = useState<AuthStep>('signIn');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [returningUser] = useState(() => readReturningUser());
  const [forgotUsername, setForgotUsername] = useState('');
  const [forgotCode, setForgotCode] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [passwordResetMessage, setPasswordResetMessage] = useState<string | null>(null);
  const [smsHint, setSmsHint] = useState<string | null>(null);
  const [totpQrUrl, setTotpQrUrl] = useState<string | null>(null);

  const finishSignIn = useCallback(() => {
    markReturningUser();
    onSuccess();
  }, [onSuccess]);

  const routeSignInOutput = useCallback(
    (result: SignInOutput) => {
      if (result.isSignedIn) {
        finishSignIn();
        return;
      }
      const ns = result.nextStep;
      setError(null);
      setMfaCode('');

      switch (ns.signInStep) {
        case 'CONFIRM_SIGN_IN_WITH_TOTP_CODE':
          setStep('mfa');
          break;
        case 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED':
          setStep('newPassword');
          break;
        case 'CONFIRM_SIGN_IN_WITH_SMS_CODE': {
          const dest = ns.codeDeliveryDetails?.destination;
          setSmsHint(dest ? `Code sent to ${dest}` : 'Enter the verification code sent to your phone.');
          setStep('smsCode');
          break;
        }
        case 'CONFIRM_SIGN_IN_WITH_EMAIL_CODE':
          setSmsHint(
            ns.codeDeliveryDetails?.destination
              ? `Code sent to ${ns.codeDeliveryDetails.destination}`
              : 'Enter the code sent to your email.'
          );
          setStep('emailCode');
          break;
        case 'CONTINUE_SIGN_IN_WITH_MFA_SELECTION':
          setStep('mfaPick');
          break;
        case 'CONTINUE_SIGN_IN_WITH_MFA_SETUP_SELECTION':
          setStep('mfaSetupPick');
          break;
        case 'CONTINUE_SIGN_IN_WITH_TOTP_SETUP': {
          const uri = ns.totpSetupDetails.getSetupUri('HIPAA Analyzer', username.trim() || undefined);
          setTotpQrUrl(uri.toString());
          setStep('totpSetup');
          break;
        }
        case 'CONTINUE_SIGN_IN_WITH_EMAIL_SETUP':
          setError(
            'Your account requires email verification for MFA. Contact your administrator to finish setup.'
          );
          break;
        default:
          setError(
            `Sign-in needs another step (${ns.signInStep}). If you use two-factor authentication, choose SMS or an authenticator app when prompted.`
          );
      }
    },
    [finishSignIn, username]
  );

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await signIn({ username, password });
      routeSignInOutput(result);
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
      const result = await confirmSignIn({ challengeResponse: newPassword });
      routeSignInOutput(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update password failed');
    } finally {
      setLoading(false);
    }
  };

  const handleChallengeCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await confirmSignIn({ challengeResponse: mfaCode });
      routeSignInOutput(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code');
    } finally {
      setLoading(false);
    }
  };

  const handleMfaChoice = async (choice: 'TOTP' | 'SMS' | 'EMAIL') => {
    setError(null);
    setLoading(true);
    try {
      const result = await confirmSignIn({ challengeResponse: choice });
      routeSignInOutput(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not continue');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const u = forgotUsername.trim();
    if (!u) {
      setError('Enter your username or email.');
      return;
    }
    setLoading(true);
    try {
      await resetPassword({ username: u });
      setStep('forgotConfirm');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send reset code');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await confirmResetPassword({
        username: forgotUsername.trim(),
        confirmationCode: forgotCode.trim(),
        newPassword: forgotNewPassword
      });
      setStep('signIn');
      setPassword('');
      setForgotCode('');
      setForgotNewPassword('');
      setPasswordResetMessage('Your password was updated. You can sign in now.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset password');
    } finally {
      setLoading(false);
    }
  };

  if (step === 'newPassword') {
    return (
      <LoginLayout>
        <div className="w-full">
          <h1 className="mb-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            Set new password
          </h1>
          <p className="mb-6 text-sm text-slate-500">
            Choose a permanent password (min 12 chars, upper, lower, number, symbol).
          </p>
          <form onSubmit={handleNewPassword} className="space-y-4">
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password"
              className="w-full rounded-lg border border-slate-300 px-4 py-3 focus:border-blue-400 focus:ring-2 focus:ring-blue-400"
              required
              minLength={12}
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-blue-500 py-3 font-medium text-white shadow-sm hover:bg-blue-600 disabled:opacity-50"
            >
              {loading ? 'Updating…' : 'Update password'}
            </button>
          </form>
        </div>
      </LoginLayout>
    );
  }

  if (step === 'mfaPick' || step === 'mfaSetupPick') {
    const title = step === 'mfaPick' ? 'Choose verification method' : 'Set up two-factor authentication';
    const subtitle =
      step === 'mfaPick'
        ? 'How do you want to receive or enter your sign-in code?'
        : 'Choose how you want to set up two-factor authentication.';
    return (
      <LoginLayout>
        <div className="w-full">
          <h1 className="mb-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{title}</h1>
          <p className="mb-6 text-sm text-slate-500">{subtitle}</p>
          {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
          <div className="flex flex-col gap-3">
            <button
              type="button"
              disabled={loading}
              onClick={() => void handleMfaChoice('TOTP')}
              className="w-full rounded-lg border border-slate-300 bg-white py-3 font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
            >
              Authenticator app (TOTP)
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => void handleMfaChoice('SMS')}
              className="w-full rounded-lg border border-slate-300 bg-white py-3 font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
            >
              SMS text message
            </button>
            {step === 'mfaSetupPick' && (
              <button
                type="button"
                disabled={loading}
                onClick={() => void handleMfaChoice('EMAIL')}
                className="w-full rounded-lg border border-slate-300 bg-white py-3 font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
              >
                Email
              </button>
            )}
          </div>
        </div>
      </LoginLayout>
    );
  }

  if (step === 'totpSetup') {
    return (
      <LoginLayout>
        <div className="w-full">
          <h1 className="mb-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            Set up authenticator
          </h1>
          <p className="mb-4 text-sm text-slate-500">
            Scan this QR code in your authenticator app (Google Authenticator, Authy, etc.), then enter the
            6-digit code.
          </p>
          {totpQrUrl && (
            <div className="mb-4 flex justify-center">
              <div
                className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
                role="img"
                aria-label="Authenticator setup QR code"
              >
                <QRCodeSVG value={totpQrUrl} size={176} level="M" includeMargin={false} />
              </div>
            </div>
          )}
          <form onSubmit={handleChallengeCode} className="space-y-4">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              className="w-full rounded-lg border border-slate-300 px-4 py-3 text-center text-lg tracking-widest focus:border-blue-400 focus:ring-2 focus:ring-blue-400"
              maxLength={6}
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading || mfaCode.length !== 6}
              className="w-full rounded-lg bg-blue-500 py-3 font-medium text-white shadow-sm hover:bg-blue-600 disabled:opacity-50"
            >
              {loading ? 'Verifying…' : 'Verify and continue'}
            </button>
          </form>
        </div>
      </LoginLayout>
    );
  }

  if (step === 'mfa' || step === 'smsCode' || step === 'emailCode') {
    const isTotp = step === 'mfa';
    const isSms = step === 'smsCode';
    const title = isTotp ? 'Two-factor authentication' : isSms ? 'SMS verification' : 'Email verification';
    const hint =
      isTotp
        ? 'Enter the 6-digit code from your authenticator app.'
        : isSms
          ? smsHint ?? 'Enter the SMS code sent to your phone.'
          : smsHint ?? 'Enter the code sent to your email.';

    return (
      <LoginLayout>
        <div className="w-full">
          <h1 className="mb-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{title}</h1>
          <p className="mb-6 text-sm text-slate-500">{hint}</p>
          <form onSubmit={handleChallengeCode} className="space-y-4">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              className="w-full rounded-lg border border-slate-300 px-4 py-3 text-center text-lg tracking-widest focus:border-blue-400 focus:ring-2 focus:ring-blue-400"
              maxLength={6}
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading || mfaCode.length !== 6}
              className="w-full rounded-lg bg-blue-500 py-3 font-medium text-white shadow-sm hover:bg-blue-600 disabled:opacity-50"
            >
              {loading ? 'Verifying…' : 'Verify'}
            </button>
          </form>
        </div>
      </LoginLayout>
    );
  }

  if (step === 'forgotRequest') {
    return (
      <LoginLayout>
        <div className="w-full">
          <h1 className="mb-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            Reset your password
          </h1>
          <p className="mb-6 text-sm text-slate-500">
            Enter your username or email. If your account exists, we&apos;ll send a verification code.
          </p>
          <form onSubmit={handleForgotRequest} className="space-y-4">
            <div>
              <label
                htmlFor="forgot-username"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                Username or Email
              </label>
              <input
                id="forgot-username"
                type="text"
                name="username"
                autoComplete="username"
                value={forgotUsername}
                onChange={(e) => setForgotUsername(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-4 py-3 focus:border-blue-400 focus:ring-2 focus:ring-blue-400"
                required
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-blue-500 py-3 font-medium text-white shadow-sm hover:bg-blue-600 disabled:opacity-50"
            >
              {loading ? 'Sending…' : 'Send verification code'}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep('signIn');
                setError(null);
              }}
              className="w-full text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              Back to sign in
            </button>
          </form>
        </div>
      </LoginLayout>
    );
  }

  if (step === 'forgotConfirm') {
    return (
      <LoginLayout>
        <div className="w-full">
          <h1 className="mb-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            Create new password
          </h1>
          <p className="mb-6 text-sm text-slate-500">
            Enter the code from your email and a new password (min 12 characters, upper, lower, number,
            symbol).
          </p>
          <form onSubmit={handleForgotConfirm} className="space-y-4">
            <div>
              <label
                htmlFor="forgot-code"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                Verification code
              </label>
              <input
                id="forgot-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={forgotCode}
                onChange={(e) => setForgotCode(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-4 py-3 focus:border-blue-400 focus:ring-2 focus:ring-blue-400"
                required
              />
            </div>
            <div>
              <label
                htmlFor="forgot-new-password"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                New password
              </label>
              <input
                id="forgot-new-password"
                type="password"
                autoComplete="new-password"
                value={forgotNewPassword}
                onChange={(e) => setForgotNewPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-4 py-3 focus:border-blue-400 focus:ring-2 focus:ring-blue-400"
                required
                minLength={12}
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-blue-500 py-3 font-medium text-white shadow-sm hover:bg-blue-600 disabled:opacity-50"
            >
              {loading ? 'Updating…' : 'Reset password'}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep('forgotRequest');
                setError(null);
              }}
              className="w-full text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              Resend code or change email
            </button>
          </form>
        </div>
      </LoginLayout>
    );
  }

  return (
    <LoginLayout>
      <div className="w-full">
        <h1 className="mb-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
          {returningUser ? 'Welcome Back' : 'Sign in'}
        </h1>
        <p className="mb-6 text-sm text-slate-500">Let&apos;s Login To Your Account</p>
        {passwordResetMessage && (
          <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            {passwordResetMessage}
          </div>
        )}
        <form onSubmit={handleSignIn} className="space-y-4">
          <div>
            <label
              htmlFor="login-username"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Username or Email
            </label>
            <input
              id="login-username"
              type="text"
              name="username"
              autoComplete="username"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setPasswordResetMessage(null);
              }}
              className="w-full rounded-lg border border-slate-300 px-4 py-3 focus:border-blue-400 focus:ring-2 focus:ring-blue-400"
              required
            />
          </div>
          <div>
            <label
              htmlFor="login-password"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Password
            </label>
            <input
              id="login-password"
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-4 py-3 focus:border-blue-400 focus:ring-2 focus:ring-blue-400"
              required
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-blue-500 py-3 font-medium text-white shadow-sm hover:bg-blue-600 disabled:opacity-50"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
          <div className="text-center">
            <button
              type="button"
              onClick={() => {
                setForgotUsername(username.trim());
                setError(null);
                setStep('forgotRequest');
              }}
              className="text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline"
            >
              Forgot password?
            </button>
          </div>
        </form>
      </div>
    </LoginLayout>
  );
}
