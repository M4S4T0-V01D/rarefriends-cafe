/** Canvas renderer: greyscale isometric shop and street with faded accent colours, framed by a camera in the 960 × 640 view. */
import type { GenerationSprites } from "@rarefriends/friendsdk/sprites";
import { FLOORS, WALLPAPERS, dishById, shopById, workerLevel, type DishId, type DishShape, type ItemKind, type Shop } from "./data.ts";
import { ambience, dayProgress, manager, memberOf, plan, tables, type CafeState, type Customer, type Facing, type Passerby, type StaffWho, type Worker } from "./engine.ts";
import type { GuestArt } from "./guests.ts";
import { cameraFor, project, seatOf, toWorld, unproject, type Camera, type Item, type Tile } from "./layout.ts";

export const VIEW = { width: 960, height: 640 } as const;
export const INK = "#161616", PAPER = "#efede7";
const C = {
  line: "#bdb9b0", dark: "#3b3a38", mid: "#6d6b67", light: "#f7f5f0", rose: "#d8b6b4", sage: "#b4c3ab", blue: "#afbccb",
  butter: "#e2d7ad", lavender: "#c6bed4", amber: "#e3c9a0", wood: "#9c8672",
};

export type Floater = { text: string; x: number; y: number; age: number; tone: "coin" | "vip" | "angry" | "info" };
export type BuildView = { cursor: Tile | null; ghost: Omit<Item, "id"> | null; valid: boolean; selected: number | null };
export type Scene = {
  state: CafeState; now: number; reducedMotion: boolean; guests: readonly GuestArt[];
  regulars: ReadonlyMap<number, GenerationSprites>; friend: GenerationSprites; staffSprites: ReadonlyMap<number, GenerationSprites>;
  floaters: readonly Floater[]; hover: Tile | null; build: BuildView | null;
};

// ---------- Sprite cache ----------
const spriteCache = new Map<string, HTMLCanvasElement>();
/** Canonical look: black one-bit mask with a one-pixel white halo, integer-scaled. */
function spriteCanvas(rows: readonly string[], scale: number, ink = INK): HTMLCanvasElement {
  const id = `${ink}:${scale}:${rows.join("")}`;
  let canvas = spriteCache.get(id);
  if (canvas) return canvas;
  canvas = document.createElement("canvas");
  canvas.width = canvas.height = 18 * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  rows.forEach((row, y) => [...row].forEach((pixel, x) => { if (pixel === "#") ctx.fillRect(x * scale, y * scale, scale * 3, scale * 3); }));
  ctx.fillStyle = ink;
  rows.forEach((row, y) => [...row].forEach((pixel, x) => { if (pixel === "#") ctx.fillRect((x + 1) * scale, (y + 1) * scale, scale, scale); }));
  if (spriteCache.size > 500) spriteCache.delete(spriteCache.keys().next().value!);
  spriteCache.set(id, canvas);
  return canvas;
}
export function friendRows(sprites: GenerationSprites, facing: Facing, walking: boolean, frame: number): readonly string[] {
  const vertical = sprites.familyId === 6 && (facing === "up" || facing === "down");
  return sprites.clips[walking ? "walk" : "idle"][vertical ? "right" : facing][frame].rows;
}

// ---------- Isometric primitives ----------
type Point = { x: number; y: number };
function poly(ctx: CanvasRenderingContext2D, points: readonly Point[], fill: string, stroke?: string) {
  ctx.beginPath(); points.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y)); ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
}
/** A box centred on a grid point with a footprint in tiles and height in pixels. */
function box(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, d: number, h: number, top: string, left: string, right: string, lift = 0) {
  const b = project(x - w / 2, y - d / 2, lift), r = project(x + w / 2, y - d / 2, lift), f = project(x + w / 2, y + d / 2, lift), l = project(x - w / 2, y + d / 2, lift);
  poly(ctx, [l, f, { x: f.x, y: f.y - h }, { x: l.x, y: l.y - h }], left, INK);
  poly(ctx, [f, r, { x: r.x, y: r.y - h }, { x: f.x, y: f.y - h }], right, INK);
  poly(ctx, [b, r, f, l].map(point => ({ x: point.x, y: point.y - h })), top, INK);
}
function shadow(ctx: CanvasRenderingContext2D, x: number, y: number, radius = 16) {
  const point = project(x, y);
  ctx.fillStyle = "rgba(22,22,22,.16)"; ctx.beginPath(); ctx.ellipse(point.x, point.y, radius, radius / 2.4, 0, 0, Math.PI * 2); ctx.fill();
}
const tileQuad = (x: number, y: number, inset = 0) =>
  [project(x - 0.5 + inset, y - 0.5 + inset), project(x + 0.5 - inset, y - 0.5 + inset), project(x + 0.5 - inset, y + 0.5 - inset), project(x - 0.5 + inset, y + 0.5 - inset)];
function line(ctx: CanvasRenderingContext2D, a: Point, b: Point) { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }

// ---------- Static layer: paper, street, walls and floors ----------
let backdrop: { canvas: HTMLCanvasElement; key: string } | null = null;
const W = (x: number, y: number, h: number) => project(x, y, h);
const S = -0.5, H = 132;

