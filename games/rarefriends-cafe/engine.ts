/**
 * RareFriends Cafe simulation. Pure and deterministic for a given random source, so it runs in Node tests.
 * Beans, levels, staff and furniture are in-shop progress for this session only; the SDK runtime owns RF.
 */
import {
  AMBIENCE_LEVELS, BLEND_BONUSES, CATALOG, SHOPS, DAY_LENGTH, EAT_TIME, FLOORS, FOOD_PATIENCE, LEVEL_XP, MACHINE_COSTS, MAX_LEVEL, MAX_STAFF_SLOTS,
  ORDER_PATIENCE, OWNED_STAFF_BONUS, SELL_REFUND, START_STAFF_SLOTS, STAFF_SLOT_COSTS, STAFF_SLOT_LEVELS, WALLPAPERS,
  catalogItem, dishById, machineFactor, shopById, tableLimit, type DishId, type ItemKind, type ShopId,
} from "./data.ts";
import {
  CAPSULE_SPOT, DEFAULT_ITEMS, DOOR, PICKUP, blockedTiles, key, layoutProblem, placementProblem, route, same, seatOf, serviceTiles,
  type Item, type Tile,
} from "./layout.ts";

export type Facing = "down" | "up" | "left" | "right";
export type Walker = { x: number; y: number; path: Tile[]; speed: number; facing: Facing; moving: boolean };
export type CustomerState = "arriving" | "waiting" | "ordered" | "eating" | "leaving";
export type Customer = {
  id: number; name: string; guest: number; regular: number | null; vip: boolean; walker: Walker;
  /** Id of the table item the guest sits at. */
  table: number;
  state: CustomerState; dish: DishId | null; patience: number; patienceMax: number; eat: number;
  claimed: number | null; mood: "happy" | "ok" | "angry" | null; paid: number;
};
export type Order = {
  id: number; customer: number; dish: DishId; state: "queued" | "cooking" | "ready" | "carried";
  progress: number; duration: number; carrier: number | null;
};
export type Job = { kind: "take"; customer: number } | { kind: "pickup" } | { kind: "serve"; customer: number } | { kind: "walk"; to: Tile };
/** Who fills a staff slot: one of the player's own verified Friends, or a guest Friend applicant. */
export type StaffWho = { owned: number } | { guest: number };
export type StaffRole = "waiter" | "chef";
export type StaffMember = { slot: number; who: StaffWho; role: StaffRole };
export type Worker = {
  id: number; role: "manager" | "waiter"; walker: Walker; carrying: number[]; queue: Job[]; job: Job | null;
  action: number; home: Tile; who: StaffWho | null;
};
export type CafeEvent =
  | { kind: "coins"; amount: number; x: number; y: number; vip: boolean; double: boolean }
  | { kind: "ready"; dish: DishId } | { kind: "order"; x: number; y: number } | { kind: "angry"; x: number; y: number }
  | { kind: "arrive" } | { kind: "levelup"; level: number } | { kind: "dayEnd" };
export type DayStats = { served: number; lost: number; beans: number; tips: number; vips: number; best: number };
export type Phase = "intro" | "open" | "summary";

export type CafeState = {
  phase: Phase; shop: ShopId; started: boolean; day: number; clock: number; beans: number; xp: number; level: number; rating: number;
  machine: number; unlocked: Set<DishId>; blends: number[]; familyId: number; guestCount: number; regulars: number[];
  items: Item[]; wallpaper: string; floor: string; finishes: Set<string>;
  staffSlots: number; staff: StaffMember[]; ownedFriends: number[]; applicants: number[];
  customers: Customer[]; orders: Order[]; workers: Worker[]; events: CafeEvent[];
  spawn: number; nextId: number; blocked: Set<number>; manual: { dx: number; dy: number } | null;
  today: DayStats; totalServed: number; rng: () => number;
};

const perk = (state: CafeState, family: number) => state.familyId === family;
const emptyDay = (): DayStats => ({ served: 0, lost: 0, beans: 0, tips: 0, vips: 0, best: 0 });
const walker = (tile: Tile, speed: number): Walker => ({ x: tile.x, y: tile.y, path: [], speed, facing: "down", moving: false });
const byId = <T extends { id: number }>(items: readonly T[], id: number) => items.find(item => item.id === id);
const at = (body: Walker): Tile => ({ x: Math.round(body.x), y: Math.round(body.y) });

