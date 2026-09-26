/**
 * Trusted runtime page for RareFriends Cafe.
 *
 * This is the SDK's own GameHost: wallet connection, owned-Friend picker, fresh eligibility check,
 * simulated ledger, confirmations and the sandboxed frame. It adds two things for the game:
 *  1. A read-only discovery of the connected account's eligible Friends with the SDK's `readOwnedFriends`,
 *     so your other owned Friends can work as staff.
 *  2. Per-wallet save data. The sandbox has no storage, so this trusted page keeps each wallet's progress
 *     in its own localStorage, keyed by wallet address.
 *  3. Sharing the end-of-day card. On the player's click, it uses the share sheet, clipboard, a download or an
 *     X post link. The sandbox has none of these powers.
 * Both reach the sandboxed game only over postMessage, when it asks. The watcher session only uses
 * `eth_accounts`: no signing and no extra prompts. GameHost still owns connection and selection.
 */
import { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { GameHost } from "@rarefriends/friendsdk/runtime";
import { parseChanceGame } from "@rarefriends/friendsdk/game";
import { readOwnedFriends } from "@rarefriends/friendsdk/owned";
import { createFriendPublicClient, createFriendWalletSession } from "@rarefriends/friendsdk/wallet";
import {
  HOST_HELLO, HOST_STATE, SAVE_WRITE, SHARE_REQUEST, SHARE_RESULT, type ShareAction, type ShareOutcome,
} from "../games/rarefriends-cafe/roster.ts";
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

function download(image: Blob, filename: string) {
  const url = URL.createObjectURL(image), link = document.createElement("a");
  link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
async function copyImage(image: Blob) {
  try { await navigator.clipboard.write([new ClipboardItem({ "image/png": image })]); return true; } catch { return false; }
}
/** Runs inside the click's user activation, which the browser passes up from the game frame. */
async function share(action: ShareAction, text: string, image: Blob, filename: string): Promise<ShareOutcome> {
  if (action === "copy") return await copyImage(image) ? "copied" : "failed";
  if (action === "save") { download(image, filename); return "saved"; }
  // Phones: the share sheet can send the picture and the text straight to the X app.
  const file = new File([image], filename, { type: "image/png" });
  if (matchMedia("(pointer: coarse)").matches && navigator.canShare?.({ files: [file], text })) {
    try { await navigator.share({ files: [file], text }); return "shared"; }
    catch (error) { if (error instanceof DOMException && error.name === "AbortError") return "cancelled"; }
  }
  // Desktop: X post links can't carry images, so copy the picture (or save it), then open the prefilled post.
  const copied = await copyImage(image);
  if (!copied) download(image, filename);
  window.open(`https://x.com/intent/post?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  return copied ? "copied-and-opened" : "saved-and-opened";
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
      else if (event.data?.type === SHARE_REQUEST && ["post", "copy", "save"].includes(event.data.action) && event.data.image instanceof Blob
        && event.data.image.type === "image/png" && event.data.image.size < 5_000_000 && typeof event.data.text === "string" && event.data.text.length <= 1000) {
        const source = event.source as Window, action = event.data.action as ShareAction;
        const filename = /^[a-z0-9-]{1,60}\.png$/.test(event.data.filename) ? event.data.filename : "rarefriends-cafe-day.png";
        void share(action, event.data.text, event.data.image, filename).catch((): ShareOutcome => "failed")
          .then(result => source.postMessage({ type: SHARE_RESULT, action, result }, "*"));
      }
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
