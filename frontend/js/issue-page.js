import { getIssue, updateStatus, submitReport } from './api.js';
import { STATUS_LABELS, STATUS_ORDER, cap, esc, affected, badge, fmtDate, showError, clearError, initMap, pinIcon, toast } from './ui.js';

// DEMO ONLY: anyone can read this in the page source. This is not real security.
const ADMIN_PASSCODE = 'civic2026';

const $ = (s) => document.querySelector(s);
const id = new URLSearchParams(location.search).get('id');
const form = $('#status-form');
const affectedKey = `cp_affected_${id}`;
let map = null, pin = null, current = null;

const storage = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
};

function notFound(msg) {
  $('main').innerHTML = `
    <div class="placeholder">
      <h2>Issue not found</h2>
      <p>${esc(msg)}</p>
      <a class="btn" href="index.html">Back to all issues</a>
    </div>`;
}

function renderStepper(status) {
  const idx = STATUS_ORDER.indexOf(status);
  $('#stepper').innerHTML = STATUS_ORDER.map(
    (s, n) => `<li class="${n < idx ? 'is-done' : ''}${n === idx ? ' is-done is-current' : ''}"${n === idx ? ' aria-current="step"' : ''}>${esc(STATUS_LABELS[s])}</li>`
  ).join('');
}

function renderActions(issue) {
  const btn = $('#affected-btn');
  const already = storage.get(affectedKey) === '1';
  btn.hidden = issue.status === 'resolved';
  btn.disabled = already;
  btn.textContent = already ? '✅ You said you are affected' : "🙋 I'm affected too";

  const url = location.href;
  const text = `${cap(issue.category)} issue ${issue.ref_no} on CivicPulse (unverified community report)`;
  $('#wa-btn').href = `https://wa.me/?text=${encodeURIComponent(text + ' ' + url)}`;
}

function render(issue) {
  current = issue;
  document.title = `${issue.ref_no} | CivicPulse`;
  $('.cat-icon').dataset.category = issue.category;
  $('#issue-title').textContent = cap(issue.category);
  $('#issue-meta').textContent = `${issue.ref_no} · ${affected(issue.affected_count)}`;
  const b = $('#issue-status');
  b.className = `badge badge--${issue.status}`;
  b.textContent = STATUS_LABELS[issue.status] ?? issue.status;
  renderStepper(issue.status);
  renderActions(issue);

  if (!map) map = initMap('map', [issue.lat, issue.lng], 16);
  if (pin) pin.remove();
  pin = L.marker([issue.lat, issue.lng], { icon: pinIcon(issue.category, issue.status) }).addTo(map);

  const reports = [...(issue.reports ?? [])].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  $('#report-list').innerHTML = reports.length
    ? reports.map((r) => `
        <article class="card">
          ${r.photo_url ? `<img src="${esc(r.photo_url)}" alt="Photo submitted with this report" loading="lazy" onerror="this.remove()">` : ''}
          <p style="margin-bottom: 0.25rem;">${esc(r.description || 'No description provided.')}</p>
          <div class="card__meta">${fmtDate(r.created_at)}</div>
        </article>`).join('')
    : '<p class="card__meta">No reports yet.</p>';

  const events = [...(issue.status_events ?? [])].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  $('#status-timeline').innerHTML = events.length
    ? events.map((e) => `
        <li>${badge(e.status)}
          <div class="card__meta">${fmtDate(e.created_at)}${e.note ? ' &middot; ' + esc(e.note) : ''}</div>
        </li>`).join('')
    : '<li class="card__meta">No status updates yet.</li>';

  $('#status').value = issue.status;
}

async function load() {
  clearError();
  try {
    const issue = await getIssue(id);
    if (!issue) return notFound(`We couldn't find an issue with id "${id}".`);
    render(issue);
  } catch (err) {
    console.error(err);
    if (/not found/i.test(err?.message ?? '')) notFound(`We couldn't find an issue with id "${id}".`);
    else showError('Could not load this issue.', load);
  }
}

/* ---------- I'm affected too ---------- */
$('#affected-btn').addEventListener('click', async () => {
  if (!current) return;
  const btn = $('#affected-btn');
  btn.disabled = true;
  btn.textContent = 'Adding…';
  try {
    await submitReport({
      category: current.category,
      lat: current.lat,
      lng: current.lng,
      description: "I'm affected by this too.",
      attachToIssueId: current.id,
    });
    storage.set(affectedKey, '1');
    toast('Thanks, your voice was added.');
    await load();
  } catch (err) {
    console.error(err);
    toast('Could not add your voice. Please try again.', 'error');
    btn.disabled = false;
    btn.textContent = "🙋 I'm affected too";
  }
});

/* ---------- share ---------- */
$('#share-btn').addEventListener('click', async () => {
  const data = { title: `CivicPulse ${current?.ref_no ?? ''}`, text: 'Unverified community report on CivicPulse', url: location.href };
  if (navigator.share) {
    try { await navigator.share(data); } catch { /* cancelled */ }
  } else {
    $('#copy-btn').click();
  }
});

$('#copy-btn').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(location.href);
    toast('Link copied.');
  } catch {
    toast('Could not copy. Copy the address bar instead.', 'error');
  }
});

/* ---------- demo admin ---------- */
$('#admin-unlock').addEventListener('click', () => {
  const pass = prompt('Admin passcode (demo only):');
  if (pass === null) return;
  if (pass === ADMIN_PASSCODE) {
    form.hidden = false;
    $('#admin-unlock').hidden = true;
  } else {
    toast('Incorrect passcode.', 'error');
  }
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = form.querySelector('[type="submit"]');
  const msg = $('#admin-msg');
  btn.disabled = true;
  msg.textContent = '';
  try {
    await updateStatus(id, $('#status').value, $('#note').value.trim());
    $('#note').value = '';
    await load();
    toast('Status updated.');
  } catch (err) {
    console.error(err);
    showError(err?.message || 'Could not update the status. Please try again.');
  } finally {
    btn.disabled = false;
  }
});

if (!id) notFound('No issue id was given in the link.');
else load();