export function createCafe(options: {
  familyId: number; guestCount: number; regulars?: number[]; ownedFriends?: number[]; shop?: ShopId; rng?: () => number;
}): CafeState {
  const guestCount = Math.max(1, options.guestCount);
  const state: CafeState = {
    phase: "intro", shop: options.shop ?? "cafe", started: false, day: 1, clock: 0, beans: 30, xp: 0, level: 1, rating: 3.5,
    machine: 0, unlocked: new Set(), blends: [0, 0, 0, 0], familyId: options.familyId, guestCount, regulars: options.regulars ?? [],
    items: DEFAULT_ITEMS.map(item => ({ ...item })), wallpaper: "plain", floor: "checker", finishes: new Set(["plain", "checker"]),
    staffSlots: START_STAFF_SLOTS, staff: [], ownedFriends: [...new Set(options.ownedFriends ?? [])],
    applicants: Array.from({ length: Math.min(6, guestCount) }, (_, index) => (index * 5 + 3) % guestCount),
    customers: [], orders: [], workers: [], events: [], spawn: 1.2, nextId: 100, blocked: new Set(), manual: null,
    today: emptyDay(), totalServed: 0, rng: options.rng ?? Math.random,
  };
  state.blocked = blockedTiles(state.items);
  chooseShop(state, state.shop);
  if (perk(state, 7)) state.rating = 4;
  state.workers.push({ id: 0, role: "manager", walker: walker(PICKUP, managerSpeed(state)), carrying: [], queue: [], job: null, action: 0, home: PICKUP, who: null });
  return state;
}

/** Pick the kind of shop. Allowed before the first day opens; resets the menu to that shop's starters. */
export function chooseShop(state: CafeState, shop: ShopId): string | null {
  if (state.started || state.phase !== "intro") return "The shop type is chosen before the first day.";
  state.shop = shop;
  state.unlocked = new Set(shopById(shop).menu.filter(dish => dish.blend === undefined && dish.unlockCost === 0).map(dish => dish.id));
  return null;
}

export const manager = (state: CafeState) => state.workers[0];
const managerSpeed = (state: CafeState) => 3.3 * (perk(state, 5) ? 1.3 : 1);
const isOwned = (who: StaffWho | null): who is { owned: number } => Boolean(who && "owned" in who);
const helperSpeed = (state: CafeState, worker: Worker) => 2.5 * (perk(state, 2) ? 1.25 : 1) * (isOwned(worker.who) ? OWNED_STAFF_BONUS.speed : 1);
export const carryCapacity = (state: CafeState, worker: Worker) =>
  worker.role === "manager" ? (perk(state, 3) ? 3 : 2) : isOwned(worker.who) ? OWNED_STAFF_BONUS.carry : 1;
export const chefs = (state: CafeState) => state.staff.filter(member => member.role === "chef");
export const kitchenSlots = (state: CafeState) => 1 + chefs(state).length;
export const tables = (state: CafeState) => state.items.filter(item => item.kind === "table");

export function ambiencePoints(state: CafeState) {
  const finish = (WALLPAPERS.find(item => item.id === state.wallpaper)?.ambience ?? 0) + (FLOORS.find(item => item.id === state.floor)?.ambience ?? 0);
  return finish + state.items.reduce((sum, item) => sum + catalogItem(item.kind).ambience, 0);
}
/** Ambience level 0–5 from placed décor, wallpaper and floor. */
export const ambience = (state: CafeState) => AMBIENCE_LEVELS.filter(points => ambiencePoints(state) >= points).length;

const patienceMultiplier = (state: CafeState) => (1 + 0.06 * ambience(state)) * (perk(state, 6) ? 1.25 : 1) * (state.blends[2] > 0 ? 1.1 : 1);
export function cookTime(state: CafeState, dish: DishId) {
  const ownedChefs = chefs(state).filter(member => isOwned(member.who)).length;
  return dishById(dish).cook * machineFactor(state.machine) * (perk(state, 0) ? 0.85 : 1) * Math.max(0.7, OWNED_STAFF_BONUS.cook ** ownedChefs);
}

export function availableDishes(state: CafeState): DishId[] {
  return shopById(state.shop).menu.filter(dish => dish.blend === undefined ? state.unlocked.has(dish.id) : state.blends[dish.blend] > 0).map(dish => dish.id);
}
export const customerAt = (state: CafeState, tableId: number) => state.customers.find(customer => customer.table === tableId);

/** Kept capsule recipes from the SDK snapshot's inventory drive shop bonuses. */
export function setBlends(state: CafeState, counts: readonly number[]) {
  state.blends = [0, 1, 2, 3].map(index => Math.max(0, Math.floor(counts[index] ?? 0)));
}

// ---------- Beans purchases ----------
export type Purchase = "machine" | "slot";
export function purchaseCost(state: CafeState, item: Purchase): number | null {
  return (item === "machine" ? MACHINE_COSTS[state.machine] : STAFF_SLOT_COSTS[state.staffSlots - START_STAFF_SLOTS]) ?? null;
}
export function purchaseLevel(state: CafeState, item: Purchase): number {
  return item === "slot" ? STAFF_SLOT_LEVELS[state.staffSlots - START_STAFF_SLOTS] ?? MAX_LEVEL : 1;
}
export function buy(state: CafeState, item: Purchase): string | null {
  const cost = purchaseCost(state, item);
  if (cost === null || (item === "slot" && state.staffSlots >= MAX_STAFF_SLOTS)) return "Fully upgraded.";
  if (state.level < purchaseLevel(state, item)) return `Reach level ${purchaseLevel(state, item)} first.`;
  if (state.beans < cost) return "Not enough Beans.";
  state.beans -= cost;
  if (item === "machine") state.machine++; else state.staffSlots++;
  return null;
}
export function unlockDish(state: CafeState, id: DishId): string | null {
  const dish = dishById(id);
  if (dish.blend !== undefined) return `Keep a ${BLEND_BONUSES[dish.blend].name} from a Rare Recipe Capsule to serve this.`;
  if (state.unlocked.has(id)) return "Already on the menu.";
  if (state.level < dish.level) return `Reach level ${dish.level} first.`;
  if (state.beans < dish.unlockCost) return "Not enough Beans.";
  state.beans -= dish.unlockCost; state.unlocked.add(id);
  return null;
}

