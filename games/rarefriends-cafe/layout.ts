/**
 * Shop floor plan on an isometric tile grid. The building is `w × d` tiles (x runs toward the street, y along it); its
 * template sets where the kitchen, break room and any side rooms go. Each expansion adds 2 tiles to both sides.
 *
 *   kitchen       stoves against a back wall, chefs in the next row, closed off by the counter with its pass
 *   break room    always the front-left corner (x 0–1), behind a wall with a door
 *   dining room   every other interior tile: the player's grid
 *   x ≥ w         outside: the sidewalk and street, where Friends walk by and some come in through the front door
 */
import { catalogItem, isRug, isTable, type ItemKind } from "./data.ts";

export type Tile = Readonly<{ x: number; y: number }>;
/** Tile footprint in world pixels; the camera scales the whole plan to fit the view. */
export const TILE_W = 66, TILE_H = 33, ORIGIN_X = 480, ORIGIN_Y = 168;
export const START_SIZE = 10, MAX_SIZE = 20;
/** Largest building extent on either axis (the slim bistro at full size). */
export const MAX_EXTENT = MAX_SIZE + 6;
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

export type BuildingId = "corner" | "long" | "townhouse" | "parlour" | "slim" | "lshape" | "ushape";
export type Building = Readonly<{ id: BuildingId; name: string; text: string; trim: string }>;
export const BUILDINGS: readonly Building[] = [
  { id: "corner", name: "Corner café", text: "Square room. The kitchen runs along the left wall and opens into the break room.", trim: "#d0cdc6" },
  { id: "long", name: "Long diner", text: "Four tiles longer on the street. A short kitchen, and the break room at the far end.", trim: "#ccd3d9" },
  { id: "townhouse", name: "Townhouse", text: "The kitchen is on the back wall, across the room from the break room.", trim: "#d8c6b9" },
  { id: "parlour", name: "Café with parlour", text: "Two tiles deeper. A half wall closes off a front parlour, far from the pass.", trim: "#d9d1c0" },
  { id: "slim", name: "Slim bistro", text: "Narrow and long down the street: a row of tables past a short kitchen.", trim: "#cfd6cc" },
  { id: "lshape", name: "L-shaped café", text: "Two wings round a paved patio on the street corner. The kitchen runs down the left wall.", trim: "#d6cdd8" },
  { id: "ushape", name: "U-shaped café", text: "Wings either side of a back courtyard, with the kitchen in the middle of the U.", trim: "#dccfc1" },
];
export const buildingById = (id: BuildingId) => BUILDINGS.find(item => item.id === id) ?? BUILDINGS[0];
export const isBuilding = (value: unknown): value is BuildingId => BUILDINGS.some(item => item.id === value);

/** An interior wall tile: `along` is the direction it runs; `low` walls are half-height partitions. */
export type Wall = Readonly<{ x: number; y: number; along: "x" | "y"; low?: boolean }>;
export type Plan = Readonly<{
  size: number; building: BuildingId; w: number; d: number;
  door: Tile; entry: Tile; pickup: Tile; pass: Tile; chefPass: Tile; capsule: Tile; capsuleSpot: Tile; capsuleDir: Dir;
  /**
   * Every serving spot on the counter, the main one first: `passes` on the counter, `pickups` in front of them where
   * staff collect, `chefPasses` behind them where chefs plate. The Second pass upgrade adds one.
   */
  passes: readonly Tile[]; pickups: readonly Tile[]; chefPasses: readonly Tile[];
  /** The kitchen stands against the left wall (x = −0.5) or a back wall (running along x) for `kitchenLength` tiles. */
  kitchenSide: "left" | "back"; kitchenLength: number;
  /**
   * Tiles of the `w × d` rectangle that aren't part of the building (the L's patio, the U's courtyard), and their bounds
   * (inclusive), or null for a plain rectangle.
   */
  cut: ReadonlySet<number>; notch: Readonly<{ x0: number; y0: number; x1: number; y1: number }> | null;
  breakDoor: Tile; kitchenDoor: Tile; stoves: readonly Tile[]; counter: readonly Tile[]; walls: readonly Wall[];
  kitchenFloor: readonly Tile[]; breakFloor: readonly Tile[];
  /** Tiles kept clear in front of doors and openings. */
  clear: readonly Tile[];
  /** Kitchen tiles (floor, stoves and counter), and the dining tiles where things can be placed. */
  kitchenArea: ReadonlySet<number>; dining: ReadonlySet<number>;
  chefSpots: readonly Tile[]; restSpots: readonly Tile[]; promoterSpots: readonly Tile[];
  /**
   * The street: the sidewalk runs down the door side (x = w … lane) and, as `side`, along the building's other front (y = d, d + 1) out to `sideStart`.
   * A side road (y = side + 1, side + 2) runs beside it into the main road, with its own far sidewalk at `sideFar`.
   */
  lane: number; laneStart: number; laneEnd: number; side: number; sideStart: number; sideFar: number;
  /** A sidewalk across the road, and the neighbouring shops: closed to you, but Friends come and go through their doors. */
  farLane: number; neighbours: readonly Neighbour[];
}>;
/**
 * A neighbouring building: footprint x0–x1 × y0–y1 (inclusive tiles), its door in the wall facing a sidewalk, and the
 * sidewalk tile in front of the door. `row` says which sidewalk it faces.
 */
