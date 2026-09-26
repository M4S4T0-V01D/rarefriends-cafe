/**
 * Shop floor plan on an isometric tile grid. The building is `size × size` tiles and grows 2 × 2 per expansion.
 *
 *   x = 0–1   kitchen room (stoves on the back wall, chefs at x = 1), closed off by the counter wall at x = 2
 *   y ≥ kitchen end: a break room behind a wall, entered through its door; a kitchen door joins the two rooms
 *   x ≥ 3     the dining room: the player's tile grid
 *   x ≥ size  outside: the sidewalk and street, where Friends walk by and some come in through the front door
 */
import { catalogItem, type ItemKind } from "./data.ts";

export type Tile = Readonly<{ x: number; y: number }>;
/** Tile footprint in world pixels; the camera scales the whole plan to fit the view. */
export const TILE_W = 66, TILE_H = 33, ORIGIN_X = 480, ORIGIN_Y = 168;
export const START_SIZE = 10, MAX_SIZE = 16;
export const DINING_X = 3;
/** Street lanes: the sidewalk at size and size + 1, the road beyond. */
export const STREET_WIDTH = 4;

export type Plan = Readonly<{
  size: number; kitchenEnd: number; door: Tile; entry: Tile; pickup: Tile; pass: Tile; capsule: Tile; capsuleSpot: Tile;
  breakDoor: Tile; kitchenDoor: Tile; stoves: readonly Tile[]; counter: readonly Tile[]; walls: readonly Tile[];
  chefSpots: readonly Tile[]; restSpots: readonly Tile[]; promoterSpots: readonly Tile[]; lane: number; laneStart: number; laneEnd: number;
}>;

const cache = new Map<number, Plan>();
export function planFor(size: number): Plan {
  let plan = cache.get(size);
  if (plan) return plan;
  const kitchenEnd = size - 4, range = (from: number, to: number) => Array.from({ length: Math.max(0, to - from) }, (_, index) => from + index);
  const breakRows = range(kitchenEnd + 1, size);
  const kitchenDoor = { x: 1, y: kitchenEnd }, breakDoor = { x: 2, y: kitchenEnd + 2 };
  plan = Object.freeze({
    size, kitchenEnd,
    door: { x: size - 1, y: 3 }, entry: { x: size, y: 3 },
    pickup: { x: DINING_X, y: Math.floor(kitchenEnd / 2) }, pass: { x: 2, y: Math.floor(kitchenEnd / 2) },
    capsule: { x: size - 1, y: 0 }, capsuleSpot: { x: size - 2, y: 0 },
    breakDoor, kitchenDoor,
    stoves: range(0, kitchenEnd).map(y => ({ x: 0, y })),
    counter: range(0, kitchenEnd).map(y => ({ x: 2, y })),
    // Kitchen/break-room dividing wall (with the kitchen door) and the break room's dining-side wall (with its door).
    walls: [...[0, 2].map(x => ({ x, y: kitchenEnd })), ...breakRows.filter(y => y !== breakDoor.y).map(y => ({ x: 2, y }))],
    chefSpots: range(0, kitchenEnd).filter(y => y % 2 === 0).map(y => ({ x: 1, y })),
    restSpots: breakRows.flatMap(y => [{ x: 1, y }, { x: 0, y }]).filter(tile => !(tile.x === 0 && tile.y === kitchenEnd + 1)),
    promoterSpots: [5, 1, 7, -1].map(y => ({ x: size, y })),
    lane: size + 1, laneStart: -3, laneEnd: size + 2,
  });
  cache.set(size, plan);
  return plan;
}

/** A placed item. Tables seat a guest on the tile behind them: dir 0 = up-right (y − 1), dir 1 = up-left (x − 1). */
export type Item = { id: number; kind: ItemKind; x: number; y: number; dir: 0 | 1 };
export const seatOf = (item: Pick<Item, "x" | "y" | "dir">): Tile => item.dir === 0 ? { x: item.x, y: item.y - 1 } : { x: item.x - 1, y: item.y };
export const DEFAULT_ITEMS: readonly Item[] = [
  { id: 1, kind: "table", x: 5, y: 3, dir: 0 }, { id: 2, kind: "table", x: 7, y: 5, dir: 0 }, { id: 3, kind: "table", x: 5, y: 7, dir: 0 },
];

