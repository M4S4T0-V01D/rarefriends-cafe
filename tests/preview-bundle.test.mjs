// The published preview is transaction-free, as FriendSDK v0.1.4 intends for preview builds: build it and check that
// neither the runtime page nor the game carries live RF transfer, approval, signing or raw-transaction code.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const MARKERS = ["eth_sendTransaction", "eth_sendRawTransaction", "eth_signTypedData", "personal_sign", "wallet_sendCalls", "approve(", "transferFrom"];

test("the preview build carries no transaction-capable code", async () => {
  const outdir = join(await mkdtemp(join(tmpdir(), "cafe-bundle-")), "dist");
  execFileSync("node", ["scripts/build.mjs", "--outdir", outdir], { stdio: "ignore" });
  for (const file of ["runtime.js", "game.js"]) {
    const code = await readFile(join(outdir, file), "utf8");
    for (const marker of MARKERS) assert.ok(!code.includes(marker), `${file} contains ${marker}`);
  }
});
