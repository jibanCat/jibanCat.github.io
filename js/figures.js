/* Project visuals, drawn in the site's own language.
   No borrowed plots, no axes, no tick furniture, no legends: the same ink, wash, graphite and
   reserved rust as the hero, and the same data behind it (material/assets via data/f5.js and
   data/figures.js). Every mark is real — a PRIYA sightline, the PRIYA field, a measured statistic —
   or it is typographic and states no data at all.

     field  — a crop of the same simulated plane the hero reads, optionally with one sightline
              lifted as a silhouette, and optionally shown coarse beside fine
     form   — a statistic as an ink form rising from a hairline, the way ξ appears in the hero
     ask    — a question set in the serif, no data
*/
(() => {
'use strict';
const FD = window.FIGURE_DATA, CS = window.CORE_SAMPLE_DATA;
const NX = CS.nx, NY = CS.ny;
const F32 = CS.F32;                                          // decoded once by the bootstrap, or absent
const HAS_FIELD = !!(F32 && F32.length === NX * NY);          // no field: the typographic figure still draws
const F = i => F32[i];
// saturated stretches, measured from the field on the same criterion the hero uses:
// transmission below 0.02 for at least 500 km/s
const RUNS = !HAS_FIELD ? new Map() : (() => {
  const out = new Map();
  const want = new Set([341]);
  for (const row of want) {
    const rs = []; let run = 0, start = 0;
    for (let x = 0; x <= NX; x++) {
      const v = x < NX ? F(row * NX + x) : 1;
      if (v < 0.02) { if (!run) start = x; run++; }
      else { if (run >= 50) rs.push([start, x]); run = 0; }
    }
    out.set(row, rs);
  }
  return out;
})();
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));

function prep(c) {
  const dpr = Math.min(2, devicePixelRatio || 1);
  const W = c.clientWidth, H = c.clientHeight;
  c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
  const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = css('--paper'); g.fillRect(0, 0, W, H);
  return { g, W, H, dpr };
}
function label(g, t, x, y, colour, align) {
  g.save(); g.font = '10px ' + css('--mono'); g.fillStyle = colour || css('--muted');
  g.textAlign = align || 'left'; g.textBaseline = 'alphabetic';
  try { g.letterSpacing = '0.05em'; } catch (e) {}
  g.fillText(t, x, y); g.restore();
}

/* ---------------------------------------------------------------- the field, in ink */
function fieldPixels(g, W, H, dpr, box, coarse) {
  const [r0, r1, c0, c1] = box;
  const w = Math.round(W * dpr), h = Math.round(H * dpr);
  const img = g.createImageData(w, h);
  const paper = hex(css('--paper')), wash = hex(css('--wash')), ink = hex(css('--ink'));
  const nR = r1 - r0, nC = c1 - c0, blk = Math.round(9 * dpr);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // the cheap half is the same universe at lower resolution: a wider average, smoothly resolved,
      // so it reads as less detail rather than as a damaged image
      const cheap = coarse && x < w / 2;
      const span = cheap ? blk : 1;
      const rr0 = r0 + Math.floor((y - (span - 1) / 2) / h * nR), rr1 = Math.max(rr0 + 1, r0 + Math.ceil((y + (span - 1) / 2) / h * nR));
      const cc0 = c0 + Math.floor((x - (span - 1) / 2) / w * nC), cc1 = Math.max(cc0 + 1, c0 + Math.ceil((x + (span - 1) / 2) / w * nC));
      let d = 0, n = 0;
      for (let r = Math.max(r0, Math.min(rr0, r1 - 1)); r < Math.min(rr1, r1); r++)
        for (let cc = Math.max(c0, Math.min(cc0, c1 - 1)); cc < Math.min(cc1, c1); cc++) { d += 1 - F(r * NX + cc); n++; }
      d = n ? d / n : 0;
      const a = Math.min(1, Math.pow(d, 1.25) * 1.05);
      const col = d > 0.55 ? ink : wash;
      const i = 4 * (y * w + x);
      img.data[i] = paper[0] + (col[0] - paper[0]) * a;
      img.data[i + 1] = paper[1] + (col[1] - paper[1]) * a;
      img.data[i + 2] = paper[2] + (col[2] - paper[2]) * a;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
}

