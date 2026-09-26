/** Café floor plan on an 11 × 11 isometric grid, plus collision-checked grid routing. */

export type Tile = Readonly<{ x: number; y: number }>;
export const GRID = 11;
/** Tile footprint in reference-viewport pixels; the café is drawn with a fixed camera. */
export const TILE_W = 66, TILE_H = 33, ORIGIN_X = 480, ORIGIN_Y = 168;

export const DOOR: Tile = { x: 9, y: 0 };
/** Where orders are handed over. Workers stand here to pick up ready dishes. */
export const PICKUP: Tile = { x: 2, y: 3 };
export const COUNTER: readonly Tile[] = [1, 2, 3, 4, 5].map(y => ({ x: 1, y }));
export const KITCHEN: readonly Tile[] = [0, 1, 2, 3, 4, 5, 6].map(y => ({ x: 0, y }));
export const CAPSULE_MACHINE: Tile = { x: 10, y: 1 };
export const CAPSULE_SPOT: Tile = { x: 9, y: 1 };
/** Table slots in unlock order; each guest sits on the tile behind (up-right of) its table. */
export const TABLES: readonly Readonly<{ table: Tile; seat: Tile }>[] = [
  [4, 3], [7, 3], [4, 6], [7, 6], [4, 9], [7, 9], [10, 5], [10, 8],
].map(([x, y]) => ({ table: { x, y }, seat: { x, y: y - 1 } }));
/** Decor that occupies floor tiles, keyed by the ambience level that adds it. */
export const DECOR_TILES: readonly Readonly<{ level: number; tile: Tile; kind: "plant" | "record" | "lamp" }>[] = [
  { level: 1, tile: { x: 0, y: 10 }, kind: "plant" },
  { level: 1, tile: { x: 10, y: 10 }, kind: "plant" },
  { level: 3, tile: { x: 0, y: 8 }, kind: "lamp" },
  { level: 4, tile: { x: 2, y: 10 }, kind: "record" },
];

export const key = (tile: Tile) => tile.y * GRID + tile.x;
export const inside = (tile: Tile) => tile.x >= 0 && tile.y >= 0 && tile.x < GRID && tile.y < GRID;
export const same = (a: Tile, b: Tile) => a.x === b.x && a.y === b.y;

/** Blocked tiles for the current furniture. Seats stay walkable so guests can reach them. */
export function blockedTiles(tables: number, decor: number): Set<number> {
  const blocked = new Set<number>();
  for (const tile of [...COUNTER, ...KITCHEN, CAPSULE_MACHINE]) blocked.add(key(tile));
  for (let index = 0; index < tables; index++) blocked.add(key(TABLES[index].table));
  for (const item of DECOR_TILES) if (item.level <= decor) blocked.add(key(item.tile));
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

/** Walkable tiles next to a table, where a worker stands to take orders or serve. */
export function serviceTiles(table: Tile, blocked: Set<number>): Tile[] {
  return STEPS.map(([dx, dy]) => ({ x: table.x + dx, y: table.y + dy }))
    .filter(tile => inside(tile) && !blocked.has(key(tile)));
}

/** Reference-viewport projection of a (fractional) grid point; lift raises it on screen. */
export function project(x: number, y: number, lift = 0) {
  return { x: ORIGIN_X + (x - y) * TILE_W / 2, y: ORIGIN_Y + (x + y) * TILE_H / 2 - lift };
}
export function unproject(sx: number, sy: number) {
  const a = (sx - ORIGIN_X) / (TILE_W / 2), b = (sy - ORIGIN_Y) / (TILE_H / 2);
  return { x: (a + b) / 2, y: (b - a) / 2 };
}
