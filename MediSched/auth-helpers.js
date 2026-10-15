export const AUTH_STORAGE_KEY = 'medisched.supabase.auth';
export function isConfirmed(user) {
  return Boolean(user?.id && user.email_confirmed_at && !user.is_anonymous);
}
export function validatePublicConfig(settings) {
  const { url, publishableKey } = settings.supabase ?? {};
  if (!url || !publishableKey)
    throw Error(
      'Supabase is not configured. Add the separate MediSched project URL and public key in config.js; see README.md.'
    );
  const parsed = new URL(url);
  if (parsed.username || parsed.password || parsed.search || parsed.hash)
    throw Error('Use only the project API URL, without passwords, query parameters or fragments.');
  if (
    parsed.protocol !== 'https:' &&
    !(['localhost', '127.0.0.1'].includes(parsed.hostname) && parsed.protocol === 'http:')
  )
    throw Error('Use an HTTPS Supabase URL or the local Supabase URL.');
  if (publishableKey.startsWith('sb_secret_'))
    throw Error(
      'A secret key must never be used in browser configuration. Use a publishable/anon key.'
    );
  if (!publishableKey.startsWith('sb_publishable_')) {
    try {
      const payload = JSON.parse(
        atob(publishableKey.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))
      );
      if (payload.role !== 'anon') throw Error();
    } catch {
      throw Error('Use a Supabase publishable key or legacy anon key, never a service-role key.');
    }
  }
  return { url: parsed.href.replace(/\/$/, ''), publishableKey };
}
export function callbackInfo(url) {
  const query = url.searchParams,
    hash = new URLSearchParams(url.hash.slice(1));
  return {
    code: query.get('code'),
    error:
      query.get('error_description') ||
      hash.get('error_description') ||
      query.get('error') ||
      hash.get('error'),
    accessToken: hash.get('access_token'),
    refreshToken: hash.get('refresh_token')
  };
}
export function friendlyError(error) {
  const code = error?.code;
  if (code === 'email_not_confirmed')
    return 'Verify your email before signing in. Use Resend verification if needed.';
  if (code === 'invalid_credentials') return 'Email or password is incorrect.';
  if (code === 'otp_expired')
    return 'The email code is invalid or expired. Request a new code when the resend cooldown ends.';
  if (['over_email_send_rate_limit', 'over_request_rate_limit'].includes(code))
    return 'Too many attempts. Wait before trying again.';
  if (code === 'weak_password') return 'Choose a stronger password with at least 8 characters.';
  if (code === '23P01') return 'This doctor is unavailable at that time. Choose another slot.';
  if (code === '42501') return 'Verified sign-in required, or this appointment is unavailable.';
  const message = typeof error === 'string' ? error : error?.message || '';
  if (
    error?.status === 0 ||
    error?.name === 'AuthRetryableFetchError' ||
    /failed to fetch|networkerror|network request failed|load failed/i.test(message)
  )
    return 'We could not connect. Check your internet connection and try again.';
  return error?.message || 'The operation failed. Please try again.';
}
