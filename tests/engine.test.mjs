import test from "node:test";
import assert from "node:assert/strict";
import {
  raiseStat, statPoints, setBuilding, actOnCounter, actOnCustomer, ambience, applyFinish, assignStaff, availableDishes, buy, buyUpgrade, carryCapacity, chooseShop, moveCapsule, nextUpgrade, upgradeLevel, cookTime, createCafe, kitchenSlots,
  manager, memberOf, mostTired, moveItem, openCafe, placeItem, plan, restoreCafe, sellItem, sendToBreak, serializeCafe, setBlends,
  setOwnedFriends, setStaffRole, staffAt, staffPower, tableCount, unlockDish, update, walkInChance, collectFromCapsule,
} from "../games/rarefriends-cafe/engine.ts";
import { CATALOG, DAY_LENGTH, FLOORS, LEVEL_XP, SHOPS, UPGRADES, WALLPAPERS, dishById, isRug, tableLimit, tierOf, workerLevel } from "../games/rarefriends-cafe/data.ts";
import { BUILDINGS, DEFAULT_ITEMS, MAX_SIZE, START_SIZE, blockedTiles, defaultItems, layoutProblem, placementProblem, planFor, route, seatOf } from "../games/rarefriends-cafe/layout.ts";
import { createGuests } from "../games/rarefriends-cafe/guests.ts";
import { parseStaffRoster } from "../games/rarefriends-cafe/roster.ts";
import game from "../games/rarefriends-cafe/game.json" with { type: "json" };

function seeded(seed = 42) { return () => ((seed = (seed * 16807) % 2147483647) / 2147483647); }
const cafe = (options = {}) => createCafe({ familyId: 1, guestCount: 18, regulars: [3412], rng: seeded(), ...options });
const run = (state, seconds, step = 0.05) => { for (let t = 0; t < seconds; t += step) update(state, step); };
const until = (state, done, limit = 120) => { for (let t = 0; t < limit && !done(); t += 0.05) update(state, 0.05); return done(); };

test("the plan: kitchen room behind the counter wall, a break room, the street and a front door", () => {
  for (const size of [10, 12, 14, 16]) {
    const layout = planFor(size), street = { x: layout.lane, y: layout.door.y };
    assert.equal(layoutProblem(DEFAULT_ITEMS, layout), null, `size ${size}`);
    assert.ok(route(street, [layout.pickup], new Set(), layout), "the counter is reachable from the street");
    assert.ok(route(street, [layout.restSpots[0]], new Set(), layout), "staff can reach the break room");
    assert.ok(route(layout.chefSpots[0], [layout.restSpots[0]], new Set(), layout), "chefs reach it through the kitchen door");
    // The only way in from the street is the front door.
    const inside = route(street, [{ x: 5, y: 5 }], new Set(), layout);
    assert.ok(inside.some(tile => tile.x === layout.door.x && tile.y === layout.door.y));
    assert.equal(route({ x: layout.lane, y: 8 }, [{ x: size - 1, y: 8 }], new Set(), layout)?.some(tile => tile.y === layout.door.y), true);
  }
});

test("every shop has a full, balanced nine-dish menu", () => {
  assert.equal(SHOPS.length, 5);
  for (const shop of SHOPS) {
    assert.equal(shop.menu.length, 9, shop.id);
    assert.deepEqual(shop.menu.map(dish => dish.price), SHOPS[0].menu.map(dish => dish.price));
    assert.equal(dishById(shop.menu[4].id), shop.menu[4]);
  }
});

test("choosing a shop sets its starter menu, only before day one", () => {
  const state = cafe();
  assert.equal(chooseShop(state, "seafood"), null);
  assert.deepEqual(availableDishes(state), ["seafood:0", "seafood:1"]);
  openCafe(state);
  assert.match(chooseShop(state, "burger"), /before the first day/);
});

test("passers-by walk the street and some come in through the door", () => {
  const state = cafe(); openCafe(state);
  assert.ok(until(state, () => state.passersby.length > 0, 5));
  assert.ok(until(state, () => state.customers.length > 0, 30));
  assert.ok(state.today.walkIns > 0);
  const layout = plan(state);
  assert.ok(state.passersby.every(passer => Math.round(passer.walker.x) === layout.lane));
});