// ---------- Staff ----------
const sameWho = (a: StaffWho, b: StaffWho) => ("owned" in a && "owned" in b && a.owned === b.owned) || ("guest" in a && "guest" in b && a.guest === b.guest);
export const staffAt = (state: CafeState, slot: number) => state.staff.find(member => member.slot === slot) ?? null;
/** Put a Friend in a staff slot (or clear it with null). Owned Friends must come from the verified roster. */
export function assignStaff(state: CafeState, slot: number, who: StaffWho | null, role: StaffRole = "waiter"): string | null {
  if (!Number.isInteger(slot) || slot < 0 || slot >= state.staffSlots) return "Unlock that staff slot first.";
  if (who && "owned" in who && !state.ownedFriends.includes(who.owned)) return "Only Friends you own can join as your staff.";
  if (who && "guest" in who && !state.applicants.includes(who.guest)) return "That applicant isn't available.";
  state.staff = state.staff.filter(member => member.slot !== slot && !(who && sameWho(member.who, who)));
  if (who) state.staff.push({ slot, who, role });
  state.staff.sort((a, b) => a.slot - b.slot);
  syncWorkers(state);
  return null;
}
export function setStaffRole(state: CafeState, slot: number, role: StaffRole): string | null {
  const member = staffAt(state, slot);
  if (!member) return "That slot is empty.";
  member.role = role; syncWorkers(state);
  return null;
}
function freeHome(state: CafeState, index: number): Tile {
  const candidates = [{ x: 3, y: 7 }, { x: 3, y: 9 }, { x: 2, y: 8 }, { x: 6, y: 10 }, { x: 5, y: 1 }, { x: 2, y: 6 }, { x: 3, y: 1 }];
  const free = candidates.filter(tile => !state.blocked.has(key(tile)));
  return free[index % Math.max(1, free.length)] ?? PICKUP;
}
/** Waiter staff walk the floor as workers; chefs work in the kitchen. */
function syncWorkers(state: CafeState) {
  const waiters = state.staff.filter(member => member.role === "waiter");
  const keep: Worker[] = [manager(state)];
  waiters.forEach((member, index) => {
    const existing = state.workers.find(worker => worker.role === "waiter" && worker.who && sameWho(worker.who, member.who));
    const worker = existing ?? { id: 0, role: "waiter" as const, walker: walker(DOOR, 2.5), carrying: [], queue: [], job: null, action: 0, home: PICKUP, who: member.who };
    worker.id = index + 1; worker.home = freeHome(state, index);
    keep.push(worker);
  });
  for (const worker of state.workers) if (!keep.includes(worker)) {
    release(state, worker.job, worker.id);
    for (const id of worker.carrying) { const order = byId(state.orders, id); if (order) { order.state = "ready"; order.carrier = null; } }
  }
  // Ids moved, so re-point claims and carried dishes at the kept workers.
  for (const customer of state.customers) if (customer.claimed !== null && customer.claimed !== 0) customer.claimed = null;
  for (const worker of keep) {
    if (worker.role === "waiter") { if (worker.job?.kind === "take") worker.job = null; }
    for (const id of worker.carrying) { const order = byId(state.orders, id); if (order) order.carrier = worker.id; }
  }
  state.workers = keep;
}
export function setOwnedFriends(state: CafeState, ids: readonly number[]) {
  state.ownedFriends = [...new Set(ids)];
  state.staff = state.staff.filter(member => !("owned" in member.who) || state.ownedFriends.includes(member.who.owned));
  syncWorkers(state);
}

