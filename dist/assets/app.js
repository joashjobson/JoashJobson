const { useState, useEffect, useRef, useMemo, useCallback } = React;
const html = htm.bind(React.createElement);

// The artifact preview sets JJ_PREVIEW: it routes with #hash and keeps everything in memory.
// The live site has real pages (/ and /shave) and saves to the Worker at /api.
const PREVIEW = !!window.JJ_PREVIEW;
const PAGES = PREVIEW ? { home: '#home', shave: '#shave', messages: '#messages', privacy: '#privacy' } : { home: '/', shave: '/shave', messages: '/messages', privacy: '/privacy' };

/* ---------- Pixel portraits: 64x64, shaded with hue-shifted colour ramps, built from preset parts ---------- */
const ART = 64;
const SKIN_TONES = [
  { name: 'Fair', base: '#F0C4A2' }, { name: 'Peach', base: '#E6AA7E' }, { name: 'Tan', base: '#C98C5C' },
  { name: 'Brown', base: '#9A6240' }, { name: 'Deep', base: '#6A4029' }
];
const HAIR_COLS = [
  { name: 'Brown', base: '#94562A' }, { name: 'Black', base: '#2E2727' }, { name: 'Blonde', base: '#D8AC50' }, { name: 'Ginger', base: '#C65A26' },
  { name: 'Grey', base: '#A8A49E' }, { name: 'Blue', base: '#2D5BD8' }, { name: 'Pink', base: '#D8659A' }
];
const EYE_COLS = [{ name: 'Brown', base: '#7A4626' }, { name: 'Blue', base: '#3C78D8' }, { name: 'Green', base: '#3E9A4E' }, { name: 'Grey', base: '#6E7A86' }];
const SHIRTS = [
  { name: 'Blue', base: '#2D5BD8' }, { name: 'Sage', base: '#6E9A5E' }, { name: 'Red', base: '#C8462E' },
  { name: 'Gold', base: '#C2B02E' }, { name: 'Charcoal', base: '#3A3D47' }, { name: 'White', base: '#E2E0DA' }
];
const STYLES = ['Short', 'Buzz', 'Curly', 'Bob', 'Long', 'Ponytail', 'Bun', 'Shaved'];
const FACES = ['Plain', 'Lashes', 'Freckles', 'Stubble', 'Smile'];
const EXTRAS = ['None', 'Glasses', 'Earrings', 'Headband'];
// Joash: brown skin, short black hair, dark rectangular glasses, big smile, charcoal jumper.
const JOASH = { skin: 3, hair: 1, style: 0, eyes: 0, face: 4, shirt: 4, extra: 1 };
const lookKey = (l) => [l.skin, l.hair, l.style, l.eyes, l.face, l.shirt, l.extra].join('-');

