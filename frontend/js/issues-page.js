import { getIssues, getDashboardStats } from './api.js';
import { cap, esc, affected, badge, issueCard, issueLink, skeletonCards, pinIcon, showError, clearError, initMap, ICONS } from './ui.js';

const $ = (s) => document.querySelector(s);
const split = $('.split');
const listEl = $('#issue-list');
const stateEl = $('#state');
const countEl = $('#result-count');
const catSel = $('#filter-category');
const statusSel = $('#filter-status');
const searchEl = $('#search');
const sortSel = $('#sort');

const map = initMap('map');
const markers = L.layerGroup().addTo(map);
let all = [];
let points = [];
let reqId = 0;

const popup = (i) => `
  <strong>${ICONS[i.category] ?? ''} ${esc(cap(i.category))}</strong><br>
  ${esc(i.ref_no)}<br>
  ${badge(i.status)}<br>
  ${affected(i.affected_count)}<br>
  <a href="${issueLink(i)}">View case</a>`;

function setState(html) {
  stateEl.hidden = !html;
  stateEl.innerHTML = html || '';
}

function fit() {
  if (points.length) map.fitBounds(points, { padding: [30, 30], maxZoom: 16 });
}

function render() {
  const q = searchEl.value.trim().toLowerCase();
  const rows = all
    .filter((i) => !q || i.ref_no.toLowerCase().includes(q) || i.category.includes(q))
    .sort(
      sortSel.value === 'affected'
        ? (a, b) => b.affected_count - a.affected_count
        : (a, b) => new Date(b.created_at) - new Date(a.created_at)
    );

  markers.clearLayers();
  points = [];
  listEl.innerHTML = '';

  if (!rows.length) {
    countEl.textContent = '';
    setState('No issues match these filters. <a href="report.html">Report one</a>');
    return;
  }
  setState(null);
  countEl.textContent = `${rows.length} issue${rows.length === 1 ? '' : 's'}`;
  listEl.innerHTML = rows.map(issueCard).join('');
  rows.forEach((i) => {
    L.marker([i.lat, i.lng], { icon: pinIcon(i.category, i.status), title: i.ref_no })
      .bindPopup(popup(i))
      .addTo(markers);
    points.push([i.lat, i.lng]);
  });
  fit();
}

async function load() {
  const id = ++reqId;
  clearError();
  markers.clearLayers();
  points = [];
  setState(null);
  countEl.textContent = '';
  listEl.innerHTML = skeletonCards(4);
  try {
    const issues = await getIssues({
      category: catSel.value || undefined,
      status: statusSel.value || undefined,
    });
    if (id !== reqId) return;
    all = issues;
    render();
  } catch (err) {
    if (id !== reqId) return;
    console.error(err);
    listEl.innerHTML = '';
    showError('Could not load issues.', load);
  }
}

async function loadHero() {
  try {
    const s = await getDashboardStats();
    $('#hs-total').textContent = s.total;
    $('#hs-affected').textContent = (s.totalResidentsAffected ?? 0).toLocaleString();
    $('#hs-open').textContent = s.total - (s.byStatus?.resolved ?? 0);
  } catch (err) {
    console.error(err); // hero numbers are optional
  }
}

document.querySelectorAll('.view-tab').forEach((tab) =>
  tab.addEventListener('click', () => {
    split.dataset.view = tab.dataset.view;
    document.querySelectorAll('.view-tab').forEach((t) => {
      t.classList.toggle('is-active', t === tab);
      t.setAttribute('aria-selected', String(t === tab));
    });
    map.invalidateSize();
    fit();
  })
);

window.addEventListener('resize', () => map.invalidateSize());
catSel.addEventListener('change', load);
statusSel.addEventListener('change', load);
searchEl.addEventListener('input', render);
sortSel.addEventListener('change', render);
loadHero();
load();