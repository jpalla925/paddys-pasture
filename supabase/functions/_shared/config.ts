// supabase/functions/_shared/config.ts
// Single source of truth for the app's public base URL.
// Anything that builds a link into an email or text message reads it
// from here, so a domain change is one secret instead of a grep.

const APP_URL = Deno.env.get('APP_URL')

export function appUrl(path = ''): string {
  if (!APP_URL) {
    throw new Error('APP_URL is not set')
  }
  // Tolerate a trailing slash on the secret or a missing leading slash on the path.
  const base = APP_URL.replace(/\/+$/, '')
  const suffix = path ? (path.startsWith('/') ? path : `/${path}`) : ''
  return base + suffix
}