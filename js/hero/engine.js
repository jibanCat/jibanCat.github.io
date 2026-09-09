/* Core Sample — visual escalation engine.
   Field: WebGL material (field-gl.js). Everything else: a transparent 2D layer on top.
   vertical = choose a sightline · horizontal = the probe reads along it · click = keep it
   Every curve is the supplied F5 row; every statistic is computed from kept rows. */
function startCoreSample(OPT) {
'use strict';
OPT = OPT || {};
const MODE = OPT.mode ?? 0;                                   // field treatment: 0 sumi · 1 backlit slab · 2 strata

// ------------------------------------------------------------------ data
const D = window.CORE_SAMPLE_DATA;
const NX = D.nx, NY = D.ny, DV = D.dv_kms, FMEAN = D.mean_flux_global;
const F = D.F32;                                             // the field, decoded once by the bootstrap (data/f5.bin)

const SAT_F = 0.02, SAT_RUN = 50;                            // saturated for >= 500 km/s: 44 of 480 rows
const rowSatRun = new Int32Array(NY), satMask = new Uint8Array(NY * NX), runs = [];
for (let y = 0; y < NY; y++) {
  let run = 0, best = 0, start = 0; runs.push([]);
  for (let x = 0; x <= NX; x++) {
    const v = x < NX ? F[y * NX + x] : 1;
    if (v < SAT_F) { if (run === 0) start = x; run++; }
    else { if (run >= SAT_RUN) { for (let k = start; k < x; k++) satMask[y * NX + k] = 1; runs[y].push([start, x]); } best = Math.max(best, run); run = 0; }
  }
  rowSatRun[y] = best;
}
const isDense = r => rowSatRun[r] >= SAT_RUN;

// ------------------------------------------------------------------ statistics (live, from kept rows)
const NLAG = 300, xiCache = new Map();
function xiRow(y) {
  if (xiCache.has(y)) return xiCache.get(y);
  const d = new Float64Array(NX); for (let x = 0; x < NX; x++) d[x] = F[y * NX + x] / FMEAN - 1;
  const xi = new Float64Array(NLAG + 1);
  for (let L = 0; L <= NLAG; L++) { let s = 0; for (let x = 0; x < NX; x++) { let j = x + L; if (j >= NX) j -= NX; s += d[x] * d[j]; } xi[L] = s / NX; }
  xiCache.set(y, xi); return xi;
}
function xiMean(rows) {
  const out = new Float64Array(NLAG + 1); if (!rows.length) return out;
  for (const y of rows) { const xi = xiRow(y); for (let L = 0; L <= NLAG; L++) out[L] += xi[L]; }
  for (let L = 0; L <= NLAG; L++) out[L] /= rows.length; return out;
}

// ------------------------------------------------------------------ synthetic continuum segment (F3, approved local asset; illustrative)
// The row is placed at the red end of the Lyα forest of a synthetic quasar at z_qso = 3.18: λ_obs = 1215.67 (1+3)(1+v/c); λ_rest = λ_obs/(1+z_qso).
// The F3 continuum draw is stored on an observed grid at z = 2.9, so it is looked up at λ_rest (1+2.9). Normalised to its maximum on the row.
const CONT = (() => {
  const c3 = D.f3_continuum, wv = c3.wave_A, cv = c3.continuum, out = new Float32Array(NX);
  const Z_QSO = 3.18, C_KMS = 299792.458;                     // the row ends just blueward of the quasar's Lyα emission
  for (let i = 0; i < NX; i++) {
    const lamObs = 1215.67 * 4 * (1 + (i + 0.5) * DV / C_KMS), lamRest = lamObs / (1 + Z_QSO), lam29 = lamRest * (1 + c3.z_qso);
    let j = Math.max(1, Math.min(wv.length - 1, Math.round((lam29 - wv[0]) / (wv[1] - wv[0]))));
    const t = (lam29 - wv[j - 1]) / (wv[j] - wv[j - 1]); out[i] = cv[j - 1] + (cv[j] - cv[j - 1]) * Math.max(0, Math.min(1, t));
  }
  let mx = 0; for (let i = 0; i < NX; i++) mx = Math.max(mx, out[i]); for (let i = 0; i < NX; i++) out[i] /= mx;
  return out;
})();
const BEAT_MS = OPT.beat ? 2600 : 0;                          // explored and rejected for the hero: ?beat=1 re-enables the observed<->normalised pause on the first keep
let beat = null;                                             // { t0, row, readX }
let settleAt = null;                                         // skim → settle → short re-read

// ------------------------------------------------------------------ palette & type
const PALETTES = [
  // A · cool contemporary ink: blue-black graphite, pale slate mist, soft ivory, cinnabar only for dense absorbers
  { paper: '#F4F2ED', mist: '#DDE5EE', wash: '#7D8DA3', ink: '#28323F', pool: '#0C121B', rust: '#B93A20', light: '#DCEBF6', ground: '#F3F1EB', glow: '#F3F1EB', ref: '#7A8794', graphite: '#1F2732' },
  // B · mineral landscape: stone blue-green ink, teal-grey wash, stone mist
  { paper: '#F3F2ED', mist: '#D9E6E3', wash: '#6F9490', ink: '#283D42', pool: '#0D191D', rust: '#B5482A', light: '#E0EFF1', ground: '#F2F1EC', glow: '#F2F1EC', ref: '#6E8A8C', graphite: '#1F2B2F' },
  // C · near-monochrome ink-colour: graphite with an indigo undertone, barely-cool mist
  { paper: '#F5F3EF', mist: '#E6E8EE', wash: '#8A8D95', ink: '#24252E', pool: '#0B0C12', rust: '#B9391E', light: '#E4EBF3', ground: '#F4F2EE', glow: '#F4F2EE', ref: '#7C8290', graphite: '#17181D' },
];
const FP = PALETTES[MODE];
const P = {
  paper: FP.paper, rust: FP.rust, ember: '#C8401F', light: FP.light,
  graphite: FP.graphite, ribbon: FP.graphite, ribbonEdge: 'rgba(243,241,235,0.9)',
  ref: FP.ref, muted: '#6F7278', faint: '#C9CBCF', ink: FP.graphite,
};
const GK = '"Inter Greek", ';                                // Greek and arrows, one face in every context
const SERIF = GK + '"Fraunces", "Iowan Old Style", Georgia, serif', SANS = GK + '"Inter", "Helvetica Neue", Helvetica, Arial, sans-serif', MONO = GK + '"IBM Plex Mono", Menlo, monospace';

// ------------------------------------------------------------------ strip texture (the row's own pixels, for the lifted strip)
const rowCanvas = document.createElement('canvas'); rowCanvas.width = NX; rowCanvas.height = NY;
{
  const g = rowCanvas.getContext('2d'), img = g.createImageData(NX, NY);
  const hx = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); const li = hx(FP.wash), he = hx(FP.pool);
  for (let i = 0; i < F.length; i++) { const d = 1 - F[i], a = Math.pow(d, 1.1), t = Math.min(1, d * 1.3); img.data[4 * i] = li[0] + (he[0] - li[0]) * t; img.data[4 * i + 1] = li[1] + (he[1] - li[1]) * t; img.data[4 * i + 2] = li[2] + (he[2] - li[2]) * t; img.data[4 * i + 3] = Math.round(255 * a); }
  g.putImageData(img, 0, 0);
}

