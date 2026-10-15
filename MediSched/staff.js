import { createStaffScanner } from './checkin-ui.js';
import { createAnalyticsView } from './analytics-ui.js';
import { initializeSession } from './session.js';
import { createStaffData } from './staff-data.js';
import { element, mountWorkspace, confirmAction, showDialog } from './workspace.js';
import { formatVisitRange, attendanceLabel } from './attendance.js';
import { manilaDateTime } from './domain.js';
import { friendlyError } from './auth-helpers.js';
const $ = id => document.getElementById(id),
  labels = {
    check_in: 'Check in',
    start_consultation: 'Start consultation',
    complete: 'Complete',
    no_show: 'Mark no show'
  };
let auth = null,
  api = null,
  workspace = null,
  generation = 0,
  cursor = null,
  pageNumber = 1,
  view = 'home',
  pending = null,
  working = false,
  searchTimer;
const message = text => ($('staffStatus').textContent = text);
const scanner = createStaffScanner({
  getClient: () => auth?.client,
  isAuthorized: () => Boolean(auth?.access.is_staff),
  onSaved: async (r, visit) => {
    analytics.hide();
    $('staffDate').value = manilaDateTime(visit.startAt).date;
    $('staffDoctor').value = '';
    $('staffSearch').value = '';
    view = 'appointments';
    workspace?.setView('appointments');
    $('staffScheduleCard').hidden = false;
    $('schedulePanel').hidden = false;
    $('activityPanel').hidden = true;
    $('metrics').hidden = false;
    $('searchField').hidden = false;
    $('staffTitle').textContent = 'Daily schedule';
    message(
      r.replayed ? 'Check-in already recorded. Refreshing the current schedule.' : 'Check-in saved.'
    );
    await refresh({ quiet: true, reset: true });
  },
  onForbidden: forbidden
});
const analytics = createAnalyticsView({ getAuth: () => auth, onForbidden: forbidden });
function clear() {
  scanner.clear();
  analytics.clear();
  auth = null;
  api = null;
  ++generation;
  pending = null;
  working = false;
  document.querySelectorAll('dialog[open]').forEach(d => d.close(''));
  for (const id of ['staffRows', 'activityRows', 'metrics', 'detailsBody']) $(id).replaceChildren();
  $('staffContent').hidden = true;
  $('retryAttendance').hidden = true;
  delete $('retryAttendance').dataset.busy;
  $('retryAttendance').disabled = false;
  $('gateStatus').hidden = false;
}
function query() {
  return {
    date: $('staffDate').value,
    doctorId: $('staffDoctor').value,
    search: $('staffSearch').value,
    cursor
  };
}
function validScheduleDate() {
  const input = $('staffDate');
  if (input.value && input.checkValidity()) {
    input.removeAttribute('aria-invalid');
    return true;
  }
  ++generation;
  cursor = null;
  pageNumber = 1;
  input.setAttribute('aria-invalid', 'true');
  message('Choose a valid date to view the clinic schedule.');
  for (const id of ['staffRows', 'activityRows', 'metrics']) $(id).replaceChildren();
  $(view === 'activity' ? 'activityRows' : 'staffRows').append(
    element('p', 'Select a date above to load visits and activity.', 'empty-state')
  );
  $('pageLabel').textContent = '';
  $('nextPage').disabled = true;
  $('firstPage').disabled = true;
  $('refreshSchedule').disabled = false;
  return false;
}
async function forbidden(error) {
  if (error?.code === '42501') {
    const controller = auth?.controller;
    clear();
    message('Clinic access has ended.');
    try {
      await controller?.refresh();
    } catch {}
    return true;
  }
  return false;
}
function metrics(totals) {
  $('metrics').replaceChildren();
  for (const [key, label] of [
    ['total', 'Appointments'],
    ['checked_in', 'Checked in'],
    ['completed', 'Completed'],
    ['no_show', 'No show']
  ]) {
    const card = element('div', null, 'metric card');
    card.append(element('p', label, 'small'), element('strong', String(totals[key] ?? 0)));
    $('metrics').append(card);
  }
}
function details(row, trigger) {
  $('detailsBody').replaceChildren();
  for (const text of [
    row.patient_name,
    row.type_name,
    row.doctor_name,
    formatVisitRange(row),
    attendanceLabel(row, { state: row.attendance_state })
  ])
    $('detailsBody').append(element('p', text));
  showDialog($('detailsDialog'), trigger);
}
function renderRows(rows) {
  const container = $('staffRows');
  container.replaceChildren();
  if (!rows.length) {
    container.append(element('p', 'No appointments match these filters.', 'empty-state'));
    return;
  }
  const table = element('table', null, 'staff-table'),
    head = element('thead'),
    tr = element('tr');
  for (const text of ['Patient', 'Visit', 'Progress', 'Actions']) tr.append(element('th', text));
  head.append(tr);
  table.append(head);
  const body = element('tbody');
  for (const row of rows) {
    const r = element('tr');
    const cell = label => {
      const c = element('td');
      c.dataset.label = label;
      r.append(c);
      return c;
    };
    cell('Patient').append(element('strong', row.patient_name));
    const visit = cell('Visit');
    visit.append(
      element('p', formatVisitRange(row)),
      element('p', row.doctor_name, 'small'),
      element('p', row.type_name, 'small')
    );
    cell('Progress').append(
      element('span', attendanceLabel(row, { state: row.attendance_state }), 'badge')
    );
    const actions = cell('Actions'),
      buttons = element('div', null, 'row-actions'),
      detail = element('button', 'Details', 'secondary');
    detail.addEventListener('click', () => details(row, detail));
    buttons.append(detail);
    for (const action of row.allowed_actions || []) {
      if (
        !labels[action] ||
        (action === 'complete' && row.allowed_actions.includes('start_consultation'))
      )
        continue;
      const b = element('button', labels[action]);
      b.dataset.attendanceAction = action;
      b.disabled = Boolean(pending) || working;
      b.addEventListener('click', () => change(row, action));
      buttons.append(b);
    }
    actions.append(buttons);
    body.append(r);
  }
  table.append(body);
  container.append(table);
}
function renderActivity(rows) {
  $('activityRows').replaceChildren();
  if (!rows.length) {
    $('activityRows').append(element('p', 'No recorded activity for this day.', 'empty-state'));
    return;
  }
  for (const row of rows) {
    const card = element('article', null, 'activity-item');
    card.append(
      element('strong', row.event_type.replaceAll('_', ' ')),
      element('p', row.patient_name + ' · ' + row.doctor_name),
      element(
        'p',
        manilaDateTime(row.occurred_at).date +
          ' · ' +
          manilaDateTime(row.occurred_at).time +
          ' · ' +
          row.actor_name +
          ' (' +
          row.actor_role +
          ')',
        'small'
      )
    );
    $('activityRows').append(card);
  }
}
async function refresh({ reset = false, quiet = false } = {}) {
  if (!auth) return;
  if (view === 'analytics') {
    await analytics.load();
    return;
  }
  if (!validScheduleDate()) return;
  if (reset) {
    cursor = null;
    pageNumber = 1;
  }
  const request = ++generation,
    epoch = auth.epoch,
    q = query(),
    activity = view === 'activity';
  $('refreshSchedule').disabled = true;
  $('nextPage').disabled = true;
  if (!quiet) message('Loading clinic schedule…');
  try {
    const result = await (activity ? api.activity(q) : api.appointments(q));
    if (request !== generation || !auth || epoch !== auth.epoch) return;
    if (activity) renderActivity(result.items);
    else {
      metrics(result.totals);
      renderRows(result.items);
    }
    $('pageLabel').textContent = 'Page ' + pageNumber;
    $('firstPage').disabled = pageNumber === 1;
    $('nextPage').disabled = !result.next_cursor;
    $('nextPage').onclick = () => {
      cursor = result.next_cursor;
      pageNumber++;
      refresh();
    };
    if (!quiet) message('');
  } catch (error) {
    if (request !== generation || !auth || epoch !== auth.epoch) return;
    if (await forbidden(error)) return;
    message('Schedule could not be loaded. ' + friendlyError(error));
    for (const id of ['staffRows', 'activityRows', 'metrics']) $(id).replaceChildren();
  } finally {
    if (request === generation) $('refreshSchedule').disabled = false;
  }
}
async function change(row, action) {
  if (pending || working || !auth) return;
  const uid = auth.user.id;
  working = true;
  try {
    if (
      !(await confirmAction({
        title: labels[action] + '?',
        message:
          row.patient_name +
          ' · ' +
          formatVisitRange(row) +
          '. This records the clinic outcome and cannot be reversed here.',
        confirmLabel: 'Confirm ' + labels[action].toLowerCase()
      }))
    )
      return;
    if (!auth || auth.user.id !== uid || !auth.access.is_staff) return;
    pending = {
      appointmentId: row.id,
      action,
      actionId: crypto.randomUUID(),
      expectedVersion: row.version
    };
    working = false;
    await savePending();
  } finally {
    if (auth?.user.id === uid) working = false;
  }
}
async function savePending() {
  if (!pending || !auth || $('retryAttendance').dataset.busy) return;
  const operation = pending,
    uid = auth.user.id;
  const stillCurrent = () => pending === operation && auth?.user.id === uid && auth.access.is_staff;
  $('retryAttendance').dataset.busy = operation.actionId;
  $('retryAttendance').disabled = true;
  document.querySelectorAll('[data-attendance-action]').forEach(b => (b.disabled = true));
  message('Saving attendance…');
  try {
    const result = await api.transition(operation);
    if (!stillCurrent()) return;
    if (
      result.action_id !== operation.actionId ||
      result.appointment_id !== operation.appointmentId
    )
      throw Error('Incomplete save response.');
    pending = null;
    $('retryAttendance').hidden = true;
    message('Attendance saved.');
    await refresh({ quiet: true });
  } catch (error) {
    if (!stillCurrent()) return;
    if (await forbidden(error)) return;
    if (['22023', '40001', '23503'].includes(error?.code)) {
      pending = null;
      $('retryAttendance').hidden = true;
      message('Attendance changed or this action is no longer valid. Refreshing the schedule.');
      await refresh({ quiet: true });
    } else {
      $('retryAttendance').hidden = false;
      message(
        'Save not confirmed. Retry uses the same action to avoid duplicates. ' +
          friendlyError(error)
      );
    }
  } finally {
    if ($('retryAttendance').dataset.busy === operation.actionId) {
      delete $('retryAttendance').dataset.busy;
      $('retryAttendance').disabled = false;
    }
  }
}
$('retryAttendance').addEventListener('click', savePending);
$('scanCheckin').onclick = () => scanner.open($('scanCheckin'));
$('openAnalytics').onclick = () => {
  $('moreDialog').close();
  view = 'analytics';
  workspace?.setView('more');
  $('staffScheduleCard').hidden = true;
  $('metrics').hidden = true;
  $('staffTitle').textContent = 'Clinic analytics';
  message('');
  analytics.open();
};
$('staffDate').value = manilaDateTime(new Date().toISOString()).date;
for (const id of ['staffDate', 'staffDoctor'])
  $(id).addEventListener('change', () => refresh({ reset: true }));
