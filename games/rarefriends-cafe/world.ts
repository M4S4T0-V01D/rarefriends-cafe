/**
 * The world around the shop: ground and props beyond the walls, the sidewalks and the road, dressed by the chosen scenery.
 * Props behind the back walls are painted into the backdrop (the walls hide their feet); the rest join the depth-sorted scene.
 */
import type { SceneryId } from "./data.ts";
import { project, turnView, type Plan } from "./layout.ts";
import { box, line, poly, shadow } from "./render.ts";

type Point = { x: number; y: number };
export type PropKind = "tree" | "apple" | "pine" | "snowpine" | "palm" | "blossom" | "bush" | "flowers" | "fence" | "bench" | "lamp" | "rock"
  | "mushroom" | "log" | "snowman" | "umbrella" | "stall" | "lantern" | "bikes" | "cottage" | "duck" | "shells" | "stonelamp";
export type Prop = { x: number; y: number; kind: PropKind; seed: number };

const GROUND: Record<SceneryId, readonly [string, string]> = {
  lot: ["#dcd9d2", "#d2cfc8"], garden: ["#c9d4bd", "#bfcbb3"], park: ["#c4d1b8", "#b8c7ac"], forest: ["#a9b89c", "#9fae92"],
  beach: ["#ece0c4", "#e3d5b6"], snow: ["#f1f1ee", "#e6e8ea"], blossom: ["#cfd8c2", "#c5cfb8"], market: ["#6d6b67", "#63615d"],
};
/** Which props each scenery scatters, with weights. */
const PROPS: Record<SceneryId, readonly (readonly [PropKind, number])[]> = {
  lot: [["bush", 4], ["rock", 2], ["bikes", 1], ["lamp", 1]],
  garden: [["apple", 4], ["flowers", 5], ["bush", 3], ["fence", 3], ["bench", 1]],
  park: [["tree", 5], ["bench", 2], ["bush", 3], ["lamp", 2], ["flowers", 2], ["duck", 1]],
  forest: [["pine", 7], ["mushroom", 3], ["log", 2], ["rock", 2], ["bush", 2]],
  beach: [["palm", 5], ["umbrella", 3], ["shells", 3], ["rock", 1]],
  snow: [["snowpine", 6], ["snowman", 2], ["cottage", 2], ["lamp", 2]],
  blossom: [["blossom", 6], ["stonelamp", 2], ["bush", 2], ["flowers", 2]],
  market: [["stall", 4], ["lantern", 4], ["bench", 1], ["bush", 1]],
};
const hash = (x: number, y: number, salt = 0) => {
  let value = (x * 374761393 + y * 668265263 + salt * 2147483647) | 0;
  value = (value ^ (value >>> 13)) * 1274126177;
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
};