// ------------------------------------------------------------------ canvases
const host = document.getElementById('hero');
const REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const COARSE = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
let lastTouch = COARSE, keepChip = null;                    // the explicit keep control, drawn only for touch
const glCanvas = document.getElementById('gl');            // WebGL for its whole life
const field2dCanvas = document.getElementById('field2d');  // Canvas2D for its whole life
const canvas = document.getElementById('c'), ctx = canvas.getContext('2d');   // the overlay, owned by layout()
const MAPS = buildPigmentMaps(F, NX, NY);
// ------------------------------------------------------------------ the field surface
// One place decides which renderer draws the field and which canvas the visitor sees. Two states,
// no flags: `active` is the renderer in use, and canvas visibility is derived from it here and
// nowhere else, so the two cannot disagree.
//
//   startup ─ WebGL available? ── yes ──▶ webgl ──context lost──▶ canvas2d
//                              └─ no ───▶ canvas2d               ◀──restored──┘
const fieldSurface = (() => {
  let gl2 = null, two = null, active = null;
  const show = (on, off) => { on.hidden = false; off.hidden = true; };
  function useCanvas2D(why) {
    if (active === two) return;
    if (!two) {
      // No fallback was built. Stay on the lost WebGL renderer: its calls are silent no-ops, so the
      // field stops updating but the loop, the probe and every kept sightline keep working, and a
      // later restore repairs it. Switching to a null renderer would strand the hero.
      console.error('[hero] the WebGL context was lost and no 2-D renderer exists; the field is frozen', why);
      return;
    }
    if (why) console.warn('[hero] field falling back to 2-D:', why);
    active = two; show(field2dCanvas, glCanvas);
  }
  function useWebGL() { active = gl2; show(glCanvas, field2dCanvas); }
  try { two = createField2D(field2dCanvas, F, NX, NY, FP); }
  catch (err) { console.warn('[hero] no 2-D field renderer', err); }
  try {
    gl2 = createFieldGL(glCanvas, F, MAPS.TAU8, MAPS.PIG, MAPS.PIG2, NX, NY, {
      onLost: () => useCanvas2D('context lost'),
      onRestored: () => useWebGL(),
      onRebuildFailed: (err) => useCanvas2D(err),
    });
  } catch (err) { console.warn('[hero] no WebGL field renderer', err); }
  if (gl2) useWebGL(); else if (two) useCanvas2D(null);
  else throw new Error('no field renderer could be built');
  return { render(s) { active.render(s); } };
})();
let W = 0, H = 0, DPR = 1, L = {};
let clock = performance.now(), lastT = clock;
const startedAt = clock;
let hintRetiredAt = null;                                    // the hint retires the moment the visitor keeps a row

// ------------------------------------------------------------------ state
let hover = null, everSelected = false;                      // { row, t0, ceremony }
let lastRowChange = -1e9;
let pointerX = null, pointer = { x: -5000, y: -5000 };
let revealX = 0, sweepFrom = 0;                              // probe progress along the row (fraction)
let firstSpectrum = null;
const kept = []; const MAXKEPT = 8;
let xiTarget = new Float64Array(NLAG + 1), xiShown = new Float64Array(NLAG + 1);
let xiEmerge = null, xiAxes = null, identity = null;
let cooldownRow = -1, leaving = null, dimShown = 0, probeOn = 0;
const WORK = 0.60;
// Narrow layout is budgeted from the bottom up: caption, specimen band, ξ and the identity foot
// are fixed furniture, and the field takes what is left. Deriving the fraction from the height is
// what keeps the bands from colliding on a short viewport (a phone showing its browser toolbar).
const NARROW_FURNITURE = 54 + (5 * 16 + 4 * 5) + 18 + 150 + 12 + 74;
const narrowXiFrac = () => Math.max(0.22, Math.min(0.44, (H - NARROW_FURNITURE - 12) / H));
let fieldFrac = COARSE ? WORK : 1.0;
let bloom = { row: -1, run: null, i: 0, exitAt: null, enteredAt: null };

