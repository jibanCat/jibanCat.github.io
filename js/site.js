/* Site behaviour: header state, the field thinning into a band, section sightline strips and cuttings,
   papers toggle. All strips and cuttings are real rows of the F5 field, drawn from the same data the hero uses. */
(() => {
'use strict';
const D = window.CORE_SAMPLE_DATA;
const NX = D.nx, NY = D.ny;
const F32 = D.F32;                                           // decoded once by the bootstrap, or absent
const HAS_FIELD = !!(F32 && F32.length === NX * NY);          // no field: the page still works, the ink does not draw
const F = i => F32[i];
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));

// ---------------------------------------------------------------- header
const header = document.querySelector('.site-header');
const hero = document.getElementById('hero');
// the header carries the name from the first frame; the hero's own reveal is a separate, larger beat
const hdrMenu = document.querySelector('.hdr-menu');
if (hdrMenu) {
  hdrMenu.querySelectorAll('a').forEach(a => a.addEventListener('click', () => { hdrMenu.open = false; }));
  document.addEventListener('click', e => { if (hdrMenu.open && !hdrMenu.contains(e.target)) hdrMenu.open = false; });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') hdrMenu.open = false; });
}
const onScroll = () => {
  const y = window.scrollY;
  header.classList.toggle('scrolled', y > 40);
  // active section
  let active = null;
  for (const s of document.querySelectorAll('section.chapter')) { if (s.getBoundingClientRect().top < window.innerHeight * 0.4) active = s.id; }
  for (const a of header.querySelectorAll('nav a[data-section]')) a.classList.toggle('active', a.dataset.section === active);
};
window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
// scrollRestoration is left at the browser default: the site never restored position itself, and
// forcing 'manual' meant Back from /cv/ landed at the top of the page instead of where you were.

// ---------------------------------------------------------------- the band: the whole field, thin and quiet, with the visitor's incisions
function drawBand() {
  const c = document.getElementById('band'); if (!c) return;
  const dpr = Math.min(2, devicePixelRatio || 1), Wc = c.clientWidth, Hc = c.clientHeight, W = Math.round(Wc * dpr), H = Math.round(Hc * dpr);
  c.width = W; c.height = H; const g = c.getContext('2d');
  const paper = css('--paper'), wash = hex(css('--wash')), ink = hex(css('--ink'));
  g.fillStyle = paper; g.fillRect(0, 0, W, H);
  // downsample: each band pixel column averages a few field columns; rows map onto H (device pixels)
  const img = g.createImageData(W, H), p = hex(paper);
  for (let y = 0; y < H; y++) {
    const r0 = Math.floor(y / H * NY), r1 = Math.max(r0 + 1, Math.floor((y + 1) / H * NY));
    for (let x = 0; x < W; x++) {
      const c0 = Math.floor(x / W * NX), c1 = Math.max(c0 + 1, Math.floor((x + 1) / W * NX));
      let d = 0, n = 0; for (let r = r0; r < r1; r++) for (let cc = c0; cc < c1; cc++) { d += 1 - F(r * NX + cc); n++; }
      d /= n; const a = Math.min(1, Math.pow(d, 1.3) * 0.9);
      const col = d > 0.6 ? ink : wash; const i = 4 * (y * W + x);
      img.data[i] = p[0] + (col[0] - p[0]) * a; img.data[i + 1] = p[1] + (col[1] - p[1]) * a; img.data[i + 2] = p[2] + (col[2] - p[2]) * a; img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  g.setTransform(dpr, 0, 0, dpr, 0, 0); const HH = Hc, WW = Wc;
  // the visitor's cuts, if any
  const kept = (window.__cs && window.__cs.keptRows) || [];
  g.strokeStyle = paper; g.lineWidth = 1.5;
  for (const r of kept) { const y = (r + 0.5) / NY * HH; g.beginPath(); g.moveTo(0, y); g.lineTo(WW, y); g.stroke(); }
  g.fillStyle = css('--muted'); g.font = '10px ' + css('--mono');
  for (const r of kept) g.fillText(String(r).padStart(3, '0'), 6, (r + 0.5) / NY * HH - 3);
}

// ---------------------------------------------------------------- strips and cuttings: real rows as section language
function drawStrip(c) {
  const row = Number(c.dataset.row), dpr = Math.min(2, devicePixelRatio || 1), W = Math.round(c.clientWidth * dpr), H = Math.round(c.clientHeight * dpr);
  c.width = W; c.height = H; const g = c.getContext('2d');
  const paper = hex(css('--paper')), ink = hex(css(c.dataset.tone === 'rust' ? '--rust' : '--ink'));
  const img = g.createImageData(W, 1);
  for (let x = 0; x < W; x++) {
    const c0 = Math.floor(x / W * NX), c1 = Math.max(c0 + 1, Math.floor((x + 1) / W * NX));
    let d = 0; for (let cc = c0; cc < c1; cc++) d += 1 - F(row * NX + cc); d /= (c1 - c0);
    const a = Math.min(1, Math.pow(d, 1.15)); const i = 4 * x;
    img.data[i] = paper[0] + (ink[0] - paper[0]) * a; img.data[i + 1] = paper[1] + (ink[1] - paper[1]) * a; img.data[i + 2] = paper[2] + (ink[2] - paper[2]) * a; img.data[i + 3] = 255;
  }
  for (let y = 0; y < H; y++) g.putImageData(img, 0, y);
}
function drawAll() {
  if (!HAS_FIELD) return;
  drawBand();
  document.querySelectorAll('canvas.strip').forEach(drawStrip);
}
// iOS fires resize on every toolbar collapse, and drawBand rebuilds a full-width ImageData.
// Coalesce a burst of events into one redraw on the next frame, at the final dimensions.
let pending = 0;
function scheduleDraw() { if (pending) return; pending = requestAnimationFrame(() => { pending = 0; drawAll(); }); }
window.addEventListener('resize', scheduleDraw);
// the band redraws when the hero has been scrolled past, so it carries the visitor's own cuts
let bandDirty = true;
window.addEventListener('scroll', () => {
  if (!HAS_FIELD) return;
  if (bandDirty && window.scrollY > hero.offsetHeight * 0.5) { drawBand(); bandDirty = false; }
  if (window.scrollY < hero.offsetHeight * 0.2) bandDirty = true;
}, { passive: true });
scheduleDraw();

// ---------------------------------------------------------------- papers: selected first, full list on request
const more = document.getElementById('papers-toggle');
if (more) more.addEventListener('click', () => { const f = document.getElementById('papers-full'); f.hidden = !f.hidden; more.textContent = f.hidden ? 'Show the full list' : 'Show selected only'; });
})();
