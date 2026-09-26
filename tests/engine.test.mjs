import test from "node:test";
import assert from "node:assert/strict";
import {
  actOnCounter, actOnCustomer, availableDishes, buy, createCafe, manager, openCafe, setBlends, unlockDish, update,
} from "../games/rarefriends-cafe/engine.ts";
import { DAY_LENGTH, MAX_TABLES } from "../games/rarefriends-cafe/data.ts";
import { DOOR, PICKUP, TABLES, blockedTiles, route, serviceTiles } from "../games/rarefriends-cafe/layout.ts";
import { createGuests } from "../games/rarefriends-cafe/guests.ts";
import game from "../games/rarefriends-cafe/game.json" with { type: "json" };

function seeded(seed = 42) { return () => ((seed = (seed * 16807) % 2147483647) / 2147483647); }
const cafe = (familyId = 1, rng = seeded()) => createCafe({ familyId, guestCount: 18, regulars: [3412], rng });
const run = (state, seconds, step = 0.05) => { for (let t = 0; t < seconds; t += step) update(state, step); };
const until = (state, done, limit = 120) => { for (let t = 0; t < limit && !done(); t += 0.05) update(state, 0.05); return done(); };

test("every seat and service spot is reachable with a fully furnished café", () => {
  const blocked = blockedTiles(MAX_TABLES, 5);
  for (const { table, seat } of TABLES) {
    assert.ok(route(DOOR, [seat], blocked), `seat ${seat.x},${seat.y}`);
    const spots = serviceTiles(table, blocked);
    assert.ok(spots.length > 0);
    assert.ok(route(PICKUP, spots, blocked), `service for ${table.x},${table.y}`);
  }
});

test("take order → cook → pick up → serve earns Beans and XP", () => {
  const state = cafe(); openCafe(state);
  assert.ok(until(state, () => state.customers.some(c => c.state === "waiting")));
  const guest = state.customers.find(c => c.state === "waiting");
  assert.match(actOnCustomer(state, guest.id), /Taking/);
  assert.ok(until(state, () => guest.state === "ordered"));
  assert.ok(until(state, () => state.orders.some(o => o.customer === guest.id && o.state === "ready")));
  assert.match(actOnCounter(state), /Picking up/);
  const before = state.beans;
  assert.ok(until(state, () => guest.state === "eating" || guest.state === "leaving"));
  assert.ok(state.beans > before, "paid in Beans");
  assert.equal(state.today.served, 1);
  assert.ok(state.xp >= 1);
});

test("ignored guests leave unhappy and lower the rating", () => {
  const state = cafe(); openCafe(state);
  const rating = state.rating;
  assert.ok(until(state, () => state.today.lost > 0, 90));
  assert.ok(state.rating < rating);
});

test("the day closes into a summary once the last guest leaves", () => {
  const state = cafe(); openCafe(state);
  assert.ok(until(state, () => state.phase === "summary", DAY_LENGTH + 120));
  assert.equal(state.customers.length, 0);
  openCafe(state);
  assert.equal(state.day, 2); assert.equal(state.phase, "open"); assert.equal(state.today.served, 0);
});

test("Beans purchases respect cost and café level", () => {
  const state = cafe();
  state.beans = 10;
  assert.equal(buy(state, "table"), "Not enough Beans.");
  state.beans = 1000;
  assert.equal(buy(state, "table"), null); assert.equal(state.tables, 4);
  assert.match(buy(state, "table"), /level 2/);
  assert.match(buy(state, "waiter"), /level 2/);
  assert.match(unlockDish(state, "matcha"), /level 2/);
  state.level = 2;
  assert.equal(unlockDish(state, "matcha"), null);
  assert.equal(buy(state, "waiter"), null);
  assert.equal(state.workers.length, 2);
  assert.ok(availableDishes(state).includes("matcha"));
});

test("hired helpers serve guests with no player input", () => {
  const state = cafe(); state.beans = 1000; state.level = 2; buy(state, "waiter"); openCafe(state);
  run(state, 60);
  assert.ok(state.today.served > 0, "helper served at least one guest");
});

test("kept capsule blends unlock specials and Genesis VIP guests", () => {
  const state = cafe(); openCafe(state);
  assert.ok(!availableDishes(state).includes("silver"));
  setBlends(state, [0, 1, 1, 1]);
  assert.ok(availableDishes(state).includes("silver"));
  assert.ok(availableDishes(state).includes("moonlight"));
  assert.ok(until(state, () => state.customers.some(c => c.vip), DAY_LENGTH));
  setBlends(state, [0, 0, 0, 0]);
  assert.ok(!availableDishes(state).includes("silver"), "redeeming removes the bonus");
});

test("family perks change the manager", () => {
  assert.ok(manager(cafe(5)).walker.speed > manager(cafe(1)).walker.speed, "Hoverer moves faster");
  assert.equal(cafe(7).rating, 4, "Sparkling starts half a star higher");
});

test("guest art is deterministic 16×16 one-bit masks", () => {
  const a = createGuests(18), b = createGuests(18);
  assert.deepEqual(a, b);
  for (const guest of a) for (const frame of guest.frames) {
    assert.equal(frame.length, 16);
    for (const row of frame) assert.match(row, /^[#.]{16}$/);
  }
});

test("capsule table matches the documented economy", () => {
  const rf = 10n ** 18n;
  assert.equal(BigInt(game.price), rf);
  assert.equal(game.outcomes.reduce((sum, o) => sum + o.chanceBps, 0), 10000);
  const expected = game.outcomes.reduce((sum, o) => sum + BigInt(o.reward) * BigInt(o.chanceBps), 0n) / 10000n;
  assert.equal(expected, 880000000000000000n, "0.88 RF expected value per 1 RF capsule");
});
