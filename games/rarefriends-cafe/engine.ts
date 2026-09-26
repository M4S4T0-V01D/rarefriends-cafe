/**
 * RareFriends Cafe simulation. Pure and deterministic for a given random source, so it runs in Node tests.
 * Beans, levels and upgrades are in-café progress for this session only; the SDK runtime owns RF.
 */
import {
  BLEND_BONUSES, CHEF_COSTS, DAY_LENGTH, DECOR_COSTS, DISHES, EAT_TIME, FOOD_PATIENCE, LEVEL_XP, MACHINE_COSTS,
  MAX_LEVEL, MAX_TABLES, ORDER_PATIENCE, START_TABLES, TABLE_COSTS, WAITER_COSTS, dishById, machineFactor, type DishId,
} from "./data.ts";
import { CAPSULE_SPOT, DOOR, PICKUP, TABLES, blockedTiles, route, same, serviceTiles, type Tile } from "./layout.ts";

export type Facing = "down" | "up" | "left" | "right";
export type Walker = { x: number; y: number; path: Tile[]; speed: number; facing: Facing; moving: boolean };
export type CustomerState = "arriving" | "waiting" | "ordered" | "eating" | "leaving";
export type Customer = {
  id: number; name: string; guest: number; regular: number | null; vip: boolean; walker: Walker; table: number;
  state: CustomerState; dish: DishId | null; patience: number; patienceMax: number; eat: number;
  claimed: number | null; mood: "happy" | "ok" | "angry" | null; paid: number;
};
export type Order = {
  id: number; customer: number; dish: DishId; state: "queued" | "cooking" | "ready" | "carried";
  progress: number; duration: number; carrier: number | null;
};
export type Job = { kind: "take"; customer: number } | { kind: "pickup" } | { kind: "serve"; customer: number } | { kind: "walk"; to: Tile };
export type Worker = {
  id: number; role: "manager" | "waiter"; walker: Walker; carrying: number[]; queue: Job[]; job: Job | null;
  action: number; home: Tile;
};
export type CafeEvent =
  | { kind: "coins"; amount: number; x: number; y: number; vip: boolean; double: boolean }
  | { kind: "ready"; dish: DishId } | { kind: "order"; x: number; y: number } | { kind: "angry"; x: number; y: number }
  | { kind: "arrive" } | { kind: "levelup"; level: number } | { kind: "dayEnd" };
export type DayStats = { served: number; lost: number; beans: number; tips: number; vips: number; best: number };
export type Phase = "intro" | "open" | "summary";

export type CafeState = {
  phase: Phase; day: number; clock: number; beans: number; xp: number; level: number; rating: number;
  tables: number; machine: number; decor: number; chefs: number; unlocked: Set<DishId>;
  blends: number[]; familyId: number; guestCount: number; regulars: number[];
  customers: Customer[]; orders: Order[]; workers: Worker[]; events: CafeEvent[];
  spawn: number; nextId: number; blocked: Set<number>; manual: { dx: number; dy: number } | null;
  today: DayStats; totalServed: number; rng: () => number;
};

const perk = (state: CafeState, family: number) => state.familyId === family;
const emptyDay = (): DayStats => ({ served: 0, lost: 0, beans: 0, tips: 0, vips: 0, best: 0 });
const walker = (tile: Tile, speed: number): Walker => ({ x: tile.x, y: tile.y, path: [], speed, facing: "down", moving: false });

export function createCafe(options: { familyId: number; guestCount: number; regulars?: number[]; rng?: () => number }): CafeState {
  const state: CafeState = {
    phase: "intro", day: 1, clock: 0, beans: 30, xp: 0, level: 1, rating: 3.5,
    tables: START_TABLES, machine: 0, decor: 0, chefs: 0, unlocked: new Set(["espresso", "latte"]),
    blends: [0, 0, 0, 0], familyId: options.familyId, guestCount: Math.max(1, options.guestCount),
    regulars: options.regulars ?? [], customers: [], orders: [], workers: [], events: [], spawn: 1.2, nextId: 1,
    blocked: blockedTiles(START_TABLES, 0), manual: null, today: emptyDay(), totalServed: 0, rng: options.rng ?? Math.random,
  };
  if (perk(state, 7)) state.rating = 4;
  state.workers.push({ id: 0, role: "manager", walker: walker(PICKUP, managerSpeed(state)), carrying: [], queue: [], job: null, action: 0, home: PICKUP });
  return state;
}

