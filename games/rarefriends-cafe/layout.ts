/**
 * Shop floor plan on an isometric tile grid. The building is `w × d` tiles (x runs toward the street, y along it); its
 * template sets where the kitchen, break room and any side rooms go. Each expansion adds 2 tiles to both sides.
 *
 *   kitchen       stoves against a back wall, chefs in the next row, closed off by the counter with its pass
 *   break room    always the front-left corner (x 0–1), behind a wall with a door
 *   dining room   every other interior tile: the player's grid
 *   x ≥ w         outside: the sidewalk and street, where Friends walk by and some come in through the front door
 */
import { catalogItem, isRug, type ItemKind } from "./data.ts";

export type Tile = Readonly<{ x: number; y: number }>;
/** Tile footprint in world pixels; the camera scales the whole plan to fit the view. */
export const TILE_W = 66, TILE_H = 33, ORIGIN_X = 480, ORIGIN_Y = 168;
export const START_SIZE = 10, MAX_SIZE = 16;
/** Largest building extent on either axis (the long diner at full size). */
export const MAX_EXTENT = MAX_SIZE + 4;
/** Street lanes: the sidewalk at w and w + 1, the road beyond. */
export const STREET_WIDTH = 4;

/**
 * Which way an item's front faces: 0 = +y (down-left on screen), 1 = +x (down-right), 2 = −y (up-right), 3 = −x (up-left).
 * R turns it a quarter clockwise on screen.
 */
export type Dir = 0 | 1 | 2 | 3;
export const FACING: readonly Tile[] = [{ x: 0, y: 1 }, { x: 1, y: 0 }, { x: 0, y: -1 }, { x: -1, y: 0 }];
export const isDir = (value: unknown): value is Dir => value === 0 || value === 1 || value === 2 || value === 3;
/** Where the capsule machine stands; `dir` is the side the manager uses it from (by default the tile to its left). */
export type Placement = Readonly<{ x: number; y: number; dir: Dir }>;
export const defaultCapsule = (w: number): Placement => ({ x: w - 1, y: 0, dir: 3 });

export type BuildingId = "corner" | "long" | "townhouse" | "parlour";
export type Building = Readonly<{ id: BuildingId; name: string; text: string; trim: string }>;
export const BUILDINGS: readonly Building[] = [
  { id: "corner", name: "Corner café", text: "Square room. The kitchen runs along the left wall and opens into the break room.", trim: "#d0cdc6" },
  { id: "long", name: "Long diner", text: "Four tiles longer on the street. A short kitchen, and the break room at the far end.", trim: "#ccd3d9" },
  { id: "townhouse", name: "Townhouse", text: "The kitchen is on the back wall, across the room from the break room.", trim: "#d8c6b9" },
  { id: "parlour", name: "Café with parlour", text: "Two tiles deeper. A half wall closes off a front parlour, far from the pass.", trim: "#d9d1c0" },
];
export const buildingById = (id: BuildingId) => BUILDINGS.find(item => item.id === id) ?? BUILDINGS[0];
export const isBuilding = (value: unknown): value is BuildingId => BUILDINGS.some(item => item.id === value);

/** An interior wall tile: `along` is the direction it runs; `low` walls are half-height partitions. */
export type Wall = Readonly<{ x: number; y: number; along: "x" | "y"; low?: boolean }>;
export type Plan = Readonly<{
  size: number; building: BuildingId; w: number; d: number;
  door: Tile; entry: Tile; pickup: Tile; pass: Tile; chefPass: Tile; capsule: Tile; capsuleSpot: Tile; capsuleDir: Dir;
  /** The kitchen stands against the left wall (x = −0.5) or the back wall (y = −0.5) for `kitchenLength` tiles. */
  kitchenSide: "left" | "back"; kitchenLength: number;
  breakDoor: Tile; kitchenDoor: Tile; stoves: readonly Tile[]; counter: readonly Tile[]; walls: readonly Wall[];
  kitchenFloor: readonly Tile[]; breakFloor: readonly Tile[];
  /** Tiles kept clear in front of doors and openings. */
  clear: readonly Tile[];
  /** Kitchen tiles (floor, stoves and counter), and the dining tiles where things can be placed. */
  kitchenArea: ReadonlySet<number>; dining: ReadonlySet<number>;
  chefSpots: readonly Tile[]; restSpots: readonly Tile[]; promoterSpots: readonly Tile[]; lane: number; laneStart: number; laneEnd: number;
}>;

