import { settings } from './config.js';
import { validatePublicConfig, friendlyError } from './auth-helpers.js';
import { otpConfig } from './otp.js';
import { createPasswordRecovery } from './password-recovery.js';

export function mountPasswordRecovery({
  status,
  showPanel,
  isReady,
  isNormalBusy,
  getNormalClient,
  clearNormalSession
}) {
  const $ = id => document.getElementById(id),
    options = otpConfig(settings);
  const link = document.createElement('button');
  link.id = 'forgotPassword';
  link.type = 'button';
  link.className = 'text-button';
  link.textContent = 'Forgot password?';
  $('loginForm').after(link);
  const panel = document.createElement('section');
  panel.id = 'recoveryPanel';
  panel.hidden = true;
  panel.innerHTML = `<h2>Reset your password</h2><p>Enter your account email. Then enter the recovery code from your email here.</p>
    <form id="recoveryEmailForm"><label for="recoveryEmail">Email</label><input id="recoveryEmail" type="email" autocomplete="email" required><button id="recoveryRequest" type="submit">Send recovery code</button></form>
    <form id="recoveryCodeForm" hidden><label for="recoveryCode">${options.otpLength}-digit recovery code</label><input id="recoveryCode" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{${options.otpLength}}" minlength="${options.otpLength}" maxlength="${options.otpLength}" required><button id="recoveryVerify" type="submit">Verify recovery code</button></form>
    <form id="recoveryPasswordForm" hidden><label for="recoveryPassword">New password (at least 8 characters)</label><input id="recoveryPassword" type="password" autocomplete="new-password" minlength="8" required><label for="recoveryConfirmation">Confirm new password</label><input id="recoveryConfirmation" type="password" autocomplete="new-password" minlength="8" required><button id="recoverySave" type="submit">Update password</button></form>
    <button id="recoveryFinish" class="secondary" hidden>Finish signing out</button><button id="recoveryBack" class="text-button">Back to sign in</button>`;
  $('loginPanel').parentElement.append(panel);
  let authPromise,
    flow,
    busy = false;
  const clearPasswords = () => {
    for (const id of ['recoveryPassword', 'recoveryConfirmation']) $(id).value = '';
  };
  async function ensureFlow() {
    if (!isReady()) throw Error('Supabase is not ready. Wait for the connection and try again.');
    if (!authPromise)
      authPromise = (async () => {
        const config = validatePublicConfig(settings),
          { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.117.3');
        // Separate storage key prevents cross-tab events from reaching normal sign-in.
        const recovery = createClient(config.url, config.publishableKey, {
          auth: {
            storageKey: 'medisched.recovery.memory',
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
            flowType: 'implicit'
          }
        });
        return createPasswordRecovery({ auth: recovery.auth, ...options });
      })().catch(error => {
        authPromise = null;
        throw error;
      });
    flow = await authPromise;
    return flow;
  }
  function render() {
    const state = flow?.snapshot();
    panel.querySelectorAll('button,input').forEach(control => (control.disabled = busy));
    $('recoveryRequest').disabled =
      busy || !isReady() || Boolean(state?.remaining) || Boolean(state?.passwordUpdated);
    $('recoveryRequest').textContent = state?.remaining
      ? `Resend available in ${state.remaining}s`
      : state?.requested
        ? 'Resend recovery code'
        : 'Send recovery code';
    $('recoveryCodeForm').hidden = !state?.requested || state?.verified || state?.passwordUpdated;
    $('recoveryPasswordForm').hidden = !state?.verified || state?.passwordUpdated;
    $('recoveryFinish').hidden = !state?.passwordUpdated;
    $('recoveryEmail').disabled = busy || Boolean(state?.passwordUpdated);
    link.disabled = busy || isNormalBusy();
    document
      .querySelectorAll('[data-switch]')
      .forEach(button => (button.disabled = busy || isNormalBusy()));
  }
  async function run(operation) {
    if (busy) return;
    busy = true;
    panel.setAttribute('aria-busy', 'true');
    render();
    try {
      await operation();
    } catch (error) {
      status(
        error?.code === 'same_password'
          ? 'Choose a different password from your current password.'
          : friendlyError(error)
      );
    } finally {
      busy = false;
      panel.removeAttribute('aria-busy');
      render();
    }
  }
  async function complete() {
    clearPasswords();
    $('recoveryCode').value = '';
    const email = flow.snapshot().email;
    // Do not end an unrelated user's regular session.
    const result = await getNormalClient().auth.getSession();
    if (result.error) throw result.error;
    if (result.data?.session?.user?.email?.toLowerCase() === email)
      await clearNormalSession('local');
    $('loginEmail').value = email;
    showPanel('login', { preserveStatus: true });
    status('Password updated. Sign in again with your new password.');
  }
  link.addEventListener('click', () => {
    if (isNormalBusy()) return;
    run(async () => {
      if (flow) await flow.cancel();
      clearPasswords();
      $('recoveryCode').value = '';
      $('recoveryEmail').value = $('loginEmail').value.trim();
      showPanel('recovery');
      render();
      $('recoveryEmail').focus();
    });
  });
  $('recoveryEmail').addEventListener('input', () => {
    clearPasswords();
    $('recoveryCode').value = '';
    if (flow)
      run(async () => {
        await flow.setEmail($('recoveryEmail').value);
        status('Enter your email and request a recovery code.');
      });
  });
  $('recoveryEmailForm').addEventListener('submit', e => {
    e.preventDefault();
    run(async () => {
      status('Requesting recovery code…');
      clearPasswords();
      $('recoveryCode').value = '';
      await (await ensureFlow()).request($('recoveryEmail').value);
      status(
        'If an account exists for that email, a recovery code has been sent. Check your inbox and spam folder.'
      );
      render();
      $('recoveryCode').focus();
    });
  });
  $('recoveryCodeForm').addEventListener('submit', e => {
    e.preventDefault();
    run(async () => {
      status('Verifying recovery code…');
      try {
        await (await ensureFlow()).verify($('recoveryCode').value);
        status('Recovery code verified. Choose your new password.');
      } finally {
        $('recoveryCode').value = '';
        render();
      }
      $('recoveryPassword').focus();
    });
  });
  $('recoveryPasswordForm').addEventListener('submit', e => {
    e.preventDefault();
    run(async () => {
      status('Updating password…');
      try {
        await flow.update($('recoveryPassword').value, $('recoveryConfirmation').value);
        await complete();
      } finally {
        clearPasswords();
      }
    });
  });
  $('recoveryFinish').addEventListener('click', () =>
    run(async () => {
      await flow.finish();
      await complete();
    })
  );
  $('recoveryBack').addEventListener('click', () =>
    run(async () => {
      clearPasswords();
      $('recoveryCode').value = '';
      if (flow) await flow.cancel();
      showPanel('login');
    })
  );
  // Main navigation can leave this panel too; clear recovery authority before switching.
  document.querySelectorAll('[data-switch]').forEach(button =>
    button.addEventListener('click', () => {
      if (busy || isNormalBusy()) return;
      clearPasswords();
      $('recoveryCode').value = '';
      if (flow)
        run(async () => {
          await flow.cancel();
          showPanel(button.dataset.switch);
        });
    })
  );
  setInterval(render, 1000);
  render();
  return { isBusy: () => busy };
}
