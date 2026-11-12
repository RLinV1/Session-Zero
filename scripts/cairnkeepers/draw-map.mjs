/* global document */
/**
 * Draws one Cairnkeepers map on a canvas and returns it as a PNG data URL. It runs inside the
 * browser page (render-maps.mjs serialises it with toString), so it uses nothing from outside its
 * own body. Style: a surveyor's field sheet coloured in: snow and rock with ink edges, contour lines
 * on the slopes, clear blue ice.
 *
 * `a` = { grid, cols, rows, cell, props, kind, seed, portals, keys, mode, terrain, fog }
 * mode "art" draws the map; "key" adds the grid, the terrain (hatched), the obscuring fog, the
 * doors and windows, and the area numbers, for the GM.
 */
export function drawMap(a) {
  const { grid, cols, rows, cell: S, props, kind, seed, portals, keys, mode } = a;
  const W = cols * S, H = rows * S;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");
  const INK = "#1c2229";
  const outdoor = kind === "outdoor", cave = kind === "cave", indoor = kind === "indoor";

  // ---------- randomness and noise (seeded, so a re-render is identical) ----------
  let st = seed >>> 0;
  const rnd = () => {
    st = (st + 0x6d2b79f5) | 0;
    let t = Math.imul(st ^ (st >>> 15), 1 | st);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rr = (lo, hi) => lo + rnd() * (hi - lo);
  const hash = (x, y) => {
    let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  const sm = (t) => t * t * (3 - 2 * t);
  const vnoise = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), u = sm(x - xi), v = sm(y - yi);
    const p = hash(xi, yi), q = hash(xi + 1, yi), r = hash(xi, yi + 1), s = hash(xi + 1, yi + 1);
    return p + (q - p) * u + (r - p) * v + (p - q - r + s) * u * v;
  };
  const fbm = (x, y, o = 4) => {
    let s = 0, amp = 0.5, f = 1, n = 0;
    for (let i = 0; i < o; i++) { s += amp * vnoise(x * f, y * f); n += amp; amp *= 0.5; f *= 2.03; }
    return s / n;
  };
  const clamp01 = (x) => Math.max(0, Math.min(1, x));

  // ---------- colour helpers ----------
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const css = (c, al = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${al})`;
  const mixc = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
  const shade = (c, k) => c.map((v) => Math.max(0, Math.min(255, v * k)));

  // ---------- the grid ----------
  const inb = (c, r) => c >= 0 && r >= 0 && c < cols && r < rows;
  const raw = (c, r) => grid[Math.min(rows - 1, Math.max(0, r))][Math.min(cols - 1, Math.max(0, c))];
  const isSolid = (ch) => "X#oI".includes(ch);
  const isPortal = (ch) => ch === "D" || ch === "L" || ch === "w";
  const DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0]];
  // A portal or pillar square is drawn with the ground of its open neighbour.
  const G = grid.map((row, r) => [...row].map((ch, c) => {
    if (!isPortal(ch) && ch !== "o") return ch;
    for (const [dc, dr] of DIRS) {
      if (!inb(c + dc, r + dr)) continue;
      const n = grid[r + dr][c + dc];
      if (!isSolid(n) && !isPortal(n)) return n;
    }
    return cave ? "c" : ":";
  }));
  // What lies around a crevasse or open water: the ground drawn under it before it's cut in.
  const under = grid.map((row, r) => [...row].map((ch, c) => {
    if (ch !== "V" && ch !== "~") return null;
    const count = {};
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
      const n = inb(c + dc, r + dr) ? grid[r + dr][c + dc] : null;
      if (n && !"V~XIo#DLw=s".includes(n)) count[n] = (count[n] ?? 0) + 1;
    }
    return Object.entries(count).sort((p, q) => q[1] - p[1])[0]?.[0] ?? (cave ? "c" : "*");
  }));
  const g = (c, r) => G[Math.min(rows - 1, Math.max(0, r))][Math.min(cols - 1, Math.max(0, c))];
  const cellsWhere = (pred) => { const out = []; for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (pred(g(c, r), c, r)) out.push([c, r]); return out; };
  const clipCells = (cells) => { ctx.beginPath(); for (const [c, r] of cells) ctx.rect(c * S - 0.5, r * S - 0.5, S + 1, S + 1); ctx.clip(); };
  const shadowOn = (blur = 10, ox = 5, oy = 7, al = 0.35) => { ctx.shadowColor = `rgba(20,30,45,${al})`; ctx.shadowBlur = blur; ctx.shadowOffsetX = ox; ctx.shadowOffsetY = oy; };
  const shadowOff = () => { ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0; };
  const blob = (cx, cy, rad, n = 9, wob = 0.35) => {
    const pts = [];
    for (let i = 0; i < n; i++) { const t = (i / n) * Math.PI * 2; const r2 = rad * (1 - wob / 2 + rnd() * wob); pts.push([cx + Math.cos(t) * r2, cy + Math.sin(t) * r2]); }
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const p = pts[i], q = pts[(i + 1) % n], m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
      if (i === 0) ctx.moveTo(m[0], m[1]); else ctx.quadraticCurveTo(p[0], p[1], m[0], m[1]);
    }
    const p = pts[0], q = pts[1];
    ctx.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
    ctx.closePath();
  };

  // Shapes cut on the grid: every vertex of a square is moved by one smooth displacement field, so
  // neighbouring squares share their edges exactly and only the outline facing open ground looks
  // rough. Walls stay on the square edges; the art strays from them by a few pixels at most.
  const amp = (ch) => (ch === "#" ? 0 : ch === "I" ? S * 0.09 : ch === "V" || ch === "~" ? S * 0.15 : cave ? S * 0.26 : S * 0.16);
  const disp = (x, y, a2) => a2
    ? [x + (fbm(x / 47 + 5, y / 47, 3) - 0.5) * 5 * a2 + (vnoise(x / 14, y / 14) - 0.5) * a2 * 0.9,
      y + (fbm(x / 47, y / 47 + 9, 3) - 0.5) * 5 * a2 + (vnoise(x / 14 + 3, y / 14 + 5) - 0.5) * a2 * 0.9]
    : [x, y];
  const N = 7;
  const sidePts = (x0, y0, x1, y1, a2) => { const out = []; for (let i = 0; i < N; i++) out.push(disp(x0 + (x1 - x0) * i / N, y0 + (y1 - y0) * i / N, a2)); return out; };
  const cellPoly = (c, r, a2) => {
    const x = c * S, y = r * S;
    return [...sidePts(x, y, x + S, y, a2), ...sidePts(x + S, y, x + S, y + S, a2), ...sidePts(x + S, y + S, x, y + S, a2), ...sidePts(x, y + S, x, y, a2)];
  };
  const tracePolys = (cells, a2) => { ctx.beginPath(); for (const [c, r] of cells) { const p = cellPoly(c, r, a2); ctx.moveTo(p[0][0], p[0][1]); for (const q of p.slice(1)) ctx.lineTo(q[0], q[1]); ctx.closePath(); } };
  const edgesOf = (cells, set) => {
    const out = [];
    for (const [c, r] of cells) for (const [dc, dr] of DIRS) {
      const n = raw(c + dc, r + dr);
      if (inb(c + dc, r + dr) && !set.includes(n)) out.push([c, r, dc, dr]);
    }
    return out;
  };
  const edgePts = ([c, r, dc, dr], a2) => {
    const x = c * S, y = r * S;
    const [x0, y0, x1, y1] = dr < 0 ? [x, y, x + S, y] : dr > 0 ? [x, y + S, x + S, y + S] : dc < 0 ? [x, y, x, y + S] : [x + S, y, x + S, y + S];
    return [...sidePts(x0, y0, x1, y1, a2), disp(x1, y1, a2)];
  };
  const strokeEdges = (edges, a2, style, lw) => {
    ctx.strokeStyle = style; ctx.lineWidth = lw; ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.beginPath();
    for (const e of edges) { const pts = edgePts(e, a2); ctx.moveTo(pts[0][0], pts[0][1]); for (const q of pts.slice(1)) ctx.lineTo(q[0], q[1]); }
    ctx.stroke();
  };

  const C = {
    snow: hex("#eef3f6"), snowShade: hex("#b9c7d3"), trail: hex("#d8dfe3"), rut: hex("#b3aca0"),
    scree: hex("#cfd3d5"), stone: hex("#7d7a73"), water: hex("#4d6f86"), deepWater: hex("#18323f"),
    thinIce: hex("#9fcbe0"), thickIce: hex("#c9e2ee"), crev: hex("#0e1c29"), crevLip: hex("#6f97b2"),
    scrub: hex("#dfe4e2"), flag: hex("#8d8c87"), boards: hex("#7b5b40"), caveFloor: hex("#4f5f6e"),
    caveDark: hex("#171c23"), rock: hex("#76736d"), rockDark: hex("#4f4c48"), masonry: hex("#4b4e54"),
    ice: hex("#86bcd8"), pine: hex("#2f4a3a"), pineDark: hex("#1d3127"),
  };

  // ---------- 1. ground, per pixel ----------
  // Natural ground blends across square edges (each pixel reads a nearby square through a noise
  // warp); floors indoors stay crisp. Solid squares are painted over later.
  const soft = !indoor;
  const warp = soft ? S * 1.7 : 0;
  const img = ctx.createImageData(W, H);
  const px = img.data;
  const height = (x, y) => fbm(x / 430 + 11, y / 430 + 7, 3) * 1.5 - (y / H) * 1.3 + (x / W) * 0.2;
  const ground = (c, r) => { const ch = g(c, r); return ch === "V" || ch === "~" ? under[Math.min(rows - 1, Math.max(0, r))][Math.min(cols - 1, Math.max(0, c))] : ch; };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let ch = ground(Math.floor(x / S), Math.floor(y / S));
      if (warp && !isSolid(ch)) {
        const wx = x + (fbm(x / 70, y / 70, 3) - 0.5) * warp + (vnoise(x / 13, y / 13) - 0.5) * 8;
        const wy = y + (fbm(x / 70 + 31, y / 70 + 17, 3) - 0.5) * warp + (vnoise(x / 13 + 7, y / 13) - 0.5) * 8;
        const wc = ground(Math.floor(wx / S), Math.floor(wy / S));
        if (!isSolid(wc) && wc !== "=" && wc !== "s" && ch !== "=" && ch !== "s") ch = wc;
      }
      const n = fbm(x / 110, y / 110, 3), f = vnoise(x / 5, y / 5);
      let col;
      switch (ch) {
        case ".": col = outdoor ? mixc(C.trail, C.rut, 0.18 + clamp01((fbm(x / 18, y / 40, 2) - 0.42) * 2.4) * 0.6) : C.flag; col = shade(col, 0.96 + n * 0.08); break;
        case "*": {
          const ripple = Math.sin(x * 0.045 + y * 0.018 + fbm(x / 140, y / 140, 2) * 9) * 0.5 + 0.5;
          col = mixc(C.snow, C.snowShade, clamp01(n * 0.85 - 0.15 + ripple * 0.12)); break;
        }
        case "^": col = mixc(C.scree, C.stone, f > 0.78 ? 0.75 : f > 0.62 ? 0.32 : 0.05); col = shade(col, 0.92 + n * 0.12); break;
        case "-": col = mixc(C.water, hex("#7fa4b9"), clamp01(Math.sin(y * 0.09 + x * 0.03 + n * 14) * 0.5 + 0.2)); break;
        case "i": col = mixc(C.thinIce, hex("#e4f1f7"), clamp01(fbm(x / 40, y / 40, 3) * 1.4 - 0.55)); break;
        case "e": col = mixc(C.thickIce, hex("#f1f7fa"), clamp01(fbm(x / 50, y / 50, 3) * 1.4 - 0.5)); break;
        case "~": col = mixc(C.deepWater, hex("#2d5a70"), clamp01(Math.sin(x * 0.07 + n * 10) * 0.25 + n * 0.5)); break;
        case "V": col = mixc(C.crev, hex("#1d3346"), n * 0.6); break;
        case "r": col = cave ? mixc(C.caveFloor, C.stone, 0.4) : mixc(C.flag, C.stone, 0.5); break;
        case "b": col = mixc(C.scrub, C.snowShade, n * 0.6); break;
        case "p": col = mixc(C.snowShade, C.snow, 0.35 + n * 0.3); break;
        case ":": col = cave ? C.caveFloor : C.flag; break;
        case "_": col = C.boards; break;
        case "d": col = indoor ? C.flag : C.snow; break;
        case "c": case "v": col = mixc(C.caveFloor, C.caveDark, clamp01(n * 1.3 - 0.3)); col = mixc(col, hex("#8fa6b8"), f > 0.86 ? 0.35 : 0); break;
        case "=": col = cave ? C.thickIce : C.boards; break;
        case "s": col = cave ? C.caveFloor : C.flag; break;
        default: col = cave ? C.caveDark : outdoor ? C.rock : C.masonry;
      }
      // Contour lines on open snow and scree: the slope, surveyed.
      if (outdoor && "*^.b".includes(ch)) {
        const h = height(x, y) * 16, d = Math.abs(h - Math.round(h));
        if (d < 0.045) col = mixc(col, hex("#8ea3b5"), (Math.round(h) % 5 === 0 ? 0.55 : 0.3) * (1 - d / 0.045));
      }
      const k = (y * W + x) * 4;
      px[k] = col[0]; px[k + 1] = col[1]; px[k + 2] = col[2]; px[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // ---------- 2. floors indoors ----------
  if (indoor) {
    for (const [c, r] of cellsWhere((ch) => ch === ":" || ch === "s" || ch === "r" || ch === "d")) {
      const x = c * S, y = r * S;
      // Two irregular flagstones per square.
      const split = S * rr(0.35, 0.65), vertical = (c + r) % 2 === 0;
      const stones = vertical ? [[x, y, split, S], [x + split, y, S - split, S]] : [[x, y, S, split], [x, y + split, S, S - split]];
      for (const [sx, sy, sw, sh] of stones) {
        ctx.fillStyle = css(shade(C.flag, rr(0.86, 1.08)));
        ctx.fillRect(sx + 2, sy + 2, sw - 4, sh - 4);
      }
      ctx.strokeStyle = "rgba(40,40,40,0.35)"; ctx.lineWidth = 2;
      for (const [sx, sy, sw, sh] of stones) ctx.strokeRect(sx + 1, sy + 1, sw - 2, sh - 2);
    }
    for (const [c, r] of cellsWhere((ch) => ch === "_")) {
      const x = c * S, y = r * S;
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = css(shade(C.boards, rr(0.82, 1.1)));
        ctx.fillRect(x, y + i * (S / 4), S, S / 4 - 2);
        ctx.fillStyle = "rgba(30,20,10,0.35)";
        ctx.fillRect(x + ((c * 37 + i * 23) % 50) + 6, y + i * (S / 4), 2, S / 4 - 2);
      }
    }
  }

  // ---------- 3. details on the ground ----------
  // Scree: loose stones.
  for (const [c, r] of cellsWhere((ch) => ch === "^")) {
    for (let i = 0; i < 9; i++) {
      const sx = c * S + rr(4, S - 4), sy = r * S + rr(4, S - 4), rad = rr(2.5, 7);
      blob(sx, sy, rad, 6, 0.5);
      ctx.fillStyle = css(shade(C.stone, rr(0.75, 1.15))); ctx.fill();
      ctx.strokeStyle = "rgba(28,34,41,0.55)"; ctx.lineWidth = 1.2; ctx.stroke();
    }
  }
  // Trail outdoors: boot prints and sled runners.
  if (outdoor) {
    for (const [c, r] of cellsWhere((ch) => ch === ".")) {
      for (let i = 0; i < 5; i++) {
        const sx = c * S + rr(8, S - 8), sy = r * S + rr(8, S - 8);
        ctx.fillStyle = "rgba(120,128,138,0.28)";
        ctx.beginPath(); ctx.ellipse(sx, sy, 3, 5, rr(-0.6, 0.6), 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  // Ice: cracks; thin ice has many, thick ice few.
  const crack = (x0, y0, len, depth) => {
    let x = x0, y = y0, ang = rr(0, Math.PI * 2);
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let i = 0; i < 6; i++) { ang += rr(-0.7, 0.7); x += Math.cos(ang) * len / 6; y += Math.sin(ang) * len / 6; ctx.lineTo(x, y); }
    ctx.stroke();
    if (depth > 0 && rnd() < 0.6) crack(x, y, len * 0.6, depth - 1);
  };
  for (const [ch, count, al] of [["i", 3, 0.75], ["e", 1, 0.45]]) {
    const cells = cellsWhere((t) => t === ch);
    if (!cells.length) continue;
    ctx.save(); clipCells(cells);
    for (const [c, r] of cells) {
      for (let i = 0; i < count; i++) {
        ctx.strokeStyle = `rgba(255,255,255,${al})`; ctx.lineWidth = rr(0.8, 1.8);
        crack(c * S + rr(0, S), r * S + rr(0, S), rr(S * 0.6, S * 1.4), 2);
        ctx.strokeStyle = "rgba(60,110,140,0.25)"; ctx.lineWidth = 1;
        crack(c * S + rr(0, S), r * S + rr(0, S), rr(S * 0.3, S * 0.7), 0);
      }
    }
    ctx.restore();
  }
  // Streams: flow lines.
  for (const [c, r] of cellsWhere((ch) => ch === "-")) {
    ctx.strokeStyle = "rgba(230,242,248,0.45)"; ctx.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) {
      const x = c * S + rr(6, S - 20), y = r * S + rr(6, S - 6);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 7, y - 3, x + 16, y + 1); ctx.stroke();
    }
  }
  // Crevasses, chasms and open water, cut into the ground with rough edges.
  const cutIn = (ch, fillDeep, lipColor, lipWidth) => {
    const cells = cellsWhere((t) => t === ch);
    if (!cells.length) return;
    const a2 = amp(ch), rim = edgesOf(cells, ch);
    ctx.save(); tracePolys(cells, a2); ctx.clip();
    ctx.fillStyle = fillDeep; ctx.fillRect(0, 0, W, H);
    // Light falls a little way down each wall: a lighter band inside every edge.
    for (const e of rim) {
      const pts = edgePts(e, a2), [, , dc, dr] = e;
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (const q of pts.slice(1)) ctx.lineTo(q[0], q[1]);
      for (const q of [...pts].reverse()) ctx.lineTo(q[0] - dc * S * 0.45, q[1] - dr * S * 0.45);
      ctx.closePath();
      const [mx, my] = pts[Math.floor(pts.length / 2)];
      const grd = ctx.createLinearGradient(mx, my, mx - dc * S * 0.45, my - dr * S * 0.45);
      grd.addColorStop(0, css(ch === "~" ? hex("#3e6e86") : C.crevLip, 0.95)); grd.addColorStop(1, css(C.crevLip, 0));
      ctx.fillStyle = grd; ctx.fill();
    }
    if (ch === "~") {
      ctx.strokeStyle = "rgba(160,200,220,0.35)"; ctx.lineWidth = 1.5;
      for (const [c, r] of cells) for (let i = 0; i < 3; i++) { const x = c * S + rr(8, S - 24), y = r * S + rr(8, S - 8); ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 8, y - 4, x + 18, y); ctx.stroke(); }
    }
    ctx.restore();
    strokeEdges(rim, a2, lipColor, lipWidth);
    strokeEdges(rim, a2, "rgba(28,34,41,0.75)", 1.6);
    if (ch === "~") {
      // Broken ice shards along the edge of the hole.
      for (const e of rim) for (const [x, y] of edgePts(e, a2).filter((_, i) => i % 2)) {
        blob(x - e[2] * 5, y - e[3] * 5, rr(4, 8), 5, 0.6); ctx.fillStyle = `rgba(228,242,249,${rr(0.75, 0.95)})`; ctx.fill();
        ctx.strokeStyle = "rgba(40,80,100,0.5)"; ctx.lineWidth = 1; ctx.stroke();
      }
    }
  };
  cutIn("V", cave ? "#05090e" : css(C.crev), cave ? "rgba(150,180,200,0.9)" : "rgba(248,251,252,0.97)", 8);
  cutIn("~", css(C.deepWater), "rgba(225,240,248,0.95)", 5);
  // Scrub: dark twig clusters poking through the snow.
  for (const [c, r] of cellsWhere((ch) => ch === "b")) {
    for (let i = 0; i < 3; i++) {
      const cx = c * S + rr(12, S - 12), cy = r * S + rr(12, S - 12);
      ctx.strokeStyle = "rgba(60,52,44,0.8)"; ctx.lineWidth = 1.6;
      for (let k = 0; k < 7; k++) { const ang = rr(0, Math.PI * 2), len = rr(6, 13); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(ang) * len, cy + Math.sin(ang) * len); ctx.stroke(); }
      ctx.fillStyle = "rgba(245,248,250,0.8)"; blob(cx, cy, 4, 5, 0.5); ctx.fill();
    }
  }
  // Rubble heaps.
  for (const [c, r] of cellsWhere((ch) => ch === "r")) {
    for (let i = 0; i < 7; i++) {
      blob(c * S + rr(8, S - 8), r * S + rr(8, S - 8), rr(6, 13), 6, 0.5);
      ctx.fillStyle = css(shade(cave ? C.rockDark : C.rock, rr(0.75, 1.2))); ctx.fill();
      ctx.strokeStyle = "rgba(28,34,41,0.7)"; ctx.lineWidth = 1.5; ctx.stroke();
    }
  }
  // Cave floor: frost.
  if (cave) {
    for (const [c, r] of cellsWhere((ch) => ch === "c" || ch === "v")) {
      for (let i = 0; i < 6; i++) { ctx.fillStyle = `rgba(190,215,232,${rr(0.15, 0.4)})`; ctx.fillRect(c * S + rr(0, S), r * S + rr(0, S), rr(1, 3), rr(1, 3)); }
    }
  }
  // Snow drifted indoors, over the floor.
  for (const [c, r] of cellsWhere((ch) => ch === "d")) {
    for (let i = 0; i < 3; i++) {
      blob(c * S + rr(14, S - 14), r * S + rr(14, S - 14), rr(18, 30), 9, 0.45);
      ctx.fillStyle = `rgba(240,245,248,${rr(0.75, 0.95)})`; ctx.fill();
    }
  }

  // ---------- 4. solid ground: rock, masonry, ice ----------
  // Rock (outdoors and in the caves).
  const rockCells = cellsWhere((ch) => ch === "X");
  if (rockCells.length) {
    const a2 = amp("X");
    ctx.save(); shadowOn(cave ? 18 : 14, cave ? 0 : 8, cave ? 0 : 10, cave ? 0.6 : 0.4);
    tracePolys(rockCells, a2); ctx.fillStyle = css(cave ? C.caveDark : C.rock); ctx.fill();
    shadowOff(); ctx.restore();
    ctx.save(); tracePolys(rockCells, a2); ctx.clip();
    // Granite: mottled, cracked, hatched like a survey's cliff marks.
    for (const [c, r] of rockCells) {
      for (let i = 0; i < 5; i++) {
        blob(c * S + rr(0, S), r * S + rr(0, S), rr(10, 26), 7, 0.5);
        ctx.fillStyle = css(shade(cave ? C.caveDark : C.rock, rr(0.78, 1.18)), 0.55); ctx.fill();
      }
      ctx.strokeStyle = cave ? "rgba(10,14,18,0.45)" : "rgba(40,38,35,0.45)"; ctx.lineWidth = 1.3;
      for (let i = 0; i < 4; i++) { const x = c * S + rr(0, S), y = r * S + rr(0, S); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + rr(-12, 12), y + rr(6, 18)); ctx.stroke(); }
    }
    // Light from the north-west: brighter on the upper slopes of each outcrop.
    const lightGrad = ctx.createLinearGradient(0, 0, W * 0.3, H);
    lightGrad.addColorStop(0, "rgba(255,255,255,0.12)"); lightGrad.addColorStop(1, "rgba(0,0,0,0.12)");
    ctx.fillStyle = lightGrad; ctx.fillRect(0, 0, W, H);
    if (!cave) {
      // Snow lying along the north edges and in the cracks of the rock.
      ctx.globalAlpha = 0.95;
      strokeEdges(edgesOf(rockCells, "X").filter((e) => e[3] < 0), a2, "rgba(247,250,252,1)", 22);
      ctx.globalAlpha = 1;
      for (const [c, r] of rockCells) {
        if (rnd() < 0.5) continue;
        const x = c * S + rr(6, S - 20), y = r * S + rr(6, S - 6);
        ctx.strokeStyle = "rgba(246,249,251,0.75)"; ctx.lineWidth = rr(2, 4); ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + rr(8, 18), y + rr(-3, 3)); ctx.stroke();
      }
    } else {
      // Rime on the cave walls, glinting toward the floor.
      ctx.globalAlpha = 0.35;
      strokeEdges(edgesOf(rockCells, "X"), a2, "rgba(170,205,228,1)", 10);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    strokeEdges(edgesOf(rockCells, "X"), a2, INK, 3);
  }

  // Masonry.
  const wallCells = cellsWhere((ch) => ch === "#");
  if (wallCells.length) {
    ctx.save(); shadowOn(10, 5, 7, 0.45); tracePolys(wallCells, 0); ctx.fillStyle = css(C.masonry); ctx.fill(); shadowOff(); ctx.restore();
    ctx.save(); tracePolys(wallCells, 0); ctx.clip();
    for (const [c, r] of wallCells) {
      for (let row = 0; row < 3; row++) for (let k = 0; k < 2; k++) {
        const bw = S / 2, bh = S / 3, ox = row % 2 ? -bw / 2 : 0;
        ctx.fillStyle = css(shade(C.masonry, rr(0.8, 1.2)));
        ctx.fillRect(c * S + ox + k * bw + 1.5, r * S + row * bh + 1.5, bw - 3, bh - 3);
      }
    }
    ctx.restore();
    strokeEdges(edgesOf(wallCells, "#DLw"), 0, INK, 3.2);
  }

  // Ice: clear blue, faceted, the floor showing through.
  const iceCells = cellsWhere((ch) => ch === "I");
  if (iceCells.length) {
    const a2 = amp("I");
    ctx.save(); shadowOn(8, 3, 5, 0.25); tracePolys(iceCells, a2); ctx.fillStyle = "rgba(140,196,224,0.55)"; ctx.fill(); shadowOff(); ctx.restore();
    ctx.save(); tracePolys(iceCells, a2); ctx.clip();
    // One sweep of colour across the whole wall, then facets: shards of light at angles.
    const grd = ctx.createLinearGradient(0, 0, W, H * 0.6);
    for (let i = 0; i <= 8; i++) grd.addColorStop(i / 8, i % 2 ? "rgba(110,170,206,0.35)" : "rgba(215,238,248,0.45)");
    ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);
    for (const [c, r] of iceCells) {
      const x = c * S, y = r * S;
      for (let i = 0; i < 4; i++) {
        const fx = x + rr(-10, S), fy = y + rr(-10, S);
        ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx + rr(14, 34), fy + rr(-8, 8)); ctx.lineTo(fx + rr(8, 26), fy + rr(14, 30)); ctx.closePath();
        ctx.fillStyle = rnd() < 0.5 ? "rgba(255,255,255,0.28)" : "rgba(60,120,160,0.18)"; ctx.fill();
      }
      ctx.strokeStyle = "rgba(255,255,255,0.7)"; ctx.lineWidth = 1.3;
      for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.moveTo(x + rr(0, S), y + rr(0, S)); ctx.lineTo(x + rr(0, S), y + rr(0, S)); ctx.stroke(); }
    }
    ctx.restore();
    strokeEdges(edgesOf(iceCells, "I"), a2, "rgba(236,248,253,0.95)", 5);
    strokeEdges(edgesOf(iceCells, "I"), a2, "rgba(40,90,120,0.9)", 1.8);
  }

  // Pillars.
  for (const [c, r] of cellsWhere((ch) => ch === "o")) {
    const cx = c * S + S / 2, cy = r * S + S / 2;
    ctx.save(); shadowOn(10, 5, 7, 0.45);
    ctx.beginPath(); ctx.arc(cx, cy, S * 0.42, 0, Math.PI * 2); ctx.fillStyle = css(cave ? C.caveDark : C.masonry); ctx.fill();
    shadowOff(); ctx.restore();
    ctx.beginPath(); ctx.arc(cx, cy, S * 0.42, 0, Math.PI * 2); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx - 5, cy - 5, S * 0.22, 0, Math.PI * 2); ctx.fillStyle = cave ? "rgba(160,195,220,0.25)" : "rgba(255,255,255,0.12)"; ctx.fill();
  }

  // ---------- 5. the bridges and stairs ----------
  for (const [c, r] of cellsWhere((ch) => ch === "=")) {
    const x = c * S, y = r * S;
    if (cave) {
      if (raw(c - 1, r) === "=") continue;
      let len = 1; while (raw(c + len, r) === "=" && c + len < cols) len++;
      ctx.save(); shadowOn(10, 0, 6, 0.6);
      ctx.beginPath(); ctx.roundRect(x - 6, y + 8, len * S + 12, S - 16, 14);
      const grd = ctx.createLinearGradient(0, y + 8, 0, y + S - 8);
      grd.addColorStop(0, "rgba(232,246,252,0.95)"); grd.addColorStop(1, "rgba(130,185,215,0.9)");
      ctx.fillStyle = grd; ctx.fill(); shadowOff();
      ctx.strokeStyle = "rgba(40,90,120,0.9)"; ctx.lineWidth = 2; ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.7)"; ctx.lineWidth = 1.5;
      for (let i = 0; i < len * 3; i++) { const fx = x + rr(0, len * S), fy = y + rr(14, S - 14); ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx + rr(6, 16), fy + rr(-4, 4)); ctx.stroke(); }
      ctx.restore();
    } else {
      const vertical = raw(c, r - 1) === "=" || raw(c, r + 1) === "=" || raw(c, r - 1) === "." || raw(c, r + 1) === ".";
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = css(shade(C.boards, rr(0.85, 1.15)));
        if (vertical) ctx.fillRect(x + 6, y + i * (S / 5) + 2, S - 12, S / 5 - 4); else ctx.fillRect(x + i * (S / 5) + 2, y + 6, S / 5 - 4, S - 12);
      }
      ctx.strokeStyle = "#5c4a36"; ctx.lineWidth = 3;
      ctx.beginPath();
      if (vertical) { ctx.moveTo(x + 4, y); ctx.lineTo(x + 4, y + S); ctx.moveTo(x + S - 4, y); ctx.lineTo(x + S - 4, y + S); }
      else { ctx.moveTo(x, y + 4); ctx.lineTo(x + S, y + 4); ctx.moveTo(x, y + S - 4); ctx.lineTo(x + S, y + S - 4); }
      ctx.stroke();
    }
  }
  for (const [c, r] of cellsWhere((ch) => ch === "s")) {
    const x = c * S, y = r * S;
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = css(shade(cave ? C.caveFloor : C.flag, 1.15 - i * 0.1));
      ctx.fillRect(x + 2, y + i * (S / 6), S - 4, S / 6 - 2);
    }
    ctx.strokeStyle = "rgba(28,34,41,0.6)"; ctx.lineWidth = 1.5; ctx.strokeRect(x + 2, y + 1, S - 4, S - 2);
  }

  // ---------- 6. pines ----------
  const pine = (cx, cy, rad) => {
    ctx.save(); shadowOn(9, 6, 8, 0.38);
    ctx.beginPath();
    const n = 9;
    for (let i = 0; i <= n * 2; i++) {
      const t = (i / (n * 2)) * Math.PI * 2, rad2 = i % 2 ? rad * 0.55 : rad * rr(0.92, 1.05);
      const x = cx + Math.cos(t) * rad2, y = cy + Math.sin(t) * rad2;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath(); ctx.fillStyle = css(C.pine); ctx.fill();
    shadowOff(); ctx.restore();
    ctx.strokeStyle = INK; ctx.lineWidth = 1.6; ctx.stroke();
    for (const k of [0.7, 0.42]) {
      ctx.beginPath();
      for (let i = 0; i <= n * 2; i++) {
        const t = (i / (n * 2)) * Math.PI * 2 + 0.3, rad2 = (i % 2 ? 0.55 : 1) * rad * k;
        const x = cx + Math.cos(t) * rad2, y = cy + Math.sin(t) * rad2;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath(); ctx.fillStyle = css(k > 0.5 ? C.pineDark : shade(C.pine, 1.15)); ctx.fill();
    }
    for (let i = 0; i < 5; i++) { blob(cx + rr(-rad * 0.6, rad * 0.4), cy + rr(-rad * 0.6, rad * 0.2), rr(3, 6), 5, 0.5); ctx.fillStyle = "rgba(246,249,251,0.92)"; ctx.fill(); }
  };
  for (const [c, r] of cellsWhere((ch) => ch === "p")) {
    pine(c * S + S / 2 + rr(-10, 10), r * S + S / 2 + rr(-10, 10), rr(S * 0.45, S * 0.62));
    if (rnd() < 0.35) pine(c * S + rr(8, S - 8), r * S + rr(8, S - 8), rr(S * 0.25, S * 0.35));
  }

  // ---------- 7. props ----------
  const lights = [];
  const box = (x, y, w, h, fill, stroke = INK, lw = 2) => { ctx.fillStyle = fill; ctx.fillRect(x, y, w, h); ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.strokeRect(x, y, w, h); };
  for (const p of props ?? []) {
    const x = p.c * S, y = p.r * S, w = (p.w ?? 1) * S, h = (p.h ?? 1) * S, cx = x + w / 2, cy = y + h / 2;
    ctx.save();
    switch (p.t) {
      case "cairn": {
        // A ring of stones where a cairn stands or stood (the token sits on it).
        for (let i = 0; i < 9; i++) {
          const t = (i / 9) * Math.PI * 2;
          blob(cx + Math.cos(t) * S * 0.3, cy + Math.sin(t) * S * 0.3, rr(5, 8), 6, 0.4);
          ctx.fillStyle = css(shade(C.stone, rr(0.8, 1.2))); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1.2; ctx.stroke();
        }
        break;
      }
      case "ropeBridge": {
        ctx.strokeStyle = "#5c4a36"; ctx.lineWidth = 4;
        for (const ox of [x + 2, x + w - 2]) { ctx.beginPath(); ctx.moveTo(ox, y - 10); ctx.lineTo(ox, y + h + 10); ctx.stroke(); }
        for (const [px2, py2] of [[x + 2, y - 12], [x + w - 2, y - 12], [x + 2, y + h + 12], [x + w - 2, y + h + 12]]) box(px2 - 5, py2 - 5, 10, 10, "#6b543c", INK, 1.5);
        break;
      }
      case "deadfall": {
        ctx.translate(cx, cy); ctx.rotate(-0.15);
        shadowOn(8, 4, 6, 0.4); box(-w / 2, -9, w, 18, "#5d4a38", INK, 2); shadowOff();
        ctx.fillStyle = "rgba(246,249,251,0.9)"; ctx.fillRect(-w / 2 + 4, -9, w - 8, 5);
        break;
      }
      case "bones": {
        ctx.strokeStyle = "#e8e2d2"; ctx.lineWidth = 4; ctx.lineCap = "round";
        for (let i = 0; i < 4; i++) { const a2 = rr(0, Math.PI); ctx.beginPath(); ctx.moveTo(cx + Math.cos(a2) * 12, cy + Math.sin(a2) * 12); ctx.lineTo(cx - Math.cos(a2) * 12, cy - Math.sin(a2) * 12); ctx.stroke(); }
        break;
      }
      case "wagon": {
        ctx.translate(cx, cy); ctx.rotate(p.wreck ? 0.5 : 0);
        shadowOn(10, 5, 8, 0.45); box(-w * 0.42, -h * 0.3, w * 0.84, h * 0.6, "#6e5238", INK, 2.5); shadowOff();
        for (let i = 1; i < 5; i++) { ctx.strokeStyle = "rgba(30,20,10,0.5)"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-w * 0.42 + i * w * 0.168, -h * 0.3); ctx.lineTo(-w * 0.42 + i * w * 0.168, h * 0.3); ctx.stroke(); }
        ctx.fillStyle = "#3b2c1f"; for (const [wx, wy] of [[-w * 0.3, -h * 0.36], [w * 0.3, -h * 0.36], [-w * 0.3, h * 0.36]]) { ctx.beginPath(); ctx.ellipse(wx, wy, 12, 5, 0, 0, Math.PI * 2); ctx.fill(); }
        ctx.fillStyle = "rgba(240,236,224,0.9)"; ctx.fillRect(-w * 0.3, -h * 0.18, w * 0.25, h * 0.2); ctx.fillRect(w * 0.02, -h * 0.05, w * 0.22, h * 0.22);
        break;
      }
      case "crates": {
        shadowOn(6, 3, 5, 0.4); box(x + 10, y + 10, S * 0.48, S * 0.48, "#8a6a48"); box(x + 30, y + 26, S * 0.4, S * 0.4, "#7d5f40"); shadowOff();
        break;
      }
      case "campfire": {
        ctx.fillStyle = "#2b2420"; ctx.beginPath(); ctx.arc(cx, cy, S * 0.3, 0, Math.PI * 2); ctx.fill();
        for (let i = 0; i < 7; i++) { const t = (i / 7) * Math.PI * 2; blob(cx + Math.cos(t) * S * 0.32, cy + Math.sin(t) * S * 0.32, 6, 5, 0.4); ctx.fillStyle = css(C.stone); ctx.fill(); }
        ctx.fillStyle = "rgba(90,80,70,0.8)"; ctx.beginPath(); ctx.arc(cx, cy, S * 0.12, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case "hearth": {
        shadowOn(8, 3, 5, 0.4); box(x, y + 4, w, h - 8, "#56504a", INK, 2.5); shadowOff();
        ctx.fillStyle = "#e0612b"; ctx.fillRect(x + w * 0.2, y + h * 0.35, w * 0.6, h * 0.35);
        ctx.fillStyle = "#f2b04a"; ctx.fillRect(x + w * 0.3, y + h * 0.45, w * 0.4, h * 0.18);
        lights.push({ x: cx, y: y + h, r: S * 5, color: "255,170,90", a: 0.32 });
        break;
      }
      case "longTable": {
        shadowOn(8, 4, 6, 0.4); box(x + 4, y + 14, w - 8, h - 28, "#6e4f35"); shadowOff();
        ctx.fillStyle = "#5a3f2a"; for (let i = 0; i < Math.floor(w / S); i++) { ctx.fillRect(x + i * S + 18, y + 2, 34, 9); ctx.fillRect(x + i * S + 18, y + h - 11, 34, 9); }
        break;
      }
      case "bunks": {
        shadowOn(6, 3, 5, 0.4); box(x + 6, y + 4, w - 12, h - 8, "#6b4c33"); shadowOff();
        ctx.fillStyle = "#b8b0a0"; ctx.fillRect(x + 10, y + 8, w - 20, h - 16); ctx.fillStyle = "#8f3f2c"; ctx.fillRect(x + 10, y + h * 0.4, w - 20, h * 0.5);
        break;
      }
      case "altar": {
        shadowOn(8, 3, 5, 0.4); box(x + 4, y + 12, w - 8, h - 24, "#a49e92"); shadowOff();
        ctx.fillStyle = "#e0612b"; ctx.fillRect(cx - 4, y + 16, 8, h - 32);
        for (const ox of [x + 16, x + w - 16]) { ctx.fillStyle = "#f3e7c4"; ctx.fillRect(ox - 3, y + 18, 6, 10); lights.push({ x: ox, y: y + 18, r: S * 1.6, color: "255,200,120", a: 0.25 }); }
        break;
      }
      case "pews": {
        shadowOn(5, 3, 4, 0.35); box(x + 4, y + 20, w - 8, 18, "#6a4d35"); shadowOff();
        break;
      }
      case "stove": {
        shadowOn(6, 3, 5, 0.4); box(x + 10, y + 10, S - 20, S - 20, "#2e2f33"); shadowOff();
        ctx.fillStyle = "#c2552a"; ctx.fillRect(x + 22, y + 22, S - 44, 8);
        lights.push({ x: cx, y: cy, r: S * 2.5, color: "255,160,90", a: 0.2 });
        break;
      }
      case "barrels": {
        for (const [ox, oy] of [[18, 18], [44, 26], [24, 46]]) { shadowOn(5, 3, 4, 0.35); ctx.beginPath(); ctx.arc(x + ox, y + oy, 13, 0, Math.PI * 2); ctx.fillStyle = "#7a5634"; ctx.fill(); shadowOff(); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke(); ctx.beginPath(); ctx.arc(x + ox, y + oy, 8, 0, Math.PI * 2); ctx.strokeStyle = "#3d2b1b"; ctx.lineWidth = 1.5; ctx.stroke(); }
        break;
      }
      case "hay": {
        blob(cx, cy, w * 0.42, 10, 0.3); ctx.fillStyle = "#c9a85a"; ctx.fill(); ctx.strokeStyle = "#7d6630"; ctx.lineWidth = 2; ctx.stroke();
        ctx.strokeStyle = "rgba(120,95,40,0.6)"; ctx.lineWidth = 1; for (let i = 0; i < 30; i++) { const sx = cx + rr(-w * 0.35, w * 0.35), sy = cy + rr(-h * 0.35, h * 0.35); ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + rr(-8, 8), sy + rr(-8, 8)); ctx.stroke(); }
        break;
      }
      case "trough": {
        box(x + 6, y + 18, w - 12, h - 36, "#5d4a38"); ctx.fillStyle = "#9fc4d8"; ctx.fillRect(x + 12, y + 24, w - 24, h - 48);
        break;
      }
      case "bell": {
        ctx.beginPath(); ctx.arc(cx, cy, S * 0.3, 0, Math.PI * 2); ctx.fillStyle = "#9a7a3a"; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
        ctx.beginPath(); ctx.arc(cx, cy, S * 0.1, 0, Math.PI * 2); ctx.fillStyle = "#3a2e18"; ctx.fill();
        break;
      }
      case "lantern": {
        ctx.fillStyle = "#e0612b"; ctx.fillRect(cx - 7, cy - 9, 14, 18); ctx.fillStyle = "#ffd27a"; ctx.fillRect(cx - 4, cy - 5, 8, 10);
        lights.push({ x: cx, y: cy, r: S * 3, color: "255,190,110", a: 0.35 });
        break;
      }
      case "stoneHeap": {
        for (let i = 0; i < 18; i++) { blob(x + rr(10, w - 10), y + rr(10, h - 10), rr(7, 13), 6, 0.45); ctx.fillStyle = css(shade(C.stone, rr(0.75, 1.2))); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1.3; ctx.stroke(); }
        // Cairn-stones still wear the guild's orange marks.
        for (let i = 0; i < 4; i++) { ctx.fillStyle = "#e0612b"; ctx.fillRect(x + rr(12, w - 18), y + rr(12, h - 18), 6, 3); }
        break;
      }
      case "crystals": {
        for (let i = 0; i < 5; i++) {
          const a2 = rr(-1.2, 1.2), len = rr(14, 26), bx = cx + rr(-10, 10), by = cy + rr(-6, 10);
          ctx.beginPath(); ctx.moveTo(bx - 4, by); ctx.lineTo(bx + Math.sin(a2) * len, by - Math.cos(a2) * len); ctx.lineTo(bx + 4, by); ctx.closePath();
          ctx.fillStyle = "rgba(170,220,245,0.85)"; ctx.fill(); ctx.strokeStyle = "rgba(40,90,120,0.8)"; ctx.lineWidth = 1.2; ctx.stroke();
        }
        lights.push({ x: cx, y: cy, r: S * 1.8, color: "150,210,255", a: 0.22 });
        break;
      }
      default: break;
    }
    ctx.restore();
  }

  // ---------- 8. doors and windows ----------
  for (const p of portals ?? []) {
    const x = p.c * S, y = p.r * S;
    ctx.save();
    ctx.translate(x + S / 2, y + S / 2);
    if (p.orient === "v") ctx.rotate(Math.PI / 2);
    if (p.kind === "window") {
      box(-S / 2 + 4, -6, S - 8, 12, "rgba(160,205,228,0.9)", INK, 2);
      ctx.strokeStyle = "rgba(255,255,255,0.8)"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-S / 2 + 10, 0); ctx.lineTo(S / 2 - 10, 0); ctx.stroke();
    } else {
      box(-S / 2 + 2, -8, S - 4, 16, "#6b4a30", INK, 2.2);
      ctx.strokeStyle = "rgba(30,20,10,0.6)"; ctx.lineWidth = 1.2; for (const ox of [-S / 4, 0, S / 4]) { ctx.beginPath(); ctx.moveTo(ox, -8); ctx.lineTo(ox, 8); ctx.stroke(); }
      if (p.lock) { ctx.fillStyle = "#2d2e31"; ctx.fillRect(-S / 2 + 6, -3, S - 12, 6); ctx.fillStyle = "#c9a44c"; ctx.fillRect(-4, -5, 8, 10); }
    }
    ctx.restore();
  }

  // ---------- 9. steam ----------
  for (const [c, r] of cellsWhere((ch) => ch === "v")) {
    for (let i = 0; i < 4; i++) {
      const gx = c * S + rr(0, S), gy = r * S + rr(0, S), rad = rr(S * 0.4, S * 0.8);
      const grd = ctx.createRadialGradient(gx, gy, 0, gx, gy, rad);
      grd.addColorStop(0, "rgba(235,242,248,0.55)"); grd.addColorStop(1, "rgba(235,242,248,0)");
      ctx.fillStyle = grd; ctx.fillRect(gx - rad, gy - rad, rad * 2, rad * 2);
    }
  }

  // ---------- 10. light ----------
  if (indoor || cave) {
    // The dark of a stone house in winter, or a cave: a cool wash, lit warm where there's fire.
    ctx.fillStyle = cave ? "rgba(8,16,26,0.32)" : "rgba(20,28,40,0.16)"; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";
    for (const l of lights) {
      const grd = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r);
      grd.addColorStop(0, `rgba(${l.color},${l.a})`); grd.addColorStop(1, `rgba(${l.color},0)`);
      ctx.fillStyle = grd; ctx.fillRect(l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
    }
    ctx.globalCompositeOperation = "source-over";
  }
  {
    const grd = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.72);
    grd.addColorStop(0, "rgba(20,30,45,0)"); grd.addColorStop(1, outdoor ? "rgba(60,80,105,0.22)" : "rgba(5,10,18,0.42)");
    ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);
  }
  // Paper grain.
  for (let i = 0; i < W * H / 260; i++) {
    ctx.fillStyle = rnd() < 0.5 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)";
    ctx.fillRect(rnd() * W, rnd() * H, 1.5, 1.5);
  }

  // ---------- 11. the GM key ----------
  if (mode === "key") {
    ctx.fillStyle = "rgba(255,255,255,0.18)"; ctx.fillRect(0, 0, W, H);
    // Terrain: Difficult hatched blue, Blocked crossed red.
    for (const run of a.terrain ?? []) {
      for (let c = run.start; c <= run.end; c++) {
        const x = c * S, y = run.row * S;
        ctx.save(); ctx.beginPath(); ctx.rect(x, y, S, S); ctx.clip();
        ctx.strokeStyle = run.kind === "blocked" ? "rgba(200,40,40,0.75)" : "rgba(30,90,170,0.45)"; ctx.lineWidth = run.kind === "blocked" ? 3 : 2;
        for (let k = -S; k < S * 2; k += 14) { ctx.beginPath(); ctx.moveTo(x + k, y); ctx.lineTo(x + k + S, y + S); ctx.stroke(); if (run.kind === "blocked") { ctx.beginPath(); ctx.moveTo(x + k + S, y); ctx.lineTo(x + k, y + S); ctx.stroke(); } }
        ctx.restore();
      }
    }
    // Obscuring fog: green dashed outlines.
    ctx.setLineDash([12, 8]); ctx.strokeStyle = "rgba(20,120,60,0.95)"; ctx.lineWidth = 5;
    for (const region of a.fog ?? []) { ctx.beginPath(); region.points.forEach((pt, i) => (i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y))); ctx.closePath(); ctx.stroke(); }
    ctx.setLineDash([]);
    // The grid, numbered along the edges.
    ctx.strokeStyle = "rgba(28,34,41,0.45)"; ctx.lineWidth = 1.5;
    for (let c = 0; c <= cols; c++) { ctx.beginPath(); ctx.moveTo(c * S, 0); ctx.lineTo(c * S, H); ctx.stroke(); }
    for (let r = 0; r <= rows; r++) { ctx.beginPath(); ctx.moveTo(0, r * S); ctx.lineTo(W, r * S); ctx.stroke(); }
    ctx.font = "bold 22px Georgia, serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (let c = 0; c < cols; c++) { ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.fillRect(c * S + S / 2 - 15, 2, 30, 24); ctx.fillStyle = INK; ctx.fillText(String(c), c * S + S / 2, 15); }
    for (let r = 0; r < rows; r++) { ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.fillRect(2, r * S + S / 2 - 12, 30, 24); ctx.fillStyle = INK; ctx.fillText(String(r), 17, r * S + S / 2); }
    // Doors, locked doors, windows and ice.
    for (const p of portals ?? []) {
      const x = p.c * S + S / 2, y = p.r * S + S / 2;
      ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2);
      ctx.fillStyle = p.lock ? "#c81e6e" : p.kind === "window" ? "#1e88b4" : "#d8a21e"; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.font = "bold 18px Georgia, serif"; ctx.fillText(p.lock ? "L" : p.kind === "window" ? "W" : "D", x, y + 1);
    }
    // Area numbers.
    for (const k of keys ?? []) {
      const x = k.c * S, y = k.r * S;
      ctx.beginPath(); ctx.arc(x, y, 30, 0, Math.PI * 2); ctx.fillStyle = "#e0612b"; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.font = "bold 34px Georgia, serif"; ctx.fillText(k.n, x, y + 2);
    }
  }
  return cv.toDataURL("image/png");
}
