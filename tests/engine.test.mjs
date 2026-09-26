import test from "node:test";
import assert from "node:assert/strict";
import {
  actOnCounter, actOnCustomer, ambience, applyFinish, assignStaff, availableDishes, buy, chooseShop, cookTime, createCafe, kitchenSlots,
  manager, memberOf, mostTired, moveItem, openCafe, placeItem, plan, restoreCafe, sellItem, sendToBreak, serializeCafe, setBlends,
  setOwnedFriends, setStaffRole, staffAt, staffPower, tableCount, unlockDish, update, walkInChance,
} from "../games/rarefriends-cafe/engine.ts";
import { DAY_LENGTH, SHOPS, dishById, tableLimit, tierOf, workerLevel } from "../games/rarefriends-cafe/data.ts";
import { DEFAULT_ITEMS, MAX_SIZE, START_SIZE, layoutProblem, placementProblem, planFor, route, seatOf } from "../games/rarefriends-cafe/layout.ts";
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
  assert.match(buy(state, "expand"), /level 3/);
  state.level = 9;
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
  state.beans = 5000; state.level = 3;
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