function drawField(c) {
  const { g, W, H, dpr } = prep(c);
  const box = (c.dataset.box || '0,480,0,1389').split(',').map(Number);
  const coarse = c.dataset.coarse === '1';
  fieldPixels(g, W, H, dpr, box, coarse);
  const [r0, r1, c0, c1] = box;

  if (c.dataset.sil) {                                   // one sightline lifted, as the hero lifts it
    const row = Number(c.dataset.sil);
    const y0 = Math.round((row - r0 + 0.5) / (r1 - r0) * H);
    const nC = c1 - c0, hh = Math.min(H * 0.42, y0 - 10);
    const runs = RUNS.get(row) || [];
    if (runs.length) {                                   // the dense stretch stains the field first
      for (const [a, b] of runs) {
        const xa = (a - c0) / nC * W, xb = (b - c0) / nC * W;
        if (xb < -40 || xa > W + 40) continue;
        const gr = g.createRadialGradient((xa + xb) / 2, y0, 0, (xa + xb) / 2, y0, Math.max(46, (xb - xa) * 1.5));
        gr.addColorStop(0, 'rgba(185,58,32,0.50)'); gr.addColorStop(1, 'rgba(185,58,32,0)');
        g.fillStyle = gr; g.fillRect(xa - 110, y0 - 70, (xb - xa) + 220, 140);
      }
    }
    const wash = g.createLinearGradient(0, y0 - hh - 14, 0, y0);   // the material recedes where the row has been read
    wash.addColorStop(0, 'rgba(244,242,237,0.86)'); wash.addColorStop(1, 'rgba(244,242,237,0.55)');
    g.fillStyle = wash; g.fillRect(0, Math.max(0, y0 - hh - 14), W, Math.min(hh + 14, y0));
    g.fillStyle = css('--paper'); g.fillRect(0, y0 - 1, W, 3);      // the cut the reading leaves
    const top = x => { const col = c0 + Math.min(nC - 1, Math.max(0, Math.floor(x / W * nC))); return y0 - hh * F(row * NX + col); };
    g.beginPath(); g.moveTo(0, y0);
    for (let x = 0; x <= W; x++) g.lineTo(x, top(x));
    g.lineTo(W, y0); g.closePath();
    const grad = g.createLinearGradient(0, y0, 0, y0 - hh);
    grad.addColorStop(0, css('--pool')); grad.addColorStop(1, css('--ink'));
    g.fillStyle = grad; g.fill();
    g.strokeStyle = 'rgba(244,242,237,0.9)'; g.lineWidth = 1.1; g.lineJoin = 'round';
    g.beginPath(); for (let x = 0; x <= W; x++) { const y = top(x); x ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
    if (runs.length) for (const [a, b] of runs) {
      const xa = (a - c0) / nC * W, xb = (b - c0) / nC * W;
      if (xb < 0 || xa > W) continue;
      g.fillStyle = css('--rust'); g.fillRect(xa, y0 + 1, xb - xa, 3);
    }
  }
  if (coarse) {
    g.strokeStyle = 'rgba(244,242,237,0.5)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(Math.round(W / 2), 0); g.lineTo(Math.round(W / 2), H); g.stroke();
    label(g, 'CHEAP', 12, H - 12, css('--paper'));
    label(g, 'EXPENSIVE', W / 2 + 12, H - 12, css('--paper'));
  }
}


/* ---------------------------------------------------------------- inference on a spectrum
   The sentence to see before reading: the observed light falls, but the model believes the
   unabsorbed quasar continues above it.
   Honest by construction: the slate contours are the stored GP mean and its two stored sigma
   widths (F3 arrays), not invented draws. Synthetic material, captioned synthetic. */
function drawGP(c) {
  const { g, W, H } = prep(c);
  const d = FD.gp;
  const L = 26, R = 26, T = 40, B = 30;
  // a window around the absorber: the sentence lives there, and the far blue end is where the
  // model's uncertainty diverges and would swamp the drawing
  const lo0 = d.wave.findIndex(w => w > d.dla_wave - 300);
  let hi0 = d.wave.length - 1; while (hi0 > 0 && d.wave[hi0] > d.dla_wave + 300) hi0--;
  const n = hi0 - lo0 + 1;
  const w0 = d.wave[lo0], w1 = d.wave[hi0];
  let fmax = 0; for (let i = lo0; i <= hi0; i++) fmax = Math.max(fmax, d.mean[i] + d.sigma[i] * 0.55, d.flux[i]);
  fmax *= 1.05;
  const X = v => L + (v - w0) / (w1 - w0) * (W - L - R);
  const Y = v => T + (1 - Math.max(0, Math.min(fmax, v)) / fmax) * (H - T - B);
  const base = Y(0);

  // the observed light: a fine graphite trace, the only thing ever measured
  g.save(); g.strokeStyle = css('--ink'); g.globalAlpha = 0.62; g.lineWidth = 0.75; g.lineJoin = 'round';
  g.beginPath(); for (let i = lo0; i <= hi0; i++) { const x = X(d.wave[i]), y = Y(d.flux[i]); i === lo0 ? g.moveTo(x, y) : g.lineTo(x, y); } g.stroke(); g.restore();

  // belief: nested hairline contours at the stored sigma widths. They gather into a wash by accumulation,
  // never by a filled slab.
  const contour = (k, alpha, width) => {
    g.save(); g.strokeStyle = css('--wash'); g.globalAlpha = alpha; g.lineWidth = width; g.lineJoin = 'round';
    for (const sgn of (k === 0 ? [0] : [1, -1])) {
      g.beginPath();
      for (let i = lo0; i <= hi0; i++) { const x = X(d.wave[i]), y = Y(Math.max(0, d.mean[i] + sgn * k * d.sigma[i])); i === lo0 ? g.moveTo(x, y) : g.lineTo(x, y); }
      g.stroke();
    }
    g.restore();
  };
  for (const [k, a] of [[0.55, 0.20], [0.40, 0.24], [0.26, 0.30], [0.13, 0.36]]) contour(k, a, 0.85);
  contour(0, 1, 2.1);                                   // the inferred continuum itself

  // the absorber: the one place the trace falls to the floor and the belief keeps going
  const xa = X(d.dla_wave);
  let lo = lo0, hi = hi0;
  for (let i = lo0; i <= hi0; i++) if (d.wave[i] < d.dla_wave - 34) lo = i;
  for (let i = hi0; i >= lo0; i--) if (d.wave[i] > d.dla_wave + 34) hi = i;
  g.save();                                                // the gap between belief and light, in rust, only here
  g.fillStyle = css('--rust'); g.globalAlpha = 0.17;
  g.beginPath(); g.moveTo(X(d.wave[lo]), Y(d.mean[lo]));
  for (let i = lo; i <= hi; i++) g.lineTo(X(d.wave[i]), Y(d.mean[i]));
  for (let i = hi; i >= lo; i--) g.lineTo(X(d.wave[i]), Y(d.flux[i]));
  g.closePath(); g.fill(); g.restore();
  g.save(); g.strokeStyle = css('--rust'); g.lineWidth = 1.1; g.globalAlpha = 0.85; g.lineJoin = 'round';
  g.beginPath(); for (let i = lo; i <= hi; i++) { const x = X(d.wave[i]), y = Y(d.flux[i]); i === lo ? g.moveTo(x, y) : g.lineTo(x, y); } g.stroke(); g.restore();
  g.save(); g.fillStyle = css('--rust'); g.fillRect(xa - 0.5, base + 3, 1, 6); g.restore();

  g.strokeStyle = css('--faint'); g.lineWidth = 1; g.beginPath(); g.moveTo(L, base + 0.5); g.lineTo(W - R, base + 0.5); g.stroke();
  label(g, 'INFERRED UNABSORBED QUASAR SPECTRUM', L, T - 20, css('--wash'));
  label(g, 'SYNTHETIC ABSORBED SPECTRUM', L, T - 8);
  label(g, 'ABSORBED', X(d.wave[hi]) + 10, Y(d.mean[hi]) + 16, css('--rust'));
}

/* ---------------------------------------------------------------- fidelity
   One sightline, one prediction, resolution rising from left to right: the cheap simulation
   resolves the broad shape, the expensive one resolves every absorption feature. The same row,
   averaged over a window that narrows across the frame. Nothing is added or invented. */
function drawFidelity(c) {
  const { g, W, H } = prep(c);
  const row = Number(c.dataset.row || 239), c0 = Number(c.dataset.c0 || 0), c1 = Number(c.dataset.c1 || NX);
  const nC = c1 - c0;
  const L = 26, R = 26, T = 42, B = 40;
  const base = H - B, hh = (H - T - B) * 0.92;
  const WIDE = 34;                                          // the coarsest window, in field columns
  const winAt = x => {                                      // fidelity rises across the frame
    const t = Math.max(0, Math.min(1, (x / W - 0.06) / 0.88));
    const e = t * t * (3 - 2 * t);
    return Math.max(1, WIDE * (1 - e));
  };
  const val = x => {
    const col = c0 + Math.min(nC - 1, Math.max(0, Math.floor(x / W * nC)));
    const half = winAt(x) / 2;
    let s2 = 0, k = 0;
    for (let j = Math.round(col - half); j <= Math.round(col + half); j++) { const jj = Math.min(NX - 1, Math.max(0, j)); s2 += F(row * NX + jj); k++; }
    return s2 / k;
  };
  // the form itself, filled with a wash-to-graphite gradient so the eye reads left as cheap, right as fine
  g.beginPath(); g.moveTo(0, base);
  for (let x = 0; x <= W; x++) g.lineTo(x, base - hh * val(x));
  g.lineTo(W, base); g.closePath();
  const grad = g.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, css('--wash')); grad.addColorStop(0.34, css('--wash'));
  grad.addColorStop(0.72, css('--ink')); grad.addColorStop(1, css('--pool'));
  g.save(); g.globalAlpha = 0.92; g.fillStyle = grad; g.fill(); g.restore();
  // the edge, brightening as the detail arrives
  g.save(); g.strokeStyle = 'rgba(244,242,237,0.9)'; g.lineWidth = 1; g.lineJoin = 'round';
  g.beginPath(); for (let x = 0; x <= W; x++) { const y = base - hh * val(x); x ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); g.restore();
  // the same sightline at full detail, ghosted, so the cheap end is visibly the same object
  g.save(); g.strokeStyle = css('--ink'); g.globalAlpha = 0.18; g.lineWidth = 0.7; g.lineJoin = 'round';
  g.beginPath();
  for (let x = 0; x <= W * 0.42; x++) { const col = c0 + Math.min(nC - 1, Math.floor(x / W * nC)); const y = base - hh * F(row * NX + col); x ? g.lineTo(x, y) : g.moveTo(x, y); }
  g.stroke(); g.restore();
  g.strokeStyle = css('--faint'); g.lineWidth = 1; g.beginPath(); g.moveTo(L, base + 0.5); g.lineTo(W - R, base + 0.5); g.stroke();
  label(g, 'LOW RESOLUTION', L, T - 8, css('--wash'));
  label(g, 'FULL DETAIL', W - R, T - 8, null, 'right');
  label(g, 'SAME SIGHTLINE', L, base + 16);
}

