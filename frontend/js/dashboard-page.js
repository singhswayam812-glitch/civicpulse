import { getDashboardStats } from './api.js';
import { ICONS, STATUS_LABELS, STATUS_COLORS, cap, issueCard, showError, clearError } from './ui.js';

const $ = (s) => document.querySelector(s);
const CATS = ['streetlight', 'bin', 'road', 'drain'];
const STATUSES = ['submitted', 'under_review', 'resolved'];
let charts = [];

function render(s) {
  const total = s.total ?? 0;
  const resolved = s.byStatus?.resolved ?? 0;
  $('#stat-total').textContent = total;
  $('#stat-affected').textContent = (s.totalResidentsAffected ?? 0).toLocaleString();
  $('#stat-open').textContent = total - resolved;
  $('#stat-resolution').textContent = s.avgResolutionDays == null ? 'N/A' : Number(s.avgResolutionDays).toFixed(1);

  charts.forEach((c) => c.destroy());
  charts = [
    new Chart($('#chart-category'), {
      type: 'bar',
      data: {
        labels: CATS.map((c) => `${ICONS[c]} ${cap(c)}`),
        datasets: [{ data: CATS.map((c) => s.byCategory?.[c] ?? 0), backgroundColor: '#0f766e', borderRadius: 6 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
      },
    }),
    new Chart($('#chart-status'), {
      type: 'doughnut',
      data: {
        labels: STATUSES.map((k) => STATUS_LABELS[k]),
        datasets: [{ data: STATUSES.map((k) => s.byStatus?.[k] ?? 0), backgroundColor: STATUSES.map((k) => STATUS_COLORS[k]) }],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } },
    }),
  ];

  const open = (s.topIssues ?? [])
    .filter((i) => i.status !== 'resolved')
    .sort((a, b) => b.affected_count - a.affected_count)
    .slice(0, 5);
  $('#top-issues').innerHTML = open.length
    ? open.map(issueCard).join('')
    : '<p class="card__meta">No open issues right now.</p>';
}

async function load() {
  clearError();
  try {
    render(await getDashboardStats());
  } catch (err) {
    console.error(err);
    showError('Could not load the dashboard figures.', load);
  }
}

load();