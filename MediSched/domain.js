export const TIMEZONE = 'Asia/Manila';
export const DURATION = 60 * 60 * 1000;
export const DOCTORS = [
  ['dr-smith', 'Dr. Smith'],
  ['dr-johnson', 'Dr. Johnson'],
  ['dr-williams', 'Dr. Williams'],
  ['dr-brown', 'Dr. Brown'],
  ['dr-liza-torres', 'Dr. Liza Torres'],
  ['dr-miguel', 'Dr. Miguel'],
  ['dr-karen', 'Dr. Karen'],
  ['dr-mark', 'Dr. Mark'],
  ['dr-garcia', 'Dr. Garcia']
].map(([id, name]) => ({ id, name }));
export const TYPES = [
  ['general-check-up', 'General Check-up'],
  ['dental-cleaning', 'Dental Cleaning'],
  ['follow-up-consultation', 'Follow-up Consultation'],
  ['vaccination', 'Vaccination'],
  ['therapy-session', 'Therapy Session'],
  ['dermatology', 'Dermatology'],
  ['telemedicine-appointment', 'Telemedicine Appointment'],
  ['prenatal-check-up', 'Prenatal Check-up'],
  ['cardiology-consultation', 'Cardiology Consultation'],
  ['laboratory-test', 'Laboratory Test']
].map(([id, name]) => ({ id, name }));
export function validateAppointment(
  input,
  now = Date.now(),
  catalogs = { doctors: DOCTORS, types: TYPES }
) {
  const value = {};
  for (const key of ['patientName', 'patientAddress', 'doctor', 'type', 'date', 'time']) {
    if (typeof input?.[key] !== 'string') throw Error('Complete all appointment fields.');
    value[key] = input[key].trim();
  }
  if (
    !value.patientName ||
    value.patientName.length > 120 ||
    !value.patientAddress ||
    value.patientAddress.length > 300
  )
    throw Error('Enter a name (up to 120 characters) and address (up to 300).');
  if (
    !catalogs.doctors.some(d => d.id === value.doctor) ||
    !catalogs.types.some(t => t.id === value.type)
  )
    throw Error('Choose a listed doctor and appointment type.');
  if (
    !['string', 'number'].includes(typeof input.patientAge) ||
    (typeof input.patientAge === 'string' && !input.patientAge.trim())
  )
    throw Error('Enter an age from 0 to 120.');
  value.patientAge = Number(input.patientAge);
  if (!Number.isInteger(value.patientAge) || value.patientAge < 0 || value.patientAge > 120)
    throw Error('Enter a whole-number age from 0 to 120.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.date) || !/^\d{2}:\d{2}$/.test(value.time))
    throw Error('Enter a valid date and time.');
  const [hour, minute] = value.time.split(':').map(Number);
  if (hour > 23 || minute > 59 || minute % 15)
    throw Error('Choose a start time on a 15-minute boundary.');
  value.startMs = Date.parse(`${value.date}T${value.time}:00+08:00`);
  if (
    !Number.isFinite(value.startMs) ||
    new Date(value.startMs + 8 * 3600000).toISOString().slice(0, 16) !==
      `${value.date}T${value.time}`
  )
    throw Error('Enter a valid calendar date.');
  if (value.startMs <= now) throw Error('Choose a future appointment time (Philippine time).');
  value.endMs = value.startMs + DURATION;
  value.start_at = new Date(value.startMs).toISOString();
  return value;
}
export function overlaps(a, b) {
  return a.startMs < b.endMs && b.startMs < a.endMs;
}
export function appointmentStatus(a, now = Date.now()) {
  if (a.status === 'cancelled') return 'cancelled';
  const start = Date.parse(a.start_at);
  return Number.isFinite(start) ? (start > now ? 'upcoming' : 'past') : 'needs-review';
}
export function manilaDateTime(timestamp) {
  const ms = Date.parse(timestamp);
  if (!Number.isFinite(ms)) throw Error('Invalid saved appointment time.');
  const local = new Date(ms + 8 * 3600000).toISOString();
  return { date: local.slice(0, 10), time: local.slice(11, 16) };
}
export function bookingParameters(requestId, value) {
  return {
    p_request_id: requestId,
    p_doctor_id: value.doctor,
    p_type_id: value.type,
    p_patient_name: value.patientName,
    p_patient_address: value.patientAddress,
    p_patient_age: value.patientAge,
    p_start_at: value.start_at
  };
}