const range = (from: number, to: number) => Array.from({ length: Math.max(0, to - from) }, (_, index) => from + index);
const cache = new Map<string, Plan>();
export function planFor(size: number, options: { building?: BuildingId; capsule?: Placement | null } = {}): Plan {
  const building = options.building ?? "corner";
  const w = size, d = size + (building === "long" ? 4 : building === "parlour" ? 2 : 0), machine = options.capsule ?? defaultCapsule(w);
  const id = `${size}:${building}:${machine.x},${machine.y},${machine.dir}`;
  let plan = cache.get(id);
  if (plan) return plan;
  const back = building === "townhouse";
  // Kitchen: stoves on the wall, the chef row, then the counter. It reaches the break room in the corner café and parlour.
  const kitchenLength = back ? w - 4 : building === "long" ? size - 4 : d - 4;
  const along = (t: number, depth: number): Tile => back ? { x: t, y: depth } : { x: depth, y: t };
  const middle = Math.floor(kitchenLength / 2);
  const stoves = range(0, kitchenLength).map(t => along(t, 0)), chefRow = range(0, kitchenLength).map(t => along(t, 1));
  const counter = range(0, kitchenLength).map(t => along(t, 2));
  // The kitchen's closing wall, with a door in the chef row.
  const kitchenDoor = along(kitchenLength, 1);
  const walls: Wall[] = [0, 2].map(depth => ({ ...along(kitchenLength, depth), along: back ? "y" as const : "x" as const }));
  const clear: Tile[] = [];
  // Break room in the front-left corner: rows d − 3 … d − 1 at x 0–1, walled on top (y = d − 4) and on the dining side (x = 2).
  const breakRows = range(d - 3, d), breakDoor = { x: 2, y: d - 2 };
  const breakFloor = breakRows.flatMap(y => [{ x: 0, y }, { x: 1, y }]);
  const joined = !back && kitchenLength === d - 4;
  if (!joined) {
    walls.push(...[0, 1, 2].map(x => ({ x, y: d - 4, along: "x" as const })));
    clear.push(back ? { x: kitchenLength + 1, y: 1 } : { x: 1, y: kitchenLength + 1 });
  }
  walls.push(...breakRows.filter(y => y !== breakDoor.y).map(y => ({ x: 2, y, along: "y" as const })));
  clear.push({ x: 3, y: breakDoor.y });
  // The parlour: a half wall across the dining room with one opening near the street door.
  if (building === "parlour") {
    const opening = w - 2;
    walls.push(...range(3, w).filter(x => x !== opening).map(x => ({ x, y: d - 4, along: "x" as const, low: true })));
    clear.push({ x: opening, y: d - 4 }, { x: opening, y: d - 5 }, { x: opening, y: d - 3 });
  }
  const door = { x: w - 1, y: back || building === "long" ? Math.floor(d / 2) : 3 };
  const kitchenFloor = [...chefRow, ...(joined ? [kitchenDoor] : [])];
  const fixed = new Set([...stoves, ...counter, ...kitchenFloor, ...breakFloor, ...walls, breakDoor, kitchenDoor].map(key));
  const dining = new Set<number>();
  for (let y = 0; y < d; y++) for (let x = 0; x < w; x++) if (!fixed.has(key({ x, y }))) dining.add(key({ x, y }));
  plan = Object.freeze({
    size, building, w, d, kitchenSide: back ? "back" as const : "left" as const, kitchenLength,
    door, entry: { x: w, y: door.y },
    pickup: along(middle, 3), pass: along(middle, 2), chefPass: along(middle, 1),
    capsule: { x: machine.x, y: machine.y }, capsuleSpot: { x: machine.x + FACING[machine.dir].x, y: machine.y + FACING[machine.dir].y }, capsuleDir: machine.dir,
    breakDoor, kitchenDoor, stoves, counter, walls, kitchenFloor, breakFloor, clear,
    kitchenArea: new Set([...stoves, ...chefRow, ...counter].map(key)), dining,
    chefSpots: chefRow.filter((_, index) => index % 2 === 0),
    restSpots: breakRows.flatMap(y => [{ x: 1, y }, { x: 0, y }]).filter(tile => !(tile.x === 0 && tile.y === d - 3)),
    promoterSpots: [2, -2, 4, -4].map(offset => ({ x: w, y: door.y + offset })),
    lane: w + 1, laneStart: -3, laneEnd: d + 2,
  });
  cache.set(id, plan);
  return plan;
}

/** A placed item. Tables seat a guest on the tile behind them, facing the table: dir 0 puts the chair at y − 1, dir 1 at x − 1, and so on. */
export type Item = { id: number; kind: ItemKind; x: number; y: number; dir: Dir };
export const seatOf = (item: Pick<Item, "x" | "y" | "dir">): Tile => ({ x: item.x - FACING[item.dir].x, y: item.y - FACING[item.dir].y });
export const DEFAULT_ITEMS: readonly Item[] = [
  { id: 1, kind: "table", x: 5, y: 3, dir: 0 }, { id: 2, kind: "table", x: 7, y: 5, dir: 0 }, { id: 3, kind: "table", x: 5, y: 7, dir: 0 },
];
/** Starting tables for a building (the townhouse's back kitchen needs them a row further forward). */
export const defaultItems = (building: BuildingId): readonly Item[] =>
  building === "townhouse" ? DEFAULT_ITEMS.map(item => ({ ...item, y: item.y + 1 })) : DEFAULT_ITEMS;

