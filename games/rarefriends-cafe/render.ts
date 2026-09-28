/** Canvas renderer: greyscale isometric shop and street with faded accent colours, framed by a camera in the 960 × 640 view. */
import type { GenerationSprites } from "@rarefriends/friendsdk/sprites";
import { FLOORS, WALLPAPERS, catalogItem, dishById, isRug, isTable, shopById, workerLevel, type DishId, type DishShape, type ItemKind, type Shop } from "./data.ts";
import { CAPSULE_ID, DIR_FACING, ambience, dayProgress, manager, memberOf, plan, tables, type CafeState, type Customer, type Facing, type Passerby, type StaffWho, type Worker } from "./engine.ts";
import type { GuestArt } from "./guests.ts";
import { FACING, buildingById, cameraFor, fromKey, key, project, seatOf, seatsOf, toWorld, unproject, type Camera, type Dir, type Item, type Placement, type Tile } from "./layout.ts";

export const VIEW = { width: 960, height: 640 } as const;
export const INK = "#161616", PAPER = "#efede7";
const C = {
  line: "#bdb9b0", dark: "#3b3a38", mid: "#6d6b67", light: "#f7f5f0", rose: "#d8b6b4", sage: "#b4c3ab", blue: "#afbccb",
  butter: "#e2d7ad", lavender: "#c6bed4", amber: "#e3c9a0", wood: "#9c8672",
};