test("take order → cook → pick up → serve earns Beans; the guest leaves back onto the street", () => {
  const state = cafe({ shop: "asian" }); openCafe(state);
  assert.ok(until(state, () => state.customers.some(c => c.state === "waiting")));
  const guest = state.customers.find(c => c.state === "waiting");
  assert.match(actOnCustomer(state, guest.id), /Taking/);
  assert.ok(until(state, () => guest.state === "ordered"));
  assert.ok(until(state, () => state.orders.some(o => o.customer === guest.id && o.state === "ready")));
  assert.match(actOnCounter(state), /Picking up/);
  const before = state.beans;
  assert.ok(until(state, () => guest.state === "eating"));
  assert.ok(state.beans > before);
  assert.ok(until(state, () => !state.customers.includes(guest), 30), "the guest walks out");
});

test("ignored guests leave unhappy; the day closes into a summary; a closed day resumes at the next day", () => {
  const state = cafe(); openCafe(state);
  const rating = state.rating;
  assert.ok(until(state, () => state.today.lost > 0, 90));
  assert.ok(state.rating < rating);
  assert.ok(until(state, () => state.phase === "summary", DAY_LENGTH + 120));
  const fresh = cafe();
  assert.equal(restoreCafe(fresh, JSON.parse(JSON.stringify(serializeCafe(state)))), true);
  assert.equal(fresh.day, 2);
});

test("build mode: place, rotate, move and sell in the dining room only", () => {
  const state = cafe(); state.beans = 1000;
  const layout = plan(state);
  assert.match(placeItem(state, "plant", layout.pickup), /kept clear/);
  assert.match(placeItem(state, "plant", { x: 1, y: 2 }), /dining room/);
  assert.match(placeItem(state, "plant", { x: 5, y: 3 }), /already there/);
  assert.match(placeItem(state, "plant", { x: 5, y: 2 }), /already there/, "a table's chair tile is taken too");
  assert.equal(placeItem(state, "plant", { x: 8, y: 9 }), null);
  assert.equal(state.beans, 1000 - 35);
  assert.equal(placeItem(state, "table", { x: 8, y: 7 }, 1), null);
  const table = state.items.at(-1);
  assert.deepEqual(seatOf(table), { x: 7, y: 7 });
  assert.equal(tableCount(state), 4);
  assert.match(placeItem(state, "table", { x: 4, y: 9 }), /allows 4 tables/);
  assert.equal(moveItem(state, table.id, { x: 8, y: 2 }, 0), null);
  const beans = state.beans;
  assert.equal(sellItem(state, table.id), null);
  assert.equal(state.beans, beans + 30);
});

test("every item turns four ways; a table's chair goes on any side and its guest faces the table", () => {
  assert.deepEqual([0, 1, 2, 3].map(dir => seatOf({ x: 6, y: 6, dir })), [{ x: 6, y: 5 }, { x: 5, y: 6 }, { x: 6, y: 7 }, { x: 7, y: 6 }]);
  const state = cafe(); state.beans = 5000;
  state.items = state.items.slice(0, 1);
  assert.equal(placeItem(state, "table", { x: 8, y: 6 }, 3), null);
  const table = state.items.at(-1);
  assert.deepEqual(seatOf(table), { x: 9, y: 6 });
  assert.match(placeItem(state, "plant", { x: 9, y: 6 }), /already there/, "the chair tile is taken");
  assert.equal(moveItem(state, table.id, { x: 8, y: 6 }, 2), null);
  assert.equal(table.dir, 2);
  assert.equal(placeItem(state, "sofa", { x: 5, y: 8 }, 3), null);
  assert.equal(state.items.at(-1).dir, 3);
  openCafe(state);
  assert.ok(until(state, () => state.customers.some(customer => customer.table === table.id && customer.state === "waiting"), 90));
  assert.equal(state.customers.find(customer => customer.table === table.id).walker.facing, "up");
  const save = serializeCafe(state);
  assert.equal(restoreCafe(cafe(), save), true);
  assert.equal(restoreCafe(cafe(), { ...save, items: [{ ...save.items[0], dir: 4 }] }), false);
});