export type Neighbour = Readonly<{ x0: number; y0: number; x1: number; y1: number; door: Tile; approach: Tile; row: "far" | "side" | "up"; name: string; style: number }>;
const NEIGHBOUR_NAMES = ["BAKERY", "BOOKS", "FLOWERS", "TEA HOUSE", "RECORDS", "LAUNDRY", "TOYS", "PHARMACY", "BARBER", "GALLERY", "POST", "ARCADE"] as const;

/** Shops across the road (doors facing it), across the side road, and up the street beside the café. */
function neighboursFor(w: number, d: number): Neighbour[] {
  const list: Neighbour[] = [];
  let index = 0;
  const name = () => NEIGHBOUR_NAMES[(index++ + w) % NEIGHBOUR_NAMES.length];
  const lane = w + 1, far = w + 4, sideFar = d + 4;
  for (let y0 = -15; y0 + 5 <= d + 14; y0 += 7) {
    const door = { x: far + 1, y: y0 + 3 };
    list.push({ x0: far + 1, y0, x1: far + 5, y1: y0 + 5, door, approach: { x: far, y: door.y }, row: "far", name: name(), style: index });
  }
  for (let x0 = -15; x0 + 5 <= w - 2; x0 += 7) {
    const door = { x: x0 + 3, y: sideFar + 1 };
    list.push({ x0, y0: sideFar + 1, x1: x0 + 5, y1: sideFar + 5, door, approach: { x: door.x, y: sideFar }, row: "side", name: name(), style: index });
  }
  for (let y0 = -15; y0 + 4 <= -3; y0 += 6) {
    const door = { x: w - 1, y: y0 + 2 };
    list.push({ x0: w - 5, y0, x1: w - 1, y1: y0 + 4, door, approach: { x: lane - 1, y: door.y }, row: "up", name: name(), style: index });
  }
  return list;
}
const range = (from: number, to: number) => Array.from({ length: Math.max(0, to - from) }, (_, index) => from + index);
const cache = new Map<string, Plan>();
export function planFor(size: number, options: { building?: BuildingId; capsule?: Placement | null; passes?: number } = {}): Plan {
  const building = options.building ?? "corner", passCount = options.passes === 2 ? 2 : 1;
  const w = building === "slim" ? size - 2 : building === "lshape" || building === "ushape" ? size + 2 : size;
  const d = size + (building === "long" ? 4 : building === "parlour" || building === "lshape" ? 2 : building === "slim" ? 6 : building === "ushape" ? 1 : 0);
  const machine = options.capsule ?? defaultCapsule(w);
  const id = `${size}:${building}:${machine.x},${machine.y},${machine.dir}:${passCount}`;
  let plan = cache.get(id);
  if (plan) return plan;
  // The L's patio takes the street corner; the U's courtyard is cut into the middle of the back.
  const courtWidth = Math.max(4, Math.floor(w / 3)), courtX = Math.floor((w - courtWidth) / 2), courtDepth = Math.floor(d / 4) + 1;
  const notch = building === "lshape" ? { x0: w - Math.floor(w / 2), y0: d - Math.floor(d / 2), x1: w - 1, y1: d - 1 }
    : building === "ushape" ? { x0: courtX, y0: 0, x1: courtX + courtWidth - 1, y1: courtDepth - 1 } : null;
  const cut = new Set<number>();
  if (notch) for (let y = notch.y0; y <= notch.y1; y++) for (let x = notch.x0; x <= notch.x1; x++) cut.add(key({ x, y }));
  const u = building === "ushape", back = building === "townhouse" || u;
  // Kitchen: stoves on the wall, the chef row, then the counter. It reaches the break room in the corner café, parlour and L.
  // In the U it backs onto the courtyard, walled off at both ends, with a door out into each wing.
  const kitchenLength = u ? courtWidth : back ? w - 4 : building === "long" || building === "slim" ? size - 4 : d - 4;
  const kx = u ? courtX : 0, ky = u ? courtDepth : 0;
  const along = (t: number, depth: number): Tile => back ? { x: kx + t, y: ky + depth } : { x: depth, y: t };
  const middle = Math.floor(kitchenLength / 2);
  // A second pass goes as far along the counter from the first as it can, clear of the station beside it.
  const second = range(0, kitchenLength).filter(t => t !== middle && t !== middle - 1).sort((a, b) => Math.abs(b - middle) - Math.abs(a - middle) || b - a)[0];
  const spots = passCount === 2 && second !== undefined ? [middle, second] : [middle];
  const stoves = range(0, kitchenLength).map(t => along(t, 0)), chefRow = range(0, kitchenLength).map(t => along(t, 1));
  const counter = range(0, kitchenLength).map(t => along(t, 2));
  // The kitchen's closing wall, with a door in the chef row.
  const kitchenDoor = along(kitchenLength, 1);
  const walls: Wall[] = [0, 2].map(depth => ({ ...along(kitchenLength, depth), along: back ? "y" as const : "x" as const }));
  const clear: Tile[] = [];
  if (u) { walls.push(...[0, 2].map(depth => ({ ...along(-1, depth), along: "y" as const }))); clear.push(along(-1, 1), along(-2, 1)); }
  // Break room in the front-left corner: rows d − 3 … d − 1 at x 0–1, walled on top (y = d − 4) and on the dining side (x = 2).
  const breakRows = range(d - 3, d), breakDoor = { x: 2, y: d - 2 };
  const breakFloor = breakRows.flatMap(y => [{ x: 0, y }, { x: 1, y }]);
  const joined = !back && kitchenLength === d - 4;
  if (!joined) {
    walls.push(...[0, 1, 2].map(x => ({ x, y: d - 4, along: "x" as const })));
    clear.push(back ? along(kitchenLength + 1, 1) : { x: 1, y: kitchenLength + 1 });
  }
  walls.push(...breakRows.filter(y => y !== breakDoor.y).map(y => ({ x: 2, y, along: "y" as const })));
  clear.push({ x: 3, y: breakDoor.y });
  // The parlour: a half wall across the dining room with one opening near the street door.
  if (building === "parlour") {
    const opening = w - 2;
    walls.push(...range(3, w).filter(x => x !== opening).map(x => ({ x, y: d - 4, along: "x" as const, low: true })));
    clear.push({ x: opening, y: d - 4 }, { x: opening, y: d - 5 }, { x: opening, y: d - 3 });
  }
  const door = { x: w - 1, y: back || building === "long" || building === "slim" ? Math.floor(d / 2) : 3 };
  const kitchenFloor = [...chefRow, ...(joined ? [kitchenDoor] : [])];
  const fixed = new Set([...stoves, ...counter, ...kitchenFloor, ...breakFloor, ...walls, breakDoor, kitchenDoor].map(key));
  const dining = new Set<number>();
  for (let y = 0; y < d; y++) for (let x = 0; x < w; x++) if (!fixed.has(key({ x, y })) && !cut.has(key({ x, y }))) dining.add(key({ x, y }));
  plan = Object.freeze({
    size, building, w, d, kitchenSide: back ? "back" as const : "left" as const, kitchenLength, cut, notch,
    door, entry: { x: w, y: door.y },
    pickup: along(middle, 3), pass: along(middle, 2), chefPass: along(middle, 1),
    pickups: spots.map(t => along(t, 3)), passes: spots.map(t => along(t, 2)), chefPasses: spots.map(t => along(t, 1)),
    capsule: { x: machine.x, y: machine.y }, capsuleSpot: { x: machine.x + FACING[machine.dir].x, y: machine.y + FACING[machine.dir].y }, capsuleDir: machine.dir,
    breakDoor, kitchenDoor, stoves, counter, walls, kitchenFloor, breakFloor, clear,
    kitchenArea: new Set([...stoves, ...chefRow, ...counter].map(key)), dining,
    // Chefs spread out along the stoves: every other tile first, then the gaps.
    chefSpots: [...chefRow.filter((_, index) => index % 2 === 0), ...chefRow.filter((_, index) => index % 2 === 1)],
    restSpots: breakRows.flatMap(y => [{ x: 1, y }, { x: 0, y }]).filter(tile => !(tile.x === 0 && tile.y === d - 3)),
    promoterSpots: [2, -2, 4, -4, 6, -6, 3, -3, 5, -5].map(offset => ({ x: w, y: door.y + offset })).filter(tile => tile.y >= -2 && tile.y <= d + 1),
    lane: w + 1, laneStart: -16, laneEnd: d + 14, side: d + 1, sideStart: -16, sideFar: d + 4,
    farLane: w + 4, neighbours: neighboursFor(w, d),
  });
  cache.set(id, plan);
  return plan;
}

