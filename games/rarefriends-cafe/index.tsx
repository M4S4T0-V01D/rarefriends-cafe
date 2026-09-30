"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { GameComponentProps } from "@rarefriends/friendsdk/runtime";
import { GameMenu } from "@rarefriends/friendsdk/frame";
import { formatGameAmount } from "@rarefriends/friendsdk/ui";
import { expectedReward, maximumPrize, type GamePlay, type GameSnapshot } from "@rarefriends/friendsdk/game";
import { createFriendReader, type GenerationSprites } from "@rarefriends/friendsdk/sprites";
import { createFriendSoundKit, type FriendSoundCue, type FriendSoundKit } from "@rarefriends/friendsdk/sounds";
import {
  EVENTS, eventById, SCENERIES, challengeReward, type SceneryId, FLOORS, WALLPAPERS, dishById, BOOSTS, MANAGER_SKILLS, UPGRADES, upgradeById, type BoostId, type UpgradeId, BLEND_BONUSES, DAY_LENGTH, EXCLUSIVES, FAMILY_NAMES, workerLevel, type ItemKind, FAMILY_PERKS, LEVEL_XP, MAX_LEVEL, catalogItem, shopById, tableLimit, type DishId, type ShopId,
} from "./data.ts";
import {
  itemCost,
  actOnCounter, actOnCustomer, actOnTable, ambience, ambiencePoints, applyFinish, assignStaff, availableDishes, buy, carryCapacity, chooseShop,
  CAPSULE_ID, eventSecondsLeft, applyScenery, challengesFor, unlockScenery, addBoost, raiseSkill, skillLevel, skillPoints, raiseStat, setBuilding, buyUpgrade, capsuleProblemAt, moveCapsule, nextUpgrade, upgradeLevel, clearQueue, createCafe, dayProgress, interactNearby, isClosing, itemAt, kitchenSlots, manager, moveItem, openCafe, placeItem, purchaseCost,
  purchaseLevel, restoreCafe, sellItem, serializeCafe, setBlends, setManual, setOwnedFriends, setStaffRole, unlockDish, update, walkTo, type CafeState,
  memberOf, mostTired, plan, sendToBreak, collectFromCapsule, type Prefs,
} from "./engine.ts";
import { createGuests } from "./guests.ts";
import { buildingById, placementProblem, viewTurn, worldStep, type Tile } from "./layout.ts";
import { BuildBar, BuildingPicker, ItemPreview, MusicControls, NowPlaying, ShopPicker, SpriteChip, StaffPanel, staffCandidates, stepTrack, toolLabel, turned, type BuildTool } from "./panels.tsx";
import { REGULAR_SPRITES } from "./regulars.ts";
import { VIEW, friendRows, hitTest, panBy, renderScene, resetView, tileAt, turnViewBy, view, zoomAt, type BuildView, type Floater } from "./render.ts";
import { HOST_HELLO, HOST_STATE, SAVE_WRITE, SHARE_REQUEST, SHARE_RESULT, parseStaffRoster, type ShareAction, type ShareOutcome } from "./roster.ts";
import { renderDayCard, shareText } from "./card.ts";
import { CafeAudio, type TrackId } from "./audio.ts";
import { CHANGELOG, VERSION } from "./changelog.ts";
import { Beans, Icon, Stars } from "./icons.tsx";
import "@rarefriends/friendsdk/frame.css";
import "./style.css";

const GUESTS = createGuests(18);
const rf = (value: bigint) => `${formatGameAmount(value, 18)} RF`;
/** A number short enough for the top bar: exact up to 99,999, then 123.4k, 1.23M, 4.5B. */
export function compact(n: number) {
  if (n < 100_000) return Math.floor(n).toLocaleString("en-US");
  for (const [size, unit] of [[1e9, "B"], [1e6, "M"], [1e3, "k"]] as const) if (n >= size) {
    const value = n / size, digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
    return `${(Math.floor(value * 10 ** digits) / 10 ** digits).toFixed(digits).replace(/\.?0+$/, "")}${unit}`;
  }
  return String(n);
}
/** An RF balance for the top bar, shortened the same way. */
const rfShort = (value: bigint) => { const amount = Number(value / 10n ** 12n) / 1e6; return amount < 100_000 ? rf(value) : `${compact(amount)} RF`; };
/** WASD walks the manager (and, in build mode, moves the cursor along with the arrows); arrows pan the view. */
const DIRECTIONS: Record<string, { dx: number; dy: number }> = { w: { dx: 0, dy: -1 }, s: { dx: 0, dy: 1 }, a: { dx: -1, dy: 0 }, d: { dx: 1, dy: 0 } };
const CURSOR: Record<string, { dx: number; dy: number }> = {
  ...DIRECTIONS, arrowup: { dx: 0, dy: -1 }, arrowdown: { dx: 0, dy: 1 }, arrowleft: { dx: -1, dy: 0 }, arrowright: { dx: 1, dy: 0 },
};
const PAN: Record<string, { dx: number; dy: number }> = { arrowup: { dx: 0, dy: 60 }, arrowdown: { dx: 0, dy: -60 }, arrowleft: { dx: 60, dy: 0 }, arrowright: { dx: -60, dy: 0 } };
type Menu = "upgrades" | "capsules" | "settings" | "help" | "pause" | "news" | null;
/** A Beans purchase waiting for the player's OK. */
type Ask = { title: string; cost: number; detail?: string; run: () => void };
type Tab = "menu" | "kitchen" | "staff" | "manager";
const ROLE_NAMES = { waiter: "Waiter", chef: "Chef", promoter: "Promoter" } as const;
type Hud = {
  phase: CafeState["phase"]; day: number; beans: number; rating: number; level: number; xp: number; progress: number;
  closing: boolean; queue: number; customers: number; served: number; carrying: number;
};
const readHud = (cafe: CafeState): Hud => ({
  phase: cafe.phase, day: cafe.day, beans: cafe.beans, rating: cafe.rating, level: cafe.level, xp: cafe.xp,
  progress: dayProgress(cafe), closing: isClosing(cafe), queue: manager(cafe).queue.length + (manager(cafe).job ? 1 : 0),
  customers: cafe.customers.length, served: cafe.totalServed, carrying: manager(cafe).carrying.length,
});
/** `boost` names the RF boost these capsules paid for (instead of a collectible). */
type CapsuleResult = { play: bigint; outcomeId: number; exclusive: ItemKind | null; beans: number; redeemed: boolean; boost?: string };
const CAPSULE_COLORS = ["#b7ada3", "#b9bfc6", "#9fabc2", "#e2d49e"];
const DEFAULT_TOOL: BuildTool = { tab: "items", shelf: "tables", mode: "place", kind: "table", dir: 0 };