export const manager = (state: CafeState) => state.workers[0];
const managerSpeed = (state: CafeState) => 3.3 * (perk(state, 5) ? 1.3 : 1);
const helperSpeed = (state: CafeState) => 2.5 * (perk(state, 2) ? 1.25 : 1);
export const carryCapacity = (state: CafeState, worker: Worker) => worker.role === "manager" ? (perk(state, 3) ? 3 : 2) : 1;
export const kitchenSlots = (state: CafeState) => 1 + state.chefs;
export const waiters = (state: CafeState) => state.workers.length - 1;
const patienceMultiplier = (state: CafeState) => (1 + 0.06 * state.decor) * (perk(state, 6) ? 1.25 : 1) * (state.blends[2] > 0 ? 1.1 : 1);
export const cookTime = (state: CafeState, dish: DishId) => dishById(dish).cook * machineFactor(state.machine) * (perk(state, 0) ? 0.85 : 1);

export function availableDishes(state: CafeState): DishId[] {
  return DISHES.filter(dish => dish.blend === undefined ? state.unlocked.has(dish.id) : state.blends[dish.blend] > 0).map(dish => dish.id);
}
export const customerAt = (state: CafeState, table: number) => state.customers.find(customer => customer.table === table);
const byId = <T extends { id: number }>(items: T[], id: number) => items.find(item => item.id === id);

/** Kept capsule blends from the SDK snapshot's inventory drive café bonuses. */
export function setBlends(state: CafeState, counts: readonly number[]) {
  state.blends = [0, 1, 2, 3].map(index => Math.max(0, Math.floor(counts[index] ?? 0)));
}

// ---------- Purchases (Beans only) ----------
export type Purchase = "table" | "machine" | "decor" | "waiter" | "chef";
export function purchaseCost(state: CafeState, item: Purchase): number | null {
  const table = { table: TABLE_COSTS[state.tables - START_TABLES], machine: MACHINE_COSTS[state.machine], decor: DECOR_COSTS[state.decor],
    waiter: WAITER_COSTS[waiters(state)], chef: CHEF_COSTS[state.chefs] }[item];
  return table ?? null;
}
/** Café level needed before the next purchase of this kind. */
export function purchaseLevel(state: CafeState, item: Purchase): number {
  if (item === "table") return [1, 2, 3, 5, 7][state.tables - START_TABLES] ?? MAX_LEVEL;
  if (item === "waiter") return [2, 5][waiters(state)] ?? MAX_LEVEL;
  if (item === "chef") return [3, 6][state.chefs] ?? MAX_LEVEL;
  return 1;
}
export function buy(state: CafeState, item: Purchase): string | null {
  const cost = purchaseCost(state, item);
  if (cost === null) return "Fully upgraded.";
  if (state.level < purchaseLevel(state, item)) return `Reach café level ${purchaseLevel(state, item)} first.`;
  if (state.beans < cost) return "Not enough Beans.";
  state.beans -= cost;
  if (item === "table") state.tables = Math.min(MAX_TABLES, state.tables + 1);
  else if (item === "machine") state.machine++;
  else if (item === "decor") state.decor++;
  else if (item === "chef") state.chefs++;
  else {
    const home = [{ x: 3, y: 7 }, { x: 6, y: 10 }][waiters(state)];
    state.workers.push({ id: state.workers.length, role: "waiter", walker: walker(DOOR, helperSpeed(state)), carrying: [], queue: [], job: null, action: 0, home });
  }
  state.blocked = blockedTiles(state.tables, state.decor);
  // Anyone standing on newly placed furniture steps to the nearest free tile.
  for (const worker of state.workers) {
    const at = { x: Math.round(worker.walker.x), y: Math.round(worker.walker.y) };
    if (state.blocked.has(at.y * 11 + at.x)) { worker.walker.x = worker.home.x; worker.walker.y = worker.home.y; worker.walker.path = []; }
    replan(state, worker);
  }
  return null;
}
export function unlockDish(state: CafeState, id: DishId): string | null {
  const dish = dishById(id);
  if (dish.blend !== undefined) return `Keep a ${BLEND_BONUSES[dish.blend].name} from a Rare Blend Capsule to serve this.`;
  if (state.unlocked.has(id)) return "Already on the menu.";
  if (state.level < dish.level) return `Reach café level ${dish.level} first.`;
  if (state.beans < dish.unlockCost) return "Not enough Beans.";
  state.beans -= dish.unlockCost; state.unlocked.add(id);
  return null;
}

