import {
  createCheckinData,
  checkinPayload,
  parseCheckinPayload,
  checkinError,
  passDeadline
} from './checkin.js';
import { element, showDialog, bindDialogViewport } from './workspace.js';
import { formatVisitRange } from './attendance.js';
import { createCameraScanner } from './scanner.js';
function dialog(id, title) {
  const d = element('dialog');
  d.id = id;
  d.setAttribute('aria-labelledby', id + 'Title');
  const body = element('div', null, 'modal-content');
  const heading = element('h2', title);
  heading.id = id + 'Title';
  body.append(heading);
  d.append(body);
  document.body.append(d);
  bindDialogViewport(d);
  return { d, body };
}
function feedback() {
  const p = element('p', null, 'feature-status');
  p.setAttribute('role', 'status');
  p.setAttribute('aria-live', 'polite');
  return p;
}
export function createPatientPass({ getClient, isAuthorized }) {
  const { d, body } = dialog('qrPassDialog', 'Your check-in pass'),
    status = feedback(),
    area = element('div', null, 'qr-area'),
    generate = element('button', 'Generate check-in QR'),
    close = element('button', 'Close pass', 'secondary');
  body.append(
    element(
      'p',
      'Generate your pass when you arrive. Reception scans it, reviews your visit and confirms check-in. The pass contains a random reference, not your patient details.',
      'muted'
    ),
    status,
    area,
    generate,
    close
  );
  let appointment = null,
    epoch = 0,
    timer = null,
    expires = 0,
    cooldown = 0,
    busy = false;
  const clear = () => {
    ++epoch;
    clearInterval(timer);
    timer = null;
    area.replaceChildren();
    appointment = null;
    expires = 0;
    busy = false;
    status.textContent = '';
    generate.disabled = false;
  };
  d.addEventListener('close', clear);
  close.onclick = () => d.close();
  window.addEventListener('pagehide', () => {
    clear();
    if (d.open) d.close();
  });
  generate.onclick = async () => {
    if (busy || !appointment || !isAuthorized() || performance.now() < cooldown) return;
    busy = true;
    generate.disabled = true;
    area.replaceChildren();
    expires = 0;
    status.textContent = 'Generating a private check-in pass…';
    const request = epoch,
      id = appointment.id,
      requestedAt = performance.now();
    cooldown = requestedAt + 30000;
    try {
      const result = await createCheckinData(getClient()).issue(id);
      if (request !== epoch || !d.open || !isAuthorized()) return;
      const payload = checkinPayload(result.token);
      expires = passDeadline(result, requestedAt, performance.now());
      const { qrcode } = await import('./vendor/qrcode-2.0.4.mjs');
      if (request !== epoch || !d.open || !isAuthorized()) return;
      const qr = qrcode(0, 'M');
      qr.addData(payload, 'Byte');
      qr.make();
      const size = qr.getModuleCount(),
        cell = 6,
        canvas = element('canvas');
      canvas.width = canvas.height = (size + 8) * cell;
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', 'Private appointment check-in QR pass');
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#000';
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++)
          if (qr.isDark(y, x)) ctx.fillRect((x + 4) * cell, (y + 4) * cell, cell, cell);
      area.append(canvas);
      // Raw payload exists only in this open dialog, and is removed on close/expiry.
      const label = element('label', 'Reception reference (manual fallback)');
      label.htmlFor = 'qrReference';
      const input = element('input');
      input.id = 'qrReference';
      input.value = payload;
      input.readOnly = true;
      input.autocomplete = 'off';
      area.append(label, input);
    } catch (e) {
      if (request === epoch && d.open) status.textContent = checkinError(e);
    } finally {
      if (request === epoch) {
        busy = false;
        tick();
      }
    }
  };
  function tick() {
    if (!d.open) return;
    const now = performance.now();
    generate.disabled = busy || now < cooldown;
    generate.textContent =
      now < cooldown
        ? 'Generate again in ' + Math.ceil((cooldown - now) / 1000) + 's'
        : cooldown === 0
          ? 'Generate check-in QR'
          : 'Generate a new pass';
    if (expires) {
      const left = Math.ceil((expires - now) / 1000);
      if (left <= 0) {
        expires = 0;
        area.replaceChildren();
        status.textContent = 'Pass expired. Generate a new pass if your visit is still eligible.';
      } else
        status.textContent =
          'Valid for ' +
          Math.floor(left / 60) +
          ':' +
          String(left % 60).padStart(2, '0') +
          ' · Use only at reception.';
    }
  }
  return {
    open(a, trigger) {
      clear();
      appointment = a;
      status.textContent =
        'Available for eligible visits today. Reception can also check you in manually.';
      showDialog(d, trigger);
      timer = setInterval(tick, 1000);
      tick();
    },
    clear() {
      clear();
      if (d.open) d.close();
    }
  };
}
export function createStaffScanner({ getClient, isAuthorized, onSaved, onForbidden }) {
  const { d, body } = dialog('qrScanDialog', 'Scan appointment check-in'),
    status = feedback(),
    video = element('video'),
    start = element('button', 'Start camera', 'secondary'),
    stop = element('button', 'Stop camera', 'secondary'),
    form = element('form'),
    label = element('label', 'Paste reception reference'),
    input = element('input'),
    review = element('button', 'Review pass', 'secondary'),
    details = element('div', null, 'scan-review'),
    confirm = element('button', 'Confirm check-in'),
    close = element('button', 'Close scanner', 'secondary');
  video.muted = true;
  video.playsInline = true;
  video.className = 'scanner-video';
  video.hidden = true;
  label.htmlFor = 'scanReference';
  input.id = 'scanReference';
  input.maxLength = 85;
  input.autocomplete = 'off';
  input.spellcheck = false;
  review.type = 'submit';
  form.append(label, input, review);
  confirm.hidden = true;
  stop.hidden = true;
  body.append(
    element(
      'p',
      'Scan or paste a patient’s current pass, then review the visit before confirming. Camera access requires HTTPS or localhost.',
      'muted'
    ),
    status,
    video,
    start,
    stop,
    form,
    details,
    confirm,
    close
  );
  let epoch = 0,
    pending = null,
    busy = false;
  const scanner = createCameraScanner({
    video,
    onCode: code => {
      video.hidden = true;
      stop.hidden = true;
      input.value = code;
      preview();
    },
    onError: () => {
      video.hidden = true;
      stop.hidden = true;
      status.textContent =
        'Camera unavailable or permission denied. Paste the reception reference below.';
    }
  });
  function clear() {
    ++epoch;
    scanner.stop();
    video.hidden = true;
    stop.hidden = true;
    input.value = '';
    details.replaceChildren();
    confirm.hidden = true;
    pending = null;
    busy = false;
    confirm.disabled = false;
    review.disabled = false;
    start.disabled = false;
    status.textContent = '';
  }
  d.addEventListener('close', clear);
  close.onclick = () => d.close();
  window.addEventListener('pagehide', () => {
    clear();
    if (d.open) d.close();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      scanner.stop();
      video.hidden = true;
      stop.hidden = true;
    }
  });
  start.onclick = () => {
    if (busy || pending || !isAuthorized()) return;
    video.hidden = false;
    stop.hidden = false;
    status.textContent = 'Requesting camera access…';
    scanner.start();
  };
  stop.onclick = () => {
    scanner.stop();
    video.hidden = true;
    stop.hidden = true;
    status.textContent = 'Camera stopped. Manual entry is available.';
  };
  form.onsubmit = e => {
    e.preventDefault();
    preview();
  };
  async function preview() {
    if (busy || pending || !isAuthorized()) return;
    const token = parseCheckinPayload(input.value);
    if (!token) {
      status.textContent = 'Use a MediSched check-in reference, not a URL or patient details.';
      return;
    }
    scanner.stop();
    video.hidden = true;
    stop.hidden = true;
    busy = true;
    review.disabled = true;
    const request = epoch;
    details.replaceChildren();
    confirm.hidden = true;
    status.textContent = 'Checking pass and clinic access…';
    try {
      const result = await createCheckinData(getClient()).preview(token);
      if (request !== epoch || !d.open || !isAuthorized()) return;
      pending = {
        token,
        actionId: crypto.randomUUID(),
        version: result.version,
        appointmentId: result.appointment_id,
        startAt: result.start_at
      };
      details.append(
        element('h3', result.patient_name),
        element('p', result.doctor_name + ' · ' + result.type_name),
        element('p', formatVisitRange(result))
      );
      confirm.hidden = false;
      start.disabled = true;
      input.value = '';
      input.disabled = true;
      review.disabled = true;
      status.textContent = 'Review this visit. Scanning alone does not check the patient in.';
    } catch (e) {
      if (request === epoch) {
        status.textContent = checkinError(e);
        if (e.code === '42501') onForbidden?.(e);
      }
    } finally {
      if (request === epoch) {
        busy = false;
        review.disabled = Boolean(pending);
      }
    }
  }
  confirm.onclick = async () => {
    if (!pending || busy || !isAuthorized()) return;
    const operation = pending,
      request = epoch;
    busy = true;
    confirm.disabled = true;
    status.textContent = 'Confirming check-in…';
    try {
      const r = await createCheckinData(getClient()).consume(
        operation.token,
        operation.actionId,
        operation.version
      );
      if (request !== epoch || !d.open || !isAuthorized()) return;
      if (r.action_id !== operation.actionId || r.appointment_id !== operation.appointmentId)
        throw Error('Incomplete save response');
      clear();
      d.close();
      await onSaved(r, { startAt: operation.startAt });
    } catch (e) {
      if (request !== epoch) return;
      status.textContent = checkinError(e);
      if (e.code === '42501') {
        onForbidden?.(e);
        clear();
        d.close();
      } else if (['22023', '40001'].includes(e.code)) {
        pending = null;
        confirm.hidden = true;
        details.replaceChildren();
        input.disabled = false;
        start.disabled = false;
        review.disabled = false;
      } else confirm.textContent = 'Retry same check-in';
    } finally {
      if (request === epoch) {
        busy = false;
        confirm.disabled = false;
      }
    }
  };
  return {
    open(trigger) {
      clear();
      input.disabled = false;
      confirm.textContent = 'Confirm check-in';
      showDialog(d, trigger);
      input.focus();
    },
    clear() {
      clear();
      input.disabled = false;
      if (d.open) d.close();
    }
  };
}