const mix = (a, b, t) => [0, 1, 2].map(k => Math.round(a[k] + (b[k] - a[k]) * t));
function hex(c) { const n = parseInt(c.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function rgb2hsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
function hsl2rgb([h, s, l]) {
  const f = (p, q, t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < .5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  if (s === 0) return [l * 255, l * 255, l * 255].map(Math.round);
  const q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  return [f(p, q, h + 1 / 3), f(p, q, h), f(p, q, h - 1 / 3)].map(v => Math.round(v * 255));
}
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const hueToward = (h, target, amt) => { let d = target - h; if (d > .5) d -= 1; if (d < -.5) d += 1; return (h + d * amt + 1) % 1; };
// 0 outline, 1 deep, 2 shadow, 3 base, 4 light, 5 highlight. Shadows lean purple, lights lean warm, like hand-painted sprites.
function ramp(base, k = 1) {
  const [h, s, l] = rgb2hsl(hex(base));
  const steps = [[-.36, .72, .16], [-.22, .5, .1], [-.1, .25, .05], [0, 0, 0], [.09, .2, -.03], [.18, .38, -.08]];
  const tones = steps.map(([dl, hs, ds], i) => hsl2rgb([i < 3 ? hueToward(h, .78, hs * .25 * k) : hueToward(h, .12, hs * .25 * k), clamp01(s + ds * k), clamp01(l + dl * (dl > 0 ? (l > .75 ? .4 : l < .25 ? .45 : 1) : 1) * (k < 1 ? .85 : 1))]));
  tones[0] = mix(tones[1], [34, 22, 26], .72);   // outlines stay dark and calm on every colour
  return tones;
}

const LX = -.55, LY = -.62, LZ = .56;
function lit(x, y, cx, cy, rx, ry) {
  const nx = (x + .5 - cx) / rx, ny = (y + .5 - cy) / ry, d = Math.min(1, nx * nx + ny * ny);
  return Math.max(0, nx * LX + ny * LY + Math.sqrt(1 - d) * LZ);
}
const toneOf = (v) => v < .3 ? 2 : v < .6 ? 3 : v < .82 ? 4 : 5;
const ellIn = (x, y, cx, cy, rx, ry) => ((x + .5 - cx) / rx) ** 2 + ((y + .5 - cy) / ry) ** 2 <= 1;
const tri = (t) => 1 - Math.abs(((t % 1) + 1) % 1 * 2 - 1);

function faceHalf(y) {
  if (y < 9 || y > 45) return -1;
  if (y < 30) { const t = (y + .5 - 28) / 19.5; return 12.4 * Math.sqrt(Math.max(0, 1 - t * t)); }
  // jaw: an ellipse that narrows a little, so the chin comes out rounded rather than pointed
  const t = (y + .5 - 30) / 16.2;
  return 12.4 * Math.sqrt(Math.max(0, 1 - t * t)) * (1 - .12 * t);
}
const inFace = (x, y) => Math.abs(x + .5 - 32) <= faceHalf(y);

// Hair shapes. front(x, y) covers the face; back(x, y) sits behind the head and shoulders.
const HAIR_SHAPES = {
  // Neat short hair with height on top, a soft fringe swept to one side, and trimmed sides
  Short: {
    front: (x, y) => {
      const dx = x + .5 - 32, ax = Math.abs(dx);
      if (!ellIn(x, y, 32, 21, 14.8, 15.2)) return false;
      if (ax > 11.2) return y < 26 - (ax > 13.4 ? 1 : 0);                  // short sides down to the tops of the ears
      const tip = [0, 1, 2, 1, 0, 0, 1, 2, 2, 1, 0, 1][x % 12];             // uneven fringe tips
      return y < 15.2 - dx * .1 + tip * .6;
    }, cx: 31, cy: 17, neat: true
  },
  Buzz: { front: (x, y) => ellIn(x, y, 32, 25, 13.8, 16.6) && y < (Math.abs(x + .5 - 32) > 11.5 ? 27 : Math.abs(x + .5 - 32) > 8 ? 18 : 19), cx: 32, cy: 22, fine: true },
  Curly: {
    front: (x, y) => {
      const dx = x + .5 - 32, dy = y + .5 - 21, a = Math.atan2(dy, dx), R = 18 + 1.9 * Math.abs(Math.sin(a * 7));
      if (dx * dx + dy * dy > R * R) return false;
      return y < (Math.abs(dx) > 11.5 ? 39 : 20 + 2.2 * Math.abs(Math.sin(x * .7)));
    },
    back: (x, y) => ellIn(x, y, 32, 24, 19.5, 17) && Math.abs(Math.sin((x + y) * .6)) > .15, cx: 32, cy: 20, curly: true
  },
  Bob: {
    front: (x, y) => ellIn(x, y, 32, 25, 17.6, 18) && y < 44 && (y < 20 || Math.abs(x + .5 - 32) > 11.8),
    back: (x, y) => ellIn(x, y, 32, 27, 18.2, 19) && y < 44, cx: 32, cy: 20
  },
  Long: {
    front: (x, y) => { const ax = Math.abs(x + .5 - 32); return (ellIn(x, y, 32, 24, 17, 17) && y < 19) || (ax > 11.8 && ax < 17.6 && y >= 16 && y < 60 - (ax > 16 ? 2 : 0)); },
    back: (x, y) => Math.abs(x + .5 - 32) < 18 && y > 14 && y < 58, cx: 32, cy: 20, part: true
  },
  Ponytail: {
    front: (x, y) => ellIn(x, y, 32, 23, 15, 15.6) && y < (Math.abs(x + .5 - 32) > 11.8 ? 27 : 17.5 + (x - 20) * .16),
    back: (x, y) => ellIn(x, y, 48.5, 19, 4.6, 4.4) || (y >= 20 && y <= 48 && Math.abs(x + .5 - (49 + (y - 20) * .12)) < 3.4 - (y - 20) * .1), cx: 32, cy: 20, tie: true
  },
  Bun: { front: (x, y) => (ellIn(x, y, 32, 23, 15, 15.6) && y < (Math.abs(x + .5 - 32) > 11.8 ? 27 : 18)) || ellIn(x, y, 32, 8, 6.6, 5.4), cx: 32, cy: 14 },
  Shaved: null
};

const cache = new Map();
// Returns { px: [r,g,b]|null per pixel, hair: 1 = hair pixel, 2 = outline that belongs to hair, hairRamp }.
function renderPortrait(look) {
  const key = lookKey(look);
  if (cache.has(key)) return cache.get(key);
  const W = ART, px = new Array(W * W).fill(null), mat = new Uint8Array(W * W), rmp = new Array(W * W).fill(null);
  const SK = ramp(SKIN_TONES[look.skin].base, .4), HR = ramp(HAIR_COLS[look.hair].base), EY = ramp(EYE_COLS[look.eyes].base), SH = ramp(SHIRTS[look.shirt].base);
  const style = STYLES[look.style], shape = HAIR_SHAPES[style], face = FACES[look.face], extra = EXTRAS[look.extra];
  const set = (x, y, c, m, r) => { if (x < 0 || y < 0 || x >= W || y >= W) return; const i = y * W + x; px[i] = c; mat[i] = m; rmp[i] = r; };
  const get = (x, y) => (x < 0 || y < 0 || x >= W || y >= W) ? 0 : mat[y * W + x];
  const SKIN = 1, HAIRF = 2, HAIRB = 3, CLOTH = 4, FEAT = 5;

  // Hair is shaded as clumps: a dark gap between clumps, a shaded side, a lit ridge and a shine band.
  const CLUMPS = shape && (shape.curly ? 20 : 13);
  const hairTone = (x, y, back) => {
    const cx = shape.cx, cy = shape.cy, L = lit(x, y, cx - 2, cy + 2, 20, 20);
    let t = L < .25 ? 2 : L < .55 ? 3 : 4;
    if (shape.neat) {
      // combed forward: strands fall from above the crown towards the fringe, with a curved shine on the lit side
      const a = Math.atan2(x + .5 - 31, y + .5 + 8) * 13 + Math.sin(y * .5) * .25, f = a - Math.floor(a);
      if (f < .14) t = Math.max(1, Math.min(t, 3) - 1);
      else if (f > .48 && f < .74 && L > .4) t = Math.min(5, t + 1);
      const r2 = Math.hypot(x + .5 - 32, y + .5 - 21);
      if (r2 > 10.5 && r2 < 13 && L > .55 && y < 15 && f > .25) t = 5;
      if (Math.abs(x + .5 - 32) > 11.2 && y > 18) t = Math.min(t, 2);       // trimmed sides read darker
      return Math.max(1, Math.min(5, t - (back ? 1 : 0)));
    }
    if (shape.fine) return Math.max(1, Math.min(4, t) - ((x + y) % 2 ? 0 : 1) - (back ? 1 : 0));
    const r = Math.hypot(x + .5 - cx, y + .5 - cy);
    if (shape.curly) {
      // small round curls, each lit from the top left
      const row = Math.floor(y / 4), ccx = Math.floor((x + (row % 2) * 2) / 4) * 4 + 2 - (row % 2) * 2, ccy = row * 4 + 2;
      const c = lit(x, y, ccx, ccy, 2.6, 2.6) * .6 + L * .5;
      t = c < .3 ? 1 : c < .5 ? 2 : c < .7 ? 3 : c < .85 ? 4 : 5;
    } else if (y > cy + 5 && Math.abs(x + .5 - 32) > 11) {
      // hanging lengths: vertical strands
      const f = ((x + Math.sin(y * .3) * .8) / 3) % 1;
      t = f < .2 ? 2 : f > .5 && f < .8 ? Math.min(5, t + 1) : t;
    } else {
      // clumps fanning out from the crown: a shaded side, a lit ridge, a shine band
      const a = (Math.atan2(y + .5 - cy, x + .5 - cx) + Math.PI) / (2 * Math.PI) * CLUMPS + Math.sin(r * .35) * .3;
      const f = a - Math.floor(a);
      if (r > 5 && (f < .09 || f > .93)) t = Math.min(t, L < .3 ? 1 : 2);
      else if (f < .26) t = Math.min(t, 2);
      else if (f > .45 && f < .72 && L > .4) t = Math.min(5, t + 1);
      if (r > 7.5 && r < 10.5 && L > .55 && f > .3 && f < .8) t = 5;
    }
    if (shape.part && Math.abs(x + .5 - 32) < 1 && y < 18) t = 1;
    if (back) t = Math.max(1, t - 1);
    return Math.max(1, Math.min(5, t));
  };

  // 1. Hair behind the head
  if (shape && shape.back) for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) if (shape.back(x, y)) set(x, y, HR[hairTone(x, y, true)], HAIRB, HR);
  // 2. Shoulders and jumper
  for (let y = 47; y < W; y++) {
    // rounded shoulders, lit from the top left
    const half = 31 * Math.sqrt(Math.max(0, 1 - ((y + .5 - 64.5) / 17.5) ** 2));
    for (let x = 0; x < W; x++) {
      const dx = x + .5 - 32;
      if (Math.abs(dx) > half) continue;
      const L = lit(x, y, 32, 66, 33, 20);
      let t = L < .3 ? 2 : L < .55 ? 3 : L < .75 ? 4 : 5;
      if (Math.abs(Math.abs(dx) - 13 - (y - 55) * .55) < .6 && y > 55) t = Math.max(1, t - 1);   // fold at the armpit
      set(x, y, SH[t], CLOTH, SH);
    }
  }
  // 3. Neck, with the chin's shadow on it
  for (let y = 36; y <= 53; y++) for (let x = 25; x <= 38; x++) {
    const dx = x + .5 - 32;
    if (Math.abs(dx) > 6.4) continue;
    if (y >= 47 && !ellIn(x, y, 32, 47, 7, 5)) continue;
    set(x, y, SK[y < 45 && y > 41 ? 1 : dx > 3 ? 2 : 3], SKIN, SK);
  }
  // crew-neck collar
  for (let y = 44; y <= 54; y++) for (let x = 20; x <= 44; x++) if (ellIn(x, y, 32, 48, 9.6, 5.8) && !ellIn(x, y, 32, 47, 7, 5) && y >= 47) set(x, y, SH[y > 51 ? 2 : 4], CLOTH, SH);
  // 4. Ears
  for (const [ex, side] of [[19.6, -1], [44.4, 1]]) for (let y = 24; y <= 37; y++) for (let x = 15; x <= 49; x++) if (ellIn(x, y, ex, 30.5, 2.8, 5)) {
    const bowl = Math.abs(x + .5 - ex) < 1.2 && y > 27 && y < 34, lobe = y >= 34;
    set(x, y, SK[bowl ? (side < 0 ? 2 : 1) : lobe ? 3 : side < 0 ? 4 : 2], SKIN, SK);
  }
  // 5. Face
  for (let y = 9; y <= 45; y++) for (let x = 18; x <= 46; x++) if (inFace(x, y)) {
    // Painted zones rather than smooth lighting, the way hand-drawn portraits are shaded
    const dx = x + .5 - 32, u = dx / faceHalf(y);
    let t = 3;
    if (u > .5) t = 2;                                                       // shadow side
    if (u > .82 && y > 30) t = 1;                                            // jaw edge
    if (u < -.55 && y >= 14 && y <= 35) t = 4;                               // lit temple and cheek
    if (y >= 12 && y <= 19 && dx > -9 && dx < 2) t = 4;                       // forehead
    if (y >= 13 && y <= 16 && dx > -6 && dx < -2) t = 5;                      // forehead shine
    if (y >= 31 && y <= 33 && dx > -10 && dx < -5) t = 5;                     // cheekbone
    if (y === 26 && Math.abs(Math.abs(dx) - 6.5) < 3.5) t = Math.min(t, 2);  // under the brows
    const below = faceHalf(y + 2);
    if (below < 0 || Math.abs(dx) > below) t = Math.min(t, 2);               // underside of the jaw
    set(x, y, SK[t], SKIN, SK);
  }
  const skinL = rgb2hsl(hex(SKIN_TONES[look.skin].base))[2];
  const blush = (cx, cy, k) => { k *= skinL > .55 ? 1 : .5; for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 2; x <= cx + 2; x++) if (get(x, y) === SKIN && ellIn(x, y, cx + .5, cy + .5, 2.6, 1.2)) px[y * W + x] = mix(px[y * W + x], [232, 128, 128], k); };
  // 6. Features
  const DARK = mix(SK[0], [20, 12, 10], .5), WHITE = [250, 247, 240];
  for (const [x0, side] of [[23, -1], [36, 1]]) {
    // brow, thicker at the inner end
    for (let k = 0; k < 7; k++) { const x = side < 0 ? x0 - 2 + k : x0 + k - 1; set(x, 24 - (k > 4 ? 0 : 0), HR[1], FEAT, HR); if ((side < 0 && k > 3) || (side > 0 && k < 3)) set(x, 25, HR[2], FEAT, HR); }
    // eye: lid, white, iris with a catchlight, lower lid shadow
    for (let k = -1; k <= 5; k++) set(x0 + k, 27, DARK, FEAT, SK);
    set(x0, 28, WHITE, FEAT, SK); set(x0 + 1, 28, EY[2], FEAT, EY); set(x0 + 2, 28, EY[0], FEAT, EY); set(x0 + 3, 28, EY[2], FEAT, EY); set(x0 + 4, 28, WHITE, FEAT, SK);
    set(x0, 29, WHITE, FEAT, SK); set(x0 + 1, 29, EY[3], FEAT, EY); set(x0 + 2, 29, EY[5], FEAT, EY); set(x0 + 3, 29, EY[3], FEAT, EY); set(x0 + 4, 29, mix(WHITE, SK[2], .4), FEAT, SK);
    set(x0 + 1, 28, side < 0 ? WHITE : EY[2], FEAT, EY);
    for (let k = 0; k <= 4; k++) set(x0 + k, 30, SK[2], SKIN, SK);
    const outer = side < 0 ? x0 - 2 : x0 + 6;
    set(outer, 28, DARK, FEAT, SK);
    if (face === 'Lashes') { set(outer, 27, DARK, FEAT, SK); set(outer + side, 26, DARK, FEAT, SK); for (let k = 0; k <= 4; k++) set(x0 + k, 26, mix(DARK, SK[2], .5), FEAT, SK); }
  }
  // nose: lit bridge, shaded side, nostrils
  for (let y = 29; y <= 33; y++) set(31, y, SK[4], SKIN, SK);
  for (let y = 30; y <= 34; y++) set(33, y, SK[2], SKIN, SK);
  for (let x = 30; x <= 34; x++) set(x, 35, SK[2], SKIN, SK);
  set(30, 35, SK[1], SKIN, SK); set(34, 35, SK[1], SKIN, SK); set(32, 34, SK[4], SKIN, SK);
  blush(23, 34, face === 'Smile' ? .3 : .2); blush(40, 34, face === 'Smile' ? .3 : .2);
  const LIP = face === 'Lashes' ? [200, 80, 94] : mix(SK[1], [180, 70, 60], .45);
  if (face === 'Smile') {
    for (let x = 28; x <= 36; x++) set(x, 38, DARK, FEAT, SK);
    for (let x = 29; x <= 35; x++) { set(x, 39, WHITE, FEAT, SK); set(x, 40, mix(LIP, DARK, .3), FEAT, SK); }
    set(28, 39, DARK, FEAT, SK); set(36, 39, DARK, FEAT, SK); set(27, 37, SK[1], FEAT, SK); set(37, 37, SK[1], FEAT, SK);
    for (let x = 30; x <= 34; x++) set(x, 41, SK[4], SKIN, SK);
    for (let x = 30; x <= 34; x++) set(x, 42, SK[2], SKIN, SK);
  } else {
    set(27, 38, SK[2], SKIN, SK); set(37, 38, SK[2], SKIN, SK);
    for (let x = 28; x <= 36; x++) set(x, 39, mix(LIP, DARK, .45), FEAT, SK);
    for (let x = 29; x <= 35; x++) set(x, 40, face === 'Lashes' ? mix(LIP, WHITE, .15) : SK[4], FEAT, SK);
    for (let x = 30; x <= 34; x++) set(x, 41, SK[2], SKIN, SK);
  }
  if (face === 'Freckles') for (const [x, y] of [[22, 32], [24, 33], [26, 32], [23, 35], [38, 32], [40, 33], [42, 32], [41, 35], [30, 33], [34, 32]]) set(x, y, SK[1], FEAT, SK);
  if (face === 'Stubble') for (let y = 34; y <= 46; y++) for (let x = 18; x <= 46; x++) if (get(x, y) === SKIN && (x + y) % 2 === 0 && (x % 3 || y > 42)) px[y * W + x] = mix(px[y * W + x], HR[1], .35);
  // 7. Hair in front, and the shadow it casts on the forehead
  if (shape) {
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) if (shape.front(x, y)) set(x, y, HR[hairTone(x, y, false)], HAIRF, HR);
    // soft two-pixel shadow under the hair, and a shaded underside on the hair itself
    for (let y = W - 1; y >= 2; y--) for (let x = 0; x < W; x++) {
      if (get(x, y) !== SKIN) continue;
      if (get(x, y - 1) === HAIRF) px[y * W + x] = mix(SK[2], SK[1], .5);
      else if (get(x, y - 2) === HAIRF) px[y * W + x] = SK[2];
    }
    for (let y = 0; y < W - 1; y++) for (let x = 0; x < W; x++) if (get(x, y) === HAIRF && get(x, y + 1) === SKIN && px[y * W + x] !== HR[1]) px[y * W + x] = HR[2];
    if (shape.tie) for (let y = 21; y <= 23; y++) for (let x = 46; x <= 51; x++) if (get(x, y) === HAIRB) set(x, y, [45, 91, 216], FEAT, SH);
  }
  // 8. Extras
  if (extra === 'Glasses') {
    const FR = [22, 22, 28];
    for (const x0 of [20, 34]) {
      for (let x = x0; x <= x0 + 10; x++) { set(x, 25, FR, FEAT, SH); set(x, 26, FR, FEAT, SH); set(x, 31, FR, FEAT, SH); }
      for (let y = 25; y <= 31; y++) { set(x0, y, FR, FEAT, SH); set(x0 + 10, y, FR, FEAT, SH); }
      for (let y = 27; y <= 30; y++) for (let x = x0 + 1; x <= x0 + 9; x++) if (px[y * W + x]) px[y * W + x] = mix(px[y * W + x], [235, 242, 255], .12);
      set(x0 + 2, 27, mix(px[27 * W + x0 + 2] || WHITE, WHITE, .6), FEAT, SH);
    }
    for (let x = 31; x <= 33; x++) set(x, 27, FR, FEAT, SH);
    for (const x of [18, 19, 44, 45]) set(x, 27, FR, FEAT, SH);
  }
  if (extra === 'Earrings') for (const x of [19, 44]) { set(x, 36, [232, 196, 64], FEAT, SH); set(x, 37, [180, 140, 30], FEAT, SH); }
  if (extra === 'Headband') for (let x = 0; x < W; x++) for (const y of [13, 14, 15]) if (get(x, y) === HAIRF) set(x, y, y === 13 ? [91, 131, 240] : [45, 91, 216], FEAT, SH);

  // 9. Selective outline: each shape is edged in the darkest shade of its own colour
  const out = px.slice(), hair = new Uint8Array(W * W);
  for (let i = 0; i < W * W; i++) if (mat[i] === HAIRF || mat[i] === HAIRB) hair[i] = 1;
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (px[i]) continue;
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= W) continue;
      const j = yy * W + xx;
      if (px[j] && rmp[j]) { out[i] = rmp[j][0]; if (hair[j]) hair[i] = 2; break; }
    }
  }
  // a darker line where the chin meets the neck
  for (let y = 36; y < 46; y++) for (let x = 24; x <= 40; x++) if (mat[y * W + x] === SKIN && inFace(x, y) && !inFace(x, y + 1) && get(x, y + 1) === SKIN) out[(y + 1) * W + x] = SK[1];
  const res = { px: out, hair, hairRamp: HR };
  cache.set(key, res);
  return res;
}

function paintArt(ctx, look) {
  const { px } = renderPortrait(look), img = ctx.createImageData(ART, ART), d = img.data;
  for (let i = 0; i < ART * ART; i++) { const c = px[i]; if (c) { d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = 255; } }
  ctx.putImageData(img, 0, 0);
}

function PixelAvatar({ look, size = 24, label, className = '' }) {
  const ref = useRef(null);
  useEffect(() => { paintArt(ref.current.getContext('2d'), look); }, [lookKey(look)]);
  const small = size && size < ART;
  return html`<canvas ref=${ref} class=${'pix ' + (small ? 'pix-small ' : '') + className} width=${ART} height=${ART} style=${size ? { width: size + 'px', height: size + 'px' } : null} role="img" aria-label=${label || 'Pixel avatar'}></canvas>`;
}

