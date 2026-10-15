// Presentation adapters reuse the existing form controls and their event handlers.
// Availability, validation, authentication and writes remain in script.js.
import { element } from './workspace.js';
const $ = id => document.getElementById(id);
if (document.body.dataset.page === 'auth') {
  const openAccount = () => {
    document.body.classList.add('account-view');
    window.scrollTo({ top: 0 });
  };
  document.querySelectorAll('[data-switch]').forEach(b => b.addEventListener('click', openAccount));
  new MutationObserver(() => {
    if (!$('verifyPanel').hidden) openAccount();
  }).observe($('verifyPanel'), { attributes: true, attributeFilter: ['hidden'] });
  if (!$('verifyPanel').hidden) openAccount();
}
if ($('scheduleForm')) {
  const form = $('scheduleForm'),
    grid = form.querySelector('.form-grid');
  const section = (number, title) => {
    const s = element('section', null, 'booking-column');
    const h = element('h3');
    h.append(element('span', number, 'step-number'), document.createTextNode(title));
    s.append(h);
    return s;
  };
  const patient = section('01', 'Patient details'),
    visit = section('02', 'Visit details'),
    summary = section('03', 'Your appointment');
  summary.classList.add('booking-summary');
  grid.append(patient, visit, summary);
  ['patientName', 'patientAge', 'patientAddress'].forEach(id =>
    patient.append($(id).parentElement)
  );
  ['doctorName', 'appointmentType', 'appointmentDate', 'appointmentTime'].forEach(id =>
    visit.append($(id).parentElement)
  );
  const slots = element('div', null, 'slot-buttons');
  slots.setAttribute('role', 'group');
  slots.setAttribute('aria-label', 'Available start times');
  $('appointmentTime').after(slots);
  visit.append(form.querySelector('.availability-feedback'));
  const art = element('img');
  art.src = 'assets/medical-pack/illustrations/booking-auth-medical-still-life.png';
  art.alt = '';
  art.width = 300;
  art.height = 230;
  summary.append(art);
  const details = element('dl', null, 'booking-summary-details');
  summary.append(details, form.querySelector('.form-actions'));
  $('closeModal').textContent = 'Back to dashboard';
  grid.replaceChildren(patient, visit, summary);
  const text = (id, fallback) => {
    const control = $(id);
    return control.tagName === 'SELECT'
      ? control.value
        ? control.selectedOptions[0]?.textContent
        : fallback
      : control.value.trim() || fallback;
  };
  const syncSummary = () => {
    details.replaceChildren();
    for (const [label, value] of [
      ['Appointment type', text('appointmentType', 'Choose a visit')],
      ['Doctor', text('doctorName', 'Choose a doctor')],
      ['Date', text('appointmentDate', 'Choose a date')],
      ['Start time · 1 hour', text('appointmentTime', 'Choose an available time')],
      ['Patient', text('patientName', 'Your name')]
    ]) {
      const row = element('div');
      row.append(element('dd', value), element('dt', label));
      details.append(row);
    }
  };
  let optionSignature = '';
  const syncSlots = () => {
    const select = $('appointmentTime'),
      options = [...select.options].filter(o => o.value);
    const signature = JSON.stringify(options.map(o => [o.value, o.textContent]));
    if (signature !== optionSignature) {
      optionSignature = signature;
      slots.replaceChildren();
      for (const option of options) {
        const button = element('button', option.textContent.split(' – ')[0], 'secondary');
        button.dataset.slot = option.value;
        button.setAttribute('aria-label', option.textContent);
        button.type = 'button';
        button.addEventListener('click', () => {
          if (select.disabled) return;
          select.value = option.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
        });
        slots.append(button);
      }
    }
    for (const button of slots.children) {
      button.disabled = select.disabled;
      button.setAttribute('aria-pressed', String(select.value === button.dataset.slot));
    }
    syncSummary();
  };
  form.addEventListener('input', syncSummary);
  form.addEventListener('change', syncSlots);
  form.addEventListener('reset', () => queueMicrotask(syncSlots));
  new MutationObserver(syncSlots).observe($('appointmentTime'), {
    childList: true,
    attributes: true,
    attributeFilter: ['disabled']
  });
  new MutationObserver(syncSummary).observe($('scheduleModal'), {
    attributes: true,
    attributeFilter: ['open']
  });
  syncSlots();
}