// ---------- Day flow ----------
export function openCafe(state: CafeState) {
  if (state.phase === "open") return;
  if (state.phase === "summary") { state.day++; state.today = emptyDay(); }
  state.phase = "open"; state.clock = 0; state.spawn = 1.2;
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
  if (customer.state === "arriving") return `${customer.name} is still finding a seat.`;
  if (customer.state === "eating") return `${customer.name} is enjoying their ${dishById(customer.dish!).name}.`;
  if (customer.state === "leaving") return `${customer.name} is heading home.`;
  if (customer.state === "waiting") {
    if (customer.claimed !== null && customer.claimed !== boss.id) return "A helper is already taking that order.";
    return enqueue(state, { kind: "take", customer: id }) ? `Taking ${customer.name}'s order.` : "Already on your list.";
  }
  const order = state.orders.find(item => item.customer === id);
  if (!order) return "";
  if (order.state === "carried" && order.carrier === boss.id) return enqueue(state, { kind: "serve", customer: id }, true) ? `Serving ${customer.name}.` : "Already on your list.";
  if (order.state === "carried") return "A helper is bringing that dish.";
  if (order.state === "ready") { enqueue(state, { kind: "pickup" }); enqueue(state, { kind: "serve", customer: id }); return `Fetching ${dishById(order.dish).name}.`; }
  return `${dishById(order.dish).name} is still cooking.`;
}
export function actOnTable(state: CafeState, table: number): string {
  if (table >= state.tables) return "That table is not built yet.";
  const customer = customerAt(state, table);
  return customer ? actOnCustomer(state, customer.id) : `Table ${table + 1} is empty.`;
}
export function actOnCounter(state: CafeState): string {
  if (state.phase !== "open") return "";
  if (!state.orders.some(order => order.state === "ready")) return "Nothing is ready at the counter yet.";
  return enqueue(state, { kind: "pickup" }) ? "Picking up ready dishes." : "Already on your list.";
}
export function walkTo(state: CafeState, tile: Tile): boolean {
  const boss = manager(state);
  if (state.blocked.has(tile.y * 11 + tile.x)) return false;
  release(state, boss.job, boss.id); boss.job = { kind: "walk", to: tile }; boss.action = 0; replan(state, boss);
  return true;
}
/** Held direction keys move the manager tile by tile and pause their task list. */
export function setManual(state: CafeState, direction: { dx: number; dy: number } | null) { state.manual = direction; }
/** E / Space: act on whatever is next to the manager. Returns "capsule" when standing at the capsule machine. */
export function interactNearby(state: CafeState): string {
  const boss = manager(state), at = { x: Math.round(boss.walker.x), y: Math.round(boss.walker.y) };
  if (same(at, CAPSULE_SPOT)) return "capsule";
  for (const customer of state.customers) {
    if (!["waiting", "ordered"].includes(customer.state)) continue;
    if (serviceTiles(TABLES[customer.table].table, state.blocked).some(tile => same(tile, at))) return actOnCustomer(state, customer.id);
  }
  if (same(at, PICKUP)) return actOnCounter(state);
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
  const from = worker.walker.path[0] ?? { x: Math.round(worker.walker.x), y: Math.round(worker.walker.y) };
  const path = goals && route(from, goals, state.blocked);
  if (!path) { release(state, job, worker.id); worker.job = null; worker.walker.path = []; return; }
  worker.walker.path = worker.walker.path.length ? [worker.walker.path[0], ...path] : path;
}
function goalsFor(state: CafeState, job: Job): Tile[] | null {
  if (job.kind === "walk") return [job.to];
  if (job.kind === "pickup") return [PICKUP];
  const customer = byId(state.customers, job.customer);
  return customer ? serviceTiles(TABLES[customer.table].table, state.blocked) : null;
}
function valid(state: CafeState, worker: Worker, job: Job): boolean {
  if (job.kind === "walk") return true;
  if (job.kind === "pickup") return worker.carrying.length < carryCapacity(state, worker) && state.orders.some(order => order.state === "ready");
  const customer = byId(state.customers, job.customer);
  if (!customer) return false;
  if (job.kind === "take") return customer.state === "waiting" && (customer.claimed === null || customer.claimed === worker.id);
  return customer.state === "ordered" && worker.carrying.some(id => byId(state.orders, id)?.customer === customer.id);
}

