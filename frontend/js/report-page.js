import { findNearbyIssues, submitReport } from './api.js';
import { catIcon, esc, affected, showError, clearError, initMap } from './ui.js';

const $ = (s) => document.querySelector(s);
const form = $('#report-form');
const submitBtn = form.querySelector('[type="submit"]');
const catEl = $('#category'), descEl = $('#description'), photoEl = $('#photo'), preview = $('#photo-preview');
const latEl = $('#lat'), lngEl = $('#lng'), locText = $('#location-display'), locBtn = $('#use-location');
const CATEGORIES = ['streetlight', 'bin', 'road', 'drain'];
const MAX_PHOTO_MB = 10, MIN_DESC = 10; // keep MAX_PHOTO_MB in step with MAX_PHOTO_BYTES in api.js
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']; // same list as api.js

const map = initMap('map');
let pin = null, previewUrl = null, busy = false;

/* ---------- field errors ---------- */
function fieldError(name, msg) {
  const anchor = { category: catEl, description: descEl, photo: photoEl, location: locText }[name];
  const wrap = anchor.closest('.field');
  let el = wrap.querySelector('.field__error');
  if (!el) {
    el = document.createElement('div');
    el.className = 'field__error';
    el.setAttribute('role', 'alert');
    wrap.append(el);
  }
  el.textContent = msg;
}

/* ---------- map pin + geolocation ---------- */
function setPin(lat, lng, zoom) {
  latEl.value = lat;
  lngEl.value = lng;
  locText.textContent = `Pin set at ${lat.toFixed(5)}, ${lng.toFixed(5)}. Drag it to adjust.`;
  if (pin) pin.setLatLng([lat, lng]);
  else {
    pin = L.marker([lat, lng], { draggable: true }).addTo(map);
    pin.on('dragend', () => { const p = pin.getLatLng(); setPin(p.lat, p.lng); });
  }
  if (zoom) map.setView([lat, lng], zoom);
  fieldError('location', '');
}
map.on('click', (e) => setPin(e.latlng.lat, e.latlng.lng));

locBtn.addEventListener('click', () => {
  if (!navigator.geolocation) {
    fieldError('location', 'Your browser cannot share location. Tap the map instead.');
    return;
  }
  const reset = () => { locBtn.disabled = false; locBtn.textContent = '📍 Use my location'; };
  locBtn.disabled = true;
  locBtn.textContent = 'Locating…';
  navigator.geolocation.getCurrentPosition(
    (p) => { setPin(p.coords.latitude, p.coords.longitude, 17); reset(); },
    () => { fieldError('location', 'Could not get your location. Tap the map to set the pin instead.'); reset(); },
    { enableHighAccuracy: true, timeout: 10000 }
  );
});

/* ---------- photo preview ---------- */
photoEl.addEventListener('change', () => {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
  const f = photoEl.files[0];
  if (f && f.type.startsWith('image/')) {
    previewUrl = URL.createObjectURL(f);
    preview.src = previewUrl;
    preview.hidden = false;
  } else {
    preview.hidden = true;
    preview.removeAttribute('src');
  }
  fieldError('photo', '');
});

/* ---------- validation ---------- */
function validate() {
  const category = catEl.value;
  const description = descEl.value.trim();
  const lat = parseFloat(latEl.value), lng = parseFloat(lngEl.value);
  const photo = photoEl.files[0];
  const errs = {
    category: CATEGORIES.includes(category) ? '' : 'Please choose a category.',
    description: description.length >= MIN_DESC ? '' : `Please describe the problem (at least ${MIN_DESC} characters).`,
    location: Number.isFinite(lat) && Number.isFinite(lng) ? '' : 'Please tap the map or use your location to set a pin.',
    photo: !photo ? ''
      : !PHOTO_TYPES.includes(photo.type) ? 'Please choose a JPEG, PNG, WebP, GIF or HEIC image.'
      : photo.size > MAX_PHOTO_MB * 1024 * 1024 ? `Photo must be under ${MAX_PHOTO_MB} MB.` : '',
  };
  Object.entries(errs).forEach(([k, m]) => fieldError(k, m));
  if (Object.values(errs).some(Boolean)) {
    [...form.querySelectorAll('.field__error')].find((e) => e.textContent)?.scrollIntoView({ block: 'center' });
    return null;
  }
  return { category, lat, lng, description, photo };
}

