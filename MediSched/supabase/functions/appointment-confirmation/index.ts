import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
import { createHandler } from './handler.js';
const env = (name: string) => Deno.env.get(name) || '';
const url = env('SUPABASE_URL'),
  anon = env('SUPABASE_ANON_KEY'),
  service = env('SUPABASE_SERVICE_ROLE_KEY');
const options = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
};
const auth = createClient(url, anon, options),
  admin = createClient(url, service, options);
const sender = { name: env('BREVO_SENDER_NAME'), email: env('BREVO_SENDER_EMAIL') };
const origins = env('MEDISCHED_ALLOWED_ORIGINS')
  .split(',')
  .map(v => v.trim())
  .filter(Boolean);
Deno.serve(
  createHandler({
    origins,
    sender,
    configured: () =>
      Boolean(
        env('BREVO_API_KEY') &&
          sender.name &&
          /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sender.email) &&
          origins.length
      ),
    authenticate: async (token: string) => {
      const { data, error } = await auth.auth.getUser(token);
      return error ? null : data.user;
    },
    claim: async (id: string, uid: string, attempt: string) => {
      const { data, error } = await admin.rpc('claim_appointment_confirmation', {
        p_appointment_id: id,
        p_owner_uid: uid,
        p_attempt_id: attempt
      });
      if (error) throw error;
      return data;
    },
    finish: async (id: string, attempt: string, state: string, message: string | null) => {
      const { error } = await admin.rpc('finish_appointment_confirmation', {
        p_appointment_id: id,
        p_attempt_id: attempt,
        p_state: state,
        p_message_id: message
      });
      if (error) throw error;
    },
    send: (body: unknown) =>
      fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': env('BREVO_API_KEY'),
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000)
      })
  })
);