/** RareFriends Cafe. The SDK runtime supplies wallet connection, the verified owned Friend and the fixed (simulated) RF client. */
export default function RareFriendsCafe({ friendId, client, paused }: GameComponentProps) {
  const canvas = useRef<HTMLCanvasElement>(null), portrait = useRef<HTMLCanvasElement>(null);
  const cafe = useRef<CafeState | null>(null), friend = useRef<GenerationSprites | null>(null);
  const staffSprites = useRef(new Map<number, GenerationSprites>()), loadingSprites = useRef(new Set<number>());
  const floaters = useRef<Floater[]>([]), hover = useRef<Tile | null>(null), sound = useRef<FriendSoundKit | null>(null);
  const buildView = useRef<BuildView | null>(null);
  const epoch = useRef(0), locked = useRef(false), linked = useRef(false), lastSave = useRef(""), managerGeneration = useRef<number | null>(null);
  const daySnapshot = useRef<HTMLCanvasElement | null>(null), shareTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [card, setCard] = useState<{ day: number; blob: Blob; url: string; text: string } | null>(null), [shareStatus, setShareStatus] = useState("");
  const [status, setStatus] = useState("Setting up your shop and loading your Friend…"), [failed, setFailed] = useState(false), [revision, setRevision] = useState(0);
  const [hud, setHud] = useState<Hud | null>(null), [menu, setMenu] = useState<Menu>(null), [tab, setTab] = useState<Tab>("menu");
  const [toast, setToast] = useState(""), [muted, setMuted] = useState(false), [reducedMotion, setReducedMotion] = useState(false);
  const audio = useRef<CafeAudio | null>(null), [capsuleTab, setCapsuleTab] = useState<"machine" | "boosts" | "collection" | "recipes">("machine"), [spinning, setSpinning] = useState(false);
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [reveal, setReveal] = useState<CapsuleResult[] | null>(null), [, setTick] = useState(0);
  const askButton = useRef<HTMLButtonElement>(null), [showChallenges, setShowChallenges] = useState(() => !matchMedia("(max-width: 640px)").matches);
  const [ask, setAsk] = useState<Ask | null>(null), [systemDark, setSystemDark] = useState(() => typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const query = matchMedia("(prefers-color-scheme: dark)"), listen = () => setSystemDark(query.matches);
    query.addEventListener("change", listen); return () => query.removeEventListener("change", listen);
  }, []);
  // The confirm dialog takes focus so Enter buys and Esc cancels; focus returns to the shop afterwards.
  useEffect(() => {
    if (!ask) return;
    requestAnimationFrame(() => askButton.current?.focus());
    // Ignore the very keypress that opened the dialog (React runs this effect while it is still dispatching).
    const opened = performance.now();
    const enter = (event: KeyboardEvent) => {
      const active = document.activeElement;
      if (event.key !== "Enter" || event.timeStamp <= opened || event.repeat || (active instanceof HTMLButtonElement && active !== askButton.current) || active instanceof HTMLInputElement) return;
      event.preventDefault(); setAsk(null); ask.run();
    };
    window.addEventListener("keydown", enter);
    return () => { window.removeEventListener("keydown", enter); focusCanvas(); };
  }, [ask]);
  const [shopChoice, setShopChoice] = useState<ShopId>("cafe"), [picking, setPicking] = useState<number | null>(null);
  const [build, setBuild] = useState<(BuildTool & { selected: number | null; cursor: Tile | null }) | null>(null), [buildMessage, setBuildMessage] = useState("");
  const live = useRef({ paused, menu, reducedMotion, reveal, build }); live.current = { paused, menu, reducedMotion, reveal, build };
  const definition = client.definition;

  const say = useCallback((text: string) => { if (text) setToast(text); }, []);
  const cue = useCallback((name: FriendSoundCue) => { sound.current?.play(name); }, []);
  const refresh = () => setTick(value => value + 1);
  const syncBlends = useCallback((value: GameSnapshot) => {
    if (cafe.current) setBlends(cafe.current, value.inventory.map(amount => Number(amount > 99n ? 99n : amount)));
  }, []);
  /** Canonical artwork for owned staff Friends, loaded on demand; guest art stands in until it arrives. */
  const loadStaffSprites = useCallback((ids: readonly number[]) => {
    for (const id of ids.slice(0, 24)) {
      if (staffSprites.current.has(id) || loadingSprites.current.has(id)) continue;
      loadingSprites.current.add(id);
      const version = epoch.current;
      void createFriendReader().read(BigInt(id)).then(sprites => { if (version === epoch.current) { staffSprites.current.set(id, sprites); refresh(); } })
        .catch(() => { /* Keep the stand-in art. */ }).finally(() => loadingSprites.current.delete(id));
    }
  }, []);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReducedMotion(preference.matches); change(); preference.addEventListener("change", change);
    return () => preference.removeEventListener("change", change);
  }, []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(""), 3200); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { if (!buildMessage) return; const timer = setTimeout(() => setBuildMessage(""), 3200); return () => clearTimeout(timer); }, [buildMessage]);
  useEffect(() => { if ((paused || menu || build) && cafe.current) setManual(cafe.current, null); }, [paused, menu, build]);

  // Load the verified Friend's canonical artwork and the runtime session, then run the shop loop.
  useEffect(() => {
    const version = ++epoch.current;
    const node = canvas.current, ctx = node?.getContext("2d");
    sound.current = createFriendSoundKit({ muted: false }); setMuted(false);
    audio.current?.dispose(); audio.current = new CafeAudio();
    cafe.current = null; friend.current = null; floaters.current = []; locked.current = false; staffSprites.current = new Map();
    setHud(null); setMenu(null); setSnapshot(null); setReveal(null); setError(""); setBusy(false); setFailed(false); setBuild(null);
    setStatus("Setting up your shop and loading your Friend…");
    if (!node || !ctx) { setFailed(true); setStatus("This browser cannot draw the shop."); return; }
    let frame = 0, previous = 0, lastHud = 0, pixelScale = 1;
    const resize = () => {
      const rect = node.getBoundingClientRect(), ratio = Math.min(window.devicePixelRatio || 1, 2.5);
      node.width = Math.max(1, Math.round(rect.width * ratio)); node.height = Math.max(1, Math.round(rect.height * ratio));
      pixelScale = node.width / VIEW.width;
    };
    const observer = new ResizeObserver(resize); observer.observe(node); resize();
    const stop = () => { if (cafe.current) setManual(cafe.current, null); };
    window.addEventListener("blur", stop); document.addEventListener("visibilitychange", stop);
    const pendingHost = { current: null as unknown };
    const applyHost = (data: { ids?: unknown; save?: unknown }) => {
      const state = cafe.current, roster = parseStaffRoster(data.ids, friendId);
      if (!state || roster === null) return;
      setOwnedFriends(state, roster.staff); managerGeneration.current = roster.manager;
      if (!linked.current && data.save && restoreCafe(state, data.save)) { setToast(`Welcome back! Friend #${friendId.toString()}'s shop has been restored.`); setHud(readHud(state)); applyPrefs(state.prefs); }
      linked.current = true; refresh();
    };
    // Roster and saved progress from the trusted host; accepted only from the parent window.
    const receiveRoster = (event: MessageEvent) => {
      if (event.source === window.parent && event.data?.type === SHARE_RESULT) {
        if (shareTimer.current) clearTimeout(shareTimer.current);
        const messages: Record<ShareOutcome, string> = {
          shared: "Shared! Pick X in your share sheet to post it.", cancelled: "Share cancelled.", failed: "Couldn't share from this browser. Try Save picture.",
          "copied-and-opened": "Picture copied and X opened: paste it into your post (Ctrl/Cmd+V), then press Post.",
          "saved-and-opened": "Picture saved and X opened: attach the saved picture to your post, then press Post.",
          copied: "Day card copied as a picture.", saved: "Day card saved as a picture.",
        };
        setShareStatus(messages[event.data.result as ShareOutcome] ?? messages.failed);
        return;
      }
      if (event.source !== window.parent || event.data?.type !== HOST_STATE) return;
      if (cafe.current) applyHost(event.data); else pendingHost.current = event.data;
    };
    const saveNow = () => {
      const state = cafe.current, save = state && linked.current ? serializeCafe(state) : null;
      if (!save) return;
      const raw = JSON.stringify(save);
      if (raw !== lastSave.current) { lastSave.current = raw; window.parent.postMessage({ type: SAVE_WRITE, manager: friendId.toString(), save }, "*"); }
    };
    const saver = setInterval(saveNow, 4000);
    window.addEventListener("pagehide", saveNow);
    linked.current = false; lastSave.current = "";
    window.addEventListener("message", receiveRoster);
    void Promise.all([createFriendReader().read(friendId), client.read()]).then(([sprites, value]) => {
      if (version !== epoch.current) return;
      if (value.friendId !== friendId) throw new Error("This game session does not match the selected Friend.");
      friend.current = sprites;
      const regulars = REGULAR_SPRITES.filter(item => item.tokenId !== friendId);
      cafe.current = createCafe({ familyId: sprites.familyId, guestCount: GUESTS.length, regulars: regulars.map(item => Number(item.tokenId)) });
      // Ask the trusted host for this wallet's other owned Friends and saved progress (answered by host/runtime.tsx).
      if (pendingHost.current) applyHost(pendingHost.current as { ids?: unknown; save?: unknown });
      window.parent.postMessage({ type: HOST_HELLO, manager: friendId.toString() }, "*");
      setSnapshot(value); syncBlends(value); setHud(readHud(cafe.current)); setStatus("");
      const regularMap = new Map(regulars.map(item => [Number(item.tokenId), item]));
      const render = (now: number) => {
        const state = cafe.current!, dt = previous ? Math.min((now - previous) / 1000, 0.1) : 0; previous = now;
        const running = !live.current.paused && !live.current.menu && !live.current.reveal && !live.current.build && !document.hidden;
        if (running) update(state, dt);
        for (const event of state.events.splice(0)) {
          if (event.kind === "coins") {
            floaters.current.push({ text: `+${event.amount} ☕${event.vip ? " VIP" : event.double ? " ×2" : ""}`, x: event.x, y: event.y, age: 0, tone: event.vip ? "vip" : "coin" });
            audio.current?.happy(Math.round(event.x * 3 + event.y * 5));
          } else if (event.kind === "angry") {
            floaters.current.push({ text: "left unhappy", x: event.x, y: event.y, age: 0, tone: "angry" }); audio.current?.grumble();
          } else if (event.kind === "ready") audio.current?.ready(state.shop);
          else if (event.kind === "order") audio.current?.order(Math.round(event.x * 3 + event.y * 5));
          else if (event.kind === "arrive") audio.current?.doorbell();
          else if (event.kind === "levelup") { setToast(`Level ${event.level}! A manager skill point is ready (Upgrades → You), and new dishes, tables or upgrades may be open.`); audio.current?.levelUp(); }
          else if (event.kind === "tired") { setToast(`Slot ${event.slot + 1} is tired. Tap them (or press T) to send them to the break room.`); audio.current?.tired(event.slot); }
          else if (event.kind === "event") { const info = EVENTS.find(item => item.id === event.id)!; setToast(`${info.icon} ${info.name}: ${info.text}`); audio.current?.doorbell(); }
          else if (event.kind === "challenge") { setToast(`Challenge done: ${event.text}! +${event.beans} Beans`); audio.current?.levelUp(); }
          else if (event.kind === "workerLevel") { setToast(`Staff slot ${event.slot + 1} reached worker level ${event.level}! A new attribute point is ready in Staff.`); audio.current?.workerLevel(); }
          else if (event.kind === "rested") { setToast(`Slot ${event.slot + 1} is rested and back at work.`); audio.current?.rested(event.slot); }
          else if (event.kind === "dayEnd") { audio.current?.closing(); saveNow(); }
        }
        if (running) for (const floater of floaters.current) floater.age += dt;
        floaters.current = floaters.current.filter(floater => floater.age < 1.6);
        // Keep a mid-afternoon photo of the busy shop for the end-of-day card.
        if (state.phase === "open" && !live.current.build && !daySnapshot.current && dayProgress(state) >= 0.6) {
          const photo = document.createElement("canvas"); photo.width = VIEW.width; photo.height = VIEW.height;
          photo.getContext("2d")!.drawImage(node, 0, 0, VIEW.width, VIEW.height); daySnapshot.current = photo;
        }
        const drawStart = performance.now();
        renderScene(ctx, { state, now, reducedMotion: live.current.reducedMotion, guests: GUESTS, regulars: regularMap, friend: sprites,
          staffSprites: staffSprites.current, floaters: floaters.current, hover: hover.current, build: live.current.build ? buildView.current : null }, pixelScale);
        // Automated runs only: a rolling average of the frame's drawing time (window.__cafeFrameMs).
        if (navigator.webdriver) { const w = window as unknown as { __cafeFrameMs?: number }; w.__cafeFrameMs = (w.__cafeFrameMs ?? 0) * 0.95 + (performance.now() - drawStart) * 0.05; }
        if (now - lastHud > 150) { lastHud = now; setHud(readHud(state)); }
        frame = requestAnimationFrame(render);
      };
      frame = requestAnimationFrame(render);
    }).catch(cause => {
      if (version !== epoch.current) return;
      setFailed(true);
      setStatus(cause instanceof Error && cause.message.includes("does not match") ? cause.message : "Your Friend's artwork or the game session could not load. Check your connection and retry.");
    });
    return () => {
      epoch.current++; cancelAnimationFrame(frame); observer.disconnect(); stop();
      window.removeEventListener("blur", stop); document.removeEventListener("visibilitychange", stop); window.removeEventListener("message", receiveRoster);
      saveNow(); clearInterval(saver); window.removeEventListener("pagehide", saveNow);
      sound.current?.dispose(); sound.current = null; audio.current?.dispose(); audio.current = null;
    };
  }, [friendId, client, revision, syncBlends]);

  // Owned staff show their canonical art on the floor and in the kitchen.
  const staffKey = cafe.current?.staff.map(member => "owned" in member.who ? member.who.owned : -1).join(",") ?? "";
  useEffect(() => {
    const state = cafe.current;
    if (state) loadStaffSprites(state.staff.flatMap(member => "owned" in member.who ? [member.who.owned] : []));
  }, [staffKey, loadStaffSprites]);
  useEffect(() => { if (menu === "upgrades" && tab === "staff" && cafe.current) loadStaffSprites(cafe.current.ownedFriends); }, [menu, tab, loadStaffSprites]);

  // Keep the build-mode ghost in sync with the chosen tool and cursor.
  useEffect(() => {
    const state = cafe.current;
    if (!state || !build) { buildView.current = null; return; }
    const moving = build.mode === "move" && build.selected !== null ? state.items.find(item => item.id === build.selected) : null;
    let ghost: BuildView["ghost"] = null, valid = false, capsule: BuildView["capsule"] = null;
    if (build.cursor && build.tab === "items" && build.mode === "move" && build.selected === CAPSULE_ID) {
      capsule = { x: build.cursor.x, y: build.cursor.y, dir: build.dir };
      valid = !capsuleProblemAt(state, build.cursor, build.dir);
    }
    if (build.cursor && build.tab === "items" && (build.mode === "place" || moving)) {
      const kind = moving ? moving.kind : build.kind;
      ghost = { kind, x: build.cursor.x, y: build.cursor.y, dir: build.dir };
      valid = !placementProblem(state.items, ghost, plan(state), moving?.id) && (Boolean(moving) || state.beans >= itemCost(state, kind));
    }
    buildView.current = { cursor: build.cursor, ghost, valid, selected: build.selected, capsule };
  }, [build, hud?.beans]);

  const blocked = paused || menu !== null || reveal !== null || !hud || (hud.phase !== "open" && !build);

  function pointerToView(event: { clientX: number; clientY: number }) {
    const rect = canvas.current!.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * VIEW.width / rect.width, y: (event.clientY - rect.top) * VIEW.height / rect.height };
  }
  function buildAt(tile: Tile) {
    const state = cafe.current;
    if (!state || !build || build.tab !== "items") return;
    let problem: string | null = null, done = "";
    if (build.mode === "place") {
      const entry = { ...catalogItem(build.kind), cost: itemCost(state, build.kind) }, candidate = { kind: build.kind, x: tile.x, y: tile.y, dir: build.dir };
      // Ask before spending: check the spot first so a refused placement doesn't prompt.
      const blocked = placementProblem(state.items, candidate, plan(state));
      if (!blocked && entry.cost > 0 && state.prefs.confirm && state.beans >= entry.cost) {
        setBuild({ ...build, cursor: tile });
        confirmBuy(`Place ${entry.name}`, entry.cost, () => { const again = placeItem(state, build.kind, tile, build.dir); setBuildMessage(again ?? `${entry.name} placed.`); if (!again) audio.current?.place(); setHud(readHud(state)); refresh(); });
        return;
      }
      problem = placeItem(state, build.kind, tile, build.dir); done = `${entry.name} placed.`;
    }
    else if (build.mode === "turn") {
      // Turn an item where it stands (Shift+R turns the other way next time: here a tap is always a clockwise quarter).
      const machine = plan(state);
      if (tile.x === machine.capsule.x && tile.y === machine.capsule.y) { problem = moveCapsule(state, tile, turned(machine.capsuleDir)); done = "Capsule machine turned."; }
      else {
        const item = itemAt(state, tile);
        if (!item) problem = "Tap an item to turn it.";
        else {
          // Try each next facing until one fits (a table's chairs need room).
          for (let step = 1; step < 4; step++) { problem = moveItem(state, item.id, item, turned(item.dir, step)); if (!problem) break; }
          done = `${catalogItem(item.kind).name} turned.`;
        }
      }
    }
    else if (build.mode === "sell") {
      const item = itemAt(state, tile);
      problem = item ? sellItem(state, item.id) : "Nothing to sell there.";
      done = item ? `Sold for ${Math.floor(catalogItem(item.kind).cost / 2)} Beans.` : "";
    } else if (build.selected === null) {
      const machine = plan(state);
      if (tile.x === machine.capsule.x && tile.y === machine.capsule.y) {
        setBuild({ ...build, selected: CAPSULE_ID, dir: machine.capsuleDir, cursor: tile });
        setBuildMessage("Moving the capsule machine: tap a tile. R turns the side you use it from."); return;
      }
      const item = itemAt(state, tile);
      if (!item) problem = "Tap an item to move it.";
      else { setBuild({ ...build, selected: item.id, dir: item.dir, cursor: tile }); setBuildMessage(`Moving ${catalogItem(item.kind).name}: tap a new tile.`); return; }
    } else {
      problem = build.selected === CAPSULE_ID ? moveCapsule(state, tile, build.dir) : moveItem(state, build.selected, tile, build.dir); done = "Moved.";
      if (!problem) { setBuild({ ...build, selected: null, cursor: tile }); setBuildMessage(done); audio.current?.place(); setHud(readHud(state)); return; }
    }
    setBuildMessage(problem ?? done); if (!problem) { if (build.mode === "sell") audio.current?.sell(); else audio.current?.place(); }
    setBuild({ ...build, cursor: tile }); setHud(readHud(state)); refresh();
  }
  // Browsers only start audio inside a user activation (on phones that is pointerup/click, not pointerdown),
  // so any tap, click or key in the game frame wakes it.
  const wake = useRef(() => {});
  wake.current = wakeAudio;
  useEffect(() => {
    const listener = () => wake.current();
    const events = ["pointerup", "click", "keydown", "touchend"] as const;
    for (const name of events) window.addEventListener(name, listener, { capture: true, passive: true });
    return () => { for (const name of events) window.removeEventListener(name, listener, { capture: true }); };
  }, []);
  /** Start audio from a user gesture and apply the saved preferences. */
  function wakeAudio() {
    const player = audio.current, state = cafe.current;
    if (!player) return;
    if (state) applyPrefs(state.prefs);
    player.unlock(); void sound.current?.unlock();
  }
  function applyPrefs(prefs: Prefs) {
    const player = audio.current;
    if (!player) return;
    player.setTrack(prefs.track as TrackId); player.setMusic(prefs.music); player.setSfx(prefs.sfx); player.setVolume(prefs.volume);
  }
  function changePrefs(prefs: Prefs) {
    const state = cafe.current;
    if (!state) return;
    state.prefs = prefs; applyPrefs(prefs); audio.current?.unlock(); refresh();
  }
  function toggleMute() {
    const next = !muted; setMuted(next); sound.current?.setMuted(next); audio.current?.setMuted(next);
    if (!next) wakeAudio();
  }
  /** Pointer gesture: a short press is a tap; a drag pans; two fingers pinch-zoom. */
  const gesture = useRef({ pointers: new Map<number, { x: number; y: number }>(), start: { x: 0, y: 0 }, moved: false, pinch: null as number | null });
  const spread = () => { const [a, b] = [...gesture.current.pointers.values()]; return a && b ? Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) : 1; };
  // The wheel zooms around the pointer (a native listener, so the page doesn't scroll).
  useEffect(() => {
    const node = canvas.current;
    if (!node) return;
    const wheel = (event: WheelEvent) => {
      if (!cafe.current) return;
      event.preventDefault();
      const point = pointerToView(event);
      zoomAt(cafe.current, point.x, point.y, Math.exp(-Math.max(-60, Math.min(60, event.deltaY)) * 0.004));
    };
    node.addEventListener("wheel", wheel, { passive: false });
    return () => node.removeEventListener("wheel", wheel);
  });
  const [, setZoomLabel] = useState(1), turnDrag = useRef<number | null>(null);
  function zoomBy(factor: number) { if (cafe.current) { zoomAt(cafe.current, VIEW.width / 2, VIEW.height / 2, factor); setZoomLabel(view.zoom); } }
  function tap(event: React.PointerEvent<HTMLCanvasElement>) {
    const state = cafe.current;
    if (!state || blocked) return;
    event.preventDefault(); event.currentTarget.focus({ preventScroll: true }); setManual(state, null); wakeAudio();
    const point = pointerToView(event);
    if (build) { const tile = tileAt(cafe.current!, point.x, point.y); if (tile) buildAt(tile); return; }
    const hit = hitTest(state, point.x, point.y);
    if (!hit) return;
    if (hit.kind === "capsule") { openMenu("capsules"); return; }
    let feedback = "";
    if (hit.kind === "worker") feedback = workerTap(state, hit.id);
    else if (hit.kind === "customer") feedback = actOnCustomer(state, hit.id);
    else if (hit.kind === "counter") feedback = actOnCounter(state);
    else if (!walkTo(state, hit.tile)) feedback = "Can't walk there.";
    if (feedback) { say(feedback); cue("select"); }
    setHud(readHud(state));
  }
  /** Tap a staff Friend: tired ones go to the break room; otherwise show how they're doing. */
  function workerTap(state: CafeState, id: number): string {
    const worker = state.workers.find(item => item.id === id), member = worker && memberOf(state, worker);
    if (!worker || !member) return "";
    if (worker.duty !== "work") return `On a break: ${Math.ceil(worker.rest)} s left.`;
    if (member.fatigue >= 20) return sendToBreak(state, id);
    return `${ROLE_NAMES[member.role]} · Lv ${workerLevel(member.xp)} · ${Math.round(100 - member.fatigue)}% energy.`;
  }
  function keyDown(event: ReactKeyboardEvent<HTMLElement>) {
    const state = cafe.current;
    if (!state || blocked || event.target !== canvas.current) return;
    const key = event.key.toLowerCase();
    if (build) {
      const cursor = build.cursor ?? { x: 5, y: 5 };
      if (CURSOR[key]) { event.preventDefault(); const { dx, dy } = worldStep(CURSOR[key].dx, CURSOR[key].dy); setBuild({ ...build, cursor: { x: Math.max(0, Math.min(plan(state).w - 1, cursor.x + dx)), y: Math.max(0, Math.min(plan(state).d - 1, cursor.y + dy)) } }); }
      else if (key === "enter" || key === " " || key === "e") { event.preventDefault(); buildAt(cursor); }
      else if (key === "r") { event.preventDefault(); setBuild({ ...build, dir: turned(build.dir, event.shiftKey ? -1 : 1) }); }
      else if (key === "delete" || key === "backspace") { event.preventDefault(); const item = itemAt(state, cursor); setBuildMessage(item ? sellItem(state, item.id) ?? "Sold." : "Nothing to sell there."); refresh(); }
      else if (key === "escape") { event.preventDefault(); if (build.selected !== null) setBuild({ ...build, selected: null }); else exitBuild(); }
      return;
    }
    if (DIRECTIONS[key]) { event.preventDefault(); setManual(state, worldStep(DIRECTIONS[key].dx, DIRECTIONS[key].dy)); return; }
    if (key === "[" || key === "]") { event.preventDefault(); turnViewBy(key === "]" ? 1 : -1); setZoomLabel(view.zoom + Math.random()); return; }
    if (PAN[key]) { event.preventDefault(); panBy(PAN[key].dx, PAN[key].dy); return; }
    if (key === "=" || key === "+") { event.preventDefault(); zoomAt(state, VIEW.width / 2, VIEW.height / 2, 1.15); return; }
    if (key === "-" || key === "_") { event.preventDefault(); zoomAt(state, VIEW.width / 2, VIEW.height / 2, 1 / 1.15); return; }
    if (event.repeat) return;
    if (/^[1-9]$/.test(key)) { event.preventDefault(); say(actOnTable(state, Number(key) - 1)); cue("select"); }
    else if (key === "0") { event.preventDefault(); say(actOnTable(state, 9)); cue("select"); }
    else if (key === "c") { event.preventDefault(); say(actOnCounter(state)); cue("select"); }
    else if (key === "x") { event.preventDefault(); clearQueue(state); say("Task list cleared."); }
    else if (key === "b") { event.preventDefault(); enterBuild(); }
    else if (key === "escape" || key === "p") { event.preventDefault(); openMenu("pause"); }
    else if (key === "t") { event.preventDefault(); const tired = mostTired(state); say(tired ? sendToBreak(state, tired.id) : "Nobody needs a break yet."); cue("select"); }
    else if (key === "e" || key === " " || key === "enter") {
      event.preventDefault();
      const result = interactNearby(state);
      if (result === "capsule") openMenu("capsules"); else { say(result); cue("select"); }
    }
    setHud(readHud(state));
  }
  function keyUp(event: ReactKeyboardEvent<HTMLElement>) {
    const direction = DIRECTIONS[event.key.toLowerCase()];
    if (direction && cafe.current?.manual && cafe.current.manual.dx === direction.dx && cafe.current.manual.dy === direction.dy) setManual(cafe.current, null);
  }
  const focusCanvas = () => requestAnimationFrame(() => canvas.current?.focus({ preventScroll: true }));
  function openMenu(next: Menu) { if (!paused && !busy) { setMenu(next); setError(""); setPicking(null); } }
  function closeMenu() { if (busy) return; setMenu(null); focusCanvas(); }
  function enterBuild() { if (paused || !cafe.current) return; setMenu(null); setBuild({ ...DEFAULT_TOOL, selected: null, cursor: null }); setBuildMessage("Build mode: the shop is paused. Tap a tile to place."); focusCanvas(); }
  function exitBuild() { setBuild(null); setBuildMessage(""); focusCanvas(); }
  function startDay() {
    const state = cafe.current;
    if (!state || paused) return;
    if (state.phase === "intro" && !state.started) chooseShop(state, shopChoice);
    wakeAudio(); openCafe(state); daySnapshot.current = null; setShareStatus(""); setHud(readHud(state)); cue("action-ready"); focusCanvas();
  }
  /** Run a Beans purchase, asking first unless the player turned confirmations off. */
  function confirmBuy(title: string, cost: number, run: () => void, detail?: string) {
    const state = cafe.current;
    if (!state || paused) return;
    if (!state.prefs.confirm || (cost <= 0 && !detail)) { run(); return; }
    setAsk({ title, cost, detail, run });
  }
  function purchase(item: "machine" | "slot" | "expand") {
    const state = cafe.current, cost = state ? purchaseCost(state, item) : null;
    if (!state || cost === null) return;
    const title = item === "slot" ? `Unlock staff slot ${state.staffSlots + 1}` : item === "expand" ? `Expand to ${plan(state).w + 1} × ${plan(state).d + 1}` : "Upgrade the kitchen station";
    confirmBuy(title, cost, () => purchaseNow(item));
  }
  function purchaseNow(item: "machine" | "slot" | "expand") {
    const state = cafe.current;
    if (!state || paused) return;
    const problem = buy(state, item);
    if (problem) setError(problem); else { setError(""); cue("purchase"); say(item === "slot" ? "New staff slot unlocked. Choose a Friend for it." : item === "expand" ? "The shop grew by 2 × 2. More room to build!" : "Kitchen upgraded."); }
    setHud(readHud(state)); refresh();
  }
  function upgradeShop(id: UpgradeId) {
    const state = cafe.current, next = state && nextUpgrade(state, id);
    if (state && next) confirmBuy(`${upgradeById(id).name} level ${upgradeLevel(state, id) + 1}`, next.cost, () => upgradeShopNow(id));
  }
  function upgradeShopNow(id: UpgradeId) {
    const state = cafe.current;
    if (!state || paused) return;
    const problem = buyUpgrade(state, id);
    if (problem) setError(problem); else { setError(""); cue("purchase"); say(`${upgradeById(id).name} upgraded.`); }
    setHud(readHud(state)); refresh();
  }
  function unlock(id: DishId) {
    const state = cafe.current;
    if (state) confirmBuy(`Add ${dishById(id).name} to the menu`, dishById(id).unlockCost, () => unlockNow(id));
  }
  function unlockNow(id: DishId) {
    const state = cafe.current;
    if (!state || paused) return;
    const problem = unlockDish(state, id);
    if (problem) setError(problem); else { setError(""); cue("purchase"); }
    setHud(readHud(state)); refresh();
  }

  // ---------- End-of-day card: a picture of the day, shared through the trusted host ----------
  const summaryDay = hud?.phase === "summary" ? hud.day : null;
  useEffect(() => {
    const state = cafe.current, sprites = friend.current;
    if (summaryDay === null || !state || !sprites) return;
    const image = renderDayCard({ state, friendId, familyId: sprites.familyId, scene: daySnapshot.current ?? canvas.current,
      portrait: friendRows(sprites, "down", false, 0) });
    let url = "", cancelled = false;
    image.toBlob(blob => {
      if (!blob || cancelled) return;
      url = URL.createObjectURL(blob);
      setCard({ day: summaryDay, blob, url, text: shareText(state, friendId, sprites.familyId) });
    }, "image/png");
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [summaryDay, friendId]);
  function shareCard(action: ShareAction) {
    if (!card || paused) return;
    setShareStatus(action === "post" ? "Opening X…" : action === "copy" ? "Copying…" : "Saving…");
    window.parent.postMessage({ type: SHARE_REQUEST, action, text: card.text, image: card.blob, filename: `rarefriends-cafe-day-${card.day}.png` }, "*");
    if (shareTimer.current) clearTimeout(shareTimer.current);
    shareTimer.current = setTimeout(() => setShareStatus("Sharing works on the RareFriends Cafe page (the GitHub Pages link), not in this runtime."), 2500);
    cue("select");
  }
  useEffect(() => () => { if (shareTimer.current) clearTimeout(shareTimer.current); }, []);

  // ---------- Rare Recipe Capsules: the SDK's simulated RF chance-game actions ----------
  async function act(work: () => Promise<void>, after?: (value: GameSnapshot) => void) {
    if (locked.current || paused) return;
    const version = epoch.current; locked.current = true; setBusy(true); setError(""); void sound.current?.unlock();
    try {
      await work();
      const value = await client.read();
      if (version === epoch.current) { setSnapshot(value); syncBlends(value); after?.(value); }
    } catch (cause) {
      if (version === epoch.current) setError(cause instanceof Error ? cause.message : "The capsule action did not complete.");
    } finally { if (version === epoch.current) { locked.current = false; setBusy(false); } }
  }
  const maxPrize = maximumPrize(definition);
  const pendingPlays = snapshot?.plays.filter(play => play.outcomeId === null) ?? [];
  /** Mirrors the SDK's purchase rule: enough RF, and free stake to back every capsule's maximum prize. */
  const canBuy = (count: number) => Boolean(snapshot && snapshot.rfBalance >= definition.price * BigInt(count)
    && snapshot.freeStake >= maxPrize && snapshot.freeStake + definition.price * BigInt(count) >= maxPrize * BigInt(count));
  /** Turn the crank: open pending capsules first, else `count` new ones. Each also grants an RF exclusive (or Beans). */
  const openCapsules = (count: number) => {
    wakeAudio(); audio.current?.crank(); setSpinning(true);
    return act(async () => {
      const version = epoch.current, state = cafe.current;
      const plays = pendingPlays.length ? pendingPlays : await client.play(BigInt(count));
      const results: CapsuleResult[] = [];
      for (const play of plays) {
        const settled = await client.settle(play.id);
        if (settled.outcomeId === null || !state) continue;
        results.push({ play: settled.id, outcomeId: settled.outcomeId, ...collectFromCapsule(state, settled.outcomeId - 1), redeemed: false });
      }
      if (version !== epoch.current || !results.length) return;
      const best = Math.max(...results.map(result => result.outcomeId));
      audio.current?.pop(); cue(best >= 4 ? "reveal-legendary" : best >= 2 ? "reveal-rare" : "reveal-common");
      setReveal(results); setHud(state ? readHud(state) : null);
    }).finally(() => setSpinning(false));
  };

  /** Pay for an RF boost with capsules: they open and settle through the SDK as usual, and give the boost instead of collectibles. */
  const buyBoost = (id: BoostId) => {
    const boost = BOOSTS.find(item => item.id === id)!;
    wakeAudio(); audio.current?.crank(); setSpinning(true);
    return act(async () => {
      const version = epoch.current, state = cafe.current;
      const plays = await client.play(BigInt(boost.capsules)), results: CapsuleResult[] = [];
      for (const play of plays) {
        const settled = await client.settle(play.id);
        if (settled.outcomeId !== null) results.push({ play: settled.id, outcomeId: settled.outcomeId, exclusive: null, beans: 0, redeemed: false, boost: boost.name });
      }
      if (version !== epoch.current || !state || !results.length) return;
      addBoost(state, id); audio.current?.levelUp(); cue("reveal-rare");
      setReveal(results); setHud(readHud(state));
    }).finally(() => setSpinning(false));
  };

  /** Unlock an RF scenery with capsules: they open and settle as usual, and pay for the scenery instead of collectibles. */
  const buyScenery = (id: SceneryId) => {
    const scenery = SCENERIES.find(item => item.id === id)!;
    wakeAudio(); audio.current?.crank(); setSpinning(true);
    return act(async () => {
      const version = epoch.current, state = cafe.current;
      const plays = await client.play(BigInt(scenery.capsules!)), results: CapsuleResult[] = [];
      for (const play of plays) {
        const settled = await client.settle(play.id);
        if (settled.outcomeId !== null) results.push({ play: settled.id, outcomeId: settled.outcomeId, exclusive: null, beans: 0, redeemed: false, boost: scenery.name });
      }
      if (version !== epoch.current || !state || !results.length) return;
      unlockScenery(state, id); audio.current?.levelUp(); cue("reveal-rare");
      setReveal(results); setHud(readHud(state));
    }).finally(() => setSpinning(false));
  };

  const state = cafe.current;
  // Shuffle: move on to a random unlocked track every few minutes while the music plays.
  const prefs = state?.prefs;
  useEffect(() => {
    if (!prefs?.shuffle || !prefs.music) return;
    const timer = setTimeout(() => {
      const current = cafe.current;
      if (current) changePrefs({ ...current.prefs, track: stepTrack(current.prefs.track, current.collection, 1, Math.random) });
    }, prefs.shuffleEvery * 1000);
    return () => clearTimeout(timer);
  }, [prefs?.track, prefs?.shuffle, prefs?.shuffleEvery, prefs?.music]);
  const shop = shopById(state && !state.started && state.phase === "intro" ? shopChoice : state?.shop ?? "cafe");
  const familyName = friend.current ? FAMILY_NAMES[friend.current.familyId] : "";
  const familyPerk = friend.current ? FAMILY_PERKS[friend.current.familyId] : null;
  const nextXp = hud && hud.level < MAX_LEVEL ? LEVEL_XP[hud.level - 1] : null;
  const prevXp = hud && hud.level > 1 ? LEVEL_XP[hud.level - 2] : 0;
  const blendCount = snapshot?.inventory.reduce((sum, amount) => sum + amount, 0n) ?? 0n;
  const clock = hud ? (() => { const minutes = 8 * 60 + Math.floor(hud.progress * 12 * 60); return `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`; })() : "";
  const candidates = state ? staffCandidates(state, GUESTS,
    id => { const sprites = staffSprites.current.get(id); return sprites ? friendRows(sprites, "down", false, 0) : null; },
    id => staffSprites.current.get(id)?.familyId ?? null) : [];

  // HUD portrait: the verified Friend's canonical idle frame, the shop's star.
  const portraitReady = Boolean(hud);
  useEffect(() => {
    const node = portrait.current, ctx = node?.getContext("2d"), sprites = friend.current;
    if (!node || !ctx || !sprites) return;
    const rows = sprites.clips.idle[sprites.familyId === 6 ? "right" : "down"][0].rows;
    // Crop to the Friend's pixels and centre them at the largest whole-pixel scale that fits, with a white halo.
    const filled = rows.flatMap((row, y) => [...row].flatMap((pixel, x) => pixel === "#" ? [{ x, y }] : []));
    if (!filled.length) return;
    const left = Math.min(...filled.map(p => p.x)), right = Math.max(...filled.map(p => p.x)), top = Math.min(...filled.map(p => p.y)), bottom = Math.max(...filled.map(p => p.y));
    const size = node.width, scale = Math.max(1, Math.floor((size - 16) / Math.max(right - left + 3, bottom - top + 3)));
    const ox = Math.round((size - (right - left + 1) * scale) / 2) - left * scale, oy = Math.round((size - (bottom - top + 1) * scale) / 2) - top * scale;
    ctx.clearRect(0, 0, size, size); ctx.fillStyle = "#fff";
    for (const p of filled) ctx.fillRect(ox + p.x * scale - scale, oy + p.y * scale - scale, scale * 3, scale * 3);
    ctx.fillStyle = "#161616";
    for (const p of filled) ctx.fillRect(ox + p.x * scale, oy + p.y * scale, scale, scale);
  }, [portraitReady, friendId]);

  const dark = state ? state.prefs.theme === "dark" || (state.prefs.theme === "auto" && systemDark) : systemDark;
  return <section className="cafe-game" style={{ "--shop": shop.accent } as CSSProperties} data-theme={dark ? "dark" : "light"} data-turn={viewTurn.r} aria-label={shop.name} aria-busy={busy}
    data-phase={hud?.phase ?? "loading"} data-beans={hud?.beans ?? 0} data-served={hud?.served ?? 0} data-customers={hud?.customers ?? 0}
    data-build={build ? "on" : "off"} data-items={state?.items.length ?? 0} data-shop={state?.shop ?? ""} data-owned={state?.ownedFriends.length ?? 0} data-linked={linked.current ? "yes" : "no"}>
    <div className="cafe-world" inert={menu !== null || reveal !== null || ask !== null || paused || undefined}>
      <canvas ref={canvas} tabIndex={blocked ? -1 : 0}
        aria-label={build ? "Build mode. Tap a tile or use arrow keys and Enter to place, R to rotate, Delete to sell, Escape to finish."
          : "Shop floor. Tap a guest to take their order or serve them, tap the counter to pick up dishes, tap the floor to walk. Keys: WASD walk, arrows move the view, plus and minus zoom, E acts nearby, 1 to 0 act on a table, C picks up, X clears tasks, B builds. Drag to move the view; scroll or pinch to zoom."}
        onContextMenu={event => event.preventDefault()}
        onPointerDown={event => {
          if (event.button === 2 && event.pointerType === "mouse") { turnDrag.current = pointerToView(event).x; try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* synthetic */ } return; }
          if (event.button !== 0 && event.pointerType === "mouse") return;
          const point = pointerToView(event);
          gesture.current.pointers.set(event.pointerId, point);
          if (gesture.current.pointers.size === 1) { gesture.current.start = point; gesture.current.moved = false; }
          gesture.current.pinch = gesture.current.pointers.size === 2 ? spread() : null;
          try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* synthetic pointer */ }
        }}
        onPointerUp={event => {
          if (turnDrag.current !== null) { turnDrag.current = null; return; }
          const pointers = gesture.current.pointers, single = pointers.size === 1 && pointers.has(event.pointerId);
          pointers.delete(event.pointerId); gesture.current.pinch = pointers.size === 2 ? spread() : null;
          if (single && !gesture.current.moved) tap(event);
        }}
        onPointerCancel={event => { gesture.current.pointers.delete(event.pointerId); gesture.current.pinch = null; }}
        onPointerMove={event => {
          // Right-drag turns the view a quarter for every 120 px.
          if (turnDrag.current !== null) {
            const x = pointerToView(event).x;
            if (Math.abs(x - turnDrag.current) > 120) { turnViewBy(x > turnDrag.current ? 1 : -1); turnDrag.current = x; setZoomLabel(view.zoom + Math.random()); }
            return;
          }
          const pointers = gesture.current.pointers;
          if (pointers.has(event.pointerId) && cafe.current) {
            // Drag pans the view; two fingers pinch to zoom.
            const point = pointerToView(event), last = pointers.get(event.pointerId)!;
            pointers.set(event.pointerId, point);
            if (pointers.size === 2 && gesture.current.pinch) {
              const next = spread(), [a, b] = [...pointers.values()];
              zoomAt(cafe.current, (a.x + b.x) / 2, (a.y + b.y) / 2, next / gesture.current.pinch); gesture.current.pinch = next; gesture.current.moved = true; return;
            }
            if (!gesture.current.moved && Math.hypot(point.x - gesture.current.start.x, point.y - gesture.current.start.y) > 8) gesture.current.moved = true;
            if (gesture.current.moved) { panBy(point.x - last.x, point.y - last.y); return; }
          }
          if (event.pointerType !== "mouse" || !cafe.current) return;
          const point = pointerToView(event);
          if (build) { const tile = tileAt(cafe.current!, point.x, point.y); if (tile && (tile.x !== build.cursor?.x || tile.y !== build.cursor?.y)) setBuild({ ...build, cursor: tile }); return; }
          const hit = hitTest(cafe.current, point.x, point.y); hover.current = hit?.kind === "tile" ? hit.tile : null;
        }}
        onPointerLeave={() => { hover.current = null; }}
        onKeyDown={keyDown} onKeyUp={keyUp} onBlur={() => { if (cafe.current) setManual(cafe.current, null); }} />
      {hud && <>
        <div className="cafe-hud">
          <div className="cafe-left">
          <div className="cafe-card">
            <span className="cafe-portrait-wrap">
              <canvas ref={portrait} className="cafe-portrait" width={116} height={116} role="img" aria-label={`Manager: your Friend #${friendId.toString()}, ${familyName}`} />
              <b className="cafe-level" aria-label={`Level ${hud.level}`}>Lv {hud.level}</b>
            </span>
            <strong className="cafe-title">{shop.name}</strong>
            <span className="cafe-day"><Icon name="clock" size={12} />Day {hud.day} · {build ? "building" : hud.phase === "open" ? hud.closing ? "last orders" : clock : hud.phase === "summary" ? "closed" : "not open yet"}</span>
            <span className="cafe-clock" aria-hidden="true"><i style={{ width: `${hud.progress * 100}%` }} /></span>
            <span className="cafe-stats"><b role="img" aria-label={`Rating ${hud.rating.toFixed(1)} of 5`}><Stars rating={hud.rating} size={13} /></b></span>
            {state && Object.keys(state.boosts).length > 0 && <span className="cafe-boosts">{BOOSTS.filter(boost => state.boosts[boost.id]).map(boost =>
              <b key={boost.id} title={boost.text}><Icon name="spark" size={10} />{boost.name} · {state.boosts[boost.id]}d</b>)}</span>}
            {state?.event?.started && hud.phase === "open" && (eventSecondsLeft(state) > 0 || eventById(state.event.id).duration === 0) && <span className="cafe-boosts cafe-event">
              <b title={eventById(state.event.id).text}>{eventById(state.event.id).icon} {eventById(state.event.id).name}{eventSecondsLeft(state) ? ` · ${eventSecondsLeft(state)}s` : state.event.guestArrived ? " · here!" : " · on the way"}</b></span>}
            <span className="cafe-xp" aria-label={nextXp ? `${hud.xp} of ${nextXp} XP` : "Max level"}><i style={{ width: `${nextXp ? Math.min(100, (hud.xp - prevXp) / (nextXp - prevXp) * 100) : 100}%` }} /></span>
          </div>
          {!build && state && hud.phase !== "summary" && <div className="cafe-challenges">
            <button type="button" aria-expanded={showChallenges} onClick={() => setShowChallenges(!showChallenges)}>
              <span>Today's challenges</span><em>{state.today.done.length}/3</em><Icon name={showChallenges ? "chevronUp" : "chevronDown"} size={12} /></button>
            {showChallenges && <><ul>{challengesFor(state).map(challenge => <li key={challenge.id} className={challenge.done ? "cafe-done" : undefined}>
              <span><Icon name={challenge.done ? "boxDone" : "box"} size={12} />{challenge.text}</span>
              {challenge.target > 1 && !challenge.done && <small>{Math.min(challenge.progress, challenge.target)}/{challenge.target}</small>}
            </li>)}</ul>
            <small><Beans n={challengeReward(state.day).beans} size={10} /> Beans and XP each</small></>}
          </div>}
          </div>
          <div className="cafe-wallet">
            <div className="cafe-coin cafe-coin-beans" aria-label={`${hud.beans} Beans`}><Icon name="bean" size={24} /><span><b title={`${hud.beans.toLocaleString("en-US")} Beans`}>{compact(hud.beans)}</b><small>Beans</small></span></div>
            <button type="button" className="cafe-coin cafe-coin-rf" onClick={() => openMenu("capsules")} aria-label={`${snapshot ? rf(snapshot.rfBalance) : "RF"}${snapshot?.mode === "preview" ? " (simulated)" : ""}: open the capsule machine`}>
              <Icon name="rf" size={24} /><span><b title={snapshot ? rf(snapshot.rfBalance) : undefined}>{snapshot ? rfShort(snapshot.rfBalance) : "… RF"}</b><small>{snapshot?.mode === "preview" ? "simulated" : "on-chain"}</small></span></button>
          </div>
          {!build && <div className="cafe-actions">
            {/* Icons only on a phone (the labels hide; the names stay). */}
            <button type="button" aria-label="Build" title="Build (B)" onClick={enterBuild}><Icon name="hammer" /><span className="cafe-wide">Build</span></button>
            <button type="button" aria-label="Upgrades" title="Upgrades" onClick={() => openMenu("upgrades")}><Icon name="up" /><span className="cafe-wide">Upgrades</span></button>
            <button type="button" aria-label="Capsules" title="Capsules" onClick={() => openMenu("capsules")}><Icon name="capsule" /><span className="cafe-wide">Capsules</span></button>
            <button type="button" className="cafe-icon-button" onClick={() => openMenu("pause")} aria-label="Pause" title="Pause (Esc)"><Icon name="pause" /></button>
            <button type="button" className="cafe-icon-button" onClick={() => openMenu("settings")} aria-label="Settings" title="Settings"><Icon name="gear" /></button>
            <button type="button" className="cafe-icon-button" aria-pressed={!muted} aria-label="Sound" title={muted ? "Sound off" : "Sound on"} onClick={toggleMute}><Icon name={muted ? "noteOff" : "note"} /></button>
          </div>}
        </div>
        <div className="cafe-zoom" role="group" aria-label="View">
          <button type="button" aria-label="Zoom in (+)" title="Zoom in (+)" onClick={() => zoomBy(1.2)}><Icon name="plus" size={14} /></button>
          <button type="button" aria-label="Zoom out (−)" title="Zoom out (−)" onClick={() => zoomBy(1 / 1.2)}><Icon name="minus" size={14} /></button>
          <button type="button" aria-label="Turn the view left ([)" title="Turn left ([)" onClick={() => { turnViewBy(-1); setZoomLabel(view.zoom + Math.random()); }}><Icon name="turnLeft" size={14} /></button>
          <button type="button" aria-label="Turn the view right (])" title="Turn right (])" onClick={() => { turnViewBy(1); setZoomLabel(view.zoom + Math.random()); }}><Icon name="turnRight" size={14} /></button>
          <button type="button" aria-label="Reset the view" title="Reset the view" onClick={() => { resetView(); setZoomLabel(1); }}><Icon name="fit" size={14} /></button>
        </div>
        {build && state && <BuildBar state={state} tool={build} message={buildMessage || toolLabel(build)} onDone={exitBuild} onPrefs={changePrefs}
          onTool={next => { setBuild({ ...build, ...next, selected: next.mode === "move" ? build.selected : null }); setBuildMessage(next.tab === "items" ? toolLabel(next) : ""); }}
          onScenery={id => {
            const scenery = SCENERIES.find(item => item.id === id)!;
            if (!state.sceneries.has(id) && scenery.capsules) { setBuild(null); setCapsuleTab("boosts"); setMenu("capsules"); return; }
            confirmBuy(`${scenery.name} around the shop`, state.sceneries.has(id) ? 0 : scenery.cost, () => { const problem = applyScenery(state, id); setBuildMessage(problem ?? `${scenery.name} it is.`); if (!problem) cue("purchase"); setHud(readHud(state)); refresh(); });
          }}
          onBuilding={id => confirmBuy(`Move into the ${buildingById(id).name.toLowerCase()}`, 0, () => { const problem = setBuilding(state, id); setBuildMessage(problem ?? `Moved into the ${buildingById(id).name.toLowerCase()}.`); if (!problem) cue("purchase"); setBuild({ ...build, selected: null, cursor: null }); setHud(readHud(state)); refresh(); },
            state.started && state.building !== id ? "Furniture that doesn't fit the new building is refunded in Beans." : undefined)}
          onFinish={(surface, id) => { const finish = (surface === "wallpaper" ? WALLPAPERS : FLOORS).find(item => item.id === id)!; confirmBuy(`${finish.name} ${surface}`, state.finishes.has(id) ? 0 : finish.cost, () => { const problem = applyFinish(state, surface, id); setBuildMessage(problem ?? `${surface === "wallpaper" ? "Wallpaper" : "Floor"} applied.`); if (!problem) cue("purchase"); setHud(readHud(state)); refresh(); }); }} />}
        {!build && state && <NowPlaying prefs={state.prefs} collected={state.collection} onChange={changePrefs} />}
        {hud.phase === "open" && !build && <div className="cafe-footer">
          <p role="status" aria-live="polite">{toast || (hud.queue ? `${hud.queue} task${hud.queue > 1 ? "s" : ""} queued${hud.carrying ? ` · carrying ${hud.carrying}` : ""}` : hud.carrying ? `Carrying ${hud.carrying} dish${hud.carrying > 1 ? "es" : ""}` : "Tap a guest to take an order · tap the counter when a dish is ready")}</p>
          {hud.queue > 0 && <button type="button" onClick={() => { if (cafe.current) { clearQueue(cafe.current); setHud(readHud(cafe.current)); } }}>Clear tasks</button>}
        </div>}
      </>}
    </div>

    {status && <div className="cafe-status" role={failed ? "alert" : "status"}>
      <div className="cafe-steam" aria-hidden="true"><i /><i /><i /><Icon name="cup" size={96} /></div>
      <strong className="cafe-wordmark">RareFriends <span>Cafe</span></strong>
      <p>{status}</p>{!failed && <span className="cafe-loading" aria-hidden="true" />}
      {failed && <button type="button" disabled={paused} onClick={() => setRevision(value => value + 1)}>Retry</button>}</div>}

    {hud?.phase === "intro" && !menu && !build && state && state.started && <GameMenu title={`Welcome back to ${shop.name}`}>
      <p>Your wallet's shop is restored: day {state.day}, level {state.level}, <Beans n={state.beans} />, {state.items.length} placed items and {state.staff.length} staff.</p>
      <p>Today's manager is your Friend <strong>#{friendId.toString()}</strong> ({familyName}){familyPerk ? ` · ${familyPerk.title}: ${familyPerk.text}` : ""}</p>
      <button type="button" className="rf-frame-primary" disabled={paused} onClick={startDay}>Open day {state.day}</button>
      <button type="button" disabled={paused} onClick={enterBuild}>Build</button>
      <button type="button" disabled={paused} onClick={() => openMenu("upgrades")}>Upgrades</button>
    </GameMenu>}

    {hud?.phase === "intro" && !menu && !build && state && !state.started && <GameMenu title="Open your shop">
      <p>Your Rare Friend <strong>#{friendId.toString()}</strong> ({familyName}) is the manager.{state.ownedFriends.length ? ` ${state.ownedFriends.length} more of your Friends can join as staff.` : ""}</p>
      {familyPerk && <p className="cafe-perk"><strong>{familyName} perk · {familyPerk.title}:</strong> {familyPerk.text}</p>}
      <h3>What kind of shop is it?</h3>
      <ShopPicker value={shopChoice} onChange={id => { setShopChoice(id); chooseShop(state, id); refresh(); }} />
      <p className="cafe-note">{shop.tagline} Every shop plays the same way with its own menu, station and look.</p>
      <ol className="cafe-steps">
        <li><strong>Tap a guest</strong> (or press their table number) to take the order. When the counter bell rings, <strong>tap the counter</strong> and your Friend delivers.</li>
        <li>Earn <strong>Beans</strong> for dishes, staff slots and upgrades. Press <strong>Build</strong> to place tables and décor on the tiles, and to pick wallpaper and floors.</li>
        <li>Fill staff slots with <strong>Friends you own</strong> or guest Friends. Rare Recipe Capsules (simulated RF) unlock specials.</li>
      </ol>
      <h3 className="cafe-subhead">Your building</h3>
      <BuildingPicker value={state.building} size={state.size} onChange={id => { setBuilding(state, id); cue("select"); refresh(); }} />
      <button type="button" className="rf-frame-primary" disabled={paused} onClick={startDay}>Open {shop.name}</button>
      <button type="button" disabled={paused} onClick={enterBuild}>Arrange first</button>
      <button type="button" disabled={paused} onClick={() => { setTab("staff"); openMenu("upgrades"); }}>Staff & upgrades</button>
      <button type="button" disabled={paused} onClick={() => openMenu("help")}>Controls</button>
    </GameMenu>}

    {hud?.phase === "summary" && !menu && !build && state && <GameMenu title={`Day ${state.day} closed`}>
      <div className="cafe-summary">
        <p><span>Guests served</span><strong>{state.today.served}</strong></p>
        <p><span>Walked in from the street</span><strong>{state.today.walkIns}</strong></p>
        <p><span>Left unhappy</span><strong>{state.today.lost}</strong></p>
        <p><span>Beans earned</span><strong><Beans n={state.today.beans} /></strong></p>
        <p><span>Of which tips</span><strong><Beans n={state.today.tips} /></strong></p>
        <p><span>Biggest bill</span><strong><Beans n={state.today.best} /></strong></p>
        {state.today.vips > 0 && <p><span>Genesis VIPs</span><strong>{state.today.vips}</strong></p>}
        <p><span>Rating</span><strong><Stars rating={state.rating} /> {state.rating.toFixed(1)}</strong></p>
        {challengesFor(state).map(challenge => <p key={challenge.id} className={challenge.done ? "cafe-done" : undefined}><span><Icon name={challenge.done ? "boxDone" : "box"} size={12} />{challenge.text}</span><strong>{challenge.done ? <>+<Beans n={challengeReward(state.day).beans} /></> : "missed"}</strong></p>)}
      </div>
      <p>{state.today.lost === 0 && state.today.served > 0 ? "Perfect service. Not a single guest left unhappy!" : "Spend your Beans before the next day: rearrange, hire staff, or add dishes."}</p>
      <div className="cafe-share">
        <h3>Share your day on X</h3>
        {card?.day === state.day ? <img src={card.url} alt={`Day ${state.day} report card for ${shop.name}`} /> : <p role="status">Drawing your day card…</p>}
        <p className="cafe-note">{card?.day === state.day ? card.text.split("\n").at(-1) : ""} · the picture and tags go into your post. You press Post on X.</p>
        <div className="cafe-buttons">
          <button type="button" className="rf-frame-primary" disabled={paused || card?.day !== state.day} onClick={() => shareCard("post")}>Post to X</button>
          <button type="button" disabled={paused || card?.day !== state.day} onClick={() => shareCard("copy")}>Copy picture</button>
          <button type="button" disabled={paused || card?.day !== state.day} onClick={() => shareCard("save")}>Save picture</button>
        </div>
        {shareStatus && <p role="status">{shareStatus}</p>}
      </div>
      <button type="button" className="rf-frame-primary" disabled={paused} onClick={startDay}>Open day {state.day + 1}</button>
      <button type="button" disabled={paused} onClick={enterBuild}>Build</button>
      <button type="button" disabled={paused} onClick={() => openMenu("upgrades")}>Upgrades</button>
    </GameMenu>}

    {menu === "upgrades" && state && <GameMenu title={`Upgrades · ${state.beans.toLocaleString("en-US")} Beans`} onClose={closeMenu}>
      <div className="cafe-tabs" role="tablist" aria-label="Upgrade categories">
        {(["menu", "kitchen", "staff", "manager"] as const).map(name => <button type="button" role="tab" key={name} aria-selected={tab === name} onClick={() => { setTab(name); setError(""); setPicking(null); }}>{name === "menu" ? "Menu" : name === "kitchen" ? "Shop" : name === "staff" ? "Staff" : `You${skillPoints(state) > 0 ? ` · ${skillPoints(state)}` : ""}`}</button>)}
      </div>
      {tab === "menu" ? shopById(state.shop).menu.map(dish => {
        const on = availableDishes(state).includes(dish.id), special = dish.blend !== undefined;
        return <div className="cafe-row" key={dish.id}>
          <span><strong>{dish.name}</strong><small>{dish.price} Beans · cooks {dish.cook}s{special ? ` · needs a kept ${BLEND_BONUSES[dish.blend!].name}` : dish.level > 1 ? ` · Lv ${dish.level}` : ""}</small></span>
          {on ? <em>On menu</em> : special ? <button type="button" onClick={() => setMenu("capsules")}>Capsules</button>
            : <button type="button" disabled={paused || state.level < dish.level || state.beans < dish.unlockCost} onClick={() => unlock(dish.id)}>{state.level < dish.level ? `Lv ${dish.level}` : <Beans n={dish.unlockCost} />}</button>}
        </div>;
      }) : tab === "kitchen" ? <>
        <div className="cafe-row">
          <span><strong>{shop.station === "espresso" ? "Espresso machine" : shop.station === "tank" ? "Seafood station" : shop.station === "oven" ? "Bakery oven" : shop.station === "grill" ? "Flat-top grill" : "Steamer & wok"} Lv {state.machine + 1}</strong>
            <small>Dishes cook {Math.round(state.machine * 12)}% faster now; each level adds 12%.</small></span>
          {purchaseCost(state, "machine") === null ? <em>Maxed</em> : <button type="button" disabled={paused || state.beans < purchaseCost(state, "machine")!} onClick={() => purchase("machine")}><Beans n={purchaseCost(state, "machine")!} /></button>}
        </div>
        <p className="cafe-note">{kitchenSlots(state)} dish{kitchenSlots(state) > 1 ? "es" : ""} cook at once (1 + chefs). You carry {carryCapacity(state, manager(state))}. Ambience {ambience(state)}/5 ({ambiencePoints(state)} points from décor, wallpaper and floor) raises tips, patience and arrivals. Up to {tableLimit(state.level)} tables at level {state.level}.</p>
        <div className="cafe-row">
          <span><strong>{purchaseCost(state, "expand") === null ? `Shop size ${plan(state).w} × ${plan(state).d}` : `Expand to ${plan(state).w + 2} × ${plan(state).d + 2}`}</strong>
            <small>{purchaseCost(state, "expand") === null ? "Fully expanded." : `Now ${plan(state).w} × ${plan(state).d}. Adds 2 tiles each way: more dining room, a longer kitchen counter. Between days only.`}</small></span>
          {purchaseCost(state, "expand") === null ? <em>Maxed</em> : <button type="button" disabled={paused || state.phase === "open" || state.level < purchaseLevel(state, "expand") || state.beans < purchaseCost(state, "expand")!} onClick={() => purchase("expand")}>{state.level < purchaseLevel(state, "expand") ? `Lv ${purchaseLevel(state, "expand")}` : <Beans n={purchaseCost(state, "expand")!} />}</button>}
        </div>
        {UPGRADES.map(upgrade => {
          const owned = upgradeLevel(state, upgrade.id), next = nextUpgrade(state, upgrade.id);
          return <div className="cafe-row" key={upgrade.id}>
            <span><strong>{upgrade.name} {owned ? `Lv ${owned}` : ""}<small className="cafe-pips" aria-label={`${owned} of ${upgrade.costs.length}`}>{"●".repeat(owned)}{"○".repeat(upgrade.costs.length - owned)}</small></strong>
              <small>{upgrade.text}</small></span>
            {!next ? <em>Maxed</em> : <button type="button" disabled={paused || state.level < next.level || state.beans < next.cost} onClick={() => upgradeShop(upgrade.id)}>{state.level < next.level ? `Lv ${next.level}` : <Beans n={next.cost} />}</button>}
          </div>;
        })}
        <button type="button" disabled={paused} onClick={enterBuild}>Open build mode</button>
      </> : tab === "manager" ? <>
        <p className="cafe-note">Your manager, Friend #{friendId.toString()}, earns a skill point every café level. {skillPoints(state) > 0 ? `${skillPoints(state)} point${skillPoints(state) > 1 ? "s" : ""} to spend.` : `Next point at level ${state.level + 1}.`}</p>
        {MANAGER_SKILLS.map(skill => {
          const points = skillLevel(state, skill.id);
          return <div className="cafe-row" key={skill.id}>
            <span><strong>{skill.name} <small className="cafe-pips" aria-label={`${points} of ${skill.max}`}>{"●".repeat(points)}{"○".repeat(skill.max - points)}</small></strong><small>{skill.text}</small></span>
            {points >= skill.max ? <em>Maxed</em> : <button type="button" disabled={paused || skillPoints(state) <= 0} onClick={() => { const problem = raiseSkill(state, skill.id); setError(problem ?? ""); if (!problem) { cue("purchase"); say(`${skill.name} ${points + 1}/${skill.max}.`); } setHud(readHud(state)); refresh(); }}>+1 point</button>}
          </div>;
        })}
      </> : <StaffPanel state={state} candidates={candidates} picking={picking} paused={paused} onPick={setPicking} onUnlock={() => purchase("slot")}
        onAssign={(slot, who) => { const problem = assignStaff(state, slot, who, "waiter"); setError(problem ?? ""); if (!problem) { cue("select"); setPicking(null); } refresh(); }}
        onRole={(slot, role) => { setStaffRole(state, slot, role); cue("select"); refresh(); }}
        onBreak={id => { say(sendToBreak(state, id)); cue("select"); refresh(); }}
        onStat={(slot, stat) => { const problem = raiseStat(state, slot, stat); setError(problem ?? ""); if (!problem) cue("purchase"); refresh(); }} />}
      {error && <p role="alert">{error}</p>}
      {tab === "staff" && purchaseLevel(state, "slot") > state.level && <p className="cafe-note">Next staff slot at level {purchaseLevel(state, "slot")}.</p>}
    </GameMenu>}

    {menu === "capsules" && !reveal && <GameMenu title="Rare Capsule Machine" onClose={busy ? undefined : closeMenu}>
      {!snapshot || !state ? <p role="status">Loading capsule machine…</p> : <>
        <div className="cafe-machine" data-spin={spinning || busy} aria-hidden="true">
          <div className="dome">{[[12, 58], [40, 64], [66, 54], [22, 32], [52, 30], [34, 8], [70, 22]].map(([x, y], index) =>
            <i key={index} style={{ left: x, top: y, ["--c" as string]: CAPSULE_COLORS[index % 4] }} />)}</div>
          <div className="body"><b>RF · {snapshot.consumables.toString()}</b><span className="chute" /></div><span className="crank" />
        </div>
        <p className="cafe-sim">{snapshot.mode === "preview" ? "Simulated RF preview. No real tokens or transactions." : "Live · Robinhood"} · Friend balance <strong>{rf(snapshot.rfBalance)}</strong> · {snapshot.consumables.toString()} capsule{snapshot.consumables === 1n ? "" : "s"} ready</p>
        <div className="cafe-tabs" role="tablist" aria-label="Capsule machine">
          {(["machine", "boosts", "collection", "recipes"] as const).map(name => <button type="button" role="tab" key={name} aria-selected={capsuleTab === name} onClick={() => setCapsuleTab(name)}>
            {name === "machine" ? "Machine" : name === "boosts" ? "Boosts" : name === "collection" ? `Collection · ${state.collection.size}/${EXCLUSIVES.length}` : `Kept · ${blendCount.toString()}`}</button>)}
        </div>
        {capsuleTab === "machine" ? <>
          <p>Each capsule costs <strong>{rf(definition.price)}</strong> and holds a <strong>secret recipe</strong> (keep it for a shop bonus, or redeem it for RF) plus an <strong>RF-exclusive collectible</strong> for your shop. Duplicates turn into Beans.</p>
          <div className="cafe-buttons">
            <button type="button" className="rf-frame-primary" disabled={!canBuy(1) || busy || paused} onClick={() => void act(() => client.buy(1n), () => { cue("purchase"); say("One capsule added to your Friend."); })}>Buy 1 · {rf(definition.price)}</button>
            <button type="button" disabled={!canBuy(5) || busy || paused} onClick={() => void act(() => client.buy(5n), () => { cue("purchase"); say("Five capsules added to your Friend."); })}>Buy 5 · {rf(definition.price * 5n)}</button>
            <button type="button" disabled={busy || paused || (!pendingPlays.length && snapshot.consumables === 0n)} onClick={() => void openCapsules(1)}>{pendingPlays.length ? "Finish opening" : "Turn the crank"}</button>
            <button type="button" disabled={busy || paused || pendingPlays.length > 0 || snapshot.consumables < 2n} onClick={() => void openCapsules(Number(snapshot.consumables > 99n ? 99n : snapshot.consumables))}>Open all ({snapshot.consumables.toString()})</button>
          </div>
          {!canBuy(1) && <p>{snapshot.rfBalance < definition.price ? "Not enough simulated RF in your Friend's wallet." : "New capsules are paused until the machine has enough free backing."}</p>}
          <table className="cafe-odds"><thead><tr><th>Tier</th><th>Chance</th><th>RF value</th><th>Kept bonus</th><th>Exclusives</th></tr></thead>
            <tbody>{definition.outcomes.map((item, index) => <tr key={item.name}><td>{item.name}</td><td>{item.chanceBps / 100}%</td><td>{rf(item.reward)}</td><td>{BLEND_BONUSES[index]?.text}</td>
              <td>{EXCLUSIVES.filter(exclusive => exclusive.tier === index).map(exclusive => exclusive.name).join(", ")}</td></tr>)}</tbody></table>
          <p className="cafe-note">Expected RF value {rf(expectedReward(definition))} per capsule. Every capsule reserves {rf(maxPrize)} of backing; kept recipes keep their RF value with no expiry. Collectibles carry no RF value.</p>
        </> : capsuleTab === "boosts" ? <>
          <p>Boosts are paid with capsules you bought with RF: they open and settle into recipes as usual (keep or redeem them), but give the boost <strong>instead of</strong> a collectible. Boosts count shop days, including one in progress.</p>
          {BOOSTS.map(boost => {
            const days = state.boosts[boost.id] ?? 0;
            return <div className="cafe-row" key={boost.id}>
              <span><strong>{boost.name}{days ? ` · ${days} day${days > 1 ? "s" : ""} left` : ""}</strong><small>{boost.text} {boost.days} day{boost.days > 1 ? "s" : ""}.</small></span>
              <button type="button" disabled={busy || paused || pendingPlays.length > 0 || snapshot.consumables < BigInt(boost.capsules)} onClick={() => void buyBoost(boost.id)}>
                {boost.capsules} capsules · {rf(definition.price * BigInt(boost.capsules))}</button>
            </div>;
          })}
          <h3 className="cafe-subhead">RF sceneries · the world outside, for good</h3>
          {SCENERIES.filter(scenery => scenery.capsules).map(scenery => {
            const owned = state.sceneries.has(scenery.id);
            return <div className="cafe-row" key={scenery.id}>
              <span><strong>{scenery.name}{owned ? " · owned" : ""}</strong><small>{scenery.text} +{scenery.ambience} ambience.</small></span>
              {owned ? <button type="button" disabled={paused || state.scenery === scenery.id} onClick={() => { applyScenery(state, scenery.id); cue("select"); refresh(); }}>{state.scenery === scenery.id ? "In use" : "Use"}</button>
                : <button type="button" disabled={busy || paused || pendingPlays.length > 0 || snapshot.consumables < BigInt(scenery.capsules!)} onClick={() => void buyScenery(scenery.id)}>
                  {scenery.capsules} capsules · {rf(definition.price * BigInt(scenery.capsules!))}</button>}
            </div>;
          })}
          {snapshot.consumables < 2n && <p className="cafe-note">You have {snapshot.consumables.toString()} capsule{snapshot.consumables === 1n ? "" : "s"}. Buy more on the Machine tab.</p>}
        </> : capsuleTab === "collection" ? <div className="cafe-collection">
          {EXCLUSIVES.map(item => {
            const owned = state.collection.has(item.kind), placed = state.items.some(placedItem => placedItem.kind === item.kind);
            return <div key={item.kind} className={owned ? "" : "locked"}>
              <ItemPreview kind={item.kind} locked={!owned} statue={friend.current ? friendRows(friend.current, "down", false, 0) : null} />
              <strong>{owned ? item.name : "???"}</strong><small>{definition.outcomes[item.tier!]?.name} · +{item.ambience} ambience</small>
              <small>{owned ? item.text.replace("RF exclusive · ", "") : "Not collected yet"}</small>
              {owned && <button type="button" disabled={paused || placed} onClick={() => { setMenu(null); setBuild({ ...DEFAULT_TOOL, shelf: "decor", kind: item.kind, selected: null, cursor: null }); setBuildMessage(`Placing ${item.name}: tap a tile.`); focusCanvas(); }}>{placed ? "Placed" : "Place"}</button>}
            </div>;
          })}
        </div> : <>
          {definition.outcomes.map((item, index) => <div className="cafe-row" key={item.name}>
            <span><strong>{item.name} × {snapshot.inventory[index].toString()}</strong><small>{BLEND_BONUSES[index]?.text}{snapshot.inventory[index] > 0n ? " · active" : ""}</small></span>
            <button type="button" disabled={busy || paused || snapshot.inventory[index] === 0n || item.reward === 0n} onClick={() => void act(() => client.redeem(index + 1, 1n), () => { cue("reward"); say(`Redeemed one ${item.name} for ${rf(item.reward)}.`); })}>Redeem · {rf(item.reward)}</button>
          </div>)}
          <p className="cafe-note">Kept recipes live in the SDK's session ledger and reset on reload; your collectibles are saved with your shop.</p>
        </>}
      </>}
      {busy && <p role="status">Waiting for confirmation…</p>}
      {error && <p role="alert">{error}</p>}
    </GameMenu>}

    {reveal && state && <GameMenu title={reveal.length === 1 ? "Capsule opened" : `${reveal.length} capsules opened`}>
      <div className="cafe-results">
        {reveal.map((result, index) => {
          const outcome = definition.outcomes[result.outcomeId - 1], exclusive = result.exclusive ? catalogItem(result.exclusive) : null;
          return <div className="cafe-result" key={index}>
            <div className={`cafe-reveal-${result.outcomeId}`}><div className="cafe-capsule" aria-hidden="true"><span /></div></div>
            <span><strong>{outcome.name}</strong><small>{outcome.chanceBps / 100}% · worth {rf(outcome.reward)} (simulated) · kept: {BLEND_BONUSES[result.outcomeId - 1]?.text}</small>
              <small>{result.boost ? `Spent on ${result.boost}` : exclusive ? `New RF exclusive: ${exclusive.name} (+${exclusive.ambience} ambience)` : `Duplicate collectible: +${result.beans} Beans`}</small></span>
            <button type="button" disabled={busy || paused || result.redeemed} onClick={() => void act(() => client.redeem(result.outcomeId, 1n), () => {
              cue("reward"); setReveal(current => current?.map((item, other) => other === index ? { ...item, redeemed: true } : item) ?? null);
            })}>{result.redeemed ? "Redeemed" : `Redeem · ${rf(outcome.reward)}`}</button>
          </div>;
        })}
      </div>
      <div className="cafe-buttons">
        <button type="button" className="rf-frame-primary" disabled={busy || paused} onClick={() => { setReveal(null); say("Kept recipes are boosting your shop. New exclusives are in Build → Furniture."); }}>Keep the rest</button>
        {reveal.some(result => result.exclusive) && <button type="button" disabled={busy || paused} onClick={() => { const first = reveal.find(result => result.exclusive)!.exclusive!; setReveal(null); setMenu(null); setBuild({ ...DEFAULT_TOOL, shelf: "decor", kind: first, selected: null, cursor: null }); setBuildMessage(`Placing ${catalogItem(first).name}: tap a tile.`); focusCanvas(); }}>Place my new exclusive</button>}
      </div>
      {error && <p role="alert">{error}</p>}
    </GameMenu>}

    {menu === "pause" && <GameMenu title="Paused" onClose={closeMenu}>
      <p>The shop is paused: guests, staff and the clock wait for you.{state && skillPoints(state) > 0 ? ` You have ${skillPoints(state)} manager skill point${skillPoints(state) > 1 ? "s" : ""} to spend.` : ""}</p>
      <div className="cafe-buttons">
        <button type="button" className="rf-frame-primary" onClick={closeMenu}>Resume</button>
        <button type="button" onClick={() => { setTab("manager"); setMenu("upgrades"); }}>Upgrades</button>
        <button type="button" onClick={() => setMenu("settings")}>Settings</button>
        <button type="button" onClick={() => setMenu("help")}>Controls</button>
        <button type="button" onClick={() => setMenu("news")}>What's new · v{VERSION}</button>
      </div>
      <p className="cafe-note">Esc or P pauses; Esc again resumes.</p>
    </GameMenu>}

    {menu === "news" && <GameMenu title={`What's new · v${VERSION}`} onClose={closeMenu}>
      <div className="cafe-news">
        {CHANGELOG.map(release => <article key={release.version}>
          <h3>v{release.version} · {release.title}<small>{release.date}</small></h3>
          <ul>{release.notes.map(note => <li key={note}>{note}</li>)}</ul>
        </article>)}
      </div>
    </GameMenu>}

    {ask && <GameMenu title="Confirm" onClose={() => setAsk(null)}>
      <p><strong>{ask.title}</strong>{ask.cost > 0 ? <> for <strong><Beans n={ask.cost} /></strong>?</> : "?"}</p>
      {ask.detail && <p className="cafe-note">{ask.detail}</p>}
      {state && ask.cost > 0 && <p className="cafe-note">You have <Beans n={state.beans} size={11} />; <Beans n={state.beans - ask.cost} size={11} /> left after.</p>}
      <div className="cafe-buttons">
        <button type="button" className="rf-frame-primary" ref={askButton} onClick={() => { const run = ask.run; setAsk(null); run(); }}>{ask.cost > 0 ? <>Buy · <Beans n={ask.cost} /></> : "OK"}</button>
        <button type="button" onClick={() => setAsk(null)}>Cancel</button>
      </div>
      <label className="cafe-check"><input type="checkbox" checked={false} onChange={() => { if (state) changePrefs({ ...state.prefs, confirm: false }); const run = ask.run; setAsk(null); run(); }} /> Buy and stop asking (turn back on in Settings)</label>
    </GameMenu>}

    {menu === "settings" && <GameMenu title="Settings" onClose={closeMenu}>
      <button type="button" aria-pressed={!muted} onClick={toggleMute}>{muted ? "Sound off" : "Sound on"}</button>
      {cafe.current && <MusicControls prefs={cafe.current.prefs} collected={cafe.current.collection} onChange={changePrefs} />}
      <label className="cafe-check"><input type="checkbox" checked={reducedMotion} onChange={event => setReducedMotion(event.target.checked)} /> Reduce motion</label>
      {cafe.current && <>
        <label className="cafe-check"><input type="checkbox" checked={cafe.current.prefs.confirm} onChange={event => changePrefs({ ...cafe.current!.prefs, confirm: event.target.checked })} /> Ask before spending Beans</label>
        <div className="cafe-theme" role="radiogroup" aria-label="Theme">Theme
          {(["auto", "light", "dark"] as const).map(theme => <button type="button" role="radio" key={theme} aria-checked={cafe.current!.prefs.theme === theme}
            onClick={() => changePrefs({ ...cafe.current!.prefs, theme })}>{theme === "auto" ? "Auto" : theme === "light" ? "Light" : "Dark"}</button>)}
        </div>
      </>}
      <button type="button" onClick={() => setMenu("news")}>What's new · v{VERSION}</button>
      {familyPerk && <div className="cafe-perk cafe-row"><SpriteChip rows={friend.current ? friendRows(friend.current, "down", false, 0) : null} label="" /><span><strong>Manager #{friendId.toString()} · {familyName}</strong><small>{familyPerk.title}: {familyPerk.text}</small></span></div>}
      <p>Switch manager with the runtime's Friend controls; each Friend brings their own family perk. Your other owned Friends appear under Upgrades → Staff.</p>
      <p>{linked.current ? "Your shop (Beans, level, menu, furniture, staff) saves automatically for your connected wallet on this device." : "Progress saving is off: it needs the RareFriends Cafe host page and your wallet's Friends to load."} Capsule RF balances and outcomes are simulated by the SDK preview and reset on reload. Wallet connection and ownership checks are provided by FriendSDK.</p>
      <button type="button" onClick={() => setMenu("help")}>Controls</button>
    </GameMenu>}

    {menu === "help" && <GameMenu title="Controls" onClose={closeMenu}>
      <ul className="cafe-steps">
        <li><strong>Tap / click</strong> a guest: take their order, or fetch and serve their dish.</li>
        <li><strong>Tap the counter</strong>: pick up every ready dish; you deliver them automatically.</li>
        <li><strong>Tap the floor</strong>: walk. Tap the capsule machine for Rare Recipe Capsules.</li>
        <li><strong>Drag</strong> or <strong>arrows</strong>: move the view · <strong>scroll</strong>, <strong>pinch</strong> or <strong>+ / −</strong>: zoom · <strong>⤢</strong>: reset the view.</li>
        <li><strong>WASD</strong>: walk · <strong>E / Space</strong>: act nearby · <strong>1–9, 0</strong>: act on that table · <strong>C</strong>: pick up · <strong>X</strong>: clear tasks.</li>
        <li><strong>Esc / P</strong> or the <strong>pause</strong> button: pause. Esc again resumes.</li>
        <li><strong>Tap a tired staff Friend</strong> (zzz bubble) or press <strong>T</strong> to send them to the break room for 15–30 s.</li>
        <li><strong>Build (B)</strong>: tap tiles to place tables and décor. <strong>Move</strong>: tap an item (or the capsule machine), then a tile. <strong>Sell</strong>: 50% back. <strong>R</strong> turns any item a quarter (Shift+R back), tables and chairs included; arrows + Enter work too; <strong>Esc</strong> finishes.</li>
      </ul>
      <p>Tasks queue up (numbered markers), so you can tap several guests in a row. Guests leave unhappy if their patience bar runs out. A day lasts {Math.round(DAY_LENGTH / 60 * 10) / 10} minutes; the shop pauses while a menu or build mode is open.</p>
      <button type="button" onClick={closeMenu}>Back to the shop</button>
    </GameMenu>}
  </section>;
}
