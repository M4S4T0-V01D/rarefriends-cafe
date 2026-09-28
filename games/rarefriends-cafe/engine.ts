/**
 * RareFriends Cafe simulation. Pure and deterministic for a given random source, so it runs in Node tests.
 * Beans, levels, staff and furniture are in-shop progress; the SDK runtime owns RF.
 */
import {
  AMBIENCE_LEVELS, BASE_WALK_IN, BLEND_BONUSES, CATALOG, DAY_LENGTH, DUPLICATE_BEANS, EXCLUSIVES, EAT_TIME, EXPAND_COSTS, EXPAND_LEVELS, FATIGUE, FLOORS, FOOD_PATIENCE,
  LEVEL_XP, MACHINE_COSTS, MAX_LEVEL, MAX_STAFF_SLOTS, ORDER_PATIENCE, PASSERBY_INTERVAL, PROMOTER_PULL, SELL_REFUND, SHOPS, START_STAFF_SLOTS,
  MAX_STAT, STAFF_SLOT_COSTS, STAFF_SLOT_LEVELS, TIP_RATE, type StatId, UPGRADES, WALLPAPERS, breakSeconds, catalogItem, isRug, upgradeById, type UpgradeId, dishById, machineFactor, shopById, tableLimit, tierOf, workerLevel,
  type DishId, type ItemKind, type ShopId,
} from "./data.ts";
import {
  DEFAULT_ITEMS, FACING, MAX_EXTENT, MAX_SIZE, START_SIZE, blockedTiles, capsuleProblem, defaultItems, inDining, inside, isBuilding, isDir, key, placementProblem, planFor, route, same, seatOf, serviceTiles,
  type BuildingId, type Dir, type Item, type Placement, type Plan, type Tile,
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
/** A Friend walking along the street. Some step in and become guests. */
export type Passerby = { id: number; guest: number; regular: number | null; walker: Walker; decided: boolean };
export type Order = {
  /** "plating": cooked, and a chef is carrying it from the stove to the pass. */
  id: number; customer: number; dish: DishId; state: "queued" | "cooking" | "plating" | "ready" | "carried";
  progress: number; duration: number; carrier: number | null;
};
export type Job = { kind: "take"; customer: number } | { kind: "pickup" } | { kind: "serve"; customer: number } | { kind: "walk"; to: Tile } | { kind: "plate" };
/** Who fills a staff slot: one of the player's own verified Friends, or a guest Friend applicant. */
export type StaffWho = { owned: number } | { guest: number };
export type StaffRole = "waiter" | "chef" | "promoter";
export type Stats = Record<StatId, number>;
export type StaffMember = { slot: number; who: StaffWho; role: StaffRole; xp: number; fatigue: number; stats: Stats };
const noStats = (): Stats => ({ speed: 0, stamina: 0, skill: 0 });
export type Duty = "work" | "to-break" | "resting";
export type Worker = {
  id: number; role: "manager" | StaffRole; walker: Walker; carrying: number[]; queue: Job[]; job: Job | null;
  action: number; home: Tile; who: StaffWho | null; slot: number; duty: Duty; rest: number; restTotal: number;
};
export type CafeEvent =
  | { kind: "coins"; amount: number; x: number; y: number; vip: boolean; double: boolean }
  | { kind: "ready"; dish: DishId } | { kind: "order"; x: number; y: number } | { kind: "angry"; x: number; y: number }
  | { kind: "arrive"; promoted: boolean } | { kind: "levelup"; level: number } | { kind: "dayEnd" }
  | { kind: "tired"; slot: number } | { kind: "workerLevel"; slot: number; level: number } | { kind: "rested"; slot: number };
export type DayStats = { served: number; lost: number; beans: number; tips: number; vips: number; best: number; walkIns: number };
export type Phase = "intro" | "open" | "summary";

export type CafeState = {
  phase: Phase; shop: ShopId; started: boolean; day: number; clock: number; beans: number; xp: number; level: number; rating: number;
  size: number; machine: number; unlocked: Set<DishId>; blends: number[]; familyId: number; guestCount: number; regulars: number[];
  items: Item[]; wallpaper: string; floor: string; finishes: Set<string>; collection: Set<string>; prefs: Prefs;
  /** The capsule machine's spot once moved; null keeps the default corner by the window. */
  capsule: Placement | null; upgrades: Partial<Record<UpgradeId, number>>; building: BuildingId;
  staffSlots: number; staff: StaffMember[]; ownedFriends: number[]; generations: Record<number, number>; applicants: number[];
  customers: Customer[]; passersby: Passerby[]; orders: Order[]; workers: Worker[]; events: CafeEvent[];
  spawn: number; nextId: number; blocked: Set<number>; manual: { dx: number; dy: number } | null;
  today: DayStats; totalServed: number; rng: () => number;
};
export type OwnedInput = number | { id: number; generation: number | null };
/** Audio preferences, saved with the wallet's shop. */
export type Prefs = { track: string; music: boolean; sfx: boolean; volume: number };
export const DEFAULT_PREFS: Prefs = { track: "latte", music: true, sfx: true, volume: 0.6 };

const perk = (state: CafeState, family: number) => state.familyId === family;
const emptyDay = (): DayStats => ({ served: 0, lost: 0, beans: 0, tips: 0, vips: 0, best: 0, walkIns: 0 });
/** Sprite facing for each item `dir`; a seated guest faces their table, which lies that way from the chair. */
export const DIR_FACING: readonly Facing[] = ["down", "right", "up", "left"];
const walker = (tile: Tile, speed: number): Walker => ({ x: tile.x, y: tile.y, path: [], speed, facing: "down", moving: false });
const byId = <T extends { id: number }>(items: readonly T[], id: number) => items.find(item => item.id === id);
const at = (body: Walker): Tile => ({ x: Math.round(body.x), y: Math.round(body.y) });
export const plan = (state: CafeState): Plan => planFor(state.size, { building: state.building, capsule: state.capsule });
/** Build-mode selection id for the capsule machine (items have positive ids). */
export const CAPSULE_ID = -1;
export const upgradeLevel = (state: CafeState, id: UpgradeId) => state.upgrades[id] ?? 0;

export function createCafe(options: {
  familyId: number; guestCount: number; regulars?: number[]; ownedFriends?: OwnedInput[]; shop?: ShopId; rng?: () => number;
}): CafeState {
  const guestCount = Math.max(1, options.guestCount);
  const state: CafeState = {
    phase: "intro", shop: options.shop ?? "cafe", started: false, day: 1, clock: 0, beans: 30, xp: 0, level: 1, rating: 3.5,
    size: START_SIZE, machine: 0, unlocked: new Set(), blends: [0, 0, 0, 0], familyId: options.familyId, guestCount, regulars: options.regulars ?? [],
    items: DEFAULT_ITEMS.map(item => ({ ...item })), wallpaper: "plain", floor: "checker", finishes: new Set(["plain", "checker"]),
    collection: new Set(), prefs: { ...DEFAULT_PREFS }, capsule: null, upgrades: {}, building: "corner",
    staffSlots: START_STAFF_SLOTS, staff: [], ownedFriends: [], generations: {},
    applicants: Array.from({ length: Math.min(6, guestCount) }, (_, index) => (index * 5 + 3) % guestCount),
    customers: [], passersby: [], orders: [], workers: [], events: [], spawn: 0.5, nextId: 100, blocked: new Set(), manual: null,
    today: emptyDay(), totalServed: 0, rng: options.rng ?? Math.random,
  };
  state.blocked = blockedTiles(state.items, plan(state));
  chooseShop(state, state.shop);
  if (perk(state, 7)) state.rating = 4;
  state.workers.push(newWorker(0, "manager", plan(state).pickup, null, -1));
  setOwnedFriends(state, options.ownedFriends ?? []);
  return state;
}
function newWorker(id: number, role: Worker["role"], home: Tile, who: StaffWho | null, slot: number): Worker {
  return { id, role, walker: walker(home, 3), carrying: [], queue: [], job: null, action: 0, home, who, slot, duty: "work", rest: 0, restTotal: 0 };
}

/** Pick the kind of shop. Allowed before the first day opens; resets the menu to that shop's starters. */
export function chooseShop(state: CafeState, shop: ShopId): string | null {
  if (state.started || state.phase !== "intro") return "The shop type is chosen before the first day.";
  state.shop = shop;
  state.unlocked = new Set(shopById(shop).menu.filter(dish => dish.blend === undefined && dish.unlockCost === 0).map(dish => dish.id));
  return null;
}

// ---------- Staff stats ----------
export const manager = (state: CafeState) => state.workers[0];
export const staffAt = (state: CafeState, slot: number) => state.staff.find(member => member.slot === slot) ?? null;
export const memberOf = (state: CafeState, worker: Worker) => worker.slot >= 0 ? staffAt(state, worker.slot) : null;
export const generationOf = (state: CafeState, who: StaffWho) => "owned" in who ? state.generations[who.owned] ?? null : null;
/** A staff Friend's power: generation tier (Gen 1 best … Gen 6, then guests) × 4% per worker level. */
export function staffPower(state: CafeState, member: StaffMember) {
  return tierOf(generationOf(state, member.who)).power * (1 + 0.04 * (workerLevel(member.xp) - 1));
}
const isTired = (member: StaffMember | null) => Boolean(member && member.fatigue >= FATIGUE.tired);
const isExhausted = (member: StaffMember | null) => Boolean(member && member.fatigue >= FATIGUE.exhausted);
/** Working = on the floor, not on a break and not exhausted. */
export function isWorking(state: CafeState, worker: Worker) {
  return worker.role === "manager" || (worker.duty === "work" && !isExhausted(memberOf(state, worker)));
}
const managerSpeed = (state: CafeState) => 3.3 * (perk(state, 5) ? 1.3 : 1) * (1 + 0.08 * upgradeLevel(state, "shoes"));
function workerSpeed(state: CafeState, worker: Worker) {
  if (worker.role === "manager") return managerSpeed(state);
  const member = memberOf(state, worker);
  const base = 2.5 * (member ? staffPower(state, member) * (1 + 0.06 * member.stats.speed) : 1) * (perk(state, 2) ? 1.25 : 1);
  return worker.duty === "work" && isTired(member) ? base * 0.85 : base;
}
export function carryCapacity(state: CafeState, worker: Worker) {
  if (worker.role === "manager") return (perk(state, 3) ? 3 : 2) + upgradeLevel(state, "tray");
  const member = memberOf(state, worker);
  if (!member) return 1;
  const generation = generationOf(state, member.who);
  return 1 + (generation !== null && generation <= 3 || workerLevel(member.xp) >= 5 ? 1 : 0);
}
export const chefs = (state: CafeState) => state.workers.filter(worker => worker.role === "chef");
/** Chefs on shift in the kitchen: at their stove or taking a dish to the pass. */
const activeChefs = (state: CafeState) => chefs(state).filter(worker => {
  const tile = at(worker.walker);
  return isWorking(state, worker) && worker.duty === "work" && plan(state).kitchenArea.has(key(tile));
});
/** Where a chef stands to set a dish on the pass. */
const chefPass = (layout: Plan): Tile => layout.chefPass;
export const kitchenSlots = (state: CafeState) => 1 + activeChefs(state).length;
export const tables = (state: CafeState) => state.items.filter(item => item.kind === "table");
function tire(state: CafeState, worker: Worker, amount: number) {
  const member = memberOf(state, worker);
  if (!member) return;
  const wasTired = isTired(member);
  member.fatigue = Math.min(FATIGUE.exhausted, member.fatigue + amount * (1 - FATIGUE.levelRelief * (workerLevel(member.xp) - 1)) * (1 - 0.12 * upgradeLevel(state, "breakroom")) * (1 - 0.08 * member.stats.stamina));
  if (!wasTired && isTired(member)) state.events.push({ kind: "tired", slot: member.slot });
}
function train(state: CafeState, worker: Worker, amount = 1) {
  const member = memberOf(state, worker);
  if (!member) return;
  const before = workerLevel(member.xp);
  member.xp += amount;
  if (workerLevel(member.xp) > before) state.events.push({ kind: "workerLevel", slot: member.slot, level: workerLevel(member.xp) });
}

export function ambiencePoints(state: CafeState) {
  const finish = (WALLPAPERS.find(item => item.id === state.wallpaper)?.ambience ?? 0) + (FLOORS.find(item => item.id === state.floor)?.ambience ?? 0);
  return finish + state.items.reduce((sum, item) => sum + catalogItem(item.kind).ambience, 0);
}
/** Ambience level 0–5 from placed décor, wallpaper and floor. */
export const ambience = (state: CafeState) => AMBIENCE_LEVELS.filter(points => ambiencePoints(state) >= points).length;

const patienceMultiplier = (state: CafeState) =>
  (1 + 0.06 * ambience(state)) * (perk(state, 6) ? 1.25 : 1) * (state.blends[2] > 0 ? 1.1 : 1) * (1 + 0.08 * upgradeLevel(state, "chairs"));
export function cookTime(state: CafeState, dish: DishId) {
  const chefFactor = activeChefs(state).reduce((factor, worker) => {
    const member = memberOf(state, worker)!;
    return factor * (1 - 0.06 * (staffPower(state, member) - 0.5) - 0.04 * member.stats.skill);
  }, 1);
  return dishById(dish).cook * machineFactor(state.machine) * (perk(state, 0) ? 0.85 : 1) * Math.max(0.65, chefFactor);
}
const workingPromoters = (state: CafeState) =>
  state.workers.filter(worker => worker.role === "promoter" && isWorking(state, worker) && same(at(worker.walker), worker.home));
/** Chance that a passer-by steps in: ambience, rating and working promoters on the sidewalk raise it. */
export function walkInChance(state: CafeState) {
  const pull = workingPromoters(state).reduce((sum, worker) => {
    const member = memberOf(state, worker)!;
    return sum + PROMOTER_PULL * staffPower(state, member) * (1 + 0.08 * member.stats.skill);
  }, 0);
  const base = BASE_WALK_IN * (1 + 0.1 * ambience(state) + 0.08 * (state.rating - 3)) * (perk(state, 8) ? 1.15 : 1) * (1 + 0.06 * upgradeLevel(state, "sign"));
  return Math.min(0.9, base + pull);
}

export function availableDishes(state: CafeState): DishId[] {
  return shopById(state.shop).menu.filter(dish => dish.blend === undefined ? state.unlocked.has(dish.id) : state.blends[dish.blend] > 0).map(dish => dish.id);
}
export const customerAt = (state: CafeState, tableId: number) => state.customers.find(customer => customer.table === tableId);

/** Kept capsule recipes from the SDK snapshot's inventory drive shop bonuses. */
export function setBlends(state: CafeState, counts: readonly number[]) {
  state.blends = [0, 1, 2, 3].map(index => Math.max(0, Math.floor(counts[index] ?? 0)));
}

// ---------- Shop upgrades ----------
/** The next level's cost and required café level, or null when maxed. */
export function nextUpgrade(state: CafeState, id: UpgradeId): { cost: number; level: number } | null {
  const upgrade = upgradeById(id), at = upgradeLevel(state, id);
  return at < upgrade.costs.length ? { cost: upgrade.costs[at], level: upgrade.levels[at] } : null;
}
export function buyUpgrade(state: CafeState, id: UpgradeId): string | null {
  const next = nextUpgrade(state, id);
  if (!next) return "Fully upgraded.";
  if (state.level < next.level) return `Reach level ${next.level} first.`;
  if (state.beans < next.cost) return "Not enough Beans.";
  state.beans -= next.cost; state.upgrades[id] = upgradeLevel(state, id) + 1;
  return null;
}

// ---------- Building ----------
/**
 * Move into another building. Before the first day the starting tables are simply laid out again; later, furniture that
 * no longer fits is refunded (as when expanding). Between days only.
 */
export function setBuilding(state: CafeState, id: BuildingId): string | null {
  if (!isBuilding(id)) return "Unknown building.";
  if (state.phase === "open") return "Change buildings between days, while the shop is closed.";
  if (state.building === id) return null;
  state.building = id;
  if (state.capsule && capsuleProblem(state.items, plan(state), state.capsule)) state.capsule = null;
  if (!state.started) state.items = defaultItems(id).map(item => ({ ...item }));
  else refitItems(state);
  syncWorkers(state); afterLayoutChange(state);
  for (const worker of state.workers) { worker.walker.x = worker.home.x; worker.walker.y = worker.home.y; worker.walker.path = []; }
  return null;
}

// ---------- Beans purchases ----------
export type Purchase = "machine" | "slot" | "expand";
const expansions = (state: CafeState) => (state.size - START_SIZE) / 2;
export function purchaseCost(state: CafeState, item: Purchase): number | null {
  if (item === "machine") return MACHINE_COSTS[state.machine] ?? null;
  if (item === "expand") return state.size >= MAX_SIZE ? null : EXPAND_COSTS[expansions(state)] ?? null;
  return STAFF_SLOT_COSTS[state.staffSlots - START_STAFF_SLOTS] ?? null;
}
export function purchaseLevel(state: CafeState, item: Purchase): number {
  if (item === "slot") return STAFF_SLOT_LEVELS[state.staffSlots - START_STAFF_SLOTS] ?? MAX_LEVEL;
  if (item === "expand") return EXPAND_LEVELS[expansions(state)] ?? MAX_LEVEL;
  return 1;
}
export function buy(state: CafeState, item: Purchase): string | null {
  const cost = purchaseCost(state, item);
  if (cost === null || (item === "slot" && state.staffSlots >= MAX_STAFF_SLOTS)) return "Fully upgraded.";
  if (state.level < purchaseLevel(state, item)) return `Reach level ${purchaseLevel(state, item)} first.`;
  if (state.beans < cost) return "Not enough Beans.";
  if (item === "expand" && state.phase === "open") return "Expand between days, while the shop is closed.";
  state.beans -= cost;
  if (item === "machine") state.machine++;
  else if (item === "slot") state.staffSlots++;
  else {
    state.size += 2;
    if (state.capsule && capsuleProblem(state.items, plan(state), state.capsule)) state.capsule = null;
    refitItems(state); syncWorkers(state); afterLayoutChange(state);
  }
  return null;
}
/** After the plan changes, keep every item that still fits; refund any that now sit on a reserved tile. */
function refitItems(state: CafeState) {
  const kept: Item[] = [];
  for (const item of state.items) {
    if (placementProblem(kept, item, plan(state))) state.beans += catalogItem(item.kind).cost;
    else kept.push(item);
  }
  if (!kept.some(item => item.kind === "table")) {
    const spare = [...defaultItems(state.building), ...DEFAULT_ITEMS].find(table => !placementProblem(kept, table, plan(state)));
    if (spare) kept.push({ ...spare, id: state.nextId++ });
  }
  state.items = kept;
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
/** Put a Friend in a staff slot (or clear it with null). Owned Friends must come from the verified roster. */
export function assignStaff(state: CafeState, slot: number, who: StaffWho | null, role: StaffRole = "waiter"): string | null {
  if (!Number.isInteger(slot) || slot < 0 || slot >= state.staffSlots) return "Unlock that staff slot first.";
  if (who && "owned" in who && !state.ownedFriends.includes(who.owned)) return "Only Friends you own can join as your staff.";
  if (who && "guest" in who && !state.applicants.includes(who.guest)) return "That applicant isn't available.";
  const previous = who ? state.staff.find(member => sameWho(member.who, who)) : undefined;
  state.staff = state.staff.filter(member => member.slot !== slot && !(who && sameWho(member.who, who)));
  if (who) state.staff.push({ slot, who, role, xp: previous?.xp ?? 0, fatigue: previous?.fatigue ?? 0, stats: previous ? { ...previous.stats } : noStats() });
  state.staff.sort((a, b) => a.slot - b.slot);
  syncWorkers(state);
  return null;
}
/** Unspent attribute points: one per worker level past the first. */
export const statPoints = (member: StaffMember) => workerLevel(member.xp) - 1 - member.stats.speed - member.stats.stamina - member.stats.skill;
export function raiseStat(state: CafeState, slot: number, stat: StatId): string | null {
  const member = staffAt(state, slot);
  if (!member) return "That slot is empty.";
  if (!(stat in member.stats)) return "Unknown attribute.";
  if (member.stats[stat] >= MAX_STAT) return "That attribute is maxed.";
  if (statPoints(member) <= 0) return "No points to spend. Workers earn one each level.";
  member.stats[stat]++;
  return null;
}
export function setStaffRole(state: CafeState, slot: number, role: StaffRole): string | null {
  const member = staffAt(state, slot);
  if (!member) return "That slot is empty.";
  member.role = role; syncWorkers(state);
  return null;
}
function homeFor(state: CafeState, role: StaffRole, index: number): Tile {
  const layout = plan(state);
  if (role === "chef") return layout.chefSpots[index % layout.chefSpots.length];
  if (role === "promoter") return layout.promoterSpots[index % layout.promoterSpots.length];
  const candidates = [{ x: layout.pickup.x + 1, y: layout.pickup.y + 1 }, { x: 4, y: 1 }, { x: 6, y: layout.d - 1 }, { x: layout.w - 2, y: layout.d - 1 }, { x: 8, y: 1 }, { x: 4, y: 4 }];
  const free = candidates.filter(tile => inDining(tile, layout) && !state.blocked.has(key(tile)));
  return free[index % Math.max(1, free.length)] ?? layout.pickup;
}
/** Every staff Friend is a worker on the map: waiters on the floor, chefs in the kitchen, promoters on the sidewalk. */
function syncWorkers(state: CafeState) {
  const boss = manager(state), keep: Worker[] = [boss], counts = { waiter: 0, chef: 0, promoter: 0 };
  for (const member of state.staff) {
    let worker = state.workers.find(item => item.who && item.slot === member.slot && sameWho(item.who, member.who));
    const home = homeFor(state, member.role, counts[member.role]++);
    if (!worker || worker.role !== member.role) {
      if (worker) dropWork(state, worker);
      worker = newWorker(0, member.role, member.role === "chef" ? home : plan(state).door, member.who, member.slot);
    }
    worker.id = keep.length; worker.home = home;
    keep.push(worker);
  }
  for (const worker of state.workers) if (!keep.includes(worker)) dropWork(state, worker);
  // Ids moved, so re-point claims and carried dishes at the kept workers.
  for (const customer of state.customers) if (customer.claimed !== null && customer.claimed !== 0) customer.claimed = null;
  for (const worker of keep) {
    if (worker.role !== "manager" && worker.job?.kind === "take") worker.job = null;
    for (const id of worker.carrying) { const order = byId(state.orders, id); if (order) order.carrier = worker.id; }
  }
  state.workers = keep;
}
/** Hand back a worker's claims and carried dishes. */
function dropWork(state: CafeState, worker: Worker) {
  release(state, worker.job, worker.id); worker.job = null; worker.action = 0;
  for (const id of worker.carrying) { const order = byId(state.orders, id); if (order) { order.state = "ready"; order.carrier = null; } }
  worker.carrying = [];
}
/** The verified roster from the host: token IDs with their on-chain generation (Gen 1 is the top tier). */
export function setOwnedFriends(state: CafeState, owned: readonly OwnedInput[]) {
  const list = owned.map(entry => typeof entry === "number" ? { id: entry, generation: null } : entry);
  state.ownedFriends = [...new Set(list.map(entry => entry.id))];
  state.generations = Object.fromEntries(list.flatMap(entry => entry.generation ? [[entry.id, entry.generation]] : []));
  state.staff = state.staff.filter(member => !("owned" in member.who) || state.ownedFriends.includes(member.who.owned));
  syncWorkers(state);
}
/** The manager sends a staff Friend to the break room; the break lasts 15–30 s depending on how tired they are. */
export function sendToBreak(state: CafeState, workerId: number): string {
  const worker = byId(state.workers, workerId), member = worker && memberOf(state, worker);
  if (!worker || !member) return "Only staff Friends take breaks.";
  if (worker.duty !== "work") return "Already on a break.";
  if (member.fatigue < 20) return "Not tired yet. Send them when their energy runs low.";
  const layout = plan(state), taken = new Set(state.workers.filter(item => item.duty !== "work" && item.job?.kind === "walk").map(item => key((item.job as { to: Tile }).to)));
  const spot = layout.restSpots.find(tile => !taken.has(key(tile))) ?? layout.restSpots[0];
  dropWork(state, worker);
  const path = route(worker.walker.path[0] ?? at(worker.walker), [spot], state.blocked, layout);
  if (!path) return "They can't reach the break room.";
  worker.duty = "to-break"; worker.walker.path = worker.walker.path.length ? [worker.walker.path[0], ...path] : path;
  worker.restTotal = breakSeconds(member.fatigue) * (1 - 0.2 * upgradeLevel(state, "breakroom")); worker.rest = worker.restTotal;
  worker.job = { kind: "walk", to: spot };
  return `Break time: ${Math.round(worker.restTotal)} s in the break room.`;
}

// ---------- RF exclusives (from capsules) ----------
/**
 * A capsule of `tier` (0 House Secret … 3 Golden Recipe) also grants a collectible: a random exclusive of that tier
 * not yet collected, or Beans for a duplicate. Collectibles carry no RF value; the capsule's RF redemption is unchanged.
 */
export function collectFromCapsule(state: CafeState, tier: number): { exclusive: ItemKind | null; beans: number } {
  const pool = EXCLUSIVES.filter(item => item.tier === tier && !state.collection.has(item.kind));
  if (!pool.length) { const beans = DUPLICATE_BEANS[tier] ?? 0; state.beans += beans; return { exclusive: null, beans }; }
  const pick = pool[Math.floor(state.rng() * pool.length)];
  state.collection.add(pick.kind);
  return { exclusive: pick.kind, beans: 0 };
}
/** Tracks unlocked by collected exclusives. */
export const hasCollected = (state: CafeState, id: string) => state.collection.has(id);

// ---------- Build mode ----------
export const tableCount = (state: CafeState) => tables(state).length;
const occupiedTable = (state: CafeState, id: number) => state.customers.some(customer => customer.table === id);
function occupiedByGuest(state: CafeState, tile: Tile) {
  return state.customers.some(customer => same(at(customer.walker), tile) || (customer.walker.path.at(-1) && same(customer.walker.path.at(-1)!, tile)));
}
export function itemAt(state: CafeState, tile: Tile): Item | undefined {
  return state.items.find(item => !isRug(item.kind) && (same(item, tile) || (item.kind === "table" && same(seatOf(item), tile))))
    ?? state.items.find(item => isRug(item.kind) && same(item, tile));
}
function afterLayoutChange(state: CafeState) {
  const layout = plan(state);
  state.blocked = blockedTiles(state.items, layout);
  const counts = { waiter: 0, chef: 0, promoter: 0 };
  for (const worker of state.workers) {
    if (worker.role !== "manager") worker.home = homeFor(state, worker.role, counts[worker.role]++);
    else worker.home = layout.pickup;
    if (worker.duty !== "work") continue;
    if (state.blocked.has(key(at(worker.walker))) || (!inside(at(worker.walker), layout) && worker.role !== "promoter")) {
      worker.walker.x = worker.home.x; worker.walker.y = worker.home.y;
    }
    worker.walker.path = [];
    if (worker.job) replan(state, worker);
  }
  for (const customer of state.customers) {
    const table = byId(state.items, customer.table);
    if (customer.state === "arriving" && table) customer.walker.path = route(at(customer.walker), [seatOf(table)], state.blocked, layout) ?? [seatOf(table)];
    if (customer.state === "leaving") customer.walker.path = route(at(customer.walker), [{ x: layout.lane, y: layout.door.y }], state.blocked, layout) ?? [];
  }
}
/** Place a new item bought with Beans. */
export function placeItem(state: CafeState, kind: ItemKind, tile: Tile, dir: Dir = 0): string | null {
  const entry = catalogItem(kind);
  if (entry.tier !== undefined && !state.collection.has(kind)) return `${entry.name} comes from Rare Recipe Capsules.`;
  if (entry.tier !== undefined && state.items.some(item => item.kind === kind)) return `Your ${entry.name} is already placed. Move it instead.`;
  if (kind === "table" && tableCount(state) >= tableLimit(state.level)) return `Level ${state.level} allows ${tableLimit(state.level)} tables. Level up for more.`;
  if (state.beans < entry.cost) return "Not enough Beans.";
  const candidate = { kind, x: tile.x, y: tile.y, dir };
  if (occupiedByGuest(state, tile) || (kind === "table" && occupiedByGuest(state, seatOf(candidate)))) return "A guest is standing there.";
  const problem = placementProblem(state.items, candidate, plan(state));
  if (problem) return problem;
  state.beans -= entry.cost;
  state.items.push({ id: state.nextId++, ...candidate });
  afterLayoutChange(state);
  return null;
}
/** Move (and optionally rotate) an item for free. */
export function moveItem(state: CafeState, id: number, tile: Tile, dir?: Dir): string | null {
  const item = byId(state.items, id);
  if (!item) return "That item is gone.";
  if (item.kind === "table" && occupiedTable(state, id)) return "A guest is using that table.";
  const candidate = { kind: item.kind, x: tile.x, y: tile.y, dir: dir ?? item.dir };
  if (occupiedByGuest(state, tile) || (item.kind === "table" && occupiedByGuest(state, seatOf(candidate)))) return "A guest is standing there.";
  const problem = placementProblem(state.items, candidate, plan(state), id);
  if (problem) return problem;
  Object.assign(item, candidate);
  afterLayoutChange(state);
  return null;
}
/** Why the capsule machine can't move to `tile`, used from the `dir` side, or null. */
export function capsuleProblemAt(state: CafeState, tile: Tile, dir: Dir): string | null {
  const spot = { x: tile.x + FACING[dir].x, y: tile.y + FACING[dir].y };
  if (occupiedByGuest(state, tile) || occupiedByGuest(state, spot)) return "A guest is standing there.";
  return capsuleProblem(state.items, plan(state), { x: tile.x, y: tile.y, dir });
}
/** Move the capsule machine (free); `dir` is the side the manager uses it from. */
export function moveCapsule(state: CafeState, tile: Tile, dir: Dir): string | null {
  const problem = capsuleProblemAt(state, tile, dir);
  if (problem) return problem;
  state.capsule = { x: tile.x, y: tile.y, dir };
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
  state.phase = "open"; state.started = true; state.clock = 0; state.spawn = 0.5; state.passersby = [];
  // Everyone starts the day rested and at their post.
  for (const member of state.staff) member.fatigue = 0;
  for (const worker of state.workers) {
    worker.duty = "work"; worker.rest = 0; worker.queue = []; worker.job = null; worker.carrying = []; worker.action = 0;
    worker.walker.x = worker.home.x; worker.walker.y = worker.home.y; worker.walker.path = [];
  }
}
export const dayProgress = (state: CafeState) => Math.min(1, state.clock / DAY_LENGTH);
export const isClosing = (state: CafeState) => state.clock >= DAY_LENGTH;

// ---------- Save / restore (per wallet, stored by the trusted host) ----------
export const SAVE_VERSION = 2;
export type CafeSave = {
  v: number; shop: ShopId; day: number; beans: number; xp: number; level: number; rating: number; machine: number; size: number;
  unlocked: string[]; items: { kind: ItemKind; x: number; y: number; dir: Dir }[]; wallpaper: string; floor: string; finishes: string[];
  staffSlots: number; staff: { slot: number; owned?: number; guest?: number; role: StaffRole; xp: number; stats?: Stats }[]; totalServed: number;
  collection?: string[]; prefs?: Prefs; capsule?: Placement | null; upgrades?: Partial<Record<UpgradeId, number>>; building?: BuildingId;
};
/** Long-term progress only. A day in progress resumes from its start; a closed day resumes at the next one. */
export function serializeCafe(state: CafeState): CafeSave | null {
  if (!state.started) return null;
  return {
    v: SAVE_VERSION, shop: state.shop, day: state.phase === "summary" ? state.day + 1 : state.day, beans: state.beans, xp: state.xp, level: state.level,
    rating: Math.round(state.rating * 100) / 100, machine: state.machine, size: state.size, unlocked: [...state.unlocked],
    items: state.items.map(({ kind, x, y, dir }) => ({ kind, x, y, dir })), wallpaper: state.wallpaper, floor: state.floor, finishes: [...state.finishes],
    staffSlots: state.staffSlots, staff: state.staff.map(member => ({ slot: member.slot, role: member.role, xp: member.xp, stats: { ...member.stats }, ...member.who })),
    totalServed: state.totalServed, collection: [...state.collection], prefs: { ...state.prefs }, capsule: state.capsule, upgrades: { ...state.upgrades }, building: state.building,
  };
}
const int = (value: unknown, min: number, max: number) => typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
/**
 * Apply a save before the first day opens. Structurally invalid saves are rejected whole. Version 1 saves (before the
 * street, kitchen room and expansions) are migrated; furniture that no longer fits the plan is refunded in Beans.
 */
export function restoreCafe(state: CafeState, input: unknown): boolean {
  if (state.started || state.phase !== "intro" || !input || typeof input !== "object") return false;
  const save = input as Partial<CafeSave>;
  const shop = SHOPS.find(item => item.id === save.shop);
  const size = save.v === 1 ? START_SIZE : save.size;
  if ((save.v !== 1 && save.v !== SAVE_VERSION) || !shop || !int(save.day, 1, 1e6) || !int(save.beans, 0, 1e9) || !int(save.xp, 0, 1e9)
    || !int(save.level, 1, MAX_LEVEL) || typeof save.rating !== "number" || !(save.rating >= 1 && save.rating <= 5) || !int(save.machine, 0, MACHINE_COSTS.length)
    || !int(save.staffSlots, START_STAFF_SLOTS, MAX_STAFF_SLOTS) || !int(save.totalServed, 0, 1e9) || !int(size, START_SIZE, MAX_SIZE) || size! % 2 !== 0
    || !Array.isArray(save.unlocked) || !Array.isArray(save.items) || !Array.isArray(save.finishes) || !Array.isArray(save.staff)) return false;
  const menu = new Set<string>(shop.menu.map(dish => dish.id));
  if (!save.unlocked.every(id => typeof id === "string" && menu.has(id))) return false;
  const finishIds = new Set([...WALLPAPERS, ...FLOORS].map(item => item.id));
  if (!save.finishes.every(id => typeof id === "string" && finishIds.has(id)) || !save.finishes.includes(save.wallpaper!) || !save.finishes.includes(save.floor!)
    || !WALLPAPERS.some(item => item.id === save.wallpaper) || !FLOORS.some(item => item.id === save.floor)) return false;
  const kinds = new Set(CATALOG.map(item => item.kind)), exclusiveIds = new Set(EXCLUSIVES.map(item => item.kind as string));
  const collection = Array.isArray(save.collection) ? save.collection.filter(id => typeof id === "string" && exclusiveIds.has(id)) : [];
  const prefs = save.prefs && typeof save.prefs === "object" ? save.prefs : DEFAULT_PREFS;
  const upgrades = save.upgrades && typeof save.upgrades === "object" ? save.upgrades : {};
  if (!Object.entries(upgrades).every(([id, level]) => UPGRADES.some(item => item.id === id && int(level, 0, item.costs.length)))) return false;
  if (save.building !== undefined && !isBuilding(save.building)) return false;
  if (save.items.length > 300 || !save.items.every(item => item && kinds.has(item.kind) && int(item.x, 0, MAX_EXTENT) && int(item.y, 0, MAX_EXTENT) && isDir(item.dir))) return false;
  Object.assign(state, {
    shop: shop.id, started: true, day: save.day, beans: save.beans, xp: save.xp, level: save.level, rating: save.rating, machine: save.machine, size,
    unlocked: new Set(save.unlocked), wallpaper: save.wallpaper, floor: save.floor, finishes: new Set(save.finishes),
    staffSlots: save.staffSlots, totalServed: save.totalServed, staff: [], collection: new Set(collection), upgrades: { ...upgrades }, capsule: null, building: save.building ?? "corner",
    prefs: { track: typeof prefs.track === "string" ? prefs.track : DEFAULT_PREFS.track, music: prefs.music !== false, sfx: prefs.sfx !== false,
      volume: typeof prefs.volume === "number" && prefs.volume >= 0 && prefs.volume <= 1 ? prefs.volume : DEFAULT_PREFS.volume },
    // Exclusives can only be placed once each, and only if collected.
    items: save.items.filter((item, index, all) => !exclusiveIds.has(item.kind) || (collection.includes(item.kind) && all.findIndex(other => other.kind === item.kind) === index))
      .map((item, index) => ({ id: index + 1, kind: item.kind, x: item.x, y: item.y, dir: item.dir })),
  });
  state.nextId = Math.max(state.nextId, state.items.length + 100);
  refitItems(state);
  // A moved capsule machine comes back if its spot still works; otherwise it returns to its corner.
  const machine = save.capsule;
  if (machine && int(machine.x, 0, MAX_EXTENT) && int(machine.y, 0, MAX_EXTENT) && isDir(machine.dir) && !capsuleProblem(state.items, plan(state), machine))
    state.capsule = { x: machine.x, y: machine.y, dir: machine.dir };
  state.blocked = blockedTiles(state.items, plan(state));
  const boss = manager(state);
  boss.home = plan(state).pickup; boss.walker.x = boss.home.x; boss.walker.y = boss.home.y;
  for (const member of save.staff) {
    const who: StaffWho | null = int(member?.owned, 1, Number.MAX_SAFE_INTEGER) ? { owned: member.owned! } : int(member?.guest, 0, 1e6) ? { guest: member.guest! } : null;
    if (who && ["waiter", "chef", "promoter"].includes(member.role)) {
      const xp = int(member.xp, 0, 1e7) ? member.xp : 0, saved = member.stats, stats = noStats();
      if (saved && typeof saved === "object" && (["speed", "stamina", "skill"] as const).every(id => int(saved[id], 0, MAX_STAT))) Object.assign(stats, saved);
      const spent = stats.speed + stats.stamina + stats.skill;
      state.staff.push({ slot: member.slot, who, role: member.role, xp, fatigue: 0, stats: spent <= workerLevel(xp) - 1 ? { speed: stats.speed, stamina: stats.stamina, skill: stats.skill } : noStats() });
    }
  }
  // Staff are re-checked against the current roster (set it first) and applicants; missing Friends drop out.
  state.staff = state.staff.filter((member, index, all) => int(member.slot, 0, state.staffSlots - 1) && all.findIndex(other => other.slot === member.slot) === index
    && ("owned" in member.who ? state.ownedFriends.includes(member.who.owned) : state.applicants.includes(member.who.guest)));
  syncWorkers(state);
  afterLayoutChange(state);
  for (const worker of state.workers) { worker.walker.x = worker.home.x; worker.walker.y = worker.home.y; }
  return true;
}

// ---------- Player intent ----------
function claimFor(state: CafeState, job: Job, workerId: number) {
  if (job.kind === "take") { const customer = byId(state.customers, job.customer); if (customer) customer.claimed = workerId; }
}
function release(state: CafeState, job: Job | null, workerId: number) {
  if (job?.kind === "take") { const customer = byId(state.customers, job.customer); if (customer?.claimed === workerId) customer.claimed = null; }
}
const sameJob = (a: Job, b: Job) => a.kind === b.kind && (a.kind === "pickup" || a.kind === "plate" ||
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
  return order.state === "plating" ? `The chef is bringing ${dishById(order.dish).name} to the pass.` : `${dishById(order.dish).name} is still cooking.`;
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
  if (state.blocked.has(key(tile)) || !inside(tile, plan(state))) return false;
  release(state, boss.job, boss.id); boss.job = { kind: "walk", to: tile }; boss.action = 0; replan(state, boss);
  return Boolean(boss.job);
}
/** Held direction keys move the manager tile by tile and pause their task list. */
export function setManual(state: CafeState, direction: { dx: number; dy: number } | null) { state.manual = direction; }
/** E / Space: act on whatever is next to the manager. Returns "capsule" when standing at the capsule machine. */
export function interactNearby(state: CafeState): string {
  const boss = manager(state), here = at(boss.walker), layout = plan(state);
  if (same(here, layout.capsuleSpot)) return "capsule";
  for (const customer of state.customers) {
    const table = byId(state.items, customer.table);
    if (!table || !["waiting", "ordered"].includes(customer.state)) continue;
    if (serviceTiles(table, state.blocked, layout).some(tile => same(tile, here))) return actOnCustomer(state, customer.id);
  }
  if (same(here, layout.pickup)) return actOnCounter(state);
  return "Nothing to do here. Walk next to a table, the counter or the capsule machine.";
}
export function clearQueue(state: CafeState) {
  const boss = manager(state);
  for (const job of boss.queue) release(state, job, boss.id);
  boss.queue = [];
}
/** The most tired staff Friend still on duty (for the T shortcut). */
export function mostTired(state: CafeState): Worker | null {
  return state.workers.filter(worker => worker.duty === "work" && (memberOf(state, worker)?.fatigue ?? 0) >= 20)
    .sort((a, b) => memberOf(state, b)!.fatigue - memberOf(state, a)!.fatigue)[0] ?? null;
}

// ---------- Simulation ----------
function replan(state: CafeState, worker: Worker) {
  const job = worker.job;
  if (!job) return;
  const goals = goalsFor(state, job);
  const from = worker.walker.path[0] ?? at(worker.walker);
  const path = goals && route(from, goals, state.blocked, plan(state));
  if (!path) { release(state, job, worker.id); worker.job = null; worker.walker.path = []; return; }
  worker.walker.path = worker.walker.path.length ? [worker.walker.path[0], ...path] : path;
}
function goalsFor(state: CafeState, job: Job): Tile[] | null {
  if (job.kind === "walk") return [job.to];
  if (job.kind === "pickup") return [plan(state).pickup];
  if (job.kind === "plate") return [chefPass(plan(state))];
  const customer = byId(state.customers, job.customer), table = customer && byId(state.items, customer.table);
  return table ? serviceTiles(table, state.blocked, plan(state)) : null;
}
function valid(state: CafeState, worker: Worker, job: Job): boolean {
  if (job.kind === "walk") return true;
  if (job.kind === "plate") return worker.carrying.length > 0;
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
  const carried = worker.carrying.map(id => byId(state.orders, id)).filter(order => order !== undefined);
  if (worker.role === "chef" && carried.length) return { kind: "plate" };
  if (carried.length) return { kind: "serve", customer: carried[0]!.customer };
  if (worker.role === "manager") return null;
  const home = same(at(worker.walker), worker.home) ? null : { kind: "walk" as const, to: worker.home };
  if (worker.role !== "waiter" || !isWorking(state, worker)) return home;
  const mine = new Set(manager(state).queue.flatMap(job => job.kind === "take" ? [job.customer] : []));
  if (state.orders.some(order => order.state === "ready")) return { kind: "pickup" };
  const waiting = state.customers.filter(customer => customer.state === "waiting" && customer.claimed === null && !mine.has(customer.id))
    .sort((a, b) => a.patience - b.patience)[0];
  if (waiting) { waiting.claimed = worker.id; return { kind: "take", customer: waiting.id }; }
  return home;
}

function finish(state: CafeState, worker: Worker, job: Job) {
  if (job.kind === "walk") return;
  if (job.kind === "plate") {
    // The chef sets the finished dishes on the pass for the waiters.
    for (const id of worker.carrying) {
      const order = byId(state.orders, id);
      if (order) { order.state = "ready"; order.carrier = null; state.events.push({ kind: "ready", dish: order.dish }); train(state, worker); tire(state, worker, FATIGUE.perDish); }
    }
    worker.carrying = [];
    return;
  }
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
    train(state, worker); tire(state, worker, FATIGUE.perTask);
    return;
  }
  if (job.kind === "serve" && customer.state === "ordered") {
    const order = state.orders.find(item => item.customer === customer.id && item.carrier === worker.id && item.state === "carried");
    if (!order) return;
    worker.carrying = worker.carrying.filter(id => id !== order.id);
    state.orders = state.orders.filter(item => item !== order);
    const fraction = customer.patience / customer.patienceMax;
    const tipRate = TIP_RATE * fraction + 0.02 * ambience(state) + 0.03 * Math.min(5, state.blends[0]) + (perk(state, 1) ? 0.1 : 0) + 0.05 * upgradeLevel(state, "tipjar")
      + 0.03 * (worker.role === "waiter" ? memberOf(state, worker)?.stats.skill ?? 0 : 0);
    const base = Math.round(dishById(order.dish).price * (1 + 0.06 * upgradeLevel(state, "plating")));
    const double = perk(state, 4) && state.rng() < 0.12;
    const amount = Math.round(base * (1 + tipRate)) * (customer.vip ? 3 : 1) * (double ? 2 : 1);
    customer.paid = amount; customer.state = "eating"; customer.eat = EAT_TIME * (1 - 0.2 * upgradeLevel(state, "dishwasher"));
    customer.mood = fraction > 0.5 ? "happy" : "ok";
    state.beans += amount;
    state.today.served++; state.today.beans += amount; state.today.tips += amount - base; state.today.best = Math.max(state.today.best, amount);
    if (customer.vip) state.today.vips++;
    state.totalServed++;
    rate(state, customer.mood === "happy" ? 5 : 4);
    gainXp(state, 1 + (customer.mood === "happy" ? 1 : 0) + (customer.vip ? 2 : 0));
    train(state, worker); tire(state, worker, FATIGUE.perTask);
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
  const layout = plan(state);
  customer.walker.path = route(at(customer.walker), [{ x: layout.lane, y: layout.door.y }], state.blocked, layout) ?? [];
}

/** A straight stroll along the street lane from `from` to one end. */
function stroll(layout: Plan, from: Tile, down: boolean): Tile[] {
  const end = down ? layout.laneEnd : layout.laneStart;
  return Array.from({ length: Math.abs(end - from.y) }, (_, index) => ({ x: layout.lane, y: from.y + (down ? index + 1 : -index - 1) }));
}
/** Friends stroll along the street in both directions. */
function spawnPasserby(state: CafeState) {
  const layout = plan(state), down = state.rng() < 0.5;
  const start = { x: layout.lane, y: down ? layout.laneStart : layout.laneEnd };
  const regular = state.regulars.length && state.rng() < 0.1 ? state.regulars[Math.floor(state.rng() * state.regulars.length)] : null;
  const body = walker(start, 1.4 + state.rng() * 0.6);
  body.path = stroll(layout, start, down);
  state.passersby.push({ id: state.nextId++, guest: Math.floor(state.rng() * state.guestCount), regular, walker: body, decided: false });
}
/** A passer-by at the door decides whether to come in (if a table is free). */
function considerEntering(state: CafeState, passer: Passerby) {
  passer.decided = true;
  const taken = new Set(state.customers.map(customer => customer.table));
  const free = tables(state).filter(table => !taken.has(table.id));
  if (isClosing(state) || !free.length || state.rng() >= walkInChance(state)) return;
  const table = free[Math.floor(state.rng() * free.length)], layout = plan(state), outside = { x: layout.lane, y: layout.door.y };
  const path = route(outside, [seatOf(table)], state.blocked, layout);
  if (!path?.length) return;
  const vip = state.blends[3] > 0 && state.rng() < 0.18, regular = vip ? null : passer.regular;
  const body = walker(outside, 2.2);
  body.path = path;
  state.passersby = state.passersby.filter(item => item !== passer);
  state.customers.push({
    id: state.nextId++, name: vip ? "Genesis VIP" : regular !== null ? `Regular #${regular}` : "", guest: passer.guest, regular, vip,
    walker: body, table: table.id, state: "arriving", dish: null, patience: 0, patienceMax: 1, eat: 0, claimed: null, mood: null, paid: 0,
  });
  state.today.walkIns++;
  const promoters = workingPromoters(state);
  if (promoters.length) train(state, promoters[Math.floor(state.rng() * promoters.length)]);
  state.events.push({ kind: "arrive", promoted: promoters.length > 0 });
}

export function update(state: CafeState, dt: number) {
  if (state.phase !== "open") return;
  dt = Math.min(dt, 0.1);
  state.clock += dt;
  const layout = plan(state);
  state.spawn -= dt;
  if (state.spawn <= 0) { spawnPasserby(state); state.spawn = PASSERBY_INTERVAL * (0.6 + state.rng() * 0.8); }
  for (const passer of [...state.passersby]) {
    step(passer.walker, dt);
    if (!passer.decided && Math.abs(passer.walker.y - layout.door.y) < 0.2) considerEntering(state, passer);
    if (!passer.walker.path.length) state.passersby = state.passersby.filter(item => item !== passer);
  }

  // Kitchen: finish cooking (crediting a working chef), then start queued orders in free slots.
  // A chef in the kitchen carries each finished dish to the pass; with no chef it appears there straight away.
  for (const order of state.orders) if (order.state === "cooking" && (order.progress += dt) >= order.duration) {
    const cooks = activeChefs(state).filter(worker => worker.carrying.length < 2);
    const chef = cooks.sort((a, b) => a.carrying.length - b.carrying.length || Math.abs(a.walker.y - layout.pass.y) - Math.abs(b.walker.y - layout.pass.y))[0];
    if (chef) { order.state = "plating"; order.carrier = chef.id; chef.carrying.push(order.id); }
    else { order.state = "ready"; state.events.push({ kind: "ready", dish: order.dish }); }
  }
  let cooking = state.orders.filter(order => order.state === "cooking").length;
  for (const order of state.orders) if (order.state === "queued" && cooking < kitchenSlots(state)) {
    order.state = "cooking"; order.duration = cookTime(state, order.dish); cooking++;
  }

  for (const customer of [...state.customers]) {
    const { walker: body } = customer;
    step(body, dt);
    if (customer.state === "arriving" && !body.path.length) {
      customer.state = "waiting"; body.facing = DIR_FACING[state.items.find(item => item.id === customer.table)?.dir ?? 0];
      customer.patienceMax = customer.patience = ORDER_PATIENCE * patienceMultiplier(state);
    } else if (customer.state === "waiting" || customer.state === "ordered") {
      customer.patience -= dt;
      if (customer.patience <= 0) leave(state, customer, true);
    } else if (customer.state === "eating" && (customer.eat -= dt) <= 0) leave(state, customer, false);
    else if (customer.state === "leaving" && !body.path.length) {
      // Back out on the sidewalk, they stroll off down the street.
      state.customers = state.customers.filter(item => item !== customer);
      const from = at(body), path = stroll(layout, from, state.rng() < 0.5);
      if (from.x === layout.lane && path.length) {
        const strolling = walker(from, 1.6); strolling.path = path;
        state.passersby.push({ id: state.nextId++, guest: customer.guest, regular: customer.regular, walker: strolling, decided: true });
      }
    }
  }

  for (const worker of state.workers) {
    const body = worker.walker, member = memberOf(state, worker);
    body.speed = workerSpeed(state, worker);
    // Breaks: walk to the break room, rest there, then head back to work.
    if (worker.duty === "to-break") {
      step(body, dt);
      if (!body.path.length) { worker.duty = "resting"; worker.job = null; body.facing = "down"; }
      continue;
    }
    if (worker.duty === "resting") {
      if (member) member.fatigue = Math.max(0, member.fatigue - member.fatigue * Math.min(1, dt / Math.max(dt, worker.rest)));
      worker.rest -= dt;
      if (worker.rest <= 0) { worker.duty = "work"; worker.rest = 0; if (member) member.fatigue = 0; state.events.push({ kind: "rested", slot: worker.slot }); }
      continue;
    }
    if (worker.role === "promoter" && isWorking(state, worker) && same(at(body), worker.home) && !body.path.length) {
      tire(state, worker, FATIGUE.promoterPerSecond * dt);
    }
    if (worker.action > 0) {
      if ((worker.action -= dt) <= 0) { const job = worker.job!; worker.job = null; worker.action = 0; finish(state, worker, job); }
      continue;
    }
    if (worker.role === "manager" && state.manual && body.path.length > 1) body.path = [body.path[0]];
    if (worker.role === "manager" && state.manual && !body.path.length) {
      const here = at(body), next = { x: here.x + state.manual.dx, y: here.y + state.manual.dy };
      if (worker.job) { release(state, worker.job, worker.id); worker.job = null; }
      if (inDining(next, layout) && !state.blocked.has(key(next))) body.path = [next];
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
    if (job.kind === "walk") { worker.job = null; if (worker.role === "chef") body.facing = layout.kitchenSide === "left" ? "left" : "up"; continue; }
    const customer = job.kind === "pickup" || job.kind === "plate" ? null : byId(state.customers, job.customer);
    const target = job.kind === "pickup" || job.kind === "plate" ? layout.pass : byId(state.items, customer?.table ?? -1) ?? body;
    const dx = target.x - body.x, dy = target.y - body.y;
    body.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
    worker.action = job.kind === "take" ? 0.45 : job.kind === "pickup" || job.kind === "plate" ? 0.3 : 0.35;
  }

  if (isClosing(state) && !state.customers.length) {
    state.phase = "summary";
    for (const worker of state.workers) { worker.queue = []; worker.job = null; worker.carrying = []; }
    state.orders = [];
    state.events.push({ kind: "dayEnd" });
  }
}

export { DAY_LENGTH };