export const same = (a: Tile, b: Tile) => a.x === b.x && a.y === b.y;
/** Tiles are keyed with room for the street and the lane's off-screen ends. */
export const key = (tile: Tile) => (tile.y + 8) * 64 + tile.x + 8;
export const fromKey = (id: number): Tile => ({ x: (id % 64) - 8, y: Math.floor(id / 64) - 8 });
export const inside = (tile: Tile, plan: Pick<Plan, "w" | "d">) => tile.x >= 0 && tile.y >= 0 && tile.x < plan.w && tile.y < plan.d;
/** Walkable: the building floor plus the sidewalk strip in front of it. */
export const walkable = (tile: Tile, plan: Plan) => inside(tile, plan)
  || (tile.x >= plan.w && tile.x <= plan.lane && tile.y >= plan.laneStart && tile.y <= plan.laneEnd);
export const inDining = (tile: Tile, plan: Plan) => plan.dining.has(key(tile));

const fixtures = (plan: Plan) => new Set([...plan.stoves, ...plan.counter, ...plan.walls, plan.capsule].map(key));
/** Tiles where nothing may be placed. */
export function isReserved(tile: Tile, plan: Plan) {
  return !inDining(tile, plan) || [plan.door, plan.pickup, plan.capsuleSpot, plan.capsule, ...plan.clear].some(reserved => same(reserved, tile));
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
  const crossing = (a.x < plan.w) !== (b.x < plan.w);
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
    .filter(tile => inDining(tile, plan) && !blocked.has(key(tile)));
}

/** Can guests reach every chair from the street, and staff reach every table, the counter, capsules and the break room? */
export function layoutProblem(items: readonly Item[], plan: Plan): string | null {
  const blocked = blockedTiles(items, plan), open = reachable({ x: plan.lane, y: plan.door.y }, blocked, plan);
  if (!open.has(key(plan.pickup)) || !open.has(key(plan.capsuleSpot))) return "That would wall off the counter or capsule machine.";
  if (!open.has(key(plan.breakDoor))) return "Staff need a path to the break room.";
  if (!open.has(key(plan.kitchenDoor))) return "Chefs need a way out of the kitchen.";
  for (const item of items) if (item.kind === "table") {
    if (!open.has(key(seatOf(item)))) return "Guests couldn't reach that chair.";
    if (!serviceTiles(item, blocked, plan).some(tile => open.has(key(tile)))) return "Staff couldn't reach that table.";
  }
  return null;
}

/** Why the capsule machine can't stand at `machine` (with its use tile on the `dir` side) in `plan`'s building, or null. */
export function capsuleProblem(items: readonly Item[], plan: Plan, machine: Placement): string | null {
  const next = planFor(plan.size, { building: plan.building, capsule: machine }), spots = [next.capsule, next.capsuleSpot];
  if (spots.some(tile => !inDining(tile, next) || [next.door, next.pickup, ...next.clear].some(reserved => same(reserved, tile))))
    return "The machine and the tile you use it from must be in the dining room, clear of the door and counter.";
  if (items.some(item => !isRug(item.kind) && spots.some(tile => same(item, tile) || (item.kind === "table" && same(seatOf(item), tile))))) return "Something is already there.";
  return layoutProblem(items, next);
}

/** Why `candidate` can't go here (ignoring the item being moved), or null when the spot is valid. */
export function placementProblem(items: readonly Item[], candidate: Omit<Item, "id">, plan: Plan, movingId?: number): string | null {
  const others = items.filter(item => item.id !== movingId);
  if (isReserved(candidate, plan)) return inDining(candidate, plan) ? "That tile is kept clear for the door, counter, capsules or break room." : "Place things in the dining room.";
  if (isRug(candidate.kind)) return others.some(item => isRug(item.kind) && same(item, candidate)) ? "There's already a rug here." : null;
  const taken = new Set<number>();
  for (const item of others) if (!isRug(item.kind)) { taken.add(key(item)); if (item.kind === "table") taken.add(key(seatOf(item))); }
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
export function cameraFor(shop: number | Plan): Camera {
  const plan = typeof shop === "number" ? planFor(shop) : shop;
  const points = [project(-0.5, -0.5, 150), project(plan.lane + 2.5, plan.laneStart - 0.5), project(plan.lane + 2.5, plan.laneEnd + 0.5),
    project(-0.5, plan.d - 0.5), project(plan.w - 0.5, plan.d + 0.5)];
  const left = Math.min(...points.map(p => p.x)), right = Math.max(...points.map(p => p.x));
  const top = Math.min(...points.map(p => p.y)), bottom = Math.max(...points.map(p => p.y));
  const zoom = Math.min(1, 940 / (right - left), 560 / (bottom - top));
  return { zoom, x: 480 - (left + right) / 2 * zoom, y: 40 + (560 - (bottom - top) * zoom) / 2 - top * zoom };
}
export const toView = (camera: Camera, point: { x: number; y: number }) => ({ x: point.x * camera.zoom + camera.x, y: point.y * camera.zoom + camera.y });
export const toWorld = (camera: Camera, point: { x: number; y: number }) => ({ x: (point.x - camera.x) / camera.zoom, y: (point.y - camera.y) / camera.zoom });
