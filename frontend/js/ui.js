export const ICONS = { streetlight: '💡', bin: '🗑', road: '🚧', drain: '💧' };
export const STATUS_LABELS = { submitted: 'Submitted', under_review: 'Under review', resolved: 'Resolved' };
export const STATUS_COLORS = { submitted: '#64748b', under_review: '#f59e0b', resolved: '#16a34a' };
export const STATUS_ORDER = ['submitted', 'under_review', 'resolved'];

export const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');
export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const affected = (n) => `${n} resident${n === 1 ? '' : 's'} affected`;
export const badge = (s) => `<span class="badge badge--${esc(s)}">${esc(STATUS_LABELS[s] ?? s)}</span>`;
export const catIcon = (c) => `<span class="cat-icon" data-category="${esc(c)}"></span>`;
export const issueLink = (i) => `issue.html?id=${encodeURIComponent(i.id)}`;

export function fmtDate(d) {
  const x = new Date(d);
  return isNaN(x) ? '—' : x.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export const issueCard = (i) => `
  <a class="card card--link" data-status="${esc(i.status)}" href="${issueLink(i)}">
    <div class="row">${catIcon(i.category)}
      <div>
        <h3>${esc(cap(i.category))}</h3>
        <div class="card__meta">${esc(i.ref_no)} &middot; ${affected(i.affected_count)}</div>
      </div>
    </div>
    <div style="margin-top: 0.75rem;">${badge(i.status)}</div>
  </a>`;

export const skeletonCards = (n = 3) => Array.from({ length: n }, () => '<div class="skeleton"></div>').join('');

export function initMap(id, center = [20.59, 78.96], zoom = 5) {
  const el = document.getElementById(id);
  el.classList.remove('placeholder');
  el.textContent = '';
  const map = L.map(el).setView(center, zoom);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map);
  return map;
}

export function pinIcon(category, status) {
  return L.divIcon({
    className: '',
    html: `<div class="pin" style="background:${STATUS_COLORS[status] ?? '#64748b'}"><span>${ICONS[category] ?? '📍'}</span></div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 34],
    popupAnchor: [0, -32],
  });
}

/* ---------- toasts ---------- */
export function toast(message, type = 'ok') {
  let box = document.getElementById('toasts');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toasts';
    box.className = 'toasts';
    box.setAttribute('role', 'status');
    document.body.append(box);
  }
  const t = document.createElement('div');
  t.className = `toast${type === 'error' ? ' toast--error' : ''}`;
  t.textContent = message;
  box.append(t);
  setTimeout(() => t.remove(), 3200);
}

/* ---------- error banner ---------- */
export function clearError() {
  document.getElementById('error-banner')?.remove();
}

export function showError(message, retry) {
  clearError();
  const el = document.createElement('div');
  el.id = 'error-banner';
  el.className = 'error-banner';
  el.setAttribute('role', 'alert');
  const text = document.createElement('span');
  text.textContent = message;
  const actions = document.createElement('span');
  actions.className = 'row';
  if (retry) {
    const b = document.createElement('button');
    b.className = 'btn btn--ghost btn--sm';
    b.type = 'button';
    b.textContent = 'Try again';
    b.onclick = () => { el.remove(); retry(); };
    actions.append(b);
  }
  const x = document.createElement('button');
  x.className = 'btn btn--ghost btn--sm';
  x.type = 'button';
  x.setAttribute('aria-label', 'Dismiss');
  x.textContent = '✕';
  x.onclick = () => el.remove();
  actions.append(x);
  el.append(text, actions);
  document.querySelector('main').prepend(el);
}

/* ---------- mobile bottom nav (auto-mounted on every page) ---------- */
(function mountNav() {
  if (document.querySelector('.bottom-nav')) return;
  const page = location.pathname.split('/').pop() || 'index.html';
  const items = [['index.html', '🏠', 'Issues'], ['report.html', '➕', 'Report'], ['dashboard.html', '📊', 'Dashboard']];
  const nav = document.createElement('nav');
  nav.className = 'bottom-nav';
  nav.setAttribute('aria-label', 'Mobile');
  nav.innerHTML = items
    .map(([href, icon, label]) => {
      const current = page === href || (href === 'index.html' && page === 'issue.html');
      return `<a href="${href}"${current ? ' aria-current="page"' : ''}><span>${icon}</span>${label}</a>`;
    })
    .join('');
  document.body.append(nav);
})();