// ---------- Build mode ----------
export const tableCount = (state: CafeState) => tables(state).length;
const occupiedTable = (state: CafeState, id: number) => state.customers.some(customer => customer.table === id);
function occupiedByGuest(state: CafeState, tile: Tile) {
  return state.customers.some(customer => same(at(customer.walker), tile) || (customer.walker.path.at(-1) && same(customer.walker.path.at(-1)!, tile)));
}
export function itemAt(state: CafeState, tile: Tile): Item | undefined {
  return state.items.find(item => item.kind !== "rug" && (same(item, tile) || (item.kind === "table" && same(seatOf(item), tile))))
    ?? state.items.find(item => item.kind === "rug" && same(item, tile));
}
function afterLayoutChange(state: CafeState) {
  state.blocked = blockedTiles(state.items);
  for (const worker of state.workers) {
    if (state.blocked.has(key(at(worker.walker)))) { worker.walker.x = PICKUP.x; worker.walker.y = PICKUP.y; }
    worker.walker.path = [];
    if (worker.job) replan(state, worker);
  }
  state.workers.slice(1).forEach((worker, index) => { worker.home = freeHome(state, index); });
  for (const customer of state.customers) {
    const table = byId(state.items, customer.table);
    if (customer.state === "arriving" && table) customer.walker.path = route(at(customer.walker), [seatOf(table)], state.blocked) ?? [seatOf(table)];
    if (customer.state === "leaving") customer.walker.path = route(at(customer.walker), [DOOR], state.blocked) ?? [];
  }
}
/** Place a new item bought with Beans. */
export function placeItem(state: CafeState, kind: ItemKind, tile: Tile, dir: 0 | 1 = 0): string | null {
  const entry = catalogItem(kind);
  if (kind === "table" && tableCount(state) >= tableLimit(state.level)) return `Level ${state.level} allows ${tableLimit(state.level)} tables. Level up for more.`;
  if (state.beans < entry.cost) return "Not enough Beans.";
  const candidate = { kind, x: tile.x, y: tile.y, dir };
  if (occupiedByGuest(state, tile) || (kind === "table" && occupiedByGuest(state, seatOf(candidate)))) return "A guest is standing there.";
  const problem = placementProblem(state.items, candidate);
  if (problem) return problem;
  state.beans -= entry.cost;
  state.items.push({ id: state.nextId++, ...candidate });
  afterLayoutChange(state);
  return null;
}
/** Move (and optionally rotate) an item for free. */
export function moveItem(state: CafeState, id: number, tile: Tile, dir?: 0 | 1): string | null {
  const item = byId(state.items, id);
  if (!item) return "That item is gone.";
  if (item.kind === "table" && occupiedTable(state, id)) return "A guest is using that table.";
  const candidate = { kind: item.kind, x: tile.x, y: tile.y, dir: dir ?? item.dir };
  if (occupiedByGuest(state, tile) || (item.kind === "table" && occupiedByGuest(state, seatOf(candidate)))) return "A guest is standing there.";
  const problem = placementProblem(state.items, candidate, id);
  if (problem) return problem;
  Object.assign(item, candidate);
  afterLayoutChange(state);
  return null;
}
/** Sell an item back for half its price. The shop always keeps at least one table. */
export function sellItem(state: CafeState, id: number): string | null {
  const item = byId(state.items, id);
  if (!item) return "That item is gone.";
  if (item.kind === "table" && occupiedTable(state, id)) return "A guest is using that table.";
  if (item.kind === "table" && tableCount(state) <= 1) return "Keep at least one table.";
  state.items = state.items.filter(other => other !== item);
  state.beans += Math.floor(catalogItem(item.kind).cost * SELL_REFUND);
  afterLayoutChange(state);
  return null;
}
/** Buy (first time) or switch to a wallpaper or floor design. */
export function applyFinish(state: CafeState, surface: "wallpaper" | "floor", id: string): string | null {
  const finish = (surface === "wallpaper" ? WALLPAPERS : FLOORS).find(item => item.id === id);
  if (!finish) return "Unknown design.";
  if (!state.finishes.has(id)) {
    if (state.beans < finish.cost) return "Not enough Beans.";
    state.beans -= finish.cost; state.finishes.add(id);
  }
  state[surface] = id;
  return null;
}

// ---------- Day flow ----------
export function openCafe(state: CafeState) {
  if (state.phase === "open") return;
  if (state.phase === "summary") { state.day++; state.today = emptyDay(); }
  state.phase = "open"; state.started = true; state.clock = 0; state.spawn = 1.2;
}