/* ---------------------------------------------------------------- a statistic as an ink form */
function drawForm(c) {
  // the correlation function, drawn exactly as it emerges in the hero: an ink form on a hairline
  const { g, W, H } = prep(c);
  const both = c.dataset.both === '1';
  const lag = CS.lag_kms, A = CS.xi_clean, B2 = CS.xi_dla;
  const L = 30, R = 30, T = 44, B = 40;
  const NL = 300, RIDGE = 0.68;
  const X = v => L + (Math.log10(Math.max(10, v)) - 1) / (Math.log10(3000) - 1) * (W - L - R);
  const top = 0.40;
  const Y = v => (H - B) - Math.max(0, Math.min(top, v)) / top * (H - T - B) * RIDGE;
  const base = H - B;
  const form = (arr, fill, blur, alpha) => {
    g.save(); if (blur) g.filter = 'blur(' + blur + 'px)'; g.globalAlpha = alpha;
    g.fillStyle = fill; g.beginPath(); g.moveTo(X(lag[1]), base);
    for (let i = 1; i <= NL; i++) g.lineTo(X(lag[i]), Y(arr[i]));
    g.lineTo(X(lag[NL]), base); g.closePath(); g.fill(); g.restore();
  };
  const d = { k: lag.slice(1, NL + 1), clean: A.slice(1, NL + 1), dla: B2.slice(1, NL + 1) };
  if (both) {                                            // the difference is the point: a thin wash and a ridge, no second slab
    g.save(); g.globalAlpha = 0.055; g.fillStyle = css('--rust');
    g.beginPath(); g.moveTo(X(lag[1]), Y(B2[1]));
    for (let i = 1; i <= NL; i++) g.lineTo(X(lag[i]), Y(B2[i]));
    for (let i = NL; i >= 1; i--) g.lineTo(X(lag[i]), Y(A[i]));
    g.closePath(); g.fill(); g.restore();
    g.save(); g.strokeStyle = css('--rust'); g.globalAlpha = 0.30; g.lineWidth = 0.7;   // the gap, measured at intervals
    for (let i = 8; i <= NL; i += 26) { const x = X(lag[i]); g.beginPath(); g.moveTo(x, Y(A[i])); g.lineTo(x, Y(B2[i])); g.stroke(); }
    g.restore();
  }
  form(A, css('--ink'), 16, 0.20);
  form(A, css('--pool'), 0, 0.95);
  if (both) {
    g.save(); g.strokeStyle = css('--rust'); g.globalAlpha = 0.9; g.lineWidth = 1.4; g.lineJoin = 'round'; g.setLineDash([5, 3]);
    g.beginPath(); for (let i = 1; i <= NL; i++) { const x = X(lag[i]), y = Y(B2[i]); i === 1 ? g.moveTo(x, y) : g.lineTo(x, y); }
    g.stroke(); g.restore();
  }
  g.strokeStyle = css('--faint'); g.lineWidth = 1;
  g.beginPath(); g.moveTo(L, base + 0.5); g.lineTo(W - R, base + 0.5); g.stroke();
  label(g, 'CLOSE TOGETHER', L, base + 16);
  label(g, 'FAR APART', W - R, base + 16, null, 'right');
  if (both) {
    label(g, 'SIGHTLINES WITH A DLA', L, T - 22, css('--rust'));
    label(g, 'SIGHTLINES WITHOUT A DLA', L, T - 8);
  } else {
    label(g, 'CORRELATION BETWEEN TWO POINTS IN THE FOREST', L, T - 8);
  }
}

