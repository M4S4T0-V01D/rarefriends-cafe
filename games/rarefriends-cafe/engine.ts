/**
 * RareFriends Cafe simulation. Pure and deterministic for a given random source, so it runs in Node tests.
 * Beans, levels, staff and furniture are in-shop progress; the SDK runtime owns RF.
 */
import {
  EVENTS, eventById, type EventId, CHALLENGES, SCENERIES, challengeReward, sceneryById, type ChallengeId, type SceneryId, isTable, AMBIENCE_LEVELS, BASE_WALK_IN, BLEND_BONUSES, CATALOG, DAY_LENGTH, DUPLICATE_BEANS, EXCLUSIVES, EAT_TIME, EXPAND_COSTS, EXPAND_LEVELS, FATIGUE, FLOORS, FOOD_PATIENCE,
  LEVEL_XP, MACHINE_COSTS, MAX_LEVEL, MAX_STAFF_SLOTS, ORDER_PATIENCE, PASSERBY_INTERVAL, PROMOTER_PULL, SELL_REFUND, SHOPS, START_STAFF_SLOTS,
  BOOSTS, MANAGER_SKILLS, MAX_STAT, STAFF_SLOT_COSTS, type BoostId, type SkillId, STAFF_SLOT_LEVELS, TIP_RATE, type StatId, UPGRADES, WALLPAPERS, breakSeconds, catalogItem, isRug, upgradeById, type UpgradeId, dishById, machineFactor, shopById, tableLimit, tierOf, workerLevel,
  type DishId, type ItemKind, type ShopId,
} from "./data.ts";
import {
  DEFAULT_ITEMS, FACING, MAX_EXTENT, MAX_SIZE, START_SIZE, seatsOf, blockedTiles, capsuleProblem, defaultItems, fromKey, inDining, inside, isBuilding, isDir, key, placementProblem, planFor, route, same, seatOf, serviceTiles,
  type BuildingId, type Dir, type Item, type Placement, type Plan, type Tile,
} from "./layout.ts";