export type Floater = { text: string; x: number; y: number; age: number; tone: "coin" | "vip" | "angry" | "info" };
/** `capsule` is the capsule machine's ghost while it is being moved. */
export type BuildView = { cursor: Tile | null; ghost: Omit<Item, "id"> | null; valid: boolean; selected: number | null; capsule?: Placement | null };
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
  // A soft bevel: a light line just inside the top's back edges, so boxes read as rounded and friendly.
  if (Math.abs(r.x - l.x) > 6) {
    const inset = (point: Point) => ({ x: point.x + (f.x - point.x) * 0.12, y: point.y - h + (f.y - point.y) * 0.12 });
    ctx.save(); ctx.strokeStyle = "rgba(255,255,255,.45)"; ctx.lineWidth = 1.2; ctx.beginPath();
    const [a, c, e] = [inset(l), inset(b), inset(r)]; ctx.moveTo(a.x, a.y); ctx.lineTo(c.x, c.y); ctx.lineTo(e.x, e.y); ctx.stroke(); ctx.restore();
  }
}
/** A tiny happy face (dot eyes, a smile and blush) on the front of a pot. */
function cuteFace(ctx: CanvasRenderingContext2D, at: Point, size = 1) {
  ctx.save(); ctx.fillStyle = INK;
  ctx.fillRect(at.x - 3.5 * size, at.y - 1, 1.6 * size, 1.6 * size); ctx.fillRect(at.x + 2 * size, at.y - 1, 1.6 * size, 1.6 * size);
  ctx.strokeStyle = INK; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.arc(at.x, at.y + 0.6, 1.6 * size, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
  ctx.fillStyle = "rgba(201,143,143,.7)"; ctx.beginPath(); ctx.ellipse(at.x - 5 * size, at.y + 1.5, 1.6 * size, 1 * size, 0, 0, Math.PI * 2); ctx.ellipse(at.x + 5.2 * size, at.y + 1.5, 1.6 * size, 1 * size, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
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
  else if (id === "gingham") {
    ctx.lineWidth = 6; ctx.strokeStyle = "rgba(143,164,133,.28)";
    for (let t = 0.25; t < length; t += 0.5) line(ctx, at(t, 38), at(t, H));
    for (let h = 46; h < H; h += 16) line(ctx, at(0, h), at(length, h));
  } else if (id === "subway") {
    ctx.strokeStyle = "rgba(22,22,22,.13)";
    for (let h = 38, row = 0; h < H; h += 7, row++) { line(ctx, at(0, h), at(length, h)); for (let t = (row % 2) * 0.17; t < length; t += 0.34) line(ctx, at(t, h), at(t, h + 7)); }
  } else if (id === "floral") {
    for (let t = 0.3, col = 0; t < length; t += 0.6, col++) for (let h = 52 + (col % 2) * 11; h < H - 4; h += 22) {
      const p = at(t, h);
      ctx.fillStyle = (col + h) % 3 ? "rgba(226,215,173,.95)" : "rgba(216,182,180,.9)";
      for (let i = 0; i < 5; i++) { const a = i * Math.PI * 2 / 5; ctx.beginPath(); ctx.arc(p.x + Math.cos(a) * 2.6, p.y + Math.sin(a) * 2.6, 2, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = "rgba(143,164,133,.8)"; ctx.beginPath(); ctx.arc(p.x, p.y, 1.3, 0, Math.PI * 2); ctx.fill();
    }
  } else if (id === "chevron") {
    ctx.lineWidth = 3; ctx.strokeStyle = "rgba(157,149,171,.5)";
    for (let h = 46; h < H; h += 14) {
      ctx.beginPath();
      for (let t = 0, i = 0; t <= length + 0.01; t += 0.25, i++) { const p = at(t, h + (i % 2) * 6); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); }
      ctx.stroke();
    }
  } else if (id === "scallop") {
    ctx.lineWidth = 1.5; ctx.strokeStyle = "rgba(176,126,124,.45)";
    for (let h = 42, row = 0; h < H; h += 9, row++) for (let t = (row % 2) * 0.15; t < length; t += 0.3) { const p = at(t, h); ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0.1, Math.PI - 0.1); ctx.stroke(); }
  } else if (id === "starry") {
    for (let i = 0; i < length * 9; i++) {
      const p = at((i * 0.377) % length, 44 + (i * 53) % (H - 50)), size = i % 5 === 0 ? 2 : 1.2;
      ctx.fillStyle = i % 4 === 0 ? "rgba(233,227,196,.95)" : "rgba(247,245,240,.7)"; ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size);
      if (i % 11 === 0) { ctx.fillStyle = "rgba(233,227,196,.9)"; ctx.font = "9px ui-monospace, monospace"; ctx.textAlign = "center"; ctx.fillText("✦", p.x, p.y + 3); }
    }
  } else if (id === "damask") {
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
  /** A sub-rectangle of the tile, in fractions from its back corner. */
  const part = (u0: number, v0: number, u1: number, v1: number) =>
    [project(x - 0.5 + u0, y - 0.5 + v0), project(x - 0.5 + u1, y - 0.5 + v0), project(x - 0.5 + u1, y - 0.5 + v1), project(x - 0.5 + u0, y - 0.5 + v1)];
  const seed = (i: number) => Math.abs(x * 31 + y * 17 + i * 13) % 97;
  if (id === "strawberry") { for (const i of [0, 1]) for (const j of [0, 1]) poly(ctx, part(i / 2, j / 2, (i + 1) / 2, (j + 1) / 2), colors[(i + j) % 2]); return; }
  if (id === "tatami") {
    poly(ctx, quad, colors[alt ? 1 : 0]);
    ctx.strokeStyle = "rgba(22,22,22,.08)";
    for (let t = 0.1; t < 1; t += 0.1) alt ? line(ctx, project(x - 0.5, y - 0.5 + t), project(x + 0.5, y - 0.5 + t)) : line(ctx, project(x - 0.5 + t, y - 0.5), project(x - 0.5 + t, y + 0.5));
    for (const edge of alt ? [part(0, 0, 0.07, 1), part(0.93, 0, 1, 1)] : [part(0, 0, 1, 0.07), part(0, 0.93, 1, 1)]) poly(ctx, edge, "#6f7a5c");
    return;
  }
  if (id === "slate") {
    poly(ctx, quad, "#8e9090");
    const stones = ["#b9bbbb", "#a9abab", "#b3b0aa", "#a4a8ab"], split = 0.3 + (seed(1) % 5) / 10, g = 0.03;
    if (alt) { poly(ctx, part(g, g, split - g, 1 - g), stones[seed(2) % 4]); poly(ctx, part(split + g, g, 1 - g, 1 - g), stones[seed(3) % 4]); }
    else { poly(ctx, part(g, g, 1 - g, split - g), stones[seed(2) % 4]); poly(ctx, part(g, split + g, 1 - g, 1 - g), stones[seed(3) % 4]); }
    return;
  }
  if (id === "parquet") {
    ctx.strokeStyle = "rgba(22,22,22,.16)";
    for (const i of [0, 1]) for (const j of [0, 1]) {
      const across = (i + j + (alt ? 1 : 0)) % 2 === 0, u0 = i / 2, v0 = j / 2;
      poly(ctx, part(u0, v0, u0 + 0.5, v0 + 0.5), colors[across ? 0 : 1], "rgba(22,22,22,.22)");
      for (const t of [1 / 6, 2 / 6]) across ? line(ctx, project(x - 0.5 + u0, y - 0.5 + v0 + t), project(x + u0, y - 0.5 + v0 + t)) : line(ctx, project(x - 0.5 + u0 + t, y - 0.5 + v0), project(x - 0.5 + u0 + t, y + v0));
    }
    return;
  }
  if (id === "carpet") {
    poly(ctx, quad, colors[0]);
    for (let i = 0; i < 9; i++) { const p = project(x - 0.45 + (seed(i) % 10) / 10, y - 0.45 + ((seed(i) * 7) % 10) / 10); ctx.fillStyle = i % 2 ? colors[1] : "rgba(157,149,171,.5)"; ctx.fillRect(p.x, p.y, 2, 1.4); }
    return;
  }
  if (id === "mosaic") {
    poly(ctx, quad, "#eef0f2");
    const blues = ["#c3cdd8", "#afbccb", "#dde3e9", "#9fabc2", "#d0d9e2"];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) poly(ctx, part(i / 3 + 0.03, j / 3 + 0.03, (i + 1) / 3 - 0.03, (j + 1) / 3 - 0.03), blues[seed(i * 3 + j) % blues.length]);
    return;
  }
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
  const shop = shopById(state.shop), level = ambience(state), layout = plan(state), { w: WIDE, d: DEEP } = layout;

  // Outside: sidewalk, curb and a quiet road.
  for (let y = layout.laneStart; y <= layout.laneEnd; y++) for (let x = WIDE; x <= layout.lane; x++) paintFloorTile(ctx, "sidewalk", x, y, []);
  poly(ctx, [project(layout.lane + 0.5, layout.laneStart - 0.5), project(layout.lane + 2.5, layout.laneStart - 0.5), project(layout.lane + 2.5, layout.laneEnd + 0.5), project(layout.lane + 0.5, layout.laneEnd + 0.5)], "#9b9994");
  ctx.strokeStyle = C.light; ctx.lineWidth = 2; ctx.setLineDash([10, 12]);
  line(ctx, project(layout.lane + 1.5, layout.laneStart - 0.5), project(layout.lane + 1.5, layout.laneEnd + 0.5)); ctx.setLineDash([]); ctx.lineWidth = 1;
  box(ctx, layout.lane + 0.55, (layout.laneStart + layout.laneEnd) / 2, 0.1, layout.laneEnd - layout.laneStart + 1, 4, "#c7c4bd", "#a9a6a0", "#b8b5ae");
  // A striped crossing in front of the door.
  for (let i = 0; i < 4; i++) poly(ctx, [project(layout.lane + 0.7, layout.door.y - 0.45 + i * 0.25), project(layout.lane + 2.3, layout.door.y - 0.45 + i * 0.25), project(layout.lane + 2.3, layout.door.y - 0.35 + i * 0.25), project(layout.lane + 0.7, layout.door.y - 0.35 + i * 0.25)], "rgba(247,245,240,.8)");

  const paper = WALLPAPERS.find(item => item.id === state.wallpaper) ?? WALLPAPERS[0];
  wallpaper(ctx, paper.id, "y", paper.colors, DEEP);
  wallpaper(ctx, paper.id, "x", paper.colors, WIDE);
  /** A point on the back-right wall ("x", y = −0.5) or the left wall ("y", x = −0.5), `out` tiles in front of it. */
  const onWall = (wall: "x" | "y", t: number, h: number, out = 0) => wall === "x" ? W(t, S - out, h) : W(S - out, t, h);
  const back = layout.kitchenSide === "back", kitchenEnd = layout.kitchenLength;
  // The shop sign and menu board: over the dining room, or beside a back-wall kitchen.
  const signAt = back ? kitchenEnd + 0.6 : 3.1;
  poly(ctx, [W(signAt, S, 60), W(signAt + 2.8, S, 60), W(signAt + 2.8, S, 110), W(signAt, S, 110)], "#2c2c2b", INK);
  ctx.save(); ctx.strokeStyle = "rgba(247,245,240,.55)"; ctx.lineWidth = 1.2;
  for (let row = 0; row < 4; row++) line(ctx, W(signAt + 0.4, S, 98 - row * 10), W(signAt + 1.9 + (row % 2) * 0.5, S, 98 - row * 10));
  ctx.restore();
  poly(ctx, [W(signAt - 0.2, S, 114), W(signAt + 3, S, 114), W(signAt + 3, S, 130), W(signAt - 0.2, S, 130)], C.light, INK);
  const title = W(signAt + 1.4, S, 118);
  ctx.save(); ctx.translate(title.x, title.y); ctx.transform(1, -0.5, 0, 1, 0, 0); ctx.fillStyle = INK; ctx.font = "bold 11px ui-monospace, monospace"; ctx.textAlign = "center"; ctx.fillText(shop.sign, 0, 0); ctx.restore();
  // Windows with striped awnings: along the back wall, or down the left wall when the kitchen has the back wall.
  const windowWall = back ? "y" : "x", windowsFrom = back ? 3.3 : 6.8, windowsTo = back ? DEEP - 4.2 : WIDE - 1.2;
  for (let start = windowsFrom; start + 2.2 <= windowsTo; start += 3) {
    const span = 2.2, lo = 50, hi = 112, at = (t: number, h: number, out = 0) => onWall(windowWall, t, h, out);
    poly(ctx, [at(start, lo), at(start + span, lo), at(start + span, hi), at(start, hi)], "#c9d2da", INK);
    ctx.strokeStyle = INK; line(ctx, at(start + span / 2, lo), at(start + span / 2, hi)); line(ctx, at(start, (lo + hi) / 2), at(start + span, (lo + hi) / 2));
    for (let i = 0; i < 4; i++) poly(ctx, [at(start + i * span / 4, hi + 4), at(start + (i + 1) * span / 4, hi + 4), at(start + (i + 1) * span / 4, hi - 6, 0.25), at(start + i * span / 4, hi - 6, 0.25)], i % 2 ? C.light : shop.accent, INK);
  }
  if (level >= 4) back ? framed(ctx, W(S, DEEP - 4.6, 94), C.lavender) : framed(ctx, W(WIDE - 1.6, S, 94), C.lavender, true);
  // Kitchen wall: a hood over the stoves and shelves of jars.
  const kitchenWall = back ? "x" : "y";
  poly(ctx, [onWall(kitchenWall, 0, 96), onWall(kitchenWall, kitchenEnd, 96), onWall(kitchenWall, kitchenEnd, 104, -0.35), onWall(kitchenWall, 0, 104, -0.35)], "#a9a6a0", INK);
  for (let t = 0.6; t < kitchenEnd - 0.4; t += 0.8) {
    const p = onWall(kitchenWall, t, 116, -0.12), color = [C.rose, C.sage, C.butter, C.blue][Math.floor(t) % 4];
    ctx.fillStyle = color; ctx.fillRect(p.x - 5, p.y - 14, 10, 14); ctx.strokeStyle = INK; ctx.strokeRect(p.x - 5, p.y - 14, 10, 14);
  }
  // Break room wall: a sign and a picture.
  const sign = W(S, DEEP - 2, 96);
  ctx.save(); ctx.translate(sign.x, sign.y); ctx.transform(1, 0.5, 0, 1, 0, 0);
  ctx.fillStyle = C.light; ctx.fillRect(-36, -12, 72, 18); ctx.strokeStyle = INK; ctx.strokeRect(-36, -12, 72, 18);
  ctx.fillStyle = INK; ctx.font = "bold 10px ui-monospace, monospace"; ctx.textAlign = "center"; ctx.fillText("BREAK ROOM", 0, 1); ctx.restore();
  if (level >= 1) framed(ctx, W(S, DEEP - 0.8, 70), C.sage);
  if (level >= 2) framed(ctx, W(S, back ? 2.2 : 2, 70), shop.accent);

  // Floors: kitchen tiles, lounge wood in the break room, the chosen design everywhere else.
  const floor = FLOORS.find(item => item.id === state.floor) ?? FLOORS[0];
  const kitchen = new Set([...layout.kitchenFloor, ...layout.stoves, layout.kitchenDoor].map(key)), lounge = new Set(layout.breakFloor.map(key));
  for (let y = 0; y < DEEP; y++) for (let x = 0; x < WIDE; x++) {
    const tile = key({ x, y });
    paintFloorTile(ctx, kitchen.has(tile) ? "kitchen" : lounge.has(tile) ? "lounge" : floor.id, x, y, floor.colors);
  }
  ctx.strokeStyle = C.line; ctx.lineWidth = 0.6;
  for (let t = -0.5; t <= WIDE - 0.5; t += 1) line(ctx, project(t, -0.5), project(t, DEEP - 0.5));
  for (let t = -0.5; t <= DEEP - 0.5; t += 1) line(ctx, project(-0.5, t), project(WIDE - 0.5, t));
  poly(ctx, [project(-0.5, -0.5), project(WIDE - 0.5, -0.5), project(WIDE - 0.5, DEEP - 0.5), project(-0.5, DEEP - 0.5)], "rgba(0,0,0,0)", INK);
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
/** Grid offset of a point `u` across and `v` toward the front of an item facing `dir`. */
const turn = (dir: Dir, u: number, v: number): Point =>
  dir === 0 ? { x: u, y: v } : dir === 1 ? { x: v, y: -u } : dir === 2 ? { x: -u, y: -v } : { x: -v, y: u };
/** Screen point `u` across and `v` toward the front of an item on `tile`, `lift` pixels up. */
function local(tile: Tile, dir: Dir, u: number, v: number, lift = 0) {
  const t = turn(dir, u, v);
  return project(tile.x + t.x, tile.y + t.y, lift);
}
/** A box `w` across and `d` deep, centred `u`, `v` from the tile centre, turned to face `dir`. */
function turnedBox(ctx: CanvasRenderingContext2D, tile: Tile, dir: Dir, u: number, v: number, w: number, d: number, h: number, top: string, left: string, right: string, lift = 0) {
  const t = turn(dir, u, v), odd = dir % 2 === 1;
  box(ctx, tile.x + t.x, tile.y + t.y, odd ? d : w, odd ? w : d, h, top, left, right, lift);
}
/**
 * Draw flat on an item's upright plane `v` from its centre: local x runs across it in screen pixels (33 per tile), y down.
 * `back` draws the plane as seen from behind, so writing on the back of a sign still reads the right way.
 */
function onFace(ctx: CanvasRenderingContext2D, tile: Tile, dir: Dir, u: number, v: number, lift: number, draw: () => void, back = false) {
  const at = local(tile, dir, u, v, lift), across = turn(dir, back ? -1 : 1, 0);
  ctx.save(); ctx.translate(at.x, at.y); ctx.transform(across.x - across.y, (across.x + across.y) / 2, 0, 1, 0, 0); draw(); ctx.restore();
}
/** Dir 0 and 1 show an item's front; 2 and 3 show its back. */
const facesViewer = (dir: Dir) => dir < 2;
/** Flat art (cats, birds, leaves) is mirrored when the item faces screen-right. */
const facesRight = (dir: Dir) => dir === 1 || dir === 2;
function mirror(ctx: CanvasRenderingContext2D, x: number, flip: boolean, draw: () => void) {
  ctx.save(); if (flip) { ctx.translate(x * 2, 0); ctx.scale(-1, 1); } draw(); ctx.restore();
}
/** Parts of one item as [u, v, draw, width, depth]; boxes separated along an axis paint back first, the rest by depth. */
type Part = readonly [u: number, v: number, draw: () => void, w?: number, d?: number];
function backToFront(dir: Dir, parts: readonly Part[]) {
  const left = parts.map(([u, v, draw, w = 0, d = 0]) => {
    const t = turn(dir, u, v), odd = dir % 2 === 1, hx = (odd ? d : w) / 2, hy = (odd ? w : d) / 2;
    return { x0: t.x - hx, x1: t.x + hx, y0: t.y - hy, y1: t.y + hy, depth: t.x + t.y, draw };
  });
  type Box = (typeof left)[number];
  const first = (a: Box, b: Box) => {
    const aBehind = a.x1 <= b.x0 + 1e-6 || a.y1 <= b.y0 + 1e-6, bBehind = b.x1 <= a.x0 + 1e-6 || b.y1 <= a.y0 + 1e-6;
    return aBehind !== bBehind ? aBehind : a.depth <= b.depth;
  };
  while (left.length) {
    let index = left.findIndex(a => left.every(b => a === b || first(a, b)));
    if (index < 0) index = left.reduce((best, item, at) => item.depth < left[best].depth ? at : best, 0);
    left.splice(index, 1)[0].draw();
  }
}

const WOOD = ["#c9ab85", "#9c7f63", "#b39374"] as const;
/** A ring of grid points around (x, y), projected: iso-correct ovals for table tops and cloths. */
function isoOval(x: number, y: number, rx: number, ry: number, lift: number, along: "x" | "y" = "x", steps = 28): Point[] {
  return Array.from({ length: steps }, (_, index) => {
    const a = index / steps * Math.PI * 2, u = Math.cos(a) * rx, v = Math.sin(a) * ry;
    return along === "x" ? project(x + u, y + v, lift) : project(x + v, y + u, lift);
  });
}
function scallops(ctx: CanvasRenderingContext2D, points: readonly Point[], color: string) {
  ctx.fillStyle = color;
  points.forEach((point, index) => { if (index % 2) return; ctx.beginPath(); ctx.arc(point.x, point.y + 1.5, 2.4, 0, Math.PI); ctx.fill(); });
}
function vase(ctx: CanvasRenderingContext2D, at: Point, accent: string) {
  ctx.strokeStyle = "#7f8f76"; ctx.lineWidth = 1.2; line(ctx, { x: at.x, y: at.y - 5 }, { x: at.x - 2, y: at.y - 12 }); line(ctx, { x: at.x, y: at.y - 5 }, { x: at.x + 3, y: at.y - 10 });
  ctx.strokeStyle = INK; ctx.lineWidth = 1;
  ctx.fillStyle = C.light; ctx.beginPath(); ctx.ellipse(at.x, at.y - 2.5, 2.6, 3.6, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  for (const [dx, dy] of [[-2, -12], [3, -10]]) { ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(at.x + dx, at.y + dy, 2.3, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
}
/** Tables: a round café table with a scalloped cloth, an oval table for two with a candle, a square table for four with gingham. */
function drawTable(ctx: CanvasRenderingContext2D, item: Pick<Item, "kind" | "x" | "y" | "dir">, number: number, accent: string, now = 0, reducedMotion = true) {
  const seats = catalogItem(item.kind).seats ?? 1, base = project(item.x, item.y);
  shadow(ctx, item.x, item.y, seats >= 4 ? 26 : 22);
  ctx.lineWidth = 1.2; ctx.strokeStyle = INK;
  if (seats >= 4) {
    for (const [dx, dy] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) box(ctx, item.x + dx, item.y + dy, 0.07, 0.07, 22, WOOD[0], WOOD[1], WOOD[2]);
    box(ctx, item.x, item.y, 0.78, 0.78, 4, WOOD[0], WOOD[1], WOOD[2], 22);
    // Gingham cloth laid corner to corner, with a flower centrepiece.
    const cloth = [project(item.x, item.y - 0.46, 26.5), project(item.x + 0.46, item.y, 26.5), project(item.x, item.y + 0.46, 26.5), project(item.x - 0.46, item.y, 26.5)];
    poly(ctx, cloth, C.light, INK);
    ctx.save(); ctx.beginPath(); cloth.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y)); ctx.closePath(); ctx.clip();
    ctx.strokeStyle = accent; ctx.globalAlpha *= 0.55; ctx.lineWidth = 3;
    for (let t = -0.4; t <= 0.4; t += 0.2) { line(ctx, project(item.x + t, item.y - 0.5, 26.5), project(item.x + t, item.y + 0.5, 26.5)); line(ctx, project(item.x - 0.5, item.y + t, 26.5), project(item.x + 0.5, item.y + t, 26.5)); }
    ctx.restore(); ctx.lineWidth = 1;
    vase(ctx, project(item.x, item.y, 27), accent);
  } else if (seats === 2) {
    const along = item.dir % 2 === 0 ? "y" : "x";
    ctx.fillStyle = C.dark; ctx.fillRect(base.x - 2, base.y - 22, 4, 22); ctx.beginPath(); ctx.ellipse(base.x, base.y - 1, 10, 3.5, 0, 0, Math.PI * 2); ctx.fill();
    poly(ctx, isoOval(item.x, item.y, 0.44, 0.3, 21, along), WOOD[1], INK);
    poly(ctx, isoOval(item.x, item.y, 0.44, 0.3, 25, along), WOOD[0], INK);
    ctx.strokeStyle = "rgba(22,22,22,.14)"; poly(ctx, isoOval(item.x, item.y, 0.3, 0.18, 25, along), "rgba(0,0,0,0)"); ctx.stroke(); ctx.strokeStyle = INK;
    // A little candle, flickering.
    const top = project(item.x, item.y, 25), flicker = reducedMotion ? 0 : Math.sin(now / 130 + item.x * 7) * 0.8;
    ctx.fillStyle = C.light; ctx.fillRect(top.x - 2, top.y - 9, 4, 8); ctx.strokeRect(top.x - 2, top.y - 9, 4, 8);
    ctx.fillStyle = C.amber; ctx.beginPath(); ctx.ellipse(top.x, top.y - 12 - flicker * 0.3, 1.8, 3 + flicker * 0.4, 0, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.fillStyle = C.dark; ctx.fillRect(base.x - 2, base.y - 22, 4, 22);
    ctx.beginPath(); ctx.ellipse(base.x, base.y - 1, 9, 3, 0, 0, Math.PI * 2); ctx.fill();
    // A round top under a pastel cloth with a scalloped hem.
    ctx.fillStyle = "#e4e1da"; ctx.beginPath(); ctx.ellipse(base.x, base.y - 22, 24, 10, 0, 0, Math.PI); ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.light; ctx.beginPath(); ctx.ellipse(base.x, base.y - 25, 24, 10, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    const hem = Array.from({ length: 12 }, (_, index) => { const a = index / 11 * Math.PI; return { x: base.x + Math.cos(a) * 23, y: base.y - 22 + Math.sin(a) * 9.5 }; });
    scallops(ctx, hem, accent);
    ctx.fillStyle = accent; ctx.globalAlpha *= 0.35; ctx.beginPath(); ctx.ellipse(base.x, base.y - 25, 14, 5.8, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha /= 0.35;
    vase(ctx, { x: base.x - 9, y: base.y - 27 }, accent);
  }
  if (number) {
    const tag = project(item.x, item.y, seats >= 4 ? 27 : 25);
    ctx.fillStyle = C.light; ctx.strokeStyle = INK; ctx.beginPath(); ctx.roundRect(tag.x + 7, tag.y - 6, number > 9 ? 16 : 11, 9, 3); ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.mid; ctx.font = "bold 8px ui-monospace, monospace"; ctx.textAlign = "center"; ctx.fillText(String(number), tag.x + (number > 9 ? 15 : 12.5), tag.y + 1);
  }
}
/**
 * A wooden chair facing its table (its back on the far side): four legs, a seat with a pastel cushion, and a back with a heart.
 * Chairs facing away from the viewer draw the back separately, in front of the seated guest.
 */
function drawChair(ctx: CanvasRenderingContext2D, seat: Tile, dir: Dir, part: "seat" | "back" | "both" = "both", cushion: string = C.rose) {
  const facing = FACING[dir], side = FACING[(dir + 1) % 4];
  if (part !== "back") {
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(ctx, seat.x + a * 0.15, seat.y + b * 0.15, 0.05, 0.05, 11, WOOD[0], WOOD[1], WOOD[2]);
    box(ctx, seat.x, seat.y, 0.42, 0.42, 3, WOOD[0], WOOD[1], WOOD[2], 11);
    box(ctx, seat.x + facing.x * 0.02, seat.y + facing.y * 0.02, 0.32, 0.32, 3, cushion, shade(cushion.startsWith("#") ? cushion : "#d8b6b4", 0.82), shade(cushion.startsWith("#") ? cushion : "#d8b6b4", 0.92), 14);
  }
  if (part !== "seat") {
    const bx = seat.x - facing.x * 0.19, by = seat.y - facing.y * 0.19, thinX = facing.x !== 0, w = thinX ? 0.05 : 0.4, d = thinX ? 0.4 : 0.05;
    for (const s of [-1, 1]) box(ctx, bx + side.x * s * 0.17, by + side.y * s * 0.17, 0.05, 0.05, 18, WOOD[0], WOOD[1], WOOD[2], 14);
    box(ctx, bx, by, w, d, 7, WOOD[0], WOOD[1], WOOD[2], 25);
    const heartAt = project(bx, by, 22);
    heart(ctx, heartAt.x, heartAt.y - 1, cushion, 2.6);
  }
}
function drawRug(ctx: CanvasRenderingContext2D, kind: ItemKind, tile: Tile, dir: Dir, alpha = 0.7) {
  ctx.globalAlpha = alpha; ctx.lineWidth = 1;
  const quad = (a: number, b: number) => [local(tile, dir, -a, -b), local(tile, dir, a, -b), local(tile, dir, a, b), local(tile, dir, -a, b)];
  const fringe = (a: number, b: number) => {
    ctx.strokeStyle = "rgba(22,22,22,.45)";
    for (const side of [-1, 1]) for (let v = -b + 0.05; v < b; v += 0.09) line(ctx, local(tile, dir, side * a, v), local(tile, dir, side * (a + 0.05), v));
  };
  if (kind === "roundrug") {
    const c = project(tile.x, tile.y);
    ([[0.47, C.butter], [0.36, "#d8c89a"], [0.25, C.butter], [0.13, C.rose]] as const).forEach(([r, fill]) => {
      ctx.fillStyle = fill; ctx.strokeStyle = INK; ctx.beginPath(); ctx.ellipse(c.x, c.y, r * 46.7, r * 23.3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.setLineDash([2, 2]); ctx.strokeStyle = "rgba(22,22,22,.35)"; ctx.stroke(); ctx.setLineDash([]);
    });
  } else if (kind === "runner") {
    poly(ctx, quad(0.46, 0.3), C.sage, INK);
    ctx.strokeStyle = "rgba(247,245,240,.75)"; ctx.lineWidth = 2;
    for (const v of [-0.18, 0.18]) line(ctx, local(tile, dir, -0.4, v), local(tile, dir, 0.4, v));
    ctx.lineWidth = 1;
    for (const u of [-0.24, 0, 0.24]) poly(ctx, [local(tile, dir, u - 0.08, 0), local(tile, dir, u, -0.08), local(tile, dir, u + 0.08, 0), local(tile, dir, u, 0.08)], "rgba(247,245,240,.6)");
    fringe(0.46, 0.3);
  } else {
    poly(ctx, quad(0.46, 0.46), C.rose, INK);
    ctx.setLineDash([3, 3]); poly(ctx, quad(0.34, 0.34), "rgba(0,0,0,0)", "rgba(22,22,22,.4)"); ctx.setLineDash([]);
    fringe(0.46, 0.46);
  }
  ctx.globalAlpha = 1;
}
/** A seat with arms, a back and cushions, `width` across. */
function drawCouch(ctx: CanvasRenderingContext2D, tile: Tile, dir: Dir, width: number, colors: readonly [string, string, string], cushion: string, seats: number) {
  const [top, left, right] = colors, arm = width / 2 - 0.05, inner = width - 0.2;
  backToFront(dir, [
    [0, -0.24, () => {
      turnedBox(ctx, tile, dir, 0, -0.24, width, 0.14, 40, top, left, right);
      if (facesViewer(dir)) onFace(ctx, tile, dir, 0, -0.17, 28, () => {
        ctx.fillStyle = "rgba(22,22,22,.35)";
        for (let i = 0; i < seats * 2 + 1; i++) { ctx.beginPath(); ctx.arc((i / (seats * 2) - 0.5) * inner * 30, 0, 1.2, 0, Math.PI * 2); ctx.fill(); }
      });
    }, width, 0.14],
    [0, 0.06, () => {
      turnedBox(ctx, tile, dir, 0, 0.06, inner, 0.46, 16, top, left, right);
      for (let i = 0; i < seats; i++) turnedBox(ctx, tile, dir, (i + 0.5) / seats * inner - inner / 2, 0.07, inner / seats - 0.04, 0.4, 5, cushion, left, right, 16);
    }, inner, 0.46],
    ...[-arm, arm].map(u => [u, 0.06, () => turnedBox(ctx, tile, dir, u, 0.06, 0.1, 0.46, 26, top, left, right), 0.1, 0.46] as const),
  ]);
}

/** Furniture and décor facing `dir`. The table is drawn by drawTable and drawChair; rugs are drawn flat here only for previews. */
export function drawItem(ctx: CanvasRenderingContext2D, kind: ItemKind, tile: Tile, dir: Dir, now: number, reducedMotion: boolean, statueRows: readonly string[] | null = null) {
  if (isRug(kind)) { drawRug(ctx, kind, tile, dir, 1); return; }
  shadow(ctx, tile.x, tile.y, 16);
  const base = project(tile.x, tile.y), front = facesViewer(dir);
  ctx.lineWidth = 1; ctx.strokeStyle = INK;
  if (kind === "plant") {
    box(ctx, tile.x, tile.y, 0.4, 0.4, 18, "#c79a82", "#a57a64", "#b88a73");
    if (front) cuteFace(ctx, local(tile, dir, 0, 0.2, 9));
    const stem = project(tile.x, tile.y, 18);
    backToFront(dir, ([[-0.2, 0.08, 34, 10], [0.18, -0.12, 38, 11], [0.02, -0.04, 50, 10], [-0.02, 0.22, 28, 8], [0.22, 0.14, 30, 7]] as const).map(([u, v, lift, r]) => [u, v, () => {
      const leaf = local(tile, dir, u, v, lift);
      ctx.strokeStyle = "#7f8f76"; ctx.lineWidth = 1.5; line(ctx, stem, leaf); ctx.lineWidth = 1; ctx.strokeStyle = INK;
      ctx.fillStyle = C.sage; ctx.beginPath(); ctx.ellipse(leaf.x, leaf.y, r, r * 0.7, (leaf.x - base.x) / 20, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = "rgba(22,22,22,.3)"; line(ctx, { x: leaf.x - r * 0.6, y: leaf.y + (leaf.x - base.x) / 30 * -r }, { x: leaf.x + r * 0.6, y: leaf.y + (leaf.x - base.x) / 30 * r }); ctx.strokeStyle = INK;
    }] as const));
  } else if (kind === "cactus") {
    box(ctx, tile.x, tile.y, 0.3, 0.3, 14, "#d8b6b4", "#b39190", "#c6a3a1");
    if (front) cuteFace(ctx, local(tile, dir, 0, 0.15, 7), 0.8);
    const top = project(tile.x, tile.y, 14), at = turn(dir, 0.3, 0.02), arm = local(tile, dir, 0.3, 0.02, 30);
    const drawArm = () => {
      ctx.fillStyle = "#9fb393"; ctx.beginPath(); ctx.roundRect(Math.min(top.x, arm.x), arm.y - 2, Math.abs(arm.x - top.x), 6, 3); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.roundRect(arm.x - 3.5, arm.y - 14, 7, 18, 3.5); ctx.fill(); ctx.stroke();
    };
    if (at.x + at.y < 0) drawArm();
    ctx.fillStyle = "#9fb393"; ctx.beginPath(); ctx.roundRect(top.x - 5.5, top.y - 36, 11, 38, 5.5); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = "rgba(22,22,22,.3)"; line(ctx, { x: top.x, y: top.y - 32 }, { x: top.x, y: top.y }); ctx.strokeStyle = INK;
    if (at.x + at.y >= 0) drawArm();
    ctx.fillStyle = C.rose; ctx.beginPath(); ctx.arc(top.x, top.y - 37, 3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  } else if (kind === "lamp") {
    ctx.fillStyle = C.dark; ctx.fillRect(base.x - 1.5, base.y - 70, 3, 70);
    const glow = ctx.createRadialGradient(base.x, base.y - 72, 2, base.x, base.y - 72, 60);
    glow.addColorStop(0, "rgba(227,201,160,.45)"); glow.addColorStop(1, "rgba(227,201,160,0)");
    ctx.fillStyle = glow; ctx.fillRect(base.x - 60, base.y - 132, 120, 120);
    const cord = local(tile, dir, 0.2, 0.06, 66), behind = !front;
    const pull = () => { ctx.strokeStyle = C.mid; line(ctx, cord, { x: cord.x, y: cord.y + 14 }); ctx.fillStyle = C.butter; ctx.strokeStyle = INK; ctx.beginPath(); ctx.arc(cord.x, cord.y + 15, 1.8, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); };
    if (behind) pull();
    ctx.fillStyle = C.amber; ctx.strokeStyle = INK; ctx.beginPath(); ctx.moveTo(base.x - 12, base.y - 66); ctx.lineTo(base.x + 12, base.y - 66); ctx.lineTo(base.x + 7, base.y - 84); ctx.lineTo(base.x - 7, base.y - 84); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = "rgba(22,22,22,.25)"; for (const dx of [-5, 0, 5]) line(ctx, { x: base.x + dx * 1.4, y: base.y - 67 }, { x: base.x + dx, y: base.y - 83 });
    if (!behind) pull();
  } else if (kind === "coatrack") {
    ctx.strokeStyle = C.dark; ctx.lineWidth = 2.5;
    const hub = project(tile.x, tile.y, 6);
    for (const [u, v] of [[0.22, 0], [-0.22, 0], [0, 0.22], [0, -0.22]]) line(ctx, local(tile, dir, u, v), hub);
    ctx.lineWidth = 1; ctx.strokeStyle = INK;
    const coat = (p: Point, color: string) => {
      ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(p.x - 4, p.y); ctx.lineTo(p.x + 4, p.y); ctx.lineTo(p.x + 9, p.y + 32); ctx.lineTo(p.x - 9, p.y + 32); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = "rgba(22,22,22,.35)"; line(ctx, { x: p.x, y: p.y + 3 }, { x: p.x, y: p.y + 32 }); ctx.strokeStyle = INK;
    };
    backToFront(dir, [
      [0, 0, () => { ctx.fillStyle = C.dark; ctx.fillRect(base.x - 2, base.y - 86, 4, 86); ctx.beginPath(); ctx.arc(base.x, base.y - 88, 3.5, 0, Math.PI * 2); ctx.fill(); }],
      [0.14, 0.03, () => coat(local(tile, dir, 0.14, 0.03, 78), C.rose)],
      [-0.03, 0.14, () => { const p = local(tile, dir, -0.03, 0.14, 74); ctx.fillStyle = C.sage; ctx.fillRect(p.x - 2.5, p.y, 5, 30); ctx.strokeRect(p.x - 2.5, p.y, 5, 30); }],
      [-0.12, -0.05, () => {
        const p = local(tile, dir, -0.12, -0.05, 82);
        ctx.fillStyle = C.dark; ctx.beginPath(); ctx.ellipse(p.x, p.y, 9, 3, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.roundRect(p.x - 5.5, p.y - 9, 11, 9, 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = C.rose; ctx.fillRect(p.x - 5.5, p.y - 3, 11, 2);
      }],
    ]);
  } else if (kind === "chalkboard") {
    const board = (side: 1 | -1, text: boolean) => {
      const corners = [local(tile, dir, -0.28, side * 0.2), local(tile, dir, 0.28, side * 0.2), local(tile, dir, 0.26, 0, 58), local(tile, dir, -0.26, 0, 58)];
      poly(ctx, corners, "#9c8672", INK);
      const c = { x: corners.reduce((sum, p) => sum + p.x, 0) / 4, y: corners.reduce((sum, p) => sum + p.y, 0) / 4 };
      poly(ctx, corners.map(p => ({ x: c.x + (p.x - c.x) * 0.8, y: c.y + (p.y - c.y) * 0.84 })), "#2c2c2b", INK);
      if (!text) return;
      onFace(ctx, tile, dir, 0, side * 0.1, 28, () => {
        ctx.fillStyle = "#f7f5f0"; ctx.font = "bold 8px ui-monospace, monospace"; ctx.textAlign = "center";
        if (side === 1) {
          ctx.fillText("MENU", 0, -8); ctx.strokeStyle = "rgba(247,245,240,.7)";
          for (const y of [-2, 3, 8]) line(ctx, { x: -7, y }, { x: 5 + (y % 2) * 2, y });
          heart(ctx, 0, 13, C.rose, 3);
        } else { ctx.fillText("OPEN", 0, -4); heart(ctx, 0, 6, C.butter, 3.4); }
      }, side === -1);
    };
    if (front) { board(-1, false); board(1, true); } else { board(1, false); board(-1, true); }
  } else if (kind === "flowers") {
    ctx.fillStyle = C.dark; ctx.fillRect(base.x - 2, base.y - 30, 4, 30); ctx.beginPath(); ctx.ellipse(base.x, base.y - 1, 8, 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.fillStyle = "#8f7563"; ctx.beginPath(); ctx.ellipse(base.x, base.y - 30, 17, 7.5, 0, 0, Math.PI); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#b89b73"; ctx.beginPath(); ctx.ellipse(base.x, base.y - 33, 17, 7.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    backToFront(dir, [
      [-0.12, -0.05, () => turnedBox(ctx, tile, dir, -0.12, -0.05, 0.2, 0.14, 4, C.blue, "#8e9aa9", "#9fabbb", 33), 0.2, 0.14],
      [0.08, 0.07, () => {
        const p = local(tile, dir, 0.08, 0.07, 33);
        mirror(ctx, p.x, facesRight(dir), () => {
          ctx.strokeStyle = "#7f8f76"; ctx.lineWidth = 1.4;
          const heads = [[-6, -24, C.rose], [0, -29, C.butter], [6, -23, C.lavender], [-2, -20, C.rose]] as const;
          for (const [dx, dy] of heads) line(ctx, { x: p.x, y: p.y - 10 }, { x: p.x + dx, y: p.y + dy });
          ctx.strokeStyle = INK; ctx.lineWidth = 1.2;
          ctx.fillStyle = C.light; ctx.beginPath(); ctx.ellipse(p.x, p.y - 5, 4.5, 6.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          for (const [dx, dy, color] of heads) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(p.x + dx, p.y + dy, 3.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
        });
      }],
    ]);
  } else if (kind === "shelf") {
    turnedBox(ctx, tile, dir, 0, 0, 0.8, 0.35, 70, "#a38d77", "#7c6a58", "#8f7b67");
    const colors = [C.rose, C.blue, C.sage, C.butter, C.lavender, C.mid];
    if (front) for (let row = 0; row < 3; row++) onFace(ctx, tile, dir, 0, 0.18, 10 + row * 20, () => {
      for (let i = 0; i < 5; i++) {
        const x = (-0.3 + i * 0.13) * 33, tall = 14 - ((i + row) % 3) * 2;
        ctx.fillStyle = colors[(i + row * 2) % colors.length]; ctx.fillRect(x - 2, -tall, 4, tall); ctx.strokeRect(x - 2, -tall, 4, tall);
      }
      ctx.strokeStyle = "rgba(22,22,22,.35)"; line(ctx, { x: -13, y: 0.5 }, { x: 13, y: 0.5 }); ctx.strokeStyle = INK;
    });
    else onFace(ctx, tile, dir, 0, -0.18, 0, () => {
      ctx.strokeStyle = "rgba(22,22,22,.25)"; for (const x of [-7, 0, 7]) line(ctx, { x, y: -2 }, { x, y: -68 }); ctx.strokeStyle = INK;
    }, true);
  } else if (kind === "armchair") {
    drawCouch(ctx, tile, dir, 0.62, ["#d8b6b4", "#b39190", "#c6a3a1"], "#e6cfcd", 1);
  } else if (kind === "sofa") {
    drawCouch(ctx, tile, dir, 0.94, [C.lavender, "#9d95ab", "#b1a9c0"], "#d7d0e0", 2);
  } else if (kind === "catbed") {
    const c = project(tile.x, tile.y);
    ctx.lineWidth = 1.2;
    ctx.fillStyle = "#b89b73"; ctx.beginPath(); ctx.ellipse(c.x, c.y - 4, 21, 10.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.rose; ctx.beginPath(); ctx.ellipse(c.x, c.y - 7, 16.5, 7.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    const breathe = reducedMotion ? 0 : Math.sin(now / 700) * 0.9, body = project(tile.x, tile.y, 9), head = local(tile, dir, 0, 0.2, 12), at = turn(dir, 0, 0.2);
    const tail = local(tile, dir, 0.2, -0.05, 8), cat = "#8f8a84";
    const drawHead = () => {
      ctx.fillStyle = cat; ctx.beginPath();
      ctx.moveTo(head.x - 6, head.y - 3); ctx.lineTo(head.x - 5, head.y - 10); ctx.lineTo(head.x - 1.5, head.y - 5.5);
      ctx.lineTo(head.x + 1.5, head.y - 5.5); ctx.lineTo(head.x + 5, head.y - 10); ctx.lineTo(head.x + 6, head.y - 3); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(head.x, head.y - 1, 6.5, 5.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (front) { ctx.strokeStyle = INK; for (const dx of [-2.5, 2.5]) { ctx.beginPath(); ctx.arc(head.x + dx, head.y - 1.5, 1.4, 0.2, Math.PI - 0.2); ctx.stroke(); } }
    };
    if (at.x + at.y < 0) drawHead();
    ctx.fillStyle = cat; ctx.beginPath(); ctx.ellipse(body.x, body.y, 13, 7 + breathe, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.lineWidth = 3.5; ctx.strokeStyle = INK; ctx.beginPath(); ctx.moveTo(body.x + (tail.x - body.x) * 0.6, body.y + 3); ctx.quadraticCurveTo(tail.x, tail.y + 4, tail.x + (tail.x - body.x) * 0.2, tail.y - 2); ctx.stroke();
    ctx.lineWidth = 2; ctx.strokeStyle = cat; ctx.stroke(); ctx.lineWidth = 1.2; ctx.strokeStyle = INK;
    if (at.x + at.y >= 0) drawHead();
    if (!reducedMotion) { const t = (now / 1600) % 1; ctx.globalAlpha = 1 - t; ctx.fillStyle = INK; ctx.font = "bold 9px ui-monospace, monospace"; ctx.textAlign = "center"; ctx.fillText("z", head.x + 9 + t * 5, head.y - 10 - t * 14); ctx.globalAlpha = 1; }
  } else if (kind === "birdcage") {
    ctx.fillStyle = C.dark; ctx.fillRect(base.x - 1.5, base.y - 50, 3, 50); ctx.beginPath(); ctx.ellipse(base.x, base.y - 1, 10, 4, 0, 0, Math.PI * 2); ctx.fill();
    const brass = "#8a7a4a", floor = project(tile.x, tile.y, 50), rim = project(tile.x, tile.y, 86);
    ctx.fillStyle = "#e2d7ad"; ctx.strokeStyle = INK; ctx.beginPath(); ctx.ellipse(floor.x, floor.y, 14, 6.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    const bars = Array.from({ length: 12 }, (_, index) => { const a = index * Math.PI / 6; return { u: Math.cos(a) * 0.21, v: Math.sin(a) * 0.21 }; });
    const bar = ({ u, v }: { u: number; v: number }) => { ctx.strokeStyle = brass; line(ctx, local(tile, dir, u, v, 50), local(tile, dir, u, v, 86)); };
    const depth = ({ u, v }: { u: number; v: number }) => { const t = turn(dir, u, v); return t.x + t.y; };
    bars.filter(item => depth(item) < 0).forEach(bar);
    ctx.strokeStyle = C.wood; ctx.lineWidth = 2; line(ctx, local(tile, dir, -0.15, 0, 62), local(tile, dir, 0.15, 0, 62)); ctx.lineWidth = 1;
    const perch = local(tile, dir, 0.05, 0, 62), hop = reducedMotion ? 0 : Math.max(0, Math.sin(now / 280)) * 3;
    mirror(ctx, perch.x, facesRight(dir), () => {
      const bx = perch.x, by = perch.y - 5 - hop;
      ctx.fillStyle = C.butter; ctx.strokeStyle = INK;
      ctx.beginPath(); ctx.moveTo(bx + 5, by); ctx.lineTo(bx + 10, by + 3); ctx.lineTo(bx + 5, by + 3); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(bx, by, 5.5, 4, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(bx - 4, by - 4, 3.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#c98f5f"; ctx.beginPath(); ctx.moveTo(bx - 7, by - 4.5); ctx.lineTo(bx - 10, by - 3.5); ctx.lineTo(bx - 7, by - 2.8); ctx.fill();
      if (front) { ctx.fillStyle = INK; ctx.fillRect(bx - 5, by - 5, 1.2, 1.2); }
    });
    bars.filter(item => depth(item) >= 0).forEach(bar);
    ctx.strokeStyle = INK; ctx.beginPath(); ctx.ellipse(rim.x, rim.y, 14, 6.5, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "rgba(226,215,173,.5)"; ctx.beginPath(); ctx.moveTo(rim.x - 14, rim.y); ctx.bezierCurveTo(rim.x - 14, rim.y - 20, rim.x + 14, rim.y - 20, rim.x + 14, rim.y); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(rim.x, rim.y - 18, 3, 0, Math.PI * 2); ctx.stroke();
  } else if (kind === "record") {
    box(ctx, tile.x, tile.y, 0.6, 0.6, 26, "#8a6f5c", "#5d4b3f", "#735e4f");
    const top = project(tile.x, tile.y, 26), spin = reducedMotion ? 0 : now / 500;
    ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(top.x, top.y, 14, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.rose; ctx.beginPath(); ctx.ellipse(top.x, top.y, 4, 1.8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(247,245,240,.5)"; ctx.beginPath(); ctx.ellipse(top.x, top.y, 9, 3.8, 0, spin, spin + 1.4); ctx.stroke();
    // Tone arm from the back-right corner onto the record.
    const pivot = local(tile, dir, 0.22, -0.2, 27), tip = local(tile, dir, 0.08, 0.04, 29);
    ctx.strokeStyle = INK; ctx.lineWidth = 3; line(ctx, pivot, tip); ctx.strokeStyle = C.light; ctx.lineWidth = 1.5; line(ctx, pivot, tip); ctx.lineWidth = 1;
    ctx.fillStyle = C.light; ctx.strokeStyle = INK; ctx.beginPath(); ctx.arc(pivot.x, pivot.y, 3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (front) onFace(ctx, tile, dir, 0, 0.3, 10, () => { for (const x of [-6, 6]) { ctx.fillStyle = C.light; ctx.beginPath(); ctx.arc(x, 0, 2.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); } });
    if (!reducedMotion) { const t = (now / 1400) % 1; ctx.globalAlpha = 1 - t; ctx.fillStyle = INK; ctx.font = "12px ui-monospace, monospace"; ctx.textAlign = "center"; ctx.fillText("♪", top.x + 12 + t * 8, top.y - 12 - t * 26); ctx.globalAlpha = 1; }
  } else if (kind === "cakecase") {
    turnedBox(ctx, tile, dir, 0, 0, 0.86, 0.5, 26, "#b6a594", "#8c7d6e", "#a19080");
    backToFront(dir, [
      [-0.2, 0, () => { const p = local(tile, dir, -0.2, 0, 32); drawShape(ctx, "cake", "#f3eee6", "#d49d9d", p.x, p.y, 0.7); }],
      [0.2, 0, () => { const p = local(tile, dir, 0.2, 0, 32); drawShape(ctx, "macaron", "#d8b6b4", "#b4c3ab", p.x, p.y, 0.7); }],
    ]);
    turnedBox(ctx, tile, dir, 0, 0, 0.8, 0.44, 22, "rgba(225,232,238,.35)", "rgba(200,212,222,.45)", "rgba(212,222,230,.45)", 26);
    ctx.strokeStyle = "rgba(247,245,240,.8)"; ctx.lineWidth = 1.5;
    const shine = front ? 0.22 : -0.22; line(ctx, local(tile, dir, -0.3, shine, 44), local(tile, dir, -0.22, shine, 30)); ctx.lineWidth = 1; ctx.strokeStyle = INK;
    if (front) onFace(ctx, tile, dir, 0, 0.25, 10, () => {
      ctx.fillStyle = C.light; ctx.fillRect(-9, -6, 18, 9); ctx.strokeRect(-9, -6, 18, 9); heart(ctx, 0, -2.5, C.rose, 2.6);
    });
    else onFace(ctx, tile, dir, 0, -0.25, 6, () => {
      ctx.strokeStyle = "rgba(22,22,22,.35)"; ctx.strokeRect(-12, -14, 12, 12); ctx.strokeRect(0, -14, 12, 12); ctx.strokeStyle = INK;
      ctx.fillStyle = C.light; ctx.fillRect(-3, -9, 2, 3); ctx.fillRect(1, -9, 2, 3);
    }, true);
  } else if (kind === "clock") {
    turnedBox(ctx, tile, dir, 0, 0, 0.42, 0.3, 104, "#8a6f5c", "#5d4b3f", "#735e4f");
    turnedBox(ctx, tile, dir, 0, 0, 0.5, 0.36, 7, "#9c8672", "#6e5a4a", "#85705e", 104);
    if (front) onFace(ctx, tile, dir, 0, 0.16, 0, () => {
      ctx.fillStyle = C.light; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(0, -88, 7.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      const minutes = reducedMotion ? 0.1 : now / 60_000 * 12, hours = reducedMotion ? 0.35 : minutes / 12;
      for (const [turns, length] of [[minutes, 6], [hours, 4]] as const) {
        const a = turns * Math.PI * 2 - Math.PI / 2; line(ctx, { x: 0, y: -88 }, { x: Math.cos(a) * length, y: -88 + Math.sin(a) * length });
      }
      ctx.fillStyle = "#3b3a38"; ctx.fillRect(-5, -72, 10, 44); ctx.strokeRect(-5, -72, 10, 44);
      const swing = reducedMotion ? 0 : Math.sin(now / 520) * 0.3, bob = { x: Math.sin(swing) * 32, y: -70 + Math.cos(swing) * 32 };
      ctx.strokeStyle = C.butter; line(ctx, { x: 0, y: -70 }, bob);
      ctx.fillStyle = C.butter; ctx.strokeStyle = INK; ctx.beginPath(); ctx.arc(bob.x, bob.y, 3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    });
    else onFace(ctx, tile, dir, 0, -0.16, 0, () => { ctx.strokeStyle = "rgba(22,22,22,.25)"; for (const x of [-3.5, 3.5]) line(ctx, { x, y: -4 }, { x, y: -100 }); ctx.strokeStyle = INK; }, true);
  } else if (kind === "arcade") {
    const screen = reducedMotion ? 0 : Math.floor(now / 160);
    backToFront(dir, [
      [0, -0.05, () => {
        turnedBox(ctx, tile, dir, 0, -0.05, 0.56, 0.42, 72, "#3b3a38", "#2c2c2b", "#333231");
        if (front) onFace(ctx, tile, dir, 0, 0.16, 0, () => {
          ctx.fillStyle = C.butter; ctx.fillRect(-9, -72, 18, 7); ctx.strokeRect(-9, -72, 18, 7);
          ctx.fillStyle = INK; ctx.font = "bold 6px ui-monospace, monospace"; ctx.textAlign = "center"; ctx.fillText("RF", 0, -66.5);
          ctx.fillStyle = "#26303a"; ctx.fillRect(-7.5, -62, 15, 17); ctx.strokeRect(-7.5, -62, 15, 17);
          ctx.fillStyle = C.rose; ctx.fillRect(-6 + (screen % 6) * 2, -55, 3, 3);
          ctx.fillStyle = C.sage; for (let i = 0; i < 3; i++) ctx.fillRect(-6 + i * 5, -60 + ((screen + i) % 3), 2, 2);
          ctx.fillStyle = C.blue; ctx.fillRect(-6, -48, 12, 1.5);
        });
        else onFace(ctx, tile, dir, 0, -0.26, 0, () => { ctx.strokeStyle = "rgba(247,245,240,.25)"; for (let y = -60; y < -40; y += 4) line(ctx, { x: -5, y }, { x: 5, y }); ctx.strokeStyle = INK; }, true);
      }, 0.56, 0.42],
      [0, 0.24, () => {
        turnedBox(ctx, tile, dir, 0, 0.24, 0.56, 0.16, 6, C.rose, "#b39190", "#c6a3a1", 34);
        const stick = local(tile, dir, -0.12, 0.24, 40);
        ctx.strokeStyle = INK; ctx.lineWidth = 2; line(ctx, stick, { x: stick.x, y: stick.y - 6 }); ctx.lineWidth = 1;
        ctx.fillStyle = "#c98f8f"; ctx.beginPath(); ctx.arc(stick.x, stick.y - 7, 2.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        for (const [u, color] of [[0.06, C.butter], [0.16, C.blue]] as const) { const p = local(tile, dir, u, 0.24, 40); ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(p.x, p.y, 2.4, 1.3, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
      }, 0.56, 0.16],
    ]);
  } else if (kind === "aquarium") {
    turnedBox(ctx, tile, dir, 0, 0, 0.92, 0.46, 24, "#8a6f5c", "#5d4b3f", "#735e4f");
    turnedBox(ctx, tile, dir, 0, 0, 0.86, 0.4, 5, "#e2d7ad", "#c9bd92", "#d6ca9f", 24);
    const weed = (u: number, v: number, color: string) => {
      const p = local(tile, dir, u, v, 29), sway = reducedMotion ? 0 : Math.sin(now / 700 + u * 9) * 2;
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.quadraticCurveTo(p.x + 4 + sway, p.y - 10, p.x + sway, p.y - 22); ctx.stroke(); ctx.lineWidth = 1;
    };
    const across = turn(dir, 1, 0), screenRight = across.x - across.y > 0;
    const fish = (index: number) => {
      const phase = now / 1500 + index * 2.1, u = reducedMotion ? (index ? 0.15 : -0.12) : Math.sin(phase) * 0.28, heading = reducedMotion ? 1 : Math.cos(phase);
      const p = local(tile, dir, u, index ? 0.06 : -0.06, 40 + index * 9), right = (heading > 0) === screenRight;
      mirror(ctx, p.x, !right, () => {
        ctx.fillStyle = index ? C.butter : "#d49d93"; ctx.strokeStyle = INK;
        ctx.beginPath(); ctx.moveTo(p.x - 4, p.y); ctx.lineTo(p.x - 8, p.y - 3.5); ctx.lineTo(p.x - 8, p.y + 3.5); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(p.x, p.y, 5, 3.2, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = INK; ctx.fillRect(p.x + 2, p.y - 1.2, 1.2, 1.2);
      });
    };
    backToFront(dir, [[-0.3, -0.1, () => weed(-0.3, -0.1, "#7f8f76")], [-0.2, 0.08, () => weed(-0.2, 0.08, C.sage)], [0.3, -0.08, () => weed(0.3, -0.08, "#9fb393")], [0, -0.06, () => fish(0)], [0, 0.06, () => fish(1)]]);
    if (!reducedMotion) for (let i = 0; i < 3; i++) {
      const t = (now / 1800 + i / 3) % 1, p = local(tile, dir, 0.26, 0.04, 30 + t * 30);
      ctx.strokeStyle = "rgba(247,245,240,.9)"; ctx.beginPath(); ctx.arc(p.x + Math.sin(t * 9) * 1.5, p.y, 1.6, 0, Math.PI * 2); ctx.stroke();
    }
    turnedBox(ctx, tile, dir, 0, 0, 0.88, 0.42, 36, "rgba(175,188,203,.3)", "rgba(150,166,184,.38)", "rgba(165,180,196,.38)", 24);
    turnedBox(ctx, tile, dir, 0, 0, 0.92, 0.46, 3, C.dark, "#2c2c2b", "#333", 60);
  } else if (kind === "luckycat") {
    box(ctx, tile.x, tile.y, 0.45, 0.45, 14, "#c9a44a", "#9c7d34", "#b28f3f");
    const top = project(tile.x, tile.y, 14), wave = reducedMotion ? 0 : Math.sin(now / 250) * 4;
    mirror(ctx, top.x, facesRight(dir), () => {
      ctx.fillStyle = C.light; ctx.strokeStyle = INK; ctx.lineWidth = 1.4;
      const paw = () => { ctx.fillStyle = C.light; ctx.beginPath(); ctx.ellipse(top.x + (front ? 12 : -12), top.y - 34 + wave, 4, 7, front ? 0.3 : -0.3, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); };
      if (!front) paw();
      ctx.fillStyle = C.light; ctx.beginPath(); ctx.ellipse(top.x, top.y - 14, 12, 14, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(top.x, top.y - 32, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(top.x - 9, top.y - 38); ctx.lineTo(top.x - 6, top.y - 46); ctx.lineTo(top.x - 2, top.y - 40); ctx.moveTo(top.x + 9, top.y - 38); ctx.lineTo(top.x + 6, top.y - 46); ctx.lineTo(top.x + 2, top.y - 40); ctx.stroke();
      if (front) {
        ctx.fillStyle = INK; ctx.fillRect(top.x - 5, top.y - 34, 2, 2); ctx.fillRect(top.x + 3, top.y - 34, 2, 2);
        ctx.fillStyle = "#c98f8f"; ctx.fillRect(top.x - 6, top.y - 22, 12, 3); ctx.fillStyle = C.butter; ctx.beginPath(); ctx.arc(top.x, top.y - 16, 3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        paw();
      } else {
        ctx.fillStyle = "#c98f8f"; ctx.fillRect(top.x - 9, top.y - 24, 18, 3);
        ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(top.x + 4, top.y - 4); ctx.quadraticCurveTo(top.x + 14, top.y - 6, top.x + 10, top.y - 16); ctx.stroke(); ctx.lineWidth = 1.4;
      }
    });
  } else if (kind === "gumball") {
    box(ctx, tile.x, tile.y, 0.4, 0.4, 30, "#c98f8f", "#9e6d6d", "#b27e7e");
    if (front) onFace(ctx, tile, dir, 0, 0.2, 6, () => {
      ctx.fillStyle = C.dark; ctx.fillRect(-4, -9, 8, 7); ctx.strokeRect(-4, -9, 8, 7);
      ctx.fillStyle = C.light; ctx.beginPath(); ctx.arc(0, -19, 3.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); line(ctx, { x: -2, y: -19 }, { x: 2, y: -19 });
    });
    const top = project(tile.x, tile.y, 30);
    ctx.fillStyle = "rgba(225,232,238,.8)"; ctx.strokeStyle = INK; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(top.x, top.y - 16, 16, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    [C.rose, C.sage, C.butter, C.blue, C.lavender, C.amber, C.rose, C.sage].forEach((color, index) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(top.x - 9 + (index % 4) * 6, top.y - 10 - Math.floor(index / 4) * 7, 3.2, 0, Math.PI * 2); ctx.fill(); });
    ctx.fillStyle = "#c98f8f"; ctx.beginPath(); ctx.arc(top.x, top.y - 33, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  } else if (kind === "crane") {
    ctx.fillStyle = C.dark; ctx.fillRect(base.x - 1.5, base.y - 80, 3, 80);
    ctx.strokeStyle = C.dark; ctx.lineWidth = 3; line(ctx, local(tile, dir, -0.36, 0, 80), local(tile, dir, 0.36, 0, 80)); ctx.lineWidth = 1;
    backToFront(dir, ([[-0.3, 20, C.rose], [-0.1, 32, C.light], [0.1, 24, C.butter], [0.3, 36, C.blue]] as const).map(([u, drop, color]) => [u, 0, () => {
      const hook = local(tile, dir, u, 0, 79), sway = reducedMotion ? 0 : Math.sin(now / 600 + u * 30) * 2, x = hook.x + sway, y = hook.y + drop;
      ctx.strokeStyle = INK; line(ctx, hook, { x, y: y - 6 });
      ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(x - 7, y); ctx.lineTo(x, y - 6); ctx.lineTo(x + 7, y); ctx.lineTo(x, y + 3); ctx.closePath(); ctx.fill(); ctx.stroke();
    }] as const));
  } else if (kind === "jukebox") {
    turnedBox(ctx, tile, dir, 0, 0, 0.6, 0.45, 48, "#c9ccd0", "#9aa0a6", "#b3b8bd");
    const top = project(tile.x, tile.y, 48), glow = reducedMotion ? 0.6 : 0.5 + Math.sin(now / 300) * 0.3;
    onFace(ctx, tile, dir, 0, 0, 48, () => {
      ctx.fillStyle = `rgba(216,182,180,${glow})`; ctx.strokeStyle = INK; ctx.beginPath(); ctx.arc(0, 0, 10, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = "rgba(247,245,240,.8)"; ctx.beginPath(); ctx.arc(0, 0, 6.5, Math.PI, 0); ctx.stroke(); ctx.strokeStyle = INK;
    });
    if (front) onFace(ctx, tile, dir, 0, 0.23, 18, () => {
      ctx.fillStyle = C.dark; ctx.fillRect(-8, -22, 16, 12); ctx.strokeRect(-8, -22, 16, 12);
      ctx.fillStyle = C.butter; for (let i = 0; i < 4; i++) ctx.fillRect(-7 + i * 4, -19, 2.5, 6);
      ctx.fillStyle = "rgba(22,22,22,.35)"; for (let y = -6; y < 4; y += 3) ctx.fillRect(-6, y, 12, 1.2);
    });
    else onFace(ctx, tile, dir, 0, -0.23, 18, () => { ctx.strokeStyle = "rgba(22,22,22,.3)"; for (let y = -24; y < 4; y += 4) line(ctx, { x: -6, y }, { x: 6, y }); ctx.strokeStyle = INK; }, true);
    if (!reducedMotion) { const t = (now / 1100) % 1; ctx.globalAlpha = 1 - t; ctx.fillStyle = INK; ctx.font = "12px ui-monospace, monospace"; ctx.textAlign = "center"; ctx.fillText("♫", top.x - 14 - t * 6, top.y - 20 - t * 24); ctx.globalAlpha = 1; }
  } else if (kind === "fountain") {
    box(ctx, tile.x, tile.y, 0.7, 0.7, 12, "#d6dade", "#a9afb5", "#bfc4c9");
    const top = project(tile.x, tile.y, 12);
    ctx.fillStyle = "#afbccb"; ctx.beginPath(); ctx.ellipse(top.x, top.y, 18, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#c9ccd0"; ctx.fillRect(top.x - 3, top.y - 26, 6, 26); ctx.strokeStyle = INK; ctx.strokeRect(top.x - 3, top.y - 26, 6, 26);
    ctx.strokeStyle = "rgba(247,245,240,.9)"; ctx.lineWidth = 2;
    // Two jets to the sides and one, lower, to the front.
    const t = reducedMotion ? 0 : (now / 500) % 1;
    for (const [u, v, rise] of [[-1, 0, 8], [1, 0, 8], [0, 1, 2]] as const) {
      const from = project(tile.x, tile.y, 38), bend = local(tile, dir, u * 0.18, v * 0.18, 38 + rise), to = local(tile, dir, u * (0.27 + t * 0.03), v * (0.27 + t * 0.03), 13);
      ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.quadraticCurveTo(bend.x, bend.y, to.x, to.y); ctx.stroke();
    }
    ctx.lineWidth = 1;
  } else if (kind === "telescope") {
    const pivot = project(tile.x, tile.y, 40);
    ctx.strokeStyle = INK; ctx.lineWidth = 2;
    for (const [u, v] of [[0, -0.26], [-0.23, 0.14], [0.23, 0.14]]) line(ctx, local(tile, dir, u, v), pivot);
    // The tube tilts up toward the item's front; the eyepiece is at the back.
    const eye = local(tile, dir, 0, -0.3, 30), lens = local(tile, dir, 0, 0.36, 62);
    const tube = () => { ctx.lineCap = "round"; ctx.strokeStyle = INK; ctx.lineWidth = 13; line(ctx, eye, lens); ctx.strokeStyle = "#9fabc2"; ctx.lineWidth = 10; line(ctx, eye, lens); ctx.lineCap = "butt"; ctx.lineWidth = 1; };
    const ring = () => { ctx.fillStyle = C.butter; ctx.strokeStyle = INK; ctx.beginPath(); ctx.ellipse(lens.x, lens.y, 6, 7, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); };
    const eyepiece = () => { ctx.fillStyle = C.dark; ctx.beginPath(); ctx.arc(eye.x, eye.y, 3.5, 0, Math.PI * 2); ctx.fill(); };
    if (front) { eyepiece(); tube(); ring(); } else { ring(); tube(); eyepiece(); }
    const twinkle = reducedMotion ? 1 : 0.5 + Math.abs(Math.sin(now / 400)) * 0.5;
    ctx.globalAlpha = twinkle; ctx.fillStyle = C.butter; ctx.font = "12px ui-monospace, monospace"; ctx.textAlign = "center"; ctx.fillText("✦", lens.x + (lens.x > base.x ? 12 : -12), lens.y - 18); ctx.globalAlpha = 1;
  } else if (kind === "starlamp") {
    ctx.fillStyle = C.dark; ctx.fillRect(base.x - 1.5, base.y - 60, 3, 60);
    const glow = ctx.createRadialGradient(base.x, base.y - 66, 2, base.x, base.y - 66, 55);
    glow.addColorStop(0, "rgba(233,227,196,.55)"); glow.addColorStop(1, "rgba(233,227,196,0)"); ctx.fillStyle = glow; ctx.fillRect(base.x - 55, base.y - 121, 110, 110);
    const spin = (reducedMotion ? 0 : now / 2000) + dir * Math.PI / 10;
    ctx.save(); ctx.translate(base.x, base.y - 68); ctx.rotate(spin); ctx.fillStyle = C.butter; ctx.strokeStyle = INK; ctx.beginPath();
    for (let i = 0; i < 10; i++) { const r = i % 2 ? 6 : 14, a = i * Math.PI / 5 - Math.PI / 2; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  } else if (kind === "statue") {
    box(ctx, tile.x, tile.y, 0.6, 0.6, 24, "#e2d49e", "#b8a15a", "#cbb66f");
    if (front) onFace(ctx, tile, dir, 0, 0.3, 8, () => { ctx.fillStyle = "#b8962e"; ctx.fillRect(-7, -8, 14, 7); ctx.strokeRect(-7, -8, 14, 7); });
    if (statueRows) {
      const art = spriteCanvas(statueRows, 3, "#b8962e"), top = project(tile.x, tile.y, 24);
      ctx.drawImage(art, Math.round(top.x - art.width / 2), Math.round(top.y - art.height + 6));
    }
    const shine = reducedMotion ? 0.8 : 0.4 + Math.abs(Math.sin(now / 700)) * 0.6, top = project(tile.x, tile.y, 80);
    ctx.globalAlpha = shine; ctx.fillStyle = "#fff"; ctx.font = "12px ui-monospace, monospace"; ctx.textAlign = "center"; ctx.fillText("✦", top.x + 18, top.y); ctx.globalAlpha = 1;
  } else if (kind === "piano") {
    const keys = () => turnedBox(ctx, tile, dir, 0.05, 0.28, 0.75, 0.2, 4, C.light, "#cfccc5", "#e1ded7", 26);
    const body = () => turnedBox(ctx, tile, dir, 0, 0, 0.85, 0.45, 50, "#2e2d2b", "#1f1e1d", "#292826");
    if (front) { body(); keys(); onFace(ctx, tile, dir, 0.05, 0.23, 34, () => { ctx.fillStyle = C.light; ctx.fillRect(-8, -10, 16, 9); ctx.strokeRect(-8, -10, 16, 9); ctx.strokeStyle = "rgba(22,22,22,.4)"; for (const y of [-8, -5.5, -3]) line(ctx, { x: -6, y }, { x: 6, y }); ctx.strokeStyle = INK; }); }
    else { keys(); body(); }
    const candle = local(tile, dir, -0.2, 0, 50), book = local(tile, dir, 0.16, 0, 50);
    ctx.fillStyle = C.butter; ctx.fillRect(candle.x - 2, candle.y - 10, 4, 10); ctx.fillStyle = C.rose; ctx.fillRect(book.x - 3, book.y - 8, 6, 8);
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
  const top = project(tile.x, tile.y, 36), offset = layout.kitchenSide === "left" ? tile.y - layout.pass.y : tile.x - layout.pass.x;
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
function drawStove(ctx: CanvasRenderingContext2D, tile: Tile, index: number, busy: boolean, now: number, reducedMotion: boolean) {
  if (index === 0) { box(ctx, tile.x, tile.y, 0.9, 0.9, 88, "#e6e3dc", "#b9b6af", "#cfccc5"); return; }
  if (index % 3 === 2) { box(ctx, tile.x, tile.y, 0.9, 1, 34, "#bdbab3", "#8e8b85", "#a5a29c"); const top = project(tile.x, tile.y, 34); ctx.fillStyle = "#afbccb"; ctx.beginPath(); ctx.ellipse(top.x, top.y, 9, 4, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = INK; ctx.stroke(); return; }
  box(ctx, tile.x, tile.y, 0.9, 1, 34, "#8f8c86", "#6b6964", "#7d7a75");
  const top = project(tile.x, tile.y, 34);
  ctx.strokeStyle = INK;
  for (const dy of [-4, 4]) { ctx.beginPath(); ctx.ellipse(top.x + dy * 1.6, top.y + dy * 0.2, 6, 2.5, 0, 0, Math.PI * 2); ctx.stroke(); }
  if (busy && index % 3 === 1) {
    const flicker = reducedMotion ? 0 : Math.sin(now / 90 + tile.y) * 1.5;
    ctx.fillStyle = "rgba(227,201,160,.9)"; ctx.beginPath(); ctx.ellipse(top.x - 6, top.y - 1, 4, 1.6 + flicker * 0.2, 0, 0, Math.PI * 2); ctx.fill();
  }
}
/** Interior half-height walls between the kitchen, the break room and the dining room. */
/** A darker shade of a #rrggbb colour, for the sides of the building's trim. */
function shade(hex: string, factor: number) {
  const value = parseInt(hex.slice(1), 16), channel = (shift: number) => Math.round(((value >> shift) & 255) * factor);
  return `rgb(${channel(16)},${channel(8)},${channel(0)})`;
}
function drawWall(ctx: CanvasRenderingContext2D, tile: Tile, along: "x" | "y", height = 70, trim = "#d0cdc6") {
  const left = shade(trim, 0.86), right = shade(trim, 0.94);
  if (along === "x") box(ctx, tile.x, tile.y, 1, 0.3, height, trim, left, right);
  else box(ctx, tile.x, tile.y, 0.3, 1, height, trim, left, right);
  if (height < 50) { const top = project(tile.x, tile.y, height); ctx.fillStyle = C.sage; ctx.strokeStyle = INK; ctx.beginPath(); ctx.ellipse(top.x, top.y - 4, 7, 4, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
}
function drawSofa(ctx: CanvasRenderingContext2D, x: number, y: number, length: number) {
  box(ctx, x, y, 0.5, length, 14, C.lavender, "#9d95ab", "#b1a9c0");
  box(ctx, x - 0.2, y, 0.12, length, 30, C.lavender, "#9d95ab", "#b1a9c0");
}
/** Low front walls (so the room stays visible) with the front door, its frame, awning and OPEN sign. */
function drawFrontWall(ctx: CanvasRenderingContext2D, tile: Tile, side: "right" | "left", trim = "#d0cdc6") {
  const left = shade(trim, 0.86), right = shade(trim, 0.94);
  if (side === "right") box(ctx, tile.x + 0.44, tile.y, 0.12, 1, 22, trim, left, right);
  else box(ctx, tile.x, tile.y + 0.44, 1, 0.12, 22, trim, left, right);
}
function drawDoor(ctx: CanvasRenderingContext2D, layout: ReturnType<typeof plan>, accent: string) {
  const x = layout.w - 0.5, y = layout.door.y;
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
/** The capsule machine; its crank is on the `dir` side, where the manager stands to use it. */
function drawCapsuleMachine(ctx: CanvasRenderingContext2D, tile: Tile, dir: Dir, now: number, reducedMotion: boolean) {
  const { x, y } = tile;
  shadow(ctx, x, y, 22);
  const crank = () => {
    const hub = project(x + FACING[dir].x * 0.37, y + FACING[dir].y * 0.37, 22), turn = reducedMotion ? 0 : now / 900;
    ctx.fillStyle = C.light; ctx.strokeStyle = INK; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.ellipse(hub.x, hub.y, 6, 6, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    const end = { x: hub.x + Math.cos(turn) * 5, y: hub.y + Math.sin(turn) * 5 };
    ctx.lineWidth = 2; line(ctx, hub, end); ctx.fillStyle = C.rose; ctx.beginPath(); ctx.arc(end.x, end.y, 2.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.lineWidth = 1.4;
  };
  if (!facesViewer(dir)) crank();
  box(ctx, x, y, 0.7, 0.7, 44, "#e6e2da", C.rose, "#e2c7c5");
  if (facesViewer(dir)) crank();
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
  const { state, now, reducedMotion, build } = scene, level = ambience(state), layout = plan(state), camera = cameraFor(layout);
  const shop = shopById(state.shop);
  ctx.setTransform(pixelScale, 0, 0, pixelScale, 0, 0);
  ctx.imageSmoothingEnabled = false;
  const cacheKey = `${state.shop}:${state.wallpaper}:${state.floor}:${level}:${state.size}:${state.building}:${pixelScale}`;
  if (backdrop?.key !== cacheKey) backdrop = { canvas: paintBackdrop(state, pixelScale, camera), key: cacheKey };
  ctx.drawImage(backdrop.canvas, 0, 0, VIEW.width, VIEW.height);
  // Everything below is drawn in world space through the camera.
  const scale = pixelScale * camera.zoom;
  ctx.setTransform(scale, 0, 0, scale, pixelScale * camera.x, pixelScale * camera.y);
  for (const item of state.items) if (isRug(item.kind)) drawRug(ctx, item.kind, item, item.dir);

  if (build) {
    ctx.strokeStyle = "rgba(22,22,22,.28)"; ctx.setLineDash([2, 3]);
    for (const id of layout.dining) { const tile = fromKey(id); poly(ctx, tileQuad(tile.x, tile.y), "rgba(0,0,0,0)"); ctx.stroke(); }
    ctx.setLineDash([]);
    for (const tile of [layout.door, layout.pickup, layout.capsuleSpot, { x: 3, y: layout.breakDoor.y }]) poly(ctx, tileQuad(tile.x, tile.y, 0.08), "rgba(22,22,22,.12)");
    const selected = build.selected === CAPSULE_ID ? layout.capsule : state.items.find(item => item.id === build.selected);
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
  layout.stoves.forEach((tile, index) => add(tile.x + tile.y, 0, () => drawStove(ctx, tile, index, cooking, now, reducedMotion)));
  for (const tile of layout.counter) add(tile.x + tile.y, 0, () => drawCounter(ctx, tile, scene));
  const trim = buildingById(layout.building).trim;
  for (const wall of layout.walls) add(wall.x + wall.y, 0, () => drawWall(ctx, wall, wall.along, wall.low ? 34 : 70, trim));
  add(layout.d - 2.8, 0, () => drawSofa(ctx, 0, layout.d - 2.5, 1.8));
  const machineGhost = build?.capsule;
  add(layout.capsule.x + layout.capsule.y, 0, () => { ctx.globalAlpha = machineGhost ? 0.35 : 1; drawCapsuleMachine(ctx, layout.capsule, layout.capsuleDir, now, reducedMotion); ctx.globalAlpha = 1; });
  if (machineGhost) add(machineGhost.x + machineGhost.y + 0.02, 9, () => {
    const spot = { x: machineGhost.x + FACING[machineGhost.dir].x, y: machineGhost.y + FACING[machineGhost.dir].y };
    poly(ctx, tileQuad(spot.x, spot.y, 0.08), build!.valid ? "rgba(180,195,171,.45)" : "rgba(184,109,109,.35)", build!.valid ? INK : "#9a4e4e");
    if (!build!.valid) poly(ctx, tileQuad(machineGhost.x, machineGhost.y, 0.04), "rgba(184,109,109,.35)", "#9a4e4e");
    ctx.globalAlpha = 0.65; drawCapsuleMachine(ctx, machineGhost, machineGhost.dir, now, true); ctx.globalAlpha = 1;
  });
  for (let y = 0; y < layout.d; y++) if (y !== layout.door.y) add(layout.w - 1 + y + 0.6, 3, () => drawFrontWall(ctx, { x: layout.w - 1, y }, "right", trim));
  for (let x = 0; x < layout.w; x++) add(x + layout.d - 1 + 0.6, 3, () => drawFrontWall(ctx, { x, y: layout.d - 1 }, "left", trim));
  add(layout.w - 1 + layout.door.y + 0.7, 3, () => drawDoor(ctx, layout, shop.accent));
  for (const y of [layout.laneStart + 1, layout.door.y + (layout.door.y > layout.d / 2 ? -3 : 3), layout.laneEnd - 1]) add(layout.lane + 0.45 + y, 1, () => drawStreetLamp(ctx, { x: layout.lane + 0.45, y }));
  const tableNumbers = new Map(tables(state).map((item, index) => [item.id, index + 1]));
  const statueRows = (dir: Dir) => friendRows(scene.friend, DIR_FACING[dir], false, 0);
  const accents = [C.rose, C.sage, C.butter, C.lavender];
  for (const item of state.items) {
    if (isRug(item.kind)) continue;
    const faded = build?.selected === item.id && build.ghost ? 0.35 : 1;
    if (isTable(item.kind)) {
      const accent = accents[item.id % 4];
      for (const seat of seatsOf(item)) {
        // A chair facing away from the viewer has its back in front of the seated guest.
        if (facesViewer(seat.dir)) add(seat.x + seat.y, 0, () => { ctx.globalAlpha = faded; drawChair(ctx, seat, seat.dir, "both", accent); ctx.globalAlpha = 1; });
        else {
          add(seat.x + seat.y, 0, () => { ctx.globalAlpha = faded; drawChair(ctx, seat, seat.dir, "seat", accent); ctx.globalAlpha = 1; });
          add(seat.x + seat.y + 0.3, 0, () => { ctx.globalAlpha = faded; drawChair(ctx, seat, seat.dir, "back", accent); ctx.globalAlpha = 1; });
        }
      }
      add(item.x + item.y, 0, () => { ctx.globalAlpha = faded; drawTable(ctx, item, tableNumbers.get(item.id)!, accent, now, reducedMotion); ctx.globalAlpha = 1; });
    } else add(item.x + item.y, 0, () => { ctx.globalAlpha = faded; drawItem(ctx, item.kind, item, item.dir, now, reducedMotion, statueRows(item.dir)); ctx.globalAlpha = 1; });
  }
  if (build?.ghost) {
    const ghost = build.ghost;
    const tint = () => { if (!build.valid) poly(ctx, tileQuad(ghost.x, ghost.y, 0.04), "rgba(184,109,109,.35)", "#9a4e4e"); };
    if (isRug(ghost.kind)) add(-1, 9, () => { drawRug(ctx, ghost.kind, ghost, ghost.dir, build.valid ? 0.55 : 0.25); tint(); });
    else if (isTable(ghost.kind)) {
      for (const seat of seatsOf(ghost)) add(seat.x + seat.y + 0.02, 9, () => { ctx.globalAlpha = 0.65; drawChair(ctx, seat, seat.dir, "both", C.butter); ctx.globalAlpha = 1; });
      add(ghost.x + ghost.y + 0.02, 9, () => { tint(); ctx.globalAlpha = 0.65; drawTable(ctx, ghost, 0, C.butter); ctx.globalAlpha = 1; });
    } else add(ghost.x + ghost.y + 0.02, 9, () => { tint(); ctx.globalAlpha = 0.65; drawItem(ctx, ghost.kind, ghost, ghost.dir, now, true, statueRows(ghost.dir)); ctx.globalAlpha = 1; });
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
    const a = project(layout.kitchenSide === "back" ? layout.kitchenLength + 0.5 : 3, -0.5, 128), b = project(layout.w - 0.5, -0.5, 128);
    ctx.strokeStyle = INK; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo((a.x + b.x) / 2, (a.y + b.y) / 2 + 26, b.x, b.y); ctx.stroke();
    for (let i = 1; i < 8; i++) {
      const t = i / 8, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t + 52 * t * (1 - t) + 6;
      ctx.fillStyle = [C.rose, C.butter, C.sage, C.lavender][i % 4]; ctx.beginPath(); ctx.ellipse(x, y + 8, 6, 8, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  }
  if (level >= 5) {
    const middle = (layout.w + 3) / 2, point = project(middle, layout.d / 2, 250), sway = reducedMotion ? 0 : Math.sin(now / 1200) * 2;
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
const worldPoint = (state: CafeState, sx: number, sy: number) => toWorld(cameraFor(plan(state)), { x: sx, y: sy });
/** Dining-room tile under a viewport point, or null. */
export function tileAt(state: CafeState, sx: number, sy: number): Tile | null {
  const world = worldPoint(state, sx, sy), grid = unproject(world.x, world.y), tile = { x: Math.round(grid.x), y: Math.round(grid.y) };
  return plan(state).dining.has(key(tile)) ? tile : null;
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
  if (layout.kitchenArea.has(key(tile)) || (tile.x === layout.pickup.x && tile.y === layout.pickup.y)) return { kind: "counter" };
  if (!layout.dining.has(key(tile))) return null;
  return { kind: "tile", tile };
}