const ease = t => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
const easeIO = t => { t = Math.max(0, Math.min(1, t)); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const easeBack = t => { t = Math.max(0, Math.min(1, t)); const c = 1.4; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const prog = (t0, dur, delay = 0) => t0 === null ? 0 : Math.max(0, Math.min(1, (clock - t0 - delay) / dur));
const fmtInt = n => Math.round(n).toLocaleString('en-US');

function layout() {
  DPR = Math.min(2, window.devicePixelRatio || 1); W = host.clientWidth; H = host.clientHeight;
  canvas.width = W * DPR; canvas.height = H * DPR; ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const fh = H * fieldFrac + 12, fw = fh * NX / NY;
  const narrow = W < 700;
  L = { fx: (W - fw) / 2, fy: -6, fw, fh, bottom: fh - 6, narrow };
  if (narrow) {
    // One column. Every layer is given a vertical region it alone owns, so the kept strips and
    // the statistic can never occupy the same band whatever the interaction state.
    //   field · caption · specimen band · xi · identity
    const capBot = L.bottom + 54;                     // the two caption lines under the field
    const idTop = H - 74;                             // the identity block owns the foot
    const XI_MIN = 118, slotGap = 5;
    let slotH = 16;
    let trayH = MAXKEPT * slotH + (MAXKEPT - 1) * slotGap;
    let xiTop = capBot + trayH + 18;
    // when height is scarce the specimen band compresses; ξ never takes space from the foot
    while (idTop - 12 - xiTop < XI_MIN && slotH > 9) {
      slotH -= 1;
      trayH = MAXKEPT * slotH + (MAXKEPT - 1) * slotGap;
      xiTop = capBot + trayH + 18;
    }
    L.tray = { x: 46, y: capBot, w: W - 46 - 22, h: trayH, slotH, slotGap };
    L.xi = { x: 22, y: xiTop, w: W - 44, h: Math.max(0, idTop - 12 - xiTop), pad: 30 };
  } else {
    const trayTop = L.bottom + 52;
    L.tray = { x: 72, y: trayTop, w: W * 0.36, h: H - trayTop - 120 };
    L.xi = { x: W * 0.53, y: trayTop - 10, w: W * 0.42, h: H - trayTop - 90, pad: 10 };
  }
}
layout();
const rowY = r => L.fy + (r + 0.5) * L.fh / NY;
const colX = c => L.fx + c * L.fw / NX;
const STRIP = 7, LIFT = 16, RIBBON = 210;

// ------------------------------------------------------------------ input
function setPointer(x, y) {
  pointer = { x, y };
  const inField = x >= Math.max(0, L.fx) && x <= Math.min(W, L.fx + L.fw) && y >= L.fy && y <= L.bottom;
  if (!inField) return;
  const row = Math.max(0, Math.min(NY - 1, Math.floor((y - L.fy) / L.fh * NY)));
  pointerX = Math.max(0, Math.min(1, (x - L.fx) / L.fw));
  if (row === cooldownRow) return;
  cooldownRow = -1;
  if (!hover || hover.row !== row) {
    if (kept.some(k => k.row === row)) return;
    const ceremony = !everSelected; everSelected = true;
    const skimming = !ceremony && clock - lastRowChange < 400;
    hover = { row, t0: clock, ceremony };
    lastRowChange = clock;
    // skimming keeps the read position (the family of rows switches under the probe); when the hand settles,
    // the probe backs up a little and re-reads the last stretch of the chosen row. A deliberate choice is read from the far end.
    if (skimming) { settleAt = clock + 260; } else { revealX = 0; settleAt = null; }
    sweepFrom = clock;
    bloom = { row, run: runs[row][0] || null, i: 0, exitAt: null, enteredAt: null };
  }
}
function pointerDown() {
  if (!hover) return;
  if (kept.length >= MAXKEPT || kept.some(k => k.row === hover.row)) return;
  if (revealX < 0.15) return;                                 // nothing to keep yet
  const delay = kept.length === 0 ? BEAT_MS : 0;
  if (delay) beat = { t0: clock, row: hover.row, readX: revealX };
  kept.push({ row: hover.row, t0: clock + delay, slot: kept.length, readX: revealX });
  if (hintRetiredAt === null) hintRetiredAt = clock;
  xiTarget = xiMean(kept.map(k => k.row));
  leaving = { row: hover.row, t0: clock + delay, readX: revealX };
  cooldownRow = hover.row; hover = null; bloom = { row: -1, run: null, i: 0 };
  if (kept.length === 3 && xiEmerge === null) xiEmerge = clock + 1400;
  if (kept.length === 5 && xiAxes === null) xiAxes = clock + 1200;
  if (kept.length === 1 && identity === null) identity = clock + 400;    // the first keep is the first deliberate act; name the author then
}
const rel = e => { const r = host.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
// touch has its own grammar, not emulated hover: tap chooses a row and the light starts reading it;
// drag scrubs the light along that row; a second tap on the same row keeps it.
let touch = { down: null, moved: false, rowAtDown: -1 };
canvas.addEventListener('pointermove', e => {
  if (e.pointerType !== 'touch') lastTouch = false;
  if (e.pointerType === 'touch') {
    if (!touch.down) return;
    const [x, y] = rel(e);
    if (Math.hypot(x - touch.down[0], y - touch.down[1]) > 8) touch.moved = true;
    if (hover && touch.moved) pointerX = Math.max(0, Math.min(1, (x - L.fx) / L.fw));
    return;
  }
  setPointer(...rel(e));
});
canvas.addEventListener('pointerdown', e => {
  const p = rel(e);
  if (e.pointerType === 'touch') {
    lastTouch = true;
    if (keepChip && p[0] >= keepChip.x && p[0] <= keepChip.x + keepChip.w && p[1] >= keepChip.y && p[1] <= keepChip.y + keepChip.h) {
      touch = { down: null, moved: false, rowAtDown: -1 }; pointerDown(); return;      // tap the chip = keep this row
    }
    // a finger landing within a few rows of the row already being read means "this row"
    const near = hover && Math.abs(p[1] - rowY(hover.row)) < 16;
    touch = { down: p, moved: false, rowAtDown: hover ? hover.row : -1 };
    if (near) { pointerX = Math.max(0, Math.min(1, (p[0] - L.fx) / L.fw)); return; }
    setPointer(p[0], p[1]); return;
  }
  setPointer(p[0], p[1]); pointerDown();
});
canvas.addEventListener('pointerup', e => {
  if (e.pointerType !== 'touch' || !touch.down) return;
  if (!touch.moved && hover && hover.row === touch.rowAtDown) pointerDown();
  touch.down = null;
});
canvas.addEventListener('pointercancel', () => { touch.down = null; });
// keyboard: the same grammar without a pointer. Up and down choose a sightline, left and right move
// the light along it, Enter or Space keeps it.
canvas.tabIndex = 0;
canvas.setAttribute('role', 'application');
canvas.setAttribute('aria-label', 'A plane of simulated hydrogen. Use the up and down arrows to choose a sightline, left and right to move the light along it, and Enter to keep it.');
function selectRow(row) {
  row = Math.max(0, Math.min(NY - 1, row));
  if (kept.some(k => k.row === row)) return;
  const ceremony = !everSelected; everSelected = true;
  hover = { row, t0: clock, ceremony };
  lastRowChange = clock; revealX = 0; pointerX = pointerX == null ? 0.6 : pointerX;
  bloom = { row, run: runs[row][0] || null, i: 0, exitAt: null, enteredAt: null };
  cooldownRow = -1;
}
canvas.addEventListener('keydown', ev => {
  const step = ev.shiftKey ? 12 : 3;
  if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
    const dir = ev.key === 'ArrowDown' ? 1 : -1;
    selectRow((hover ? hover.row : Math.round(NY / 2)) + dir * step);
    ev.preventDefault();
  } else if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') {
    if (!hover) selectRow(Math.round(NY / 2));
    pointerX = Math.max(0, Math.min(1, (pointerX == null ? 0.5 : pointerX) + (ev.key === 'ArrowRight' ? 0.06 : -0.06)));
    ev.preventDefault();
  } else if (ev.key === 'Enter' || ev.key === ' ') {
    if (hover) { pointerDown(); ev.preventDefault(); }
  }
});
window.addEventListener('keydown', e => {
  if (document.activeElement === canvas) return;
  if (e.key === ' ' || e.key === 'Enter') { if (hover) { pointerDown(); e.preventDefault(); } }
});

// ------------------------------------------------------------------ helpers
function text(str, x, y, { font, color, align = 'left', baseline = 'alphabetic', alpha = 1, tracking = 0 }) {
  ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.font = font; ctx.textAlign = align; ctx.textBaseline = baseline;
  if (tracking) ctx.letterSpacing = tracking + 'px';
  ctx.fillText(str, x, y); ctx.restore();
}

// ------------------------------------------------------------------ the row being read: strip + silhouette behind the probe
function drawRibbon() {
  let row, readFrac, fold = 0;
  if (hover) { row = hover.row; readFrac = revealX; }
  else if (leaving && clock - leaving.t0 < 420) { row = leaving.row; readFrac = leaving.readX; fold = ease(prog(leaving.t0, 320)); }
  else return null;
  // the beat: multiply by a synthetic continuum (observed), hold, divide it out again (the forest alone)
  let obs = 0, contA = 0;
  if (beat && clock - beat.t0 < BEAT_MS) {
    const tb = clock - beat.t0;
    const up = ease(Math.min(1, Math.max(0, (tb - 350) / 650))), down = ease(Math.min(1, Math.max(0, (tb - 1750) / 600)));
    obs = up * (1 - down); contA = ease(Math.min(1, tb / 400)) * (1 - ease(Math.min(1, Math.max(0, (tb - 2100) / 400))));
  }
  const base = row * NX, dense = isDense(row);
  const y0 = rowY(row);
  const cRev = Math.round(readFrac * NX), rx = colX(cRev);
  const yStrip = y0 - LIFT, stripTop = yStrip - STRIP;
  const H0 = Math.max(0, Math.min(RIBBON, y0 - LIFT - STRIP - 72)) * (1 - fold);   // keep clear of the site header
  const x0 = Math.max(0, L.fx), x1 = Math.min(W, L.fx + L.fw);

  ctx.save();
  // the hairline ahead of the probe: the row named, not yet read
  if (hover) {
    const a = 0.35 * ease(prog(hover.t0, 300));
    ctx.globalAlpha = a; ctx.strokeStyle = P.ink; ctx.lineWidth = 1; ctx.setLineDash([1, 3]);
    ctx.beginPath(); ctx.moveTo(rx + 8, y0 + 0.5); ctx.lineTo(x1, y0 + 0.5); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
  }
  // lift and extrusion ramp up over the last ~18 columns before the probe
  const lead = c => Math.max(0, Math.min(1, (cRev - c) / 44));   // the wave behind the probe: ~440 km/s of lift and rise
  const liftAt = c => LIFT * ease(lead(c));
  const topAt = c => { const i = Math.min(NX - 1, Math.max(0, c)); const f = F[base + i] * (1 - obs + obs * CONT[i]); const l = lead(c); return y0 - liftAt(c) - STRIP * l - H0 * f * ease(l); };
  const stripTopAt = c => y0 - liftAt(c) - STRIP * lead(c);
  if (cRev > 1) {
    // strip: paper backing, the row's own pixels, rust where saturated; rises out of the plane behind the probe
    ctx.beginPath(); ctx.moveTo(colX(0), y0);
    for (let c = 0; c <= cRev; c++) ctx.lineTo(colX(c), stripTopAt(c));
    for (let c = cRev; c >= 0; c--) ctx.lineTo(colX(c), y0 - liftAt(c) + 0.5);
    ctx.closePath();
    ctx.save(); ctx.clip();
    ctx.fillStyle = P.paper; ctx.fillRect(L.fx, y0 - LIFT - STRIP - 2, rx - L.fx + 4, LIFT + STRIP + 4);
    ctx.imageSmoothingEnabled = false; ctx.drawImage(rowCanvas, 0, row, NX, 1, L.fx, y0 - LIFT - STRIP, L.fw, STRIP); ctx.imageSmoothingEnabled = true;
    if (dense) { ctx.fillStyle = P.rust; for (const [a, b] of runs[row]) ctx.fillRect(colX(a), y0 - LIFT - STRIP, colX(b) - colX(a), STRIP); }
    ctx.restore();
    ctx.strokeStyle = P.ink; ctx.lineWidth = 0.8; ctx.beginPath(); for (let c = 0; c <= cRev; c++) { const x = colX(c), y = y0 - liftAt(c) + 0.5; c ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke();
    // silhouette: the strip's top edge pulled up by transmission, written behind the probe
    if (H0 > 0.5) {
      ctx.beginPath(); ctx.moveTo(colX(0), stripTopAt(0));
      for (let c = 0; c <= cRev; c++) ctx.lineTo(colX(c), topAt(c));
      for (let c = cRev; c >= 0; c--) ctx.lineTo(colX(c), stripTopAt(c));
      ctx.closePath();
      const grad = ctx.createLinearGradient(0, stripTop, 0, stripTop - H0); grad.addColorStop(0, FP.pool); grad.addColorStop(0.55, P.ribbon); grad.addColorStop(1, FP.ink);
      ctx.fillStyle = grad; ctx.fill();
      ctx.strokeStyle = P.ribbonEdge; ctx.lineWidth = 1.2; ctx.lineJoin = 'round'; ctx.beginPath(); for (let c = 0; c <= cRev; c++) { const x = colX(c), y = topAt(c); c ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke();
    }
  }
  // latent continuum, dashed, above the observed-looking edge; two short captions, then it is divided out
  if (contA > 0 && cRev > 2) {
    ctx.save(); ctx.globalAlpha = contA; ctx.strokeStyle = P.ref; ctx.setLineDash([2, 5]); ctx.lineWidth = 1.2; ctx.beginPath();
    for (let c = 0; c <= cRev; c += 2) { const x = colX(c), y = stripTop - H0 * CONT[Math.min(NX - 1, c)]; c ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke(); ctx.setLineDash([]);
    const tb = clock - beat.t0;
    const a1 = ease(Math.min(1, Math.max(0, (tb - 300) / 400))) * (1 - ease(Math.min(1, Math.max(0, (tb - 1500) / 300))));
    const a2 = ease(Math.min(1, Math.max(0, (tb - 1700) / 400))) * (1 - ease(Math.min(1, Math.max(0, (tb - 2400) / 200))));
    const xm = Math.min(W, x1) - 28;
    text('× synthetic quasar continuum: quasar-spectrum view', xm, stripTop - H0 - 14, { font: '12px ' + SANS, color: P.muted, align: 'right', alpha: a1 });
    text('÷ continuum: forest only', xm, stripTop - H0 - 14, { font: '12px ' + SANS, color: P.muted, align: 'right', alpha: a2 });
    ctx.restore();
  }
  // the probe: a small cool light with a fine vertical beam through the row
  if (hover && cRev > 0 && cRev < NX) {
    const yl = topAt(cRev - 1);
    ctx.strokeStyle = 'rgba(217,231,241,0.9)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(rx + 0.5, y0 - LIFT - STRIP - H0 - 10); ctx.lineTo(rx + 0.5, y0 + 14); ctx.stroke();
    ctx.fillStyle = 'rgba(220,235,246,0.55)'; ctx.beginPath(); ctx.arc(rx, yl, 7, 0, 7); ctx.fill();
    ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.arc(rx, yl, 3.4, 0, 7); ctx.fill();
    ctx.fillStyle = P.ink; ctx.beginPath(); ctx.arc(rx, yl, 1.3, 0, 7); ctx.fill();
  }
  // the discovery, after the event: a small identification, never a readout
  if (hover && dense && bloom.exitAt !== null) {
    const a = ease(prog(bloom.exitAt, 700, 500));
    if (a > 0) {
      const [ra, rb] = bloom.run; const xm = (colX(ra) + colX(rb)) / 2;
      text(row === D.named_rows.dla ? 'DLA' : 'dense absorber', xm, y0 - LIFT - STRIP - 10, { font: '500 12px ' + SANS, color: P.rust, align: 'center', alpha: a, tracking: 1.5 });
      if (row === D.named_rows.dla) text('log N(HI) = ' + D.named_rows.dla_logN.toFixed(2), xm, y0 + 22, { font: '11px ' + MONO, color: P.rust, align: 'center', alpha: ease(prog(bloom.exitAt, 700, 1800)) });
    }
  }
  // touch: an explicit keep control at the right end of the strip (hover users click anywhere)
  keepChip = null;
  if (hover && lastTouch && revealX > 0.15 && kept.length < MAXKEPT) {
    const w = 64, h = 30, x = Math.min(W, L.fx + L.fw) - w - 14, y = y0 - LIFT - STRIP - h - 10;
    keepChip = { x, y, w, h };
    ctx.save(); ctx.fillStyle = 'rgba(244,242,237,0.92)'; ctx.strokeStyle = P.ink; ctx.lineWidth = 1;
    ctx.fillRect(x, y, w, h); ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    text('keep', x + w / 2, y + h / 2 + 1, { font: '500 12px ' + SANS, color: P.ink, align: 'center', baseline: 'middle', tracking: 0.5 });
    ctx.restore();
  }
  // one small readout, late
  const sciA = ease(prog(firstSpectrum, 900, 1400));
  if (hover && sciA > 0 && cRev > 0 && cRev < NX) text(fmtInt(cRev * DV) + ' km/s', rx + 10, y0 + 22, { font: '11px ' + MONO, color: P.muted, alpha: sciA * 0.85 });
  ctx.restore();
  return { row, y0 };
}

// ------------------------------------------------------------------ the collection: cuttings
function slotRect(i) {
  const t = L.tray, gap = t.slotGap || 6;
  const h = t.slotH || Math.min(26, (t.h - gap * (MAXKEPT - 1)) / MAXKEPT);
  return { x: t.x, y: t.y + i * (h + gap), w: t.w, h };
}
function drawCutNumerals() {
  for (const k of kept) {
    const a = ease(prog(k.t0, 600, 700)); if (a <= 0) continue;
    text(String(k.row).padStart(3, '0'), 26, rowY(k.row) + 4, { font: '300 11px ' + SERIF, color: isDense(k.row) ? P.rust : P.muted, alpha: a * 0.9 });
  }
}
function drawCollection() {
  for (const k of kept) {
    const row = k.row, base = row * NX, dense = isDense(row);
    const fly = easeIO(prog(k.t0, 530, 420)), settled = prog(k.t0, 300, 950);
    const dst = slotRect(k.slot);
    const src = { x: L.fx, y: rowY(row) - LIFT - STRIP, w: L.fw, h: STRIP };
    if (prog(k.t0, 1, 420) === 0) continue;                 // still folding (drawn by drawRibbon)
    const sh = 4;
    const r = { x: src.x + (dst.x - src.x) * fly, y: src.y + (dst.y + dst.h - sh - src.y) * fly, w: src.w + (dst.w - src.w) * fly, h: src.h + (sh - src.h) * fly };
    ctx.save();
    const rise = easeBack(prog(k.t0, 620, 980));
    if (rise > 0) {
      const hh = (dst.h - sh) * rise;
      ctx.fillStyle = P.graphite; ctx.beginPath(); ctx.moveTo(r.x, r.y);
      for (let c = 0; c < NX; c++) ctx.lineTo(r.x + c * r.w / NX, r.y - hh * F[base + c]);
      ctx.lineTo(r.x + r.w, r.y); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = P.paper; ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.imageSmoothingEnabled = false; ctx.drawImage(rowCanvas, 0, row, NX, 1, r.x, r.y, r.w, r.h); ctx.imageSmoothingEnabled = true;
    if (dense) { ctx.fillStyle = P.rust; for (const [a, b] of runs[row]) ctx.fillRect(r.x + a * r.w / NX, r.y, (b - a) * r.w / NX, r.h); }
    ctx.strokeStyle = P.ink; ctx.lineWidth = 0.75; ctx.beginPath(); ctx.moveTo(r.x, r.y + r.h + 0.5); ctx.lineTo(r.x + r.w, r.y + r.h + 0.5); ctx.stroke();
    if (settled > 0) text(String(row).padStart(3, '0'), dst.x - 12, dst.y + dst.h - 2, { font: '300 15px ' + SERIF, color: dense ? P.rust : P.muted, align: 'right', alpha: settled });
    ctx.restore();
  }
}

// ------------------------------------------------------------------ the statistic: hairlines accumulate, a form emerges
function drawXi() {
  if (!kept.length) return;
  const R = L.xi, lag = D.lag_kms;
  const px = R.x, pw = R.w, py = R.y + (R.pad || 10), ph = R.h - (R.pad || 10) - 30;
  if (ph < 24) return;                       // mid-thin: the band has not opened yet, draw nothing rather than a squashed form
  const xOf = v => px + pw * (Math.log10(Math.max(10, v)) - 1) / (Math.log10(3000) - 1);
  const yOf = v => py + ph * (1 - (Math.max(-0.05, Math.min(0.4, v)) + 0.05) / 0.45);
  const yBase = yOf(0);
  const line = (arr, style, width, dash, alpha, scale = 1) => { ctx.save(); ctx.strokeStyle = style; ctx.lineWidth = width; ctx.setLineDash(dash); ctx.globalAlpha = alpha; ctx.beginPath(); for (let i = 1; i <= NLAG; i++) { const x = xOf(lag[i]), y = yBase - (yBase - yOf(arr[i])) * scale; i === 1 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); } ctx.stroke(); ctx.restore(); };
  ctx.save();
  // 1 each cutting, once it has landed, lays down its own noisy hairline: a trace, unexplained
  for (const k of kept) {
    const a = ease(prog(k.t0, 900, 1500)), grow = ease(prog(k.t0, 1400, 1500));
    if (a > 0) line(xiRow(k.row), isDense(k.row) ? P.rust : P.ink, 0.8, [], 0.22 * a, grow);
  }
  // 2 at three cuttings the collective form bleeds up from the baseline and sharpens
  const em = xiEmerge === null ? 0 : ease(prog(xiEmerge, 1800));
  if (em > 0) {
    const sharp = ease(prog(xiEmerge, 1400, 1000));
    const form = (arr, scale, style, blur) => { ctx.save(); if (blur) ctx.filter = 'blur(' + blur + 'px)'; ctx.fillStyle = style; ctx.beginPath(); ctx.moveTo(xOf(lag[1]), yBase); for (let i = 1; i <= NLAG; i++) ctx.lineTo(xOf(lag[i]), yBase - (yBase - yOf(arr[i])) * scale); ctx.lineTo(xOf(lag[NLAG]), yBase); ctx.closePath(); ctx.fill(); ctx.restore(); };
    form(xiShown, em, 'rgba(26,29,34,0.16)', 16 * (1 - 0.5 * sharp));
    if (sharp > 0) { ctx.globalAlpha = 0.92 * sharp; form(xiShown, em, P.graphite, 0); ctx.globalAlpha = 1; }
    if (hover && sharp > 0.5 && kept.length < MAXKEPT) {
      const xr = xiRow(hover.row), n = kept.length, prev = new Float64Array(NLAG + 1);
      for (let i = 0; i <= NLAG; i++) prev[i] = (xiTarget[i] * n + xr[i]) / (n + 1);
      line(prev, isDense(hover.row) ? P.rust : P.ink, 1.1, [3, 4], 0.7 * ease(prog(hover.t0, 600, 400)));
    }
    // 3 words
    const lab = ease(prog(xiEmerge, 900, 2200));
    if (lab > 0) {
      text('ξ(Δv)', px, py - 8, { font: '300 ' + (L.narrow ? 22 : 26) + 'px ' + SERIF, color: P.ink, alpha: lab });
      text(L.narrow ? 'from ' + kept.length + ' kept sightlines' : 'from the ' + kept.length + ' sightlines you kept', px + (L.narrow ? 58 : 84), py - (L.narrow ? 9 : 8), { font: (L.narrow ? '11px ' : '12px ') + SANS, color: P.muted, alpha: lab });
    }
    // 4 axes and the two 2000-line references, later still
    const ax = xiAxes === null ? 0 : ease(prog(xiAxes, 1000));
    if (ax > 0) {
      ctx.globalAlpha = ax; ctx.strokeStyle = P.faint; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px, yBase + 0.5); ctx.lineTo(px + pw, yBase + 0.5); ctx.stroke();
      for (const t of [10, 100, 1000]) { ctx.beginPath(); ctx.moveTo(xOf(t), yBase); ctx.lineTo(xOf(t), yBase + 5); ctx.stroke(); text(fmtInt(t), xOf(t), yBase + 18, { font: (L.narrow ? '10px ' : '11px ') + MONO, color: P.muted, align: 'center', alpha: ax }); }
      if (L.narrow) text('separation  km/s', px, yBase + 32, { font: '10px ' + SANS, color: P.muted, alpha: ax });
      else text('separation  km/s', px + pw, yBase + 18, { font: '11px ' + SANS, color: P.muted, align: 'right', alpha: ax });
      line(D.xi_clean, P.ref, 1, [], 0.7 * ax); line(D.xi_dla, P.rust, 1, [3, 4], 0.6 * ax);
      // the two references say the same thing in the same shape, so the comparison is the label
      text(L.narrow ? '2000 with a DLA' : '2000 sightlines with a DLA', xOf(lag[3]) + 4, yOf(D.xi_dla[3]) - 8, { font: (L.narrow ? '10px ' : '11px ') + SANS, color: P.rust, alpha: ax });
      text(L.narrow ? '2000 without a DLA' : '2000 sightlines without a DLA', px + pw, yOf(0.055), { font: (L.narrow ? '10px ' : '11px ') + SANS, color: P.ref, align: 'right', alpha: ax });
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();
}

// ------------------------------------------------------------------ words: caption, identity, index
function drawHint() {
  // enough signal that the field is interactive, never a paragraph, gone once the act has been performed
  if (kept.length > 0 && hintRetiredAt !== null && clock - hintRetiredAt > 600) return;
  const inA = ease(Math.min(1, (clock - startedAt - 1500) / 900));
  const outA = hintRetiredAt === null ? 0 : ease(Math.min(1, (clock - hintRetiredAt) / 500));
  const a = inA * (1 - outA);
  if (a <= 0.01) return;
  const line = COARSE
    ? (everSelected ? 'drag to read  ·  then keep' : 'tap a sightline')
    : (everSelected ? 'click to keep it' : 'move to choose a sightline');
  const x = W < 700 ? 22 : 72, y = L.bottom - 26;
  ctx.save(); ctx.globalAlpha = a * 0.85; ctx.strokeStyle = P.muted; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x + 13, y - 4); ctx.stroke(); ctx.restore();
  text(line, x + 21, y, { font: '12.5px ' + SANS, color: P.muted, alpha: a * 0.95 });
}

function drawWords() {
  const cap = ease(prog(firstSpectrum, 1000, 1800));
  if (cap > 0) {
    const mx = W < 700 ? 22 : 72;
    if (W < 700) {                                          // narrow: two short lines instead of one long one
      text('each row is a sightline through simulated hydrogen', mx, L.bottom + 20, { font: '12px ' + SANS, color: P.muted, alpha: cap * 0.9 });
      text('Lyα forest at z = 3  ·  PRIYA', mx, L.bottom + 38, { font: '12px ' + SANS, color: P.muted, alpha: cap * 0.9 });
    } else {
      text('each row is a sightline through simulated hydrogen  ·  Lyα forest at z = 3  ·  PRIYA', mx, L.bottom + 22, { font: '12px ' + SANS, color: P.muted, alpha: cap * 0.9 });
    }
  }
  const id = ease(prog(identity, 1200));
  if (id > 0) {
    const x = W < 700 ? 22 : 72, y = H - 44;
    text('Ming-Feng Ho', x, y, { font: '300 ' + (W < 700 ? 30 : 40) + 'px ' + SERIF, color: P.ink, alpha: id });
    text('Lyα forest · dense absorbers · inference', x + 2, y + 22, { font: '13px ' + SANS, color: P.muted, alpha: ease(prog(identity, 900, 500)) });
    text('the research  ↓', W - (W < 700 ? 22 : 48), y, { font: '13px ' + SANS, color: P.muted, align: 'right', alpha: ease(prog(identity, 900, 900)), tracking: 0.3 });
    host.dispatchEvent(new CustomEvent('hero:identity'));
  }
}

// ------------------------------------------------------------------ loop
function tick(now) {
  now = Math.max(now, clock);                                 // monotonic: stepped and real frames may interleave
  const dt = Math.min(50, now - lastT) / 1000; lastT = now; clock = now;
  let relayout = W !== host.clientWidth || H !== host.clientHeight;
  const narrowNow = W < 700;
  // three stages, each earning its space: full field, working field, and on narrow a thinner
  // field from the first cutting, so the statistic never shares a vertical region with the strips
  const target = (narrowNow && kept.length) ? narrowXiFrac()
    : (everSelected || kept.length) ? WORK : 1.0;
  const next = fieldFrac + (target - fieldFrac) * Math.min(1, dt * 3.2);
  if (Math.abs(next - fieldFrac) > 1e-4) { fieldFrac = next; relayout = true; }
  if (relayout) layout();

  // the probe: sweeps from the far end to the hand, then follows it. The first row is read slowly.
  if (hover) {
    const speed = hover.ceremony && !REDUCED ? 0.36 : 2.2;   // field widths per second; no slow ceremony under reduced motion
    const goal = pointerX ?? 0.6;
    const waiting = hover.ceremony && clock - hover.t0 < 700;   // anticipation: the row is named, the light appears, then it moves
    if (settleAt !== null && clock >= settleAt) { revealX = Math.max(0, revealX - 0.16); settleAt = null; }
    // inside a saturated run the light labours: the crossing of a dense absorber takes time
    const cNow = Math.min(NX - 1, Math.round(revealX * NX));
    const dense = satMask[hover.row * NX + cNow] ? 0.16 : 1;
    if (!waiting) { const sp = speed * dense; if (revealX < goal - 0.002) revealX = Math.min(goal, revealX + sp * dt); else revealX += (goal - revealX) * Math.min(1, dt * 10); }
    if (firstSpectrum === null && hover.ceremony && revealX >= goal - 0.01) firstSpectrum = clock;
    // dense run: the field reacts as the probe enters, the mark comes after it has left
    if (bloom.run) {
      const c = revealX * NX, [a, b] = bloom.run;
      const inside = c >= a - 12 && c <= b + 12, past = c > b + 12;
      if (inside && bloom.enteredAt === null) bloom.enteredAt = clock;
      if (past && bloom.exitAt === null && bloom.enteredAt !== null) bloom.exitAt = clock;
      const want = inside ? 1 : past ? 0.55 : 0;
      bloom.i += (want - bloom.i) * Math.min(1, dt * (inside ? 9 : 3));
    }
  }
  const dimTarget = hover ? 1 : 0; dimShown += (dimTarget - dimShown) * Math.min(1, dt * 4);
  probeOn += ((hover ? 1 : 0) - probeOn) * Math.min(1, dt * 5);
  for (let i = 0; i <= NLAG; i++) xiShown[i] += (xiTarget[i] - xiShown[i]) * Math.min(1, dt * 5);

  // the cuts land first, then the field is drawn with them: one direction, no back-reference
  for (const k of kept) if (!k.cut && prog(k.t0, 1, 420) > 0) k.cut = true;   // the strip has flown
  const cutRows = []; for (const k of kept) if (k.cut) cutRows.push(k.row);

  // field
  const rowSel = hover ? hover.row : (leaving && clock - leaving.t0 < 900 ? leaving.row : -1);
  const readX = hover ? colX(Math.round(revealX * NX)) : (leaving && clock - leaving.t0 < 900 ? colX(Math.round(leaving.readX * NX)) : -1e4);
  fieldSurface.render({
    W, H, dpr: DPR, field: L, palette: { ...FP, rust: P.ember },
    gaps: cutRows,                            // the visitor's landed cuts, owned here, not by a renderer
    stains: kept.filter(k => isDense(k.row)).flatMap(k => runs[k.row].map(([a, b]) => [colX(a), colX(b), rowY(k.row), 0.85 * ease(prog(k.t0, 900, 300))])),
    dim: dimShown, probe: { x: hover ? colX(Math.round(revealX * NX)) : -5000, y: hover ? rowY(hover.row) : -5000, on: probeOn },
    rowY: rowSel >= 0 ? rowY(rowSel) : -1e4, rowH: L.fh / NY, readX,
    bloom: bloom.run && hover ? [colX(bloom.run[0]), colX(bloom.run[1]), bloom.i] : [0, 0, 0],
    time: clock / 1000, mode: 0, grain: 0.035, layers: OPT.layers ?? 1,
  });
  // overlay (2D)
  ctx.clearRect(0, 0, W, H);
  drawCutNumerals();
  drawCollection();
  drawRibbon();
  drawXi();
  drawHint();
  drawWords();
}
let realtimeWorker = null, onTick = null; const tickListeners = new Set();
// ------------------------------------------------------------------ the frame scheduler
// One owner of requestAnimationFrame, one predicate deciding whether to run.
//
//   INVARIANT: running === true means a frame is executing right now, or one is definitely
//   scheduled. There is no state in which running is true and no future frame exists.
//
// Browsers throttle rAF for background tabs but not for elements scrolled out of view, and this
// loop renders the field every frame, so the hero idles when it is off screen too.
//
// The tick has one other driver: __cs.realtime(true) hands it to a worker timer, used by the
// development capture helper, which is stripped from every public build. While that worker exists
// it owns the tick and the rAF frame skips it; the worker handle is the single source of that fact.
let heroOnScreen = true;                     // no IntersectionObserver means always on screen
let running = false;
const shouldRun = () => heroOnScreen && document.visibilityState !== 'hidden';

function frame(now) {
  try {
    if (!realtimeWorker) tick(now);
  } catch (err) {
    // Report it and stop cleanly. A later update() can restart the loop; a self-restart here would
    // repeat the same throw every 16 ms and bury the cause.
    running = false;
    console.error('[hero] frame failed, loop stopped until the next visibility or scroll change', err);
    return;
  }
  if (shouldRun()) requestAnimationFrame(frame);
  else running = false;
}
function update() {
  if (running || !shouldRun()) return;
  running = true;
  lastT = performance.now();                 // do not bill the idle interval to the next frame
  requestAnimationFrame(frame);
}
if (window.IntersectionObserver) {
  new IntersectionObserver(es => { heroOnScreen = es[es.length - 1].isIntersecting; update(); },
    { rootMargin: '120px' }).observe(host);
}
document.addEventListener('visibilitychange', update);
update();
function realtime(on) {                                      // dev: drive the loop from a worker timer when the host throttles rAF
  if (on && !realtimeWorker) {
    const src = 'setInterval(() => postMessage(0), 16);';
    realtimeWorker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    realtimeWorker.onmessage = () => { tick(performance.now()); if (onTick) onTick(); for (const f of tickListeners) f(); };
  } else if (!on && realtimeWorker) { realtimeWorker.terminate(); realtimeWorker = null; }
}

window.__cs = {
  get keptRows() { return kept.map(k => k.row); }, F, NX, NY, rowRuns: runs, isDense,
  pointer: setPointer, down: pointerDown, get field() { return fieldSurface; },
  setLayers(v) { OPT.layers = v; }, setFrac(v) { fieldFrac = v; layout(); },
  advance(ms, steps = 1) { for (let i = 0; i < steps; i++) tick(clock + ms / steps); },
  realtime, set onTick(f) { onTick = f; }, tickListeners,
  get state() { return { hover, kept: kept.map(k => k.row), L, firstSpectrum, xiEmerge, xiAxes, identity, revealX, bloom, keepChip, lastTouch, fieldFrac }; },
  rowAt(r) { return rowY(r); },
};
}