test("the catalog, wallpapers and floors have unique ids; the three rugs stack under furniture", () => {
  for (const list of [CATALOG.map(item => item.kind), WALLPAPERS.map(item => item.id), FLOORS.map(item => item.id)]) assert.equal(new Set(list).size, list.length);
  assert.ok(WALLPAPERS.length >= 12 && FLOORS.length >= 12 && CATALOG.length >= 29);
  assert.deepEqual(CATALOG.filter(item => isRug(item.kind)).map(item => item.kind), ["rug", "runner", "roundrug"]);
  const state = cafe(); state.beans = 5000;
  assert.equal(placeItem(state, "runner", { x: 8, y: 8 }, 1), null);
  assert.match(placeItem(state, "roundrug", { x: 8, y: 8 }), /already a rug/);
  assert.equal(placeItem(state, "aquarium", { x: 8, y: 8 }, 2), null, "furniture stands on a rug");
  for (const finish of [...WALLPAPERS.slice(-3)]) assert.equal(applyFinish(state, "wallpaper", finish.id), null);
  for (const finish of [...FLOORS.slice(-3)]) assert.equal(applyFinish(state, "floor", finish.id), null);
  assert.equal(state.wallpaper, "starry"); assert.equal(state.floor, "mosaic");
});

test("a day lasts five minutes and earns slowly; the level curve runs to 15", () => {
  assert.equal(DAY_LENGTH, 300);
  assert.deepEqual(SHOPS[0].menu.slice(0, 7).map(dish => dish.price), [5, 7, 9, 12, 16, 23, 29]);
  assert.equal(LEVEL_XP.length + 1, 15);
  const state = cafe(); state.items = state.items.slice(0, 3);
  openCafe(state);
  // Auto-serve with the manager for a whole day: a first day earns a modest handful of Beans.
  for (let t = 0; t < DAY_LENGTH + 60 && state.phase === "open"; t += 0.05) {
    for (const customer of state.customers) actOnCustomer(state, customer.id);
    update(state, 0.05);
  }
  assert.ok(state.today.served >= 10, `served ${state.today.served}`);
  assert.ok(state.today.beans / state.today.served <= 9, `average ${state.today.beans / state.today.served} Beans a guest`);
});

test("shop upgrades cost Beans, need café levels and change play", () => {
  assert.equal(UPGRADES.length, 8);
  const state = cafe(); state.beans = 20_000;
  assert.match(buyUpgrade(state, "tray"), /level 11/);
  assert.deepEqual(nextUpgrade(state, "sign"), { cost: 90, level: 2 });
  state.level = 15;
  const carry = carryCapacity(state, state.workers[0]);
  for (const upgrade of UPGRADES) for (let i = 0; i < upgrade.costs.length; i++) assert.equal(buyUpgrade(state, upgrade.id), null);
  assert.equal(buyUpgrade(state, "sign"), "Fully upgraded.");
  assert.equal(nextUpgrade(state, "plating"), null);
  assert.equal(carryCapacity(state, state.workers[0]), carry + 1);
  const spent = UPGRADES.reduce((sum, upgrade) => sum + upgrade.costs.reduce((a, b) => a + b, 0), 0);
  assert.equal(state.beans, 20_000 - spent);
  openCafe(state);
  const save = JSON.parse(JSON.stringify(serializeCafe(state)));
  const fresh = cafe();
  assert.equal(restoreCafe(fresh, save), true);
  assert.equal(upgradeLevel(fresh, "plating"), 3);
  assert.equal(restoreCafe(cafe(), { ...save, upgrades: { sign: 9 } }), false);
  assert.equal(restoreCafe(cafe(), { ...save, upgrades: { casino: 1 } }), false);
});

test("the capsule machine can be moved and turned in the dining room", () => {
  const state = cafe(); state.beans = 500;
  assert.deepEqual([plan(state).capsule, plan(state).capsuleSpot], [{ x: 9, y: 0 }, { x: 8, y: 0 }]);
  assert.match(moveCapsule(state, { x: 1, y: 2 }, 0), /dining room/);
  assert.match(moveCapsule(state, { x: 5, y: 3 }, 0), /already there/);
  assert.match(moveCapsule(state, { x: 9, y: 2 }, 0), /door and counter/, "its use tile can't be the front door");
  assert.equal(moveCapsule(state, { x: 9, y: 8 }, 2), null);
  assert.deepEqual([plan(state).capsule, plan(state).capsuleSpot], [{ x: 9, y: 8 }, { x: 9, y: 7 }]);
  assert.equal(placeItem(state, "plant", { x: 9, y: 0 }), null, "the old corner is free");
  assert.match(placeItem(state, "plant", { x: 9, y: 7 }), /kept clear/, "the tile in front of the machine stays clear");
  const save = JSON.parse(JSON.stringify(serializeCafe((openCafe(state), state))));
  const fresh = cafe();
  assert.equal(restoreCafe(fresh, save), true);
  assert.deepEqual(fresh.capsule, { x: 9, y: 8, dir: 2 });
  const blocked = cafe();
  assert.equal(restoreCafe(blocked, { ...save, items: [...save.items, { kind: "shelf", x: 9, y: 7, dir: 0 }] }), true);
  assert.equal(blocked.capsule, null, "a machine whose spot is taken goes back to its corner");
});