/* ---------- Game head: the portrait on a 64x64 grid, one cell per art pixel ---------- */
const N = 64;
const BG = 0, SKIN = 1, HAIR = 4, SHADE = 5;
const WIN_AT = 0.95;
const CUT_RATE = 14.5;      // hair layers cut per second for a cell under the blade, at full efficiency
const SMOOTH_SPEED = 32;  // cells/s: at or below this the clipper cuts cleanly
const BOG_SPEED = 85;     // cells/s: at or above this the clipper barely cuts
const BLADE_W = 4, BLADE_H = 3;

function mulberry(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function buildHead(look) {
  const r = mulberry(20261026);
  // What shows once hair is gone: the same person with the Shaved style.
  const full = renderPortrait(look), bare = renderPortrait({ ...look, style: STYLES.indexOf('Shaved') });
  const kind = new Uint8Array(N * N), max = new Uint8Array(N * N), weight = new Uint8Array(N * N);
  const base = full.px, under = bare.px.slice();
  for (let i = 0; i < N * N; i++) {
    if (full.hair[i] === 1) { kind[i] = HAIR; weight[i] = 1; max[i] = r() < .45 ? 3 : 2; }
    else if (base[i] && (!bare.px[i] || base[i].join() !== bare.px[i].join())) kind[i] = SHADE;   // hair outline or hair shadow
    else if (base[i]) kind[i] = SKIN;
  }
  let totalW = 0;
  for (let i = 0; i < N * N; i++) if (kind[i] === HAIR) totalW += weight[i];
  return { kind, max, weight, base, under, totalW, ramp: full.hairRamp };
}

// The head being shaved. Ranked runs always use Joash; "Shave your avatar" swaps in the player's look.
let HEAD, COL;
function useHead(look) {
  HEAD = buildHead(look);
  COL = { hair: [null, HEAD.ramp[4], HEAD.ramp[3], HEAD.ramp[1]] };
}
useHead(JOASH);
const hasHair = (look) => STYLES[look.style] !== 'Shaved';

// Paints a head (with its current hair state) into a 64x64 ImageData.
function paintHead(img, hp, head = HEAD) {
  const d = img.data, R = head.ramp, K = head.kind;
  const hairNear = (x, y) => {
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= N || yy >= N) continue;
      const j = yy * N + xx;
      if (K[j] === HAIR && head.weight[j] === 1 && hp[j] > 0) return true;
    }
    return false;
  };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x;
    let c = head.base[i];
    if (K[i] === HAIR) {
      const h = hp[i];
      if (head.weight[i] === 3) c = h > 0 ? R[1] : head.under[i];
      else if (h <= 0) c = head.under[i];
      else {
        const lvl = Math.ceil(h);
        if (lvl >= head.max[i]) c = head.base[i];
        else if (lvl >= 2) c = mix(head.base[i], R[2], .35);
        else c = ((x + y) & 1) ? R[1] : (head.under[i] || R[2]);   // stubble, dark even where there's no skin under it
      }
    } else if (K[i] === SHADE) c = hairNear(x, y) ? head.base[i] : head.under[i];
    const o = i * 4;
    if (c) { d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255; } else d[o + 3] = 0;
  }
}

function fmtTime(s) { return s == null ? '0.00' : s.toFixed(2); }

/* ---------- Share card: a story-sized picture of your run, for Instagram and other socials. It always points at Joash's fundraiser. ---------- */
const siteHost = () => PREVIEW ? 'joashjobson.workers.dev' : location.host;
async function makeShareCard({ secs, mode, hp, look }) {
  await Promise.all(['800 100px Archivo', '600 40px "Schibsted Grotesk"', '400 26px Silkscreen'].map(f => document.fonts.load(f).catch(() => {})));
  const W = 1080, H = 1920, pad = 88, c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;
  const own = mode === 'own';
  const label = (t, x, y, col) => { ctx.font = '400 30px Silkscreen'; ctx.fillStyle = col; ctx.textBaseline = 'alphabetic'; ctx.fillText(t.toUpperCase(), x, y); };
  ctx.fillStyle = '#F3F3EF'; ctx.fillRect(0, 0, W, H);
  label("World's Greatest Shave", pad, pad + 40, '#5B5F68');
  ctx.textAlign = 'right'; label(mode === 'ranked' ? 'Ranked run' : own ? 'Just for fun' : 'Practice run', W - pad, pad + 40, '#0A35A0'); ctx.textAlign = 'left';
  ctx.textBaseline = 'top'; ctx.fillStyle = '#0E1014'; ctx.font = '800 92px Archivo';
  ctx.fillText('I shaved', pad, 230);
  ctx.fillText(own ? 'my own pixel' : "Joash's pixel", pad, 330);
  ctx.fillText('head in', pad, 430);
  // The time on a chartreuse block
  ctx.font = '800 230px Archivo';
  const t = fmtTime(secs) + 's', tw = ctx.measureText(t).width;
  ctx.fillStyle = '#C8F03C'; ctx.fillRect(pad - 20, 560, tw + 40, 250);
  ctx.fillStyle = '#0E1014'; ctx.fillText(t, pad, 572);
  // Before and after
  const before = document.createElement('canvas'); before.width = before.height = ART; paintArt(before.getContext('2d'), own ? look : JOASH);
  const after = document.createElement('canvas'); after.width = after.height = N;
  const ai = after.getContext('2d').createImageData(N, N); paintHead(ai, hp); after.getContext('2d').putImageData(ai, 0, 0);
  const size = 420, gap = (W - pad * 2 - size * 2), y = 900;
  [[before, 'Before', pad], [after, 'After', pad + size + gap]].forEach(([img, l, x]) => {
    ctx.fillStyle = '#E8E8E2'; ctx.fillRect(x, y, size, size); ctx.drawImage(img, x, y, size, size);
    label(l, x, y + size + 48, '#5B5F68');
  });
  // Bottom: where to play and where to give
  ctx.fillStyle = '#0A35A0'; ctx.fillRect(0, 1470, W, H - 1470);
  ctx.textBaseline = 'top'; ctx.fillStyle = '#FFFFFF'; ctx.font = '800 76px Archivo'; ctx.fillText('Beat my time.', pad, 1530);
  ctx.fillStyle = '#C8F03C'; ctx.font = '600 44px "Schibsted Grotesk"'; ctx.fillText(siteHost() + '/shave', pad, 1630);
  ctx.fillStyle = '#FFFFFF'; ctx.font = '500 32px "Schibsted Grotesk"';
  ctx.fillText('Raising money for people living with blood cancer.', pad, 1730);
  ctx.fillText('Donate: worldsgreatestshave.com/fundraisers/joashj', pad, 1778);
  return c;
}
async function shareRun(run) {
  const c = await makeShareCard(run);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  const file = new File([blob], 'my-shave-time.png', { type: 'image/png' });
  const text = `I shaved ${run.mode === 'own' ? 'my own' : "Joash's"} pixel head in ${fmtTime(run.secs)}s for World's Greatest Shave. Bet you can't beat it: https://${siteHost()}/shave`;
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], text }); return 'shared'; }
    catch (e) { if (e.name === 'AbortError') return 'cancelled'; }
  }
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = file.name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  try { await navigator.clipboard.writeText(text); } catch (_) { /* no clipboard */ }
  return 'downloaded';
}
const reduceMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- Avatar maker: preset parts only, so nothing needs moderating ---------- */
// Colours are swatches you tap; shapes step through with arrows. The value boxes have a fixed width, so nothing shifts as you click.
function AvatarMaker({ look, onChange }) {
  const shapes = [['style', 'Hairstyle', STYLES], ['face', 'Face', FACES], ['extra', 'Extra', EXTRAS]];
  const colours = [['hair', 'Hair colour', HAIR_COLS], ['skin', 'Skin', SKIN_TONES], ['eyes', 'Eyes', EYE_COLS], ['shirt', 'Shirt', SHIRTS]];
  const set = (key, v) => onChange({ ...look, [key]: v });
  const step = (key, n, len) => set(key, (look[key] + n + len) % len);
  const shuffle = () => { const l = {}; for (const [k, , opts] of [...shapes, ...colours]) l[k] = Math.floor(Math.random() * opts.length); onChange(l); };
  return html`
    <div class="maker">
      <div class="maker-left">
        <${PixelAvatar} look=${look} size=${152} label="Your avatar preview" className="maker-preview" />
        <button type="button" class="btn ghost small" id="avatar-shuffle" onClick=${shuffle}>Shuffle</button>
      </div>
      <div class="traits">
        ${shapes.map(([key, label, opts]) => html`
          <div class="trait" key=${key}>
            <span class="tlabel" id=${'tl-' + key}>${label}</span>
            <div class="stepper" role="group" aria-labelledby=${'tl-' + key}>
              <button type="button" id=${'prev-' + key} aria-label=${'Previous ' + label.toLowerCase()} onClick=${() => step(key, -1, opts.length)}>‹</button>
              <span class="tval" aria-live="polite">${opts[look[key]]}</span>
              <button type="button" id=${'next-' + key} aria-label=${'Next ' + label.toLowerCase()} onClick=${() => step(key, 1, opts.length)}>›</button>
            </div>
          </div>`)}
        ${colours.map(([key, label, opts]) => html`
          <div class="trait" key=${key}>
            <span class="tlabel" id=${'tl-' + key}>${label}<b>${opts[look[key]].name}</b></span>
            <div class="swatches" role="radiogroup" aria-labelledby=${'tl-' + key}>
              ${opts.map((o, i) => html`<button type="button" key=${i} role="radio" class="sw" id=${key + '-' + i} aria-checked=${look[key] === i} aria-label=${o.name} title=${o.name}
                style=${{ '--c': o.base }} onClick=${() => set(key, i)}></button>`)}
            </div>
          </div>`)}
      </div>
    </div>`;
}

