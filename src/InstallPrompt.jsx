import { useEffect, useState } from 'react';
import {
  canPromptInstall,
  isInstalled,
  isIOS,
  promptInstall,
  rememberDismissed,
  subscribe,
  wasRecentlyDismissed,
} from './pwaInstall';

// Generic "share" glyph (box with an up arrow) so iPhone users know what to tap.
function ShareGlyph() {
  return (
    <svg
      className="install-share-glyph"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3v12" />
      <path d="M8 7l4-4 4 4" />
      <path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
    </svg>
  );
}

function IOSSteps() {
  return (
    <ol className="install-steps">
      <li>
        Tap the <strong>Share</strong> button <ShareGlyph /> in your browser.
      </li>
      <li>
        Scroll down and tap <strong>Add to Home Screen</strong>.
      </li>
      <li>
        Open <strong>Paddy's Gate</strong> from your home screen and sign in once.
      </li>
    </ol>
  );
}

/**
 * variant="banner" — card shown under the header; "Not now" hides it for 30 days.
 * variant="nav"    — small header button; always available until the app is installed.
 */
export default function InstallPrompt({ variant = 'banner' }) {
  const [, setTick] = useState(0);
  const [dismissed, setDismissed] = useState(() => wasRecentlyDismissed());
  const [showIOSHelp, setShowIOSHelp] = useState(false);

  // Re-render when Android reports the app is installable or was installed.
  useEffect(() => subscribe(() => setTick((t) => t + 1)), []);

  if (isInstalled()) return null;

  const ios = isIOS();
  const androidReady = canPromptInstall();
  if (!ios && !androidReady) return null; // browser can't install (e.g. Firefox desktop)

  async function handleInstall() {
    if (ios) {
      setShowIOSHelp((v) => !v);
      return;
    }
    await promptInstall();
  }

  function handleDismiss() {
    rememberDismissed();
    setDismissed(true);
  }

  if (variant === 'nav') {
    return (
      <div className="install-nav">
        <button type="button" className="btn-secondary install-nav-btn" onClick={handleInstall}>
          Install app
        </button>
        {ios && showIOSHelp && (
          <div className="install-popover" role="dialog" aria-label="How to install Paddy's Gate">
            <IOSSteps />
            <button type="button" className="btn btn-secondary" onClick={() => setShowIOSHelp(false)}>
              Got it
            </button>
          </div>
        )}
      </div>
    );
  }

  // banner
  if (dismissed) return null;

  return (
    <div className="install-banner" role="region" aria-label="Install Paddy's Gate">
      <img src="/icons/icon-192.png" alt="" className="install-banner-icon" />
      <div className="install-banner-body">
        <strong>Add Paddy's Gate to your home screen</strong>
        {ios ? (
          <IOSSteps />
        ) : (
          <p className="install-banner-text">
            Open it like an app — one tap to message the barn and check on your horse.
          </p>
        )}
        <div className="install-banner-actions">
          {!ios && (
            <button type="button" className="btn" onClick={handleInstall}>
              Install
            </button>
          )}
          <button type="button" className="btn btn-secondary" onClick={handleDismiss}>
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}