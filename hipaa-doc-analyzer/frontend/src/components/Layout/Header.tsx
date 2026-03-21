import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'aws-amplify/auth';
import { Fullscreen, LogOut } from 'lucide-react';
import { UserAvatar } from './UserAvatar';

function toggleBrowserFullscreen(): void {
  const doc = document as Document & {
    webkitFullscreenElement?: Element | null;
    webkitExitFullscreen?: () => Promise<void> | void;
  };
  const root = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
  };

  const active = document.fullscreenElement ?? doc.webkitFullscreenElement;
  try {
    if (!active) {
      if (root.requestFullscreen) {
        void root.requestFullscreen();
      } else if (root.webkitRequestFullscreen) {
        void root.webkitRequestFullscreen();
      }
    } else if (document.exitFullscreen) {
      void document.exitFullscreen();
    } else if (doc.webkitExitFullscreen) {
      void doc.webkitExitFullscreen();
    }
  } catch {
    /* not supported or blocked */
  }
}

export function Header() {
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const syncFullscreen = useCallback(() => {
    const doc = document as Document & { webkitFullscreenElement?: Element | null };
    setIsFullscreen(!!(document.fullscreenElement ?? doc.webkitFullscreenElement));
  }, []);

  useEffect(() => {
    syncFullscreen();
    document.addEventListener('fullscreenchange', syncFullscreen);
    document.addEventListener('webkitfullscreenchange', syncFullscreen as EventListener);
    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreen);
      document.removeEventListener('webkitfullscreenchange', syncFullscreen as EventListener);
    };
  }, [syncFullscreen]);

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
        <div className="flex min-w-0 items-center gap-2">
          <div className="inline-flex shrink-0 items-center gap-0">
            <button
              type="button"
              onClick={() => void handleSignOut()}
              disabled={signingOut}
              className="inline-flex h-8 items-center justify-center rounded-lg px-1.5 text-slate-600 transition-colors hover:bg-slate-100 disabled:pointer-events-none disabled:opacity-50"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" strokeWidth={2} />
            </button>
            <button
              type="button"
              onClick={() => toggleBrowserFullscreen()}
              className="inline-flex h-8 items-center justify-center rounded-lg px-1.5 text-slate-600 transition-colors hover:bg-slate-100"
              aria-label={isFullscreen ? 'Exit full screen' : 'Enter full screen'}
              title={isFullscreen ? 'Exit full screen' : 'Full screen'}
              aria-pressed={isFullscreen}
            >
              <Fullscreen className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>
          <UserAvatar />
        </div>
      </div>
    </header>
  );
}