test("a chef carries each cooked dish from the stove to the pass", () => {
  const state = cafe({ ownedFriends: [3412] });
  assignStaff(state, 0, { owned: 3412 }, "chef"); openCafe(state);
  const chef = state.workers.find(worker => worker.role === "chef"), layout = plan(state);
  let plated = false, carried = false;
  for (let t = 0; t < 120 && !carried; t += 0.05) {
    for (const customer of state.customers) actOnCustomer(state, customer.id);
    update(state, 0.05);
    const order = state.orders.find(item => item.state === "plating");
    if (order) { plated = true; assert.equal(order.carrier, chef.id); assert.ok(chef.carrying.includes(order.id)); }
    if (plated && state.orders.some(item => item.state === "ready" || item.state === "carried")) carried = true;
  }
  assert.ok(plated && carried, "a dish went stove → chef → pass");
  assert.ok(until(state, () => !chef.carrying.length && Math.round(chef.walker.x) === 1 && Math.round(chef.walker.y) === chef.home.y, 30), "the chef heads back to the stove");
  assert.ok(layout.pass.x === 2);
});

test("every building, at every size, works: routes to the counter, capsules, break room and out of the kitchen", () => {
  for (const building of BUILDINGS.map(item => item.id)) for (const size of [10, 12, 14, 16]) {
    const layout = planFor(size, { building }), items = defaultItems(building), blocked = blockedTiles(items, layout);
    const label = `${building} ${size}`, street = { x: layout.lane, y: layout.door.y };
    assert.equal(layoutProblem(items, layout), null, label);
    for (const goal of [layout.pickup, layout.capsuleSpot, layout.breakDoor, ...items.map(seatOf)]) assert.ok(route(street, [goal], blocked, layout), `${label}: street → ${JSON.stringify(goal)}`);
    assert.ok(route(layout.chefSpots[0], [layout.restSpots[0]], blocked, layout), `${label}: chefs reach the break room`);
    assert.ok(route(layout.chefSpots[0], [layout.chefPass], blocked, layout), `${label}: chefs reach the pass`);
    for (const tile of [layout.pickup, layout.door, ...layout.clear]) assert.ok(layout.dining.has((tile.y + 8) * 64 + tile.x + 8), `${label}: ${JSON.stringify(tile)} is a dining tile`);
  }
  assert.deepEqual([planFor(10, { building: "long" }).d, planFor(10, { building: "parlour" }).d, planFor(10, { building: "townhouse" }).kitchenSide], [14, 12, "back"]);
});

test("the building is chosen at setup and changed between days; misfit furniture is refunded", () => {
  const state = cafe(); state.beans = 1000;
  assert.equal(setBuilding(state, "townhouse"), null);
  assert.deepEqual(state.items.map(({ x, y }) => [x, y]), defaultItems("townhouse").map(({ x, y }) => [x, y]), "at setup the tables are laid out again");
  assert.equal(state.beans, 1000);
  assert.equal(setBuilding(state, "corner"), null);
  assert.equal(placeItem(state, "shelf", { x: 3, y: 1 }), null);
  openCafe(state);
  assert.match(setBuilding(state, "long"), /between days/);
  state.phase = "summary";
  const beans = state.beans;
  assert.equal(setBuilding(state, "townhouse"), null);
  assert.equal(state.beans, beans + 90 + 60, "the shelf and the table whose chair is now counter are refunded");
  assert.equal(state.items.filter(item => item.kind === "table").length, 2);
  assert.equal(layoutProblem(state.items, plan(state)), null);
  assert.equal(setBuilding(state, "long"), null);
  assert.equal(plan(state).d, 14);
  const save = JSON.parse(JSON.stringify(serializeCafe(state)));
  assert.equal(save.building, "long");
  const fresh = cafe();
  assert.equal(restoreCafe(fresh, save), true);
  assert.equal(fresh.building, "long");
  assert.equal(restoreCafe(cafe(), { ...save, building: "castle" }), false);
  // A long diner day runs start to finish.
  openCafe(fresh);
  assert.ok(until(fresh, () => fresh.phase === "summary", DAY_LENGTH + 120));
});