// ---------- Save / restore (per wallet, stored by the trusted host) ----------
export const SAVE_VERSION = 1;
export type CafeSave = {
  v: number; shop: ShopId; day: number; beans: number; xp: number; level: number; rating: number; machine: number;
  unlocked: string[]; items: { kind: ItemKind; x: number; y: number; dir: 0 | 1 }[]; wallpaper: string; floor: string; finishes: string[];
  staffSlots: number; staff: { slot: number; owned?: number; guest?: number; role: StaffRole }[]; totalServed: number;
};
/** Long-term progress only. A day in progress resumes from its start; a closed day resumes at the next one. */
export function serializeCafe(state: CafeState): CafeSave | null {
  if (!state.started) return null;
  return {
    v: SAVE_VERSION, shop: state.shop, day: state.phase === "summary" ? state.day + 1 : state.day, beans: state.beans, xp: state.xp, level: state.level, rating: Math.round(state.rating * 100) / 100,
    machine: state.machine, unlocked: [...state.unlocked], items: state.items.map(({ kind, x, y, dir }) => ({ kind, x, y, dir })),
    wallpaper: state.wallpaper, floor: state.floor, finishes: [...state.finishes], staffSlots: state.staffSlots,
    staff: state.staff.map(member => ({ slot: member.slot, role: member.role, ...member.who })), totalServed: state.totalServed,
  };
}
const int = (value: unknown, min: number, max: number) => typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
/** Apply a save before the first day opens. Invalid or tampered-looking saves are rejected whole. */
export function restoreCafe(state: CafeState, input: unknown): boolean {
  if (state.started || state.phase !== "intro" || !input || typeof input !== "object") return false;
  const save = input as Partial<CafeSave>;
  const shop = SHOPS.find(item => item.id === save.shop);
  if (save.v !== SAVE_VERSION || !shop || !int(save.day, 1, 1e6) || !int(save.beans, 0, 1e9) || !int(save.xp, 0, 1e9) || !int(save.level, 1, MAX_LEVEL)
    || typeof save.rating !== "number" || !(save.rating >= 1 && save.rating <= 5) || !int(save.machine, 0, MACHINE_COSTS.length)
    || !int(save.staffSlots, START_STAFF_SLOTS, MAX_STAFF_SLOTS) || !int(save.totalServed, 0, 1e9)
    || !Array.isArray(save.unlocked) || !Array.isArray(save.items) || !Array.isArray(save.finishes) || !Array.isArray(save.staff)) return false;
  const menu = new Set<string>(shop.menu.map(dish => dish.id));
  if (!save.unlocked.every(id => typeof id === "string" && menu.has(id))) return false;
  const finishIds = new Set([...WALLPAPERS, ...FLOORS].map(item => item.id));
  if (!save.finishes.every(id => typeof id === "string" && finishIds.has(id)) || !save.finishes.includes(save.wallpaper!) || !save.finishes.includes(save.floor!)
    || !WALLPAPERS.some(item => item.id === save.wallpaper) || !FLOORS.some(item => item.id === save.floor)) return false;
  const kinds = new Set(CATALOG.map(item => item.kind));
  if (save.items.length > 121 || !save.items.every(item => item && kinds.has(item.kind) && int(item.x, 0, 10) && int(item.y, 0, 10) && (item.dir === 0 || item.dir === 1))) return false;
  // Rebuild the layout one item at a time so the saved room obeys the same placement rules.
  const items: Item[] = [];
  for (const [index, item] of save.items.entries()) {
    if (placementProblem(items, item)) return false;
    items.push({ id: index + 1, kind: item.kind, x: item.x, y: item.y, dir: item.dir });
  }
  if (!items.some(item => item.kind === "table") || layoutProblem(items)) return false;
  Object.assign(state, {
    shop: shop.id, started: true, day: save.day, beans: save.beans, xp: save.xp, level: save.level, rating: save.rating, machine: save.machine,
    unlocked: new Set(save.unlocked), items, wallpaper: save.wallpaper, floor: save.floor, finishes: new Set(save.finishes),
    staffSlots: save.staffSlots, totalServed: save.totalServed, staff: [], nextId: Math.max(state.nextId, items.length + 100),
  });
  state.blocked = blockedTiles(state.items);
  for (const member of save.staff) {
    const who: StaffWho | null = int(member?.owned, 1, Number.MAX_SAFE_INTEGER) ? { owned: member.owned! } : int(member?.guest, 0, 1e6) ? { guest: member.guest! } : null;
    if (who && (member.role === "waiter" || member.role === "chef")) state.staff.push({ slot: member.slot, who, role: member.role });
  }
  // Staff are re-checked against the current roster (set it first) and applicants; missing Friends drop out.
  state.staff = state.staff.filter((member, index, all) => int(member.slot, 0, state.staffSlots - 1) && all.findIndex(other => other.slot === member.slot) === index
    && ("owned" in member.who ? state.ownedFriends.includes(member.who.owned) : state.applicants.includes(member.who.guest)));
  syncWorkers(state);
  return true;
}
export const dayProgress = (state: CafeState) => Math.min(1, state.clock / DAY_LENGTH);
export const isClosing = (state: CafeState) => state.clock >= DAY_LENGTH;

// ---------- Player intent ----------
function claimFor(state: CafeState, job: Job, workerId: number) {
  if (job.kind === "take") { const customer = byId(state.customers, job.customer); if (customer) customer.claimed = workerId; }
}
function release(state: CafeState, job: Job | null, workerId: number) {
  if (job?.kind === "take") { const customer = byId(state.customers, job.customer); if (customer?.claimed === workerId) customer.claimed = null; }
}
const sameJob = (a: Job, b: Job) => a.kind === b.kind && (a.kind === "pickup" ||
  (a.kind === "walk" ? same(a.to, (b as typeof a).to) : a.customer === (b as { customer: number }).customer));

function enqueue(state: CafeState, job: Job, front = false): boolean {
  const boss = manager(state);
  if ((boss.job && sameJob(boss.job, job)) || boss.queue.some(queued => sameJob(queued, job))) return false;
  if (boss.queue.length >= 8) return false;
  if (front) boss.queue.unshift(job); else boss.queue.push(job);
  claimFor(state, job, boss.id);
  return true;
}

