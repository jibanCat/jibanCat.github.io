/* The field, drawn in 2-D: the same plane as the WebGL renderer, in ink on paper, without light,
   relief or bloom. It owns exactly one canvas, #field2d, which never holds any other context.

   It knows nothing about WebGL, context loss, or the other renderer, and it holds no interaction
   state: the cuts arrive in state.gaps every frame, like every other thing the hero draws.

   The plane tile is built on the first render, not at startup, because it is a 667k-pixel
   ImageData and most visitors never reach this renderer. */
function createField2D(canvas, F, NX, NY, palette) {
  'use strict';
  const g = canvas.getContext('2d');
  if (!g) throw new Error('2-D context unavailable');
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  let tile = null;

  function buildTile() {
    const t = document.createElement('canvas'); t.width = NX; t.height = NY;
    const tg = t.getContext('2d'), img = tg.createImageData(NX, NY);
    const pl = hex(palette.paper), wl = hex(palette.wash), il = hex(palette.ink);
    for (let i = 0; i < NX * NY; i++) {
      const d = 1 - F[i], a = Math.min(1, Math.pow(d, 1.25) * 1.05), col = d > 0.55 ? il : wl;
      img.data[4 * i] = pl[0] + (col[0] - pl[0]) * a;
      img.data[4 * i + 1] = pl[1] + (col[1] - pl[1]) * a;
      img.data[4 * i + 2] = pl[2] + (col[2] - pl[2]) * a;
      img.data[4 * i + 3] = 255;
    }
    tg.putImageData(img, 0, 0);
    return t;
  }

  return {
    render(s) {
      if (!tile) tile = buildTile();
      const w = Math.round(s.W * s.dpr), h = Math.round(s.H * s.dpr);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      g.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
      g.fillStyle = palette.paper; g.fillRect(0, 0, s.W, s.H);
      g.imageSmoothingEnabled = true;
      g.drawImage(tile, s.field.fx, s.field.fy, s.field.fw, s.field.fh);
      if (s.dim > 0) {
        g.globalAlpha = s.dim * 0.32; g.fillStyle = palette.paper;
        g.fillRect(s.field.fx, s.field.fy, s.field.fw, s.field.fh); g.globalAlpha = 1;
      }
      g.fillStyle = palette.paper;
      for (const r of s.gaps) g.fillRect(s.field.fx, s.field.fy + (r + 0.5) * s.field.fh / NY - 1, s.field.fw, 2);
      if (s.readX > -1000) g.fillRect(s.field.fx, s.rowY - 1, Math.max(0, s.readX - s.field.fx), 2);
    },
  };
}