test("worker levels earn attribute points for speed, stamina and skill", () => {
  const state = cafe({ ownedFriends: [3412] });
  assignStaff(state, 0, { owned: 3412 }, "promoter");
  const member = staffAt(state, 0);
  assert.equal(statPoints(member), 0);
  assert.match(raiseStat(state, 0, "speed"), /No points/);
  member.xp = 70; // worker level 5: four points
  assert.equal(statPoints(member), 4);
  openCafe(state); run(state, 3);
  const before = walkInChance(state);
  for (let i = 0; i < 3; i++) assert.equal(raiseStat(state, 0, "skill"), null);
  assert.ok(walkInChance(state) > before, "a skilled promoter pulls more passers-by in");
  assert.equal(raiseStat(state, 0, "speed"), null);
  assert.match(raiseStat(state, 0, "stamina"), /No points/);
  assert.deepEqual(member.stats, { speed: 1, stamina: 0, skill: 3 });
  assignStaff(state, 0, { owned: 3412 }, "chef");
  assert.deepEqual(staffAt(state, 0).stats, { speed: 1, stamina: 0, skill: 3 }, "points stay with the Friend");
  const save = JSON.parse(JSON.stringify(serializeCafe(state)));
  const fresh = cafe({ ownedFriends: [3412] });
  assert.equal(restoreCafe(fresh, save), true);
  assert.deepEqual(staffAt(fresh, 0).stats, { speed: 1, stamina: 0, skill: 3 });
  const cheat = { ...save, staff: [{ ...save.staff[0], stats: { speed: 5, stamina: 5, skill: 5 } }] };
  const other = cafe({ ownedFriends: [3412] });
  assert.equal(restoreCafe(other, cheat), true);
  assert.deepEqual(staffAt(other, 0).stats, { speed: 0, stamina: 0, skill: 0 }, "more points than levels are reset");
});

test("placement can't wall off guests, staff or the break room", () => {
  const layout = planFor(START_SIZE), items = [...DEFAULT_ITEMS];
  let problem = null;
  for (let y = 0; y < START_SIZE && !problem; y++) {
    problem = placementProblem(items, { kind: "shelf", x: 4, y, dir: 0 }, layout);
    if (!problem) items.push({ id: 50 + y, kind: "shelf", x: 4, y, dir: 0 });
  }
  assert.match(problem, /wall off|reach|break room|kept clear/);
});

test("décor, wallpaper and floors raise ambience, which draws more passers-by in", () => {
  const state = cafe(); state.beans = 5000;
  const before = walkInChance(state);
  assert.equal(applyFinish(state, "wallpaper", "damask"), null);
  assert.equal(applyFinish(state, "floor", "marble"), null);
  assert.equal(placeItem(state, "piano", { x: 9, y: 9 }), null);
  assert.equal(ambience(state), 3);
  assert.ok(walkInChance(state) > before);
});

test("expanding grows the shop 2 × 2 at a time, between days, up to 16 × 16", () => {
  const state = cafe(); state.beans = 10_000;
  assert.match(buy(state, "expand"), /level 4/);
  state.level = 10;
  openCafe(state);
  assert.match(buy(state, "expand"), /between days/);
  state.phase = "summary";
  assert.equal(buy(state, "expand"), null); assert.equal(state.size, 12);
  assert.equal(buy(state, "expand"), null); assert.equal(buy(state, "expand"), null);
  assert.equal(state.size, MAX_SIZE);
  assert.equal(buy(state, "expand"), "Fully upgraded.");
  assert.equal(layoutProblem(state.items, plan(state)), null, "existing furniture still fits");
  assert.equal(placeItem(state, "plant", { x: 14, y: 14 }), null, "the new space can be built on");
});

test("generation tiers: Gen 1 is the top worker tier, Gen 6 the lowest, guests below", () => {
  assert.ok(tierOf(1).power > tierOf(2).power && tierOf(5).power > tierOf(6).power && tierOf(6).power > tierOf(null).power);
  const state = cafe({ ownedFriends: [{ id: 11, generation: 1 }, { id: 66, generation: 6 }] }); state.level = 3; state.beans = 999; buy(state, "slot");
  assignStaff(state, 0, { owned: 11 }); assignStaff(state, 1, { owned: 66 });
  assert.ok(staffPower(state, staffAt(state, 0)) > staffPower(state, staffAt(state, 1)));
  assert.ok(state.workers[1].walker.speed >= 0);
});