/** The context action for a guest: take their order, fetch their dish, or serve it. Returns feedback text. */
export function actOnCustomer(state: CafeState, id: number): string {
  const customer = byId(state.customers, id), boss = manager(state);
  if (!customer || state.phase !== "open") return "";
  const name = customer.name || "Your guest";
  if (customer.state === "arriving") return `${name} is still finding a seat.`;
  if (customer.state === "eating") return `${name} is enjoying their ${dishById(customer.dish!).name}.`;
  if (customer.state === "leaving") return `${name} is heading home.`;
  if (customer.state === "waiting") {
    if (customer.claimed !== null && customer.claimed !== boss.id) return "A staff Friend is already taking that order.";
    return enqueue(state, { kind: "take", customer: id }) ? "Taking the order." : "Already on your list.";
  }
  const order = state.orders.find(item => item.customer === id);
  if (!order) return "";
  if (order.state === "carried" && order.carrier === boss.id) return enqueue(state, { kind: "serve", customer: id }, true) ? "Serving." : "Already on your list.";
  if (order.state === "carried") return "A staff Friend is bringing that dish.";
  if (order.state === "ready") { enqueue(state, { kind: "pickup" }); enqueue(state, { kind: "serve", customer: id }); return `Fetching ${dishById(order.dish).name}.`; }
  return `${dishById(order.dish).name} is still cooking.`;
}
/** Tables are numbered in placement order, 1 upward. */
export function actOnTable(state: CafeState, index: number): string {
  const table = tables(state)[index];
  if (!table) return `There is no table ${index + 1}.`;
  const customer = customerAt(state, table.id);
  return customer ? actOnCustomer(state, customer.id) : `Table ${index + 1} is empty.`;
}
export function actOnCounter(state: CafeState): string {
  if (state.phase !== "open") return "";
  if (!state.orders.some(order => order.state === "ready")) return "Nothing is ready at the counter yet.";
  return enqueue(state, { kind: "pickup" }) ? "Picking up ready dishes." : "Already on your list.";
}
export function walkTo(state: CafeState, tile: Tile): boolean {
  const boss = manager(state);
  if (state.blocked.has(key(tile))) return false;
  release(state, boss.job, boss.id); boss.job = { kind: "walk", to: tile }; boss.action = 0; replan(state, boss);
  return true;
}
/** Held direction keys move the manager tile by tile and pause their task list. */
export function setManual(state: CafeState, direction: { dx: number; dy: number } | null) { state.manual = direction; }
/** E / Space: act on whatever is next to the manager. Returns "capsule" when standing at the capsule machine. */
export function interactNearby(state: CafeState): string {
  const boss = manager(state), here = at(boss.walker);
  if (same(here, CAPSULE_SPOT)) return "capsule";
  for (const customer of state.customers) {
    const table = byId(state.items, customer.table);
    if (!table || !["waiting", "ordered"].includes(customer.state)) continue;
    if (serviceTiles(table, state.blocked).some(tile => same(tile, here))) return actOnCustomer(state, customer.id);
  }
  if (same(here, PICKUP)) return actOnCounter(state);
  return "Nothing to do here. Walk next to a table, the counter or the capsule machine.";
}
export function clearQueue(state: CafeState) {
  const boss = manager(state);
  for (const job of boss.queue) release(state, job, boss.id);
  boss.queue = [];
}

// ---------- Simulation ----------
function replan(state: CafeState, worker: Worker) {
  const job = worker.job;
  if (!job) return;
  const goals = goalsFor(state, job);
  const from = worker.walker.path[0] ?? at(worker.walker);
  const path = goals && route(from, goals, state.blocked);
  if (!path) { release(state, job, worker.id); worker.job = null; worker.walker.path = []; return; }
  worker.walker.path = worker.walker.path.length ? [worker.walker.path[0], ...path] : path;
}
function goalsFor(state: CafeState, job: Job): Tile[] | null {
  if (job.kind === "walk") return [job.to];
  if (job.kind === "pickup") return [PICKUP];
  const customer = byId(state.customers, job.customer), table = customer && byId(state.items, customer.table);
  return table ? serviceTiles(table, state.blocked) : null;
}
function valid(state: CafeState, worker: Worker, job: Job): boolean {
  if (job.kind === "walk") return true;
  if (job.kind === "pickup") return worker.carrying.length < carryCapacity(state, worker) && state.orders.some(order => order.state === "ready");
  const customer = byId(state.customers, job.customer);
  if (!customer) return false;
  if (job.kind === "take") return customer.state === "waiting" && (customer.claimed === null || customer.claimed === worker.id);
  return customer.state === "ordered" && worker.carrying.some(id => byId(state.orders, id)?.customer === customer.id);
}

function step(body: Walker, dt: number) {
  let travel = body.speed * dt;
  body.moving = body.path.length > 0;
  while (travel > 0 && body.path.length) {
    const target = body.path[0], dx = target.x - body.x, dy = target.y - body.y, length = Math.hypot(dx, dy);
    if (length > 0.001) body.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
    if (length <= travel) { body.x = target.x; body.y = target.y; body.path.shift(); travel -= length; }
    else { body.x += dx / length * travel; body.y += dy / length * travel; travel = 0; }
  }
}

