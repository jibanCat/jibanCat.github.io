/* Play board: an illustration of Bayesian updating on a toy grid, drawn live. It is NOT the game and uses none of its
   code or data: a hidden cell, ten noisy observations along chosen columns, and a posterior that concentrates. */
(() => {
  const c = document.getElementById('play-board'); if (!c) return;
  const COLS = 12, ROWS = 7, N = COLS * ROWS;
  let state;
  const reset = () => {
    const target = Math.floor(Math.random() * N);
    state = { target, post: new Float64Array(N).fill(1 / N), obs: [], t: 0, step: 0 };
  };
  reset();
  const rng = () => Math.random();
  function observe() {
    // choose the column with the highest posterior mass (a greedy observer), receive noisy evidence, update
    const colMass = new Float64Array(COLS); for (let i = 0; i < N; i++) colMass[i % COLS] += state.post[i];
    let col = 0; for (let k = 1; k < COLS; k++) if (colMass[k] > colMass[col]) col = k;
    if (state.obs.length && rng() < 0.35) col = Math.floor(rng() * COLS);        // sometimes look elsewhere
    const hit = (state.target % COLS) === col;
    const noisyHit = rng() < (hit ? 0.8 : 0.2);                                  // 20 % noise either way
    for (let i = 0; i < N; i++) { const inCol = (i % COLS) === col; const like = inCol === noisyHit ? 0.8 : 0.2; state.post[i] *= like; }
    let s = 0; for (let i = 0; i < N; i++) s += state.post[i]; for (let i = 0; i < N; i++) state.post[i] /= s;
    state.obs.push({ col, hit: noisyHit }); state.step++;
  }
  const REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  let last = performance.now(), acc = 0, dirty = true, lastW = 0, lastH = 0;
  function draw() {
    const dpr = Math.min(2, devicePixelRatio || 1), W = c.clientWidth, H = c.clientHeight;
    const bw = Math.round(W * dpr), bh = Math.round(H * dpr);
    if (c.width !== bw || c.height !== bh) { c.width = bw; c.height = bh; }   // height alone changes on rotation
    const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#101821'; g.fillRect(0, 0, W, H);
    const tag = c.parentElement && c.parentElement.querySelector('.tag');
    // the caption wraps to two lines on a narrow phone; start the grid below whatever it occupies
    const capBottom = tag ? tag.offsetTop + tag.offsetHeight : 32;
    const pad = 28, top = Math.max(46, Math.ceil(capBottom) + 12), cw = (W - 2 * pad) / COLS, ch = (H - top - 44) / ROWS;
    let mx = 0; for (let i = 0; i < N; i++) mx = Math.max(mx, state.post[i]);
    for (let i = 0; i < N; i++) {
      const x = pad + (i % COLS) * cw, y = top + Math.floor(i / COLS) * ch, p = state.post[i] / mx;
      g.fillStyle = `rgba(220,235,246,${0.04 + 0.6 * p})`; g.fillRect(x + 2, y + 2, cw - 4, ch - 4);
      if (state.step >= 10 && i === state.target) { g.strokeStyle = '#B93A20'; g.lineWidth = 2; g.strokeRect(x + 3, y + 3, cw - 6, ch - 6); }
    }
    const numAt = [];                                  // x of every numeral already painted this frame
    for (const [k, o] of state.obs.entries()) {
      const x = pad + o.col * cw + cw / 2; g.strokeStyle = o.hit ? 'rgba(220,235,246,0.9)' : 'rgba(143,160,180,0.35)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x, top - 8); g.lineTo(x, top + ROWS * ch + 6); g.stroke();
      g.fillStyle = '#8FA0B4'; g.font = '10px "IBM Plex Mono", Menlo, monospace'; g.textAlign = 'center';
      // skip a numeral that would overprint one already drawn: at 10px mono a glyph is ~6px
      if (!numAt.some(px => Math.abs(px - x) < 7)) { g.fillText(String(k + 1), x, H - 30); numAt.push(x); }
    }
    g.fillStyle = '#8FA0B4'; g.font = '11px "IBM Plex Mono", Menlo, monospace'; g.textAlign = 'right';
    g.fillText(state.step < 10 ? `observation ${state.step} of 10` : 'reveal', W - pad, H - 14);
  }
  function frame(now) {
    const dt = now - last; last = now; acc += dt;
    if (acc > 1400) { acc = 0; if (state.step < 10) observe(); else reset(); dirty = true; }
    // repaint when the state moved or the box changed, not on every frame of a static picture
    if (c.clientWidth !== lastW || c.clientHeight !== lastH) { lastW = c.clientWidth; lastH = c.clientHeight; dirty = true; }
    if (dirty) { dirty = false; draw(); }
    if (!REDUCED) requestAnimationFrame(frame);
  }
  // The box can change without the loop noticing: under reduced motion there is no loop at all, and
  // a hidden tab gets no frames. Observe the element itself so a rotation always redraws at the
  // right size. The board is a 12x7 grid, so redrawing straight from the callback is cheap.
  // Two questions, one answer: the observer asks "did this element change", the window asks "did the
  // viewport or orientation change". Both converge on one coalesced redraw, so one rotation costs
  // one rasterisation rather than two.
  let pendingResize = 0;
  const scheduleResize = () => {
    if (pendingResize) return;
    pendingResize = requestAnimationFrame(() => {
      pendingResize = 0; lastW = c.clientWidth; lastH = c.clientHeight; dirty = false; draw();
    });
  };
  window.addEventListener('resize', scheduleResize);
  if (window.ResizeObserver) {
    let first = true;
    new ResizeObserver(() => { if (first) { first = false; return; } scheduleResize(); }).observe(c);
  }
  // draw once immediately: requestAnimationFrame does not run while the tab or pane is hidden,
  // and under reduced motion the board stays on this single settled state
  if (REDUCED) { for (let i = 0; i < 6; i++) observe(); draw(); }
  else { draw(); requestAnimationFrame(frame); }
})();
