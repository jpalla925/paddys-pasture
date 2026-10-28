// Captures the browser's "this app can be installed" signal as early as possible
// and exposes small helpers for the InstallPrompt component.
//
// Imported once at the top of main.jsx so the listener exists before React renders.
// Android/desktop Chrome fire `beforeinstallprompt` early in page load; if nobody is
// listening, the event is lost until the next visit.

const DISMISS_KEY = 'pg_install_dismissed_at';
const DISMISS_DAYS = 30;

let deferredPrompt = null;   // the saved beforeinstallprompt event (Android/desktop only)
const listeners = new Set(); // components that want to know when availability changes

function notify() {
  listeners.forEach((fn) => fn());
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();      // stop Chrome's own mini-infobar; we show our own button
    deferredPrompt = e;
    notify();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notify();
  });
}

// True when the app was launched from the home screen / as an installed app.
export function isInstalled() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true // older iPhone Safari
  );
}

// iPhone, iPod, or iPad (iPadOS reports itself as a Mac, so check for touch too).
export function isIOS() {
  const ua = window.navigator.userAgent || '';
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1)
  );
}

// True when Android/desktop Chrome has said the app can be installed.
export function canPromptInstall() {
  return deferredPrompt !== null;
}

// Opens the browser's install dialog. Returns 'accepted', 'dismissed', or 'unavailable'.
export async function promptInstall() {
  if (!deferredPrompt) return 'unavailable';
  const e = deferredPrompt;
  deferredPrompt = null; // each saved event can only be used once
  e.prompt();
  const { outcome } = await e.userChoice;
  notify();
  return outcome;
}

// "Not now" handling. localStorage can be blocked (private browsing), so every
// access is wrapped; if it fails, the prompt simply shows again next time.
export function wasRecentlyDismissed() {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY));
    return Boolean(at) && Date.now() - at < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

export function rememberDismissed() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

// Lets a component re-render when install availability changes.
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}