export const same = (a: Tile, b: Tile) => a.x === b.x && a.y === b.y;
/** Tiles are keyed with room for the street and the lane's off-screen ends. */
export const key = (tile: Tile) => (tile.y + 8) * 64 + tile.x + 8;
export const fromKey = (id: number): Tile => ({ x: (id % 64) - 8, y: Math.floor(id / 64) - 8 });
export const inside = (tile: Tile, size: number) => tile.x >= 0 && tile.y >= 0 && tile.x < size && tile.y < size;
/** Walkable: the building floor plus the sidewalk strip in front of it. */
export const walkable = (tile: Tile, plan: Plan) => inside(tile, plan.size)
  || (tile.x >= plan.size && tile.x <= plan.lane && tile.y >= plan.laneStart && tile.y <= plan.laneEnd);
export const inDining = (tile: Tile, size: number) => tile.x >= DINING_X && tile.y >= 0 && tile.x < size && tile.y < size;

const fixtures = (plan: Plan) => new Set([...plan.stoves, ...plan.counter, ...plan.walls, plan.capsule].map(key));
/** Tiles where nothing may be placed. */
export function isReserved(tile: Tile, plan: Plan) {
  return !inDining(tile, plan.size) || [plan.door, plan.pickup, plan.capsuleSpot, plan.capsule, plan.breakDoor].some(reserved => same(reserved, tile))
    || (tile.x === DINING_X && tile.y === plan.breakDoor.y);
}

/** Blocked tiles for routing. Seats and rugs stay walkable. */
export function blockedTiles(items: readonly Item[], plan: Plan): Set<number> {
  const blocked = fixtures(plan);
  for (const item of items) if (catalogItem(item.kind).blocks) blocked.add(key(item));
  return blocked;
}
/** Can a step from `a` to its neighbour `b` be taken? Walls separate the building from the street except at the door. */
function passable(a: Tile, b: Tile, plan: Plan, blocked: Set<number>) {
  if (!walkable(b, plan) || blocked.has(key(b))) return false;
  const crossing = (a.x < plan.size) !== (b.x < plan.size);
  return !crossing || (a.y === plan.door.y && b.y === plan.door.y);
}

const STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

/** Breadth-first route to the nearest goal tile. Returns tiles after `from`, or null when unreachable. */
export function route(from: Tile, goals: readonly Tile[], blocked: Set<number>, plan: Plan): Tile[] | null {
  const start = { x: Math.round(from.x), y: Math.round(from.y) };
  const targets = new Set(goals.map(key));
  if (!targets.size) return null;
  if (targets.has(key(start))) return [];
  const previous = new Map<number, number>([[key(start), -1]]);
  const queue: Tile[] = [start];
  for (let head = 0; head < queue.length; head++) {
    const tile = queue[head];
    for (const [dx, dy] of STEPS) {
      const next = { x: tile.x + dx, y: tile.y + dy }, id = key(next);
      if (previous.has(id) || !passable(tile, next, plan, blocked)) continue;
      previous.set(id, key(tile));
      if (targets.has(id)) {
        const path: Tile[] = [];
        for (let at = id; at !== key(start); at = previous.get(at)!) path.unshift(fromKey(at));
        return path;
      }
      queue.push(next);
    }
  }
  return null;
}

function reachable(from: Tile, blocked: Set<number>, plan: Plan): Set<number> {
  const seen = new Set([key(from)]), queue = [from];
  for (let head = 0; head < queue.length; head++) for (const [dx, dy] of STEPS) {
    const next = { x: queue[head].x + dx, y: queue[head].y + dy };
    if (!seen.has(key(next)) && passable(queue[head], next, plan, blocked)) { seen.add(key(next)); queue.push(next); }
  }
  return seen;
}

