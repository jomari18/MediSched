const TOKEN = /^[a-f0-9]{64}$/;
const PAYLOAD = /^medisched:checkin:v1:([a-f0-9]{64})$/;
export function parseCheckinPayload(value) {
  const m = typeof value === 'string' && value.match(PAYLOAD);
  return m && m[0] === value ? m[1] : null;
}
export function checkinPayload(token) {
  if (typeof token !== 'string' || token.length !== 64 || !TOKEN.test(token))
    throw Error('Invalid check-in reference');
  return 'medisched:checkin:v1:' + token;
}
export function passDeadline(result, requestedAt, now) {
  const duration = Date.parse(result.expires_at) - Date.parse(result.server_now),
    deadline = requestedAt + duration;
  if (
    !Number.isFinite(duration) ||
    duration <= 0 ||
    duration > 600000 ||
    !Number.isFinite(deadline) ||
    deadline <= now
  )
    throw Error('Expired or invalid pass');
  return deadline;
}
export function createCheckinData(client) {
  const rpc = async (name, args) => {
    const { data, error } = await client.rpc(name, args);
    if (error) throw error;
    if (!data) throw Error('No check-in response received');
    return data;
  };
  return {
    issue: id => rpc('issue_appointment_checkin_pass', { p_appointment_id: id }),
    preview: token => rpc('preview_appointment_checkin_pass', { p_token: token }),
    consume: (token, actionId, version) =>
      rpc('consume_appointment_checkin_pass', {
        p_token: token,
        p_action_id: actionId,
        p_expected_version: version
      })
  };
}
export function checkinError(error) {
  if (['PGRST202', '42883'].includes(error?.code))
    return 'QR check-in awaits administrator setup (migration 007).';
  if (error?.code === '55000') return 'Please wait 30 seconds before generating another pass.';
  if (error?.code === '42501') return 'Verified account access is required for this action.';
  if (['22023', '40001'].includes(error?.code))
    return 'Pass expired, replaced or appointment changed. Refresh and request a new pass if eligible.';
  return 'Request could not be confirmed. Check your connection. For check-in, retry the same confirmation before scanning again.';
}
