/* The field as material — v2, multi-scale pigment.
   Inputs (all derived once from the supplied F5 slice, nothing invented):
     texA: R = F (transmission), G = log10 τ mapped to 0..1 over 1e-3..1e5
     texB: R = pigment (mid-pass, σ≈2 texels), G = pigment (low-pass, σ≈7), B = pigment combed along the velocity axis
           (σx≈14, σy≈0.6), A = |∇ pigment_mid|
   pigment p = smoothstep(−1.2, 1.4, log10 τ): dilute wash near τ≈0.1–1, saturated above τ≈10.
   Treatments (uMode): 0 sumi · 1 backlit slab · 2 strata. uLayers == 0 renders raw ink (diagnostics). */
// hooks is required: onLost, onRestored and onRebuildFailed are all called unguarded below.
function createFieldGL(canvas, F, TAU8, PIG, PIG2, NX, NY, hooks) {
  // preserveDrawingBuffer costs a little on some GPUs, so it is opt-in: ?capture=1 makes the field
  // readable by toDataURL at any moment, which the review screenshots need. Production runs without it.
  const CAPTURE = typeof location !== 'undefined' && /[?&]capture=1/.test(location.search);
  const gl = canvas.getContext('webgl', { premultipliedAlpha: false, antialias: false, preserveDrawingBuffer: CAPTURE });
  if (!gl) throw new Error('WebGL unavailable');

  const VS = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;
  const FS = `
precision highp float;
uniform sampler2D uA, uB, uC, uGaps;
uniform vec2  uRes;
uniform vec4  uField;
uniform vec3  uPaper, uWash, uInk, uRust, uLight, uGround, uGlow, uMist, uPool;
uniform float uDim, uProbeOn, uRowY, uRowH, uReadX, uTime, uGrain;
uniform vec2  uProbe;
uniform vec3  uBloom;
uniform vec4  uStains[8];
uniform int   uNStains, uMode, uLayers;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
float pigment(float lt){ return smoothstep(0.2375, 0.5625, lt); }           // log10 τ in [-1.2, 1.4] on the 0..1 map

void main(){
  vec2 frag = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  float fibre = fbm(vec2(frag.x * 0.05, frag.y * 0.8)) - 0.5;
  float speck = noise(frag * 1.7) - 0.5;
  vec2 e = abs(frag / uRes - 0.5) * 2.0;
  float plate = 1.0 - 0.035 * smoothstep(0.6, 1.2, length(e));
  vec3 paper = uPaper * plate * (1.0 + fibre * 0.03 + speck * uGrain);

  vec2 uv = (frag - uField.xy) / uField.zw;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { gl_FragColor = vec4(paper, 1.0); return; }

  vec4 A = texture2D(uA, uv), B = texture2D(uB, uv);
  float Fv = A.r, lt = A.g;
  float p = pigment(lt), pM = B.r, pL = B.g, pX = B.b, edge = B.a;
  float pXL = texture2D(uC, uv).r;                           // broad massing: σ≈14 texels

  // the probe: an elliptical window along the row where fine detail and light live
  vec2 toP = frag - uProbe;
  float w = uProbeOn * exp(-(toP.x * toP.x / (2.0 * 300.0 * 300.0) + toP.y * toP.y / (2.0 * 120.0 * 120.0)));
  float plane = uProbeOn * exp(-toP.x * toP.x / (2.0 * 16.0 * 16.0)) * exp(-toP.y * toP.y / (2.0 * 220.0 * 220.0));
  float glance = uProbeOn * exp(-pow(toP.x - 70.0, 2.0) / (2.0 * 70.0 * 70.0)) * exp(-toP.y * toP.y / (2.0 * 46.0 * 46.0)) * step(0.0, toP.x);   // the light looks a little ahead

  vec3 col;
  if (uLayers == 0) { col = mix(paper, uInk, 1.0 - Fv); gl_FragColor = vec4(col, 1.0); return; }

  // fine detail: full only where attention is; at rest the mid-scale carries the image
  float fineMix = 0.18 + 0.82 * max(w, max(plane, glance));
  float pFine = mix(pM, p, fineMix);
  float gran = (noise(frag * 0.9) - 0.5) * 0.35 * smoothstep(0.5, 1.0, pM);   // pigment granulation in the dense knots
  // thin isolated features (a single skewer's wing far from any knot) are laid down as dry-brush threads at rest;
  // under the light the brush is wet again and the thread is continuous
  float thin = smoothstep(0.12, 0.45, p - 1.5 * pL);
  float dry = 0.35 + 0.65 * noise(vec2(frag.x * 0.28, frag.y * 2.6));
  float brush = mix(1.0, mix(dry, 1.0, max(w, plane)), thin);

  if (uMode == 0) {
    // INK-COLOUR SUMI. Colour follows τ across scales: the emptiest regions carry a faint mist; the low-pass field lays a
    // dilute wash; the mid-scale network is the vein ink; the pooled pigment in the knots is the deepest tone.
    float mist = (1.0 - smoothstep(0.0, 0.30, pL)) * 0.42;
    vec3 c = mix(paper, uMist, mist);
    float massing = 0.34 * smoothstep(0.03, 0.34, pXL);            // the large structures establish the image first
    c = mix(c, uWash * 0.92, massing);
    float haze = 0.22 * smoothstep(0.04, 0.55, pX);                 // atmosphere drifts along the velocity axis
    c = mix(c, uWash, haze);
    float washA = 0.80 * smoothstep(0.02, 0.42, pL);
    c = mix(c, uWash, washA);
    float veinA = 0.72 * smoothstep(0.20, 0.72, pM) * brush * (0.72 + 0.28 * smoothstep(0.02, 0.22, pXL));   // lone veins in empty regions stay quieter
    c = mix(c, uInk, veinA);
    float poolA = smoothstep(0.42, 0.9, pFine + gran) * brush;
    float rim = smoothstep(0.08, 0.35, edge) * smoothstep(0.25, 0.6, pM) * (1.0 - smoothstep(0.6, 0.95, pM)) * 0.5;
    vec3 poolC = mix(uInk, uPool, smoothstep(0.6, 1.0, pFine));
    c = mix(c, poolC, clamp(poolA + rim, 0.0, 1.0));
    float deposit = smoothstep(0.55, 0.95, pL) * (1.0 - smoothstep(0.5, 0.9, pFine)) * 0.45;
    c = mix(c, uRust * 0.85, deposit);
    col = c;
  } else if (uMode == 1) {
    // BACKLIT SLAB: a dark translucent mineral; transmission is light coming through; veins are what stops it
    float T = pow(1.0 - pL, 1.6) * (1.0 - 0.6 * smoothstep(0.2, 0.75, pM));       // what comes through: dim in the veins, dark in the knots
    float lamp = 0.55 + 0.6 * w;                                                     // dimly lit at rest, bright under the probe
    vec3 c = uGround + uGlow * pow(T, 1.2) * lamp * (1.0 + fibre * 0.10 + gran * 0.3);
    float knot = smoothstep(0.5, 0.95, pFine + gran);
    c = mix(c, uGround * 0.5, knot);
    float deposit = smoothstep(0.6, 0.95, pL) * (1.0 - smoothstep(0.5, 0.9, pFine)) * 0.4;
    c = mix(c, uRust * 0.8, deposit);
    col = c;
  } else {
    // STRATA: the velocity axis as sediment; broad combed washes, sharp veins, graphite sheen on the dense beds
    float combA = 0.45 * smoothstep(0.06, 0.6, pX);
    vec3 c = mix(paper, uWash, combA);
    float veinA = 0.6 * smoothstep(0.25, 0.8, pM);
    c = mix(c, mix(uWash, uInk, 0.55), veinA);
    float bed = smoothstep(0.45, 0.92, pFine + gran);
    c = mix(c, uInk, bed);
    float dxL = texture2D(uB, uv - vec2(1.5 / 1389.0, 0.0)).b, dxR = texture2D(uB, uv + vec2(1.5 / 1389.0, 0.0)).b;
    float sheen = pow(max(0.0, 1.0 - abs(dxR - dxL) * 6.0), 6.0) * smoothstep(0.6, 1.0, pX) * 0.18;
    c += uLight * sheen;
    float deposit = smoothstep(0.55, 0.95, pL) * (1.0 - smoothstep(0.5, 0.9, pFine)) * 0.45;
    c = mix(c, uRust * 0.9, deposit);
    col = c;
  }

  // recession while a row is up, except inside the window
  vec3 rest = uMode == 1 ? uGround : paper;
  col = mix(col, rest, uDim * 0.32 * (1.0 - max(w, plane)));

  // the illumination plane at the probe: a narrow lit slice through the material, and a cool halo on the paper around the light
  vec3 cool = uMode == 1 ? uLight : vec3(0.60, 0.71, 0.82);
  col = mix(col, uMode == 1 ? col + uLight * 0.14 : mix(col, cool, 0.30), plane);
  col = mix(col, mix(col, uLight, 0.5), glance * 0.35 * (1.0 - p));
  float halo = uProbeOn * exp(-dot(toP, toP) / (2.0 * 52.0 * 52.0));
  col = mix(col, uMode == 1 ? col + uLight * 0.35 : mix(col, cool, 0.45), halo);

  // dense knots the light has crossed: an ember bloom now, a rust stain for good
  if (uBloom.z > 0.0) {
    float inRun = smoothstep(uBloom.x - 26.0, uBloom.x, frag.x) * (1.0 - smoothstep(uBloom.y, uBloom.y + 26.0, frag.x));
    float band = exp(-pow((frag.y - uRowY) / 40.0, 2.0));
    float g = inRun * band * uBloom.z * (0.30 + 0.70 * pM);
    col = mix(col, uRust * 1.1, clamp(g, 0.0, 0.95));
  }
  for (int i = 0; i < 8; i++) {
    if (i >= uNStains) break;
    vec4 s = uStains[i];
    float inRun = smoothstep(s.x - 20.0, s.x, frag.x) * (1.0 - smoothstep(s.y, s.y + 20.0, frag.x));
    float band = exp(-pow((frag.y - s.z) / 24.0, 2.0));
    float g = inRun * band * s.w * (0.30 + 0.70 * pM) * (0.8 + 0.4 * noise(frag * 0.5));
    col = mix(col, uRust, clamp(g, 0.0, 0.7));
  }

  // cuts: rows taken to the workbench, and the row being read behind the probe; the read path keeps a faint thread of light
  float gap = texture2D(uGaps, vec2(uv.y, 0.5)).r;
  float rowBand = 1.0 - smoothstep(uRowH * 0.5, uRowH * 0.9, abs(frag.y - uRowY));
  float behind = (1.0 - smoothstep(uReadX - 6.0, uReadX + 6.0, frag.x)) * step(0.0, uReadX);
  float cut = max(gap, rowBand * behind);
  col = mix(col, rest, cut);
  // an incision, not a missing row: a faint ink edge along the top of every cut, a soft shadow beneath
  float fy = fract(uv.y * 480.0);
  float gapAbove = texture2D(uGaps, vec2(uv.y - 1.0 / 480.0, 0.5)).r;
  col *= 1.0 - gap * (1.0 - smoothstep(0.0, 0.35, fy)) * 0.22;
  col *= 1.0 - gapAbove * (1.0 - gap) * (1.0 - smoothstep(0.0, 0.7, fy)) * 0.16;
  float thread = rowBand * behind * exp(-(uReadX - frag.x) / 520.0);
  col = mix(col, cool, thread * 0.85);
  float below = smoothstep(0.0, uRowH * 0.6, frag.y - uRowY) * (1.0 - smoothstep(uRowH * 0.6, uRowH * 3.5, frag.y - uRowY));
  col *= 1.0 - below * behind * 0.26;

  gl_FragColor = vec4(col, 1.0);
}`;

  function compile(type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
  // Everything below is GPU-resident and is destroyed by a context loss, so it lives in build()
  // and can be made again on restore. iOS Safari drops contexts on memory pressure and on
  // backgrounding, and without this the field goes blank for the rest of the page's life.
  let prog, buf, texA, texB, texG, texC, U, stainLoc;
  const gaps = new Uint8Array(NY);           // write-only staging: refilled from state.gaps each frame
  function build() {
  prog = gl.createProgram(); gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);
  buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  function tex(unit, w, h, data, fmt, filter) {
    const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, fmt, w, h, 0, fmt, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  const A = new Uint8Array(NX * NY * 4);
  for (let i = 0; i < NX * NY; i++) { A[4 * i] = Math.round(F[i] * 255); A[4 * i + 1] = TAU8[i]; A[4 * i + 2] = 0; A[4 * i + 3] = 255; }
  texA = tex(0, NX, NY, A, gl.RGBA, gl.LINEAR);
  texB = tex(1, NX, NY, PIG, gl.RGBA, gl.LINEAR);
  texG = tex(2, NY, 1, gaps, gl.LUMINANCE, gl.NEAREST);
  texC = tex(3, NX, NY, PIG2, gl.LUMINANCE, gl.LINEAR);
  gl.uniform1i(gl.getUniformLocation(prog, 'uA'), 0); gl.uniform1i(gl.getUniformLocation(prog, 'uB'), 1); gl.uniform1i(gl.getUniformLocation(prog, 'uGaps'), 2); gl.uniform1i(gl.getUniformLocation(prog, 'uC'), 3);
  const names = ['uRes', 'uField', 'uPaper', 'uWash', 'uInk', 'uRust', 'uLight', 'uGround', 'uGlow', 'uMist', 'uPool', 'uDim', 'uProbeOn', 'uRowY', 'uRowH', 'uReadX', 'uTime', 'uGrain', 'uProbe', 'uBloom', 'uNStains', 'uMode', 'uLayers'];
  U = {}; for (const n of names) U[n] = gl.getUniformLocation(prog, n);
  stainLoc = []; for (let i = 0; i < 8; i++) stainLoc.push(gl.getUniformLocation(prog, 'uStains[' + i + ']'));
  }
  build();
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);

  // These two report to the surface, which decides who renders. This renderer never picks.
  canvas.addEventListener('webglcontextlost', e => {
    e.preventDefault();                       // without this the context can never be restored
    hooks.onLost();
  });
  canvas.addEventListener('webglcontextrestored', () => {
    try { build(); } catch (err) { hooks.onRebuildFailed(err); return; }
    hooks.onRestored();                       // only after the rebuild has actually succeeded
  });

  return {
    render(s) {
      // the cuts arrive with the frame; 480 bytes, so it is cheaper to upload than to cache
      gaps.fill(0);
      for (const r of s.gaps) gaps[r] = 255;
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, texG);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, NY, 1, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, gaps);
      const w = Math.round(s.W * s.dpr), h = Math.round(s.H * s.dpr);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      gl.viewport(0, 0, w, h);
      const k = s.dpr, P = s.palette;
      gl.uniform2f(U.uRes, w, h);
      gl.uniform4f(U.uField, s.field.fx * k, s.field.fy * k, s.field.fw * k, s.field.fh * k);
      for (const n of ['paper', 'wash', 'ink', 'rust', 'light', 'ground', 'glow', 'mist', 'pool']) gl.uniform3fv(U['u' + n[0].toUpperCase() + n.slice(1)], hex(P[n]));
      gl.uniform1f(U.uDim, s.dim); gl.uniform2f(U.uProbe, s.probe.x * k, s.probe.y * k); gl.uniform1f(U.uProbeOn, s.probe.on);
      gl.uniform1f(U.uRowY, s.rowY * k); gl.uniform1f(U.uRowH, Math.max(1.5, s.rowH * k)); gl.uniform1f(U.uReadX, s.readX * k);
      gl.uniform3f(U.uBloom, s.bloom[0] * k, s.bloom[1] * k, s.bloom[2]);
      const st = s.stains || []; gl.uniform1i(U.uNStains, Math.min(8, st.length));
      for (let i = 0; i < Math.min(8, st.length); i++) gl.uniform4f(stainLoc[i], st[i][0] * k, st[i][1] * k, st[i][2] * k, st[i][3]);
      gl.uniform1f(U.uTime, s.time); gl.uniform1f(U.uGrain, s.grain); gl.uniform1i(U.uMode, s.mode); gl.uniform1i(U.uLayers, s.layers ?? 1);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
  };
}

