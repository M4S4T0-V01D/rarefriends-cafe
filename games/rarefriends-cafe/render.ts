/** Canvas renderer: greyscale isometric café with faded accent colours, drawn in the 960 × 640 reference space. */
import type { GenerationSprites } from "@rarefriends/friendsdk/sprites";
import { dishById, type DishId } from "./data.ts";
import { dayProgress, manager, type CafeState, type Customer, type Facing, type Worker } from "./engine.ts";
import type { GuestArt } from "./guests.ts";
import { CAPSULE_MACHINE, CAPSULE_SPOT, COUNTER, DECOR_TILES, DOOR, KITCHEN, PICKUP, TABLES, TILE_H, TILE_W, project, unproject, type Tile } from "./layout.ts";

export const VIEW = { width: 960, height: 640 } as const;
export const INK = "#161616", PAPER = "#efede7";
const C = {
  floorA: "#dedbd3", floorB: "#cfccc4", line: "#bdb9b0", wallL: "#c3c0b8", wallR: "#d3d0c9", trim: "#9d9a93",
  dark: "#3b3a38", mid: "#6d6b67", light: "#f7f5f0", rose: "#d8b6b4", sage: "#b4c3ab", blue: "#afbccb",
  butter: "#e2d7ad", lavender: "#c6bed4", amber: "#e3c9a0",
};

export type Floater = { text: string; x: number; y: number; age: number; tone: "coin" | "vip" | "angry" | "info" };
export type Scene = {
  state: CafeState; now: number; reducedMotion: boolean; guests: readonly GuestArt[];
  regulars: ReadonlyMap<number, GenerationSprites>; friend: GenerationSprites; floaters: readonly Floater[];
  hover: Tile | null;
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
  if (spriteCache.size > 400) spriteCache.delete(spriteCache.keys().next().value!);
  spriteCache.set(id, canvas);
  return canvas;
}
function friendRows(sprites: GenerationSprites, facing: Facing, walking: boolean, frame: number): readonly string[] {
  const vertical = sprites.familyId === 6 && (facing === "up" || facing === "down");
  return sprites.clips[walking ? "walk" : "idle"][vertical ? "right" : facing][frame].rows;
}