/* ---------- 1. Pixel-shaving game ---------- */
function ShaveGame({ goes = 0, onStart, onWin, playerName, look, savedBest }) {
  const stageRef = useRef(null), canvasRef = useRef(null);
  const G = useRef(null);
  const [phase, setPhase] = useState('idle');    // idle | playing | won
  const [mode, setMode] = useState('ranked');  // ranked | own
  const [hud, setHud] = useState({ t: 0, pct: 0, eff: 1 });
  const [best, setBest] = useState(null);
  const [result, setResult] = useState(null);
  const [name, setName] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [shareNote, setShareNote] = useState('');

  if (!G.current) {
    const hp = new Float32Array(N * N);
    for (let i = 0; i < N * N; i++) if (HEAD.kind[i] === HAIR) hp[i] = HEAD.max[i];
    G.current = { hp, cleared: 0, cx: 32, cy: 20, tx: 32, ty: 20, down: false, inside: false, eff: 1, speed: 0,
      t0: null, tEnd: null, phase: 'idle', bits: [], confetti: [], lastHud: 0 };
  }

  useEffect(() => { setName(n => n || playerName || ''); }, [playerName]);
  useEffect(() => { if (savedBest != null) setBest(b => b == null || savedBest < b ? savedBest : b); }, [savedBest]);

  function reset(nextPhase) {
    const g = G.current;
    for (let i = 0; i < N * N; i++) g.hp[i] = HEAD.kind[i] === HAIR ? HEAD.max[i] : 0;
    g.cleared = 0; g.t0 = null; g.tEnd = null; g.bits = []; g.confetti = []; g.down = false; g.phase = nextPhase;
    setHud({ t: 0, pct: 0, eff: 1 });
  }

  // Each run uses a go: everyone gets two free, and each message posted earns two more.
  // Ranked runs on Joash can go on the board, runs on your own avatar are just for fun.
  async function start(m) {
    if (busy || goes < 1) return;
    if (m === 'own' && !hasHair(look)) return;
    setBusy(true); setErr('');
    let run;
    try { run = await onStart(m); }
    catch (e) { setErr(e.message); setBusy(false); return; }
    setBusy(false);
    useHead(m === 'own' ? look : JOASH);
    G.current.mode = m; G.current.runId = run && run.runId; setMode(m); setResult(null); setSubmitted(false);
    reset('playing'); setPhase('playing');
  }
  function quit() { useHead(JOASH); reset('idle'); setPhase('idle'); }

  // Cut every hair cell under the blade footprint.
  function cutAt(g, px, py, amount, now) {
    const x0 = Math.floor(px - BLADE_W / 2), y0 = Math.floor(py - BLADE_H / 2);
    for (let y = y0; y < y0 + BLADE_H; y++) for (let x = x0; x < x0 + BLADE_W; x++) {
      if (x < 0 || y < 0 || x >= N || y >= N) continue;
      const i = y * N + x;
      if (HEAD.kind[i] !== HAIR || g.hp[i] <= 0) continue;
      if (g.t0 == null) g.t0 = now;
      const before = g.hp[i];
      let h = before - amount;
      if (h <= 0.02) { h = 0; g.cleared += HEAD.weight[i]; }
      g.hp[i] = h;
      if (Math.ceil(before) !== Math.ceil(h) && !reduceMotion() && g.bits.length < 260) {
        const c = COL.hair[Math.ceil(before)];
        g.bits.push({ x: x + .5, y: y + .5, vx: (Math.random() - .5) * 10, vy: -Math.random() * 8, life: 1, c: `rgb(${c[0]},${c[1]},${c[2]})` });
      }
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current, ctx = canvas.getContext('2d');
    const off = document.createElement('canvas'); off.width = N; off.height = N;
    const octx = off.getContext('2d'); const img = octx.createImageData(N, N);
    const fit = () => {
      const r = canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(64, Math.round(r.width * dpr)); canvas.height = canvas.width;
    };
    fit();
    const ro = new ResizeObserver(fit); ro.observe(canvas);
    let raf, last = performance.now();
    // Colours come from the canvas, because the arcade cabinet sets its own
    const css = () => { const s = getComputedStyle(canvas); return { ink: s.getPropertyValue('--ink').trim(), accent: s.getPropertyValue('--accent').trim(), accent2: s.getPropertyValue('--accent2').trim(), pop: s.getPropertyValue('--pop').trim(), gold: s.getPropertyValue('--gold').trim(), warn: s.getPropertyValue('--warn').trim() }; };

    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const g = G.current;
      // Clipper follows the pointer with a little weight, so control beats flailing.
      const k = 1 - Math.exp(-dt * 30);
      const nx = g.cx + (g.tx - g.cx) * k, ny = g.cy + (g.ty - g.cy) * k;
      const dist = Math.hypot(nx - g.cx, ny - g.cy);
      const v = dt > 0 ? dist / dt : 0;
      g.speed = g.speed * 0.7 + v * 0.3;
      g.eff = g.speed <= SMOOTH_SPEED ? 1 : g.speed >= BOG_SPEED ? 0.12 : 1 - 0.88 * (g.speed - SMOOTH_SPEED) / (BOG_SPEED - SMOOTH_SPEED);
      if (g.phase === 'playing' && g.down) {
        const steps = Math.max(1, Math.ceil(dist / 0.4));
        for (let s = 1; s <= steps; s++) cutAt(g, g.cx + (nx - g.cx) * s / steps, g.cy + (ny - g.cy) * s / steps, CUT_RATE * g.eff * dt / steps, now);
      }
      g.cx = nx; g.cy = ny;

      const elapsed = g.t0 == null ? 0 : ((g.tEnd ?? now) - g.t0) / 1000;
      if (g.phase === 'playing' && g.cleared / HEAD.totalW >= WIN_AT) {
        g.tEnd = now; g.phase = 'won'; g.down = false;
        const secs = Math.round(g.tEnd - g.t0) / 1000;   // whole milliseconds, the same as the saved time
        if (!reduceMotion()) {
          const pal = css();
          const cols = [pal.accent, pal.accent2, pal.pop, pal.gold];
          for (let j = 0; j < 160; j++) g.confetti.push({ x: Math.random() * N, y: -Math.random() * 30, vx: (Math.random() - .5) * 8, vy: 6 + Math.random() * 14, s: 1 + (Math.random() < .3 ? 1 : 0), c: cols[j % 4], life: 1 });
        }
        setResult({ secs, pct: g.cleared / HEAD.totalW });
        setPhase('won');
        setHud({ t: secs, pct: g.cleared / HEAD.totalW, eff: g.eff });
        if (g.mode !== 'own') setBest(b => b == null || secs < b ? secs : b);
      } else if (now - g.lastHud > 80) {
        g.lastHud = now;
        setHud({ t: elapsed, pct: g.cleared / HEAD.totalW, eff: g.eff });
      }

      // Draw
      paintHead(img, g.hp); octx.putImageData(img, 0, 0);
      const W = canvas.width, cell = W / N;
      ctx.clearRect(0, 0, W, W); ctx.imageSmoothingEnabled = false; ctx.drawImage(off, 0, 0, W, W);
      for (const b of g.bits) { b.vy += 50 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt * 1.2; }
      g.bits = g.bits.filter(b => b.life > 0 && b.y < N + 2);
      for (const b of g.bits) { ctx.globalAlpha = Math.max(0, b.life); ctx.fillStyle = b.c; ctx.fillRect(Math.floor(b.x) * cell, Math.floor(b.y) * cell, cell, cell); }
      ctx.globalAlpha = 1;
      const pal = css();
      if (g.phase === 'playing' && (g.inside || g.down)) {
        const bx = Math.floor(g.cx - BLADE_W / 2), by = Math.floor(g.cy - BLADE_H / 2);
        const bog = g.eff < 0.7;
        // body hangs below the blade
        ctx.fillStyle = pal.ink; ctx.fillRect((bx) * cell, (by + BLADE_H) * cell, BLADE_W * cell, 7 * cell);
        ctx.fillStyle = bog ? pal.warn : pal.accent2; ctx.fillRect((bx + .5) * cell, (by + BLADE_H) * cell, (BLADE_W - 1) * cell, 6.5 * cell);
        ctx.fillStyle = pal.pop; ctx.fillRect((bx + 1.5) * cell, (by + BLADE_H + 2) * cell, cell, cell);
        // blade outline: exactly the cells that get cut
        ctx.strokeStyle = bog ? pal.warn : pal.ink; ctx.lineWidth = Math.max(1, cell * .35);
        ctx.strokeRect(bx * cell, by * cell, BLADE_W * cell, BLADE_H * cell);
        ctx.fillStyle = 'rgba(220,220,220,.9)';
        for (let t = 0; t < BLADE_W * 2; t++) ctx.fillRect((bx + t / 2) * cell, (by + BLADE_H - .5) * cell, cell * .3, cell * .5);
      }
      for (const p of g.confetti) { p.vy = Math.min(p.vy + 10 * dt, 22); p.x += p.vx * dt; p.y += p.vy * dt; }
      g.confetti = g.confetti.filter(p => p.y < N + 2);
      for (const p of g.confetti) { ctx.fillStyle = p.c; ctx.fillRect(Math.floor(p.x) * cell, Math.floor(p.y) * cell, p.s * cell, p.s * cell); }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  function toGrid(e) {
    const r = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width * N;
    let y = (e.clientY - r.top) / r.height * N;
    if (e.pointerType === 'touch') y -= 7; // keep the blade visible above a fingertip
    return [x, y];
  }
  const onDown = (e) => {
    const g = G.current; if (g.phase !== 'playing') return;
    e.preventDefault(); canvasRef.current.setPointerCapture(e.pointerId);
    const [x, y] = toGrid(e); g.tx = g.cx = x; g.ty = g.cy = y; g.speed = 0; g.down = true; g.inside = true;
  };
  const onMove = (e) => { const g = G.current; const [x, y] = toGrid(e); g.tx = x; g.ty = y; g.inside = true; };
  const onUp = () => { G.current.down = false; };
  const onLeave = (e) => { if (e.pointerType === 'mouse') G.current.inside = false; };

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !result || busy) return;
    setBusy(true); setErr('');
    try { await onWin({ runId: G.current.runId, name: name.trim(), secs: result.secs }); setSubmitted(true); }
    catch (e2) { setErr(e2.message); }
    setBusy(false);
  };

  const bog = hud.eff < 0.7;
  return html`
    <div class="card arcade">
      <h3 class="marquee"><span class="coin" aria-hidden="true"></span>Shave the pixel head<span class="coin" aria-hidden="true"></span></h3>
      <div class="hud" aria-live="off">
        <div class="stat"><small>Time</small><b>${fmtTime(hud.t)}s</b></div>
        <div class="stat"><small>Cleared</small><b>${Math.min(100, Math.floor(hud.pct * 100))}%</b><div class="meter"><i style=${{ width: Math.min(100, hud.pct / WIN_AT * 100) + '%' }}></i></div></div>
        <div class="stat"><small>Your best</small><b>${best == null ? '–' : fmtTime(best) + 's'}</b></div>
        <div class="stat"><small>Clipper</small><b>${phase !== 'playing' ? 'Ready' : bog ? 'Too fast' : 'Smooth'}</b><div class=${'meter' + (bog ? ' bog' : '')}><i style=${{ width: Math.round(hud.eff * 100) + '%' }}></i></div></div>
      </div>
      <div class=${'stage' + (phase === 'playing' ? '' : ' menu')} ref=${stageRef}>
        <canvas ref=${canvasRef} aria-label="Shaving game. Hold and drag over the hair to shave it." role="img"
          onPointerDown=${onDown} onPointerMove=${onMove} onPointerUp=${onUp} onPointerCancel=${onUp} onPointerLeave=${onLeave}></canvas>
        ${phase === 'idle' && html`
          <div class="overlay"><div class="box">
            <p class="blink" aria-hidden="true">Press start</p>
            <h4>Ready to <em>shave?</em></h4>
            <p>Hold and drag to run the clippers. Your best time on Joash goes on the board.</p>
            <p class="goes"><b>${goes}</b> ${goes === 1 ? 'go' : 'goes'} left</p>
            <div class="btns">
              ${goes < 1
                ? html`<a class="btn hot" id="earn-goes" href=${PAGES.messages}>Leave a message</a>`
                : html`<button class="btn hot" id="play-ranked" disabled=${busy} onClick=${() => start('ranked')}>Shave Joash</button>
              <button class="btn ghost" id="play-own" disabled=${!hasHair(look) || busy} onClick=${() => start('own')}>Shave your avatar</button>`}
            </div>
            ${goes < 1 && html`<p>You're out of goes. Each message of support you post earns 2 more.</p>`}
            ${goes > 0 && !hasHair(look) && html`<p>Your avatar is already bald. Pick a hairstyle to shave it.</p>`}
            ${err && html`<p class="err" role="alert">${err}</p>`}
          </div></div>`}
        ${phase === 'won' && result && html`
          <div class="overlay"><div class="box">
            <p class="blink" aria-hidden="true">Stage clear</p>
            <h4>Clean <em>shave.</em></h4>
            <div class="bigtime">${fmtTime(result.secs)}s</div>
            <p>${Math.floor(result.pct * 100)}% cleared${best != null && result.secs <= best && mode !== 'own' ? '. A new personal best!' : '.'}</p>
            ${mode === 'ranked' && !submitted && html`
              <form onSubmit=${submit} style=${{ width: '100%' }}>
                <label for="shaver-name">Name for the leaderboard
                  <input id="shaver-name" type="text" maxlength="24" value=${name} onInput=${e => setName(e.target.value)} placeholder="Your name" required />
                </label>
                <button class="btn hot" type="submit" disabled=${busy}>Submit time</button>
              </form>`}
            ${err && html`<p class="err" role="alert">${err}</p>`}
            ${mode === 'ranked' && submitted && html`<p>Your time is on the Fastest Shavers board.</p>`}
            ${mode === 'own' && html`<p>Just for fun. Avatar runs don't go on the board, because every hairstyle has a different amount of hair.</p>`}
            <p class="dare">Send your time to friends and dare them to beat it.</p>
            <div class="btns">
              <button class="btn hot" id="share-run" onClick=${async () => { setShareNote('Making your picture…'); const r = await shareRun({ secs: result.secs, mode, hp: G.current.hp, look }).catch(() => 'failed'); setShareNote(r === 'downloaded' ? 'Saved the picture and copied a message with the link. Send it to your friends or post it on your story!' : r === 'failed' ? "That didn't work. Try again." : ''); }}>Challenge a friend</button>
              <button class="btn ghost" onClick=${() => { setShareNote(''); quit(); }}>Play again</button>
            </div>
            ${shareNote && html`<p role="status">${shareNote}</p>`}
            <p class="soft-ask">Enjoyed it? Joash is raising money for people living with blood cancer. If you'd like, you can <a href=${FUNDRAISER.url} target="_blank" rel="noopener">donate to his fundraiser</a>.</p>
          </div></div>`}
      </div>
      <div class="gamebar">
        <span class="modechip">1P · ${phase === 'playing' ? (mode === 'own' ? 'Your avatar · for fun' : 'Ranked run · Joash') : 'Ranked runs are always on Joash'}</span>
        ${phase === 'playing' && html`<button class="linkbtn" onClick=${quit}>Quit run</button>`}
      </div>
      <ul class="rules">
        <li>The clock starts at your first cut and stops at 95% cleared.</li>
        <li>Slow, steady passes cut cleanly. Rushing bogs the clippers down.</li>
        <li>Thick hair on the crown takes more passes. The hair around the ears is the fiddly part.</li>
      </ul>
    </div>`;
}

