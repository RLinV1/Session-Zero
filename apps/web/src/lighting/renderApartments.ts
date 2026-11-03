import { APARTMENTS, LAMPS, WINDOW_LIGHTS, type Light } from "./apartments";
import { blocksLight, cameraOccludes, insidePolygon, project, type Point2, type Point3 } from "./isometric";
export interface LightingView { at: Point2; turn: number; torchHeight: number; time: "day" | "dusk" | "night"; cutaway: boolean; grid: boolean; path: readonly Point2[] }
type RGB = readonly [number, number, number];
const color = (rgb: RGB) => "rgb(" + rgb.map((v) => Math.round(Math.max(0, Math.min(255, v)))).join(",") + ")";
const random = (x: number, y: number, z = 0) => { const n = Math.sin(x * 127.1 + y * 311.7 + z * 17.3) * 43758.5453; return n - Math.floor(n); };
export function viewport(width: number, height: number) {
  const scale = Math.min(width / 1540, height / 920) * 0.96;
  return { scale, x: width / 2, y: (height - 920 * scale) / 2 + 160 * scale };
}
export function renderApartments(canvas: HTMLCanvasElement, width: number, height: number, view: LightingView) {
  const ctx = canvas.getContext("2d");
  if (!ctx || !width || !height) return { cutaways: 0 };
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.fillStyle = "#10171b"; ctx.fillRect(0, 0, width, height);
  const camera = viewport(width, height);
  const screen = (p: Point3): Point2 => { const q = project(p, view.turn); return { x: camera.x + q.x * camera.scale, y: camera.y + q.y * camera.scale }; };
  const poly = (points: readonly Point3[], fill: string, stroke?: string) => {
    ctx.beginPath(); points.forEach((p, i) => { const q = screen(p); if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); }); ctx.closePath();
    ctx.fillStyle = fill; ctx.fill(); if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = Math.max(0.5, camera.scale); ctx.stroke(); }
  };
  const line = (a: Point3, b: Point3, stroke: string, weight = 1) => {
    const p = screen(a), q = screen(b); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.strokeStyle = stroke; ctx.lineWidth = Math.max(0.5, weight * camera.scale); ctx.stroke();
  };
  const lights: Light[] = [
    ...WINDOW_LIGHTS,
    ...LAMPS.map((p) => ({ ...p, z: 2.2, range: 5, strength: 1.05, color: [1, 0.68, 0.35] as const })),
    { ...view.at, z: view.torchHeight, range: 7.5, strength: 2.3, color: [1, 0.65, 0.3] },
    { x: -15, y: 34, z: 32, range: 500, strength: view.time === "day" ? 1.1 : view.time === "dusk" ? 0.42 : 0.04, color: [0.82, 0.9, 1] },
  ];
  const shade = (base: RGB, p: Point3, normal: Point3 = { x: 0, y: 0, z: 1 }): string => {
    const ambient = view.time === "day" ? 0.5 : view.time === "dusk" ? 0.42 : 0.13;
    const light = [ambient * 0.9, ambient, ambient * 1.1];
    for (const source of lights) {
      const dx = source.x - p.x, dy = source.y - p.y, dz = source.z - p.z, distance = Math.hypot(dx, dy, dz);
      if (distance > source.range || source.strength === 0) continue;
      const facing = Math.max(0, (normal.x * dx + normal.y * dy + normal.z * dz) / Math.max(distance, 0.1));
      if (facing < 0.01 || APARTMENTS.some((b) => blocksLight(p, source, b))) continue;
      const strength = source.strength * Math.pow(1 - distance / source.range, 2) * facing;
      for (let i = 0; i < 3; i++) light[i]! += strength * source.color[i]!;
    }
    return color(base.map((v, i) => v * Math.min(1.8, light[i]!)) as unknown as RGB);
  };
  // Each playable square contains four individually coursed cobblestones; calibration stays exact.
  for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) {
    const lightAt = { x: x + 0.5, y: y + 0.5, z: 0.025 };
    for (let row = 0; row < 2; row++) for (let col = 0; col < 2; col++) {
      const n = random(x * 2 + col, y * 2 + row);
      const u = x + col * 0.5 + 0.015, v = y + row * 0.5 + 0.015;
      const paving: RGB = (x < 1 || y < 1 || x > 18 || y > 18) ? [57 + n * 15, 71 + n * 16, 57 + n * 13] : [112 + n * 30, 111 + n * 26, 103 + n * 25];
      poly([{ x: u, y: v, z: 0 }, { x: u + 0.47, y: v, z: 0 }, { x: u + 0.47, y: v + 0.47, z: 0 }, { x: u, y: v + 0.47, z: 0 }], shade(paving, lightAt), "#121a1c50");
    }
    if (view.grid) poly([{ x, y, z: 0.01 }, { x: x + 1, y, z: 0.01 }, { x: x + 1, y: y + 1, z: 0.01 }, { x, y: y + 1, z: 0.01 }], "#ffffff00", "#c9d4d433");
  }
  for (const p of view.path) { const q = screen({ ...p, z: 0.02 }); ctx.beginPath(); ctx.ellipse(q.x, q.y, 3 * camera.scale, 1.5 * camera.scale, 0, 0, Math.PI * 2); ctx.fillStyle = "#e0a36599"; ctx.fill(); }
  let cutaways = 0;
  const pawn = project({ ...view.at, z: 0.25 }, view.turn);
  const sorted = [...APARTMENTS].sort((a, b) => project({ x: a.x + a.width / 2, y: a.y + a.depth / 2, z: 0 }, view.turn).y - project({ x: b.x + b.width / 2, y: b.y + b.depth / 2, z: 0 }, view.turn).y);
  let hidden = false;
  const revealedBuildings = new Set<string>();
  const buildingMasks = new Map<string, Point2[][]>();
  const faces = [["east", "south"], ["east", "north"], ["west", "north"], ["west", "south"]][view.turn % 4]!;
  for (const b of sorted) {
    const corners = [{ x: b.x, y: b.y }, { x: b.x + b.width, y: b.y }, { x: b.x + b.width, y: b.y + b.depth }, { x: b.x, y: b.y + b.depth }];
    const silhouettes = [
      corners.map((p) => project({ ...p, z: b.height }, view.turn)),
      ...faces.map((side) => {
        const east = side === "east" || side === "west";
        const p = east ? { x: side === "east" ? b.x + b.width : b.x, y: b.y } : { x: b.x, y: side === "south" ? b.y + b.depth : b.y };
        const q = east ? { ...p, y: p.y + b.depth } : { ...p, x: p.x + b.width };
        return [{ ...p, z: 0 }, { ...q, z: 0 }, { ...q, z: b.height }, { ...p, z: b.height }].map((point) => project(point, view.turn));
      }),
    ];
    buildingMasks.set(b.id, silhouettes);
    const obscures = silhouettes.some((shape) => insidePolygon(pawn, shape));
    if (obscures) { hidden = true; if (view.cutaway) { cutaways++; revealedBuildings.add(b.id); } }
    ctx.save(); if (obscures && view.cutaway) ctx.globalAlpha = 0.23;
    for (const side of faces) {
      const vertical = side === "east" || side === "west";
      const length = vertical ? b.depth : b.width;
      const facePoint = (u: number, z: number): Point3 => vertical ? { x: side === "east" ? b.x + b.width + 0.002 : b.x - 0.002, y: b.y + u, z } : { x: b.x + u, y: side === "south" ? b.y + b.depth + 0.002 : b.y - 0.002, z };
      const normal = { x: side === "east" ? 1 : side === "west" ? -1 : 0, y: side === "south" ? 1 : side === "north" ? -1 : 0, z: 0 };
      const faceColor = shade(b.color, facePoint(length / 2, b.height / 2), normal);
      poly([facePoint(0, 0), facePoint(length, 0), facePoint(length, b.height), facePoint(0, b.height)], faceColor, "#11191daa");
      for (let z = 0.18, course = 0; z < b.height; z += 0.22, course++) {
        for (let u = course % 2 ? -0.32 : 0; u < length; u += 0.64) {
          const left = Math.max(0, u + 0.012), right = Math.min(length, u + 0.62), top = Math.min(b.height, z + 0.2);
          const variation = 0.82 + random(u, z, b.x) * 0.36;
          const brick = b.color.map((v) => v * variation) as unknown as RGB;
          poly([facePoint(left, z), facePoint(right, z), facePoint(right, top), facePoint(left, top)], shade(brick, facePoint((left + right) / 2, (z + top) / 2), normal));
        }
      }
      // Stone foundations and timber cornices keep the facades rooted to the board.
      line(facePoint(0, 0.15), facePoint(length, 0.15), "#aaa18a70", 5);
      line(facePoint(0, b.height - 0.08), facePoint(length, b.height - 0.08), "#282e2d", 7);
      for (let z = 1.25; z < b.height - 0.35; z += 1.5) for (let u = 0.85; u < length - 0.35; u += 1.25) {
        poly([facePoint(u - 0.34, z - 0.47), facePoint(u + 0.34, z - 0.47), facePoint(u + 0.34, z + 0.47), facePoint(u - 0.34, z + 0.47)], "#817862", "#302e27");
        poly([facePoint(u - 0.25, z - 0.34), facePoint(u + 0.25, z - 0.34), facePoint(u + 0.25, z + 0.34), facePoint(u - 0.25, z + 0.34)], view.time === "day" ? "#adbbaf" : "#efbf73");
        line(facePoint(u - 0.25, z - 0.34), facePoint(u + 0.25, z + 0.34), "#775c35", 1.7);
        line(facePoint(u + 0.25, z - 0.34), facePoint(u - 0.25, z + 0.34), "#775c35", 1.7);
      }
      if (b.id === "ivy-house" && (side === "east" || side === "west")) {
        for (let leaf = 0; leaf < 30; leaf++) {
          const z = 0.3 + random(leaf, b.x) * (b.height - 0.5);
          const u = 0.3 + Math.sin(z * 2.5) * 0.15 + random(leaf, b.y) * 0.45;
          poly([facePoint(u, z), facePoint(u + 0.13, z + 0.14), facePoint(u + 0.28, z + 0.03), facePoint(u + 0.12, z - 0.1)], shade([72, 103 + random(leaf, 2) * 30, 63], facePoint(u, z), normal));
        }
      }
      if (side === "south" || side === "north") {
        const u = length / 2;
        poly([facePoint(u - 0.34, 0.15), facePoint(u + 0.34, 0.15), facePoint(u + 0.34, 1.55), facePoint(u - 0.34, 1.55)], "#352f28", "#9b8a67");
        for (let plank = -0.25; plank < 0.3; plank += 0.13) line(facePoint(u + plank, 0.2), facePoint(u + plank, 1.5), "#77624666", 1);
      }
    }
    const roof = corners.map((p) => ({ ...p, z: b.height + 0.04 }));
    poly(roof, shade([76, 84, 87], { x: b.x + b.width / 2, y: b.y + b.depth / 2, z: b.height + 0.08 }), "#2a3537");
    for (let y = b.y + 0.25; y < b.y + b.depth; y += 0.3) line({ x: b.x, y, z: b.height + 0.05 }, { x: b.x + b.width, y, z: b.height + 0.05 }, "#a5afb328", 1);
    // A chimney and terracotta rim give the roof a readable height cue.
    const cx = b.x + 0.8, cy = b.y + 0.7;
    poly([{ x: cx, y: cy, z: b.height }, { x: cx + 0.5, y: cy, z: b.height }, { x: cx + 0.5, y: cy, z: b.height + 0.8 }, { x: cx, y: cy, z: b.height + 0.8 }], "#604538", "#322f2a");
    poly([{ x: cx, y: cy, z: b.height + 0.8 }, { x: cx + 0.5, y: cy, z: b.height + 0.8 }, { x: cx + 0.5, y: cy + 0.5, z: b.height + 0.8 }, { x: cx, y: cy + 0.5, z: b.height + 0.8 }], "#a08360");
    ctx.restore();
  }
  // These street props have disjoint ground footprints from the buildings. A forward
  // ground ray establishes which buildings can be in front; clip against their actual
  // projected roof/wall silhouettes, retaining visible portions above or beside a roof.
  const props = (points: readonly Point3[], paint: () => void) => {
    ctx.save();
    for (const building of APARTMENTS) {
      if (revealedBuildings.has(building.id)) continue;
      const column = { ...building, height: 1000 };
      if (!points.some((point) => cameraOccludes({ ...point, z: 0.01 }, view.turn, [column]))) continue;
      ctx.beginPath(); ctx.rect(0, 0, width, height);
      for (const shape of buildingMasks.get(building.id)!) {
        shape.forEach((point, index) => {
          const x = camera.x + point.x * camera.scale, y = camera.y + point.y * camera.scale;
          if (index) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        });
        ctx.closePath();
      }
      ctx.clip("evenodd");
    }
    paint(); ctx.restore();
  };
  for (const [sx, sy, blue] of [[8, 2.5, 0], [7.5, 16.5, 1]] as const) {
    const footprint = [{ x: sx, y: sy, z: 0 }, { x: sx + 2, y: sy, z: 0 }, { x: sx + 2, y: sy + 1.25, z: 0 }, { x: sx, y: sy + 1.25, z: 0 }];
    props(footprint, () => {
      for (const dx of [0, 2]) for (const dy of [0, 1.2]) line({ x: sx + dx, y: sy + dy, z: 0 }, { x: sx + dx, y: sy + dy, z: 1.5 }, "#71593a", 4);
      for (let stripe = 0; stripe < 8; stripe++) poly([{ x: sx + stripe * 0.25, y: sy, z: 1.5 }, { x: sx + (stripe + 1) * 0.25, y: sy, z: 1.5 }, { x: sx + (stripe + 1) * 0.25, y: sy + 1.25, z: 1.25 }, { x: sx + stripe * 0.25, y: sy + 1.25, z: 1.25 }], stripe % 2 ? (blue ? "#5c7b89" : "#a38b62") : "#d6c8a5", "#8e826733");
    });
  }
  for (const lamp of LAMPS) props([{ ...lamp, z: 0 }], () => {
    line({ ...lamp, z: 0 }, { ...lamp, z: 2.25 }, "#202927", 3);
    const q = screen({ ...lamp, z: 2.25 });
    ctx.fillStyle = "#d6ab62"; ctx.fillRect(q.x - 3 * camera.scale, q.y - 5 * camera.scale, 6 * camera.scale, 9 * camera.scale);
    ctx.strokeStyle = "#55462c"; ctx.strokeRect(q.x - 4 * camera.scale, q.y - 6 * camera.scale, 8 * camera.scale, 11 * camera.scale);
  });
  if (!hidden || view.cutaway) {
    const p = screen({ ...view.at, z: 0.08 });
    ctx.beginPath(); ctx.ellipse(p.x, p.y + 5 * camera.scale, 17 * camera.scale, 8 * camera.scale, 0, 0, Math.PI * 2); ctx.fillStyle = "#08141599"; ctx.fill();
    ctx.beginPath(); ctx.arc(p.x, p.y - 9 * camera.scale, 13 * camera.scale, 0, Math.PI * 2); ctx.fillStyle = "#397c82"; ctx.fill(); ctx.strokeStyle = "#e5bc70"; ctx.lineWidth = 2 * camera.scale; ctx.stroke();
    ctx.strokeStyle = "#f4f5dd"; ctx.lineWidth = 2 * camera.scale; ctx.beginPath(); ctx.moveTo(p.x, p.y - 17 * camera.scale); ctx.lineTo(p.x, p.y - camera.scale); ctx.moveTo(p.x - 7 * camera.scale, p.y - 9 * camera.scale); ctx.lineTo(p.x + 7 * camera.scale, p.y - 9 * camera.scale); ctx.stroke();
    const torch = screen({ x: view.at.x + 0.3, y: view.at.y, z: view.torchHeight });
    line({ x: view.at.x + 0.3, y: view.at.y, z: 0.3 }, { x: view.at.x + 0.3, y: view.at.y, z: view.torchHeight }, "#aa8148", 2);
    ctx.beginPath(); ctx.ellipse(torch.x, torch.y - 3 * camera.scale, 3 * camera.scale, 6 * camera.scale, 0, 0, Math.PI * 2); ctx.fillStyle = "#ffce76"; ctx.fill();
  }
  return { cutaways };
}