// ---------- Isometric primitives ----------
function poly(ctx: CanvasRenderingContext2D, points: readonly { x: number; y: number }[], fill: string, stroke?: string) {
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

// ---------- Static layer: paper, floor and walls ----------
let backdrop: { canvas: HTMLCanvasElement; key: string } | null = null;
function wallPoint(x: number, y: number, height: number) { return project(x, y, height); }

function paintBackdrop(decor: number, scale: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(VIEW.width * scale); canvas.height = Math.round(VIEW.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  ctx.fillStyle = PAPER; ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  // Faint halftone dots on the paper.
  ctx.fillStyle = "rgba(22,22,22,.05)";
  for (let y = 4; y < VIEW.height; y += 12) for (let x = (y / 12) % 2 ? 10 : 4; x < VIEW.width; x += 12) ctx.fillRect(x, y, 1.5, 1.5);
  const H = 132, E = 10.5, S = -0.5;
  // Left (kitchen) wall and right (street) wall.
  poly(ctx, [wallPoint(S, S, 0), wallPoint(S, E, 0), wallPoint(S, E, H), wallPoint(S, S, H)], C.wallL, INK);
  poly(ctx, [wallPoint(S, S, 0), wallPoint(E, S, 0), wallPoint(E, S, H), wallPoint(S, S, H)], C.wallR, INK);
  // Wainscot bands.
  poly(ctx, [wallPoint(S, S, 0), wallPoint(S, E, 0), wallPoint(S, E, 38), wallPoint(S, S, 38)], "#b3b0a8", INK);
  poly(ctx, [wallPoint(S, S, 0), wallPoint(E, S, 0), wallPoint(E, S, 38), wallPoint(S, S, 38)], "#c4c1b9", INK);
  ctx.strokeStyle = "rgba(22,22,22,.18)";
  for (let t = 0; t <= 11; t += 0.5) {
    const a = wallPoint(S, S + t, 0), b = wallPoint(S, S + t, 38); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    const c = wallPoint(S + t, S, 0), d = wallPoint(S + t, S, 38); ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.stroke();
  }
  // Windows on the street wall, frosted pale blue.
  for (const start of [1.6, 4.6]) {
    const w = 2.2, lo = 50, hi = 112;
    poly(ctx, [wallPoint(start, S, lo), wallPoint(start + w, S, lo), wallPoint(start + w, S, hi), wallPoint(start, S, hi)], "#c9d2da", INK);
    const mid = start + w / 2; const m1 = wallPoint(mid, S, lo), m2 = wallPoint(mid, S, hi);
    ctx.strokeStyle = INK; ctx.beginPath(); ctx.moveTo(m1.x, m1.y); ctx.lineTo(m2.x, m2.y); ctx.stroke();
    const h1 = wallPoint(start, S, (lo + hi) / 2), h2 = wallPoint(start + w, S, (lo + hi) / 2); ctx.beginPath(); ctx.moveTo(h1.x, h1.y); ctx.lineTo(h2.x, h2.y); ctx.stroke();
    // A striped awning above each window.
    for (let i = 0; i < 4; i++) poly(ctx, [wallPoint(start + i * w / 4, S, hi + 4), wallPoint(start + (i + 1) * w / 4, S, hi + 4), wallPoint(start + (i + 1) * w / 4, S - 0.25, hi - 6), wallPoint(start + i * w / 4, S - 0.25, hi - 6)], i % 2 ? C.light : C.rose, INK);
  }
  // Door.
  poly(ctx, [wallPoint(DOOR.x - 0.5, S, 0), wallPoint(DOOR.x + 0.5, S, 0), wallPoint(DOOR.x + 0.5, S, 92), wallPoint(DOOR.x - 0.5, S, 92)], C.dark, INK);
  poly(ctx, [wallPoint(DOOR.x - 0.36, S, 50), wallPoint(DOOR.x + 0.36, S, 50), wallPoint(DOOR.x + 0.36, S, 84), wallPoint(DOOR.x - 0.36, S, 84)], "#8f9aa5", INK);
  const sign = wallPoint(DOOR.x, S, 106);
  ctx.fillStyle = C.light; ctx.strokeStyle = INK; ctx.fillRect(sign.x - 26, sign.y - 9, 52, 16); ctx.strokeRect(sign.x - 26, sign.y - 9, 52, 16);
  ctx.fillStyle = INK; ctx.font = "bold 10px ui-monospace, monospace"; ctx.textAlign = "center"; ctx.fillText("OPEN", sign.x, sign.y + 3);
  // Menu board on the kitchen wall.
  poly(ctx, [wallPoint(S, 1.2, 60), wallPoint(S, 4.8, 60), wallPoint(S, 4.8, 118), wallPoint(S, 1.2, 118)], "#2c2c2b", INK);
  ctx.save(); ctx.strokeStyle = "rgba(247,245,240,.55)"; ctx.lineWidth = 1.2;
  for (let row = 0; row < 4; row++) {
    const a = wallPoint(S, 1.6, 104 - row * 11), b = wallPoint(S, 3.6 + (row % 2) * 0.6, 104 - row * 11);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  ctx.restore();
  const title = wallPoint(S, 3, 112);
  ctx.save(); ctx.translate(title.x, title.y); ctx.transform(1, 0.5, 0, 1, 0, 0); ctx.fillStyle = C.light; ctx.font = "bold 9px ui-monospace, monospace"; ctx.textAlign = "center"; ctx.fillText("MENU", 0, 0); ctx.restore();
  // Shelves with jars over the kitchen, and framed art unlocked by ambience.
  for (const height of [124]) {
    poly(ctx, [wallPoint(S, 5.4, height - 4), wallPoint(S, 8.6, height - 4), wallPoint(S + 0.25, 8.6, height - 4), wallPoint(S + 0.25, 5.4, height - 4)], C.mid, INK);
    [C.rose, C.sage, C.butter, C.blue].forEach((color, index) => { const p = wallPoint(S + 0.12, 5.8 + index * 0.75, height - 4); ctx.fillStyle = color; ctx.fillRect(p.x - 5, p.y - 14, 10, 14); ctx.strokeStyle = INK; ctx.strokeRect(p.x - 5, p.y - 14, 10, 14); });
  }
  if (decor >= 1) framed(ctx, wallPoint(S, 6.4, 88), C.sage);
  if (decor >= 2) framed(ctx, wallPoint(S, 8.2, 84), C.rose);
  if (decor >= 4) framed(ctx, wallPoint(7.5, S, 94), C.lavender, true);
  // Checkered floor.
  for (let y = 0; y < 11; y++) for (let x = 0; x < 11; x++) {
    const points = [project(x - 0.5, y - 0.5), project(x + 0.5, y - 0.5), project(x + 0.5, y + 0.5), project(x - 0.5, y + 0.5)];
    poly(ctx, points, (x + y) % 2 ? C.floorB : C.floorA);
  }
  ctx.strokeStyle = C.line; ctx.lineWidth = 0.6;
  for (let t = -0.5; t <= 10.5; t += 1) {
    let a = project(t, -0.5), b = project(t, 10.5); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    a = project(-0.5, t); b = project(10.5, t); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  // Faded rose rug under the dining room.
  if (decor >= 2) {
    const rug = [project(3.3, 1.6), project(8.7, 1.6), project(8.7, 9.6), project(3.3, 9.6)];
    ctx.globalAlpha = 0.55; poly(ctx, rug, C.rose, INK); ctx.globalAlpha = 1;
    const inner = [project(3.7, 2), project(8.3, 2), project(8.3, 9.2), project(3.7, 9.2)];
    ctx.setLineDash([4, 4]); poly(ctx, inner, "rgba(0,0,0,0)", "rgba(22,22,22,.35)"); ctx.setLineDash([]);
  }
  // Floor outline.
  poly(ctx, [project(-0.5, -0.5), project(10.5, -0.5), project(10.5, 10.5), project(-0.5, 10.5)], "rgba(0,0,0,0)", INK);
  return canvas;
}
function framed(ctx: CanvasRenderingContext2D, at: { x: number; y: number }, color: string, right = false) {
  ctx.save(); ctx.translate(at.x, at.y); ctx.transform(1, right ? -0.5 : 0.5, 0, 1, 0, 0);
  ctx.fillStyle = C.light; ctx.fillRect(-15, -22, 30, 26); ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.strokeRect(-15, -22, 30, 26);
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, -9, 7, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}

// ---------- Dish icons ----------
export function drawDish(ctx: CanvasRenderingContext2D, id: DishId, x: number, y: number, s = 1) {
  const dish = dishById(id);
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.lineWidth = 1.2; ctx.strokeStyle = INK;
  const plate = () => { ctx.fillStyle = C.light; ctx.beginPath(); ctx.ellipse(0, 5, 10, 3.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); };
  const cup = (fill: string, top: string, tall = 0) => {
    ctx.fillStyle = fill; ctx.beginPath(); ctx.moveTo(-6, -5 - tall); ctx.lineTo(6, -5 - tall); ctx.lineTo(4.5, 4); ctx.lineTo(-4.5, 4); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(7, -1, 2.6, -Math.PI / 2, Math.PI / 2); ctx.stroke();
    ctx.fillStyle = top; ctx.beginPath(); ctx.ellipse(0, -5 - tall, 6, 1.8, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  };
  const heart = (hx: number, hy: number, color: string, size = 2.2) => {
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(hx, hy + size); ctx.arc(hx - size / 2, hy, size / 2, Math.PI * 0.8, 0); ctx.arc(hx + size / 2, hy, size / 2, Math.PI, Math.PI * 0.2); ctx.closePath(); ctx.fill();
  };
  switch (id) {
    case "espresso": plate(); cup(C.light, dish.color); break;
    case "latte": plate(); cup(C.light, dish.color, 2); heart(0, -7.4, C.light, 2.4); break;
    case "matcha": plate(); cup(C.light, dish.color, 2); break;
    case "silver": plate(); cup("#dfe3e8", dish.color, 3); ctx.fillStyle = "#fff"; ctx.fillRect(7, -12, 2, 6); ctx.fillRect(5, -10, 6, 2); break;
    case "mochi": plate(); for (const dx of [-4, 4]) { ctx.fillStyle = dish.color; ctx.beginPath(); ctx.ellipse(dx, 0, 4.5, 4, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); } ctx.fillStyle = C.sage; ctx.fillRect(-1, -6, 2, 3); break;
    case "pancakes": plate(); for (let i = 0; i < 3; i++) { ctx.fillStyle = dish.color; ctx.beginPath(); ctx.ellipse(0, 2 - i * 3.2, 7.5, 2.6, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); } ctx.fillStyle = C.butter; ctx.fillRect(-2, -9, 4, 2.5); break;
    case "omurice": plate(); ctx.fillStyle = dish.color; ctx.beginPath(); ctx.ellipse(0, 0, 8.5, 4.6, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); heart(0, -1, dish.accent, 3.6); break;
    case "parfait": case "moonlight": {
      ctx.fillStyle = C.light; ctx.beginPath(); ctx.moveTo(-5, -10); ctx.lineTo(5, -10); ctx.lineTo(2, 1); ctx.lineTo(-2, 1); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = dish.color; ctx.fillRect(-4, -7, 8, 3); ctx.fillStyle = dish.accent; ctx.fillRect(-3.5, -4, 7, 2.5);
      ctx.beginPath(); ctx.moveTo(0, 1); ctx.lineTo(0, 5); ctx.stroke(); ctx.beginPath(); ctx.ellipse(0, 5, 4, 1.4, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (id === "moonlight") { ctx.fillStyle = C.butter; ctx.beginPath(); ctx.arc(0, -13, 3.5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = dish.color; ctx.beginPath(); ctx.arc(1.6, -14, 3, 0, Math.PI * 2); ctx.fill(); }
      else { ctx.fillStyle = C.rose; ctx.beginPath(); ctx.arc(0, -12, 2.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
      break;
    }
  }
  ctx.restore();
}

// ---------- Furniture ----------
function drawTable(ctx: CanvasRenderingContext2D, tile: Tile, index: number) {
  shadow(ctx, tile.x, tile.y, 20);
  const base = project(tile.x, tile.y);
  ctx.fillStyle = C.dark; ctx.fillRect(base.x - 2, base.y - 22, 4, 22);
  ctx.beginPath(); ctx.ellipse(base.x, base.y - 1, 9, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = C.light; ctx.strokeStyle = INK; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.ellipse(base.x, base.y - 25, 24, 10, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#e4e1da"; ctx.beginPath(); ctx.ellipse(base.x, base.y - 22, 24, 10, 0, 0, Math.PI); ctx.fill(); ctx.stroke();
  ctx.fillStyle = C.light; ctx.beginPath(); ctx.ellipse(base.x, base.y - 25, 24, 10, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = C.mid; ctx.font = "bold 9px ui-monospace, monospace"; ctx.textAlign = "center"; ctx.fillText(String(index + 1), base.x + 14, base.y - 23);
  // A tiny bud vase.
  ctx.fillStyle = [C.rose, C.sage, C.butter, C.lavender][index % 4]; ctx.beginPath(); ctx.arc(base.x - 10, base.y - 31, 2.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = INK; ctx.beginPath(); ctx.moveTo(base.x - 10, base.y - 28.5); ctx.lineTo(base.x - 10, base.y - 25); ctx.stroke();
}
function drawChair(ctx: CanvasRenderingContext2D, tile: Tile) {
  box(ctx, tile.x, tile.y, 0.42, 0.42, 14, "#8b8883", "#5f5d59", "#76736f");
  box(ctx, tile.x, tile.y - 0.2, 0.42, 0.06, 20, "#8b8883", "#5f5d59", "#76736f", 14);
}
function drawCounter(ctx: CanvasRenderingContext2D, tile: Tile, scene: Scene) {
  box(ctx, tile.x, tile.y, 1, 1, 36, "#6a6864", C.dark, "#4d4c49");
  const top = project(tile.x, tile.y, 36);
  const { state, now, reducedMotion } = scene;
  if (tile.y === 1) { // register
    box(ctx, tile.x, tile.y, 0.45, 0.4, 14, "#cfccc5", "#9e9b95", "#b8b5ae", 36);
    ctx.fillStyle = C.sage; ctx.fillRect(top.x - 5, top.y - 22, 10, 5);
  } else if (tile.y === 2) { // espresso machine, steaming while the kitchen works
    box(ctx, tile.x, tile.y, 0.6, 0.55, 30, "#d9d6cf", "#a9a6a0", "#c1beb7", 36);
    ctx.fillStyle = INK; ctx.fillRect(top.x - 3, top.y - 14, 6, 6);
    ctx.fillStyle = C.rose; ctx.beginPath(); ctx.arc(top.x + 8, top.y - 24, 2.5, 0, Math.PI * 2); ctx.fill();
    if (state.orders.some(order => order.state === "cooking")) {
      ctx.strokeStyle = "rgba(90,90,90,.45)"; ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        const t = reducedMotion ? 0.5 : (now / 900 + i / 3) % 1;
        ctx.beginPath(); ctx.moveTo(top.x - 6 + i * 6, top.y - 34 - t * 16);
        ctx.quadraticCurveTo(top.x - 2 + i * 6, top.y - 40 - t * 16, top.x - 6 + i * 6, top.y - 46 - t * 16); ctx.stroke();
      }
    }
  } else if (tile.y === 3) { // pass: ready dishes wait here
    const ready = state.orders.filter(order => order.state === "ready");
    ctx.fillStyle = C.light; ctx.beginPath(); ctx.ellipse(top.x, top.y, 20, 8, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = INK; ctx.stroke();
    ready.slice(0, 4).forEach((order, index) => drawDish(ctx, order.dish, top.x - 12 + (index % 2) * 18, top.y - 4 - Math.floor(index / 2) * 12, 0.85));
    if (ready.length) {
      const pulse = reducedMotion ? 1 : 1 + Math.sin(now / 180) * 0.12;
      ctx.fillStyle = C.butter; ctx.strokeStyle = INK; ctx.beginPath(); ctx.arc(top.x + 18, top.y - 26, 9 * pulse, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = INK; ctx.font = "bold 11px ui-monospace, monospace"; ctx.textAlign = "center"; ctx.fillText(String(ready.length), top.x + 18, top.y - 22);
    }
  } else if (tile.y === 4) { // glass cake case
    box(ctx, tile.x, tile.y, 0.7, 0.6, 22, "rgba(220,228,234,.55)", "rgba(190,200,208,.55)", "rgba(205,214,221,.55)", 36);
    ctx.fillStyle = C.rose; ctx.fillRect(top.x - 8, top.y - 12, 7, 6); ctx.fillStyle = C.butter; ctx.fillRect(top.x + 2, top.y - 10, 7, 6);
  } else { // cups and a little plant
    ctx.fillStyle = C.sage; ctx.beginPath(); ctx.arc(top.x, top.y - 14, 8, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = INK; ctx.stroke();
    box(ctx, tile.x, tile.y, 0.3, 0.3, 10, "#b6a594", "#8c7d6e", "#a19080", 36);
  }
}
function drawKitchen(ctx: CanvasRenderingContext2D, tile: Tile) {
  if (tile.y === 0) box(ctx, tile.x, tile.y, 0.9, 0.9, 88, "#e6e3dc", "#b9b6af", "#cfccc5");
  else if (tile.y % 2) box(ctx, tile.x, tile.y, 0.9, 1, 34, "#8f8c86", "#6b6964", "#7d7a75");
  else {
    box(ctx, tile.x, tile.y, 0.9, 1, 34, "#bdbab3", "#8e8b85", "#a5a29c");
    const top = project(tile.x, tile.y, 34); ctx.strokeStyle = INK;
    for (const dy of [-4, 4]) { ctx.beginPath(); ctx.ellipse(top.x + dy * 1.6, top.y + dy * 0.2, 6, 2.5, 0, 0, Math.PI * 2); ctx.stroke(); }
  }
}
function drawCapsuleMachine(ctx: CanvasRenderingContext2D, now: number, reducedMotion: boolean) {
  const { x, y } = CAPSULE_MACHINE;
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
function drawDecor(ctx: CanvasRenderingContext2D, kind: "plant" | "record" | "lamp", tile: Tile, now: number, reducedMotion: boolean) {
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
  } else {
    box(ctx, tile.x, tile.y, 0.6, 0.6, 26, "#8a6f5c", "#5d4b3f", "#735e4f");
    const top = project(tile.x, tile.y, 26), spin = reducedMotion ? 0 : now / 500;
    ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(top.x, top.y, 14, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.rose; ctx.beginPath(); ctx.ellipse(top.x, top.y, 4, 1.8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(247,245,240,.5)"; ctx.beginPath(); ctx.ellipse(top.x, top.y, 9, 3.8, 0, spin, spin + 1.4); ctx.stroke();
    if (!reducedMotion) { const t = (now / 1400) % 1; ctx.globalAlpha = 1 - t; ctx.fillStyle = INK; ctx.font = "12px ui-monospace, monospace"; ctx.fillText("♪", top.x + 12 + t * 8, top.y - 12 - t * 26); ctx.globalAlpha = 1; }
  }
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
  const art = scene.guests[customer.guest % scene.guests.length];
  return art.frames[walking ? frame % 2 : 0];
}
function bubble(ctx: CanvasRenderingContext2D, x: number, y: number, fraction: number | null, highlight: boolean) {
  ctx.fillStyle = highlight ? C.butter : C.light; ctx.strokeStyle = INK; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.roundRect(x - 17, y - 34, 34, 28, 8); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - 4, y - 6.5); ctx.lineTo(x, y); ctx.lineTo(x + 4, y - 6.5); ctx.fillStyle = highlight ? C.butter : C.light; ctx.fill(); ctx.stroke();
  if (fraction !== null) {
    ctx.lineWidth = 3; ctx.strokeStyle = "#d9d6cf"; ctx.beginPath(); ctx.moveTo(x - 13, y - 38); ctx.lineTo(x + 13, y - 38); ctx.stroke();
    ctx.strokeStyle = fraction > 0.5 ? C.mid : fraction > 0.25 ? "#b89b73" : "#b86d6d";
    ctx.beginPath(); ctx.moveTo(x - 13, y - 38); ctx.lineTo(x - 13 + 26 * Math.max(0, fraction), y - 38); ctx.stroke(); ctx.lineWidth = 1;
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
function drawWorker(ctx: CanvasRenderingContext2D, scene: Scene, worker: Worker) {
  const { walker: body } = worker, { now, reducedMotion } = scene;
  const frame = reducedMotion ? 0 : Math.floor(now / 110) % 8;
  shadow(ctx, body.x, body.y, worker.role === "manager" ? 20 : 13);
  let rows: readonly string[];
  if (worker.role === "manager") rows = friendRows(scene.friend, body.facing, body.moving, body.moving ? frame : 0);
  else rows = scene.guests[(worker.id * 5 + 3) % scene.guests.length].frames[body.moving ? frame % 2 : 0];
  const hover = worker.role === "manager" && scene.friend.familyId === 5 && !reducedMotion ? Math.round(2 + Math.sin(now / 300) * 2) : 0;
  const boss = worker.role === "manager";
  drawSprite(ctx, rows, body.x, body.y, hover, boss ? INK : "#333", boss ? 4 : 3);
  const head = project(body.x, body.y, (boss ? 80 : 62) + hover);
  // Apron tag: manager wears faded rose, helpers wear sage.
  ctx.fillStyle = worker.role === "manager" ? C.rose : C.sage; ctx.strokeStyle = INK; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(head.x, head.y - 10); ctx.lineTo(head.x + 6, head.y - 4); ctx.lineTo(head.x, head.y + 2); ctx.lineTo(head.x - 6, head.y - 4); ctx.closePath(); ctx.fill(); ctx.stroke();
  worker.carrying.forEach((id, index) => {
    const order = scene.state.orders.find(item => item.id === id);
    if (order) drawDish(ctx, order.dish, head.x - 12 + index * 14 + (worker.carrying.length === 1 ? 12 : 0), head.y - 16, 0.8);
  });
  if (worker.action > 0) {
    ctx.fillStyle = INK; ctx.font = "bold 12px ui-monospace, monospace"; ctx.textAlign = "center"; ctx.fillText("✎", head.x + 16, head.y - 6);
  }
}
function drawChef(ctx: CanvasRenderingContext2D, scene: Scene, index: number) {
  const tile = KITCHEN[2 + index * 2], frame = scene.reducedMotion ? 0 : Math.floor(scene.now / 400 + index) % 2;
  drawSprite(ctx, scene.guests[(index * 7 + 4) % scene.guests.length].frames[frame], tile.x + 0.45, tile.y, 34, "#333");
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
  const { state, now, reducedMotion } = scene;
  ctx.setTransform(pixelScale, 0, 0, pixelScale, 0, 0);
  ctx.imageSmoothingEnabled = false;
  const cacheKey = `${state.decor}:${pixelScale}`;
  if (backdrop?.key !== cacheKey) backdrop = { canvas: paintBackdrop(state.decor, pixelScale), key: cacheKey };
  ctx.drawImage(backdrop.canvas, 0, 0, VIEW.width, VIEW.height);

  if (scene.hover) {
    const { x, y } = scene.hover;
    poly(ctx, [project(x - 0.5, y - 0.5), project(x + 0.5, y - 0.5), project(x + 0.5, y + 0.5), project(x - 0.5, y + 0.5)], "rgba(22,22,22,.08)", "rgba(22,22,22,.4)");
  }
  const boss = manager(state), target = boss.walker.path.at(-1);
  if (target) {
    const point = project(target.x, target.y); ctx.strokeStyle = C.mid; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.ellipse(point.x, point.y, 12, 5, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  }

  type Layer = { depth: number; order: number; draw: () => void };
  const layers: Layer[] = [];
  const add = (depth: number, order: number, draw: () => void) => layers.push({ depth, order, draw });
  for (const tile of KITCHEN) add(tile.x + tile.y, 0, () => drawKitchen(ctx, tile));
  for (let index = 0; index < state.chefs; index++) add(KITCHEN[2 + index * 2].x + KITCHEN[2 + index * 2].y + 0.4, 1, () => drawChef(ctx, scene, index));
  for (const tile of COUNTER) add(tile.x + tile.y, 0, () => drawCounter(ctx, tile, scene));
  add(CAPSULE_MACHINE.x + CAPSULE_MACHINE.y, 0, () => drawCapsuleMachine(ctx, now, reducedMotion));
  for (const item of DECOR_TILES) if (item.level <= state.decor) add(item.tile.x + item.tile.y, 0, () => drawDecor(ctx, item.kind, item.tile, now, reducedMotion));
  for (let index = 0; index < state.tables; index++) {
    const { table, seat } = TABLES[index];
    add(seat.x + seat.y, 0, () => drawChair(ctx, seat));
    add(table.x + table.y, 0, () => drawTable(ctx, table, index));
  }
  for (const customer of state.customers) add(customer.walker.x + customer.walker.y, 1, () => drawCustomer(ctx, scene, customer));
  for (const worker of state.workers) add(worker.walker.x + worker.walker.y + 0.01, 2, () => drawWorker(ctx, scene, worker));
  layers.sort((a, b) => a.depth - b.depth || a.order - b.order).forEach(layer => layer.draw());

  // Numbered task markers for the manager's list.
  boss.queue.forEach((job, index) => {
    let point: { x: number; y: number } | null = null;
    if (job.kind === "pickup") point = project(PICKUP.x - 0.6, PICKUP.y, 70);
    else if (job.kind === "take" || job.kind === "serve") {
      const customer = state.customers.find(item => item.id === job.customer);
      if (customer) point = project(customer.walker.x, customer.walker.y, 112);
    }
    if (!point) return;
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(point.x - 20, point.y, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.light; ctx.font = "bold 10px ui-monospace, monospace"; ctx.textAlign = "center"; ctx.fillText(String(index + 1), point.x - 20, point.y + 3.5);
  });

  // Ceiling ornaments from ambience upgrades.
  if (state.decor >= 3) {
    const a = project(0.5, -0.5, 128), b = project(10, -0.5, 128);
    ctx.strokeStyle = INK; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo((a.x + b.x) / 2, (a.y + b.y) / 2 + 26, b.x, b.y); ctx.stroke();
    for (let i = 1; i < 8; i++) {
      const t = i / 8, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t + 26 * 2 * t * (1 - t) * 1.0 + 6;
      ctx.fillStyle = [C.rose, C.butter, C.sage, C.lavender][i % 4]; ctx.beginPath(); ctx.ellipse(x, y + 8, 6, 8, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  }
  if (state.decor >= 5) {
    const point = project(5, 5, 250), sway = reducedMotion ? 0 : Math.sin(now / 1200) * 2;
    ctx.strokeStyle = INK; ctx.beginPath(); ctx.moveTo(point.x, 0); ctx.lineTo(point.x + sway, point.y); ctx.stroke();
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

  // Time-of-day wash: cool morning, neutral noon, faded amber-lavender evening.
  const progress = state.phase === "open" ? dayProgress(state) : 1;
  const wash = progress < 0.25 ? `rgba(175,188,203,${0.1 * (1 - progress * 4)})` : progress > 0.65 ? `rgba(198,170,160,${Math.min(0.16, (progress - 0.65) * 0.45)})` : null;
  if (wash) { ctx.fillStyle = wash; ctx.fillRect(0, 0, VIEW.width, VIEW.height); }
  // Film grain and a soft vignette finish the faded-photo look.
  const noise = grainCanvas(), shift = reducedMotion ? 0 : Math.floor(now / 90) % 4 * 37;
  ctx.save(); ctx.translate(-shift, -shift); ctx.fillStyle = ctx.createPattern(noise, "repeat")!; ctx.fillRect(0, 0, VIEW.width + 192, VIEW.height + 192); ctx.restore();
  const vignette = ctx.createRadialGradient(480, 320, 260, 480, 320, 620);
  vignette.addColorStop(0, "rgba(22,22,22,0)"); vignette.addColorStop(1, "rgba(22,22,22,.28)");
  ctx.fillStyle = vignette; ctx.fillRect(0, 0, VIEW.width, VIEW.height);
}

// ---------- Hit testing ----------
export type Hit = { kind: "customer"; id: number } | { kind: "counter" } | { kind: "capsule" } | { kind: "tile"; tile: Tile } | null;
export function hitTest(state: CafeState, sx: number, sy: number): Hit {
  const front = [...state.customers].sort((a, b) => (b.walker.x + b.walker.y) - (a.walker.x + a.walker.y));
  for (const customer of front) {
    const point = project(customer.walker.x, customer.walker.y);
    const bubbleTop = customer.state === "waiting" || customer.state === "ordered" ? 112 : 64;
    if (Math.abs(sx - point.x) <= 26 && sy <= point.y + 8 && sy >= point.y - bubbleTop) return { kind: "customer", id: customer.id };
  }
  const grid = unproject(sx, sy), tile = { x: Math.round(grid.x), y: Math.round(grid.y) };
  const machine = project(CAPSULE_MACHINE.x, CAPSULE_MACHINE.y);
  if ((Math.abs(sx - machine.x) < 30 && sy < machine.y + 12 && sy > machine.y - 90) || (tile.x === CAPSULE_SPOT.x && tile.y === CAPSULE_SPOT.y)) return { kind: "capsule" };
  const tableIndex = TABLES.slice(0, state.tables).findIndex(({ table }) => table.x === tile.x && table.y === tile.y);
  if (tableIndex >= 0) {
    const customer = state.customers.find(item => item.table === tableIndex);
    return customer ? { kind: "customer", id: customer.id } : null;
  }
  if ((tile.x === 1 && tile.y >= 1 && tile.y <= 5) || (tile.x === PICKUP.x && tile.y === PICKUP.y) || (tile.x === 0 && tile.y <= 6)) return { kind: "counter" };
  if (tile.x < 0 || tile.y < 0 || tile.x > 10 || tile.y > 10) return null;
  return { kind: "tile", tile };
}
export { TILE_W, TILE_H };