/** Paint a wallpaper pattern on one wall plane of length `length`: along = "x" is the street-side back wall, "y" the kitchen wall. */
function wallpaper(ctx: CanvasRenderingContext2D, id: string, along: "x" | "y", colors: readonly string[], length: number) {
  const at = (t: number, h: number) => along === "x" ? W(S + t, S, h) : W(S, S + t, h);
  poly(ctx, [at(0, 0), at(length, 0), at(length, H), at(0, H)], colors[along === "x" ? 1 : 0], INK);
  ctx.save();
  ctx.beginPath(); [at(0, 38), at(length, 38), at(length, H), at(0, H)].forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); ctx.clip();
  ctx.strokeStyle = "rgba(22,22,22,.12)"; ctx.fillStyle = "rgba(22,22,22,.1)"; ctx.lineWidth = 1;
  if (id === "stripes") { ctx.lineWidth = 5; ctx.strokeStyle = "rgba(216,182,180,.55)"; for (let t = 0.25; t < length; t += 0.5) line(ctx, at(t, 38), at(t, H)); }
  else if (id === "dots") { for (let t = 0.25; t < length; t += 0.5) for (let h = 48; h < H; h += 16) { const p = at(t + ((h / 16) % 2) * 0.25, h); ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI * 2); ctx.fill(); } }
  else if (id === "brick") { for (let h = 38, row = 0; h < H; h += 10, row++) { line(ctx, at(0, h), at(length, h)); for (let t = (row % 2) * 0.3; t < length; t += 0.6) line(ctx, at(t, h), at(t, h + 10)); } }
  else if (id === "panel") { ctx.strokeStyle = "rgba(22,22,22,.2)"; for (let t = 0; t < length; t += 0.34) line(ctx, at(t, 38), at(t, H)); }
  else if (id === "damask") {
    ctx.fillStyle = "rgba(247,245,240,.35)";
    for (let t = 0.5; t < length; t += 1) for (let h = 56; h < H; h += 30) {
      const p = at(t + ((h / 30) % 2) * 0.5, h); ctx.beginPath(); ctx.ellipse(p.x, p.y, 5, 8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(p.x, p.y, 9, 3, 0, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
  poly(ctx, [at(0, 0), at(length, 0), at(length, 38), at(0, 38)], along === "x" ? "#c4c1b9" : "#b3b0a8", INK);
  ctx.strokeStyle = "rgba(22,22,22,.18)";
  for (let t = 0; t <= length; t += 0.5) line(ctx, at(t, 0), at(t, 38));
}

function paintFloorTile(ctx: CanvasRenderingContext2D, id: string, x: number, y: number, colors: readonly string[]) {
  const quad = tileQuad(x, y);
  const alt = ((x + y) % 2 + 2) % 2 === 1;
  if (id === "checker") { poly(ctx, quad, alt ? colors[1] : colors[0]); return; }
  if (id === "planks") {
    poly(ctx, quad, colors[0]);
    ctx.strokeStyle = "rgba(22,22,22,.14)";
    for (let t = -0.25; t < 0.5; t += 0.25) line(ctx, project(x - 0.5, y + t), project(x + 0.5, y + t));
    const seam = (((x * 7 + y * 3) % 4) + 4) % 4 / 4 - 0.5; line(ctx, project(x + seam, y - 0.5), project(x + seam, y - 0.25));
    return;
  }
  if (id === "hex") { poly(ctx, quad, colors[alt ? 1 : 0]); poly(ctx, tileQuad(x, y, 0.2), "rgba(0,0,0,0)", "rgba(247,245,240,.6)"); return; }
  if (id === "terrazzo") {
    poly(ctx, quad, colors[0]);
    const flecks = [C.rose, C.sage, C.dark, C.blue, C.butter];
    for (let i = 0; i < 6; i++) {
      const seed = Math.abs(x * 31 + y * 17 + i * 13) % 97, p = project(x - 0.4 + (seed % 9) / 10, y - 0.4 + ((seed * 7) % 9) / 10);
      ctx.fillStyle = flecks[seed % flecks.length]; ctx.globalAlpha = 0.6; ctx.fillRect(p.x, p.y, 2.5, 1.8); ctx.globalAlpha = 1;
    }
    return;
  }
  if (id === "herringbone") {
    poly(ctx, quad, colors[alt ? 0 : 1]);
    ctx.strokeStyle = "rgba(22,22,22,.18)";
    for (let t = -0.5; t < 0.5; t += 0.25) {
      if (alt) line(ctx, project(x - 0.5, y + t), project(x + 0.5, y + t)); else line(ctx, project(x + t, y - 0.5), project(x + t, y + 0.5));
    }
    return;
  }
  if (id === "kitchen") { poly(ctx, quad, alt ? "#e9e7e2" : "#d9d6cf"); poly(ctx, tileQuad(x, y, 0.25), "rgba(0,0,0,0)", "rgba(22,22,22,.08)"); return; }
  if (id === "lounge") { poly(ctx, quad, alt ? "#d8c9b6" : "#cdbda8"); return; }
  if (id === "sidewalk") { poly(ctx, quad, alt ? "#dcdad4" : "#d2d0ca"); poly(ctx, tileQuad(x, y, 0.03), "rgba(0,0,0,0)", "rgba(22,22,22,.12)"); return; }
  // marble
  poly(ctx, quad, colors[alt ? 1 : 0]);
  ctx.strokeStyle = "rgba(160,140,138,.4)";
  const a = project(x - 0.5, y + (Math.abs(x * 3 + y) % 5) / 10 - 0.2), b = project(x + 0.5, y - (Math.abs(x + y * 3) % 5) / 10 + 0.2);
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo((a.x + b.x) / 2 + 6, (a.y + b.y) / 2 - 4, b.x, b.y); ctx.stroke();
}

function paintBackdrop(state: CafeState, scale: number, camera: Camera) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(VIEW.width * scale); canvas.height = Math.round(VIEW.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  ctx.fillStyle = PAPER; ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  ctx.fillStyle = "rgba(22,22,22,.05)";
  for (let y = 4; y < VIEW.height; y += 12) for (let x = (y / 12) % 2 ? 10 : 4; x < VIEW.width; x += 12) ctx.fillRect(x, y, 1.5, 1.5);
  ctx.translate(camera.x, camera.y); ctx.scale(camera.zoom, camera.zoom);
  const shop = shopById(state.shop), level = ambience(state), layout = plan(state), N = layout.size;

  // Outside: sidewalk, curb and a quiet road.
  for (let y = layout.laneStart; y <= layout.laneEnd; y++) for (let x = N; x <= layout.lane; x++) paintFloorTile(ctx, "sidewalk", x, y, []);
  poly(ctx, [project(layout.lane + 0.5, layout.laneStart - 0.5), project(layout.lane + 2.5, layout.laneStart - 0.5), project(layout.lane + 2.5, layout.laneEnd + 0.5), project(layout.lane + 0.5, layout.laneEnd + 0.5)], "#9b9994");
  ctx.strokeStyle = C.light; ctx.lineWidth = 2; ctx.setLineDash([10, 12]);
  line(ctx, project(layout.lane + 1.5, layout.laneStart - 0.5), project(layout.lane + 1.5, layout.laneEnd + 0.5)); ctx.setLineDash([]); ctx.lineWidth = 1;
  box(ctx, layout.lane + 0.55, (layout.laneStart + layout.laneEnd) / 2, 0.1, layout.laneEnd - layout.laneStart + 1, 4, "#c7c4bd", "#a9a6a0", "#b8b5ae");
  // A striped crossing in front of the door.
  for (let i = 0; i < 4; i++) poly(ctx, [project(layout.lane + 0.7, layout.door.y - 0.45 + i * 0.25), project(layout.lane + 2.3, layout.door.y - 0.45 + i * 0.25), project(layout.lane + 2.3, layout.door.y - 0.35 + i * 0.25), project(layout.lane + 0.7, layout.door.y - 0.35 + i * 0.25)], "rgba(247,245,240,.8)");

  const paper = WALLPAPERS.find(item => item.id === state.wallpaper) ?? WALLPAPERS[0];
  wallpaper(ctx, paper.id, "y", paper.colors, N);
  wallpaper(ctx, paper.id, "x", paper.colors, N);
  // Street-side back wall: the shop sign and menu board over the dining room, then windows with awnings.
  poly(ctx, [W(3.1, S, 60), W(5.9, S, 60), W(5.9, S, 110), W(3.1, S, 110)], "#2c2c2b", INK);
  ctx.save(); ctx.strokeStyle = "rgba(247,245,240,.55)"; ctx.lineWidth = 1.2;
  for (let row = 0; row < 4; row++) line(ctx, W(3.5, S, 98 - row * 10), W(5 + (row % 2) * 0.5, S, 98 - row * 10));
  ctx.restore();
  poly(ctx, [W(2.9, S, 114), W(6.1, S, 114), W(6.1, S, 130), W(2.9, S, 130)], C.light, INK);
  const title = W(4.5, S, 118);
  ctx.save(); ctx.translate(title.x, title.y); ctx.transform(1, -0.5, 0, 1, 0, 0); ctx.fillStyle = INK; ctx.font = "bold 11px ui-monospace, monospace"; ctx.textAlign = "center"; ctx.fillText(shop.sign, 0, 0); ctx.restore();
  for (let start = 6.8; start + 2.2 <= N - 1.2; start += 3) {
    const w = 2.2, lo = 50, hi = 112;
    poly(ctx, [W(start, S, lo), W(start + w, S, lo), W(start + w, S, hi), W(start, S, hi)], "#c9d2da", INK);
    ctx.strokeStyle = INK; line(ctx, W(start + w / 2, S, lo), W(start + w / 2, S, hi)); line(ctx, W(start, S, (lo + hi) / 2), W(start + w, S, (lo + hi) / 2));
    for (let i = 0; i < 4; i++) poly(ctx, [W(start + i * w / 4, S, hi + 4), W(start + (i + 1) * w / 4, S, hi + 4), W(start + (i + 1) * w / 4, S - 0.25, hi - 6), W(start + i * w / 4, S - 0.25, hi - 6)], i % 2 ? C.light : shop.accent, INK);
  }
  if (level >= 4) framed(ctx, W(N - 1.6, S, 94), C.lavender, true);
  // Kitchen wall: a hood over the stoves and shelves of jars.
  poly(ctx, [W(S, 0, 96), W(S, layout.kitchenEnd, 96), W(S + 0.35, layout.kitchenEnd, 104), W(S + 0.35, 0, 104)], "#a9a6a0", INK);
  for (let y = 0.6; y < layout.kitchenEnd - 0.4; y += 0.8) {
    const p = W(S + 0.12, y, 116), color = [C.rose, C.sage, C.butter, C.blue][Math.floor(y) % 4];
    ctx.fillStyle = color; ctx.fillRect(p.x - 5, p.y - 14, 10, 14); ctx.strokeStyle = INK; ctx.strokeRect(p.x - 5, p.y - 14, 10, 14);
  }
  // Break room wall: a sign and a picture.
  const sign = W(S, layout.kitchenEnd + 2, 96);
  ctx.save(); ctx.translate(sign.x, sign.y); ctx.transform(1, 0.5, 0, 1, 0, 0);
  ctx.fillStyle = C.light; ctx.fillRect(-36, -12, 72, 18); ctx.strokeStyle = INK; ctx.strokeRect(-36, -12, 72, 18);
  ctx.fillStyle = INK; ctx.font = "bold 10px ui-monospace, monospace"; ctx.textAlign = "center"; ctx.fillText("BREAK ROOM", 0, 1); ctx.restore();
  if (level >= 1) framed(ctx, W(S, layout.kitchenEnd + 3.2, 70), C.sage);
  if (level >= 2) framed(ctx, W(S, 2, 70), shop.accent);

  // Floors: kitchen tiles, lounge wood in the break room, the chosen design in the dining room.
  const floor = FLOORS.find(item => item.id === state.floor) ?? FLOORS[0];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const kind = x < 2 && y < layout.kitchenEnd || (x === 1 && y === layout.kitchenEnd) ? "kitchen" : x < 3 && y > layout.kitchenEnd ? "lounge" : floor.id;
    paintFloorTile(ctx, kind, x, y, floor.colors);
  }
  ctx.strokeStyle = C.line; ctx.lineWidth = 0.6;
  for (let t = -0.5; t <= N - 0.5; t += 1) { line(ctx, project(t, -0.5), project(t, N - 0.5)); line(ctx, project(-0.5, t), project(N - 0.5, t)); }
  poly(ctx, [project(-0.5, -0.5), project(N - 0.5, -0.5), project(N - 0.5, N - 0.5), project(-0.5, N - 0.5)], "rgba(0,0,0,0)", INK);
  return canvas;
}
function framed(ctx: CanvasRenderingContext2D, at: Point, color: string, right = false) {
  ctx.save(); ctx.translate(at.x, at.y); ctx.transform(1, right ? -0.5 : 0.5, 0, 1, 0, 0);
  ctx.fillStyle = C.light; ctx.fillRect(-15, -22, 30, 26); ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.strokeRect(-15, -22, 30, 26);
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, -9, 7, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}

// ---------- Dish icons ----------
function heart(ctx: CanvasRenderingContext2D, hx: number, hy: number, color: string, size = 2.2) {
  ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(hx, hy + size); ctx.arc(hx - size / 2, hy, size / 2, Math.PI * 0.8, 0); ctx.arc(hx + size / 2, hy, size / 2, Math.PI, Math.PI * 0.2); ctx.closePath(); ctx.fill();
}
function ellipseShape(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string) {
  ctx.fillStyle = fill; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
}
export function drawDish(ctx: CanvasRenderingContext2D, id: DishId, x: number, y: number, s = 1) {
  const dish = dishById(id);
  drawShape(ctx, dish.shape, dish.color, dish.accent, x, y, s, dish.blend === 1);
}
export function drawShape(ctx: CanvasRenderingContext2D, shape: DishShape, color: string, accent: string, x: number, y: number, s = 1, sparkle = false) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.lineWidth = 1.2; ctx.strokeStyle = INK;
  const plate = () => ellipseShape(ctx, 0, 5, 10, 3.5, C.light);
  const cup = (fill: string, top: string, tall = 0) => {
    ctx.fillStyle = fill; ctx.beginPath(); ctx.moveTo(-6, -5 - tall); ctx.lineTo(6, -5 - tall); ctx.lineTo(4.5, 4); ctx.lineTo(-4.5, 4); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(7, -1, 2.6, -Math.PI / 2, Math.PI / 2); ctx.stroke();
    ellipseShape(ctx, 0, -5 - tall, 6, 1.8, top);
  };
  const bowl = (fill: string) => {
    ctx.fillStyle = C.light; ctx.beginPath(); ctx.moveTo(-10, -2); ctx.quadraticCurveTo(0, 12, 10, -2); ctx.closePath(); ctx.fill(); ctx.stroke();
    ellipseShape(ctx, 0, -2, 10, 3.2, fill);
  };
  switch (shape) {
    case "cup": plate(); cup(C.light, color); break;
    case "latte": plate(); cup(C.light, color, 2); heart(ctx, 0, -7.4, accent, 2.4); break;
    case "tall": {
      ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(-5, -12); ctx.lineTo(5, -12); ctx.lineTo(3.5, 5); ctx.lineTo(-3.5, 5); ctx.closePath(); ctx.fill(); ctx.stroke();
      ellipseShape(ctx, 0, -12, 5.5, 3, accent); ctx.beginPath(); ctx.moveTo(2, -12); ctx.lineTo(5, -18); ctx.stroke(); break;
    }
    case "bowl": bowl(color); ctx.fillStyle = accent; ctx.fillRect(-4, -4, 3, 2); ctx.fillRect(2, -3, 3, 2); break;
    case "noodles": bowl(color); ctx.strokeStyle = accent; for (const dx of [-5, -1, 3]) { ctx.beginPath(); ctx.moveTo(dx, -3); ctx.quadraticCurveTo(dx + 2, -8, dx + 1, -12); ctx.stroke(); }
      ctx.strokeStyle = INK; ellipseShape(ctx, 4, -3, 2.5, 1.5, "#f6f1e4"); ctx.beginPath(); ctx.moveTo(-8, -10); ctx.lineTo(6, -14); ctx.stroke(); break;
    case "plate": plate(); ellipseShape(ctx, -2, 1, 6, 3, "#f6f3ec"); ellipseShape(ctx, 3, 0, 5, 2.6, color); ctx.fillStyle = accent; ctx.fillRect(1, -3, 4, 2); break;
    case "fish": plate(); ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(-1, 0, 7, 3.4, 0, 0, Math.PI * 2); ctx.moveTo(6, 0); ctx.lineTo(10, -3); ctx.lineTo(10, 3); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = accent; for (let i = 0; i < 3; i++) ctx.fillRect(-7 + i * 2, 3 + (i % 2), 1.5, 4); break;
    case "fries": {
      ctx.fillStyle = accent; ctx.beginPath(); ctx.moveTo(-6, -2); ctx.lineTo(6, -2); ctx.lineTo(4, 6); ctx.lineTo(-4, 6); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = color; for (let i = -4; i <= 4; i += 2) { ctx.fillRect(i - 0.8, -9 + Math.abs(i) * 0.6, 1.8, 8); ctx.strokeRect(i - 0.8, -9 + Math.abs(i) * 0.6, 1.8, 8); } break;
    }
    case "skewer": plate(); ctx.beginPath(); ctx.moveTo(-10, 3); ctx.lineTo(10, -5); ctx.stroke(); for (const t of [-5, 0, 5]) ellipseShape(ctx, t, -1 - t * 0.4, 3.2, 2.6, t === 0 ? accent : color); break;
    case "dumplings": plate(); for (const dx of [-5, 0, 5]) { ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(dx - 4, 2); ctx.quadraticCurveTo(dx, -7, dx + 4, 2); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      ctx.fillStyle = accent; ctx.fillRect(-1, -6, 2, 2); break;
    case "sushi": plate(); for (const dx of [-5, 1, 7]) { ellipseShape(ctx, dx - 1, 0, 3, 2.2, color); ctx.fillStyle = accent; ctx.fillRect(dx - 3.5, -3, 5, 2); } break;
    case "burger":
      ellipseShape(ctx, 0, 4, 9, 2.6, "#c7a47f"); ctx.fillStyle = color; ctx.fillRect(-9, -1, 18, 3.5); ctx.strokeRect(-9, -1, 18, 3.5);
      ctx.fillStyle = accent; ctx.fillRect(-8, -2.5, 16, 1.8);
      ctx.fillStyle = "#d9b98f"; ctx.beginPath(); ctx.ellipse(0, -3, 9, 6, 0, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = C.light; for (const dx of [-4, 0, 4]) ctx.fillRect(dx, -6 - Math.abs(dx) * 0.2, 1.2, 1); break;
    case "bread": plate(); ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(0, -1, 9, 4.2, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = accent; ctx.fillRect(-6, -3, 12, 2); break;
    case "croissant": plate(); ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, 3, 9, Math.PI * 1.05, Math.PI * 1.95); ctx.arc(0, 3, 4, Math.PI * 1.95, Math.PI * 1.05, true); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = accent; for (const a of [1.3, 1.5, 1.7]) line(ctx, { x: Math.cos(Math.PI * a) * 4, y: 3 + Math.sin(Math.PI * a) * 4 }, { x: Math.cos(Math.PI * a) * 9, y: 3 + Math.sin(Math.PI * a) * 9 }); break;
    case "cake": plate(); ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(-7, 3); ctx.lineTo(7, 3); ctx.lineTo(7, -5); ctx.lineTo(-3, -8); ctx.lineTo(-7, -5); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = accent; ctx.fillRect(-7, -1.5, 14, 2); ctx.beginPath(); ctx.arc(0, -9, 2.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); break;
    case "macaron": plate(); [[-5, color], [0, accent], [5, C.butter]].forEach(([dx, fill]) => { ellipseShape(ctx, dx as number, 0, 3.4, 2, fill as string); ellipseShape(ctx, dx as number, -3, 3.4, 2, fill as string); }); break;
    case "shells": plate(); for (const [dx, dy] of [[-5, 0], [4, 1], [0, -3]]) { ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(dx, dy, 4.5, 3, 0.3, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ellipseShape(ctx, dx, dy, 1.8, 1.2, accent); } break;
    case "pan": ctx.fillStyle = C.dark; ctx.beginPath(); ctx.ellipse(0, 1, 11, 5, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(15, -3); ctx.stroke();
      ellipseShape(ctx, 0, 0, 9, 4, color); ctx.fillStyle = accent; for (const [dx, dy] of [[-4, -1], [3, 1], [0, -2], [5, -1]]) ctx.fillRect(dx, dy, 2.5, 1.8); break;
    case "rice": plate(); ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(-6, 3); ctx.lineTo(0, -8); ctx.lineTo(6, 3); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = accent; ctx.fillRect(-4, -1, 8, 4); break;
    case "mochi": plate(); for (const dx of [-4, 4]) ellipseShape(ctx, dx, 0, 4.5, 4, color); ctx.fillStyle = accent; ctx.fillRect(-1, -6, 2, 3); break;
    case "pancakes": plate(); for (let i = 0; i < 3; i++) ellipseShape(ctx, 0, 2 - i * 3.2, 7.5, 2.6, color); ctx.fillStyle = accent; ctx.fillRect(-2, -9, 4, 2.5); break;
    case "omurice": plate(); ellipseShape(ctx, 0, 0, 8.5, 4.6, color); heart(ctx, 0, -1, accent, 3.6); break;
    case "parfait": {
      ctx.fillStyle = C.light; ctx.beginPath(); ctx.moveTo(-5, -10); ctx.lineTo(5, -10); ctx.lineTo(2, 1); ctx.lineTo(-2, 1); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = color; ctx.fillRect(-4, -7, 8, 3); ctx.fillStyle = accent; ctx.fillRect(-3.5, -4, 7, 2.5);
      line(ctx, { x: 0, y: 1 }, { x: 0, y: 5 }); ellipseShape(ctx, 0, 5, 4, 1.4, C.light); ellipseShape(ctx, 0, -12, 2.4, 2.4, C.rose); break;
    }
  }
  if (sparkle) { ctx.fillStyle = "#fff"; ctx.strokeStyle = INK; ctx.fillRect(7, -13, 2, 6); ctx.fillRect(5, -11, 6, 2); }
  ctx.restore();
}

// ---------- Furniture ----------
function drawTable(ctx: CanvasRenderingContext2D, item: Item, number: number, accent: string) {
  shadow(ctx, item.x, item.y, 20);
  const base = project(item.x, item.y);
  ctx.fillStyle = C.dark; ctx.fillRect(base.x - 2, base.y - 22, 4, 22);
  ctx.beginPath(); ctx.ellipse(base.x, base.y - 1, 9, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = 1.4;
  ctx.fillStyle = "#e4e1da"; ctx.beginPath(); ctx.ellipse(base.x, base.y - 22, 24, 10, 0, 0, Math.PI); ctx.fill(); ctx.stroke();
  ctx.fillStyle = C.light; ctx.beginPath(); ctx.ellipse(base.x, base.y - 25, 24, 10, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = C.mid; ctx.font = "bold 9px ui-monospace, monospace"; ctx.textAlign = "center"; ctx.fillText(String(number), base.x + 14, base.y - 23);
  ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(base.x - 10, base.y - 31, 2.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  line(ctx, { x: base.x - 10, y: base.y - 28.5 }, { x: base.x - 10, y: base.y - 25 });
}
function drawChair(ctx: CanvasRenderingContext2D, seat: Tile, dir: 0 | 1) {
  box(ctx, seat.x, seat.y, 0.42, 0.42, 14, "#8b8883", "#5f5d59", "#76736f");
  if (dir === 0) box(ctx, seat.x, seat.y - 0.2, 0.42, 0.06, 20, "#8b8883", "#5f5d59", "#76736f", 14);
  else box(ctx, seat.x - 0.2, seat.y, 0.06, 0.42, 20, "#8b8883", "#5f5d59", "#76736f", 14);
}
function drawRug(ctx: CanvasRenderingContext2D, tile: Tile, alpha = 0.7) {
  ctx.globalAlpha = alpha;
  poly(ctx, tileQuad(tile.x, tile.y, 0.04), C.rose, INK);
  ctx.setLineDash([3, 3]); poly(ctx, tileQuad(tile.x, tile.y, 0.16), "rgba(0,0,0,0)", "rgba(22,22,22,.4)"); ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}
function drawItem(ctx: CanvasRenderingContext2D, kind: ItemKind, tile: Tile, now: number, reducedMotion: boolean) {
  shadow(ctx, tile.x, tile.y, 16);
  const base = project(tile.x, tile.y);
  if (kind === "plant") {
    box(ctx, tile.x, tile.y, 0.4, 0.4, 18, "#9c8d7f", "#7b6e62", "#8b7d70");
    ctx.fillStyle = C.sage; ctx.strokeStyle = INK;
    for (const [dx, dy, r] of [[-9, -34, 10], [8, -38, 11], [0, -50, 10], [-3, -28, 8]]) { ctx.beginPath(); ctx.ellipse(base.x + dx, base.y + dy, r, r * 0.7, dx / 20, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
  } else if (kind === "lamp") {
    ctx.fillStyle = C.dark; ctx.fillRect(base.x - 1.5, base.y - 70, 3, 70);
    const glow = ctx.createRadialGradient(base.x, base.y - 72, 2, base.x, base.y - 72, 60);
    glow.addColorStop(0, "rgba(227,201,160,.45)"); glow.addColorStop(1, "rgba(227,201,160,0)");
    ctx.fillStyle = glow; ctx.fillRect(base.x - 60, base.y - 132, 120, 120);
    ctx.fillStyle = C.amber; ctx.strokeStyle = INK; ctx.beginPath(); ctx.moveTo(base.x - 12, base.y - 66); ctx.lineTo(base.x + 12, base.y - 66); ctx.lineTo(base.x + 7, base.y - 84); ctx.lineTo(base.x - 7, base.y - 84); ctx.closePath(); ctx.fill(); ctx.stroke();
  } else if (kind === "shelf") {
    box(ctx, tile.x, tile.y, 0.8, 0.35, 70, "#a38d77", "#7c6a58", "#8f7b67");
    const colors = [C.rose, C.blue, C.sage, C.butter, C.lavender, C.mid];
    for (let row = 0; row < 3; row++) for (let i = 0; i < 5; i++) {
      const p = project(tile.x - 0.3 + i * 0.13, tile.y + 0.18, 10 + row * 20);
      ctx.fillStyle = colors[(i + row * 2) % colors.length]; ctx.fillRect(p.x - 2, p.y - 14, 4, 14); ctx.strokeStyle = INK; ctx.strokeRect(p.x - 2, p.y - 14, 4, 14);
    }
  } else if (kind === "record") {
    box(ctx, tile.x, tile.y, 0.6, 0.6, 26, "#8a6f5c", "#5d4b3f", "#735e4f");
    const top = project(tile.x, tile.y, 26), spin = reducedMotion ? 0 : now / 500;
    ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(top.x, top.y, 14, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.rose; ctx.beginPath(); ctx.ellipse(top.x, top.y, 4, 1.8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(247,245,240,.5)"; ctx.beginPath(); ctx.ellipse(top.x, top.y, 9, 3.8, 0, spin, spin + 1.4); ctx.stroke();
    if (!reducedMotion) { const t = (now / 1400) % 1; ctx.globalAlpha = 1 - t; ctx.fillStyle = INK; ctx.font = "12px ui-monospace, monospace"; ctx.textAlign = "center"; ctx.fillText("♪", top.x + 12 + t * 8, top.y - 12 - t * 26); ctx.globalAlpha = 1; }
  } else if (kind === "piano") {
    box(ctx, tile.x, tile.y, 0.85, 0.45, 50, "#2e2d2b", "#1f1e1d", "#292826");
    box(ctx, tile.x + 0.05, tile.y + 0.28, 0.75, 0.2, 4, C.light, "#cfccc5", "#e1ded7", 26);
    const top = project(tile.x, tile.y, 50); ctx.fillStyle = C.butter; ctx.fillRect(top.x - 5, top.y - 10, 4, 10); ctx.fillStyle = C.rose; ctx.fillRect(top.x + 2, top.y - 8, 4, 8);
  }
}
function drawStation(ctx: CanvasRenderingContext2D, shop: Shop, top: Point, tile: Tile, busy: boolean, now: number, reducedMotion: boolean) {
  const steam = () => {
    if (!busy) return;
    ctx.strokeStyle = "rgba(90,90,90,.45)"; ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const t = reducedMotion ? 0.5 : (now / 900 + i / 3) % 1;
      ctx.beginPath(); ctx.moveTo(top.x - 6 + i * 6, top.y - 34 - t * 16); ctx.quadraticCurveTo(top.x - 2 + i * 6, top.y - 40 - t * 16, top.x - 6 + i * 6, top.y - 46 - t * 16); ctx.stroke();
    }
    ctx.lineWidth = 1;
  };
  if (shop.station === "espresso") {
    box(ctx, tile.x, tile.y, 0.6, 0.55, 30, "#d9d6cf", "#a9a6a0", "#c1beb7", 36);
    ctx.fillStyle = INK; ctx.fillRect(top.x - 3, top.y - 14, 6, 6); ctx.fillStyle = shop.accent; ctx.beginPath(); ctx.arc(top.x + 8, top.y - 24, 2.5, 0, Math.PI * 2); ctx.fill(); steam();
  } else if (shop.station === "tank") {
    box(ctx, tile.x, tile.y, 0.7, 0.55, 34, "rgba(175,188,203,.75)", "rgba(150,166,184,.75)", "rgba(165,180,196,.75)", 36);
    const bob = reducedMotion ? 0 : Math.sin(now / 500) * 2;
    ctx.fillStyle = C.light; ctx.strokeStyle = INK;
    for (const [dx, dy] of [[-6, -14], [5, -24]]) { ctx.beginPath(); ctx.ellipse(top.x + dx + bob, top.y + dy, 5, 2.5, 0, 0, Math.PI * 2); ctx.moveTo(top.x + dx + bob + 5, top.y + dy); ctx.lineTo(top.x + dx + bob + 8, top.y + dy - 2); ctx.lineTo(top.x + dx + bob + 8, top.y + dy + 2); ctx.closePath(); ctx.fill(); ctx.stroke(); }
  } else if (shop.station === "oven") {
    box(ctx, tile.x, tile.y, 0.65, 0.55, 30, "#cfc3b3", "#a8998a", "#bcae9f", 36);
    const glow = project(tile.x + 0.1, tile.y + 0.28, 48); ctx.fillStyle = busy ? C.amber : "#8a7e72"; ctx.fillRect(glow.x - 8, glow.y - 6, 14, 9); ctx.strokeRect(glow.x - 8, glow.y - 6, 14, 9);
    drawShape(ctx, "croissant", "#dcc39a", "#b89b73", top.x, top.y - 34, 0.7);
  } else if (shop.station === "grill") {
    box(ctx, tile.x, tile.y, 0.7, 0.6, 12, "#4a4947", "#2e2d2b", "#3b3a38", 36);
    ctx.strokeStyle = C.mid; for (let i = -2; i <= 2; i++) line(ctx, { x: top.x - 14 + i * 2, y: top.y - 12 + i * 3 }, { x: top.x + 14 + i * 2, y: top.y - 12 + i * 3 - 6 });
    if (busy) { const f = reducedMotion ? 0 : Math.sin(now / 120) * 2; ctx.fillStyle = C.amber; ctx.beginPath(); ctx.moveTo(top.x - 6, top.y - 12); ctx.quadraticCurveTo(top.x - 2, top.y - 26 - f, top.x + 2, top.y - 12); ctx.fill(); }
    steam();
  } else {
    for (let i = 0; i < 3; i++) {
      const lift = 36 + i * 10; box(ctx, tile.x, tile.y, 0.55, 0.55, 9, "#d9c7a6", "#b5a283", "#c8b594", lift);
    }
    steam();
  }
}
/** The counter is the kitchen's wall: the pass (ready dishes + bell), the shop's station, the register and service ware. */
function drawCounter(ctx: CanvasRenderingContext2D, tile: Tile, scene: Scene) {
  const { state, now, reducedMotion } = scene, shop = shopById(state.shop), layout = plan(state);
  box(ctx, tile.x, tile.y, 1, 1, 36, "#6a6864", C.dark, "#4d4c49");
  const top = project(tile.x, tile.y, 36), offset = tile.y - layout.pass.y;
  if (offset === 0) {
    const ready = state.orders.filter(order => order.state === "ready");
    ctx.fillStyle = C.light; ctx.beginPath(); ctx.ellipse(top.x, top.y, 20, 8, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = INK; ctx.stroke();
    ready.slice(0, 4).forEach((order, index) => drawDish(ctx, order.dish, top.x - 12 + (index % 2) * 18, top.y - 4 - Math.floor(index / 2) * 12, 0.85));
    if (ready.length) {
      const pulse = reducedMotion ? 1 : 1 + Math.sin(now / 180) * 0.12;
      ctx.fillStyle = C.butter; ctx.strokeStyle = INK; ctx.beginPath(); ctx.arc(top.x + 18, top.y - 26, 9 * pulse, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = INK; ctx.font = "bold 11px ui-monospace, monospace"; ctx.textAlign = "center"; ctx.fillText(String(ready.length), top.x + 18, top.y - 22);
    }
  } else if (offset === -1) drawStation(ctx, shop, top, tile, state.orders.some(order => order.state === "cooking"), now, reducedMotion);
  else if (offset === 1) { box(ctx, tile.x, tile.y, 0.45, 0.4, 14, "#cfccc5", "#9e9b95", "#b8b5ae", 36); ctx.fillStyle = C.sage; ctx.fillRect(top.x - 5, top.y - 22, 10, 5); }
  else if (offset === 2) {
    box(ctx, tile.x, tile.y, 0.7, 0.6, 22, "rgba(220,228,234,.55)", "rgba(190,200,208,.55)", "rgba(205,214,221,.55)", 36);
    const menu = shop.menu;
    drawShape(ctx, menu[3].shape, menu[3].color, menu[3].accent, top.x - 6, top.y - 10, 0.55);
    drawShape(ctx, menu[4].shape, menu[4].color, menu[4].accent, top.x + 6, top.y - 8, 0.55);
  } else if (Math.abs(offset) % 2 === 1) { ctx.fillStyle = C.sage; ctx.beginPath(); ctx.arc(top.x, top.y - 12, 7, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = INK; ctx.stroke(); box(ctx, tile.x, tile.y, 0.3, 0.3, 9, "#b6a594", "#8c7d6e", "#a19080", 36); }
  else { for (const dx of [-7, 0, 7]) { ctx.fillStyle = C.light; ctx.fillRect(top.x + dx - 3, top.y - 9, 6, 8); ctx.strokeStyle = INK; ctx.strokeRect(top.x + dx - 3, top.y - 9, 6, 8); } }
}
/** Kitchen appliances along the back wall: a tall fridge, then stoves, prep tops and a sink. */
function drawStove(ctx: CanvasRenderingContext2D, tile: Tile, busy: boolean, now: number, reducedMotion: boolean) {
  if (tile.y === 0) { box(ctx, tile.x, tile.y, 0.9, 0.9, 88, "#e6e3dc", "#b9b6af", "#cfccc5"); return; }
  if (tile.y % 3 === 2) { box(ctx, tile.x, tile.y, 0.9, 1, 34, "#bdbab3", "#8e8b85", "#a5a29c"); const top = project(tile.x, tile.y, 34); ctx.fillStyle = "#afbccb"; ctx.beginPath(); ctx.ellipse(top.x, top.y, 9, 4, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = INK; ctx.stroke(); return; }
  box(ctx, tile.x, tile.y, 0.9, 1, 34, "#8f8c86", "#6b6964", "#7d7a75");
  const top = project(tile.x, tile.y, 34);
  ctx.strokeStyle = INK;
  for (const dy of [-4, 4]) { ctx.beginPath(); ctx.ellipse(top.x + dy * 1.6, top.y + dy * 0.2, 6, 2.5, 0, 0, Math.PI * 2); ctx.stroke(); }
  if (busy && tile.y % 3 === 1) {
    const flicker = reducedMotion ? 0 : Math.sin(now / 90 + tile.y) * 1.5;
    ctx.fillStyle = "rgba(227,201,160,.9)"; ctx.beginPath(); ctx.ellipse(top.x - 6, top.y - 1, 4, 1.6 + flicker * 0.2, 0, 0, Math.PI * 2); ctx.fill();
  }
}
/** Interior half-height walls between the kitchen, the break room and the dining room. */
function drawWall(ctx: CanvasRenderingContext2D, tile: Tile, along: "x" | "y") {
  if (along === "x") box(ctx, tile.x, tile.y, 1, 0.3, 70, "#d0cdc6", "#b3b0a8", "#c4c1b9");
  else box(ctx, tile.x, tile.y, 0.3, 1, 70, "#d0cdc6", "#b3b0a8", "#c4c1b9");
}
function drawSofa(ctx: CanvasRenderingContext2D, x: number, y: number, length: number) {
  box(ctx, x, y, 0.5, length, 14, C.lavender, "#9d95ab", "#b1a9c0");
  box(ctx, x - 0.2, y, 0.12, length, 30, C.lavender, "#9d95ab", "#b1a9c0");
}
/** Low front walls (so the room stays visible) with the front door, its frame, awning and OPEN sign. */
function drawFrontWall(ctx: CanvasRenderingContext2D, tile: Tile, side: "right" | "left") {
  if (side === "right") box(ctx, tile.x + 0.44, tile.y, 0.12, 1, 22, "#d0cdc6", "#b3b0a8", "#c4c1b9");
  else box(ctx, tile.x, tile.y + 0.44, 1, 0.12, 22, "#d0cdc6", "#b3b0a8", "#c4c1b9");
}
function drawDoor(ctx: CanvasRenderingContext2D, layout: ReturnType<typeof plan>, accent: string) {
  const x = layout.size - 0.5, y = layout.door.y;
  for (const dy of [-0.5, 0.5]) box(ctx, x, y + dy, 0.14, 0.12, 96, C.dark, "#2c2c2b", "#333");
  poly(ctx, [project(x, y - 0.55, 96), project(x, y + 0.55, 96), project(x + 0.5, y + 0.55, 84), project(x + 0.5, y - 0.55, 84)], accent, INK);
  const sign = project(x + 0.2, y, 108);
  ctx.fillStyle = C.light; ctx.strokeStyle = INK; ctx.fillRect(sign.x - 24, sign.y - 9, 48, 15); ctx.strokeRect(sign.x - 24, sign.y - 9, 48, 15);
  ctx.fillStyle = INK; ctx.font = "bold 10px ui-monospace, monospace"; ctx.textAlign = "center"; ctx.fillText("OPEN", sign.x, sign.y + 2);
}
function drawStreetLamp(ctx: CanvasRenderingContext2D, tile: Point) {
  const base = project(tile.x, tile.y);
  ctx.fillStyle = C.dark; ctx.fillRect(base.x - 1.5, base.y - 96, 3, 96);
  ctx.fillStyle = C.butter; ctx.strokeStyle = INK; ctx.beginPath(); ctx.arc(base.x, base.y - 100, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
}
function drawCapsuleMachine(ctx: CanvasRenderingContext2D, tile: Tile, now: number, reducedMotion: boolean) {
  const { x, y } = tile;
  shadow(ctx, x, y, 22);
  box(ctx, x, y, 0.7, 0.7, 44, "#e6e2da", C.rose, "#e2c7c5");
  const top = project(x, y, 44);
  ctx.fillStyle = "rgba(225,232,238,.8)"; ctx.strokeStyle = INK; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.arc(top.x, top.y - 16, 17, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  [[C.butter, -7, -10], [C.blue, 5, -8], [C.sage, -2, -20], [C.lavender, 8, -20], [C.rose, -9, -22]].forEach(([color, dx, dy], index) => {
    const wobble = reducedMotion ? 0 : Math.sin(now / 400 + index) * 1.2;
    ctx.fillStyle = color as string; ctx.beginPath(); ctx.arc(top.x + (dx as number), top.y + (dy as number) + wobble, 4.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  });
  const face = project(x - 0.1, y + 0.35, 24);
  ctx.fillStyle = INK; ctx.font = "bold 10px ui-monospace, monospace"; ctx.textAlign = "center"; ctx.fillText("RF", face.x, face.y);
  const label = project(x, y, 88);
  ctx.fillStyle = C.light; ctx.fillRect(label.x - 34, label.y - 10, 68, 15); ctx.strokeRect(label.x - 34, label.y - 10, 68, 15);
  ctx.fillStyle = INK; ctx.font = "bold 9px ui-monospace, monospace"; ctx.fillText("CAPSULES", label.x, label.y + 1);
}

// ---------- Characters and bubbles ----------
function drawSprite(ctx: CanvasRenderingContext2D, rows: readonly string[], x: number, y: number, lift = 0, ink = INK, scale = 3) {
  const art = spriteCanvas(rows, scale, ink), point = project(x, y, lift);
  ctx.drawImage(art, Math.round(point.x - art.width / 2), Math.round(point.y - art.height + scale * 2));
}
function customerRows(scene: Scene, customer: Customer, frame: number) {
  const walking = customer.walker.moving;
  if (customer.regular !== null) {
    const sprites = scene.regulars.get(customer.regular);
    if (sprites) return friendRows(sprites, customer.walker.facing, walking, walking ? frame % 8 : 0);
  }
  return scene.guests[customer.guest % scene.guests.length].frames[walking ? frame % 2 : 0];
}
/** Rows for a staff Friend: canonical art for owned Friends once loaded, otherwise their guest art. */
export function staffRows(scene: Pick<Scene, "guests" | "staffSprites">, who: StaffWho, facing: Facing, walking: boolean, frame: number) {
  if ("owned" in who) {
    const sprites = scene.staffSprites.get(who.owned);
    if (sprites) return friendRows(sprites, facing, walking, walking ? frame % 8 : 0);
    return scene.guests[who.owned % scene.guests.length].frames[walking ? frame % 2 : 0];
  }
  return scene.guests[who.guest % scene.guests.length].frames[walking ? frame % 2 : 0];
}
function bubble(ctx: CanvasRenderingContext2D, x: number, y: number, fraction: number | null, highlight: boolean) {
  ctx.fillStyle = highlight ? C.butter : C.light; ctx.strokeStyle = INK; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.roundRect(x - 17, y - 34, 34, 28, 8); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - 4, y - 6.5); ctx.lineTo(x, y); ctx.lineTo(x + 4, y - 6.5); ctx.fillStyle = highlight ? C.butter : C.light; ctx.fill(); ctx.stroke();
  if (fraction !== null) {
    ctx.lineWidth = 3; ctx.strokeStyle = "#d9d6cf"; line(ctx, { x: x - 13, y: y - 38 }, { x: x + 13, y: y - 38 });
    ctx.strokeStyle = fraction > 0.5 ? C.mid : fraction > 0.25 ? "#b89b73" : "#b86d6d";
    line(ctx, { x: x - 13, y: y - 38 }, { x: x - 13 + 26 * Math.max(0, fraction), y: y - 38 }); ctx.lineWidth = 1;
  }
}
function drawCustomer(ctx: CanvasRenderingContext2D, scene: Scene, customer: Customer) {
  const { walker: body } = customer, { now, reducedMotion, state } = scene;
  const frame = reducedMotion ? 0 : Math.floor(now / 140);
  const seated = !body.moving && customer.state !== "arriving" && customer.state !== "leaving";
  shadow(ctx, body.x, body.y, 13);
  const breathe = seated && !reducedMotion ? Math.round(Math.sin(now / 500 + customer.id) * 1) : 0;
  const ink = customer.vip ? "#6b5a2e" : customer.mood === "angry" ? "#5a3a3a" : INK;
  drawSprite(ctx, customerRows(scene, customer, frame), body.x, body.y, (seated ? 10 : 0) + breathe, ink);
  const head = project(body.x, body.y, 64);
  if (customer.vip) { ctx.fillStyle = C.butter; ctx.strokeStyle = INK; ctx.beginPath(); ctx.moveTo(head.x - 8, head.y + 8); ctx.lineTo(head.x - 8, head.y); ctx.lineTo(head.x - 4, head.y + 4); ctx.lineTo(head.x, head.y - 2); ctx.lineTo(head.x + 4, head.y + 4); ctx.lineTo(head.x + 8, head.y); ctx.lineTo(head.x + 8, head.y + 8); ctx.closePath(); ctx.fill(); ctx.stroke(); }
  if (customer.state === "waiting") {
    const mine = manager(state).queue.some(job => job.kind === "take" && job.customer === customer.id) || customer.claimed !== null;
    bubble(ctx, head.x, head.y - 4, customer.patience / customer.patienceMax, false);
    ctx.fillStyle = INK; ctx.font = "bold 14px ui-monospace, monospace"; ctx.textAlign = "center";
    ctx.fillText(mine ? "✓" : reducedMotion ? "…" : ["·", "··", "···"][Math.floor(now / 350) % 3], head.x, head.y - 17);
  } else if (customer.state === "ordered" && customer.dish) {
    const order = state.orders.find(item => item.customer === customer.id);
    bubble(ctx, head.x, head.y - 4, customer.patience / customer.patienceMax, order?.state === "ready" || order?.state === "carried");
    drawDish(ctx, customer.dish, head.x, head.y - 22, 0.9);
    if (order && (order.state === "queued" || order.state === "cooking")) {
      const progress = order.state === "cooking" ? order.progress / order.duration : 0;
      ctx.strokeStyle = C.mid; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(head.x + 16, head.y - 32, 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress); ctx.stroke(); ctx.lineWidth = 1;
    }
  } else if (customer.state === "eating") {
    const t = reducedMotion ? 0.3 : (now / 900) % 1;
    ctx.globalAlpha = 1 - t; ctx.fillStyle = C.rose; ctx.font = "14px ui-monospace, monospace"; ctx.textAlign = "center";
    ctx.fillText("♥", head.x + 8, head.y - 2 - t * 18); ctx.globalAlpha = 1;
  }
}
function drawPasserby(ctx: CanvasRenderingContext2D, scene: Scene, passer: Passerby) {
  const frame = scene.reducedMotion ? 0 : Math.floor(scene.now / 150 + passer.id);
  shadow(ctx, passer.walker.x, passer.walker.y, 12);
  let rows: readonly string[] = scene.guests[passer.guest % scene.guests.length].frames[frame % 2];
  const regular = passer.regular !== null ? scene.regulars.get(passer.regular) : null;
  if (regular) rows = friendRows(regular, passer.walker.facing, true, frame % 8);
  drawSprite(ctx, rows, passer.walker.x, passer.walker.y, 0, "#2b2b2b");
}
function drawWorker(ctx: CanvasRenderingContext2D, scene: Scene, worker: Worker) {
  const { walker: body } = worker, { now, reducedMotion, state } = scene;
  const frame = reducedMotion ? 0 : Math.floor(now / 110) % 8, boss = worker.role === "manager";
  const resting = worker.duty === "resting";
  shadow(ctx, body.x, body.y, boss ? 20 : 14);
  const rows = boss ? friendRows(scene.friend, body.facing, body.moving, body.moving ? frame : 0) : staffRows(scene, worker.who!, body.facing, body.moving, frame);
  const hover = boss && scene.friend.familyId === 5 && !reducedMotion ? Math.round(2 + Math.sin(now / 300) * 2) : 0;
  const owned = !boss && worker.who && "owned" in worker.who;
  const chefBob = worker.role === "chef" && !body.moving && !reducedMotion && state.orders.some(order => order.state === "cooking") ? Math.round(Math.sin(now / 160 + worker.id) * 1.5) : 0;
  drawSprite(ctx, rows, body.x, body.y, hover + chefBob + (resting ? 8 : 0), boss || owned ? INK : "#333", boss ? 4 : 3);
  const head = project(body.x, body.y, (boss ? 80 : 62) + hover);
  // Apron tag: manager faded rose, your own Friends butter, guest staff sage.
  ctx.fillStyle = boss ? C.rose : owned ? C.butter : C.sage; ctx.strokeStyle = INK; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(head.x, head.y - 10); ctx.lineTo(head.x + 6, head.y - 4); ctx.lineTo(head.x, head.y + 2); ctx.lineTo(head.x - 6, head.y - 4); ctx.closePath(); ctx.fill(); ctx.stroke();
  worker.carrying.forEach((id, index) => {
    const order = state.orders.find(item => item.id === id);
    if (order) drawDish(ctx, order.dish, head.x - 12 + index * 14 + (worker.carrying.length === 1 ? 12 : 0), head.y - 16, 0.8);
  });
  if (worker.action > 0) { ctx.fillStyle = INK; ctx.font = "bold 12px ui-monospace, monospace"; ctx.textAlign = "center"; ctx.fillText("✎", head.x + 16, head.y - 6); }
  if (boss) return;
  const member = memberOf(state, worker);
  if (!member) return;
  // Name tag, worker level and an energy bar (rose when tired).
  const label = `${owned && worker.who && "owned" in worker.who ? `#${worker.who.owned}` : "Guest"} · Lv${workerLevel(member.xp)}`;
  ctx.font = "bold 9px ui-monospace, monospace"; ctx.textAlign = "center"; ctx.lineWidth = 3; ctx.strokeStyle = PAPER;
  ctx.strokeText(label, head.x, head.y + 14); ctx.fillStyle = INK; ctx.fillText(label, head.x, head.y + 14); ctx.lineWidth = 1;
  const energy = 1 - member.fatigue / 100;
  ctx.fillStyle = "#d9d6cf"; ctx.fillRect(head.x - 12, head.y + 18, 24, 3);
  ctx.fillStyle = member.fatigue >= 70 ? "#b86d6d" : member.fatigue >= 45 ? "#b89b73" : C.mid; ctx.fillRect(head.x - 12, head.y + 18, 24 * energy, 3);
  if (resting) {
    const t = reducedMotion ? 0.4 : (now / 1200) % 1;
    ctx.globalAlpha = 1 - t * 0.6; ctx.fillStyle = INK; ctx.font = "bold 13px ui-monospace, monospace"; ctx.fillText("z Z", head.x + 14, head.y - 10 - t * 12); ctx.globalAlpha = 1;
    ctx.strokeStyle = C.mid; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(head.x - 16, head.y - 12, 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - worker.rest / Math.max(1, worker.restTotal))); ctx.stroke(); ctx.lineWidth = 1;
  } else if (member.fatigue >= 70) {
    // Tired: tap them to send them on a break.
    bubble(ctx, head.x, head.y - 4, null, member.fatigue >= 100);
    ctx.fillStyle = INK; ctx.font = "bold 12px ui-monospace, monospace"; ctx.fillText(member.fatigue >= 100 ? "zzz!" : "zzz", head.x, head.y - 16);
  } else if (worker.role === "promoter" && !body.moving) {
    const wave = reducedMotion ? 0 : Math.sin(now / 250 + worker.id) * 2;
    ctx.fillStyle = C.light; ctx.strokeStyle = INK; ctx.fillRect(head.x + 10, head.y - 18 + wave, 30, 16); ctx.strokeRect(head.x + 10, head.y - 18 + wave, 30, 16);
    ctx.fillStyle = INK; ctx.font = "bold 9px ui-monospace, monospace"; ctx.fillText("♥ IN", head.x + 25, head.y - 7 + wave);
  }
}

// ---------- Frame ----------
let grain: HTMLCanvasElement | null = null;
function grainCanvas() {
  if (grain) return grain;
  grain = document.createElement("canvas"); grain.width = grain.height = 192;
  const ctx = grain.getContext("2d")!, image = ctx.createImageData(192, 192);
  let seed = 7;
  for (let index = 0; index < image.data.length; index += 4) {
    seed = (seed * 16807) % 2147483647; const value = seed % 255;
    image.data[index] = image.data[index + 1] = image.data[index + 2] = value; image.data[index + 3] = 16;
  }
  ctx.putImageData(image, 0, 0);
  return grain;
}

export function renderScene(ctx: CanvasRenderingContext2D, scene: Scene, pixelScale: number) {
  const { state, now, reducedMotion, build } = scene, level = ambience(state), layout = plan(state), camera = cameraFor(state.size);
  const shop = shopById(state.shop);
  ctx.setTransform(pixelScale, 0, 0, pixelScale, 0, 0);
  ctx.imageSmoothingEnabled = false;
  const cacheKey = `${state.shop}:${state.wallpaper}:${state.floor}:${level}:${state.size}:${pixelScale}`;
  if (backdrop?.key !== cacheKey) backdrop = { canvas: paintBackdrop(state, pixelScale, camera), key: cacheKey };
  ctx.drawImage(backdrop.canvas, 0, 0, VIEW.width, VIEW.height);
  // Everything below is drawn in world space through the camera.
  const scale = pixelScale * camera.zoom;
  ctx.setTransform(scale, 0, 0, scale, pixelScale * camera.x, pixelScale * camera.y);
  for (const item of state.items) if (item.kind === "rug") drawRug(ctx, item);

  if (build) {
    ctx.strokeStyle = "rgba(22,22,22,.28)"; ctx.setLineDash([2, 3]);
    for (let t = 2.5; t <= layout.size - 0.5; t += 1) line(ctx, project(t, -0.5), project(t, layout.size - 0.5));
    for (let t = -0.5; t <= layout.size - 0.5; t += 1) line(ctx, project(2.5, t), project(layout.size - 0.5, t));
    ctx.setLineDash([]);
    for (const tile of [layout.door, layout.pickup, layout.capsuleSpot, { x: 3, y: layout.breakDoor.y }]) poly(ctx, tileQuad(tile.x, tile.y, 0.08), "rgba(22,22,22,.12)");
    const selected = state.items.find(item => item.id === build.selected);
    if (selected) poly(ctx, tileQuad(selected.x, selected.y, 0.04), "rgba(226,215,173,.5)", INK);
    if (build.cursor) poly(ctx, tileQuad(build.cursor.x, build.cursor.y, 0.02), "rgba(0,0,0,0)", INK);
  } else if (scene.hover) {
    poly(ctx, tileQuad(scene.hover.x, scene.hover.y), "rgba(22,22,22,.08)", "rgba(22,22,22,.4)");
  }
  const boss = manager(state), target = boss.walker.path.at(-1);
  if (target && !build) {
    const point = project(target.x, target.y); ctx.strokeStyle = C.mid; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.ellipse(point.x, point.y, 12, 5, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  }

  type Layer = { depth: number; order: number; draw: () => void };
  const layers: Layer[] = [];
  const add = (depth: number, order: number, draw: () => void) => layers.push({ depth, order, draw });
  const cooking = state.orders.some(order => order.state === "cooking");
  for (const tile of layout.stoves) add(tile.x + tile.y, 0, () => drawStove(ctx, tile, cooking, now, reducedMotion));
  for (const tile of layout.counter) add(tile.x + tile.y, 0, () => drawCounter(ctx, tile, scene));
  for (const tile of layout.walls) add(tile.x + tile.y, 0, () => drawWall(ctx, tile, tile.y === layout.kitchenEnd ? "x" : "y"));
  add(layout.kitchenEnd + 1.2, 0, () => drawSofa(ctx, 0, layout.kitchenEnd + 1.5, 1.8));
  add(layout.capsule.x + layout.capsule.y, 0, () => drawCapsuleMachine(ctx, layout.capsule, now, reducedMotion));
  for (let y = 0; y < layout.size; y++) if (y !== layout.door.y) add(layout.size - 1 + y + 0.6, 3, () => drawFrontWall(ctx, { x: layout.size - 1, y }, "right"));
  for (let x = 0; x < layout.size; x++) add(x + layout.size - 1 + 0.6, 3, () => drawFrontWall(ctx, { x, y: layout.size - 1 }, "left"));
  add(layout.size - 1 + layout.door.y + 0.7, 3, () => drawDoor(ctx, layout, shop.accent));
  for (const y of [layout.laneStart + 1, Math.floor(layout.size / 2) + 1, layout.laneEnd - 1]) add(layout.lane + 0.45 + y, 1, () => drawStreetLamp(ctx, { x: layout.lane + 0.45, y }));
  const tableNumbers = new Map(tables(state).map((item, index) => [item.id, index + 1]));
  const accents = [C.rose, C.sage, C.butter, C.lavender];
  for (const item of state.items) {
    if (item.kind === "rug") continue;
    const faded = build?.selected === item.id && build.ghost ? 0.35 : 1;
    if (item.kind === "table") {
      const seat = seatOf(item);
      add(seat.x + seat.y, 0, () => { ctx.globalAlpha = faded; drawChair(ctx, seat, item.dir); ctx.globalAlpha = 1; });
      add(item.x + item.y, 0, () => { ctx.globalAlpha = faded; drawTable(ctx, item, tableNumbers.get(item.id)!, accents[item.id % 4]); ctx.globalAlpha = 1; });
    } else add(item.x + item.y, 0, () => { ctx.globalAlpha = faded; drawItem(ctx, item.kind, item, now, reducedMotion); ctx.globalAlpha = 1; });
  }
  if (build?.ghost) {
    const ghost = build.ghost;
    const tint = () => { if (!build.valid) poly(ctx, tileQuad(ghost.x, ghost.y, 0.04), "rgba(184,109,109,.35)", "#9a4e4e"); };
    if (ghost.kind === "rug") add(-1, 9, () => { drawRug(ctx, ghost, build.valid ? 0.55 : 0.25); tint(); });
    else if (ghost.kind === "table") {
      const seat = seatOf(ghost);
      add(seat.x + seat.y + 0.02, 9, () => { ctx.globalAlpha = 0.65; drawChair(ctx, seat, ghost.dir); ctx.globalAlpha = 1; });
      add(ghost.x + ghost.y + 0.02, 9, () => { tint(); ctx.globalAlpha = 0.65; drawTable(ctx, { ...ghost, id: 0 }, 0, C.butter); ctx.globalAlpha = 1; });
    } else add(ghost.x + ghost.y + 0.02, 9, () => { tint(); ctx.globalAlpha = 0.65; drawItem(ctx, ghost.kind, ghost, now, true); ctx.globalAlpha = 1; });
  }
  for (const passer of state.passersby) add(passer.walker.x + passer.walker.y, 1, () => drawPasserby(ctx, scene, passer));
  for (const customer of state.customers) add(customer.walker.x + customer.walker.y, 1, () => drawCustomer(ctx, scene, customer));
  for (const worker of state.workers) add(worker.walker.x + worker.walker.y + 0.01, 2, () => drawWorker(ctx, scene, worker));
  layers.sort((a, b) => a.depth - b.depth || a.order - b.order).forEach(layer => layer.draw());

  // Numbered task markers for the manager's list.
  if (!build) boss.queue.forEach((job, index) => {
    let point: Point | null = null;
    if (job.kind === "pickup") point = project(layout.pickup.x - 0.6, layout.pickup.y, 70);
    else if (job.kind === "take" || job.kind === "serve") {
      const customer = state.customers.find(item => item.id === job.customer);
      if (customer) point = project(customer.walker.x, customer.walker.y, 112);
    }
    if (!point) return;
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(point.x - 20, point.y, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.light; ctx.font = "bold 10px ui-monospace, monospace"; ctx.textAlign = "center"; ctx.fillText(String(index + 1), point.x - 20, point.y + 3.5);
  });

  // Ceiling ornaments earned through ambience.
  if (level >= 3) {
    const a = project(3, -0.5, 128), b = project(layout.size - 0.5, -0.5, 128);
    ctx.strokeStyle = INK; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo((a.x + b.x) / 2, (a.y + b.y) / 2 + 26, b.x, b.y); ctx.stroke();
    for (let i = 1; i < 8; i++) {
      const t = i / 8, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t + 52 * t * (1 - t) + 6;
      ctx.fillStyle = [C.rose, C.butter, C.sage, C.lavender][i % 4]; ctx.beginPath(); ctx.ellipse(x, y + 8, 6, 8, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  }
  if (level >= 5) {
    const middle = (layout.size + 3) / 2, point = project(middle, layout.size / 2, 250), sway = reducedMotion ? 0 : Math.sin(now / 1200) * 2;
    ctx.strokeStyle = INK; line(ctx, { x: point.x, y: point.y - 200 }, { x: point.x + sway, y: point.y });
    const glow = ctx.createRadialGradient(point.x + sway, point.y + 10, 4, point.x + sway, point.y + 10, 90);
    glow.addColorStop(0, "rgba(233,227,196,.55)"); glow.addColorStop(1, "rgba(233,227,196,0)"); ctx.fillStyle = glow; ctx.fillRect(point.x - 100, point.y - 80, 200, 200);
    ctx.fillStyle = C.butter; ctx.beginPath(); ctx.arc(point.x + sway, point.y + 10, 13, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = PAPER; ctx.beginPath(); ctx.arc(point.x + sway + 6, point.y + 6, 11, 0, Math.PI * 2); ctx.fill();
  }

  for (const floater of scene.floaters) {
    const point = project(floater.x, floater.y, 80 + (reducedMotion ? 0 : floater.age * 38));
    ctx.globalAlpha = Math.max(0, 1 - floater.age / 1.6);
    ctx.font = "bold 15px ui-monospace, monospace"; ctx.textAlign = "center"; ctx.lineWidth = 4; ctx.strokeStyle = PAPER;
    ctx.strokeText(floater.text, point.x, point.y);
    ctx.fillStyle = floater.tone === "vip" ? "#8a6d2a" : floater.tone === "angry" ? "#9a4e4e" : INK; ctx.fillText(floater.text, point.x, point.y);
    ctx.globalAlpha = 1; ctx.lineWidth = 1;
  }

  // Screen-space finish: time-of-day wash, film grain and a soft vignette.
  ctx.setTransform(pixelScale, 0, 0, pixelScale, 0, 0);
  const progress = state.phase === "open" ? dayProgress(state) : 1;
  const wash = progress < 0.25 ? `rgba(175,188,203,${0.1 * (1 - progress * 4)})` : progress > 0.65 ? `rgba(198,170,160,${Math.min(0.16, (progress - 0.65) * 0.45)})` : null;
  if (wash && !build) { ctx.fillStyle = wash; ctx.fillRect(0, 0, VIEW.width, VIEW.height); }
  const noise = grainCanvas(), shift = reducedMotion ? 0 : Math.floor(now / 90) % 4 * 37;
  ctx.save(); ctx.translate(-shift, -shift); ctx.fillStyle = ctx.createPattern(noise, "repeat")!; ctx.fillRect(0, 0, VIEW.width + 192, VIEW.height + 192); ctx.restore();
  const vignette = ctx.createRadialGradient(480, 320, 260, 480, 320, 620);
  vignette.addColorStop(0, "rgba(22,22,22,0)"); vignette.addColorStop(1, "rgba(22,22,22,.28)");
  ctx.fillStyle = vignette; ctx.fillRect(0, 0, VIEW.width, VIEW.height);
}

// ---------- Hit testing (reference-viewport coordinates) ----------
export type Hit = { kind: "customer"; id: number } | { kind: "worker"; id: number } | { kind: "counter" } | { kind: "capsule" } | { kind: "tile"; tile: Tile } | null;
const worldPoint = (state: CafeState, sx: number, sy: number) => toWorld(cameraFor(state.size), { x: sx, y: sy });
/** Dining-room tile under a viewport point, or null. */
export function tileAt(state: CafeState, sx: number, sy: number): Tile | null {
  const world = worldPoint(state, sx, sy), grid = unproject(world.x, world.y), tile = { x: Math.round(grid.x), y: Math.round(grid.y) };
  return tile.x < 3 || tile.y < 0 || tile.x >= state.size || tile.y >= state.size ? null : tile;
}
export function hitTest(state: CafeState, sx: number, sy: number): Hit {
  const { x: wx, y: wy } = worldPoint(state, sx, sy), layout = plan(state);
  const near = (x: number, y: number, top: number) => { const point = project(x, y); return Math.abs(wx - point.x) <= 26 && wy <= point.y + 8 && wy >= point.y - top; };
  for (const worker of [...state.workers].reverse()) if (worker.role !== "manager" && near(worker.walker.x, worker.walker.y, 90)) return { kind: "worker", id: worker.id };
  const front = [...state.customers].sort((a, b) => (b.walker.x + b.walker.y) - (a.walker.x + a.walker.y));
  for (const customer of front) if (near(customer.walker.x, customer.walker.y, customer.state === "waiting" || customer.state === "ordered" ? 112 : 64)) return { kind: "customer", id: customer.id };
  const grid = unproject(wx, wy), tile = { x: Math.round(grid.x), y: Math.round(grid.y) };
  const machine = project(layout.capsule.x, layout.capsule.y);
  if ((Math.abs(wx - machine.x) < 30 && wy < machine.y + 12 && wy > machine.y - 90) || (tile.x === layout.capsuleSpot.x && tile.y === layout.capsuleSpot.y)) return { kind: "capsule" };
  const table = tables(state).find(item => item.x === tile.x && item.y === tile.y);
  if (table) {
    const customer = state.customers.find(item => item.table === table.id);
    return customer ? { kind: "customer", id: customer.id } : null;
  }
  if ((tile.x <= 2 && tile.y < layout.kitchenEnd) || (tile.x === layout.pickup.x && tile.y === layout.pickup.y)) return { kind: "counter" };
  if (tile.x < 3 || tile.y < 0 || tile.x >= state.size || tile.y >= state.size) return null;
  return { kind: "tile", tile };
}
