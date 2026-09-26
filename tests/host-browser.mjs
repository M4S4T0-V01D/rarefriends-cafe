// End-to-end check of the custom runtime page (host/runtime.tsx) with the SDK's mock wallet fixture:
// a wallet holding two Friends (#7730 manager, #3412 staff), owned-Friend staff, and per-wallet save + restore.
// Automated test only: public builds always use the real wallet and ownership gate.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { decodeFunctionData, encodeEventTopics, encodeFunctionResult, padHex, parseAbi, zeroAddress } from "viem";
import { createGameServer } from "@rarefriends/friendsdk/serve";
import { FAMILIES_REGISTRY_ABI, GENERATION_SPRITE_MANIFEST } from "@rarefriends/friendsdk/sprites";
import { installFixture, OWNER } from "../node_modules/@rarefriends/friendsdk/scripts/browser-fixture.mjs";
import { REGULAR_SPRITES } from "../games/rarefriends-cafe/regulars.ts";

const COLLECTION = "0x14C49e6118F46525dE9ab41a51cBAA3c6EBF181D";
const ABI = parseAbi([
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  "function balanceOf(address account) view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
]);
const art = new Map(REGULAR_SPRITES.map(sprites => [sprites.tokenId, sprites]));
const artworkCall = call => {
  assert.equal(call.to.toLowerCase(), GENERATION_SPRITE_MANIFEST.registry.toLowerCase());
  const { functionName, args } = decodeFunctionData({ abi: FAMILIES_REGISTRY_ABI, data: call.data });
  let result;
  if (functionName === "familyOf") result = art.get(args[0]).familyId;
  else if (functionName === "seedOf") result = art.get(args[0]).seed;
  else if (functionName === "frames") result = [...art.values()].find(item => item.familyId === args[0] && item.seed === args[1]).frames;
  else throw new Error(`Unexpected artwork read ${functionName}`);
  return encodeFunctionResult({ abi: FAMILIES_REGISTRY_ABI, functionName, result });
};
const log = tokenId => ({ address: COLLECTION, blockNumber: "0x10", blockHash: padHex("0x10", { size: 32 }), data: "0x", logIndex: `0x${tokenId.toString(16)}`,
  transactionHash: padHex(`0x${tokenId.toString(16)}`, { size: 32 }), transactionIndex: "0x0", removed: false,
  topics: encodeEventTopics({ abi: ABI, eventName: "Transfer", args: { from: zeroAddress, to: OWNER, tokenId } }) });

const outdir = await mkdtemp(join(tmpdir(), "cafe-host-"));
let browser, server;
const errors = [];
try {
  execFileSync("node", ["scripts/build.mjs", "--outdir", join(outdir, "dist")], { stdio: "inherit" });
  server = createGameServer(join(outdir, "dist"));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 960, height: 800 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  page.on("pageerror", error => errors.push(error.message));
  const fixture = await installFixture(page, origin, { artworkCall });
  // The same wallet also holds #3412: extend the fixture's owner-filtered discovery reads.
  await page.route("https://rpc.mainnet.chain.robinhood.com/**", async route => {
    const request = route.request().method() === "POST" ? route.request().postDataJSON() : null;
    const reply = result => route.fulfill({ json: { jsonrpc: "2.0", id: request.id, result }, headers: { "access-control-allow-origin": "*" } });
    if (request?.method === "eth_getLogs" && request.params[0].topics?.[2]?.toLowerCase() === padHex(OWNER, { size: 32 })) return reply([log(7730n), log(3412n)]);
    if (request?.method === "eth_call" && request.params[0].to.toLowerCase() === COLLECTION.toLowerCase()) {
      let decoded = null;
      try { decoded = decodeFunctionData({ abi: ABI, data: request.params[0].data }); } catch { return route.fallback(); }
      const { functionName, args } = decoded;
      if (functionName === "balanceOf") return reply(encodeFunctionResult({ abi: ABI, functionName, result: 2n }));
      if (functionName === "ownerOf" && args[0] === 3412n) return reply(encodeFunctionResult({ abi: ABI, functionName, result: OWNER }));
    }
    return route.fallback();
  });
  const game = page.frameLocator("iframe");
  const cafe = game.locator(".cafe-game");
  const enter = async () => {
    await page.goto(origin);
    await page.getByRole("button", { name: /^Connect (wallet|Browser wallet)$/ }).click();
    await page.getByRole("button", { name: /^Friend #7730\b/ }).click();
    await cafe.waitFor();
  };

  await enter();
  await game.getByRole("heading", { name: "What kind of shop is it?" }).waitFor();
  await game.locator('.cafe-game[data-owned="1"][data-linked="yes"]').waitFor();
  await game.getByRole("radio", { name: /Flour Moon/ }).click();
  await game.getByRole("button", { name: "Staff & upgrades", exact: true }).click();
  await game.getByRole("button", { name: "Choose", exact: true }).click();
  await game.getByRole("button", { name: /Your Friend #3412/ }).click();
  await game.getByRole("radio", { name: "Chef" }).click();
  await game.getByText(/Skeleton · owned/).waitFor();
  await page.locator(".rf-game-frame").screenshot({ path: "./artifacts/host-staff.png" });
  await game.getByRole("button", { name: /^Close Upgrades/ }).click();
  await game.getByRole("button", { name: "Open Flour Moon", exact: true }).click();
  await page.waitForTimeout(6000);
  await page.locator(".rf-game-frame").screenshot({ path: "./artifacts/host-playing.png" });
  const key = `rarefriends-cafe:save:v1:${OWNER.toLowerCase()}`;
  const saved = JSON.parse(await page.evaluate(name => localStorage.getItem(name), key));
  assert.equal(saved?.shop, "pastry", "progress is saved for this wallet address");
  assert.deepEqual(saved.staff, [{ slot: 0, role: "chef", owned: 3412 }]);

  // Reload: the same wallet gets its shop back.
  await enter();
  await game.getByRole("heading", { name: "Welcome back to Flour Moon" }).waitFor();
  assert.equal(await cafe.getAttribute("data-shop"), "pastry");
  await page.locator(".rf-game-frame").screenshot({ path: "./artifacts/host-welcome-back.png" });
  assert.deepEqual([...errors, ...fixture.errors], [], "browser errors");
  assert((await page.evaluate(() => window.__friendWalletTest.state.requests)).every(method =>
    ["eth_accounts", "eth_requestAccounts", "eth_chainId", "wallet_switchEthereumChain"].includes(method)), "no signing requests");
  console.log("PASS custom host: owned-Friend staff and per-wallet save/restore");
} finally {
  await browser?.close();
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  await rm(outdir, { recursive: true, force: true });
}
