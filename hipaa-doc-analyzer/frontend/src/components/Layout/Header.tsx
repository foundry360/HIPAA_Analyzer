import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'aws-amplify/auth';
import { LogOut } from 'lucide-react';
import { UserAvatar } from './UserAvatar';

export function Header() {
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
    } catch {
      /* still leave the app UI */
    } finally {
      navigate('/login', { replace: true });
    }
  }

  return (
    <header className="sticky top-0 z-30 w-full shrink-0 border-b border-slate-200 bg-white px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex min-w-0 items-center">
          <img
            src="/logo.png"
            alt="Logo"
            className="h-5 w-auto max-w-[min(100%,160px)] object-contain object-left"
            decoding="async"
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void handleSignOut()}
            disabled={signingOut}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:pointer-events-none disabled:opacity-50"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut className="h-5 w-5" strokeWidth={2} />
          </button>
          <UserAvatar />
        </div>
      </div>
    </header>
  );
}