/* ---------- distance ---------- */
function metres(lat1, lng1, lat2, lng2) {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (lat2 - lat1) * r, dLng = (lng2 - lng1) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

/* ---------- merge modal: resolves to an issue id, 'new', or null (dismissed) ---------- */
function askMerge(nearby) {
  return new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="m-title">
        <h2 id="m-title">Is this already reported?</h2>
        <p class="card__meta">Similar open reports are nearby. These are unverified community reports. Choose one if it is the same problem.</p>
        <div class="stack">
          ${nearby.map((i, n) => `
            <label class="card nearby-option">
              <input type="radio" name="nb" value="${esc(i.id)}" ${n === 0 ? 'checked' : ''}>
              ${catIcon(i.category)}
              <span><strong>${esc(i.ref_no)}</strong>, ${affected(i.affected_count)}, ${i.dist} m away</span>
            </label>`).join('')}
        </div>
        <div class="modal__actions">
          <button type="button" class="btn" data-a="merge">Same problem, add mine</button>
          <button type="button" class="btn btn--ghost" data-a="new">No, this is different</button>
        </div>
      </div>`;
    const done = (v) => { document.removeEventListener('keydown', onKey); ov.remove(); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') done(null); };
    ov.addEventListener('click', (e) => {
      if (e.target === ov) return done(null);
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'new') done('new');
      if (a === 'merge') done(ov.querySelector('input[name="nb"]:checked').value);
    });
    document.addEventListener('keydown', onKey);
    document.body.append(ov);
    ov.querySelector('[data-a="merge"]').focus();
  });
}

/* ---------- success screen ---------- */
function showSuccess({ issue, ref_no, merged }) {
  $('#report-grid').hidden = true;
  const s = $('#success');
  s.innerHTML = `
    <div style="font-size: 3rem;">✅</div>
    <h2>Thanks, your report is in</h2>
    <p>Your reference number</p>
    <div class="ref">${esc(ref_no)}</div>
    <p>${merged ? 'Your report was added to an existing issue.' : 'A new issue was created.'}</p>
    <p class="card__meta">It is shown on CivicPulse as an unverified community report. It has not been sent to any authority.</p>
    <div class="stack">
      <a class="btn btn--block" href="issue.html?id=${encodeURIComponent(issue.id)}">View your case</a>
      <a class="btn btn--ghost btn--block" href="report.html">Report another issue</a>
    </div>`;
  s.hidden = false;
  s.scrollIntoView({ block: 'start' });
}

/* ---------- submit ---------- */
function setBusy(b) {
  busy = b;
  submitBtn.disabled = b;
  submitBtn.textContent = b ? 'Submitting…' : 'Submit report';
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (busy) return;
  clearError();
  const data = validate();
  if (!data) return;
  setBusy(true);
  try {
    const nearby = await findNearbyIssues(data.category, data.lat, data.lng);
    let result;
    if (nearby.length) {
      const withDist = nearby
        .map((i) => ({ ...i, dist: metres(data.lat, data.lng, i.lat, i.lng) }))
        .sort((a, b) => a.dist - b.dist);
      const choice = await askMerge(withDist);
      if (choice === null) return; // dismissed: let them edit and try again
      result = await submitReport(choice === 'new' ? data : { ...data, attachToIssueId: choice });
    } else {
      result = await submitReport(data);
    }
    showSuccess(result);
  } catch (err) {
    console.error(err);
    showError(err?.message || 'Could not submit your report. Please try again.');
  } finally {
    setBusy(false);
  }
});