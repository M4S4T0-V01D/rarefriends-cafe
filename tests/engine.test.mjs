import test from "node:test";
import assert from "node:assert/strict";
import {
  actOnCounter, actOnCustomer, ambience, applyFinish, assignStaff, availableDishes, buy, chooseShop, cookTime, createCafe, kitchenSlots,
  manager, moveItem, openCafe, placeItem, restoreCafe, sellItem, serializeCafe, setBlends, setOwnedFriends, setStaffRole, tableCount,
  unlockDish, update,
} from "../games/rarefriends-cafe/engine.ts";
import { DAY_LENGTH, SHOPS, dishById, tableLimit } from "../games/rarefriends-cafe/data.ts";
import { DEFAULT_ITEMS, DOOR, PICKUP, layoutProblem, placementProblem, route, seatOf } from "../games/rarefriends-cafe/layout.ts";
import { createGuests } from "../games/rarefriends-cafe/guests.ts";
import { parseStaffRoster } from "../games/rarefriends-cafe/roster.ts";
import game from "../games/rarefriends-cafe/game.json" with { type: "json" };

function seeded(seed = 42) { return () => ((seed = (seed * 16807) % 2147483647) / 2147483647); }
const cafe = (options = {}) => createCafe({ familyId: 1, guestCount: 18, regulars: [3412], rng: seeded(), ...options });
const run = (state, seconds, step = 0.05) => { for (let t = 0; t < seconds; t += step) update(state, step); };
const until = (state, done, limit = 120) => { for (let t = 0; t < limit && !done(); t += 0.05) update(state, 0.05); return done(); };

test("the default layout is walkable: every seat, the counter and the capsule spot are reachable", () => {
  assert.equal(layoutProblem(DEFAULT_ITEMS), null);
  for (const item of DEFAULT_ITEMS) assert.ok(route(DOOR, [seatOf(item)], new Set()));
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
  assert.equal(state.shop, "seafood");
});

test("take order → cook → pick up → serve earns Beans and XP", () => {
  const state = cafe({ shop: "asian" }); openCafe(state);
  assert.ok(until(state, () => state.customers.some(c => c.state === "waiting")));
  const guest = state.customers.find(c => c.state === "waiting");
  assert.match(actOnCustomer(state, guest.id), /Taking/);
  assert.ok(until(state, () => guest.state === "ordered"));
  assert.ok(guest.dish.startsWith("asian:"));
  assert.ok(until(state, () => state.orders.some(o => o.customer === guest.id && o.state === "ready")));
  assert.match(actOnCounter(state), /Picking up/);
  const before = state.beans;
  assert.ok(until(state, () => guest.state === "eating" || guest.state === "leaving"));
  assert.ok(state.beans > before, "paid in Beans");
  assert.equal(state.today.served, 1);
});

test("ignored guests leave unhappy and lower the rating; the day closes into a summary", () => {
  const state = cafe(); openCafe(state);
  const rating = state.rating;
  assert.ok(until(state, () => state.today.lost > 0, 90));
  assert.ok(state.rating < rating);
  assert.ok(until(state, () => state.phase === "summary", DAY_LENGTH + 120));
  openCafe(state);
  assert.equal(state.day, 2); assert.equal(state.today.served, 0);
});

test("build mode: place, rotate, move and sell furniture on the tile grid", () => {
  const state = cafe(); state.beans = 1000;
  assert.match(placeItem(state, "plant", PICKUP), /reserved/);
  assert.match(placeItem(state, "plant", { x: 4, y: 3 }), /already there/);
  assert.match(placeItem(state, "plant", { x: 4, y: 2 }), /already there/, "a table's chair tile is taken too");
  assert.equal(placeItem(state, "plant", { x: 8, y: 9 }), null);
  assert.equal(state.beans, 1000 - 35);
  assert.equal(placeItem(state, "table", { x: 7, y: 7 }, 1), null);
  const table = state.items.at(-1);
  assert.deepEqual(seatOf(table), { x: 6, y: 7 });
  assert.equal(tableCount(state), 4);
  assert.match(placeItem(state, "table", { x: 7, y: 9 }), /allows 4 tables/);
  assert.equal(moveItem(state, table.id, { x: 8, y: 5 }, 0), null);
  assert.deepEqual([table.x, table.y, table.dir], [8, 5, 0]);
  const beans = state.beans;
  assert.equal(sellItem(state, table.id), null);
  assert.equal(state.beans, beans + 30);
  assert.equal(tableCount(state), 3);
});