/** Walkable dining tiles next to a table, where a worker stands to take orders or serve. */
export function serviceTiles(table: Tile, blocked: Set<number>, plan: Plan): Tile[] {
  return STEPS.map(([dx, dy]) => ({ x: table.x + dx, y: table.y + dy }))
    .filter(tile => inside(tile, plan.size) && tile.x >= DINING_X && !blocked.has(key(tile)));
}

/** Can guests reach every chair from the street, and staff reach every table, the counter, capsules and the break room? */
export function layoutProblem(items: readonly Item[], plan: Plan): string | null {
  const blocked = blockedTiles(items, plan), open = reachable({ x: plan.lane, y: plan.door.y }, blocked, plan);
  if (!open.has(key(plan.pickup)) || !open.has(key(plan.capsuleSpot))) return "That would wall off the counter or capsule machine.";
  if (!open.has(key(plan.breakDoor))) return "Staff need a path to the break room.";
  for (const item of items) if (item.kind === "table") {
    if (!open.has(key(seatOf(item)))) return "Guests couldn't reach that chair.";
    if (!serviceTiles(item, blocked, plan).some(tile => open.has(key(tile)))) return "Staff couldn't reach that table.";
  }
  return null;
}

/** Why `candidate` can't go here (ignoring the item being moved), or null when the spot is valid. */
export function placementProblem(items: readonly Item[], candidate: Omit<Item, "id">, plan: Plan, movingId?: number): string | null {
  const others = items.filter(item => item.id !== movingId);
  if (isReserved(candidate, plan)) return inDining(candidate, plan.size) ? "That tile is kept clear for the door, counter, capsules or break room." : "Place things in the dining room.";
  if (candidate.kind === "rug") return others.some(item => item.kind === "rug" && same(item, candidate)) ? "There's already a rug here." : null;
  const taken = new Set<number>();
  for (const item of others) if (item.kind !== "rug") { taken.add(key(item)); if (item.kind === "table") taken.add(key(seatOf(item))); }
  if (taken.has(key(candidate))) return "Something is already there.";
  if (candidate.kind === "table") {
    const seat = seatOf(candidate);
    if (isReserved(seat, plan) || taken.has(key(seat))) return "The chair needs a free tile behind the table. Try rotating.";
  }
  return layoutProblem([...others, { ...candidate, id: -1 }], plan);
}

/** World-space projection of a (fractional) grid point; lift raises it on screen. */
export function project(x: number, y: number, lift = 0) {
  return { x: ORIGIN_X + (x - y) * TILE_W / 2, y: ORIGIN_Y + (x + y) * TILE_H / 2 - lift };
}
export function unproject(sx: number, sy: number) {
  const a = (sx - ORIGIN_X) / (TILE_W / 2), b = (sy - ORIGIN_Y) / (TILE_H / 2);
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

/** Camera that fits the building, its walls and the street into the 960 × 640 view (with room for the HUD). */
export type Camera = Readonly<{ zoom: number; x: number; y: number }>;
export function cameraFor(size: number): Camera {
  const plan = planFor(size);
  const points = [project(-0.5, -0.5, 150), project(plan.lane + 2.5, plan.laneStart - 0.5), project(plan.lane + 2.5, plan.laneEnd + 0.5),
    project(-0.5, size - 0.5), project(size - 0.5, size + 0.5)];
  const left = Math.min(...points.map(p => p.x)), right = Math.max(...points.map(p => p.x));
  const top = Math.min(...points.map(p => p.y)), bottom = Math.max(...points.map(p => p.y));
  const zoom = Math.min(1, 940 / (right - left), 560 / (bottom - top));
  return { zoom, x: 480 - (left + right) / 2 * zoom, y: 40 + (560 - (bottom - top) * zoom) / 2 - top * zoom };
}
export const toView = (camera: Camera, point: { x: number; y: number }) => ({ x: point.x * camera.zoom + camera.x, y: point.y * camera.zoom + camera.y });
export const toWorld = (camera: Camera, point: { x: number; y: number }) => ({ x: (point.x - camera.x) / camera.zoom, y: (point.y - camera.y) / camera.zoom });