/* ---------- Leaderboards ---------- */
function Leaderboard({ boards, sample }) {
  const rows = boards.shavers;
  return html`
    <div class="board">
      <div class="boardhead">
        <h3 class="board-title label">Fastest Shavers</h3>
        ${sample && html`<span class="chip sample">Sample entries</span>`}
      </div>
      ${rows.length === 0
        ? html`<p class="empty">No ranked times yet. Be the first on the board.</p>`
        : html`<ol class="rows">
          ${rows.map((r, i) => html`
            <li key=${i} class=${r.me ? 'me' : ''}>
              <span class="rank">${String(i + 1).padStart(2, '0')}</span>
              <${PixelAvatar} look=${r.look} size=${40} label=${r.name + "'s avatar"} />
              <span class="who">${r.name}${r.me && html`<span class="youtag">YOU</span>`}</span>
              <span class="val">${fmtTime(r.secs) + 's'}</span>
            </li>`)}
        </ol>`}
    </div>`;
}

function MiniBoard({ id, title, rows, val, none, sample }) {
  return html`
    <section class=${'tile board-tile ' + id} aria-labelledby=${id + '-h'}>
      <header class="tile-head"><h2 class="label" id=${id + '-h'}>${title}</h2>${sample && html`<span class="chip sample">Sample</span>`}</header>
      ${rows.length === 0 ? html`<p class="empty">${none}</p>` : html`<ol class="mini">${rows.slice(0, 3).map((r, i) => html`
        <li key=${i} class=${r.me ? 'me' : ''}><span class="rank">${i + 1}</span><${PixelAvatar} look=${r.look} size=${32} label=${r.name + "'s avatar"} /><span class="who">${r.name}</span><span class="val">${val(r)}</span></li>`)}</ol>`}
      <a class="tile-more" href=${PAGES.shave + (PREVIEW ? '' : '#board')}>Full leaderboard</a>
    </section>`;
}

