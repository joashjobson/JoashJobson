const { useState, useEffect, useRef, useMemo, useCallback } = React;
const html = htm.bind(React.createElement);

// The artifact preview sets JJ_PREVIEW: it routes with #hash and keeps everything in memory.
// The live site has real pages (/ and /shave) and saves to the Worker at /api.
const PREVIEW = !!window.JJ_PREVIEW;
const PAGES = PREVIEW ? { home: '#home', shave: '#shave', privacy: '#privacy' } : { home: '/', shave: '/shave', privacy: '/privacy' };

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
  Short: {
    front: (x, y) => {
      const dx = x + .5 - 32, dy = y + .5 - 22, a = Math.atan2(dy, dx), R = 15.6 + 2.8 * tri(a / (2 * Math.PI) * 11 + .2);
      if (dx * dx + dy * dy > R * R) return false;
      const ax = Math.abs(dx), line = ax <= 12 ? 18.5 + 3.5 * tri((x - 13) / 6) : 29;
      return y < line && y < 31;
    }, cx: 32, cy: 21
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

// The head being shaved. Ranked runs and practice always use Joash; "Shave your avatar" swaps in the player's look.
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
const AUD = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 });
const reduceMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- Avatar maker: preset parts only, so nothing needs moderating ---------- */
function AvatarMaker({ look, onChange }) {
  const traits = [
    ['style', 'Hair', STYLES],
    ['hair', 'Hair colour', HAIR_COLS.map(t => t.name)],
    ['skin', 'Skin', SKIN_TONES.map(t => t.name)],
    ['eyes', 'Eyes', EYE_COLS.map(t => t.name)],
    ['face', 'Face', FACES],
    ['shirt', 'Shirt', SHIRTS.map(t => t.name)],
    ['extra', 'Extra', EXTRAS]
  ];
  const step = (key, n, len) => onChange({ ...look, [key]: (look[key] + n + len) % len });
  const shuffle = () => { const l = {}; for (const [k, , opts] of traits) l[k] = Math.floor(Math.random() * opts.length); onChange(l); };
  return html`
    <div class="maker">
        <div class="maker-left">
          <${PixelAvatar} look=${look} size=${128} label="Your avatar preview" className="maker-preview" />
          <button type="button" class="linkbtn" id="avatar-shuffle" onClick=${shuffle}>Shuffle</button>
        </div>
        <div class="traits">
          ${traits.map(([key, label, opts]) => html`
            <div class="trait" key=${key}>
              <span class="tlabel">${label}</span>
              <div class="stepper">
                <button type="button" id=${'prev-' + key} aria-label=${'Previous ' + label.toLowerCase()} onClick=${() => step(key, -1, opts.length)}>‹</button>
                <span class="tval">${opts[look[key]]}</span>
                <button type="button" id=${'next-' + key} aria-label=${'Next ' + label.toLowerCase()} onClick=${() => step(key, 1, opts.length)}>›</button>
              </div>
            </div>`)}
        </div>
    </div>`;
}