test("workers earn XP and level up as they work", () => {
  assert.equal(workerLevel(0), 1); assert.equal(workerLevel(10), 2); assert.equal(workerLevel(10_000), 10);
  const state = cafe({ ownedFriends: [{ id: 3412, generation: 2 }] });
  assignStaff(state, 0, { owned: 3412 }, "waiter"); openCafe(state);
  run(state, 90);
  const member = staffAt(state, 0);
  assert.ok(member.xp > 0, "the waiter gained XP");
  const power = staffPower(state, member);
  member.xp = 400;
  assert.ok(staffPower(state, member) > power, "levels raise power");
});

test("three roles: chefs add kitchen slots, promoters bring more passers-by in", () => {
  const state = cafe({ ownedFriends: [3412, 555] }); state.beans = 999; state.level = 3; buy(state, "slot");
  const base = walkInChance(state);
  assignStaff(state, 0, { owned: 3412 }, "chef"); assignStaff(state, 1, { owned: 555 }, "promoter");
  openCafe(state);
  run(state, 3);
  assert.equal(kitchenSlots(state), 2);
  assert.ok(cookTime(state, "cafe:4") < 8, "a working chef cooks faster");
  const promoter = state.workers.find(worker => worker.role === "promoter");
  assert.ok(Math.round(promoter.walker.x) >= plan(state).size, "the promoter works out on the sidewalk");
  assert.ok(walkInChance(state) > base);
});

test("staff get tired; the manager sends them to the break room for 15–30 s; they come back rested", () => {
  const state = cafe({ ownedFriends: [3412] });
  assignStaff(state, 0, { owned: 3412 }, "waiter"); openCafe(state);
  const worker = state.workers[1], member = memberOf(state, worker);
  assert.match(sendToBreak(state, worker.id), /Not tired/);
  member.fatigue = 100;
  assert.equal(mostTired(state), worker);
  assert.match(sendToBreak(state, worker.id), /Break time: 30 s/);
  assert.equal(worker.duty, "to-break");
  assert.ok(until(state, () => worker.duty === "resting", 20), "walks to the break room");
  const layout = plan(state), spot = { x: Math.round(worker.walker.x), y: Math.round(worker.walker.y) };
  assert.ok(layout.restSpots.some(tile => tile.x === spot.x && tile.y === spot.y));
  assert.ok(until(state, () => worker.duty === "work", 35));
  assert.equal(member.fatigue, 0);
  member.fatigue = 30;
  assert.match(sendToBreak(state, worker.id), /Break time: 20 s/, "shorter break when less tired");
});

test("exhausted staff stop working until rested", () => {
  const state = cafe({ ownedFriends: [3412] });
  assignStaff(state, 0, { owned: 3412 }, "chef"); openCafe(state); run(state, 2);
  assert.equal(kitchenSlots(state), 2);
  memberOf(state, state.workers[1]).fatigue = 100;
  assert.equal(kitchenSlots(state), 1);
});

test("staff slots and assignments", () => {
  const state = cafe({ ownedFriends: [3412, 555] }); state.beans = 5000;
  assert.equal(state.staffSlots, 1);
  assert.match(buy(state, "slot"), /level 2/);
  state.level = 3; buy(state, "slot");
  assert.match(assignStaff(state, 0, { owned: 9999 }), /Friends you own/);
  assert.equal(assignStaff(state, 0, { owned: 3412 }, "waiter"), null);
  assert.equal(assignStaff(state, 1, { guest: state.applicants[0] }, "promoter"), null);
  assert.equal(setStaffRole(state, 0, "chef"), null);
  assert.equal(state.workers.length, 3);
  assert.equal(assignStaff(state, 1, { owned: 3412 }), null);
  assert.equal(state.staff.length, 1, "moving a Friend keeps one assignment");
  setOwnedFriends(state, [555]);
  assert.equal(state.staff.length, 0, "Friends no longer in the wallet leave the staff");
});