/** A placed item. Tables seat a guest on the tile behind them, facing the table: dir 0 puts the chair at y − 1, dir 1 at x − 1, and so on. */
export type Item = { id: number; kind: ItemKind; x: number; y: number; dir: Dir };
export const seatOf = (item: Pick<Item, "x" | "y" | "dir">): Tile => ({ x: item.x - FACING[item.dir].x, y: item.y - FACING[item.dir].y });
/** A table's chairs; each chair's `dir` points from the chair to the table (the way its guest faces). Other items have none. */
export type Seat = Readonly<{ x: number; y: number; dir: Dir }>;
export function seatsOf(item: Pick<Item, "kind" | "x" | "y" | "dir">): Seat[] {
  const seats = catalogItem(item.kind).seats ?? 0;
  const sides: Dir[] = seats >= 4 ? [0, 1, 2, 3] : seats === 2 ? [item.dir, ((item.dir + 2) % 4) as Dir] : seats === 1 ? [item.dir] : [];
  return sides.map(dir => ({ x: item.x - FACING[dir].x, y: item.y - FACING[dir].y, dir }));
}
const onSeat = (item: Pick<Item, "kind" | "x" | "y" | "dir">, tile: Tile) => seatsOf(item).some(seat => same(seat, tile));
export const DEFAULT_ITEMS: readonly Item[] = [
  { id: 1, kind: "table", x: 5, y: 3, dir: 0 }, { id: 2, kind: "table", x: 7, y: 5, dir: 0 }, { id: 3, kind: "table", x: 5, y: 7, dir: 0 },
];
/** Starting tables for a building (the townhouse's back kitchen needs them a row further forward). */
export function defaultItems(building: BuildingId, size = START_SIZE): readonly Item[] {
  if (building === "townhouse") return DEFAULT_ITEMS.map(item => ({ ...item, y: item.y + 1 }));
  if (building === "slim") return DEFAULT_ITEMS.map(item => ({ ...item, x: item.x - 1, y: item.y + 1 }));
  if (building === "ushape") {
    // One table in each wing and one in front of the counter, wherever the wings fall at this size.
    const { w, d, notch } = planFor(size, { building });
    return [{ id: 1, kind: "table", x: 1, y: 1, dir: 0 }, { id: 2, kind: "table", x: w - 2, y: 2, dir: 0 }, { id: 3, kind: "table", x: notch!.x0 + 1, y: d - 2, dir: 0 }];
  }
  return DEFAULT_ITEMS;
}