export type Facing = "down" | "up" | "left" | "right";
export type Walker = { x: number; y: number; path: Tile[]; speed: number; facing: Facing; moving: boolean };
export type CustomerState = "arriving" | "waiting" | "ordered" | "eating" | "leaving";
export type Customer = {
  id: number; name: string; guest: number; regular: number | null; vip: boolean; walker: Walker;
  /** Id of the table item the guest sits at, and which of its chairs. Guests arrive in parties that fill a table. */
  table: number; seat: number;
  state: CustomerState; dish: DishId | null; patience: number; patienceMax: number; eat: number;
  claimed: number | null; mood: "happy" | "ok" | "angry" | null; paid: number;
  /** A food critic or a celebrity Friend, from a random event. */
  special?: "critic" | "celebrity";
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
  | { kind: "tired"; slot: number } | { kind: "workerLevel"; slot: number; level: number } | { kind: "rested"; slot: number }
  | { kind: "challenge"; text: string; beans: number } | { kind: "event"; id: EventId };
/** One day's numbers. `done` lists the day's finished challenges; `rewards` is the Beans they paid. */
export type DayStats = { served: number; lost: number; beans: number; tips: number; vips: number; best: number; walkIns: number;
  happy: number; group: number; done: ChallengeId[]; rewards: number };
export type Phase = "intro" | "open" | "summary";

export type CafeState = {
  phase: Phase; shop: ShopId; started: boolean; day: number; clock: number; beans: number; xp: number; level: number; rating: number;
  size: number; machine: number; unlocked: Set<DishId>; blends: number[]; familyId: number; guestCount: number; regulars: number[];
  items: Item[]; wallpaper: string; floor: string; finishes: Set<string>; collection: Set<string>; prefs: Prefs;
  /** The capsule machine's spot once moved; null keeps the default corner by the window. */
  capsule: Placement | null; upgrades: Partial<Record<UpgradeId, number>>; building: BuildingId;
  /** Manager skill points spent, and RF boosts with the shop days they have left. */
  skills: Partial<Record<SkillId, number>>; boosts: Partial<Record<BoostId, number>>;
  /** Today's random event: when it starts (shop seconds), when a timed one ends, and whether its special guest has come. */
  event: { id: EventId; at: number; until: number; started: boolean; guestArrived: boolean } | null;
  /** The world around the building, and the sceneries owned. */
  scenery: SceneryId; sceneries: Set<SceneryId>;
  staffSlots: number; staff: StaffMember[]; ownedFriends: number[]; generations: Record<number, number>; applicants: number[];
  customers: Customer[]; passersby: Passerby[]; orders: Order[]; workers: Worker[]; events: CafeEvent[];
  spawn: number; nextId: number; blocked: Set<number>; manual: { dx: number; dy: number } | null;
  today: DayStats; totalServed: number; rng: () => number;
};
export type OwnedInput = number | { id: number; generation: number | null };
/** Audio and interface preferences, saved with the wallet's shop. `confirm` asks before Beans purchases. */
/** `shuffle`: move on to a random unlocked track every `shuffleEvery` seconds. */
export type Prefs = { track: string; music: boolean; sfx: boolean; volume: number; confirm: boolean; theme: "auto" | "light" | "dark"; shuffle: boolean; shuffleEvery: number };
export const SHUFFLE_EVERY = [60, 120, 180, 300] as const;
export const DEFAULT_PREFS: Prefs = { track: "latte", music: true, sfx: true, volume: 0.6, confirm: true, theme: "auto", shuffle: false, shuffleEvery: 120 };

const perk = (state: CafeState, family: number) => state.familyId === family;
const emptyDay = (): DayStats => ({ served: 0, lost: 0, beans: 0, tips: 0, vips: 0, best: 0, walkIns: 0, happy: 0, group: 0, done: [], rewards: 0 });
/** Sprite facing for each item `dir`; a seated guest faces their table, which lies that way from the chair. */
export const DIR_FACING: readonly Facing[] = ["down", "right", "up", "left"];
const walker = (tile: Tile, speed: number): Walker => ({ x: tile.x, y: tile.y, path: [], speed, facing: "down", moving: false });
const byId = <T extends { id: number }>(items: readonly T[], id: number) => items.find(item => item.id === id);
const at = (body: Walker): Tile => ({ x: Math.round(body.x), y: Math.round(body.y) });
export const plan = (state: CafeState): Plan => planFor(state.size, { building: state.building, capsule: state.capsule });
/** Build-mode selection id for the capsule machine (items have positive ids). */
export const CAPSULE_ID = -1;
export const upgradeLevel = (state: CafeState, id: UpgradeId) => state.upgrades[id] ?? 0;
export const skillLevel = (state: CafeState, id: SkillId) => state.skills[id] ?? 0;
/** Is today's event running? Guest events count from their start until the day ends. */
export const eventActive = (state: CafeState, id: EventId) => Boolean(state.event && state.event.id === id && state.event.started && state.clock < state.event.until);
export const eventSecondsLeft = (state: CafeState) => state.event?.started && state.event.until > state.clock ? Math.ceil(state.event.until - state.clock) : 0;
export const boostActive = (state: CafeState, id: BoostId) => (state.boosts[id] ?? 0) > 0;
/** Unspent manager skill points: one per café level past the first. */
export const skillPoints = (state: CafeState) => state.level - 1 - Object.values(state.skills).reduce((sum, points) => sum + (points ?? 0), 0);
export function raiseSkill(state: CafeState, id: SkillId): string | null {
  const skill = MANAGER_SKILLS.find(item => item.id === id);
  if (!skill) return "Unknown skill.";
  if (skillLevel(state, id) >= skill.max) return "That skill is maxed.";
  if (skillPoints(state) <= 0) return "No skill points. You earn one each café level.";
  state.skills[id] = skillLevel(state, id) + 1;
  return null;
}
/** Start (or extend) an RF boost. Called once its capsules have been opened through the SDK. */
export function addBoost(state: CafeState, id: BoostId) {
  const boost = BOOSTS.find(item => item.id === id);
  if (boost) state.boosts[id] = (state.boosts[id] ?? 0) + boost.days;
}

export function createCafe(options: {
  familyId: number; guestCount: number; regulars?: number[]; ownedFriends?: OwnedInput[]; shop?: ShopId; rng?: () => number;
}): CafeState {
  const guestCount = Math.max(1, options.guestCount);
  const state: CafeState = {
    phase: "intro", shop: options.shop ?? "cafe", started: false, day: 1, clock: 0, beans: 30, xp: 0, level: 1, rating: 3.5,
    size: START_SIZE, machine: 0, unlocked: new Set(), blends: [0, 0, 0, 0], familyId: options.familyId, guestCount, regulars: options.regulars ?? [],
    items: DEFAULT_ITEMS.map(item => ({ ...item })), wallpaper: "plain", floor: "checker", finishes: new Set(["plain", "checker"]),
    collection: new Set(), prefs: { ...DEFAULT_PREFS }, capsule: null, upgrades: {}, building: "corner", skills: {}, boosts: {}, scenery: "lot", sceneries: new Set(["lot"]), event: null,
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
const managerSpeed = (state: CafeState) => 3.3 * (perk(state, 5) ? 1.3 : 1) * (1 + 0.08 * upgradeLevel(state, "shoes")) * (1 + 0.08 * skillLevel(state, "quick"));
function workerSpeed(state: CafeState, worker: Worker) {
  if (worker.role === "manager") return managerSpeed(state);
  const member = memberOf(state, worker);
  const base = 2.5 * (member ? staffPower(state, member) * (1 + 0.06 * member.stats.speed) : 1) * (perk(state, 2) ? 1.25 : 1) * (1 + 0.05 * skillLevel(state, "leader")) * (1 + 0.05 * upgradeLevel(state, "training"));
  return worker.duty === "work" && isTired(member) ? base * 0.85 : base;
}
export function carryCapacity(state: CafeState, worker: Worker) {
  if (worker.role === "manager") return (perk(state, 3) ? 3 : 2) + upgradeLevel(state, "tray") + skillLevel(state, "hands");
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
export const kitchenSlots = (state: CafeState) => 1 + activeChefs(state).length + upgradeLevel(state, "station");
export const tables = (state: CafeState) => state.items.filter(item => isTable(item.kind));
/** The chair a guest sits on. */
const seatFor = (state: CafeState, customer: Customer) => { const table = byId(state.items, customer.table); return table ? seatsOf(table)[customer.seat] ?? null : null; };
const partyOf = (state: CafeState, customer: Customer) => state.customers.filter(other => other.table === customer.table && other.state !== "leaving");
/** A party orders together, once everyone has sat down. */
const partySeated = (state: CafeState, customer: Customer) => partyOf(state, customer).every(other => other.state !== "arriving");
function tire(state: CafeState, worker: Worker, amount: number) {
  const member = memberOf(state, worker);
  if (!member || boostActive(state, "tireless")) return;
  const wasTired = isTired(member);
  member.fatigue = Math.min(FATIGUE.exhausted, member.fatigue + amount * (1 - FATIGUE.levelRelief * (workerLevel(member.xp) - 1)) * (1 - 0.12 * upgradeLevel(state, "breakroom")) * (1 - 0.08 * member.stats.stamina) * (1 - 0.05 * skillLevel(state, "leader")));
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
  const finish = (WALLPAPERS.find(item => item.id === state.wallpaper)?.ambience ?? 0) + (FLOORS.find(item => item.id === state.floor)?.ambience ?? 0)
    + sceneryById(state.scenery).ambience;
  return finish + state.items.reduce((sum, item) => sum + catalogItem(item.kind).ambience, 0);
}
/** Ambience level 0–5 from placed décor, wallpaper and floor. */
export const ambience = (state: CafeState) => AMBIENCE_LEVELS.filter(points => ambiencePoints(state) >= points).length;

const patienceMultiplier = (state: CafeState) =>
  (1 + 0.06 * ambience(state)) * (perk(state, 6) ? 1.25 : 1) * (state.blends[2] > 0 ? 1.1 : 1) * (1 + 0.08 * upgradeLevel(state, "chairs")) * (1 + 0.05 * skillLevel(state, "calm")) * (eventActive(state, "rain") ? 1.3 : 1);
export function cookTime(state: CafeState, dish: DishId) {
  const chefFactor = activeChefs(state).reduce((factor, worker) => {
    const member = memberOf(state, worker)!;
    return factor * (1 - 0.06 * (staffPower(state, member) - 0.5) - 0.04 * member.stats.skill);
  }, 1);
  return dishById(dish).cook * machineFactor(state.machine) * (perk(state, 0) ? 0.85 : 1) * Math.max(0.65, chefFactor) * (1 - 0.06 * upgradeLevel(state, "chefhat")) * (eventActive(state, "hiccup") ? 1.25 : 1);
}
const workingPromoters = (state: CafeState) =>
  state.workers.filter(worker => worker.role === "promoter" && isWorking(state, worker) && same(at(worker.walker), worker.home));
/** Chance that a passer-by steps in: ambience, rating and working promoters on the sidewalk raise it. */
export function walkInChance(state: CafeState) {
  let pull = workingPromoters(state).reduce((sum, worker) => {
    const member = memberOf(state, worker)!;
    return sum + PROMOTER_PULL * staffPower(state, member) * (1 + 0.08 * member.stats.skill);
  }, 0);
  if (eventActive(state, "bus")) pull += 0.15;
  const base = BASE_WALK_IN * (1 + 0.1 * ambience(state) + 0.08 * (state.rating - 3)) * (perk(state, 8) ? 1.15 : 1) * (1 + 0.06 * upgradeLevel(state, "sign")) * (1 + 0.1 * upgradeLevel(state, "neon"));
  return Math.min(0.9, base + pull);
}

export function availableDishes(state: CafeState): DishId[] {
  return shopById(state.shop).menu.filter(dish => dish.blend === undefined ? state.unlocked.has(dish.id) : state.blends[dish.blend] > 0).map(dish => dish.id);
}
/** The guest at a table who needs something next (waiting to order, then a dish), else anyone there. */
export const customerAt = (state: CafeState, tableId: number) => {
  const party = state.customers.filter(customer => customer.table === tableId);
  return party.find(customer => customer.state === "waiting") ?? party.find(customer => state.orders.some(order => order.customer === customer.id && order.state === "ready"))
    ?? party.find(customer => customer.state === "ordered") ?? party[0];
};

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

// ---------- Daily challenges ----------
/** Today's three challenges, picked by the day number (group tables only when the shop has one). */
export function challengesFor(state: CafeState) {
  const eligible = CHALLENGES.filter(item => item.id !== "group" || tables(state).some(table => (catalogItem(table.kind).seats ?? 1) > 1));
  // A shuffle seeded by the day number, so everyone gets the same three on the same day.
  let seed = (state.day * 2654435761) >>> 0;
  const next = () => { seed = (Math.imul(seed ^ (seed >>> 15), 2246822507) + 0x9e3779b9) >>> 0; return seed / 4294967296; };
  const picked = [...eligible].map(item => ({ item, order: next() })).sort((a, b) => a.order - b.order).slice(0, 3).map(entry => entry.item);
  return picked.map(item => {
    const target = item.target(state.day), progress = challengeProgress(state, item.id);
    return { id: item.id, text: item.text(target), target, progress, done: state.today.done.includes(item.id) };
  });
}
function challengeProgress(state: CafeState, id: ChallengeId) {
  const today = state.today;
  if (id === "perfect") return today.lost === 0 && today.served > 0 ? 1 : 0;
  if (id === "rating") return state.rating >= 4.5 ? 1 : 0;
  return id === "served" ? today.served : id === "happy" ? today.happy : id === "beans" ? today.beans : id === "tips" ? today.tips : id === "walkIns" ? today.walkIns : today.group;
}
/** Pay out finished challenges. Perfect days and ratings are judged at closing. */
function checkChallenges(state: CafeState, closing: boolean) {
  for (const challenge of challengesFor(state)) {
    if (challenge.done || ((challenge.id === "perfect" || challenge.id === "rating") && !closing) || challenge.progress < challenge.target) continue;
    const reward = challengeReward(state.day);
    state.today.done.push(challenge.id); state.today.rewards += reward.beans; state.beans += reward.beans; gainXp(state, reward.xp);
    state.events.push({ kind: "challenge", text: challenge.text, beans: reward.beans });
  }
}

// ---------- Outside ----------
/** Buy (Beans) or switch to an owned scenery. RF sceneries are unlocked with capsules through `unlockScenery`. */
export function applyScenery(state: CafeState, id: SceneryId): string | null {
  const scenery = SCENERIES.find(item => item.id === id);
  if (!scenery) return "Unknown scenery.";
  if (!state.sceneries.has(id)) {
    if (scenery.capsules) return `${scenery.name} is paid with ${scenery.capsules} capsules (RF): Capsules → Boosts.`;
    if (state.beans < scenery.cost) return "Not enough Beans.";
    state.beans -= scenery.cost; state.sceneries.add(id);
  }
  state.scenery = id;
  return null;
}
/** An RF scenery bought with capsules: unlock it and move in. */
export function unlockScenery(state: CafeState, id: SceneryId) { state.sceneries.add(id); state.scenery = id; }

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
  if (!state.started) state.items = defaultItems(id, state.size).map(item => ({ ...item }));
  else refitItems(state);
  syncWorkers(state); afterLayoutChange(state);
  for (const worker of state.workers) { worker.walker.x = worker.home.x; worker.walker.y = worker.home.y; worker.walker.path = []; }
  return null;
}

// ---------- Beans purchases ----------
export type Purchase = "machine" | "slot" | "expand";
export const expansions = (state: CafeState) => state.size - START_SIZE;
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
    state.size += 1;
    state.staffSlots = Math.min(MAX_STAFF_SLOTS, state.staffSlots + 1);
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
  if (!kept.some(item => isTable(item.kind))) {
    const spare = [...defaultItems(state.building, state.size), ...DEFAULT_ITEMS].find(table => !placementProblem(kept, table, plan(state)));
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
  // Past the preferred posts, waiters wait on open tiles around the pass.
  const around = [...layout.dining].map(fromKey).filter(tile => !candidates.some(other => same(other, tile)))
    .sort((a, b) => Math.hypot(a.x - layout.pickup.x, a.y - layout.pickup.y) - Math.hypot(b.x - layout.pickup.x, b.y - layout.pickup.y));
  const reserved = [layout.pickup, layout.door, layout.capsuleSpot, ...layout.clear];
  const free = [...candidates, ...around].filter(tile => inDining(tile, layout) && !state.blocked.has(key(tile)) && !reserved.some(other => same(other, tile))
    && !state.items.some(item => seatsOf(item).some(seat => same(seat, tile))));
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
  return state.items.find(item => !isRug(item.kind) && (same(item, tile) || seatsOf(item).some(seat => same(seat, tile))))
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
    const seat = seatFor(state, customer);
    if (customer.state === "arriving" && table && seat) customer.walker.path = route(at(customer.walker), [seat], state.blocked, layout) ?? [seat];
    if (customer.state === "leaving") customer.walker.path = route(at(customer.walker), [{ x: layout.lane, y: layout.door.y }], state.blocked, layout) ?? [];
  }
}
/** Place a new item bought with Beans. */
export function placeItem(state: CafeState, kind: ItemKind, tile: Tile, dir: Dir = 0): string | null {
  const entry = catalogItem(kind);
  if (entry.tier !== undefined && !state.collection.has(kind)) return `${entry.name} comes from Rare Recipe Capsules.`;
  if (entry.tier !== undefined && state.items.some(item => item.kind === kind)) return `Your ${entry.name} is already placed. Move it instead.`;
  if (isTable(kind) && tableCount(state) >= tableLimit(state.level)) return `Level ${state.level} allows ${tableLimit(state.level)} tables. Level up for more.`;
  if (state.beans < entry.cost) return "Not enough Beans.";
  const candidate = { kind, x: tile.x, y: tile.y, dir };
  if (occupiedByGuest(state, tile) || seatsOf(candidate).some(seat => occupiedByGuest(state, seat))) return "A guest is standing there.";
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
  if (isTable(item.kind) && occupiedTable(state, id)) return "A guest is using that table.";
  const candidate = { kind: item.kind, x: tile.x, y: tile.y, dir: dir ?? item.dir };
  if (occupiedByGuest(state, tile) || seatsOf(candidate).some(seat => occupiedByGuest(state, seat))) return "A guest is standing there.";
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
  if (isTable(item.kind) && occupiedTable(state, id)) return "A guest is using that table.";
  if (isTable(item.kind) && tableCount(state) <= 1) return "Keep at least one table.";
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
  // From day two, most days bring one random event partway through.
  state.event = null;
  if (state.day >= 2 && state.rng() < 0.65) {
    const pick = EVENTS[Math.floor(state.rng() * EVENTS.length)], at = DAY_LENGTH * (0.15 + state.rng() * 0.45);
    state.event = { id: pick.id, at, until: at + pick.duration, started: false, guestArrived: false };
  }
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
  skills?: Partial<Record<SkillId, number>>; boosts?: Partial<Record<BoostId, number>>; scenery?: SceneryId; sceneries?: SceneryId[];
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
    skills: { ...state.skills }, boosts: { ...state.boosts }, scenery: state.scenery, sceneries: [...state.sceneries],
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
    || !int(save.staffSlots, START_STAFF_SLOTS, MAX_STAFF_SLOTS) || !int(save.totalServed, 0, 1e9) || !int(size, START_SIZE, MAX_SIZE)
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
  const skills = save.skills && typeof save.skills === "object" ? save.skills : {}, boosts = save.boosts && typeof save.boosts === "object" ? save.boosts : {};
  if (!Object.entries(skills).every(([id, points]) => MANAGER_SKILLS.some(item => item.id === id && int(points, 0, item.max)))
    || Object.values(skills).reduce((sum, points) => sum + (points ?? 0), 0) > save.level! - 1
    || !Object.entries(boosts).every(([id, days]) => BOOSTS.some(item => item.id === id) && int(days, 0, 1000))) return false;
  const sceneryIds = new Set<string>(SCENERIES.map(item => item.id));
  const owned = new Set<SceneryId>(["lot", ...(Array.isArray(save.sceneries) ? save.sceneries.filter(id => sceneryIds.has(id)) : [])]);
  if (save.scenery !== undefined && !owned.has(save.scenery)) return false;
  if (save.items.length > 300 || !save.items.every(item => item && kinds.has(item.kind) && int(item.x, 0, MAX_EXTENT) && int(item.y, 0, MAX_EXTENT) && isDir(item.dir))) return false;
  Object.assign(state, {
    shop: shop.id, started: true, day: save.day, beans: save.beans, xp: save.xp, level: save.level, rating: save.rating, machine: save.machine, size,
    unlocked: new Set(save.unlocked), wallpaper: save.wallpaper, floor: save.floor, finishes: new Set(save.finishes),
    staffSlots: save.staffSlots, totalServed: save.totalServed, staff: [], collection: new Set(collection), upgrades: { ...upgrades }, capsule: null, building: save.building ?? "corner", skills: { ...skills }, boosts: { ...boosts }, scenery: save.scenery ?? "lot", sceneries: owned,
    prefs: { track: typeof prefs.track === "string" ? prefs.track : DEFAULT_PREFS.track, music: prefs.music !== false, sfx: prefs.sfx !== false,
      volume: typeof prefs.volume === "number" && prefs.volume >= 0 && prefs.volume <= 1 ? prefs.volume : DEFAULT_PREFS.volume,
      confirm: prefs.confirm !== false, theme: prefs.theme === "light" || prefs.theme === "dark" ? prefs.theme : "auto",
      shuffle: prefs.shuffle === true, shuffleEvery: (SHUFFLE_EVERY as readonly unknown[]).includes(prefs.shuffleEvery) ? prefs.shuffleEvery : DEFAULT_PREFS.shuffleEvery },
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
    if (!partySeated(state, customer)) return "Their friends are still finding their seats.";
    const claimed = partyOf(state, customer).find(other => other.claimed !== null && other.claimed !== boss.id);
    if (claimed) return "A staff Friend is already taking that table's order.";
    return enqueue(state, { kind: "take", customer: id }) ? "Taking the order." : "Already on your list.";
  }
  const order = state.orders.find(item => item.customer === id);
  if (!order) return "";
  if (order.state === "carried" && order.carrier === boss.id) return enqueue(state, { kind: "serve", customer: id }, true) ? "Serving." : "Already on your list.";
  if (order.state === "carried") return "A staff Friend is bringing that dish.";
  if (order.state === "ready") {
    // Fetch every ready dish for the table in one trip.
    const ready = partyOf(state, customer).filter(other => state.orders.some(item => item.customer === other.id && item.state === "ready"));
    enqueue(state, { kind: "pickup" });
    for (const guest of ready) enqueue(state, { kind: "serve", customer: guest.id });
    return ready.length > 1 ? `Fetching ${ready.length} dishes for the table.` : `Fetching ${dishById(order.dish).name}.`;
  }
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
  if (worker.role === "chef" && isWorking(state, worker) && worker.duty === "work") return tendJob(state, worker);
  const home = same(at(worker.walker), worker.home) ? null : { kind: "walk" as const, to: worker.home };
  if (worker.role !== "waiter" || !isWorking(state, worker)) return home;
  const mine = new Set(manager(state).queue.flatMap(job => job.kind === "take" ? [job.customer] : []));
  if (state.orders.some(order => order.state === "ready")) return { kind: "pickup" };
  const busy = new Set(state.customers.filter(customer => customer.claimed !== null || mine.has(customer.id)).map(customer => customer.table));
  const waiting = state.customers.filter(customer => customer.state === "waiting" && !busy.has(customer.table) && partySeated(state, customer))
    .sort((a, b) => a.patience - b.patience)[0];
  if (waiting) { waiting.claimed = worker.id; return { kind: "take", customer: waiting.id }; }
  return home;
}

/**
 * A working chef keeps moving along the chef row between the fridge, stoves, sink and prep top: a short stop at each
 * while dishes cook, drifting back to their own station when the kitchen is quiet.
 */
function tendJob(state: CafeState, worker: Worker): Job | null {
  const layout = plan(state), here = at(worker.walker);
  const taken = new Set(state.workers.filter(other => other !== worker && other.role === "chef")
    .flatMap(other => [key(at(other.walker)), ...(other.job?.kind === "walk" ? [key(other.job.to)] : [])]));
  const busy = state.orders.some(order => order.state === "cooking");
  if (!busy && !same(here, worker.home) && !taken.has(key(worker.home)) && state.rng() < 0.6) return { kind: "walk", to: worker.home };
  const spots = layout.chefSpots.filter(tile => !same(tile, here) && !taken.has(key(tile)));
  const near = spots.filter(tile => Math.abs(tile.x - here.x) + Math.abs(tile.y - here.y) <= 3);
  const pool = near.length ? near : spots;
  return pool.length ? { kind: "walk", to: pool[Math.floor(state.rng() * pool.length)] } : null;
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
    // The whole table orders at once.
    const menu = availableDishes(state);
    const weights = menu.map(id => dishById(id).blend !== undefined ? 2 : 1);
    for (const guest of partyOf(state, customer).filter(other => other.state === "waiting")) {
      let roll = state.rng() * weights.reduce((sum, weight) => sum + weight, 0), dish = menu[0];
      for (let index = 0; index < menu.length; index++) { roll -= weights[index]; if (roll < 0) { dish = menu[index]; break; } }
      guest.state = "ordered"; guest.dish = dish; guest.claimed = null;
      guest.patienceMax = guest.patience = FOOD_PATIENCE * patienceMultiplier(state);
      state.orders.push({ id: state.nextId++, customer: guest.id, dish, state: "queued", progress: 0, duration: cookTime(state, dish), carrier: null });
      state.events.push({ kind: "order", x: guest.walker.x, y: guest.walker.y });
    }
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
      + 0.03 * (worker.role === "waiter" ? memberOf(state, worker)?.stats.skill ?? 0 : 0) + (worker.role === "manager" ? 0.04 * skillLevel(state, "charm") : 0) + (eventActive(state, "rush") ? 0.2 : 0);
    const base = Math.round(dishById(order.dish).price * (1 + 0.06 * upgradeLevel(state, "plating")));
    const double = perk(state, 4) && state.rng() < 0.12;
    let amount = Math.round(base * (1 + tipRate) * (boostActive(state, "golden") ? 1.25 : 1)) * (customer.vip ? 3 : 1) * (double ? 2 : 1);
    customer.paid = amount; customer.state = "eating"; customer.eat = EAT_TIME * (1 - 0.2 * upgradeLevel(state, "dishwasher"));
    customer.mood = fraction > 0.5 ? "happy" : "ok";
    // Event guests: a happy critic writes a glowing review; a celebrity pays handsomely.
    if (customer.special === "critic" && customer.mood === "happy") { amount += 80; state.rating = Math.min(5, state.rating + 0.3); }
    if (customer.special === "celebrity") { amount += 150; state.rating = Math.min(5, state.rating + 0.15); }
    customer.paid = amount;
    state.beans += amount;
    state.today.served++; if (customer.mood === "happy") state.today.happy++; if ((catalogItem(byId(state.items, customer.table)?.kind ?? "table").seats ?? 1) > 1) state.today.group++;
    state.today.beans += amount; state.today.tips += amount - base; state.today.best = Math.max(state.today.best, amount);
    if (customer.vip) state.today.vips++;
    state.totalServed++;
    rate(state, customer.mood === "happy" ? 5 : 4);
    gainXp(state, 1 + (customer.mood === "happy" ? 1 : 0) + (customer.vip ? 2 : 0));
    checkChallenges(state, false);
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
    if (customer.special === "critic") state.rating = Math.max(1, state.rating - 0.4);
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
/** A side sidewalk (the café's, or across the side road at `sideFar`) from its far end to the corner (or back), one tile at a time. */
function sideWalk(layout: Plan, east: boolean, row = layout.side): Tile[] {
  const xs = Array.from({ length: layout.lane - layout.sideStart + 1 }, (_, index) => layout.sideStart + index);
  return (east ? xs : xs.reverse()).map(x => ({ x, y: row }));
}
/** Friends stroll along the street in both directions, and some come round the corner from the side sidewalk. */
function spawnPasserby(state: CafeState) {
  const layout = plan(state), down = state.rng() < 0.5, corner = state.rng() < 0.35;
  const regular = state.regulars.length && state.rng() < 0.1 ? state.regulars[Math.floor(state.rng() * state.regulars.length)] : null;
  let start: Tile, path: Tile[];
  if (corner && down) {
    // Down the street, round the corner and off along the side; some cross the side road first and take the far sidewalk.
    const row = state.rng() < 0.5 ? layout.side : layout.sideFar;
    start = { x: layout.lane, y: layout.laneStart };
    path = [...stroll(layout, start, true).filter(tile => tile.y <= row), ...sideWalk(layout, false, row).slice(1)];
  } else if (corner) {
    // In from the side, round the corner and up the street past the door.
    const along = sideWalk(layout, true);
    start = along[0]; path = [...along.slice(1), ...stroll(layout, { x: layout.lane, y: layout.side }, false)];
  } else { start = { x: layout.lane, y: down ? layout.laneStart : layout.laneEnd }; path = stroll(layout, start, down); }
  // The neighbourhood: some Friends come out of the other shops, some pop into one, some stay across the road.
  let decided = false;
  const roll = state.rng(), homes = layout.neighbours.filter(n => n.row !== "far");
  if (roll < 0.18) {
    const ys = Array.from({ length: layout.laneEnd - layout.laneStart + 1 }, (_, index) => layout.laneStart + index);
    const along = (down ? ys : ys.reverse()).map(y => ({ x: layout.farLane, y }));
    start = along[0]; path = along.slice(1); decided = true;
    const shop = layout.neighbours.find(n => n.row === "far" && state.rng() < 0.3 && path.findIndex(tile => same(tile, n.approach)) > 3);
    if (shop) path = [...path.slice(0, path.findIndex(tile => same(tile, shop.approach)) + 1), shop.door];
  } else if (roll < 0.36 && homes.length) {
    const home = homes[Math.floor(state.rng() * homes.length)];
    start = home.door;
    path = home.row === "side"
      ? [home.approach, ...sideWalk(layout, true, layout.sideFar).filter(tile => tile.x > home.approach.x), ...stroll(layout, { x: layout.lane, y: layout.sideFar }, false)]
      : [home.approach, { x: layout.lane, y: home.approach.y }, ...stroll(layout, { x: layout.lane, y: home.approach.y }, true)];
  } else if (state.rng() < 0.3) {
    const shop = homes.find(n => path.findIndex(tile => same(tile, n.approach)) > 3);
    if (shop) path = [...path.slice(0, path.findIndex(tile => same(tile, shop.approach)) + 1), shop.door];
  }
  const body = walker(start, 1.4 + state.rng() * 0.6);
  body.path = path;
  state.passersby.push({ id: state.nextId++, guest: Math.floor(state.rng() * state.guestCount), regular, walker: body, decided });
}
/** A passer-by at the door decides whether to come in (if a table is free). */
function considerEntering(state: CafeState, passer: Passerby) {
  passer.decided = true;
  const taken = new Set(state.customers.map(customer => customer.table));
  const free = tables(state).filter(table => !taken.has(table.id));
  if (isClosing(state) || !free.length || state.rng() >= walkInChance(state)) return;
  const table = free[Math.floor(state.rng() * free.length)], layout = plan(state), seats = seatsOf(table);
  // A party: a pair usually fills a table for two; two to four friends take a table for four.
  const size = seats.length >= 4 ? 2 + Math.floor(state.rng() * 3) : seats.length === 2 ? (state.rng() < 0.7 ? 2 : 1) : 1;
  const party = seats.slice(0, size).map((seat, index) => {
    const start = { x: layout.lane, y: layout.door.y + (index ? (index % 2 ? -1 : 1) * Math.ceil(index / 2) : 0) };
    return { seat: index, start, path: route(start, [seat], state.blocked, layout) };
  });
  if (party.some(member => !member.path?.length)) return;
  const vip = state.blends[3] > 0 && state.rng() < 0.18, regular = vip ? null : passer.regular;
  // A critic or celebrity from today's event walks in with the next party.
  const special = state.event?.started && !state.event.guestArrived && (state.event.id === "critic" || state.event.id === "celebrity") ? state.event.id : undefined;
  if (special) state.event!.guestArrived = true;
  state.passersby = state.passersby.filter(item => item !== passer);
  for (const member of party) {
    const body = walker(member.start, 2.2 - member.seat * 0.12);
    body.path = member.path!;
    const lead = member.seat === 0;
    state.customers.push({
      id: state.nextId++, name: lead && special ? eventById(special).name : lead && vip ? "Genesis VIP" : lead && regular !== null ? `Regular #${regular}` : "", special: lead ? special : undefined,
      guest: lead ? passer.guest : Math.floor(state.rng() * state.guestCount), regular: lead ? regular : null, vip: lead && vip,
      walker: body, table: table.id, seat: member.seat, state: "arriving", dish: null, patience: 0, patienceMax: 1, eat: 0, claimed: null, mood: null, paid: 0,
    });
  }
  state.today.walkIns += party.length;
  const promoters = workingPromoters(state);
  if (promoters.length) train(state, promoters[Math.floor(state.rng() * promoters.length)]);
  state.events.push({ kind: "arrive", promoted: promoters.length > 0 });
}

export function update(state: CafeState, dt: number) {
  if (state.phase !== "open") return;
  dt = Math.min(dt, 0.1);
  state.clock += dt;
  const layout = plan(state);
  if (state.event && !state.event.started && state.clock >= state.event.at && !isClosing(state)) { state.event.started = true; state.events.push({ kind: "event", id: state.event.id }); }
  state.spawn -= dt;
  if (state.spawn <= 0) { spawnPasserby(state); state.spawn = PASSERBY_INTERVAL * (0.6 + state.rng() * 0.8) * (boostActive(state, "festival") ? 0.5 : 1) * (eventActive(state, "bus") ? 0.35 : eventActive(state, "rain") ? 1.7 : 1); }
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
      customer.state = "waiting"; body.facing = DIR_FACING[seatFor(state, customer)?.dir ?? 0];
      customer.patienceMax = customer.patience = ORDER_PATIENCE * patienceMultiplier(state);
    } else if (customer.state === "waiting" || customer.state === "ordered") {
      customer.patience -= dt;
      // Perfect service (RF boost): nobody leaves unhappy. Guests wait on; after closing they head home content.
      if (customer.patience <= 0 && boostActive(state, "perfect")) { customer.patience = 0.01; if (isClosing(state)) leave(state, customer, false); }
      else if (customer.patience <= 0) leave(state, customer, true);
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
    // A chef pottering about the kitchen drops it as soon as a dish is done, and takes it to the pass.
    const pottering = worker.role === "chef" && worker.carrying.length > 0 && worker.job?.kind === "walk";
    if (pottering && worker.action > 0) worker.action = dt;
    if (pottering && body.path.length > 1) body.path = [body.path[0]];
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
    if (job.kind === "walk") {
      if (worker.role !== "chef") { worker.job = null; continue; }
      // At a station: face the stoves (now and then the counter behind) and work there a moment before moving on.
      const counter = state.rng() < 0.25;
      body.facing = layout.kitchenSide === "left" ? (counter ? "right" : "left") : (counter ? "down" : "up");
      if (!isWorking(state, worker) || worker.duty !== "work") { worker.job = null; continue; }
      const busy = state.orders.some(order => order.state === "cooking");
      worker.action = busy ? 1 + state.rng() * 1.6 : 2.5 + state.rng() * 3.5;
      continue;
    }
    const customer = job.kind === "pickup" || job.kind === "plate" ? null : byId(state.customers, job.customer);
    const target = job.kind === "pickup" || job.kind === "plate" ? layout.pass : byId(state.items, customer?.table ?? -1) ?? body;
    const dx = target.x - body.x, dy = target.y - body.y;
    body.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
    worker.action = (job.kind === "take" ? 0.45 : job.kind === "pickup" || job.kind === "plate" ? 0.3 : 0.35)
      * (worker.role === "manager" ? 1 - 0.2 * skillLevel(state, "service") : 1);
  }

  if (isClosing(state) && !state.customers.length) {
    state.phase = "summary";
    for (const id of Object.keys(state.boosts) as BoostId[]) if ((state.boosts[id] = (state.boosts[id] ?? 0) - 1) <= 0) delete state.boosts[id];
    for (const worker of state.workers) { worker.queue = []; worker.job = null; worker.carrying = []; }
    state.orders = [];
    checkChallenges(state, true);
    state.events.push({ kind: "dayEnd" });
  }
}

export { DAY_LENGTH };