test("progress saves and restores per wallet, including size and worker XP", () => {
  const state = cafe({ ownedFriends: [{ id: 3412, generation: 3 }], shop: "burger" });
  assert.equal(serializeCafe(state), null);
  state.beans = 5000; state.level = 4;
  placeItem(state, "lamp", { x: 9, y: 9 }); applyFinish(state, "floor", "planks"); buy(state, "slot"); buy(state, "expand");
  assignStaff(state, 0, { owned: 3412 }, "promoter"); assignStaff(state, 1, { guest: state.applicants[1] }, "waiter"); unlockDish(state, "burger:2");
  staffAt(state, 0).xp = 33;
  openCafe(state); run(state, 20);
  const save = JSON.parse(JSON.stringify(serializeCafe(state)));
  const fresh = cafe({ ownedFriends: [{ id: 3412, generation: 3 }] });
  assert.equal(restoreCafe(fresh, save), true);
  assert.equal(fresh.shop, "burger"); assert.equal(fresh.size, 12); assert.equal(fresh.floor, "planks"); assert.ok(fresh.unlocked.has("burger:2"));
  assert.equal(fresh.staff.length, 2); assert.equal(staffAt(fresh, 0).xp, staffAt(state, 0).xp); assert.ok(staffAt(fresh, 0).xp >= 33); assert.equal(staffAt(fresh, 0).role, "promoter");
  assert.equal(restoreCafe(fresh, save), false, "a save applies once");
  const other = cafe({ ownedFriends: [] });
  assert.equal(restoreCafe(other, save), true);
  assert.equal(other.staff.length, 1, "owned staff not in this wallet's roster are dropped");
});

test("older saves migrate; furniture that no longer fits is refunded; broken saves are rejected", () => {
  const v1 = { v: 1, shop: "cafe", day: 3, beans: 100, xp: 20, level: 2, rating: 4, machine: 1, unlocked: ["cafe:0", "cafe:1"],
    items: [{ kind: "table", x: 4, y: 3, dir: 0 }, { kind: "plant", x: 1, y: 8, dir: 0 }], wallpaper: "plain", floor: "checker", finishes: ["plain", "checker"],
    staffSlots: 1, staff: [], totalServed: 12 };
  const state = cafe();
  assert.equal(restoreCafe(state, v1), true);
  assert.equal(state.size, START_SIZE); assert.equal(state.day, 3);
  assert.equal(state.beans, 135, "the plant in the old kitchen area is refunded");
  const base = cafe(); base.beans = 500; openCafe(base);
  const good = serializeCafe(base);
  for (const bad of [null, "x", { ...good, v: 99 }, { ...good, beans: -5 }, { ...good, shop: "casino" }, { ...good, unlocked: ["seafood:0"] },
    { ...good, size: 13 }, { ...good, size: 30 }, { ...good, wallpaper: "damask" }]) assert.equal(restoreCafe(cafe(), bad), false, JSON.stringify(bad)?.slice(0, 50));
});

test("kept capsule recipes unlock specials and Genesis VIP guests", () => {
  const state = cafe({ shop: "pastry" }); openCafe(state);
  setBlends(state, [0, 1, 1, 1]);
  assert.ok(availableDishes(state).includes("pastry:7") && availableDishes(state).includes("pastry:8"));
  assert.ok(until(state, () => state.customers.some(c => c.vip), DAY_LENGTH));
  setBlends(state, [0, 0, 0, 0]);
  assert.ok(!availableDishes(state).includes("pastry:7"));
});

test("Beans purchases and dish unlocks respect cost and level", () => {
  const state = cafe(); state.beans = 10;
  assert.equal(buy(state, "machine"), "Not enough Beans.");
  state.beans = 1000;
  assert.equal(buy(state, "machine"), null);
  assert.match(unlockDish(state, "cafe:2"), /level 2/);
  state.level = 2;
  assert.equal(unlockDish(state, "cafe:2"), null);
  assert.equal(tableLimit(1), 4);
});

test("family perks change the manager", () => {
  assert.ok(manager(cafe({ familyId: 5 })).walker.speed >= 0);
  const hoverer = cafe({ familyId: 5 }), mask = cafe({ familyId: 1 });
  openCafe(hoverer); openCafe(mask); run(hoverer, 0.1); run(mask, 0.1);
  assert.ok(manager(hoverer).walker.speed > manager(mask).walker.speed, "Hoverer moves faster");
  assert.equal(cafe({ familyId: 7 }).rating, 4, "Sparkling starts half a star higher");
});

test("host roster carries generations and must include the verified manager", () => {
  assert.deepEqual(parseStaffRoster(["7730:1", "3412:6", "12:2"], 7730n), { manager: 1, staff: [{ id: 3412, generation: 6 }, { id: 12, generation: 2 }] });
  assert.deepEqual(parseStaffRoster(["7730"], 7730n), { manager: null, staff: [] });
  assert.equal(parseStaffRoster(["3412:1", "12:2"], 7730n), null, "a roster without the manager is ignored");
  assert.equal(parseStaffRoster(["x", "-1", 5], 7730n), null);
  assert.equal(parseStaffRoster("7730:1", 7730n), null);
});