$('staffSearch').addEventListener('input', () => {
  clearTimeout(searchTimer);
  ++generation;
  searchTimer = setTimeout(() => refresh({ reset: true }), 250);
});
$('refreshSchedule').addEventListener('click', async () => {
  try {
    await auth?.controller.refresh();
  } catch {}
});
$('firstPage').addEventListener('click', () => refresh({ reset: true }));
$('logout').addEventListener('click', async () => {
  if (!auth) return;
  $('logout').disabled = true;
  try {
    await auth.controller.signOut();
    location.replace('index.html');
  } catch (error) {
    message(friendlyError(error));
  } finally {
    $('logout').disabled = false;
  }
});
async function ready(state) {
  const changed = auth && auth.user.id !== state.user.id;
  if (changed) clear();
  auth = state;
  api = createStaffData(state.client);
  const epoch = state.epoch;
  if (!workspace)
    workspace = mountWorkspace({
      role: 'staff',
      onNavigate: next => {
        analytics.hide();
        $('staffScheduleCard').hidden = false;
        view = next;
        $('activityPanel').hidden = view !== 'activity';
        $('schedulePanel').hidden = view === 'activity';
        $('metrics').hidden = view === 'activity';
        $('searchField').hidden = view === 'activity';
        $('staffTitle').textContent = view === 'activity' ? 'Recent activity' : 'Daily schedule';
        refresh({ reset: true });
        (view === 'activity' ? $('activityTitle') : $('appointmentsTitle')).focus();
      },
      onSignOut: () => $('logout').click(),
      onSwitchWorkspace: () => location.assign('dashboard.html')
    });
  try {
    const { data, error } = await state.client
      .from('doctors')
      .select('id,name')
      .eq('active', true)
      .order('name');
    if (!auth || auth.epoch !== epoch) return;
    if (error) throw error;
    const chosen = $('staffDoctor').value;
    $('staffDoctor').replaceChildren(new Option('All doctors', ''));
    data.forEach(d => $('staffDoctor').append(new Option(d.name, d.id)));
    $('staffDoctor').value = chosen;
    $('gateStatus').hidden = true;
    $('staffContent').hidden = false;
    await refresh();
  } catch (error) {
    if (auth?.epoch === epoch) {
      clear();
      $('gateStatus').textContent = friendlyError(error);
    }
  }
}
initializeSession({
  page: 'staff',
  onReady: state => {
    ready(state).catch(error => {
      clear();
      $('gateStatus').textContent = friendlyError(error);
    });
  },
  onClear: clear,
  onError: error => {
    $('gateStatus').textContent = friendlyError(error);
  }
}).catch(error => {
  clear();
  $('gateStatus').textContent = friendlyError(error);
});