test("placement can't wall off guests or staff", () => {
  const items = [...DEFAULT_ITEMS];
  let problem = null;
  for (let y = 0; y < 11 && !problem; y++) {
    problem = placementProblem(items, { kind: "shelf", x: 3, y, dir: 0 });
    if (!problem) items.push({ id: 50 + y, kind: "shelf", x: 3, y, dir: 0 });
  }
  assert.match(problem, /wall off|reach/);
});

test("décor, wallpaper and floors raise ambience", () => {
  const state = cafe(); state.beans = 5000;
  assert.equal(applyFinish(state, "wallpaper", "damask"), null);
  assert.equal(applyFinish(state, "floor", "marble"), null);
  assert.equal(ambience(state), 2, "3 + 3 points");
  assert.equal(placeItem(state, "piano", { x: 9, y: 9 }), null);
  assert.equal(ambience(state), 3);
  const beans = state.beans;
  assert.equal(applyFinish(state, "wallpaper", "plain"), null);
  assert.equal(applyFinish(state, "wallpaper", "damask"), null, "owned designs are free to switch back to");
  assert.equal(state.beans, beans);
});

test("staff slots: start with one, unlock more with Beans and levels", () => {
  const state = cafe(); state.beans = 5000;
  assert.equal(state.staffSlots, 1);
  assert.match(buy(state, "slot"), /level 2/);
  state.level = 3;
  assert.equal(buy(state, "slot"), null); assert.equal(buy(state, "slot"), null);
  assert.equal(state.staffSlots, 3);
  assert.match(assignStaff(state, 3, { guest: state.applicants[0] }), /Unlock/);
});

test("owned Friends work as staff; guests fill in; chefs add kitchen slots", () => {
  const state = cafe({ ownedFriends: [3412, 555] }); state.beans = 5000; state.level = 3; buy(state, "slot");
  assert.match(assignStaff(state, 0, { owned: 9999 }), /Friends you own/);
  assert.equal(assignStaff(state, 0, { owned: 3412 }, "waiter"), null);
  assert.equal(assignStaff(state, 1, { guest: state.applicants[0] }, "waiter"), null);
  assert.equal(state.workers.length, 3);
  const base = cookTime(state, "cafe:4");
  assert.equal(setStaffRole(state, 0, "chef"), null);
  assert.equal(kitchenSlots(state), 2);
  assert.ok(cookTime(state, "cafe:4") < base, "an owned chef cooks faster");
  assert.equal(state.workers.length, 2, "chefs work in the kitchen, not the floor");
  assert.equal(assignStaff(state, 1, { owned: 3412 }), null);
  assert.equal(state.staff.length, 1, "moving a Friend keeps one assignment");
  setOwnedFriends(state, [555]);
  assert.equal(state.staff.length, 0, "Friends no longer in the wallet leave the staff");
});

test("hired staff serve guests with no player input", () => {
  const state = cafe({ ownedFriends: [3412] });
  assignStaff(state, 0, { owned: 3412 }, "waiter"); openCafe(state);
  run(state, 60);
  assert.ok(state.today.served > 0);
});