test("guest art is deterministic 16×16 one-bit masks", () => {
  const a = createGuests(18);
  assert.deepEqual(a, createGuests(18));
  for (const guest of a) for (const frame of guest.frames) {
    assert.equal(frame.length, 16);
    for (const row of frame) assert.match(row, /^[#.]{16}$/);
  }
});

test("capsule table matches the documented economy", () => {
  assert.equal(BigInt(game.price), 10n ** 18n);
  assert.equal(game.outcomes.reduce((sum, o) => sum + o.chanceBps, 0), 10000);
  const expected = game.outcomes.reduce((sum, o) => sum + BigInt(o.reward) * BigInt(o.chanceBps), 0n) / 10000n;
  assert.equal(expected, 880000000000000000n);
});

test("end-of-day post text tags Rare Friends and fits in one post", async () => {
  const { shareText, postLength, SHARE_TAGS } = await import("../games/rarefriends-cafe/card.ts");
  const state = cafe({ shop: "seafood" }); openCafe(state); run(state, 30);
  state.day = 12345; state.today.served = 999; state.today.beans = 1234567;
  const text = shareText(state, 123456789n, 6);
  assert.ok(text.includes("@RareFriendsNFT") && text.includes("#RareFriends") && text.includes("#RareFriendsCafe"));
  assert.ok(text.endsWith(SHARE_TAGS));
  assert.ok(postLength(text) <= 280, `post is ${postLength(text)} characters`);
});

test("capsules grant RF-exclusive collectibles by tier; duplicates become Beans; each exclusive places once", async () => {
  const { EXCLUSIVES, DUPLICATE_BEANS } = await import("../games/rarefriends-cafe/data.ts");
  const state = cafe();
  assert.match(placeItem(state, "statue", { x: 8, y: 8 }), /comes from Rare Recipe Capsules/);
  const golden = collectFromCapsule(state, 3);
  assert.equal(golden.exclusive, "statue");
  const beans = state.beans, again = collectFromCapsule(state, 3);
  assert.deepEqual(again, { exclusive: null, beans: DUPLICATE_BEANS[3] });
  assert.equal(state.beans, beans + DUPLICATE_BEANS[3]);
  assert.equal(placeItem(state, "statue", { x: 8, y: 8 }), null, "exclusives are free to place");
  assert.match(placeItem(state, "statue", { x: 8, y: 9 }), /already placed/);
  for (let i = 0; i < 10; i++) collectFromCapsule(state, 0);
  assert.equal(EXCLUSIVES.filter(item => item.tier === 0).every(item => state.collection.has(item.kind)), true);
});

test("collection and music preferences are saved; tracks unlock with exclusives", async () => {
  const { TRACKS } = await import("../games/rarefriends-cafe/audio.ts");
  assert.equal(TRACKS.find(track => track.id === "neon").unlock, "jukebox");
  const state = cafe(); openCafe(state);
  state.collection.add("jukebox"); state.prefs = { track: "neon", music: false, sfx: true, volume: 0.3 };
  const fresh = cafe();
  assert.equal(restoreCafe(fresh, JSON.parse(JSON.stringify(serializeCafe(state)))), true);
  assert.ok(fresh.collection.has("jukebox"));
  assert.deepEqual(fresh.prefs, { track: "neon", music: false, sfx: true, volume: 0.3 });
  const tampered = { ...serializeCafe(state), collection: ["jukebox", "casino"], items: [...serializeCafe(state).items, { kind: "statue", x: 8, y: 8, dir: 0 }] };
  const other = cafe();
  assert.equal(restoreCafe(other, tampered), true);
  assert.deepEqual([...other.collection], ["jukebox"], "unknown collectibles are dropped");
  assert.ok(!other.items.some(item => item.kind === "statue"), "uncollected exclusives can't be restored");
});

test("X posts link to rarefriends.com", async () => {
  const { shareText } = await import("../games/rarefriends-cafe/card.ts");
  const state = cafe(); openCafe(state); run(state, 5);
  const text = shareText(state, 7730n, 5);
  assert.ok(text.includes("https://rarefriends.com/"));
  assert.ok(!text.includes("github.io"));
});