/** The world's extent around the shop, in tiles. */
export const worldBounds = (layout: Plan) => ({ x0: layout.sideStart - 1, x1: layout.farLane + 9, y0: layout.laneStart - 1, y1: layout.laneEnd + 1 });
/** Tiles taken by the building, the sidewalks and the road (plus a margin), where no prop may stand. */
function reserved(layout: Plan, x: number, y: number) {
  if (x >= -1 && x <= layout.w && y >= -1 && y <= layout.d) return true;
  if (x >= layout.w - 1 && x <= layout.farLane + 0.5 && y >= layout.laneStart - 1 && y <= layout.laneEnd + 1) return true;
  if (y >= layout.d - 1 && y <= layout.side + 1 && x >= layout.sideStart - 1 && x <= layout.lane + 3) return true;
  return layout.neighbours.some(n => x >= n.x0 - 1 && x <= n.x1 + 1 && y >= n.y0 - 1 && y <= n.y1 + 1);
}
const cache = new Map<string, Prop[]>();
export function outsideProps(layout: Plan, scenery: SceneryId): Prop[] {
  const id = `${scenery}:${layout.w}:${layout.d}`;
  let props = cache.get(id);
  if (props) return props;
  props = [];
  const bounds = worldBounds(layout), weights = PROPS[scenery], total = weights.reduce((sum, [, weight]) => sum + weight, 0);
  for (let y = bounds.y0; y <= bounds.y1; y++) for (let x = bounds.x0; x <= bounds.x1; x++) {
    if (reserved(layout, x, y) || (scenery === "beach" && x > layout.farLane + 6)) continue;
    const near = Math.min(Math.abs(x - layout.w / 2), Math.abs(y - layout.d / 2)) < 8;
    if (hash(x, y, 1) > (near ? 0.2 : 0.13)) continue;
    let roll = hash(x, y, 2) * total, kind = weights[0][0];
    for (const [candidate, weight] of weights) { roll -= weight; if (roll < 0) { kind = candidate; break; } }
    props.push({ x: x + (hash(x, y, 3) - 0.5) * 0.4, y: y + (hash(x, y, 4) - 0.5) * 0.4, kind, seed: hash(x, y, 5) });
  }
  cache.set(id, props);
  return props;
}
/** Props hidden behind the back walls go into the backdrop. */
export function behindWalls(prop: Prop, layout: Plan) {
  const a = turnView(-0.5, -0.5), b = turnView(layout.w - 0.5, layout.d - 0.5), p = turnView(prop.x, prop.y);
  return p.x < Math.min(a.x, b.x) || p.y < Math.min(a.y, b.y);
}