test("progress saves and restores per wallet (long-term state only)", () => {
  const state = cafe({ ownedFriends: [3412], shop: "burger" });
  assert.equal(serializeCafe(state), null, "nothing to save before the first day");
  state.beans = 5000; state.level = 3;
  chooseShop(state, "burger"); placeItem(state, "lamp", { x: 9, y: 9 }); applyFinish(state, "floor", "planks"); buy(state, "slot");
  assignStaff(state, 0, { owned: 3412 }, "chef"); assignStaff(state, 1, { guest: state.applicants[1] }, "waiter"); unlockDish(state, "burger:2");
  openCafe(state); run(state, 20);
  const save = JSON.parse(JSON.stringify(serializeCafe(state)));
  const fresh = cafe({ ownedFriends: [3412] });
  assert.equal(restoreCafe(fresh, save), true);
  assert.equal(fresh.shop, "burger"); assert.equal(fresh.beans, state.beans); assert.equal(fresh.level, 3); assert.equal(fresh.staffSlots, 2);
  assert.equal(fresh.floor, "planks"); assert.ok(fresh.unlocked.has("burger:2"));
  assert.deepEqual(fresh.items.map(({ kind, x, y, dir }) => [kind, x, y, dir]), state.items.map(({ kind, x, y, dir }) => [kind, x, y, dir]));
  assert.equal(fresh.staff.length, 2); assert.equal(kitchenSlots(fresh), 2);
  assert.equal(fresh.phase, "intro"); assert.equal(fresh.started, true);
  assert.equal(restoreCafe(fresh, save), false, "a save applies once, before the day opens");
  const other = cafe({ ownedFriends: [] });
  assert.equal(restoreCafe(other, save), true);
  assert.equal(other.staff.length, 1, "owned staff not in this wallet's roster are dropped");
});

test("a closed day resumes at the next day", () => {
  const state = cafe(); openCafe(state);
  assert.ok(until(state, () => state.phase === "summary", DAY_LENGTH + 120));
  const fresh = cafe();
  assert.equal(restoreCafe(fresh, JSON.parse(JSON.stringify(serializeCafe(state)))), true);
  assert.equal(fresh.day, 2);
});

test("tampered or broken saves are rejected whole", () => {
  const base = cafe(); base.beans = 500; openCafe(base);
  const good = serializeCafe(base);
  for (const bad of [
    null, "x", { ...good, v: 99 }, { ...good, beans: -5 }, { ...good, shop: "casino" }, { ...good, unlocked: ["seafood:0"] },
    { ...good, items: [...good.items, { kind: "plant", x: 2, y: 3, dir: 0 }] }, { ...good, items: [] }, { ...good, wallpaper: "damask" },
  ]) assert.equal(restoreCafe(cafe(), bad), false, JSON.stringify(bad)?.slice(0, 60));
});

test("kept capsule recipes unlock specials and Genesis VIP guests", () => {
  const state = cafe({ shop: "pastry" }); openCafe(state);
  setBlends(state, [0, 1, 1, 1]);
  assert.ok(availableDishes(state).includes("pastry:7"));
  assert.ok(availableDishes(state).includes("pastry:8"));
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
  assert.equal(tableLimit(1), 4); assert.equal(tableLimit(9), 10);
});

test("family perks change the manager", () => {
  assert.ok(manager(cafe({ familyId: 5 })).walker.speed > manager(cafe({ familyId: 1 })).walker.speed, "Hoverer moves faster");
  assert.equal(cafe({ familyId: 7 }).rating, 4, "Sparkling starts half a star higher");
});

test("host roster is accepted only for the verified manager's wallet", () => {
  assert.deepEqual(parseStaffRoster(["7730", "3412", "12"], 7730n), [3412, 12]);
  assert.deepEqual(parseStaffRoster(["7730"], 7730n), []);
  assert.equal(parseStaffRoster(["3412", "12"], 7730n), null, "a roster without the manager is ignored");
  assert.equal(parseStaffRoster(["x", "-1", 5], 7730n), null);
  assert.equal(parseStaffRoster("7730,3412", 7730n), null);
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
  assert.ok(text.includes("Tide & Shell") && text.includes("#123456789") && text.includes("Colossus"));
  assert.ok(postLength(text) <= 280, `post is ${postLength(text)} characters`);
});