function nextJob(state: CafeState, worker: Worker): Job | null {
  if (worker.role === "manager") {
    while (worker.queue.length) {
      const job = worker.queue.shift()!;
      if (valid(state, worker, job)) return job;
      release(state, job, worker.id);
    }
  }
  // Carried dishes are delivered automatically.
  const carried = worker.carrying.map(id => byId(state.orders, id)).filter(order => order !== undefined);
  if (carried.length) return { kind: "serve", customer: carried[0]!.customer };
  if (worker.role === "manager") return null;
  const mine = new Set(manager(state).queue.flatMap(job => job.kind === "take" ? [job.customer] : []));
  if (state.orders.some(order => order.state === "ready")) return { kind: "pickup" };
  const waiting = state.customers.filter(customer => customer.state === "waiting" && customer.claimed === null && !mine.has(customer.id))
    .sort((a, b) => a.patience - b.patience)[0];
  if (waiting) { waiting.claimed = worker.id; return { kind: "take", customer: waiting.id }; }
  return same(at(worker.walker), worker.home) ? null : { kind: "walk", to: worker.home };
}

function finish(state: CafeState, worker: Worker, job: Job) {
  if (job.kind === "walk") return;
  if (job.kind === "pickup") {
    const room = carryCapacity(state, worker) - worker.carrying.length;
    const queued = worker.queue.flatMap(item => item.kind === "serve" ? [item.customer] : []);
    const ready = state.orders.filter(order => order.state === "ready")
      .sort((a, b) => Number(queued.includes(b.customer)) - Number(queued.includes(a.customer)) || a.id - b.id);
    for (const order of ready.slice(0, room)) { order.state = "carried"; order.carrier = worker.id; worker.carrying.push(order.id); }
    return;
  }
  const customer = byId(state.customers, job.customer);
  if (!customer) return;
  if (job.kind === "take" && customer.state === "waiting") {
    const menu = availableDishes(state);
    const weights = menu.map(id => dishById(id).blend !== undefined ? 2 : 1);
    let roll = state.rng() * weights.reduce((sum, weight) => sum + weight, 0), dish = menu[0];
    for (let index = 0; index < menu.length; index++) { roll -= weights[index]; if (roll < 0) { dish = menu[index]; break; } }
    customer.state = "ordered"; customer.dish = dish; customer.claimed = null;
    customer.patienceMax = customer.patience = FOOD_PATIENCE * patienceMultiplier(state);
    state.orders.push({ id: state.nextId++, customer: customer.id, dish, state: "queued", progress: 0, duration: cookTime(state, dish), carrier: null });
    state.events.push({ kind: "order", x: customer.walker.x, y: customer.walker.y });
    return;
  }
  if (job.kind === "serve" && customer.state === "ordered") {
    const order = state.orders.find(item => item.customer === customer.id && item.carrier === worker.id && item.state === "carried");
    if (!order) return;
    worker.carrying = worker.carrying.filter(id => id !== order.id);
    state.orders = state.orders.filter(item => item !== order);
    const fraction = customer.patience / customer.patienceMax;
    const tipRate = 0.3 * fraction + 0.03 * ambience(state) + 0.03 * Math.min(5, state.blends[0]) + (perk(state, 1) ? 0.1 : 0);
    const base = dishById(order.dish).price;
    const double = perk(state, 4) && state.rng() < 0.12;
    const amount = Math.round(base * (1 + tipRate)) * (customer.vip ? 3 : 1) * (double ? 2 : 1);
    customer.paid = amount; customer.state = "eating"; customer.eat = EAT_TIME;
    customer.mood = fraction > 0.5 ? "happy" : "ok";
    state.beans += amount;
    state.today.served++; state.today.beans += amount; state.today.tips += amount - base; state.today.best = Math.max(state.today.best, amount);
    if (customer.vip) state.today.vips++;
    state.totalServed++;
    rate(state, customer.mood === "happy" ? 5 : 4);
    gainXp(state, 1 + (customer.mood === "happy" ? 1 : 0) + (customer.vip ? 2 : 0));
    state.events.push({ kind: "coins", amount, x: customer.walker.x, y: customer.walker.y, vip: customer.vip, double });
  }
}

function rate(state: CafeState, score: number) { state.rating = Math.max(1, Math.min(5, state.rating * 0.85 + score * 0.15)); }
function gainXp(state: CafeState, amount: number) {
  state.xp += amount;
  while (state.level < MAX_LEVEL && state.xp >= LEVEL_XP[state.level - 1]) { state.level++; state.events.push({ kind: "levelup", level: state.level }); }
}

function leave(state: CafeState, customer: Customer, angry: boolean) {
  customer.state = "leaving"; customer.claimed = null;
  if (angry) {
    customer.mood = "angry"; state.today.lost++; rate(state, 1);
    state.events.push({ kind: "angry", x: customer.walker.x, y: customer.walker.y });
    const order = state.orders.find(item => item.customer === customer.id);
    if (order) {
      for (const worker of state.workers) worker.carrying = worker.carrying.filter(id => id !== order.id);
      state.orders = state.orders.filter(item => item !== order);
    }
  }
  const from = at(customer.walker);
  customer.walker.path = route(from, [DOOR], state.blocked) ?? route(from, [DOOR], new Set()) ?? [];
}