function step(walker: Walker, dt: number) {
  let travel = walker.speed * dt;
  walker.moving = walker.path.length > 0;
  while (travel > 0 && walker.path.length) {
    const target = walker.path[0], dx = target.x - walker.x, dy = target.y - walker.y, length = Math.hypot(dx, dy);
    if (length > 0.001) {
      walker.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
    }
    if (length <= travel) { walker.x = target.x; walker.y = target.y; walker.path.shift(); travel -= length; }
    else { walker.x += dx / length * travel; walker.y += dy / length * travel; travel = 0; }
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
  // Carried dishes are delivered automatically, nearest guest first.
  const carried = worker.carrying.map(id => byId(state.orders, id)).filter(order => order !== undefined);
  if (carried.length) return { kind: "serve", customer: carried[0]!.customer };
  if (worker.role === "manager") return null;
  const mine = new Set(manager(state).queue.flatMap(job => job.kind === "take" ? [job.customer] : []));
  if (state.orders.some(order => order.state === "ready")) return { kind: "pickup" };
  const waiting = state.customers.filter(customer => customer.state === "waiting" && customer.claimed === null && !mine.has(customer.id))
    .sort((a, b) => a.patience - b.patience)[0];
  if (waiting) { waiting.claimed = worker.id; return { kind: "take", customer: waiting.id }; }
  const at = { x: Math.round(worker.walker.x), y: Math.round(worker.walker.y) };
  return same(at, worker.home) ? null : { kind: "walk", to: worker.home };
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
    const tipRate = 0.3 * fraction + 0.03 * state.decor + 0.03 * Math.min(5, state.blends[0]) + (perk(state, 1) ? 0.1 : 0);
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
  const from = { x: Math.round(customer.walker.x), y: Math.round(customer.walker.y) };
  customer.walker.path = route(from, [DOOR], state.blocked) ?? route(from, [DOOR], new Set()) ?? [];
}

function spawnCustomer(state: CafeState) {
  const taken = new Set(state.customers.map(customer => customer.table));
  const free = Array.from({ length: state.tables }, (_, index) => index).filter(index => !taken.has(index));
  if (!free.length) return;
  const table = free[Math.floor(state.rng() * free.length)];
  const vip = state.blends[3] > 0 && state.rng() < 0.18;
  const regular = !vip && state.regulars.length && state.rng() < 0.14 ? state.regulars[Math.floor(state.rng() * state.regulars.length)] : null;
  const guest = Math.floor(state.rng() * state.guestCount);
  const seat = TABLES[table].seat;
  const customer: Customer = {
    id: state.nextId++, name: vip ? "Genesis VIP" : regular !== null ? `Regular #${regular}` : "", guest, regular, vip,
    walker: walker(DOOR, 2.2), table, state: "arriving", dish: null, patience: 0, patienceMax: 1, eat: 0, claimed: null, mood: null, paid: 0,
  };
  customer.walker.path = route(DOOR, [seat], state.blocked) ?? [seat];
  state.customers.push(customer);
  state.events.push({ kind: "arrive" });
}

const spawnInterval = (state: CafeState) =>
  5 / (1 + 0.12 * state.decor + 0.1 * (state.rating - 3)) / (perk(state, 8) ? 1.15 : 1) * (0.75 + state.rng() * 0.5);

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
    body.speed = worker.role === "manager" ? managerSpeed(state) : helperSpeed(state);
    if (worker.action > 0) {
      if ((worker.action -= dt) <= 0) { const job = worker.job!; worker.job = null; worker.action = 0; finish(state, worker, job); }
      continue;
    }
    if (worker.role === "manager" && state.manual && body.path.length > 1) body.path = [body.path[0]];
    if (worker.role === "manager" && state.manual && !body.path.length) {
      const at = { x: Math.round(body.x), y: Math.round(body.y) }, next = { x: at.x + state.manual.dx, y: at.y + state.manual.dy };
      if (worker.job) { release(state, worker.job, worker.id); worker.job = null; }
      if (next.x >= 0 && next.y >= 0 && next.x < 11 && next.y < 11 && !state.blocked.has(next.y * 11 + next.x)) body.path = [next];
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
    const target = job.kind === "pickup" ? { x: 1, y: PICKUP.y } : TABLES[byId(state.customers, job.customer)?.table ?? 0].table;
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
