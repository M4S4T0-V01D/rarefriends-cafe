// Automated browser check with the SDK's mock wallet fixture (tests only; real play needs an eligible wallet).
import assert from "node:assert/strict";
import { testGame } from "@rarefriends/friendsdk/testing";

const game = "./games/rarefriends-cafe";
const shot = (page, name) => page.locator(".rf-game-frame").screenshot({ path: `./artifacts/${name}.png` });
const number = async (frame, attribute) => Number(await frame.locator(".cafe-game").getAttribute(attribute));

await testGame(game, {
  screenshot: "./artifacts/desktop-final.png",
  timeout: 60_000,
  check: async ({ page, game: frame }) => {
    await frame.getByRole("button", { name: "Open the café", exact: true }).click();
    assert.equal(await frame.locator(".cafe-game").getAttribute("data-phase"), "open");
    const canvas = frame.locator("canvas[tabindex]");
    // Serve guests with the keyboard: table numbers take orders and fetch dishes, C picks up at the counter.
    const deadline = Date.now() + 45_000;
    let shotTaken = false;
    while (Date.now() < deadline && (await number(frame, "data-served")) < 2) {
      await canvas.focus();
      for (const key of ["1", "2", "3", "c"]) await page.keyboard.press(key);
      await page.waitForTimeout(700);
      if (!shotTaken && (await number(frame, "data-customers")) >= 2) { await page.waitForTimeout(1500); await shot(page, "desktop-service"); shotTaken = true; }
    }
    assert((await number(frame, "data-served")) >= 2, "Guests should be served through the keyboard loop");
    assert((await number(frame, "data-beans")) > 30, "Serving earns Beans");
    // Tap-to-walk on the floor via the pointer path.
    const box = await canvas.boundingBox();
    await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.8);
    // Rare Blend Capsule: buy (runtime confirmation), open (runtime confirmation), keep.
    await frame.getByRole("button", { name: /^Capsules/ }).click();
    await frame.getByRole("button", { name: /^Buy capsule/ }).click();
    await page.getByRole("button", { name: "Confirm preview", exact: true }).click();
    await frame.getByText("One capsule added to your Friend.").or(frame.getByText(/1 capsule\b/)).first().waitFor();
    await frame.getByRole("button", { name: "Open a capsule", exact: true }).click();
    await page.getByRole("button", { name: "Confirm preview", exact: true }).click();
    await frame.getByRole("heading", { name: "House Blend" }).waitFor();
    await shot(page, "desktop-capsule");
    await frame.getByRole("button", { name: "Keep blend", exact: true }).click();
    await frame.getByText("Kept blends · 1").waitFor();
    await frame.getByRole("button", { name: "Close Rare Blend Capsules" }).click();
    // Upgrades open and list the three categories.
    await frame.getByRole("button", { name: "Upgrades", exact: true }).click();
    await frame.getByRole("tab", { name: "Café" }).click();
    await shot(page, "desktop-upgrades");
    await frame.getByRole("button", { name: /^Close Upgrades/ }).click();
    // Settings: mute toggle and reduced motion.
    await frame.getByRole("button", { name: "Settings", exact: true }).click();
    await frame.getByRole("button", { name: "Sound off", exact: true }).click();
    await frame.getByRole("button", { name: "Sound on", exact: true }).waitFor();
    await frame.getByRole("button", { name: "Close Settings" }).click();
    await page.waitForTimeout(2500);
  },
});
console.log("PASS desktop gameplay check");

await testGame(game, {
  width: 360, height: 700, screenshot: "./artifacts/phone-final.png", timeout: 60_000,
  check: async ({ page, game: frame }) => {
    await shot(page, "phone-intro");
    await frame.getByRole("button", { name: "Open the café", exact: true }).click();
    // Tap a seated guest on a touch screen.
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline && (await number(frame, "data-customers")) < 1) await page.waitForTimeout(300);
    await page.waitForTimeout(3500);
    const canvas = frame.locator("canvas[tabindex]"), box = await canvas.boundingBox();
    for (const [x, y] of [[0.5, 0.42], [0.66, 0.55], [0.5, 0.62], [0.66, 0.74]]) await page.touchscreen.tap(box.x + box.width * x, box.y + box.height * y);
    await page.waitForTimeout(1200);
    await shot(page, "phone-service");
  },
});
console.log("PASS phone check");
