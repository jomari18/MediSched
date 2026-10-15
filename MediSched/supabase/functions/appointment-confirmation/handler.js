const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}
export function confirmationMessage(a, sender) {
  const time = new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    dateStyle: 'long',
    timeStyle: 'short'
  }).format(new Date(a.start_at));
  const text = `Hello ${a.patient_name},\n\nYour MediSched appointment is confirmed.\n${a.type_name}\nDoctor: ${a.doctor_name}\nWhen: ${time} (Asia/Manila, UTC+08:00)\nDuration: 1 hour\nReference: ${a.id}\n\nView or cancel your appointment in MediSched. This reflects your booking when confirmation was requested; check your dashboard for the latest status.`;
  const html = `<!doctype html><html lang="en"><body style="background:#100e11;color:#f8f4f5;font-family:Arial,sans-serif;padding:24px"><div style="max-width:520px;margin:auto;padding:28px;background:#1c191e;border:1px solid #40363d;border-radius:14px"><h1 style="color:#ff415a">MediSched</h1><h2>Appointment confirmed</h2><p>Hello ${escapeHtml(a.patient_name)},</p><p>${escapeHtml(a.type_name)}</p><p>Doctor: ${escapeHtml(a.doctor_name)}</p><p>${escapeHtml(time)} (Asia/Manila, UTC+08:00)<br>Duration: 1 hour</p><p>Reference: ${escapeHtml(a.id)}</p><p>View or cancel your appointment in MediSched. Check your dashboard for the latest status.</p></div></body></html>`;
  return {
    sender,
    to: [{ email: a.confirmation_email }],
    subject: 'MediSched appointment confirmation',
    htmlContent: html,
    textContent: text,
    headers: { idempotencyKey: a.id }
  };
}
// Injected adapters keep the exact production handler testable without sending emails.
export function createHandler({
  authenticate,
  claim,
  finish,
  send,
  origins,
  sender,
  configured,
  uuid = () => crypto.randomUUID()
}) {
  return async request => {
    const origin = request.headers.get('origin');
    const allowed = !origin || origins.includes(origin);
    const headers = { 'Content-Type': 'application/json', Vary: 'Origin' };
    if (origin && allowed)
      Object.assign(headers, {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      });
    const reply = (status, body) => new Response(JSON.stringify(body), { status, headers });
    if (!allowed) return reply(403, { error: 'Origin unavailable.' });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return reply(405, { error: 'POST required.' });
    const authorization = request.headers.get('authorization') || '';
    if (!/^Bearer \S+$/i.test(authorization)) return reply(401, { error: 'Sign-in required.' });
    try {
      const user = await authenticate(authorization.slice(7));
      if (!user?.id || !user.email_confirmed_at || user.is_anonymous)
        return reply(401, { error: 'Verified sign-in required.' });
      if (!configured()) return reply(503, { error: 'Notification setup incomplete.' });
      const raw = await request.text();
      if (raw.length > 1024) return reply(400, { error: 'Invalid request.' });
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        return reply(400, { error: 'Invalid request.' });
      }
      if (!body || Object.keys(body).length !== 1 || !UUID.test(body.appointmentId ?? ''))
        return reply(400, { error: 'Only an appointment ID is accepted.' });
      const attemptId = uuid();
      let result;
      try {
        result = await claim(body.appointmentId, user.id, attemptId);
      } catch {
        return reply(403, { error: 'Appointment unavailable.' });
      }
      if (!result.claimed)
        return result.state === 'accepted'
          ? reply(200, { status: 'already_sent' })
          : reply(409, { error: 'Confirmation needs delivery review.', status: result.state });
      let state = 'unknown',
        messageId = null;
      try {
        const response = await send(confirmationMessage(result.appointment, sender));
        // Acceptance is not delivery. A timeout or 5xx may have sent the message.
        if (response.ok) {
          const data = await response.json();
          if (typeof data.messageId === 'string' && data.messageId) {
            state = 'accepted';
            messageId = data.messageId;
          }
        } else if (response.status >= 400 && response.status < 500) state = 'failed';
      } catch {
        /* Do not retry an ambiguous network/provider result. */
      }
      try {
        await finish(body.appointmentId, attemptId, state, messageId);
      } catch {
        return reply(503, { error: 'Confirmation needs delivery review.' });
      }
      return state === 'accepted'
        ? reply(200, { status: 'sent' })
        : reply(502, { error: 'Confirmation email could not be sent.' });
    } catch {
      return reply(503, { error: 'Notification service unavailable.' });
    }
  };
}