export const same = (a: Tile, b: Tile) => a.x === b.x && a.y === b.y;
/** Tiles are keyed with room for the street and the lane's off-screen ends. */
export const key = (tile: Tile) => (tile.y + 8) * 64 + tile.x + 8;
export const fromKey = (id: number): Tile => ({ x: (id % 64) - 8, y: Math.floor(id / 64) - 8 });
export const inside = (tile: Tile, plan: Pick<Plan, "w" | "d"> & { cut?: ReadonlySet<number> }) =>
  tile.x >= 0 && tile.y >= 0 && tile.x < plan.w && tile.y < plan.d && !plan.cut?.has(key(tile));
/** Walkable: the building floor plus the sidewalk strip in front of it. */
export const walkable = (tile: Tile, plan: Plan) => inside(tile, plan)
  || (tile.x >= plan.w && tile.x <= plan.lane && tile.y >= plan.laneStart && tile.y <= plan.laneEnd)
  || (tile.y >= plan.d && tile.y <= plan.side && tile.x >= plan.sideStart && tile.x < plan.w);
export const inDining = (tile: Tile, plan: Plan) => plan.dining.has(key(tile));

const fixtures = (plan: Plan) => new Set([...plan.stoves, ...plan.counter, ...plan.walls, plan.capsule].map(key));
/** Tiles where nothing may be placed. */
export function isReserved(tile: Tile, plan: Plan) {
  return !inDining(tile, plan) || [plan.door, ...plan.pickups, plan.capsuleSpot, plan.capsule, ...plan.clear].some(reserved => same(reserved, tile));
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
  // Walls separate the building from the sidewalks, except at the front door.
  if (inside(a, plan) === inside(b, plan)) return true;
  return (same(a, plan.door) && same(b, plan.entry)) || (same(a, plan.entry) && same(b, plan.door));
}

const STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
const AROUND = [...STEPS, [1, 1], [1, -1], [-1, 1], [-1, -1]] as const;

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
/** Where a worker stands to serve a table: any open tile around it, diagonals included, but not on its chairs. */
export function serviceTiles(table: Pick<Item, "kind" | "x" | "y" | "dir">, blocked: Set<number>, plan: Plan): Tile[] {
  return AROUND.map(([dx, dy]) => ({ x: table.x + dx, y: table.y + dy }))
    .filter(tile => inDining(tile, plan) && !blocked.has(key(tile)) && !onSeat(table, tile));
}

/** Can guests reach every chair from the street, and staff reach every table, the counter, capsules and the break room? */
export function layoutProblem(items: readonly Item[], plan: Plan): string | null {
  const blocked = blockedTiles(items, plan), open = reachable({ x: plan.lane, y: plan.door.y }, blocked, plan);
  if (plan.pickups.some(tile => !open.has(key(tile))) || !open.has(key(plan.capsuleSpot))) return "That would wall off the counter or capsule machine.";
  if (!open.has(key(plan.breakDoor))) return "Staff need a path to the break room.";
  if (!open.has(key(plan.kitchenDoor))) return "Chefs need a way out of the kitchen.";
  for (const item of items) if (isTable(item.kind)) {
    if (seatsOf(item).some(seat => !open.has(key(seat)))) return "Guests couldn't reach that chair.";
    if (!serviceTiles(item, blocked, plan).some(tile => open.has(key(tile)))) return "Staff couldn't reach that table.";
  }
  return null;
}

/** Why the capsule machine can't stand at `machine` (with its use tile on the `dir` side) in `plan`'s building, or null. */
export function capsuleProblem(items: readonly Item[], plan: Plan, machine: Placement): string | null {
  const next = planFor(plan.size, { building: plan.building, capsule: machine, passes: plan.passes.length }), spots = [next.capsule, next.capsuleSpot];
  if (spots.some(tile => !inDining(tile, next) || [next.door, ...next.pickups, ...next.clear].some(reserved => same(reserved, tile))))
    return "The machine and the tile you use it from must be in the dining room, clear of the door and counter.";
  if (items.some(item => !isRug(item.kind) && spots.some(tile => same(item, tile) || onSeat(item, tile)))) return "Something is already there.";
  return layoutProblem(items, next);
}

