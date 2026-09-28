/**
 * The world around the shop: ground and props beyond the walls, the sidewalks and the road, dressed by the chosen scenery.
 * Props behind the back walls are painted into the backdrop (the walls hide their feet); the rest join the depth-sorted scene.
 */
import type { SceneryId } from "./data.ts";
import { project, turnView, type Plan } from "./layout.ts";
import { box, line, poly, shade, shadow } from "./render.ts";

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
/** Sceneries whose ground is grass. */
const GRASSY: ReadonlySet<SceneryId> = new Set(["garden", "park", "forest", "blossom"]);
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
  if (y >= layout.d - 1 && y <= layout.sideFar + 1 && x >= layout.sideStart - 1 && x <= layout.lane + 3) return true;
  return layout.neighbours.some(n => x >= n.x0 - 1 && x <= n.x1 + 1 && y >= n.y0 - 1 && y <= n.y1 + 1);
}
const cache = new Map<string, Prop[]>();
export function outsideProps(layout: Plan, scenery: SceneryId): Prop[] {
  const id = `${scenery}:${layout.building}:${layout.w}:${layout.d}`;
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
  // The L's patio and the U's courtyard: benches and flower beds along their walls, whatever the scenery.
  const notch = layout.notch;
  if (notch) {
    const patio = layout.building === "lshape";
    for (let x = notch.x0; x <= notch.x1; x += 2) props.push({ x, y: patio ? notch.y0 + 0.1 : notch.y1 - 0.1, kind: "flowers", seed: hash(x, notch.y0, 6) });
    const mid = { x: (notch.x0 + notch.x1) / 2, y: (notch.y0 + notch.y1) / 2 };
    props.push({ x: mid.x, y: mid.y, kind: "bench", seed: 0.5 }, { x: patio ? notch.x0 + 0.2 : notch.x0 + 0.3, y: patio ? notch.y1 - 0.4 : notch.y0 + 0.4, kind: "bush", seed: 0.7 });
    if (notch.x1 - notch.x0 >= 4) props.push({ x: notch.x1 - 0.4, y: patio ? notch.y1 - 0.4 : notch.y0 + 0.4, kind: "bush", seed: 0.3 });
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
    const h = hash(x, y, 9), g = hash(x, y, 10), spot = project(x + g, y + hash(x, y, 11));
    // Soft blotches of the second shade (cobbles at the market), so the ground reads as a surface rather than a grid.
    if (scenery === "market") { if (h < 0.35) poly(ctx, [project(x, y), project(x + 1, y), project(x + 1, y + 1), project(x, y + 1)], alt); }
    else if (h < 0.3) { const c = project(x + 0.5, y + 0.5); ctx.fillStyle = alt; ctx.beginPath(); ctx.ellipse(c.x, c.y, 26 + g * 18, 12 + g * 9, 0, 0, Math.PI * 2); ctx.fill(); }
    if (GRASSY.has(scenery) && g < 0.45) grass(ctx, spot, scenery === "forest" ? "rgba(92,112,82,.5)" : "rgba(118,138,104,.45)", 0.7 + h * 0.5);
    if (scenery === "forest" && h > 0.82) { ctx.fillStyle = g > 0.5 ? "rgba(201,171,133,.8)" : "rgba(184,140,110,.75)"; ctx.beginPath(); ctx.ellipse(spot.x + 6, spot.y + 2, 2.6, 1.4, g * 3, 0, Math.PI * 2); ctx.fill(); }
    if (scenery === "lot" && g < 0.3) { ctx.fillStyle = "rgba(120,116,108,.35)"; ctx.beginPath(); ctx.ellipse(spot.x, spot.y, 1.8, 1.1, 0, 0, Math.PI * 2); ctx.ellipse(spot.x + 4, spot.y + 1.5, 1.2, 0.8, 0, 0, Math.PI * 2); ctx.fill(); }
    if (scenery === "lot" && h > 0.94) { ctx.strokeStyle = "rgba(22,22,22,.15)"; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(spot.x - 8, spot.y); ctx.lineTo(spot.x - 2, spot.y + 2); ctx.lineTo(spot.x + 6, spot.y - 1); ctx.stroke(); ctx.lineWidth = 1; }
    if (scenery === "beach" && g < 0.3) { ctx.strokeStyle = "rgba(170,146,104,.3)"; ctx.beginPath(); ctx.ellipse(spot.x, spot.y, 9, 3, 0, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); }
    if (scenery === "snow" && g < 0.14) { ctx.fillStyle = "rgba(175,188,203,.22)"; ctx.beginPath(); ctx.ellipse(spot.x, spot.y, 18, 6, 0, 0, Math.PI * 2); ctx.fill(); }
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
  if (scenery === "park") pond(ctx, -4, layout.sideFar + 9, 1.6);
}
function pond(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  const c = project(x, y);
  ctx.fillStyle = "#b9c4b0"; ctx.beginPath(); ctx.ellipse(c.x, c.y, r * 50, r * 25, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#afbccb"; ctx.strokeStyle = "#161616"; ctx.beginPath(); ctx.ellipse(c.x, c.y, r * 44, r * 22, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = "rgba(247,245,240,.7)"; ctx.beginPath(); ctx.ellipse(c.x - 12, c.y - 4, 14, 5, 0, Math.PI, Math.PI * 1.6); ctx.stroke();
}

const INK = "#161616";
const frac = (value: number) => value - Math.floor(value);
function blob(ctx: CanvasRenderingContext2D, at: Point, rx: number, ry: number, fill: string) {
  ctx.fillStyle = fill; ctx.strokeStyle = INK; ctx.beginPath(); ctx.ellipse(at.x, at.y, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
}
/** A small round fruit, berry or pebble with a glint. */
export function bead(ctx: CanvasRenderingContext2D, at: Point, r: number, fill: string) {
  blob(ctx, at, r, r, fill);
  ctx.fillStyle = "rgba(255,255,255,.6)"; ctx.fillRect(at.x - r * 0.5, at.y - r * 0.6, r * 0.6, r * 0.5);
}
/** A few blades of grass. */
function grass(ctx: CanvasRenderingContext2D, at: Point, color: string, size = 1) {
  ctx.strokeStyle = color; ctx.lineWidth = 1.1; ctx.beginPath();
  for (const [dx, lean, h] of [[-2.5, -2, 4.5], [0, 0.5, 7], [2.5, 2, 5]]) { ctx.moveTo(at.x + dx * size, at.y); ctx.quadraticCurveTo(at.x + dx * size, at.y - h * size * 0.6, at.x + (dx + lean) * size, at.y - h * size); }
  ctx.stroke(); ctx.lineWidth = 1.2;
}
/** A trunk that flares at the roots, shaded on its right. */
function trunk(ctx: CanvasRenderingContext2D, at: Point, height: number, color = "#8f7563", width = 5) {
  const hw = width / 2, top = at.y - height;
  ctx.fillStyle = color; ctx.strokeStyle = INK; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(at.x - hw - 3, at.y + 1); ctx.quadraticCurveTo(at.x - hw, at.y - 2, at.x - hw * 0.8, top);
  ctx.lineTo(at.x + hw * 0.8, top); ctx.quadraticCurveTo(at.x + hw, at.y - 2, at.x + hw + 3, at.y + 1); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = shade(color, 0.8); ctx.fillRect(at.x + hw * 0.1, top + 1, hw * 0.6, height - 3);
  ctx.strokeStyle = shade(color, 0.66); line(ctx, { x: at.x - 1, y: at.y - height * 0.3 }, { x: at.x - 1, y: at.y - height * 0.5 });
}
type Lobe = readonly [number, number, number];
/** A leafy canopy: overlapping lobes under one outline, shaded underneath, with sunlit tops and a few leaf marks. */
function canopy(ctx: CanvasRenderingContext2D, at: Point, lobes: readonly Lobe[], size: number, fill: string, seed: number) {
  const shape = new Path2D();
  for (const [dx, dy, r] of lobes) { const cx = at.x + dx * size, cy = at.y + dy * size; shape.moveTo(cx + r * size, cy); shape.ellipse(cx, cy, r * size, r * 0.9 * size, 0, 0, Math.PI * 2); }
  ctx.save();
  ctx.strokeStyle = INK; ctx.lineWidth = 2.4; ctx.stroke(shape);
  ctx.fillStyle = fill; ctx.fill(shape);
  ctx.clip(shape);
  const top = at.y + Math.min(...lobes.map(([, dy, r]) => dy - r)) * size, bottom = at.y + Math.max(...lobes.map(([, dy, r]) => dy + r)) * size, span = bottom - top;
  ctx.fillStyle = shade(fill, 0.84); ctx.beginPath(); ctx.ellipse(at.x + span * 0.18, bottom + span * 0.12, span * 0.95, span * 0.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,.26)";
  for (const [dx, dy, r] of lobes) { ctx.beginPath(); ctx.ellipse(at.x + (dx - r * 0.3) * size, at.y + (dy - r * 0.38) * size, r * 0.45 * size, r * 0.28 * size, -0.4, 0, Math.PI * 2); ctx.fill(); }
  ctx.strokeStyle = shade(fill, 0.68); ctx.lineWidth = 1;
  for (let i = 0; i < 7; i++) {
    const [dx, dy, r] = lobes[i % lobes.length], u = frac(seed * 97 + i * 0.618), v = frac(seed * 53 + i * 0.414);
    const p = { x: at.x + (dx + (u - 0.5) * r * 1.2) * size, y: at.y + (dy + (v - 0.3) * r) * size };
    ctx.beginPath(); ctx.arc(p.x, p.y - 2, 2.2, 0.25 * Math.PI, 0.75 * Math.PI); ctx.stroke();
  }
  ctx.restore(); ctx.lineWidth = 1.2;
}
/** A conifer: three tiers lit from the left, with snow on their tops in winter. */
function pineTree(ctx: CanvasRenderingContext2D, at: Point, fill: string, snow: boolean, size: number) {
  trunk(ctx, at, 12, "#7c6453", 4);
  for (let tier = 0; tier < 3; tier++) {
    const w = (17 - tier * 4.5) * size, base = at.y - 8 - tier * 12 * size, peak = base - 22 * size;
    ctx.fillStyle = fill; ctx.strokeStyle = INK; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(at.x - w, base); ctx.quadraticCurveTo(at.x, base + 4 * size, at.x + w, base); ctx.lineTo(at.x, peak); ctx.closePath(); ctx.fill(); ctx.stroke();
    poly(ctx, [{ x: at.x, y: peak + 1 }, { x: at.x + w - 1.5, y: base - 0.5 }, { x: at.x, y: base + 2 * size }], shade(fill, 0.8));
    if (snow) {
      const edge = peak + (base - peak) * 0.5, half = w * 0.5;
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.moveTo(at.x - half, edge); ctx.lineTo(at.x, peak); ctx.lineTo(at.x + half, edge);
      ctx.quadraticCurveTo(at.x + half * 0.5, edge + 4 * size, at.x, edge); ctx.quadraticCurveTo(at.x - half * 0.5, edge + 4 * size, at.x - half, edge); ctx.fill();
      ctx.strokeStyle = "rgba(22,22,22,.3)"; ctx.stroke();
    } else { ctx.strokeStyle = "rgba(255,255,255,.3)"; ctx.lineWidth = 1.5; line(ctx, { x: at.x - 2, y: peak + 5 }, { x: at.x - w * 0.62, y: base - 3 }); ctx.lineWidth = 1.2; }
    ctx.strokeStyle = INK; ctx.beginPath(); ctx.moveTo(at.x - w, base); ctx.lineTo(at.x, peak); ctx.lineTo(at.x + w, base); ctx.stroke();
  }
}
const ROUND_TREE: readonly Lobe[] = [[0, -38, 15], [-12, -31, 11], [12, -30, 12], [-6, -48, 11], [8, -47, 10]];
const BUSH: readonly Lobe[] = [[-7, -6, 7], [2, -9, 8], [9, -5, 6], [0, -4, 7]];
const LEAVES = ["#a9bd9b", "#a2b894", "#b0c2a2"] as const;

/** One outside prop, drawn cute and chunky like the rest of the shop. */
export function drawProp(ctx: CanvasRenderingContext2D, prop: Prop, now: number, reducedMotion: boolean) {
  const at = project(prop.x, prop.y), size = 0.85 + prop.seed * 0.35, leaf = LEAVES[Math.floor(prop.seed * 3)];
  ctx.lineWidth = 1.2;
  const big = prop.kind === "tree" || prop.kind === "apple" || prop.kind === "blossom" || prop.kind === "pine" || prop.kind === "snowpine";
  if (prop.kind !== "fence" && prop.kind !== "flowers" && prop.kind !== "shells") shadow(ctx, prop.x, prop.y, prop.kind === "stall" || prop.kind === "cottage" ? 28 : big ? 20 * size : 14);
  if (big && prop.kind !== "snowpine") for (const dx of [-9, 8]) grass(ctx, { x: at.x + dx, y: at.y + 2 }, "rgba(111,131,98,.7)", 0.9);
  switch (prop.kind) {
    case "tree": case "apple": {
      trunk(ctx, at, 24 * size, "#8f7563", 6);
      canopy(ctx, at, ROUND_TREE, size, prop.kind === "apple" ? "#a2b894" : leaf, prop.seed);
      if (prop.kind === "apple") for (const [dx, dy] of [[-9, -30], [7, -40], [2, -27], [11, -31], [-3, -44]]) bead(ctx, { x: at.x + dx * size, y: at.y + dy * size }, 2.8, "#c98f8f");
      break;
    }
    case "blossom": {
      trunk(ctx, at, 20 * size, "#6d5a4c", 5);
      ctx.strokeStyle = INK; ctx.lineWidth = 2; line(ctx, { x: at.x, y: at.y - 16 * size }, { x: at.x - 8 * size, y: at.y - 26 * size }); ctx.lineWidth = 1.2;
      canopy(ctx, at, ROUND_TREE, size, prop.seed > 0.5 ? "#e6c3c5" : "#ddb3b6", prop.seed);
      ctx.fillStyle = "#f7ecec"; for (let i = 0; i < 8; i++) { const u = frac(prop.seed * 31 + i * 0.37); ctx.fillRect(at.x - 18 * size + u * 36 * size, at.y - 50 * size + frac(u * 7) * 26 * size, 2, 2); }
      ctx.fillStyle = "#f3dfe0"; for (let i = 0; i < 5; i++) ctx.fillRect(at.x - 14 + i * 7, at.y + 2 + (i % 2) * 3, 2.2, 1.6);
      break;
    }
    case "pine": pineTree(ctx, at, prop.seed > 0.5 ? "#7f9374" : "#8ea182", false, size); break;
    case "snowpine":
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.ellipse(at.x, at.y + 1, 16 * size, 5 * size, 0, 0, Math.PI * 2); ctx.fill();
      pineTree(ctx, at, "#8a9a8c", true, size); break;
    case "palm": {
      const top = { x: at.x + 4, y: at.y - 50 * size };
      ctx.strokeStyle = INK; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(at.x, at.y); ctx.quadraticCurveTo(at.x + 9, at.y - 25, top.x, top.y); ctx.stroke();
      ctx.strokeStyle = "#b89b73"; ctx.lineWidth = 3.6; ctx.stroke();
      ctx.strokeStyle = "#8f7563"; ctx.lineWidth = 1;
      for (let t = 0.12; t < 0.95; t += 0.13) {
        const x = (1 - t) ** 2 * at.x + 2 * (1 - t) * t * (at.x + 9) + t * t * top.x, y = (1 - t) ** 2 * at.y + 2 * (1 - t) * t * (at.y - 25) + t * t * top.y;
        line(ctx, { x: x - 2, y: y + 0.5 }, { x: x + 2, y: y - 0.5 });
      }
      ctx.lineWidth = 1.2;
      for (const angle of [-2.9, -2.3, -1.6, -0.9, -0.3, 0.35]) {
        const tip = { x: top.x + Math.cos(angle) * 28 * size, y: top.y + Math.sin(angle) * 18 * size + 10 };
        const mid = { x: top.x + Math.cos(angle) * 15 * size, y: top.y + Math.sin(angle) * 14 * size - 7 };
        ctx.fillStyle = angle > -1.6 ? "#93a888" : "#a3b797"; ctx.strokeStyle = INK; ctx.beginPath(); ctx.moveTo(top.x, top.y);
        ctx.quadraticCurveTo(mid.x, mid.y - 4, tip.x, tip.y); ctx.quadraticCurveTo(mid.x, mid.y + 5, top.x, top.y); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = "rgba(22,22,22,.35)"; ctx.beginPath(); ctx.moveTo(top.x, top.y); ctx.quadraticCurveTo(mid.x, mid.y, tip.x, tip.y); ctx.stroke();
      }
      for (const [dx, dy] of [[-3, 3], [2, 4], [-0.5, 6]]) bead(ctx, { x: top.x + dx, y: top.y + dy }, 3, "#8f7563");
      break;
    }
    case "bush":
      canopy(ctx, { x: at.x, y: at.y + 1 }, BUSH, size, leaf, prop.seed);
      if (prop.seed > 0.62) for (const [dx, dy] of [[-6, -9], [4, -12], [8, -6]]) bead(ctx, { x: at.x + dx * size, y: at.y + dy * size }, 1.8, "#c98f8f");
      else if (prop.seed < 0.2) for (const [dx, dy] of [[-5, -10], [5, -11], [1, -6]]) blob(ctx, { x: at.x + dx * size, y: at.y + dy * size }, 2, 2, "#f3eee6");
      break;
    case "flowers": {
      const colors = ["#d8b6b4", "#e2d7ad", "#c6bed4", "#afbccb"];
      for (const [dx, tilt] of [[-9, -0.5], [-2, 0.3], [5, -0.3], [10, 0.5]]) { ctx.fillStyle = "#a2b894"; ctx.strokeStyle = "#6f8264"; ctx.beginPath(); ctx.ellipse(at.x + dx, at.y - 2, 4, 2, tilt, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
      for (let i = 0; i < 5; i++) {
        const p = { x: at.x - 10 + i * 5, y: at.y - 7 - (i % 2) * 4 };
        ctx.strokeStyle = "#6f8264"; line(ctx, p, { x: p.x + (i % 2 ? 0.5 : -0.5), y: at.y - 1 });
        const petal = colors[Math.floor(prop.seed * 4 + i) % 4];
        ctx.fillStyle = petal; ctx.strokeStyle = "rgba(22,22,22,.45)"; ctx.lineWidth = 0.6;
        for (let k = 0; k < 5; k++) { const a = k * Math.PI * 2 / 5 - Math.PI / 2; ctx.beginPath(); ctx.arc(p.x + Math.cos(a) * 2.1, p.y + Math.sin(a) * 1.8, 1.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
        ctx.fillStyle = petal === "#e2d7ad" ? "#c9ab85" : "#f1e3c2"; ctx.beginPath(); ctx.arc(p.x, p.y, 1.1, 0, Math.PI * 2); ctx.fill(); ctx.lineWidth = 1.2;
      }
      break;
    }
    case "fence": {
      const a = project(prop.x - 0.5, prop.y), b = project(prop.x + 0.5, prop.y);
      ctx.strokeStyle = INK; ctx.lineWidth = 2.2; line(ctx, { x: a.x, y: a.y - 10 }, { x: b.x, y: b.y - 10 }); line(ctx, { x: a.x, y: a.y - 4 }, { x: b.x, y: b.y - 4 });
      ctx.strokeStyle = "#d8d3ca"; ctx.lineWidth = 1; line(ctx, { x: a.x, y: a.y - 10 }, { x: b.x, y: b.y - 10 }); line(ctx, { x: a.x, y: a.y - 4 }, { x: b.x, y: b.y - 4 }); ctx.lineWidth = 1.2;
      for (let i = 0; i <= 4; i++) {
        const x = a.x + (b.x - a.x) * i / 4, y = a.y + (b.y - a.y) * i / 4;
        poly(ctx, [{ x: x - 2, y }, { x: x - 2, y: y - 14 }, { x, y: y - 17 }, { x: x + 2, y: y - 14 }, { x: x + 2, y }], "#f7f5f0", INK);
        ctx.fillStyle = "#dcd8d0"; ctx.fillRect(x + 0.4, y - 13.5, 1.2, 13);
      }
      break;
    }
    case "bench": box(ctx, prop.x, prop.y, 0.8, 0.3, 3, "#b89b73", "#8f7563", "#a3876b", 9); box(ctx, prop.x, prop.y - 0.14, 0.8, 0.05, 10, "#b89b73", "#8f7563", "#a3876b", 12);
      ctx.fillStyle = INK; for (const dx of [-0.35, 0.35]) { const p = project(prop.x + dx, prop.y); ctx.fillRect(p.x - 1, p.y - 9, 2, 9); } break;
    case "lamp":
      box(ctx, prop.x, prop.y, 0.14, 0.14, 5, "#4a4946", "#2c2c2b", "#3b3a38");
      ctx.fillStyle = "#3b3a38"; ctx.fillRect(at.x - 1.5, at.y - 58, 3, 54);
      ctx.fillStyle = "rgba(226,215,173,.25)"; ctx.beginPath(); ctx.arc(at.x, at.y - 62, 11, 0, Math.PI * 2); ctx.fill();
      blob(ctx, { x: at.x, y: at.y - 62 }, 6, 6, "#e2d7ad");
      ctx.fillStyle = "#3b3a38"; ctx.beginPath(); ctx.moveTo(at.x - 7, at.y - 66); ctx.lineTo(at.x, at.y - 71); ctx.lineTo(at.x + 7, at.y - 66); ctx.closePath(); ctx.fill(); break;
    case "stonelamp": box(ctx, prop.x, prop.y, 0.3, 0.3, 16, "#c9ccd0", "#9aa0a6", "#b3b8bd"); box(ctx, prop.x, prop.y, 0.4, 0.4, 5, "#b3b8bd", "#8e949a", "#a1a7ad", 16);
      ctx.fillStyle = "#e9e3c4"; ctx.fillRect(at.x - 3, at.y - 14, 6, 5); break;
    case "rock": {
      const s = size;
      poly(ctx, [{ x: at.x - 11 * s, y: at.y - 1 }, { x: at.x - 8 * s, y: at.y - 9 * s }, { x: at.x + 1, y: at.y - 13 * s }, { x: at.x + 9 * s, y: at.y - 8 * s }, { x: at.x + 12 * s, y: at.y - 1 }, { x: at.x + 2, y: at.y + 2 }], "#b7b4ad", INK);
      poly(ctx, [{ x: at.x - 8 * s, y: at.y - 9 * s }, { x: at.x + 1, y: at.y - 13 * s }, { x: at.x + 9 * s, y: at.y - 8 * s }, { x: at.x + 1, y: at.y - 5 * s }], "#cbc8c1");
      poly(ctx, [{ x: at.x + 1, y: at.y - 5 * s }, { x: at.x + 9 * s, y: at.y - 8 * s }, { x: at.x + 12 * s, y: at.y - 1 }, { x: at.x + 2, y: at.y + 2 }], "#9f9c95");
      ctx.strokeStyle = INK; ctx.beginPath(); ctx.moveTo(at.x - 11 * s, at.y - 1); ctx.lineTo(at.x - 8 * s, at.y - 9 * s); ctx.lineTo(at.x + 1, at.y - 13 * s); ctx.lineTo(at.x + 9 * s, at.y - 8 * s); ctx.lineTo(at.x + 12 * s, at.y - 1); ctx.lineTo(at.x + 2, at.y + 2); ctx.closePath(); ctx.stroke();
      if (prop.seed > 0.5) { ctx.fillStyle = "rgba(143,164,133,.8)"; ctx.beginPath(); ctx.ellipse(at.x - 3 * s, at.y - 10 * s, 4 * s, 1.8 * s, -0.3, 0, Math.PI * 2); ctx.fill(); }
      break;
    }
    case "mushroom": for (const [dx, h] of [[-4, 7], [5, 9]]) {
      ctx.fillStyle = "#f3eee6"; ctx.strokeStyle = INK; ctx.fillRect(at.x + dx - 1.5, at.y - h, 3, h); ctx.strokeRect(at.x + dx - 1.5, at.y - h, 3, h);
      ctx.fillStyle = "#c98f8f"; ctx.beginPath(); ctx.ellipse(at.x + dx, at.y - h, 5.5, 4.5, 0, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.fillRect(at.x + dx - 3, at.y - h - 3, 1.6, 1.6); ctx.fillRect(at.x + dx + 1, at.y - h - 2, 1.4, 1.4);
    } grass(ctx, { x: at.x + 1, y: at.y + 1 }, "rgba(92,112,82,.7)", 0.8); break;
    case "log": box(ctx, prop.x, prop.y, 0.9, 0.25, 8, "#9c8672", "#7c6a58", "#8f7b67"); blob(ctx, project(prop.x + 0.45, prop.y, 4), 4, 4, "#c9ab85");
      ctx.strokeStyle = "#9c8672"; { const ring = project(prop.x + 0.45, prop.y, 4); ctx.beginPath(); ctx.arc(ring.x, ring.y, 2, 0, Math.PI * 2); ctx.stroke(); }
      canopy(ctx, { x: at.x - 6, y: at.y + 1 }, [[-2, -9, 4], [3, -10, 3.5]], 1, "#a9bd9b", prop.seed); break;
    case "snowman": blob(ctx, { x: at.x, y: at.y - 8 }, 10, 9, "#fff"); blob(ctx, { x: at.x, y: at.y - 22 }, 7, 7, "#fff");
      ctx.fillStyle = "rgba(175,188,203,.4)"; ctx.beginPath(); ctx.ellipse(at.x + 3, at.y - 5, 6, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = INK; ctx.fillRect(at.x - 3, at.y - 24, 1.6, 1.6); ctx.fillRect(at.x + 2, at.y - 24, 1.6, 1.6); ctx.fillStyle = "#e3c9a0"; ctx.fillRect(at.x, at.y - 22, 4, 1.5);
      ctx.fillStyle = "#c98f8f"; ctx.fillRect(at.x - 6, at.y - 17, 12, 2.5); box(ctx, prop.x, prop.y, 0.14, 0.14, 7, "#3b3a38", "#2c2c2b", "#333", 29); break;
    case "umbrella": {
      ctx.fillStyle = INK; ctx.fillRect(at.x - 1, at.y - 40, 2, 40);
      const colors = ["#d8b6b4", "#f7f5f0"]; for (let i = 0; i < 6; i++) { ctx.fillStyle = colors[i % 2]; ctx.strokeStyle = INK; ctx.beginPath(); ctx.moveTo(at.x, at.y - 46); ctx.arc(at.x, at.y - 34, 20, Math.PI + i * Math.PI / 6, Math.PI + (i + 1) * Math.PI / 6); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      box(ctx, prop.x + 0.3, prop.y + 0.2, 0.5, 0.25, 2, "#afbccb", "#8e9aa9", "#9fabbb");
      break;
    }
    case "shells": for (const [dx, dy, c] of [[-6, 0, "#e8cfd0"], [4, 2, "#f3eee6"], [0, -3, "#e2d7ad"]] as const) {
      blob(ctx, { x: at.x + dx, y: at.y + dy }, 3.2, 2.4, c);
      ctx.strokeStyle = "rgba(22,22,22,.35)"; ctx.lineWidth = 0.6; for (const t of [-1.2, 0, 1.2]) line(ctx, { x: at.x + dx, y: at.y + dy + 2 }, { x: at.x + dx + t * 1.8, y: at.y + dy - 1.6 }); ctx.lineWidth = 1.2;
    } break;
    case "stall": {
      box(ctx, prop.x, prop.y, 0.9, 0.6, 18, "#c9ab85", "#9c7f63", "#b39374");
      for (const dx of [-0.42, 0.42]) { const p = project(prop.x + dx, prop.y + 0.28); ctx.fillStyle = INK; ctx.fillRect(p.x - 1, p.y - 44, 2, 44); }
      const roof = [project(prop.x - 0.5, prop.y - 0.35, 44), project(prop.x + 0.5, prop.y - 0.35, 44), project(prop.x + 0.5, prop.y + 0.45, 38), project(prop.x - 0.5, prop.y + 0.45, 38)];
      poly(ctx, roof, prop.seed > 0.5 ? "#d8b6b4" : "#afbccb", INK);
      ctx.fillStyle = "#f7f5f0"; for (let i = 0; i < 4; i++) { const a = project(prop.x - 0.5 + i * 0.25, prop.y + 0.45, 38), b = project(prop.x - 0.375 + i * 0.25, prop.y + 0.45, 38); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(b.x, b.y + 4); ctx.lineTo(a.x, a.y + 4); ctx.fill(); }
      for (let i = 0; i < 3; i++) bead(ctx, project(prop.x - 0.25 + i * 0.25, prop.y, 20), 3, ["#e2d7ad", "#c98f8f", "#b4c3ab"][i]);
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