/* Multi-scale pigment maps from τ: computed once on the CPU. Returns { TAU8, PIG } for createFieldGL. */
function buildPigmentMaps(F, NX, NY) {
  const n = NX * NY;
  const lt = new Float32Array(n), p = new Float32Array(n), TAU8 = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const tau = -Math.log(Math.max(F[i], 1e-6));                 // τ back from F (F=0 → τ ≥ 13.8; enough for pigment saturation)
    const l = (Math.log10(tau + 1e-3) + 3) / 8; lt[i] = Math.max(0, Math.min(1, l)); TAU8[i] = Math.round(lt[i] * 255);
    const s = Math.max(0, Math.min(1, (lt[i] - 0.2375) / 0.325)); p[i] = s * s * (3 - 2 * s);
  }
  // A three-pass box blur approximates a Gaussian closely enough for a wash and costs the same at any
  // radius. The exact separable Gaussian this replaces blocked the main thread for about a second at load.
  const boxPass = (src, dst, w, h, r, horizontal) => {
    const n = 2 * r + 1;
    if (horizontal) {
      for (let y = 0; y < h; y++) {
        const o = y * w;
        let sum = src[o] * (r + 1);
        for (let i = 0; i < r; i++) sum += src[o + Math.min(w - 1, i)];
        for (let x = 0; x < w; x++) {
          sum += src[o + Math.min(w - 1, x + r)] - src[o + Math.max(0, x - r - 1)];
          dst[o + x] = sum / n;
        }
      }
    } else {
      for (let x = 0; x < w; x++) {
        let sum = src[x] * (r + 1);
        for (let i = 0; i < r; i++) sum += src[Math.min(h - 1, i) * w + x];
        for (let y = 0; y < h; y++) {
          sum += src[Math.min(h - 1, y + r) * w + x] - src[Math.max(0, y - r - 1) * w + x];
          dst[y * w + x] = sum / n;
        }
      }
    }
  };
  const gauss = (src, sx, sy) => {
    const rx = Math.max(0, Math.round(Math.sqrt(12 * sx * sx / 3 + 1) / 2));   // box radius matching sigma over 3 passes
    const ry = Math.max(0, Math.round(Math.sqrt(12 * sy * sy / 3 + 1) / 2));
    let a = Float32Array.from(src), b = new Float32Array(n);
    for (let k = 0; k < 3; k++) {
      if (rx > 0) { boxPass(a, b, NX, NY, rx, true); const t = a; a = b; b = t; }
      if (ry > 0) { boxPass(a, b, NX, NY, ry, false); const t = a; a = b; b = t; }
    }
    return a;
  };
  const pM = gauss(p, 1.3, 1.3), pL = gauss(p, 5.0, 5.0), pX = gauss(p, 14.0, 0.6), pXL = gauss(p, 14.0, 14.0);
  const PIG = new Uint8Array(n * 4);
  for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) {
    const i = y * NX + x;
    const gx = pM[y * NX + Math.min(NX - 1, x + 1)] - pM[y * NX + Math.max(0, x - 1)];
    const gy = pM[Math.min(NY - 1, y + 1) * NX + x] - pM[Math.max(0, y - 1) * NX + x];
    const edge = Math.min(1, Math.hypot(gx, gy) * 2.5);
    PIG[4 * i] = Math.round(pM[i] * 255); PIG[4 * i + 1] = Math.round(pL[i] * 255); PIG[4 * i + 2] = Math.round(pX[i] * 255); PIG[4 * i + 3] = Math.round(edge * 255);
  }
  const PIG2 = new Uint8Array(n); for (let i = 0; i < n; i++) PIG2[i] = Math.round(Math.min(1, pXL[i] * 1.6) * 255);
  return { TAU8, PIG, PIG2 };
}
