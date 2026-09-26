/**
 * Trusted runtime page for RareFriends Cafe.
 *
 * This is the SDK's own GameHost: wallet connection, owned-Friend picker, fresh eligibility check,
 * simulated ledger, confirmations and the sandboxed frame. It adds two things for the game:
 *  1. A read-only discovery of the connected account's eligible Friends with the SDK's `readOwnedFriends`,
 *     so your other owned Friends can work as staff.
 *  2. Per-wallet save data. The sandbox has no storage, so this trusted page keeps each wallet's progress
 *     in its own localStorage, keyed by wallet address.
 * Both reach the sandboxed game only over postMessage, when it asks. The watcher session only uses
 * `eth_accounts`: no signing and no extra prompts. GameHost still owns connection and selection.
 */
import { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { GameHost } from "@rarefriends/friendsdk/runtime";
import { parseChanceGame } from "@rarefriends/friendsdk/game";
import { readOwnedFriends } from "@rarefriends/friendsdk/owned";
import { createFriendPublicClient, createFriendWalletSession } from "@rarefriends/friendsdk/wallet";
import { HOST_HELLO, HOST_STATE, SAVE_WRITE } from "../games/rarefriends-cafe/roster.ts";
import gameJson from "../games/rarefriends-cafe/game.json";
import "@rarefriends/friendsdk/frame.css";
import "@rarefriends/friendsdk/runtime.css";

const definition = parseChanceGame(gameJson);
const saveKey = (account: string) => `rarefriends-cafe:save:v1:${account.toLowerCase()}`;
function readSave(account: string): unknown {
  try { const raw = localStorage.getItem(saveKey(account)); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function writeSave(account: string, save: unknown) {
  try { const raw = JSON.stringify(save); if (raw.length < 100_000) localStorage.setItem(saveKey(account), raw); } catch { /* Storage full or blocked: play continues unsaved. */ }
}

function CafeHost() {
  useEffect(() => {
    const session = createFriendWalletSession(), client = createFriendPublicClient();
    let account: string | null = null, controller: AbortController | null = null, roster: string[] | null = null;
    const frames = () => [...document.querySelectorAll("iframe")].flatMap(frame => frame.contentWindow ? [frame.contentWindow] : []);
    // Nothing is sent until this wallet's roster is known, so the game can match it to its verified manager.
    const send = (target: Window) => { if (account && roster) target.postMessage({ type: HOST_STATE, ids: roster, save: readSave(account) }, "*"); };
    const broadcast = () => frames().forEach(send);
    const check = () => {
      const snapshot = session.getSnapshot();
      const next = snapshot.status === "connected" ? snapshot.account : null;
      if (next === account) return;
      account = next; controller?.abort(); roster = null;
      if (!next) return;
      const current = controller = new AbortController();
      void readOwnedFriends(client, next, { signal: current.signal })
        .then(result => { if (!current.signal.aborted) { roster = result.friends.map(friend => friend.id.toString()); broadcast(); } })
        .catch(() => { /* Staff roster is optional; the game falls back to guest Friends. */ });
    };
    // Only the game frame we host may ask or save. Saves are accepted only for a Friend in this wallet's roster.
    const receive = (event: MessageEvent) => {
      if (!event.source || !frames().includes(event.source as Window)) return;
      if (event.data?.type === HOST_HELLO) send(event.source as Window);
      else if (event.data?.type === SAVE_WRITE && account && roster?.includes(String(event.data.manager))) writeSave(account, event.data.save);
    };
    window.addEventListener("message", receive);
    const unsubscribe = session.subscribe(check); check();
    // Pick up a connection made through GameHost even if the wallet emits no accountsChanged event.
    const poll = setInterval(() => { if (session.getSnapshot().status !== "connected") void session.refresh(); }, 2500);
    return () => { clearInterval(poll); unsubscribe(); window.removeEventListener("message", receive); controller?.abort(); session.dispose(); };
  }, []);
  return <GameHost definition={definition} frameUrl="./game.html" />;
}

createRoot(document.getElementById("root")!).render(<CafeHost />);