/** Why `candidate` can't go here (ignoring the item being moved), or null when the spot is valid. */
export function placementProblem(items: readonly Item[], candidate: Omit<Item, "id">, plan: Plan, movingId?: number): string | null {
  const others = items.filter(item => item.id !== movingId);
  if (isReserved(candidate, plan)) return inDining(candidate, plan) ? "That tile is kept clear for the door, counter, capsules or break room." : "Place things in the dining room.";
  if (isRug(candidate.kind)) return others.some(item => isRug(item.kind) && same(item, candidate)) ? "There's already a rug here." : null;
  const taken = new Set<number>();
  for (const item of others) if (!isRug(item.kind)) { taken.add(key(item)); for (const seat of seatsOf(item)) taken.add(key(seat)); }
  if (taken.has(key(candidate))) return "Something is already there.";
  for (const seat of seatsOf(candidate))
    if (isReserved(seat, plan) || taken.has(key(seat))) return seatsOf(candidate).length > 1 ? "Every chair needs a free tile around the table." : "The chair needs a free tile behind the table. Try rotating.";
  return layoutProblem([...others, { ...candidate, id: -1 }], plan);
}

/**
 * The view can be turned a quarter at a time (0–3). The whole world is drawn turned about the grid origin:
 * turn 1 maps a grid vector (x, y) to (y, −x), so a facing `dir` shows as `dir + turn`.
 */
export type Turn = 0 | 1 | 2 | 3;
export const viewTurn = { r: 0 as Turn };
export function turnView(x: number, y: number): { x: number; y: number } {
  const r = viewTurn.r;
  return r === 0 ? { x, y } : r === 1 ? { x: y, y: -x } : r === 2 ? { x: -x, y: -y } : { x: -y, y: x };
}
export function unturnView(x: number, y: number): { x: number; y: number } {
  const r = viewTurn.r;
  return r === 0 ? { x, y } : r === 1 ? { x: -y, y: x } : r === 2 ? { x: -x, y: -y } : { x: y, y: -x };
}
/** How a world facing looks in the turned view. */
export const viewDir = (dir: Dir) => ((dir + viewTurn.r) % 4) as Dir;
/** Painter's-order depth of a world point in the turned view (larger is nearer the viewer). */
export const depthOf = (x: number, y: number) => { const p = turnView(x, y); return p.x + p.y; };
/** A world direction step for a direction pressed on screen (WASD, arrows) in the turned view. */
export const worldStep = (dx: number, dy: number) => { const p = unturnView(dx, dy); return { dx: Math.round(p.x), dy: Math.round(p.y) }; };

/** World-space projection of a (fractional) grid point, through the view's turn; lift raises it on screen. */
export function project(x: number, y: number, lift = 0) {
  const p = turnView(x, y);
  return { x: ORIGIN_X + (p.x - p.y) * TILE_W / 2, y: ORIGIN_Y + (p.x + p.y) * TILE_H / 2 - lift };
}
export function unproject(sx: number, sy: number) {
  const a = (sx - ORIGIN_X) / (TILE_W / 2), b = (sy - ORIGIN_Y) / (TILE_H / 2);
  return unturnView((a + b) / 2, (b - a) / 2);
}

/** Camera that fits the building, its walls and the street into the 960 × 640 view (with room for the HUD). */
export type Camera = Readonly<{ zoom: number; x: number; y: number }>;
export function cameraFor(shop: number | Plan): Camera {
  const plan = typeof shop === "number" ? planFor(shop) : shop;
  // Frame the building (walls up to their tops) and the street beside it, from whichever side the view is turned;
  // the rest of the world is there to zoom out and pan to.
  const corners = [[-0.5, -0.5], [plan.w - 0.5, -0.5], [plan.w - 0.5, plan.d - 0.5], [-0.5, plan.d - 0.5], [plan.lane + 2.5, -3.5], [plan.lane + 2.5, plan.d + 2.5]] as const;
  const points = corners.flatMap(([x, y]) => [project(x, y, 0), project(x, y, 150)]);
  const left = Math.min(...points.map(p => p.x)), right = Math.max(...points.map(p => p.x));
  const top = Math.min(...points.map(p => p.y)), bottom = Math.max(...points.map(p => p.y));
  const zoom = Math.min(1, 940 / (right - left), 560 / (bottom - top));
  return { zoom, x: 480 - (left + right) / 2 * zoom, y: 40 + (560 - (bottom - top) * zoom) / 2 - top * zoom };
}
export const toView = (camera: Camera, point: { x: number; y: number }) => ({ x: point.x * camera.zoom + camera.x, y: point.y * camera.zoom + camera.y });
export const toWorld = (camera: Camera, point: { x: number; y: number }) => ({ x: (point.x - camera.x) / camera.zoom, y: (point.y - camera.y) / camera.zoom });