/* ---------- 1. Pixel-shaving game ---------- */
function ShaveGame({ tokens, freeLeft, rankedLeft = 0, ownLeft = 0, onStart, onWin, playerName, look, savedBest }) {
  const stageRef = useRef(null), canvasRef = useRef(null);
  const G = useRef(null);
  const [phase, setPhase] = useState('idle');    // idle | playing | won
  const [mode, setMode] = useState('practice');  // practice | ranked
  const [hud, setHud] = useState({ t: 0, pct: 0, eff: 1 });
  const [best, setBest] = useState(null);
  const [result, setResult] = useState(null);
  const [name, setName] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

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

  // One token buys a ranked run on Joash plus a run on your own avatar. Everyone also gets one free run (practice or their own avatar).
  const canRanked = rankedLeft > 0 || tokens > 0, canOwn = freeLeft || ownLeft > 0 || tokens > 0;
  async function start(m) {
    if (busy) return;
    if (m === 'own' && !hasHair(look)) return;
    if ((m === 'ranked' && !canRanked) || (m === 'own' && !canOwn)) return;
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
            <p>Hold and drag to run the clippers. One token gets you a ranked run on Joash, which can go on the board, plus a run on your own avatar.${freeLeft ? ' Your first run is free, on Joash or your own avatar.' : ''}</p>
            <div class="btns">
              <button class="btn hot" id="play-ranked" disabled=${!canRanked || busy} onClick=${() => start('ranked')}>Ranked run · ${rankedLeft > 0 ? 'paid' : '1 token'}</button>
              ${freeLeft && html`<button class="btn ghost" id="play-practice" disabled=${busy} onClick=${() => start('practice')}>Free practice</button>`}
              <button class="btn ghost" id="play-own" disabled=${!hasHair(look) || busy || !canOwn} onClick=${() => start('own')}>Shave your avatar · ${freeLeft ? 'free' : ownLeft > 0 ? 'paid' : '1 token'}</button>
            </div>
            ${!hasHair(look) && html`<p>Your avatar is already bald. Pick a hairstyle to shave it.</p>`}
            ${rankedLeft > 0 && html`<p>You've got a ranked run on Joash already paid for.</p>`}
            ${ownLeft > 0 && html`<p>You've got a run on your own avatar already paid for.</p>`}
            ${!canRanked && html`<p>${freeLeft ? 'Upload a receipt to earn tokens for ranked runs.' : "You've used your free run. Upload a receipt to earn tokens."}</p>`}
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
            ${mode === 'practice' && html`<p>Practice runs don't go on the board.</p>`}
            ${mode === 'own' && html`<p>Just for fun. Avatar runs don't go on the board, because every hairstyle has a different amount of hair.</p>`}
            <div class="btns">
              <button class="btn ghost" onClick=${quit}>Play again</button>
            </div>
          </div></div>`}
      </div>
      <div class="gamebar">
        <span class="modechip">1P · ${phase === 'playing' ? (mode === 'ranked' ? 'Ranked run · Joash' : mode === 'own' ? 'Your avatar · for fun' : 'Practice · Joash') : 'Ranked runs are always on Joash'}</span>
        ${phase === 'playing' && html`<button class="linkbtn" onClick=${quit}>Quit run</button>`}
      </div>
      <ul class="rules">
        <li>The clock starts at your first cut and stops at 95% cleared.</li>
        <li>Slow, steady passes cut cleanly. Rushing bogs the clippers down.</li>
        <li>Thick hair on the crown takes more passes. The hair around the ears is the fiddly part.</li>
      </ul>
    </div>`;
}

// Send a small JPEG (long edge 1024px) so each receipt uploads fast and stays within the receipt checker's free limits.
function shrinkReceipt(file, maxEdge = 1024) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, maxEdge / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(b => b ? resolve(b) : reject(new Error('shrink failed')), 'image/jpeg', 0.8);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}
const AUD2 = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0, maximumFractionDigits: 2 });
const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

// Screenshots and photos are shrunk to a small JPEG. The receipt checker reads images only, so PDFs are turned away here.
async function prepareReceipt(file) {
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '')) throw new Error("PDFs can't be read. Open the receipt and upload a screenshot of it instead.");
  if (!/^image\//.test(file.type) && !/\.(heic|heif)$/i.test(file.name || '')) throw new Error('Choose a screenshot of your receipt.');
  try { return await shrinkReceipt(file); }
  catch (_) { throw new Error("This browser can't open that photo. Upload a screenshot of the receipt instead."); }
}

// Tokens: total donated divided by the token price, rounded to the nearest whole token (so $29 is 1 and $31 is 2).
const tokensFor = (dollars, price) => Math.floor(dollars / price + 0.5);

function Tokens({ me, price }) {
  const earned = tokensFor(me.donated, price);
  const toNext = (earned + 0.5) * price - me.donated;
  return html`
    <p class="tokbar" id="token-count">
      <span class="coin" aria-hidden="true"></span>
      <span>You have <b>${me.tokens}</b> token${me.tokens === 1 ? '' : 's'}</span>
      <span class="next">${me.donated === 0 ? `Donate $${price / 2} or more to earn your first.` : `${AUD2.format(me.donated)} donated. ${AUD2.format(toNext)} more earns the next one.`}</span>
      ${me.freeLeft && html`<span class="next">You also have 1 free run.</span>`}
      ${(me.rankedLeft > 0 || me.ownLeft > 0) && html`<span class="next">Plus ${me.rankedLeft > 0 ? 'a ranked run' : 'an avatar run'} already paid for.</span>`}
    </p>`;
}