function spawnCustomer(state: CafeState) {
  const taken = new Set(state.customers.map(customer => customer.table));
  const free = tables(state).filter(table => !taken.has(table.id));
  if (!free.length) return;
  const table = free[Math.floor(state.rng() * free.length)];
  const vip = state.blends[3] > 0 && state.rng() < 0.18;
  const regular = !vip && state.regulars.length && state.rng() < 0.14 ? state.regulars[Math.floor(state.rng() * state.regulars.length)] : null;
  const guest = Math.floor(state.rng() * state.guestCount);
  const seat = seatOf(table);
  const customer: Customer = {
    id: state.nextId++, name: vip ? "Genesis VIP" : regular !== null ? `Regular #${regular}` : "", guest, regular, vip,
    walker: walker(DOOR, 2.2), table: table.id, state: "arriving", dish: null, patience: 0, patienceMax: 1, eat: 0, claimed: null, mood: null, paid: 0,
  };
  customer.walker.path = route(DOOR, [seat], state.blocked) ?? [seat];
  state.customers.push(customer);
  state.events.push({ kind: "arrive" });
}

const spawnInterval = (state: CafeState) =>
  5 / (1 + 0.12 * ambience(state) + 0.1 * (state.rating - 3)) / (perk(state, 8) ? 1.15 : 1) * (0.75 + state.rng() * 0.5);

export function update(state: CafeState, dt: number) {
  if (state.phase !== "open") return;
  dt = Math.min(dt, 0.1);
  state.clock += dt;
  if (!isClosing(state)) {
    state.spawn -= dt;
    if (state.spawn <= 0) { spawnCustomer(state); state.spawn = spawnInterval(state); }
  }
  // Kitchen: finish cooking, then start queued orders in free slots.
  for (const order of state.orders) if (order.state === "cooking" && (order.progress += dt) >= order.duration) {
    order.state = "ready"; state.events.push({ kind: "ready", dish: order.dish });
  }
  let cooking = state.orders.filter(order => order.state === "cooking").length;
  for (const order of state.orders) if (order.state === "queued" && cooking < kitchenSlots(state)) { order.state = "cooking"; cooking++; }

  for (const customer of [...state.customers]) {
    const { walker: body } = customer;
    step(body, dt);
    if (customer.state === "arriving" && !body.path.length) {
      customer.state = "waiting"; body.facing = "down";
      customer.patienceMax = customer.patience = ORDER_PATIENCE * patienceMultiplier(state);
    } else if (customer.state === "waiting" || customer.state === "ordered") {
      customer.patience -= dt;
      if (customer.patience <= 0) leave(state, customer, true);
    } else if (customer.state === "eating" && (customer.eat -= dt) <= 0) leave(state, customer, false);
    else if (customer.state === "leaving" && !body.path.length) state.customers = state.customers.filter(item => item !== customer);
  }

  for (const worker of state.workers) {
    const body = worker.walker;
    body.speed = worker.role === "manager" ? managerSpeed(state) : helperSpeed(state, worker);
    if (worker.action > 0) {
      if ((worker.action -= dt) <= 0) { const job = worker.job!; worker.job = null; worker.action = 0; finish(state, worker, job); }
      continue;
    }
    if (worker.role === "manager" && state.manual && body.path.length > 1) body.path = [body.path[0]];
    if (worker.role === "manager" && state.manual && !body.path.length) {
      const here = at(body), next = { x: here.x + state.manual.dx, y: here.y + state.manual.dy };
      if (worker.job) { release(state, worker.job, worker.id); worker.job = null; }
      if (next.x >= 0 && next.y >= 0 && next.x < 11 && next.y < 11 && !state.blocked.has(key(next))) body.path = [next];
      else body.facing = state.manual.dx > 0 ? "right" : state.manual.dx < 0 ? "left" : state.manual.dy > 0 ? "down" : "up";
    }
    step(body, dt);
    if (body.path.length || (worker.role === "manager" && state.manual)) continue;
    if (worker.job && !valid(state, worker, worker.job)) { release(state, worker.job, worker.id); worker.job = null; }
    if (!worker.job) {
      worker.job = nextJob(state, worker);
      if (!worker.job) continue;
      replan(state, worker);
      if (!worker.job || body.path.length) continue;
    }
    // Arrived: face the target and perform the action.
    const job = worker.job;
    if (job.kind === "walk") { worker.job = null; continue; }
    const customer = job.kind === "pickup" ? null : byId(state.customers, job.customer);
    const target = job.kind === "pickup" ? { x: 1, y: PICKUP.y } : byId(state.items, customer?.table ?? -1) ?? body;
    const dx = target.x - body.x, dy = target.y - body.y;
    body.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
    worker.action = job.kind === "take" ? 0.45 : job.kind === "pickup" ? 0.3 : 0.35;
  }

  if (isClosing(state) && !state.customers.length) {
    state.phase = "summary";
    for (const worker of state.workers) { worker.queue = []; worker.job = null; worker.carrying = []; }
    state.orders = [];
    state.events.push({ kind: "dayEnd" });
  }
}

export { DAY_LENGTH, CAPSULE_SPOT };
