// Automated browser check with the SDK's mock wallet fixture (tests only; real play needs an eligible wallet).
// Uses the SDK CLI's own runtime page; tests/host-browser.mjs covers the custom host (staff roster + saves).
import assert from "node:assert/strict";
import { testGame } from "@rarefriends/friendsdk/testing";
import { cameraFor, project, toView } from "../games/rarefriends-cafe/layout.ts";

/** Viewport position of a grid tile at the starting shop size, through the game's camera. */
const tilePoint = (box, x, y, size = 10) => { const view = toView(cameraFor(size), project(x, y)); return { x: box.x + box.width * view.x / 960, y: box.y + box.height * view.y / 640 }; };

const game = "./games/rarefriends-cafe";
const shot = (page, name) => page.locator(".rf-game-frame").screenshot({ path: `./artifacts/${name}.png` });
const attr = async (frame, name) => await frame.locator(".cafe-game").getAttribute(`data-${name}`);
const number = async (frame, name) => Number(await attr(frame, name));

await testGame(game, {
  screenshot: "./artifacts/desktop-final.png",
  timeout: 60_000,
  check: async ({ page, game: frame }) => {
    await frame.getByRole("heading", { name: "What kind of shop is it?" }).waitFor();
    await shot(page, "desktop-intro");
    await frame.getByRole("radio", { name: /Tide & Shell/ }).click();
    await frame.getByRole("button", { name: "Open Tide & Shell", exact: true }).click();
    assert.equal(await attr(frame, "phase"), "open");
    assert.equal(await attr(frame, "shop"), "seafood");
    const canvas = frame.locator("canvas[tabindex]");
    // Serve guests with the keyboard: table numbers take orders and fetch dishes, C picks up at the counter.
    const deadline = Date.now() + 75_000;
    let shotTaken = false;
    while (Date.now() < deadline && (await number(frame, "beans")) < 90) {
      await canvas.focus();
      for (const key of ["1", "2", "3", "c"]) await page.keyboard.press(key);
      await page.waitForTimeout(700);
      if (!shotTaken && (await number(frame, "customers")) >= 2) { await page.waitForTimeout(1500); await shot(page, "desktop-service"); shotTaken = true; }
    }
    assert((await number(frame, "served")) >= 3, "Guests should be served through the keyboard loop");
    assert((await number(frame, "beans")) >= 90, "Serving earns Beans");

    // Build mode: place a plant with the pointer, a rug with the keyboard, then switch wallpaper.
    await frame.getByRole("button", { name: "Build", exact: true }).click();
    assert.equal(await attr(frame, "build"), "on");
    const items = await number(frame, "items");
    await frame.getByRole("button", { name: /^Potted monstera/ }).click();
    const box = await canvas.boundingBox(), spot = tilePoint(box, 9, 9);
    await page.mouse.click(spot.x, spot.y);
    await frame.getByText("Potted monstera placed.").waitFor();
    assert.equal(await number(frame, "items"), items + 1);
    await frame.getByRole("button", { name: /^Faded rose rug/ }).click();
    await canvas.focus();
    for (const key of ["ArrowUp", "ArrowUp", "Enter"]) await page.keyboard.press(key);
    await frame.getByText("Faded rose rug placed.").waitFor();
    await frame.getByRole("tab", { name: "Floor" }).click();
    await shot(page, "desktop-build");
    // Music: pick a jazz track in build mode; capsule-exclusive tracks start locked.
    await frame.getByRole("tab", { name: "Music" }).click();
    await frame.getByRole("radio", { name: /Street Bossa/ }).click();
    assert.equal(await frame.getByRole("radio", { name: /Neon Nights/ }).isDisabled(), true);
    await shot(page, "desktop-music");
    await frame.getByRole("button", { name: "Done", exact: true }).click();
    assert.equal(await attr(frame, "build"), "off");

    // Staff: hire a guest applicant as a chef.
    await frame.getByRole("button", { name: "Upgrades", exact: true }).click();
    await frame.getByRole("tab", { name: "Staff" }).click();
    await frame.getByRole("button", { name: "Choose", exact: true }).click();
    await frame.locator(".cafe-candidates button").first().click();
    await frame.getByRole("radio", { name: "Chef" }).click();
    await frame.getByText(/Guest applicant · Lv 1/).first().waitFor();
    await shot(page, "desktop-staff");
    await frame.getByRole("tab", { name: "Shop" }).click();
    await frame.getByText("Expand to 12 × 12").waitFor();
    await frame.getByRole("button", { name: /^Close Upgrades/ }).click();

    // Rare Recipe Capsule: buy (runtime confirmation), open (runtime confirmation), keep.
    await frame.getByRole("button", { name: /^Capsules/ }).click();
    await frame.getByRole("button", { name: /^Buy 5/ }).click();
    await page.getByRole("button", { name: "Confirm preview", exact: true }).click();
    await frame.getByText(/5 capsules ready/).first().waitFor();
    await shot(page, "desktop-capsule-machine");
    await frame.getByRole("button", { name: "Open all (5)", exact: true }).click();
    await page.getByRole("button", { name: "Confirm preview", exact: true }).click();
    await frame.getByRole("heading", { name: "5 capsules opened" }).waitFor();
    await frame.getByText(/New RF exclusive:/).first().waitFor();
    await shot(page, "desktop-capsule");
    await frame.getByRole("button", { name: "Keep the rest", exact: true }).click();
    await frame.getByRole("tab", { name: "Kept · 5" }).waitFor();
    await frame.getByRole("tab", { name: /^Collection · [1-3]\/8$/ }).click();
    await shot(page, "desktop-collection");
    await frame.getByRole("button", { name: "Place", exact: true }).first().click();
    assert.equal(await attr(frame, "build"), "on", "Place opens build mode with the exclusive selected");
    await frame.getByRole("button", { name: "Done", exact: true }).click();

    await frame.getByRole("button", { name: "Settings", exact: true }).click();
    await frame.getByRole("button", { name: "Sound on", exact: true }).click();
    await frame.getByRole("button", { name: "Sound off", exact: true }).waitFor();
    await frame.getByRole("checkbox", { name: "Music" }).waitFor();
    await frame.getByRole("button", { name: "Close Settings" }).click();
    await page.waitForTimeout(2500);
  },
});
console.log("PASS desktop gameplay check");

await testGame(game, {
  width: 360, height: 700, screenshot: "./artifacts/phone-final.png", timeout: 60_000,
  check: async ({ page, game: frame }) => {
    await shot(page, "phone-intro");
    await frame.getByRole("button", { name: /^Open / }).click();
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline && (await number(frame, "customers")) < 1) await page.waitForTimeout(300);
    await page.waitForTimeout(3500);
    const canvas = frame.locator("canvas[tabindex]"), box = await canvas.boundingBox();
    for (const [x, y] of [[0.5, 0.42], [0.66, 0.55], [0.5, 0.62], [0.66, 0.74]]) await page.touchscreen.tap(box.x + box.width * x, box.y + box.height * y);
    await page.waitForTimeout(1200);
    await shot(page, "phone-service");
    await frame.getByRole("button", { name: "Build", exact: true }).click();
    await shot(page, "phone-build");
  },
});
console.log("PASS phone check");