/* ---------- Messages: anyone can post, no donation needed ---------- */
const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? m + 'm ago' : m < 1440 ? Math.round(m / 60) + 'h ago' : new Date(t).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }); };
const HEART = [[1, 0], [2, 0], [4, 0], [5, 0], [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [2, 4], [3, 4], [4, 4], [3, 5]];
const PixelHeart = () => html`<svg class="heart" viewBox="0 0 7 6" width="14" height="12" aria-hidden="true" shape-rendering="crispEdges">${HEART.map(([x, y]) => html`<rect key=${x + '-' + y} x=${x} y=${y} width="1" height="1" />`)}</svg>`;
const TONES = ['paper', 'navy', 'paper', 'lime', 'paper', 'ink'];
// Starter prompts give people a reason to write. The key is stored with the message; the label shows on its card.
const PROMPTS = [
  { key: 'for', label: "I'm here for…", hint: 'Who are you here for? Someone you know who has had cancer, and what they mean to you.' },
  { key: 'anyone', label: 'To anyone going through it…', hint: "What would you say to someone going through cancer right now?" },
  { key: 'business', label: 'From my business…', hint: 'Say who you are and why you are backing the shave.' }
];
const promptOf = (k) => PROMPTS.find(p => p.key === k);
const dedText = (d) => d && (d.kind === 'memory' ? 'In memory of ' : 'In honour of ') + d.name;

function Messages({ api, me, onPosted }) {
  const [list, setList] = useState(null), [err, setErr] = useState(''), [loadErr, setLoadErr] = useState(false);
  const [name, setName] = useState(''), [text, setText] = useState(''), [busy, setBusy] = useState(false), [fresh, setFresh] = useState(null), [earned, setEarned] = useState(0);
  const [prompt, setPrompt] = useState(null), [ded, setDed] = useState(''), [dedName, setDedName] = useState(''), [filter, setFilter] = useState('all');
  useEffect(() => { api.messages().then(d => setList(d.messages), () => setLoadErr(true)); }, []);
  useEffect(() => { setName(n => n || me.name); }, [me.name]);
  const post = async (e) => {
    e.preventDefault(); if (busy) return;
    setBusy(true); setErr(''); setEarned(0);
    try {
      const d = await api.postMessage({ name: name.trim(), text: text.trim(), prompt, dedKind: ded || null, dedName: ded ? dedName.trim() : '' });
      setList(d.messages); setFresh(d.messages[0] && d.messages[0].id); setText(''); setDed(''); setDedName(''); setFilter('all');
      if (d.me) onPosted(d);
      setEarned(d.earned || 0);
    }
    catch (x) { setErr(x.message); }
    setBusy(false);
  };
  const cheer = async (id) => { try { setList((await api.cheer(id)).messages); } catch (_) { /* leave it */ } };
  return html`
    <div class="msgs">
      <header class="msgs-head">
        <h1 class="name">Leave a <em>message.</em></h1>
        <p class="lede">For someone you love who's been through cancer, for anyone going through it now, or for everyone donating. No donation needed, and each message earns you 2 goes at the <a class="textlink" href=${PAGES.shave + (PREVIEW ? '' : '#step-shave')}>shave game</a>.</p>
      </header>
      <form class="composer" onSubmit=${post}>
        <${PixelAvatar} look=${me.look} size=${56} label="Your avatar" className="composer-av" />
        <div class="composer-fields">
          <label for="msg-name" class="sr">Your name</label>
          <input id="msg-name" type="text" maxlength="40" value=${name} onInput=${e => setName(e.target.value)} placeholder="Your name" required />
          <div class="prompts" role="radiogroup" aria-label="Start with">
            ${PROMPTS.map(p => html`<button type="button" role="radio" key=${p.key} aria-checked=${prompt === p.key} onClick=${() => setPrompt(prompt === p.key ? null : p.key)}>${p.label}</button>`)}
          </div>
          <label for="msg-text" class="sr">Your message</label>
          <textarea id="msg-text" maxlength="280" rows="3" value=${text} onInput=${e => setText(e.target.value)} placeholder=${prompt ? promptOf(prompt).hint : 'Write something kind, or pick a prompt above.'} required></textarea>
          <div class="ded">
            <label for="msg-ded" class="sr">Dedicate it</label>
            <select id="msg-ded" value=${ded} onChange=${e => setDed(e.target.value)}>
              <option value="">No dedication</option><option value="honour">In honour of…</option><option value="memory">In memory of…</option>
            </select>
            ${ded && html`<label for="msg-ded-name" class="sr">Their name</label><input id="msg-ded-name" type="text" maxlength="40" value=${dedName} onInput=${e => setDedName(e.target.value)} placeholder="Their name" required />`}
          </div>
          <div class="composer-foot">
            <span class="count">${text.length}/280 · Your avatar from the shave game goes with it</span>
            <button class="pbtn" type="submit" id="msg-post" disabled=${busy || !text.trim() || !name.trim()}>${busy ? 'Checking…' : 'Post'}</button>
          </div>
          ${err && html`<p class="err" role="alert">${err}</p>`}
          ${earned > 0 && html`<p class="result ok" role="status">Posted! You earned ${earned} goes at the shave game. <a class="textlink" href=${PAGES.shave + (PREVIEW ? '' : '#step-shave')}>Play now</a></p>`}
        </div>
      </form>
      ${loadErr && html`<p class="err">Messages couldn't load just now. Refresh the page to try again.</p>`}
      ${list && list.length === 0 && html`<p class="empty">No messages yet. Be the first.</p>`}
      ${list && list.length > 0 && html`
        <div class="wall-filter seg" role="radiogroup" aria-label="Show">
          ${[['all', 'All'], ...PROMPTS.map(p => [p.key, p.label.replace('…', '')])].map(([k, l]) => html`<button type="button" role="radio" key=${k} aria-checked=${filter === k} onClick=${() => setFilter(k)}>${l}</button>`)}
        </div>
        <ul class="wall" aria-label="Messages">
          ${list.filter(m => filter === 'all' || m.prompt === filter).map(m => html`
            <li key=${m.id} class=${'mnote ' + TONES[m.id % TONES.length] + (m.text.length < 60 ? ' short' : '') + (m.id === fresh ? ' fresh' : '')}>
              ${promptOf(m.prompt) && html`<p class="note-prompt">${promptOf(m.prompt).label}</p>`}
              <p class="note-text">${m.text}</p>
              ${m.dedication && html`<p class="note-ded">${dedText(m.dedication)}</p>`}
              <div class="note-foot">
                ${m.look ? html`<${PixelAvatar} look=${m.look} size=${28} label="" />` : html`<span class="note-dot" aria-hidden="true"></span>`}
                <span class="note-by"><b>${m.name}</b><span>${ago(m.when)}</span></span>
                <button type="button" class=${'cheer' + (m.cheered ? ' on' : '')} aria-pressed=${!!m.cheered} aria-label=${(m.cheered ? 'Remove your cheer for ' : 'Cheer ') + m.name + "'s message"} onClick=${() => cheer(m.id)}><${PixelHeart} />${m.cheers || ''}</button>
              </div>
            </li>`)}
        </ul>`}
    </div>`;
}

/* ---------- Messages video: turns the wall into a video Joash can post (made in the browser, nothing to set up) ---------- */
const VTONES = [['#F3F3EF', '#0E1014', '#0A35A0'], ['#0A35A0', '#FFFFFF', '#C8F03C'], ['#C8F03C', '#0E1014', '#0A35A0'], ['#0E1014', '#F3F3EF', '#C8F03C']];
const ease = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
function wrapLines(ctx, text, width) {
  const out = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const w of para.split(/\s+/).filter(Boolean)) {
      const next = line ? line + ' ' + w : w;
      if (ctx.measureText(next).width > width && line) { out.push(line); line = w; } else line = next;
    }
    out.push(line);
  }
  return out;
}
// Biggest type that fits the box, so short messages land big and long ones still fit
function fitText(ctx, text, width, height, max, min) {
  for (let size = max; size >= min; size -= 4) {
    ctx.font = `800 ${size}px Archivo`;
    const lines = wrapLines(ctx, text, width);
    if (lines.length * size * 1.08 <= height) return { size, lines };
  }
  ctx.font = `800 ${min}px Archivo`;
  return { size: min, lines: wrapLines(ctx, text, width) };
}
function avatarArt(look) {
  if (!look) return null;
  const c = document.createElement('canvas'); c.width = c.height = ART;
  paintArt(c.getContext('2d'), look);
  return c;
}
function drawHeart(ctx, x, y, cell, color) {
  ctx.fillStyle = color;
  for (const [hx, hy] of HEART) ctx.fillRect(x + hx * cell, y + hy * cell, cell, cell);
}

function planVideo(list, W, H, host) {
  const scenes = [{ kind: 'intro', dur: 3.4 }];
  list.forEach((m, i) => scenes.push({ kind: 'msg', m, i, dur: Math.min(7, Math.max(3.2, 2.4 + m.text.length / 45)), art: avatarArt(m.look), tone: VTONES[i % VTONES.length] }));
  scenes.push({ kind: 'outro', dur: 4.2 });
  let t = 0; for (const sc of scenes) { sc.start = t; t += sc.dur; }
  const faces = list.slice(0, 24).map(m => avatarArt(m.look)).filter(Boolean);
  const pad = 80, total = t;
  function label(ctx, text, x, y, color) { ctx.font = '400 26px Silkscreen'; ctx.fillStyle = color; ctx.textBaseline = 'alphabetic'; ctx.fillText(text.toUpperCase(), x, y); }
  function scene(ctx, sc, t) {
    const k = t - sc.start;
    ctx.imageSmoothingEnabled = false;
    ctx.fontStretch = 'semi-expanded';
    if (sc.kind === 'intro') {
      ctx.fillStyle = '#F3F3EF'; ctx.fillRect(0, 0, W, H);
      label(ctx, "Joash's World's Greatest Shave fundraiser", pad, pad + 20, '#5B5F68');
      const up = 60 * (1 - ease(k / .6));
      ctx.globalAlpha = ease(k / .5);
      ctx.font = '800 132px Archivo'; ctx.textBaseline = 'top'; ctx.fillStyle = '#0E1014';
      ctx.fillText('Messages of', pad, H * .26 + up);
      ctx.fillStyle = '#0A35A0'; ctx.fillText('support.', pad, H * .26 + 128 + up);
      ctx.globalAlpha = 1;
      ctx.font = '500 34px "Schibsted Grotesk"'; ctx.fillStyle = '#5B5F68';
      ctx.fillText(`${list.length} message${list.length === 1 ? '' : 's'} from people backing the shave`, pad, H * .26 + 330);
      const size = 72, gap = 8, per = Math.floor((W - pad * 2 + gap) / (size + gap));
      faces.slice(0, per * 2).forEach((f, i) => {
        if (k < .8 + i * .06) return;
        ctx.fillStyle = '#E8E8E2'; const x = pad + (i % per) * (size + gap), y = H - pad - size * 2 - gap + Math.floor(i / per) * (size + gap);
        ctx.fillRect(x, y, size, size); ctx.drawImage(f, x, y, size, size);
      });
    } else if (sc.kind === 'outro') {
      ctx.fillStyle = '#0A35A0'; ctx.fillRect(0, 0, W, H);
      const up = 50 * (1 - ease(k / .6));
      ctx.globalAlpha = ease(k / .5);
      ctx.font = '800 150px Archivo'; ctx.textBaseline = 'top'; ctx.fillStyle = '#FFFFFF';
      ctx.fillText('Leave', pad, H * .24 + up); ctx.fillStyle = '#C8F03C'; ctx.fillText('yours.', pad, H * .24 + 140 + up);
      ctx.globalAlpha = 1;
      ctx.font = '600 44px "Schibsted Grotesk"'; ctx.fillStyle = '#FFFFFF'; ctx.fillText(host + '/messages', pad, H * .24 + 340);
      label(ctx, 'Donate to the shave', pad, H - pad - 70, '#C8F03C');
      ctx.font = '500 32px "Schibsted Grotesk"'; ctx.fillStyle = '#FFFFFF'; ctx.textBaseline = 'alphabetic';
      ctx.fillText('worldsgreatestshave.com/fundraisers/joashj', pad, H - pad);
    } else {
      const [bg, fg, hi] = sc.tone, m = sc.m;
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
      label(ctx, `${promptOf(m.prompt) ? promptOf(m.prompt).label : 'Messages of support'}  ${sc.i + 1}/${list.length}`, pad, pad + 20, fg);
      ctx.fillStyle = hi; ctx.font = '800 160px Archivo'; ctx.textBaseline = 'top'; ctx.fillText('“', pad - 6, pad + 40);
      const box = { x: pad, y: pad + 200, w: W - pad * 2, h: H - pad * 2 - 200 - 170 - (m.dedication ? 70 : 0) };
      const { size, lines } = fitText(ctx, m.text, box.w, box.h, m.text.length < 40 ? 120 : 88, 40);
      ctx.fillStyle = fg; ctx.textBaseline = 'top';
      lines.forEach((ln, i) => {
        const a = ease((k - .15 - i * .07) / .45);
        ctx.globalAlpha = a; ctx.fillText(ln, box.x, box.y + i * size * 1.08 + 30 * (1 - a));
      });
      ctx.globalAlpha = ease((k - .5) / .4);
      const ay = H - pad - 112;
      if (m.dedication) { ctx.fillStyle = hi; ctx.fillRect(pad, ay - 82, 8, 44); ctx.fillStyle = fg; ctx.font = '700 36px Archivo'; ctx.textBaseline = 'middle'; ctx.fillText(dedText(m.dedication), pad + 24, ay - 60); }
      if (sc.art) { ctx.fillStyle = 'rgba(127,127,127,.18)'; ctx.fillRect(pad, ay, 112, 112); ctx.drawImage(sc.art, pad, ay, 112, 112); }
      const nx = pad + (sc.art ? 140 : 0);
      ctx.fillStyle = fg; ctx.textBaseline = 'alphabetic'; ctx.font = '700 40px "Schibsted Grotesk"'; ctx.fillText(m.name, nx, ay + 52);
      if (m.cheers) { drawHeart(ctx, nx, ay + 76, 5, hi === '#C8F03C' && bg !== '#0E1014' && bg !== '#0A35A0' ? fg : hi); ctx.font = '600 30px "Schibsted Grotesk"'; ctx.fillStyle = fg; ctx.fillText(String(m.cheers), nx + 48, ay + 104); }
      ctx.globalAlpha = 1;
    }
  }
  function draw(ctx, t) {
    const i = Math.max(0, scenes.findIndex(sc => t < sc.start + sc.dur));
    const sc = scenes[i === -1 ? scenes.length - 1 : i], prev = scenes[i - 1], w = (t - sc.start) / .35;
    if (prev && w < 1) {
      // A hard-edged wipe from the left: the old card stays put while the new one slides over it
      scene(ctx, prev, prev.start + prev.dur - .001);
      const x = W * (1 - ease(w));
      ctx.save(); ctx.beginPath(); ctx.rect(x, 0, W - x, H); ctx.clip(); ctx.translate(x * .15, 0); scene(ctx, sc, t); ctx.restore();
    } else scene(ctx, sc, t);
    ctx.fillStyle = '#C8F03C'; ctx.fillRect(0, H - 10, W * Math.min(1, t / total), 10);
  }
  return { draw, total };
}

function MessageVideo({ api, config }) {
  const [list, setList] = useState(null), [pick, setPick] = useState('top20'), [shape, setShape] = useState('square');
  const [state, setState] = useState('idle'), [progress, setProgress] = useState(0), [out, setOut] = useState(null), [err, setErr] = useState('');
  const canvas = useRef(null), stop = useRef(false);
  useEffect(() => { api.messages().then(d => setList(d.messages), () => setErr("Messages couldn't load. Refresh to try again.")); }, []);
  const W = 1080, H = shape === 'square' ? 1080 : 1350;
  const chosen = useMemo(() => {
    if (!list) return [];
    const byCheers = list.slice().sort((a, b) => b.cheers - a.cheers || b.when - a.when);
    return pick === 'top10' ? byCheers.slice(0, 10) : pick === 'top20' ? byCheers.slice(0, 20) : list.slice(0, 40).reverse();
  }, [list, pick]);
  const host = PREVIEW ? 'joashjobson.workers.dev' : location.host;
  const plan = useMemo(() => chosen.length ? planVideo(chosen, W, H, host) : null, [chosen, W, H]);
  // Still frame of the first message while nothing is recording
  useEffect(() => {
    if (!plan || state === 'recording') return;
    document.fonts.ready.then(() => plan.draw(canvas.current.getContext('2d'), 3.4 + 1.6));
  }, [plan, state]);

  const make = async () => {
    setErr(''); setOut(null);
    const types = ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
    const type = window.MediaRecorder && types.find(t => MediaRecorder.isTypeSupported(t));
    if (!type || !canvas.current.captureStream) { setErr("This browser can't record video. Try Chrome or Safari on a computer."); return; }
    await Promise.all(['800 100px Archivo', '600 40px "Schibsted Grotesk"', '400 26px Silkscreen'].map(f => document.fonts.load(f).catch(() => {})));
    const ctx = canvas.current.getContext('2d');
    plan.draw(ctx, 0);
    const stream = canvas.current.captureStream(30), rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 8000000 }), chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      if (stop.current) { setState('idle'); return; }
      const blob = new Blob(chunks, { type: type.split(';')[0] });
      setOut({ url: URL.createObjectURL(blob), ext: type.includes('mp4') ? 'mp4' : 'webm', mb: blob.size / 1e6 });
      setState('done');
    };
    stop.current = false; setState('recording'); rec.start(1000);
    const t0 = performance.now();
    const frame = () => {
      const t = (performance.now() - t0) / 1000;
      if (stop.current || t >= plan.total) { plan.draw(ctx, plan.total - .001); rec.stop(); return; }
      plan.draw(ctx, t); setProgress(t / plan.total);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  };
  const secs = plan ? Math.round(plan.total) : 0;
  return html`
    <div class="msgs vid">
      <header class="msgs-head">
        <h1 class="name">Messages <em>video.</em></h1>
        <p class="lede">Turns the message wall into a video for LinkedIn or Instagram. It plays through once while it records, so keep this tab open.</p>
      </header>
      <div class="vid-grid">
        <div class="vid-stage"><canvas ref=${canvas} width=${W} height=${H} aria-label="Video preview"></canvas></div>
        <div class="vid-side">
          <div><p class="label">Which messages</p>
            <div class="seg" role="radiogroup" aria-label="Which messages">
              ${[['top10', 'Top 10'], ['top20', 'Top 20'], ['recent', 'Newest 40']].map(([v, l]) => html`<button type="button" role="radio" aria-checked=${pick === v} disabled=${state === 'recording'} onClick=${() => setPick(v)}>${l}</button>`)}
            </div>
            <p class="note">Top means the most cheered.</p></div>
          <div><p class="label">Shape</p>
            <div class="seg" role="radiogroup" aria-label="Shape">
              ${[['square', 'Square 1:1'], ['tall', 'Tall 4:5']].map(([v, l]) => html`<button type="button" role="radio" aria-checked=${shape === v} disabled=${state === 'recording'} onClick=${() => setShape(v)}>${l}</button>`)}
            </div></div>
          ${list && html`<p>${chosen.length} message${chosen.length === 1 ? '' : 's'}, about ${secs} seconds.</p>`}
          ${list && !chosen.length && html`<p class="empty">No messages yet, so there's nothing to make a video of.</p>`}
          ${state === 'recording'
            ? html`<div class="vid-prog" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow=${Math.round(progress * 100)}><span style=${{ width: progress * 100 + '%' }}></span></div>
                <button class="btn ghost" type="button" onClick=${() => { stop.current = true; }}>Stop</button>`
            : html`<button class="pbtn" type="button" id="make-video" disabled=${!plan} onClick=${make}>${out ? 'Make it again' : 'Make the video'}</button>`}
          ${out && html`
            <a class="btn hot" id="video-download" href=${out.url} download=${`messages-for-joash.${out.ext}`}>Download (${out.mb.toFixed(1)} MB ${out.ext.toUpperCase()})</a>
            ${out.ext === 'webm' && html`<p class="note">This browser saved a WebM file. LinkedIn wants MP4, so make it in Chrome or Safari instead.</p>`}`}
          ${err && html`<p class="err" role="alert">${err}</p>`}
        </div>
      </div>
    </div>`;
}

/* ---------- The shave page ---------- */
function WgsFundraiserSection({ me, boards, config, actions }) {
  const [nameDraft, setNameDraft] = useState(me.name);
  useEffect(() => { setNameDraft(me.name); }, [me.name]);
  const saveName = () => { const n = nameDraft.trim(); if (n && n !== me.name) actions.setName(n).catch(() => setNameDraft(me.name)); };
  const toGame = () => document.getElementById('step-shave').scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth' });
  const donate = html`<a href=${FUNDRAISER.url} target="_blank" rel="noopener">my WGS page</a>`;

  return html`
    <div class="shave" id="shave">
      <header class="shave-head">
        <p class="label">World's Greatest Shave</p>
        <h1 class="name">How fast can you shave my <em>pixel head?</em></h1>
        <p class="lede">I'm raising money for World's Greatest Shave to support people living with blood cancer. Please donate on my WGS page, then leave a message of support to earn goes at shaving the pixel version of me.</p>
        <dl class="facts">
          <div><dt class="label">Record</dt><dd>${boards.shavers[0] ? fmtTime(boards.shavers[0].secs) + 's' : '–'}</dd><dd class="small">${boards.shavers[0] ? boards.shavers[0].name : 'No times yet'}</dd></div>
          <div><dt class="label">Donations go to</dt><dd class="fact-text">Leukaemia Foundation</dd><dd class="small">through World's Greatest Shave</dd></div>
        </dl>
        <div class="head-ctas">
          <a class="pbtn" href=${FUNDRAISER.url} target="_blank" rel="noopener">Donate to my WGS</a>
          <button type="button" class="textlink" onClick=${toGame}>Skip to the game</button>
        </div>
        <ol class="stepnav" aria-label="Steps">
          ${[['step-1', 'Donate'], ['step-2', 'Leave a message'], ['step-3', 'Make your avatar'], ['step-4', 'Shave'], ['step-5', 'Leaderboard']].map(([id, t], i) =>
            html`<li key=${id}><a href=${'#' + id} onClick=${e => { e.preventDefault(); document.getElementById(id).closest('section').scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth' }); }}><span>0${i + 1}</span>${t}</a></li>`)}
        </ol>
      </header>
      <div class="shave-main">

      <section class="step" aria-labelledby="step-1">
        <h2 class="step-h" id="step-1"><span class="step-n">01</span>Donate on my WGS page</h2>
        <ul class="points">
          <li><span>Open ${donate} and give any amount. Every dollar helps, and donations go to the Leukaemia Foundation.</span></li>
          <li><span>Your donation stays between you and World's Greatest Shave. This site never asks how much you gave.</span></li>
        </ul>
        <div class="donate-row">
          <a class="donate-url" href=${FUNDRAISER.url} target="_blank" rel="noopener">${FUNDRAISER.url.replace(/^https?:\/\/(www\.)?/, '')} ↗</a>
        </div>
      </section>

      <section class="step" aria-labelledby="step-2">
        <h2 class="step-h" id="step-2"><span class="step-n">02</span>Leave a message, earn goes</h2>
        <ul class="points">
          <li><span>Everyone gets <strong>two free goes</strong>. Each message of support you post earns <strong>two more</strong>.</span></li>
          <li><span>Write something real: some encouragement, a memory, or why you're backing the shave. Messages like "hi" don't go up and don't earn goes.</span></li>
          <li><span>You can post up to 2 messages a day.</span></li>
        </ul>
        <div class="donate-row"><a class="pbtn" href=${PAGES.messages}>Leave a message</a></div>
      </section>

      <section class="step" aria-labelledby="step-3">
        <h2 class="step-h" id="step-3"><span class="step-n">03</span>Make your avatar</h2>
        <ul class="points">
          <li><span>Your avatar and name sit next to your time on the leaderboard.</span></li>
          <li><span>Use the arrows to pick a hairstyle, hair colour, skin, eyes, face, shirt and an extra, or press Shuffle. Change it whenever you like.</span></li>
        </ul>
        <${AvatarMaker} look=${me.look} onChange=${actions.setLook} />
        <label class="namefield" for="lb-name">Name on the leaderboard
          <input id="lb-name" type="text" maxlength="24" value=${nameDraft} placeholder="Your name"
            onInput=${e => setNameDraft(e.target.value)} onBlur=${saveName} onKeyDown=${e => { if (e.key === 'Enter') e.target.blur(); }} />
        </label>
      </section>

      <section class="step" id="step-shave" aria-labelledby="step-4">
        <h2 class="step-h" id="step-4"><span class="step-n">04</span>Shave my pixel head</h2>
        <ul class="points">
          <li><span>Each run uses one go. Your best time shaving pixel me goes on the leaderboard.</span></li>
          <li><span>Hold and drag to run the clippers. On a phone, press and drag with your finger.</span></li>
          <li><span>The clock starts at your first cut and stops when 95% of the hair is gone.</span></li>
          <li><span>You can also spend a go shaving your own avatar, just for fun. Those runs don't go on the board.</span></li>
        </ul>
        <${ShaveGame} goes=${me.goes} look=${me.look} playerName=${me.name} savedBest=${me.best} onStart=${actions.start} onWin=${actions.finish} />
      </section>

      <section class="step" id="board" aria-labelledby="step-5">
        <h2 class="step-h" id="step-5"><span class="step-n">05</span>Climb the leaderboard</h2>
        <ul class="points">
          <li><span><strong>Fastest Shavers</strong> shows each person's best time on pixel me.</span></li>
        </ul>
        <${Leaderboard} boards=${boards} sample=${config.sample} />
      </section>
      </div>
    </div>`;
}

/* ---------- Saving: the Worker on the live site, memory in the preview ---------- */
// Joash's World's Greatest Shave page. Every donate link on the site uses it.
const FUNDRAISER = { url: 'https://www.worldsgreatestshave.com/fundraisers/joashj' };
const START_LOOK = { skin: 2, hair: 1, style: 5, eyes: 2, face: 1, shirt: 1, extra: 0 };
const EMPTY_ME = { name: '', look: START_LOOK, best: null, goes: 2 };

// No sign-up: each browser gets a random ID the first time, and the Worker saves everything under it.
function playerId() {
  const make = () => (crypto.randomUUID ? crypto.randomUUID()
    : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)));
  try {
    let id = localStorage.getItem('jj-player');
    if (!/^[0-9a-f-]{36}$/.test(id || '')) { id = make(); localStorage.setItem('jj-player', id); }
    return id;
  } catch (_) { return make(); }
}

function RemoteAPI() {
  const player = playerId();
  const call = async (path, opts) => {
    let r, data = null;
    try { r = await fetch('/api/' + path, opts); } catch (_) { throw new Error("Couldn't reach the site. Check your connection and try again."); }
    try { data = await r.json(); } catch (_) { /* not JSON */ }
    if (!r.ok) throw new Error((data && data.error) || 'Something went wrong. Try again in a minute.');
    return data;
  };
  const post = (path, body) => call(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ player, ...body }) });
  return {
    load: () => call('state?player=' + player),
    profile: (p) => post('profile', p),
    start: (mode) => post('run/start', { mode }),
    finish: (o) => post('run/finish', o),
    messages: () => call('messages?player=' + player),
    postMessage: (o) => post('message', o),
    cheer: (id) => post('cheer', { id })
  };
}

// The preview's stand-in for the Worker: same answers, kept in memory, with sample people on the boards.
const SAMPLE_LOOKS = {
  'Priya S.': { skin: 3, hair: 1, style: 4, eyes: 0, face: 1, shirt: 2, extra: 2 },
  'Tom W.': { skin: 0, hair: 3, style: 1, eyes: 1, face: 3, shirt: 4, extra: 0 },
  'Ana L.': { skin: 1, hair: 2, style: 3, eyes: 2, face: 2, shirt: 1, extra: 1 },
  'Ben K.': { skin: 4, hair: 1, style: 2, eyes: 0, face: 0, shirt: 3, extra: 0 },
  'Mei C.': { skin: 1, hair: 6, style: 6, eyes: 3, face: 1, shirt: 5, extra: 3 }
};
const SAMPLE_TIMES = [['Tom W.', 38.42], ['Ana L.', 44.07], ['Priya S.', 51.9], ['Ben K.', 63.15], ['Mei C.', 79.6]].map(([name, secs]) => ({ name, secs, look: SAMPLE_LOOKS[name] }));

const HOUR = 3600000, NOW = Date.now();
const SAMPLE_MESSAGES = [
  ['Ana L.', 'for', 'My nan. She had leukaemia when I was ten and the nurses were incredible. She still talks about them.', 14, 2, ['honour', 'Nan (Rosa)']],
  ['Tom W.', null, 'Donated, played, and beat Mei by two seconds. Worth every cent.', 9, 4],
  ['Mei C.', 'anyone', 'You are not on your own. Eat the good snacks, take the nap, let people help.', 16, 7],
  ['Northside Bakery', 'business', 'Free coffee for anyone who shows us they donated. Proud to back the shave.', 7, 12],
  ['Ben K.', 'for', 'My uncle Dave, who taught me to fish and never once let me win.', 21, 20, ['memory', 'Uncle Dave']],
  ['Priya S.', 'anyone', 'For everyone who has sat in a waiting room hoping for good news. This one is for you.', 23, 26],
  ['Sam R.', null, 'Every bit helps. Get around it!', 4, 40]
].map(([name, prompt, text, cheers, h, ded], i) => ({ id: 800 + i, name, prompt, text, look: SAMPLE_LOOKS[name] || (prompt === 'business' ? null : { skin: 2, hair: 0, style: 2, eyes: 1, face: 4, shirt: 0, extra: 0 }), cheers, cheered: false, when: NOW - h * HOUR, dedication: ded ? { kind: ded[0], name: ded[1] } : null }));

function LocalAPI() {
  const p = { name: '', look: START_LOOK, bestMs: null, goes: 2, runs: {}, msgs: SAMPLE_MESSAGES.map(m => ({ ...m })) };
  let nextId = 1;
  const msgs = () => ({ messages: p.msgs.slice() });
  const screen = (t) => {
    if (/badword/i.test(t)) throw new Error("This can't go up. Keep it friendly, with no swearing, hate, adult content, scams or personal details.");
    if (/(donate|pay|send|give)\b.{0,30}\b(to|me)\b(?!.{0,4}joash)|pay ?id|bsb|gofundme/i.test(t) && !/donate to joash/i.test(t)) throw new Error("This can't go up. Posts can't ask people to donate or send money to anyone except Joash's fundraiser.");
  };
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const view = () => {
    const me = { name: p.name, look: p.look, best: p.bestMs == null ? null : p.bestMs / 1000, goes: p.goes };
    const you = { name: p.name || 'You', look: p.look, me: true };
    const shavers = [...SAMPLE_TIMES, ...(p.bestMs != null ? [{ ...you, secs: p.bestMs / 1000 }] : [])].sort((a, b) => a.secs - b.secs).slice(0, 10);
    const top = p.msgs.slice().sort((a, b) => b.cheers - a.cheers || b.when - a.when)[0] || null;
    return { me, boards: { shavers }, config: { sample: true, top } };
  };
  return {
    load: async () => view(),
    profile: async ({ look, name }) => { if (look) p.look = look; if (name) p.name = name.slice(0, 24); return view(); },
    start: async (mode) => {
      if (p.goes < 1) throw new Error("You're out of goes. Post a message of support to earn 2 more.");
      p.goes--;
      const runId = String(Math.random()).slice(2);
      p.runs[runId] = { mode };
      return { ...view(), runId };
    },
    finish: async ({ runId, secs, name }) => {
      const run = p.runs[runId];
      if (!run) throw new Error("That run wasn't found. Start a new one.");
      if (name) p.name = name.slice(0, 24);
      if (run.mode === 'ranked') { const ms = Math.round(secs * 1000); if (p.bestMs == null || ms < p.bestMs) p.bestMs = ms; }
      delete p.runs[runId];
      return view();
    },
    messages: async () => msgs(),
    postMessage: async ({ name, text, prompt, dedKind, dedName }) => {
      await wait(600);
      if (text.replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(' ').filter(w => w.length > 1).length < 3) throw new Error("Write a real message of support to post it, like some encouragement, a memory or why you're backing the shave.");
      screen(name + ' ' + text + ' ' + (dedName || ''));
      if (dedKind && !dedName) throw new Error('Add the name of the person it is for.');
      p.msgs.unshift({ id: nextId++, name, text, prompt: prompt || null, look: p.look, cheers: 0, cheered: false, when: Date.now(), dedication: dedKind ? { kind: dedKind, name: dedName } : null });
      p.goes += 2;
      return { ...msgs(), posted: true, earned: 2, ...view() };
    },
    cheer: async (id) => { const m = p.msgs.find(m => m.id === id); if (m) { m.cheered = !m.cheered; m.cheers += m.cheered ? 1 : -1; } return msgs(); }
  };
}

/* ---------- Site ---------- */
// The donate tile: Joash's portrait shaves itself, and you can shave it by moving over it. The hair grows back.
function DonateTile() {
  const ref = useRef(null);
  const [copied, setCopied] = useState(false);
  const canHover = typeof matchMedia === 'function' && matchMedia('(hover: hover)').matches;
  useEffect(() => {
    const canvas = ref.current, ctx = canvas.getContext('2d');
    const head = buildHead(JOASH), hp = new Float32Array(N * N);
    const full = () => { for (let i = 0; i < N * N; i++) hp[i] = head.kind[i] === HAIR ? head.max[i] : 0; };
    full();
    const img = ctx.createImageData(N, N);
    // the full head, faded back in over the shaved one when the hair grows back
    const grown = document.createElement('canvas'); grown.width = grown.height = N;
    { const g = grown.getContext('2d'), gi = g.createImageData(N, N); paintHead(gi, hp, head); g.putImageData(gi, 0, 0); }
    // an automatic pass: left-right rows that stay over the hair in each band
    const path = [];
    for (let y = 0, dir = 1; y < N + 2; y += 2) {
      let x0 = N, x1 = -1;
      for (let yy = y - 2; yy <= y; yy++) for (let x = 0; x < N; x++) if (yy >= 0 && yy < N && head.kind[yy * N + x] === HAIR) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
      if (x1 < 0) continue;
      path.push(dir > 0 ? [x0 - 1, y] : [x1 + 2, y], dir > 0 ? [x1 + 2, y] : [x0 - 1, y]); dir = -dir;
    }
    let seg = 0, t = 0, mode = 'auto', idle = 0, regrow = 0, user = null, raf, last = performance.now();
    const still = reduceMotion();
    const cut = (px, py, amt) => {
      for (let y = Math.floor(py - 1.5); y < Math.floor(py - 1.5) + 3; y++) for (let x = Math.floor(px - 2); x < Math.floor(px - 2) + 4; x++) {
        if (x < 0 || y < 0 || x >= N || y >= N) continue;
        const i = y * N + x; if (head.kind[i] === HAIR && hp[i] > 0) hp[i] = Math.max(0, hp[i] - amt);
      }
    };
    const onMove = (e) => {
      const r = canvas.getBoundingClientRect();
      user = [(e.clientX - r.left) / r.width * N, (e.clientY - r.top) / r.height * N];
      mode = 'user'; idle = 0;
    };
    const onLeave = () => { user = null; };
    canvas.addEventListener('pointermove', onMove); canvas.addEventListener('pointerleave', onLeave);
    function frame(now) {
      const dt = Math.min(.05, (now - last) / 1000); last = now;
      let clip = null;
      if (mode === 'user') {
        if (user) { cut(user[0], user[1], 30 * dt); clip = user; }
        idle += dt;
        if (idle > 2.5) { mode = 'regrow'; regrow = 0; }
      } else if (mode === 'auto' && !still) {
        // walk the path by distance, cutting in small steps so a slow frame never skips hair
        const segLen = (k) => Math.hypot(path[k + 1][0] - path[k][0], path[k + 1][1] - path[k][1]) || 1;
        const sub = Math.max(1, Math.ceil(dt * 46 / .5));
        for (let s = 0; s < sub && seg < path.length - 1; s++) {
          t += dt * 46 / sub;
          while (seg < path.length - 1 && t >= segLen(seg)) { t -= segLen(seg); seg++; }
          if (seg < path.length - 1) { const [ax, ay] = path[seg], [bx, by] = path[seg + 1], f = t / segLen(seg); clip = [ax + (bx - ax) * f, ay + (by - ay) * f]; cut(clip[0], clip[1], 90 * dt / sub); }
        }
        if (seg >= path.length - 1) { mode = 'pause'; idle = 0; clip = null; }
      } else if (mode === 'pause') {
        idle += dt; if (idle > 1.4) { mode = 'regrow'; regrow = 0; }
      } else if (mode === 'regrow') {
        regrow += dt;
        if (regrow > 1) { full(); mode = 'auto'; seg = 0; t = 0; }
      }
      paintHead(img, hp, head);
      ctx.putImageData(img, 0, 0);
      if (mode === 'regrow') { ctx.globalAlpha = Math.min(1, regrow); ctx.drawImage(grown, 0, 0); ctx.globalAlpha = 1; }
      if (clip) {
        const bx = Math.floor(clip[0] - 2), by = Math.floor(clip[1] - 1.5);
        ctx.fillStyle = '#0E1014'; ctx.fillRect(bx, by + 3, 4, 6);
        ctx.fillStyle = '#C8F03C'; ctx.fillRect(bx + 1, by + 3, 2, 5);
        ctx.fillStyle = '#E6E4DE'; ctx.fillRect(bx, by + 2, 4, 1);
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); canvas.removeEventListener('pointermove', onMove); canvas.removeEventListener('pointerleave', onLeave); };
  }, []);
  const copy = () => {
    const done = () => { setCopied(true); setTimeout(() => setCopied(false), 1600); };
    try { navigator.clipboard.writeText(FUNDRAISER.url).then(done, () => selectLink()); } catch (_) { selectLink(); }
  };
  const selectLink = () => { const el = document.getElementById('donate-url'); const r = document.createRange(); r.selectNodeContents(el); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); };
  const shown = FUNDRAISER.url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
  return html`
    <section class="tile donate" aria-labelledby="tile-title">
      <div class="tile-copy">
        <p class="label">World's Greatest Shave</p>
        <h2 id="tile-title">Donate to my <em>WGS</em></h2>
        <p class="tile-text">I'm raising money for people living with blood cancer. Donate, then see how fast you can shave my pixel head. ${canHover ? 'Move your mouse over me to try.' : 'Drag your finger across me to try.'}</p>
        <div class="tile-ctas">
          <a class="tbtn solid" href=${FUNDRAISER.url} target="_blank" rel="noopener">Donate</a>
          <a class="tbtn" href=${PAGES.shave}>Play the shave game</a>
        </div>
        <div class="linkbox">
          <span class="lb-label">My donation page</span>
          <span class="lb-url" id="donate-url">${shown}</span>
          <button type="button" class="lb-copy" onClick=${copy}>${copied ? 'Copied' : 'Copy'}</button>
        </div>
      </div>
      <div class="tile-art-wrap" aria-hidden="false"><span class="tile-block" aria-hidden="true"></span>
        <canvas ref=${ref} class="tile-art" width=${N} height=${N} role="img" aria-label="Pixel Joash getting his hair clipped"></canvas></div>
    </section>`;
}

function ThemeToggle() {
  const read = () => { try { return localStorage.getItem('jj-theme'); } catch (_) { return null; } };
  const [theme, setTheme] = useState(read);
  useEffect(() => { if (theme) document.documentElement.setAttribute('data-theme', theme); }, [theme]);
  const dark = theme ? theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  const flip = () => { const next = dark ? 'light' : 'dark'; setTheme(next); try { localStorage.setItem('jj-theme', next); } catch (_) {} };
  return html`<button type="button" class="theme" onClick=${flip} aria-label=${dark ? 'Switch to light mode' : 'Switch to dark mode'}>
    ${dark
      ? html`<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`
      : html`<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>`}
  </button>`;
}

// The home page banner: the most loved message from the messages page
function TopMessage({ top, sample }) {
  const loved = top && top.cheers > 0;
  return html`
    <section class="topspot" aria-label=${loved ? 'Most loved message' : 'Latest message'}>
      <div class="ts-head">
        <span class="label">${loved ? 'Most loved message' : top ? 'Latest message' : 'Messages of support'}</span>
        ${sample && html`<span class="chip">Sample</span>`}
      </div>
      <div class="ts-body"><div class="ts-text">
        ${top ? html`<p class="ts-msg">${top.text}</p>
          <p class="ts-by"><b>${top.name}</b>${top.dedication ? ` · ${top.dedication.kind === 'memory' ? 'In memory of' : 'In honour of'} ${top.dedication.name}` : ''}${loved ? ` · ${top.cheers} ${top.cheers === 1 ? 'heart' : 'hearts'}` : ''}</p>`
        : html`<p class="ts-msg">No messages yet. Yours could be the first.</p>`}
      </div></div>
      <a class="ts-cta" href=${PAGES.messages}>${top ? 'Read and heart messages' : 'Leave a message'}</a>
    </section>`;
}

// Home is about Joash: who he is first, the fundraiser under "Right now".
function Home({ boards, config }) {
  return html`
    <div class="home">
      <${TopMessage} top=${config.top} sample=${config.sample} />
      <section class="intro" aria-labelledby="hi">
        <h1 class="name" id="hi">Hi, I'm <em>Joash.</em></h1>
        <p class="lede">This is where I share what I'm working on and what I'm up to.</p>
      </section>
      <h2 class="label section-label">Right now</h2>
      <${DonateTile} />
      <${MiniBoard} id="shaves" title="Fastest shaves" rows=${boards.shavers} val=${r => fmtTime(r.secs) + 's'} none="No times yet." sample=${config.sample} />
    </div>`;
}

// Privacy policy (/privacy). Keep it in step with what src/worker.js actually stores.
function Privacy() {
  const sec = (title, ...body) => html`<section class="policy-sec"><h2 class="policy-h">${title}</h2>${body}</section>`;
  return html`
    <div class="simple policy">
      <div>
        <p class="eyebrow">Last updated 28 October 2026</p>
        <h1 class="name">Privacy</h1>
      </div>
      <p class="lede">This site supports Joash Jobson's World's Greatest Shave fundraiser. It keeps as little about you as it can. Here's exactly what that is.</p>
      ${sec('No accounts, no tracking',
        html`<p>There's no sign-up, no ads and no analytics. The first time you visit, your browser makes a random ID (a string of letters and numbers) and keeps it on your device. That's how the site remembers your avatar and best time. Your browser also remembers whether you picked the light or dark theme. Neither is a cookie, and clearing your browser's site data removes both.</p>`)}
      ${sec('Donations',
        html`<p>You donate on World's Greatest Shave's own website, not here. This site never sees your payment, your receipt or how much you gave.</p>`)}
      ${sec('The leaderboard',
        html`<p>The leaderboard shows the name you choose, your avatar and your best shave time. Use a first name or a nickname if you'd rather not show your full name.</p>`)}
      ${sec('Messages',
        html`<p>Messages are public. A message shows the name you type, your avatar and any "In honour of" or "In memory of" name you add, so only add someone's name if you're happy for it to be seen. Before a message goes up, its words are sent to <a class="textlink" href="https://groq.com" target="_blank" rel="noopener">Groq</a>, an AI service, to check they're friendly. Groq doesn't use them to train AI. Joash can take any post down, and he may share messages in a video on social media, like LinkedIn.</p>`)}
      ${sec('Who sees what',
        html`<p>Everyone can see the leaderboard and the messages. Joash can see the same names, times and messages on his admin page. Nobody else gets your information, and it's never sold.</p>`)}
      ${sec('Where it\'s kept',
        html`<p>Everything is stored with Cloudflare, which runs the site. To stop floods of posts, your IP address is turned into a code that can't be reversed and kept for a day. Cloudflare's own logs of visits are kept for a few days. Fonts are loaded from Google Fonts, so Google sees your IP address when the page loads.</p>`)}
      ${sec('Removing your information',
        html`<p>Ask Joash and he'll delete everything the site holds about you: your name, avatar, times and messages.</p>`)}
    </div>`;
}

// Four pages: home, the shave game, messages and privacy. The live site serves them as /, /shave, /messages and /privacy; the preview uses #hashes.
function useRoute() {
  // The messages video maker lives at /messages#video (Joash opens it from the admin page)
  const get = () => PREVIEW ? ({ '#shave': 'shave', '#privacy': 'privacy', '#messages': 'messages', '#video': 'video' }[location.hash] || 'home')
    : document.body.dataset.page === 'messages' && location.hash === '#video' ? 'video' : (document.body.dataset.page || 'home');
  const [route, setRoute] = useState(get);
  useEffect(() => {
    if (!PREVIEW) return;
    const on = () => { const r = get(); setRoute(prev => { if (prev !== r) window.scrollTo(0, 0); return r; }); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

function App() {
  const route = useRoute();
  const api = useMemo(() => PREVIEW ? LocalAPI() : RemoteAPI(), []);
  const [me, setMe] = useState(EMPTY_ME);
  const [boards, setBoards] = useState({ shavers: [] });
  const [config, setConfig] = useState({ sample: PREVIEW });
  const [offline, setOffline] = useState(false);
  const lookPending = useRef(null);   // the newest avatar not yet saved, so an older reply can't undo a click
  const apply = useCallback((d) => {
    if (d.me) setMe(lookPending.current ? { ...d.me, look: lookPending.current } : d.me);
    if (d.boards) setBoards(d.boards);
    if (d.config) setConfig(c => ({ ...c, ...d.config }));
    return d;
  }, []);
  useEffect(() => { api.load().then(apply, () => setOffline(true)); }, []);

  // Avatar changes show straight away and save half a second after the last click.
  const lookTimer = useRef(null);
  const actions = useMemo(() => ({
    setLook: (look) => {
      lookPending.current = look;
      setMe(m => ({ ...m, look }));
      clearTimeout(lookTimer.current);
      lookTimer.current = setTimeout(() => api.profile({ look }).then(d => { if (lookPending.current === look) lookPending.current = null; apply(d); }, () => {}), 500);
    },
    setName: async (name) => apply(await api.profile({ name })),
    start: async (mode) => apply(await api.start(mode)),
    finish: async (o) => apply(await api.finish(o))
  }), [api, apply]);

  return html`
    <header class="topbar">
      <div class="topbar-in">
        <a href=${PAGES.home} class="home-link" aria-current=${route === 'home' ? 'page' : null}><svg class="jmark" viewBox="0 0 28 28" aria-hidden="true"><rect x=".5" y=".5" width="27" height="27" fill="none" stroke="currentColor"/><g transform="translate(2.6809 21.5029) scale(0.02162 -0.02162)"><path fill="currentColor" d="M298 -16Q227 -16 173.5 16.5Q120 49 91 106.5Q62 164 61 239L171 245Q172 165 205 124Q238 83 298 83Q361 83 394.5 126Q428 169 428 250V710H536V250Q536 169 506.5 109Q477 49 424 16.5Q371 -16 298 -16Z"/><rect class="jm-c" x="656" y="0" width="330" height="100"/></g></svg><span>Joash<span class="surname"> Jobson</span></span></a>
        <nav class="toplinks" aria-label="Main">
          <a href=${PAGES.messages} aria-current=${route === 'messages' ? 'page' : null}>Messages</a>
          <a href=${PAGES.shave} aria-current=${route === 'shave' ? 'page' : null}>Shave game</a>
          <${ThemeToggle} />
        </nav>
      </div>
    </header>
    ${offline && html`<p class="offline" role="status">The leaderboard couldn't load just now. Refresh the page to try again.</p>`}
    <main>
      ${route === 'home' ? html`<${Home} boards=${boards} config=${config} />`
        : route === 'privacy' ? html`<${Privacy} />`
        : route === 'messages' ? html`<${Messages} api=${api} me=${me} onPosted=${apply} />`
        : route === 'video' ? html`<${MessageVideo} api=${api} config=${config} />`
        : html`<${WgsFundraiserSection} me=${me} boards=${boards} config=${config} actions=${actions} />`}
    </main>
    <footer><div class="wrap"><span>© 2026 Joash Jobson</span><span class="foot-links"><a href=${PAGES.privacy}>Privacy</a><a href=${FUNDRAISER.url} target="_blank" rel="noopener">Donate to my WGS</a></span></div></footer>`;
}

ReactDOM.createRoot(document.getElementById('root')).render(html`<${App} />`);