/** The ground: the scenery's texture over the whole world, with the sea along the far side at the seaside. */
export function paintGround(ctx: CanvasRenderingContext2D, layout: Plan, scenery: SceneryId) {
  const bounds = worldBounds(layout), [base, alt] = GROUND[scenery];
  poly(ctx, [project(bounds.x0, bounds.y0), project(bounds.x1, bounds.y0), project(bounds.x1, bounds.y1), project(bounds.x0, bounds.y1)], base);
  for (let y = bounds.y0; y < bounds.y1; y++) for (let x = bounds.x0; x < bounds.x1; x++) {
    const h = hash(x, y, 9);
    if (h < 0.35) poly(ctx, [project(x, y), project(x + 1, y), project(x + 1, y + 1), project(x, y + 1)], alt);
    if (scenery === "snow" && h > 0.9) { const p = project(x + 0.5, y + 0.5); ctx.fillStyle = "#fff"; ctx.fillRect(p.x, p.y, 1.5, 1.5); }
    if ((scenery === "garden" || scenery === "park" || scenery === "blossom") && h > 0.86) {
      const p = project(x + h, y + 0.3); ctx.fillStyle = scenery === "blossom" ? "rgba(216,182,180,.9)" : "rgba(226,215,173,.9)"; ctx.fillRect(p.x, p.y, 2, 1.5);
    }
    if (scenery === "market" && h > 0.7) { ctx.strokeStyle = "rgba(0,0,0,.18)"; line(ctx, project(x, y), project(x + 1, y)); }
  }
  if (scenery === "beach") {
    const sea = layout.farLane + 7;
    poly(ctx, [project(sea, bounds.y0), project(bounds.x1, bounds.y0), project(bounds.x1, bounds.y1), project(sea, bounds.y1)], "#afc3cf");
    ctx.strokeStyle = "rgba(247,245,240,.8)"; ctx.lineWidth = 1.5;
    for (let t = 0; t < 4; t++) for (let y = bounds.y0; y < bounds.y1; y += 2) {
      const a = project(sea + 0.4 + t * 1.3, y + (t % 2) * 0.8), b = project(sea + 0.4 + t * 1.3, y + 0.8 + (t % 2) * 0.8);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo((a.x + b.x) / 2 + 3, (a.y + b.y) / 2 - 3, b.x, b.y); ctx.stroke();
    }
    ctx.lineWidth = 1;
    poly(ctx, [project(sea - 0.3, bounds.y0), project(sea, bounds.y0), project(sea, bounds.y1), project(sea - 0.3, bounds.y1)], "#f7f5f0");
  }
  if (scenery === "park") pond(ctx, -4, layout.side + 9, 1.6);
}
function pond(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  const c = project(x, y);
  ctx.fillStyle = "#b9c4b0"; ctx.beginPath(); ctx.ellipse(c.x, c.y, r * 50, r * 25, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#afbccb"; ctx.strokeStyle = "#161616"; ctx.beginPath(); ctx.ellipse(c.x, c.y, r * 44, r * 22, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = "rgba(247,245,240,.7)"; ctx.beginPath(); ctx.ellipse(c.x - 12, c.y - 4, 14, 5, 0, Math.PI, Math.PI * 1.6); ctx.stroke();
}

const INK = "#161616";
function blob(ctx: CanvasRenderingContext2D, at: Point, rx: number, ry: number, fill: string) {
  ctx.fillStyle = fill; ctx.strokeStyle = INK; ctx.beginPath(); ctx.ellipse(at.x, at.y, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
}
function trunk(ctx: CanvasRenderingContext2D, at: Point, height: number, color = "#8f7563") {
  ctx.fillStyle = color; ctx.strokeStyle = INK; ctx.fillRect(at.x - 2.5, at.y - height, 5, height); ctx.strokeRect(at.x - 2.5, at.y - height, 5, height);
}
function triangleTree(ctx: CanvasRenderingContext2D, at: Point, fill: string, snow: boolean, size: number) {
  trunk(ctx, at, 10);
  for (let tier = 0; tier < 3; tier++) {
    const w = (16 - tier * 4) * size, y = at.y - 8 - tier * 13 * size;
    ctx.fillStyle = fill; ctx.strokeStyle = INK; ctx.beginPath(); ctx.moveTo(at.x - w, y); ctx.lineTo(at.x, y - 20 * size); ctx.lineTo(at.x + w, y); ctx.closePath(); ctx.fill(); ctx.stroke();
    if (snow) { ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.moveTo(at.x - w * 0.45, y - 11 * size); ctx.lineTo(at.x, y - 20 * size); ctx.lineTo(at.x + w * 0.45, y - 11 * size); ctx.closePath(); ctx.fill(); }
  }
}

/** One outside prop, drawn cute and chunky like the rest of the shop. */
export function drawProp(ctx: CanvasRenderingContext2D, prop: Prop, now: number, reducedMotion: boolean) {
  const at = project(prop.x, prop.y), size = 0.85 + prop.seed * 0.35;
  ctx.lineWidth = 1.2;
  if (prop.kind !== "fence" && prop.kind !== "flowers" && prop.kind !== "shells") shadow(ctx, prop.x, prop.y, prop.kind === "stall" || prop.kind === "cottage" ? 28 : 14);
  switch (prop.kind) {
    case "tree": case "apple": {
      trunk(ctx, at, 22 * size);
      blob(ctx, { x: at.x, y: at.y - 36 * size }, 20 * size, 17 * size, "#a9bd9b");
      blob(ctx, { x: at.x - 8 * size, y: at.y - 44 * size }, 11 * size, 9 * size, "#b4c3ab");
      if (prop.kind === "apple") for (const [dx, dy] of [[-8, -30], [7, -38], [2, -26], [10, -30]]) blob(ctx, { x: at.x + dx * size, y: at.y + dy * size }, 2.6, 2.6, "#c98f8f");
      break;
    }
    case "blossom": {
      trunk(ctx, at, 20 * size, "#6d5a4c");
      for (const [dx, dy, r] of [[0, -38, 17], [-12, -32, 11], [12, -32, 11], [-5, -48, 10], [7, -46, 9]]) blob(ctx, { x: at.x + dx * size, y: at.y + dy * size }, r * size, r * 0.85 * size, prop.seed > 0.5 ? "#e6c3c5" : "#ddb3b6");
      ctx.fillStyle = "#f3dfe0"; for (let i = 0; i < 5; i++) ctx.fillRect(at.x - 14 + i * 7, at.y + 2 + (i % 2) * 3, 2, 1.5);
      break;
    }
    case "pine": triangleTree(ctx, at, prop.seed > 0.5 ? "#7f9374" : "#8ea182", false, size); break;
    case "snowpine": triangleTree(ctx, at, "#8a9a8c", true, size); break;
    case "palm": {
      ctx.strokeStyle = INK; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(at.x, at.y); ctx.quadraticCurveTo(at.x + 8, at.y - 25, at.x + 4, at.y - 50 * size); ctx.stroke();
      ctx.strokeStyle = "#b89b73"; ctx.lineWidth = 3; ctx.stroke(); ctx.lineWidth = 1.2;
      const top = { x: at.x + 4, y: at.y - 50 * size };
      for (const angle of [-2.7, -2.1, -1.2, -0.5, 0.2]) {
        ctx.fillStyle = "#9fb393"; ctx.strokeStyle = INK; ctx.beginPath(); ctx.moveTo(top.x, top.y);
        ctx.quadraticCurveTo(top.x + Math.cos(angle) * 16, top.y + Math.sin(angle) * 16 - 6, top.x + Math.cos(angle) * 26, top.y + Math.sin(angle) * 20 + 8);
        ctx.quadraticCurveTo(top.x + Math.cos(angle) * 12, top.y + Math.sin(angle) * 10, top.x, top.y); ctx.fill(); ctx.stroke();
      }
      blob(ctx, { x: top.x - 2, y: top.y + 3 }, 3, 3, "#8f7563");
      break;
    }
    case "bush": blob(ctx, { x: at.x, y: at.y - 7 }, 12 * size, 8 * size, "#a9bd9b"); blob(ctx, { x: at.x + 6, y: at.y - 10 }, 7 * size, 5 * size, "#b4c3ab"); break;
    case "flowers": for (let i = 0; i < 5; i++) {
      const p = { x: at.x - 10 + i * 5, y: at.y - 2 - (i % 2) * 3 };
      ctx.strokeStyle = "#7f8f76"; line(ctx, p, { x: p.x, y: p.y + 6 });
      blob(ctx, p, 2.6, 2.6, ["#d8b6b4", "#e2d7ad", "#c6bed4", "#afbccb"][Math.floor(prop.seed * 4 + i) % 4]);
    } break;
    case "fence": {
      const a = project(prop.x - 0.5, prop.y), b = project(prop.x + 0.5, prop.y);
      ctx.strokeStyle = INK; ctx.fillStyle = "#f7f5f0";
      for (let i = 0; i <= 4; i++) { const x = a.x + (b.x - a.x) * i / 4, y = a.y + (b.y - a.y) * i / 4; ctx.fillRect(x - 1.5, y - 14, 3, 14); ctx.strokeRect(x - 1.5, y - 14, 3, 14); }
      ctx.lineWidth = 2; line(ctx, { x: a.x, y: a.y - 10 }, { x: b.x, y: b.y - 10 }); line(ctx, { x: a.x, y: a.y - 4 }, { x: b.x, y: b.y - 4 }); ctx.lineWidth = 1.2;
      break;
    }
    case "bench": box(ctx, prop.x, prop.y, 0.8, 0.3, 3, "#b89b73", "#8f7563", "#a3876b", 9); box(ctx, prop.x, prop.y - 0.14, 0.8, 0.05, 10, "#b89b73", "#8f7563", "#a3876b", 12);
      ctx.fillStyle = INK; for (const dx of [-0.35, 0.35]) { const p = project(prop.x + dx, prop.y); ctx.fillRect(p.x - 1, p.y - 9, 2, 9); } break;
    case "lamp": ctx.fillStyle = "#3b3a38"; ctx.fillRect(at.x - 1.5, at.y - 58, 3, 58); blob(ctx, { x: at.x, y: at.y - 62 }, 6, 6, "#e2d7ad"); break;
    case "stonelamp": box(ctx, prop.x, prop.y, 0.3, 0.3, 16, "#c9ccd0", "#9aa0a6", "#b3b8bd"); box(ctx, prop.x, prop.y, 0.4, 0.4, 5, "#b3b8bd", "#8e949a", "#a1a7ad", 16);
      ctx.fillStyle = "#e9e3c4"; ctx.fillRect(at.x - 3, at.y - 14, 6, 5); break;
    case "rock": blob(ctx, { x: at.x, y: at.y - 4 }, 9 * size, 6 * size, "#b7b4ad"); ctx.strokeStyle = "rgba(255,255,255,.5)"; line(ctx, { x: at.x - 5, y: at.y - 7 }, { x: at.x, y: at.y - 9 }); break;
    case "mushroom": for (const dx of [-4, 5]) { ctx.fillStyle = "#f3eee6"; ctx.fillRect(at.x + dx - 1.5, at.y - 7, 3, 7); ctx.strokeRect(at.x + dx - 1.5, at.y - 7, 3, 7);
      ctx.fillStyle = "#c98f8f"; ctx.beginPath(); ctx.ellipse(at.x + dx, at.y - 7, 5, 4, 0, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = "#fff"; ctx.fillRect(at.x + dx - 2, at.y - 10, 1.5, 1.5); } break;
    case "log": box(ctx, prop.x, prop.y, 0.9, 0.25, 8, "#9c8672", "#7c6a58", "#8f7b67"); blob(ctx, project(prop.x + 0.45, prop.y, 4), 4, 4, "#c9ab85"); blob(ctx, { x: at.x - 6, y: at.y - 9 }, 4, 2, "#a9bd9b"); break;
    case "snowman": blob(ctx, { x: at.x, y: at.y - 8 }, 10, 9, "#fff"); blob(ctx, { x: at.x, y: at.y - 22 }, 7, 7, "#fff");
      ctx.fillStyle = INK; ctx.fillRect(at.x - 3, at.y - 24, 1.6, 1.6); ctx.fillRect(at.x + 2, at.y - 24, 1.6, 1.6); ctx.fillStyle = "#e3c9a0"; ctx.fillRect(at.x, at.y - 22, 4, 1.5);
      ctx.fillStyle = "#c98f8f"; ctx.fillRect(at.x - 6, at.y - 17, 12, 2.5); box(ctx, prop.x, prop.y, 0.14, 0.14, 7, "#3b3a38", "#2c2c2b", "#333", 29); break;
    case "umbrella": {
      ctx.fillStyle = INK; ctx.fillRect(at.x - 1, at.y - 40, 2, 40);
      const colors = ["#d8b6b4", "#f7f5f0"]; for (let i = 0; i < 6; i++) { ctx.fillStyle = colors[i % 2]; ctx.strokeStyle = INK; ctx.beginPath(); ctx.moveTo(at.x, at.y - 46); ctx.arc(at.x, at.y - 34, 20, Math.PI + i * Math.PI / 6, Math.PI + (i + 1) * Math.PI / 6); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      box(ctx, prop.x + 0.3, prop.y + 0.2, 0.5, 0.25, 2, "#afbccb", "#8e9aa9", "#9fabbb");
      break;
    }
    case "shells": for (const [dx, dy, c] of [[-6, 0, "#e8cfd0"], [4, 2, "#f3eee6"], [0, -3, "#e2d7ad"]] as const) blob(ctx, { x: at.x + dx, y: at.y + dy }, 3, 2.2, c); break;
    case "stall": {
      box(ctx, prop.x, prop.y, 0.9, 0.6, 18, "#c9ab85", "#9c7f63", "#b39374");
      for (const dx of [-0.42, 0.42]) { const p = project(prop.x + dx, prop.y + 0.28); ctx.fillStyle = INK; ctx.fillRect(p.x - 1, p.y - 44, 2, 44); }
      const roof = [project(prop.x - 0.5, prop.y - 0.35, 44), project(prop.x + 0.5, prop.y - 0.35, 44), project(prop.x + 0.5, prop.y + 0.45, 38), project(prop.x - 0.5, prop.y + 0.45, 38)];
      poly(ctx, roof, prop.seed > 0.5 ? "#d8b6b4" : "#afbccb", INK);
      ctx.fillStyle = "#f7f5f0"; for (let i = 0; i < 4; i++) { const a = project(prop.x - 0.5 + i * 0.25, prop.y + 0.45, 38), b = project(prop.x - 0.375 + i * 0.25, prop.y + 0.45, 38); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(b.x, b.y + 4); ctx.lineTo(a.x, a.y + 4); ctx.fill(); }
      for (let i = 0; i < 3; i++) blob(ctx, project(prop.x - 0.25 + i * 0.25, prop.y, 20), 3, 2, ["#e2d7ad", "#c98f8f", "#b4c3ab"][i]);
      break;
    }
    case "lantern": {
      ctx.fillStyle = "#3b3a38"; ctx.fillRect(at.x - 1.5, at.y - 50, 3, 50);
      const glow = reducedMotion ? 0.8 : 0.65 + Math.sin(now / 700 + prop.seed * 9) * 0.2;
      ctx.globalAlpha *= glow; blob(ctx, { x: at.x, y: at.y - 54 }, 6, 8, prop.seed > 0.5 ? "#e3c9a0" : "#d8b6b4"); ctx.globalAlpha /= glow;
      ctx.strokeStyle = INK; line(ctx, { x: at.x - 5, y: at.y - 54 }, { x: at.x + 5, y: at.y - 54 });
      break;
    }
    case "bikes": for (const dx of [-6, 6]) { ctx.strokeStyle = INK; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(at.x + dx - 4, at.y - 6, 4, 0, Math.PI * 2); ctx.arc(at.x + dx + 5, at.y - 6, 4, 0, Math.PI * 2); ctx.stroke();
      line(ctx, { x: at.x + dx - 4, y: at.y - 6 }, { x: at.x + dx + 1, y: at.y - 12 }); line(ctx, { x: at.x + dx + 1, y: at.y - 12 }, { x: at.x + dx + 5, y: at.y - 6 }); } break;
    case "cottage": {
      box(ctx, prop.x, prop.y, 1.1, 1.1, 30, "#e6e2da", "#c7c1b6", "#d8d3ca");
      const peak = project(prop.x, prop.y, 52);
      poly(ctx, [project(prop.x - 0.6, prop.y - 0.6, 30), project(prop.x + 0.6, prop.y - 0.6, 30), peak], "#fff", INK);
      poly(ctx, [project(prop.x + 0.6, prop.y - 0.6, 30), project(prop.x + 0.6, prop.y + 0.6, 30), peak], "#f1f1ee", INK);
      poly(ctx, [project(prop.x - 0.6, prop.y + 0.6, 30), project(prop.x + 0.6, prop.y + 0.6, 30), peak], "#e6e8ea", INK);
      const window = project(prop.x + 0.56, prop.y, 16); ctx.fillStyle = "#e3c9a0"; ctx.fillRect(window.x - 4, window.y - 6, 8, 7); ctx.strokeRect(window.x - 4, window.y - 6, 8, 7);
      break;
    }
    case "duck": blob(ctx, { x: at.x, y: at.y - 5 }, 7, 4.5, "#fff"); blob(ctx, { x: at.x + 5, y: at.y - 10 }, 3.5, 3.5, "#fff");
      ctx.fillStyle = "#e3c9a0"; ctx.fillRect(at.x + 8, at.y - 10, 3, 1.5); ctx.fillStyle = INK; ctx.fillRect(at.x + 5, at.y - 11, 1.2, 1.2); break;
  }
}