/* ---------------------------------------------------------------- a question, set in the serif */
function drawAsk(c) {
  const { g, W, H } = prep(c);
  const q = c.dataset.ask || '';
  g.fillStyle = css('--ink'); g.textAlign = 'center'; g.textBaseline = 'middle';
  const size = Math.max(16, Math.min(38, (W - 40) / (q.length * 0.5)));   // must fit the box at any width
  g.font = '300 ' + size + 'px ' + css('--serif');
  g.fillText(q, W / 2, H / 2 - 4);
  g.strokeStyle = css('--faint'); g.lineWidth = 1;
  g.beginPath(); g.moveTo(W / 2 - 44, H / 2 + size * 0.85); g.lineTo(W / 2 + 44, H / 2 + size * 0.85); g.stroke();
}

/* ---------------------------------------------------------------- the Bayesian marginalia
   Three states of one schematic object, not three symbols. Nothing here is data: no PRIYA row, no
   measured posterior, no axis. Graphite and slate only; rust stays reserved for dense absorbers.
   The same thirteen possibilities appear in all three panels: the data reweight them, they are not
   replaced.                                                                                     */
const bnoise = (i, k) => {                      // deterministic, so a resize redraws the same object
  const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
};
function bFan(g, W, H, mid, spread, drift, seed, alpha, colour, width) {
  // one possible history of the same object: it leaves the left edge knowing little and diverges
  g.save(); g.globalAlpha = alpha; g.strokeStyle = colour; g.lineWidth = width;
  g.beginPath();
  for (let x = 0; x <= W; x += 2) {
    const t = x / W, open = Math.pow(t, 0.75);
    const wig = H * 0.045 * open * (0.6 * Math.sin(t * 7.1 + bnoise(seed, 1) * 6.3)
                                  + 0.4 * Math.sin(t * 14.3 + bnoise(seed, 2) * 6.3));
    const y = mid + drift * spread * open + wig;
    x ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.stroke(); g.restore();
}
function drawBayesA(c, state) {
  const { g, W, H } = prep(c);
  const ink = css('--ink'), wash = css('--wash'), faint = css('--faint');
  const mid = H * 0.5, spread = H * 0.40, N = 13;
  const drift = i => (i - (N - 1) / 2) / ((N - 1) / 2) + 0.10 * bnoise(i, 7);
  const DATA = [[0.46, -0.20], [0.71, -0.14], [0.93, -0.22]];   // where the object was actually seen
  const target = -0.19, tol = 0.30;
  const fit = d => Math.exp(-Math.pow(d - target, 2) / (2 * tol * tol));
  for (let i = 0; i < N; i++) {
    const d = drift(i), f = fit(d);
    let a, col, lw;
    if (state === 'prior') { a = 0.26; col = wash; lw = 0.8; }
    else if (state === 'likelihood') { a = 0.06 + 0.50 * f; col = f > 0.5 ? ink : wash; lw = 0.75 + 0.55 * f; }
    else { const keep = f > 0.66; a = keep ? 0.66 : 0.13; col = keep ? ink : faint; lw = keep ? 1.15 : 0.7; }
    bFan(g, W, H, mid, spread, d, i + 1, a, col, lw);
  }
  // the data are marks the possibilities are judged against, not a curve of their own
  if (state !== 'prior') {
    g.save(); g.fillStyle = ink; g.globalAlpha = 0.85;
    for (const [t, dv] of DATA) {
      const x = W * t, y = mid + dv * spread * Math.pow(t, 0.75);
      g.beginPath(); g.arc(x, y, 1.9, 0, Math.PI * 2); g.fill();
    }
    g.restore();
  }
}
function drawBayes(c) { drawBayesA(c, c.dataset.state); }

/* ---------------------------------------------------------------- the research sequence
   One story in three states, on one frame: the same five PRIYA rows, the same baseline, the same
   line weight, the same ξ vocabulary. Rust appears in the third state only, on the one row that
   actually contains a saturated stretch. Nothing here is observational and nothing is invented:
   every trace is a row of the field the hero reads, and both ξ curves are the stored references. */
const RSEQ = [88, 150, 239, 300, 341];                    // 341 is the only one carrying a DLA
const rRuns = (row) => {                                  // saturated stretches, the hero's criterion
  const rs = []; let run = 0, start = 0;
  for (let x = 0; x <= NX; x++) {
    const v = x < NX ? F(row * NX + x) : 1;
    if (v < 0.02) { if (!run) start = x; run++; } else { if (run >= 50) rs.push([start, x]); run = 0; }
  }
  return rs;
};
function rFlux(g, row, x0, x1, base, h, colour, alpha, width, c0, c1) {
  g.save(); g.globalAlpha = alpha; g.strokeStyle = colour; g.lineWidth = width;
  g.beginPath();
  const n = Math.max(2, Math.round(x1 - x0));
  for (let i = 0; i <= n; i++) {
    const col = Math.min(NX - 1, Math.round(c0 + (c1 - c0) * i / n));
    const y = base - h * Math.min(1, F(row * NX + col));
    i ? g.lineTo(x0 + i, y) : g.moveTo(x0 + i, y);
  }
  g.stroke(); g.restore();
}
function rXi(g, arr, x0, x1, base, h, style, fill, alpha, dash) {
  const lag = CS.lag_kms, NL = 300, top = 0.40;
  const X = v => x0 + (Math.log10(Math.max(10, v)) - 1) / (Math.log10(3000) - 1) * (x1 - x0);
  const Y = v => base - Math.max(0, Math.min(top, v)) / top * h;
  g.save(); g.globalAlpha = alpha;
  g.beginPath(); g.moveTo(X(lag[1]), fill ? base : Y(arr[1]));
  for (let i = 1; i <= NL; i++) g.lineTo(X(lag[i]), Y(arr[i]));
  if (fill) { g.lineTo(X(lag[NL]), base); g.closePath(); g.fillStyle = style; g.fill(); }
  else { g.strokeStyle = style; g.lineWidth = 0.9; if (dash) g.setLineDash(dash); g.stroke(); }
  g.restore();
}
function drawResearch(c) {
  const { g, W, H, dpr } = prep(c);
  const ink = css('--ink'), wash = css('--wash'), faint = css('--faint'), rust = css('--rust');
  const state = c.dataset.state, base = H - 2;
  const LW = W * 0.32, RX = W * 0.40;        // every state reads left to right: the object, then its representation
  g.save(); g.globalAlpha = 0.55; g.strokeStyle = faint; g.lineWidth = 1;
  g.beginPath(); g.moveTo(0, base + 0.5); g.lineTo(W, base + 0.5); g.stroke(); g.restore();

  if (state === 'one') {
    // the field and the spectrum are the same object: a crop, one row marked, that row read out
    const r0 = 196, r1 = 282, c0 = 300, c1 = 1000;
    const cw = Math.round(LW * dpr), ch = Math.round((H - 4) * dpr);
    const off = document.createElement('canvas'); off.width = cw; off.height = ch;
    const oc = off.getContext('2d'), img = oc.createImageData(cw, ch);
    const paper = hex(css('--paper')), pool = hex(css('--pool'));
    for (let y = 0; y < ch; y++) {
      const rr = r0 + Math.floor(y / ch * (r1 - r0));
      for (let x = 0; x < cw; x++) {
        const cc = c0 + Math.floor(x / cw * (c1 - c0));
        let acc = 0, m = 0;                               // a small block average: the field, not its noise
        for (let dr = 0; dr < 2; dr++) for (let dc = 0; dc < 3; dc++) {
          const r = Math.min(r1 - 1, rr + dr), q = Math.min(NX - 1, cc + dc);
          acc += 1 - F(r * NX + q); m++;
        }
        const d = Math.min(1, Math.max(0, acc / m)) * 0.82;
        const o = (y * cw + x) * 4;
        for (let k = 0; k < 3; k++) img.data[o + k] = paper[k] + (pool[k] - paper[k]) * d;
        img.data[o + 3] = 255;
      }
    }
    oc.putImageData(img, 0, 0);
    g.drawImage(off, 0, 0, LW, H - 4);
    const yRow = (238 - r0) / (r1 - r0) * (H - 4);
    g.save(); g.strokeStyle = ink; g.lineWidth = 1;
    g.globalAlpha = 0.9; g.beginPath(); g.moveTo(0, yRow + 0.5); g.lineTo(LW, yRow + 0.5); g.stroke();
    g.globalAlpha = 0.30; g.beginPath(); g.moveTo(LW + 2, yRow + 0.5); g.lineTo(RX - 3, yRow + 0.5); g.stroke();
    g.restore();
    rFlux(g, 239, RX, W, base, H - 5, ink, 0.9, 0.9, c0, c1);
  } else {
    const dense = state === 'dense', rows = RSEQ, n = rows.length;
    const top = 3, span = (H - 8 - top), amp = span / n * 0.82;
    rows.forEach((row, i) => {
      const y = top + (i + 1) * span / n, isD = dense && row === 341;
      rFlux(g, row, 0, LW, y, amp, isD ? ink : wash, isD ? 0.82 : 0.36, isD ? 0.85 : 0.65, 450, 950);
      if (isD) {
        g.save(); g.globalAlpha = 0.9; g.strokeStyle = rust; g.lineWidth = 1.8;
        for (const [p0, p1] of rRuns(row)) {
          const x0 = (p0 - 450) / 500 * LW, x1 = (p1 - 450) / 500 * LW;
          if (x1 > 0 && x0 < LW) { g.beginPath(); g.moveTo(Math.max(0, x0), y + 0.5); g.lineTo(Math.min(LW, x1), y + 0.5); g.stroke(); }
        }
        g.restore();
      }
    });
    const fh = H - 10;
    rXi(g, CS.xi_clean, RX, W, base, fh, ink, true, 0.13);
    rXi(g, CS.xi_clean, RX, W, base, fh, ink, false, dense ? 0.55 : 0.85);
    if (dense) {
      rXi(g, CS.xi_dla, RX, W, base, fh, rust, false, 0.8, [3, 3]);
      label(g, 'WITH A DLA', RX, 9, rust);
      label(g, 'WITHOUT', RX, H - 4, css('--wash'));
    }
  }
}

const KINDS = { field: drawField, form: drawForm, ask: drawAsk, gp: drawGP, fidelity: drawFidelity, bayes: drawBayes, research: drawResearch };
function draw(c) {
  const f = KINDS[c.dataset.fig];
  if (!f || c.clientWidth <= 0 || c.clientHeight <= 0) return;
  if (!HAS_FIELD && c.dataset.fig !== 'ask') return;      // every other figure is drawn from the field
  f(c);
}
function drawAll() { document.querySelectorAll('canvas[data-fig]').forEach(draw); }
// One coalescer. `targets` names the elements that changed; null means "everything", which is what
// a viewport or orientation change means. Either way one frame of work, at the final size.
let queued = null, redrawAll = false, pendingFrame = 0;
function scheduleDraw(targets) {
  if (targets) { queued = queued || new Set(); for (const t of targets) queued.add(t); }
  else redrawAll = true;
  if (pendingFrame) return;
  pendingFrame = requestAnimationFrame(() => {
    pendingFrame = 0;
    const set = queued, all = redrawAll; queued = null; redrawAll = false;
    if (all) drawAll(); else if (set) set.forEach(draw);
  });
}
if (window.ResizeObserver) {
  const ro = new ResizeObserver(es => scheduleDraw(es.map(e => e.target)));
  document.querySelectorAll('canvas[data-fig]').forEach(c => ro.observe(c));
} else { window.addEventListener('resize', () => scheduleDraw(null)); requestAnimationFrame(drawAll); }
if (document.fonts && document.fonts.ready) document.fonts.ready.then(drawAll);
window.__figures = { drawAll };
})();
