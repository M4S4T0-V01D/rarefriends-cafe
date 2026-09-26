/** Shop floor plan on an 11 × 11 isometric tile grid: fixed fixtures, player-placed items, routing and placement rules. */
import { catalogItem, type ItemKind } from "./data.ts";

export type Tile = Readonly<{ x: number; y: number }>;
export const GRID = 11;
/** Tile footprint in reference-viewport pixels; the shop is drawn with a fixed camera. */
export const TILE_W = 66, TILE_H = 33, ORIGIN_X = 480, ORIGIN_Y = 168;

export const DOOR: Tile = { x: 9, y: 0 };
/** Where orders are handed over. Workers stand here to pick up ready dishes. */
export const PICKUP: Tile = { x: 2, y: 3 };
export const COUNTER: readonly Tile[] = [1, 2, 3, 4, 5].map(y => ({ x: 1, y }));
export const KITCHEN: readonly Tile[] = [0, 1, 2, 3, 4, 5, 6].map(y => ({ x: 0, y }));
export const CAPSULE_MACHINE: Tile = { x: 10, y: 1 };
export const CAPSULE_SPOT: Tile = { x: 9, y: 1 };

/** A placed item. Tables seat a guest on the tile behind them: dir 0 = up-right (y − 1), dir 1 = up-left (x − 1). */
export type Item = { id: number; kind: ItemKind; x: number; y: number; dir: 0 | 1 };
export const seatOf = (item: Pick<Item, "x" | "y" | "dir">): Tile => item.dir === 0 ? { x: item.x, y: item.y - 1 } : { x: item.x - 1, y: item.y };
export const DEFAULT_ITEMS: readonly Item[] = [
  { id: 1, kind: "table", x: 4, y: 3, dir: 0 }, { id: 2, kind: "table", x: 7, y: 3, dir: 0 }, { id: 3, kind: "table", x: 4, y: 6, dir: 0 },
];

export const key = (tile: Tile) => tile.y * GRID + tile.x;
export const inside = (tile: Tile) => tile.x >= 0 && tile.y >= 0 && tile.x < GRID && tile.y < GRID;
export const same = (a: Tile, b: Tile) => a.x === b.x && a.y === b.y;
const FIXTURES = new Set([...COUNTER, ...KITCHEN, CAPSULE_MACHINE].map(key));
/** Tiles where nothing may be placed: fixtures plus the door, pickup and capsule spots. */
const RESERVED = new Set([...FIXTURES, key(DOOR), key(PICKUP), key(CAPSULE_SPOT)]);
export const isReserved = (tile: Tile) => RESERVED.has(key(tile));

/** Blocked tiles for routing. Seats and rugs stay walkable. */
export function blockedTiles(items: readonly Item[]): Set<number> {
  const blocked = new Set(FIXTURES);
  for (const item of items) if (catalogItem(item.kind).blocks) blocked.add(key(item));
  return blocked;
}

const STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

/** Breadth-first route to the nearest goal tile. Returns tiles after `from`, or null when unreachable. */
export function route(from: Tile, goals: readonly Tile[], blocked: Set<number>): Tile[] | null {
  const start = { x: Math.round(from.x), y: Math.round(from.y) };
  const targets = new Set(goals.filter(inside).map(key));
  if (!targets.size) return null;
  if (targets.has(key(start))) return [];
  const previous = new Map<number, number>([[key(start), -1]]);
  const queue: Tile[] = [start];
  for (let head = 0; head < queue.length; head++) {
    const tile = queue[head];
    for (const [dx, dy] of STEPS) {
      const next = { x: tile.x + dx, y: tile.y + dy }, id = key(next);
      if (!inside(next) || previous.has(id) || (blocked.has(id) && !targets.has(id))) continue;
      previous.set(id, key(tile));
      if (targets.has(id)) {
        const path: Tile[] = [];
        for (let at = id; at !== key(start); at = previous.get(at)!) path.unshift({ x: at % GRID, y: Math.floor(at / GRID) });
        return path;
      }
      queue.push(next);
    }
  }
  return null;
}

function reachable(from: Tile, blocked: Set<number>): Set<number> {
  const seen = new Set([key(from)]), queue = [from];
  for (let head = 0; head < queue.length; head++) for (const [dx, dy] of STEPS) {
    const next = { x: queue[head].x + dx, y: queue[head].y + dy };
    if (inside(next) && !seen.has(key(next)) && !blocked.has(key(next))) { seen.add(key(next)); queue.push(next); }
  }
  return seen;
}

/** Walkable tiles next to a table, where a worker stands to take orders or serve. */
export function serviceTiles(table: Tile, blocked: Set<number>): Tile[] {
  return STEPS.map(([dx, dy]) => ({ x: table.x + dx, y: table.y + dy }))
    .filter(tile => inside(tile) && !blocked.has(key(tile)));
}

/** Can every guest reach a seat, and can staff reach every table, the counter and the capsule machine? */
export function layoutProblem(items: readonly Item[]): string | null {
  const blocked = blockedTiles(items), open = reachable(DOOR, blocked);
  if (!open.has(key(PICKUP)) || !open.has(key(CAPSULE_SPOT))) return "That would wall off the counter or capsule machine.";
  for (const item of items) if (item.kind === "table") {
    if (!open.has(key(seatOf(item)))) return "Guests couldn't reach that chair.";
    if (!serviceTiles(item, blocked).some(tile => open.has(key(tile)))) return "Staff couldn't reach that table.";
  }
  return null;
}

/** Why `candidate` can't go here (ignoring the item being moved), or null when the spot is valid. */
export function placementProblem(items: readonly Item[], candidate: Omit<Item, "id">, movingId?: number): string | null {
  const others = items.filter(item => item.id !== movingId);
  if (!inside(candidate) || isReserved(candidate)) return "That tile is reserved for the door, counter or capsule machine.";
  if (candidate.kind === "rug") return others.some(item => item.kind === "rug" && same(item, candidate)) ? "There's already a rug here." : null;
  const taken = new Set<number>();
  for (const item of others) if (item.kind !== "rug") { taken.add(key(item)); if (item.kind === "table") taken.add(key(seatOf(item))); }
  if (taken.has(key(candidate))) return "Something is already there.";
  if (candidate.kind === "table") {
    const seat = seatOf(candidate);
    if (!inside(seat) || isReserved(seat) || taken.has(key(seat))) return "The chair needs a free tile behind the table. Try rotating.";
  }
  return layoutProblem([...others, { ...candidate, id: -1 }]);
}

/** Reference-viewport projection of a (fractional) grid point; lift raises it on screen. */
export function project(x: number, y: number, lift = 0) {
  return { x: ORIGIN_X + (x - y) * TILE_W / 2, y: ORIGIN_Y + (x + y) * TILE_H / 2 - lift };
}
export function unproject(sx: number, sy: number) {
  const a = (sx - ORIGIN_X) / (TILE_W / 2), b = (sy - ORIGIN_Y) / (TILE_H / 2);
  return { x: (a + b) / 2, y: (b - a) / 2 };
}