const STATUS = { ok: ['Added', 'ok'], pending: ['In the queue', 'wait'], rejected: ['Not accepted', 'no'] };
function resultText(r) {
  if (r.status === 'ok') return `Added ${AUD2.format(r.amount)}${r.name ? ' from ' + r.name.replace(/\.$/, '') : ''}. You now have ${r.tokens} token${r.tokens === 1 ? '' : 's'}.`;
  if (r.status === 'pending') return "The receipt checker is busy, so your receipt is in the queue. It'll be checked automatically in the next few minutes and your tokens will show up here.";
  return r.reason || "This receipt wasn't accepted.";
}

function ReceiptUpload({ onUpload, receipts }) {
  const [state, setState] = useState({ phase: 'idle' });   // idle | checking | done | error
  const [over, setOver] = useState(false);
  const [pv, setPv] = useState({ amount: '25', to: 'joash' });   // preview only: stands in for what the receipt checker reads
  const fileRef = useRef(null);
  const busy = state.phase === 'checking';
  const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

  const handle = async (file) => {
    if (!file || busy) return;
    setState({ phase: 'checking' });
    try {
      const blob = await prepareReceipt(file);
      const result = await onUpload(blob, file.name || 'receipt.png', pv);
      setState({ phase: 'done', result });
    } catch (e) { setState({ phase: 'error', msg: e.message }); }
    if (fileRef.current) fileRef.current.value = '';
  };
  // Once a queued receipt has been checked, say how it went instead of "in the queue"
  let shown = state.phase === 'done' ? { status: state.result.status, text: resultText(state.result) } : null;
  if (shown && shown.status === 'pending' && receipts[0] && receipts[0].status !== 'pending') {
    const last = receipts[0];
    shown = last.status === 'ok'
      ? { status: 'ok', text: `Your receipt from the queue has been checked and ${AUD2.format(last.amount)} was added.` }
      : { status: 'rejected', text: `Your receipt from the queue wasn't accepted. ${last.reason || ''}`.trim() };
  }
  // Paste a screenshot anywhere on the page (Ctrl+V or Cmd+V)
  const handleRef = useRef(handle); handleRef.current = handle;
  useEffect(() => {
    const onPaste = (e) => { const f = e.clipboardData && e.clipboardData.files && e.clipboardData.files[0]; if (f) { e.preventDefault(); handleRef.current(f); } };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  return html`
    <div class="stepform">
      <label class=${'drop big' + (over ? ' over' : '') + (busy ? ' busy' : '')} for="receipt-file"
        onDragOver=${e => { e.preventDefault(); setOver(true); }} onDragLeave=${() => setOver(false)}
        onDrop=${e => { e.preventDefault(); setOver(false); handle(e.dataTransfer.files[0]); }}>
        <span class="drop-icon" aria-hidden="true"><i></i><i></i><i></i></span>
        <span class="drop-main">${busy ? 'Checking your receipt…' : touch ? 'Tap to add your receipt' : 'Add your receipt screenshot'}</span>
        <span class="drop-sub">${busy ? 'This takes a few seconds.' : touch ? 'Pick the screenshot straight from your photos.' : `Click to choose it, drag it here, or paste it with ${IS_MAC ? '⌘V' : 'Ctrl+V'}.`}</span>
        <input id="receipt-file" ref=${fileRef} type="file" accept="image/*" disabled=${busy} onChange=${e => handle(e.target.files[0])} />
      </label>
      ${state.phase === 'done' && html`<p class=${'result ' + shown.status} role="status">${shown.text}</p>`}
      ${state.phase === 'error' && html`<p class="err" role="alert">${state.msg}</p>`}
      ${PREVIEW && html`
        <p class="pvbar">
          <span>Preview only: there's no receipt checker here, so pretend the receipt is</span>
          <select aria-label="Who the pretend donation went to" value=${pv.to} onChange=${e => setPv({ ...pv, to: e.target.value })}>
            <option value="joash">for Joash</option><option value="other">for someone else</option><option value="blurry">too blurry to read</option><option value="fake">fake</option><option value="busy">sent while the checker is busy</option>
          </select>
          <span>for $</span><input aria-label="Pretend amount" type="number" min="1" step="1" value=${pv.amount} onInput=${e => setPv({ ...pv, amount: e.target.value })} />
        </p>`}
      ${receipts.length > 0 && html`
        <ul class="receipts" aria-label="Your receipts">
          ${receipts.map((r, i) => html`<li key=${i}>
            <span>${r.amount != null ? AUD2.format(r.amount) : 'Receipt'} · ${new Date(r.when).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</span>
            <span class=${'chip ' + STATUS[r.status][1]} title=${r.reason || ''}>${STATUS[r.status][0]}</span>
          </li>`)}
        </ul>`}
    </div>`;
}

/* ---------- Leaderboards ---------- */
function Leaderboard({ boards, sample }) {
  const [tab, setTab] = useState('donors');
  const rows = tab === 'donors' ? boards.donors : boards.shavers;
  const keyTab = (e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') setTab(tab === 'donors' ? 'shavers' : 'donors'); };
  return html`
    <div class="board">
      <div class="boardhead">
        <div class="tabs" role="tablist" onKeyDown=${keyTab}>
          <button role="tab" id="tab-donors" aria-selected=${tab === 'donors'} tabIndex=${tab === 'donors' ? 0 : -1} onClick=${() => setTab('donors')}>Top Donors</button>
          <button role="tab" id="tab-shavers" aria-selected=${tab === 'shavers'} tabIndex=${tab === 'shavers' ? 0 : -1} onClick=${() => setTab('shavers')}>Fastest Shavers</button>
        </div>
        ${sample && html`<span class="chip sample">Sample entries</span>`}
      </div>
      ${rows.length === 0
        ? html`<p class="empty">${tab === 'donors' ? 'No donations yet. Yours could be the first.' : 'No ranked times yet. Be the first on the board.'}</p>`
        : html`<ol class="rows" role="tabpanel" aria-labelledby=${'tab-' + tab}>
          ${rows.map((r, i) => html`
            <li key=${tab + i} class=${r.me ? 'me' : ''}>
              <span class="rank">${String(i + 1).padStart(2, '0')}</span>
              <${PixelAvatar} look=${r.look} size=${40} label=${r.name + "'s avatar"} />
              <span class="who">${r.name}${r.me && html`<span class="youtag">YOU</span>`}</span>
              <span class="val">${tab === 'donors' ? AUD.format(r.amount) : fmtTime(r.secs) + 's'}</span>
            </li>`)}
        </ol>`}
    </div>`;
}

function MiniBoards({ boards, sample }) {
  const list = (rows, val, none) => rows.length === 0 ? html`<p class="empty">${none}</p>` : html`<ol class="mini">${rows.slice(0, 3).map((r, i) => html`
    <li key=${i} class=${r.me ? 'me' : ''}><span class="rank">${i + 1}</span><${PixelAvatar} look=${r.look} size=${28} label=${r.name + "'s avatar"} /><span class="who">${r.name}</span><span class="val">${val(r)}</span></li>`)}</ol>`;
  return html`
    <section class="minis" aria-label="Leaderboards">
      <div><h3 class="mini-h">Fastest shaves</h3>${list(boards.shavers, r => fmtTime(r.secs) + 's', 'No times yet.')}</div>
      <div><h3 class="mini-h">Top donors</h3>${list(boards.donors, r => AUD.format(r.amount), 'No donations yet.')}</div>
      <p class="mini-foot">${sample ? html`<span class="chip sample">Sample entries</span>` : html`<span></span>`}<a href=${PAGES.shave}>Full leaderboard →</a></p>
    </section>`;
}

/* ---------- The shave page ---------- */
function WgsFundraiserSection({ me, boards, config, actions }) {
  const price = config.tokenPrice;
  const [nameDraft, setNameDraft] = useState(me.name);
  useEffect(() => { setNameDraft(me.name); }, [me.name]);
  const saveName = () => { const n = nameDraft.trim(); if (n && n !== me.name) actions.setName(n).catch(() => setNameDraft(me.name)); };
  const toGame = () => document.getElementById('step-shave').scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth' });
  const donate = html`<a href=${FUNDRAISER.url} target="_blank" rel="noopener">my WGS page</a>`;

  return html`
    <div class="shave" id="shave">
      <header class="shave-head">
        <p class="eyebrow"><span class="bits"><span class="px o"></span><span class="px t"></span><span class="px l"></span></span>World's Greatest Shave</p>
        <h1 class="name">How fast can you <em>shave my head?</em></h1>
        <p class="lede">I'm shaving my head for World's Greatest Shave to raise money for people living with blood cancer. Donate, and every $${price} gets you a timed go at shaving the pixel version of me, plus a go at shaving your own avatar.</p>
        <div class="head-ctas">
          <a class="pbtn" href=${FUNDRAISER.url} target="_blank" rel="noopener">Donate to my WGS</a>
          <button type="button" class="textlink" onClick=${toGame}>Skip to the game ↓</button>
        </div>
      </header>

      <section class="step" aria-labelledby="step-1">
        <h2 class="step-h" id="step-1"><span class="step-n">01</span>Donate on my WGS page</h2>
        <ul class="points">
          <li><span>Open ${donate} and give any amount. Donations go to the Leukaemia Foundation.</span></li>
          <li><span>Every <strong>$${price} AUD</strong> earns you one token, rounded to the nearest token. $${price * 1.5 - 1} gets you one token and $${price * 1.5 + 1} gets you two.</span></li>
          <li><span>World's Greatest Shave emails you a receipt straight away. Keep it for the next step.</span></li>
        </ul>
        <div class="donate-row">
          <a class="donate-url" href=${FUNDRAISER.url} target="_blank" rel="noopener">${FUNDRAISER.url.replace(/^https?:\/\/(www\.)?/, '')} ↗</a>
        </div>
      </section>

      <section class="step" aria-labelledby="step-2">
        <h2 class="step-h" id="step-2"><span class="step-n">02</span>Upload your receipt</h2>
        <ul class="points">
          <li><span>Screenshot the receipt email or the thank-you page. Make sure <strong>my name, the amount and the receipt number</strong> are in the shot.</span></li>
          <li><span>Add it below. On a phone, tap the box and pick the screenshot from your photos. On a computer, drag it in or paste it. There's nothing to type.</span></li>
          <li><span>It's checked automatically in a few seconds to make sure it's a real receipt for a donation to my page, then your tokens are added. Each receipt only counts once.</span></li>
          <li><span>If the checker is busy, your receipt waits in a queue and is checked automatically a few minutes later. You don't need to do anything.</span></li>
          <li><span>If it isn't accepted, you'll see why straight away. Usually a clearer screenshot of the whole receipt fixes it.</span></li>
        </ul>
        <${Tokens} me=${me} price=${price} />
        <${ReceiptUpload} receipts=${me.receipts} onUpload=${actions.upload} />
      </section>

      <section class="step" aria-labelledby="step-3">
        <h2 class="step-h" id="step-3"><span class="step-n">03</span>Make your avatar</h2>
        <ul class="points">
          <li><span>Your avatar and name sit next to your entries on both leaderboards.</span></li>
          <li><span>Use the arrows to pick a hairstyle, hair colour, skin, eyes, face, shirt and an extra, or press Shuffle. Change it whenever you like.</span></li>
        </ul>
        <${AvatarMaker} look=${me.look} onChange=${actions.setLook} />
        <label class="namefield" for="lb-name">Name on the leaderboard
          <input id="lb-name" type="text" maxlength="24" value=${nameDraft} placeholder="Taken from your receipt if you leave it"
            onInput=${e => setNameDraft(e.target.value)} onBlur=${saveName} onKeyDown=${e => { if (e.key === 'Enter') e.target.blur(); }} />
        </label>
      </section>

      <section class="step" id="step-shave" aria-labelledby="step-4">
        <h2 class="step-h" id="step-4"><span class="step-n">04</span>Shave my head</h2>
        <ul class="points">
          <li><span>Each token gets you <strong>two runs</strong>: a ranked run on pixel me, whose time can go on the leaderboard, and a run shaving your own avatar.</span></li>
          <li><span>Hold and drag to run the clippers. On a phone, press and drag with your finger.</span></li>
          <li><span>The clock starts at your first cut and stops when 95% of the hair is gone.</span></li>
          <li><span>Everyone gets <strong>one free run</strong>, either a practice on me or shaving your own avatar. Free runs don't go on the board.</span></li>
        </ul>
        <${ShaveGame} tokens=${me.tokens} freeLeft=${me.freeLeft} rankedLeft=${me.rankedLeft} ownLeft=${me.ownLeft} look=${me.look} playerName=${me.name} savedBest=${me.best}
          onStart=${actions.start} onWin=${actions.finish} />
      </section>

      <section class="step" aria-labelledby="step-5">
        <h2 class="step-h" id="step-5"><span class="step-n">05</span>Climb the leaderboard</h2>
        <ul class="points">
          <li><span><strong>Fastest Shavers</strong> shows each person's best ranked time.</span></li>
          <li><span><strong>Top Donors</strong> adds up every receipt you upload.</span></li>
        </ul>
        <${Leaderboard} boards=${boards} sample=${config.sample} />
      </section>
    </div>`;
}

/* ---------- Saving: the Worker on the live site, memory in the preview ---------- */
// Joash's World's Greatest Shave page. Every donate link on the site uses it.
const FUNDRAISER = { url: 'https://www.worldsgreatestshave.com/fundraisers/joashj' };
const START_LOOK = { skin: 2, hair: 1, style: 5, eyes: 2, face: 1, shirt: 1, extra: 0 };
const EMPTY_ME = { name: '', look: START_LOOK, donated: 0, tokens: 0, freeLeft: true, rankedLeft: 0, ownLeft: 0, best: null, receipts: [] };

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
    upload: (blob, filename) => { const fd = new FormData(); fd.append('player', player); fd.append('file', blob, filename); return call('receipt', { method: 'POST', body: fd }); },
    profile: (p) => post('profile', p),
    start: (mode) => post('run/start', { mode }),
    finish: (o) => post('run/finish', o)
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
const SAMPLE_DONORS = [['Priya S.', 250], ['Tom W.', 180], ['Ana L.', 120], ['Ben K.', 60], ['Mei C.', 40]].map(([name, amount]) => ({ name, amount, look: SAMPLE_LOOKS[name] }));
const SAMPLE_TIMES = [['Tom W.', 38.42], ['Ana L.', 44.07], ['Priya S.', 51.9], ['Ben K.', 63.15], ['Mei C.', 79.6]].map(([name, secs]) => ({ name, secs, look: SAMPLE_LOOKS[name] }));

function LocalAPI() {
  const price = 20;
  const p = { name: '', look: START_LOOK, cents: 0, spent: 0, freeUsed: false, rankedLeft: 0, ownLeft: 0, bestMs: null, receipts: [], runs: {} };
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const view = () => {
    const tokens = Math.max(0, tokensFor(p.cents / 100, price) - p.spent);
    const me = { name: p.name, look: p.look, donated: p.cents / 100, tokens, freeLeft: !p.freeUsed, rankedLeft: p.rankedLeft, ownLeft: p.ownLeft, best: p.bestMs == null ? null : p.bestMs / 1000, receipts: p.receipts.slice().reverse() };
    const you = { name: p.name || 'You', look: p.look, me: true };
    const donors = [...SAMPLE_DONORS, ...(p.cents > 0 ? [{ ...you, amount: p.cents / 100 }] : [])].sort((a, b) => b.amount - a.amount).slice(0, 10);
    const shavers = [...SAMPLE_TIMES, ...(p.bestMs != null ? [{ ...you, secs: p.bestMs / 1000 }] : [])].sort((a, b) => a.secs - b.secs).slice(0, 10);
    return { me, boards: { donors, shavers }, config: { tokenPrice: price, sample: true } };
  };
  return {
    load: async () => view(),
    upload: async (blob, filename, pv) => {
      await wait(900);
      const amount = Math.round(parseFloat(pv.amount) * 100) / 100;
      let result;
      if (pv.to === 'other') result = { status: 'rejected', reason: "This receipt is for a different fundraiser. Only donations to Joash's page count." };
      else if (pv.to === 'fake') result = { status: 'rejected', reason: "This doesn't look like a genuine World's Greatest Shave receipt, so it can't be counted." };
      else if (pv.to === 'busy' && amount > 0) {
        // Stands in for the queue: "checked" a few seconds later
        result = { status: 'pending' };
        const entry = { amount: null, status: 'pending', reason: null, when: Date.now() };
        setTimeout(() => { entry.status = 'ok'; entry.amount = amount; p.cents += Math.round(amount * 100); if (!p.name) p.name = 'Sam L.'; }, 6000);
        p.receipts.push(entry);
        const v = view();
        return { ...v, result: { ...result, tokens: v.me.tokens } };
      }
      else if (pv.to === 'blurry' || !(amount > 0)) result = { status: 'rejected', reason: "We couldn't read that screenshot. Try a clear, uncropped one that shows Joash's name, the amount and the receipt number." };
      else {
        p.cents += Math.round(amount * 100);
        if (!p.name) p.name = 'Sam L.';
        result = { status: 'ok', amount, name: 'Sam L.' };
      }
      p.receipts.push({ amount: result.status === 'ok' ? amount : null, status: result.status, reason: result.reason, when: Date.now() });
      const v = view();
      return { ...v, result: { ...result, tokens: v.me.tokens } };
    },
    profile: async ({ look, name }) => { if (look) p.look = look; if (name) p.name = name.slice(0, 24); return view(); },
    start: async (mode) => {
      const tokens = view().me.tokens;
      const spend = (other) => { if (tokens < 1) throw new Error('You need a token for that. Upload a receipt to earn one.'); p.spent++; p[other]++; };
      if (mode === 'ranked') { if (p.rankedLeft > 0) p.rankedLeft--; else spend('ownLeft'); }
      else if (mode === 'own' && p.freeUsed) { if (p.ownLeft > 0) p.ownLeft--; else spend('rankedLeft'); }
      else if (p.freeUsed) throw new Error("You've already used your free practice.");
      else p.freeUsed = true;
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
    }
  };
}

/* ---------- Site ---------- */
// The donate tile: Joash's portrait shaves itself, and you can shave it by moving over it. The hair grows back.
function DonateTile({ price }) {
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
      path.push(dir > 0 ? [x0, y] : [x1 + 1, y], dir > 0 ? [x1 + 1, y] : [x0, y]); dir = -dir;
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
        const [ax, ay] = path[seg], [bx, by] = path[Math.min(seg + 1, path.length - 1)];
        const len = Math.hypot(bx - ax, by - ay) || 1;
        t += dt * 46 / len;
        if (t >= 1) { t -= 1; seg++; }
        if (seg >= path.length - 1) { mode = 'pause'; idle = 0; }
        else { clip = [ax + (bx - ax) * t, ay + (by - ay) * t]; cut(clip[0], clip[1], 90 * dt); }
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
        ctx.fillStyle = '#14161F'; ctx.fillRect(bx, by + 3, 4, 6);
        ctx.fillStyle = '#C2B02E'; ctx.fillRect(bx + 1, by + 3, 2, 5);
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
    <section class="tile" aria-labelledby="tile-title">
      <div class="tile-copy">
        <p class="tile-eyebrow"><span class="px l"></span>World's Greatest Shave</p>
        <h2 id="tile-title">Donate to my <em>WGS</em></h2>
        <p class="tile-text">Every $${price} earns a token to take the clippers to my pixel head. ${canHover ? 'Move over me to try.' : 'Drag across me to try.'}</p>
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
      <canvas ref=${ref} class="tile-art" width=${N} height=${N} role="img" aria-label="Pixel Joash getting his hair clipped"></canvas>
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

function Home({ boards, config }) {
  return html`
    <div class="simple">
      <h1 class="name">Hi, I'm <em>Joash.</em></h1>
      <${DonateTile} price=${config.tokenPrice} />
      <${MiniBoards} boards=${boards} sample=${config.sample} />
    </div>`;
}

// Privacy policy (/privacy). Keep it in step with what src/worker.js actually stores.
function Privacy() {
  const sec = (title, ...body) => html`<section class="policy-sec"><h2 class="policy-h">${title}</h2>${body}</section>`;
  return html`
    <div class="simple policy">
      <div>
        <p class="eyebrow">Last updated 26 October 2026</p>
        <h1 class="name">Privacy</h1>
      </div>
      <p class="lede">This site raises money for Joash Jobson's World's Greatest Shave. It keeps as little about you as it can. Here's exactly what that is.</p>
      ${sec('No accounts, no tracking',
        html`<p>There's no sign-up, no ads and no analytics. The first time you visit, your browser makes a random ID (a string of letters and numbers) and keeps it on your device. That's how the site remembers your tokens and times. Your browser also remembers whether you picked the light or dark theme. Neither is a cookie, and clearing your browser's site data removes both.</p>`)}
      ${sec('Receipts',
        html`<p>When you upload a receipt, the screenshot is sent to <a class="textlink" href="https://groq.com" target="_blank" rel="noopener">Groq</a>, an AI service, which reads who the donation went to, the amount, the receipt number, the date and the donor's name. Groq doesn't use it to train AI. Groq may keep a temporary log for up to 30 days to investigate abuse, unless that's turned off in its settings.</p>`,
        html`<p>The screenshot itself isn't kept. If the checker is busy, it waits in a queue and is deleted as soon as it's been checked. The site keeps what was read from it: the amount, receipt number, donor name, who it went to and whether it was accepted, so a receipt can't be counted twice.</p>`)}
      ${sec('The leaderboard',
        html`<p>Your leaderboard name is the one you choose, or your first name and last initial from your receipt (like "Sam L."). Full names are never shown publicly. The leaderboards show that name, your avatar, your total donated and your best shave time.</p>`)}
      ${sec('Who sees what',
        html`<p>Everyone can see the leaderboards. Joash can see the details read from each receipt on his admin page, and gets an email with the name, amount and receipt number when a donation is added. Nobody else gets your information, and it's never sold.</p>`)}
      ${sec('Where it\'s kept',
        html`<p>Everything is stored with Cloudflare, which runs the site. To stop floods of uploads, your IP address is turned into a code that can't be reversed and kept for a day. Cloudflare's own logs of visits are kept for a few days. Fonts are loaded from Google Fonts, so Google sees your IP address when the page loads. Emails to Joash are sent with Resend.</p>`)}
      ${sec('Removing your information',
        html`<p>Ask Joash and he'll delete everything the site holds about you: your name, avatar, times and receipt details. Any tokens you had go with it.</p>`)}
    </div>`;
}

// Three pages: home, the shave game and privacy. The live site serves them as /, /shave and /privacy; the preview uses #hashes.
function useRoute() {
  const get = () => PREVIEW ? ({ '#shave': 'shave', '#privacy': 'privacy' }[location.hash] || 'home') : (document.body.dataset.page || 'home');
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
  const [boards, setBoards] = useState({ donors: [], shavers: [] });
  const [config, setConfig] = useState({ tokenPrice: 20, sample: PREVIEW });
  const [offline, setOffline] = useState(false);
  const apply = useCallback((d) => {
    if (d.me) setMe(d.me);
    if (d.boards) setBoards(d.boards);
    if (d.config) setConfig(c => ({ ...c, ...d.config }));
    return d;
  }, []);
  useEffect(() => { api.load().then(apply, () => setOffline(true)); }, []);
  // While a receipt waits in the queue, check back every minute so its tokens show up without a refresh
  const queued = me.receipts.some(r => r.status === 'pending');
  useEffect(() => {
    if (!queued) return;
    const t = setInterval(() => api.load().then(apply, () => {}), PREVIEW ? 3000 : 60000);
    return () => clearInterval(t);
  }, [queued]);

  // Avatar changes show straight away and save half a second after the last click.
  const lookTimer = useRef(null);
  const actions = useMemo(() => ({
    upload: async (blob, filename, pv) => apply(await api.upload(blob, filename, pv)).result,
    setLook: (look) => {
      setMe(m => ({ ...m, look }));
      clearTimeout(lookTimer.current);
      lookTimer.current = setTimeout(() => api.profile({ look }).then(apply, () => {}), 500);
    },
    setName: async (name) => apply(await api.profile({ name })),
    start: async (mode) => apply(await api.start(mode)),
    finish: async (o) => apply(await api.finish(o))
  }), [api, apply]);

  return html`
    <header class=${'topbar' + (route === 'shave' ? ' wide' : '')}>
      <div class="topbar-in">
        <a href=${PAGES.home} class="home-link"><${PixelAvatar} look=${JOASH} size=${28} label="" />Joash Jobson</a>
        <nav class="toplinks" aria-label="Main">
          <a href=${PAGES.shave} aria-current=${route === 'shave' ? 'page' : null}>Shave</a>
          <${ThemeToggle} />
        </nav>
      </div>
    </header>
    ${offline && html`<p class="offline" role="status">The leaderboard couldn't load just now. Refresh the page to try again.</p>`}
    <main>
      ${route === 'home' ? html`<${Home} boards=${boards} config=${config} />`
        : route === 'privacy' ? html`<${Privacy} />`
        : html`<${WgsFundraiserSection} me=${me} boards=${boards} config=${config} actions=${actions} />`}
    </main>
    <footer><div class="wrap"><span>© 2026 Joash Jobson</span><span class="foot-links"><a href=${PAGES.privacy}>Privacy</a><a href=${FUNDRAISER.url} target="_blank" rel="noopener">Donate to my WGS</a></span></div></footer>`;
}

ReactDOM.createRoot(document.getElementById('root')).render(html`<${App} />`);
