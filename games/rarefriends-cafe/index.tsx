"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { GameComponentProps } from "@rarefriends/friendsdk/runtime";
import { GameMenu } from "@rarefriends/friendsdk/frame";
import { formatGameAmount } from "@rarefriends/friendsdk/ui";
import { expectedReward, maximumPrize, type GamePlay, type GameSnapshot } from "@rarefriends/friendsdk/game";
import { createFriendReader, type GenerationSprites } from "@rarefriends/friendsdk/sprites";
import { createFriendSoundKit, type FriendSoundCue, type FriendSoundKit } from "@rarefriends/friendsdk/sounds";
import {
  BLEND_BONUSES, DAY_LENGTH, EXCLUSIVES, FAMILY_NAMES, workerLevel, type ItemKind, FAMILY_PERKS, LEVEL_XP, MAX_LEVEL, catalogItem, shopById, tableLimit, type DishId, type ShopId,
} from "./data.ts";
import {
  actOnCounter, actOnCustomer, actOnTable, ambience, ambiencePoints, applyFinish, assignStaff, availableDishes, buy, carryCapacity, chooseShop,
  clearQueue, createCafe, dayProgress, interactNearby, isClosing, itemAt, kitchenSlots, manager, moveItem, openCafe, placeItem, purchaseCost,
  purchaseLevel, restoreCafe, sellItem, serializeCafe, setBlends, setManual, setOwnedFriends, setStaffRole, unlockDish, update, walkTo, type CafeState,
  memberOf, mostTired, plan, sendToBreak, collectFromCapsule, type Prefs,
} from "./engine.ts";
import { createGuests } from "./guests.ts";
import { placementProblem, type Tile } from "./layout.ts";
import { BuildBar, ItemPreview, MusicControls, ShopPicker, SpriteChip, StaffPanel, staffCandidates, toolLabel, type BuildTool } from "./panels.tsx";
import { REGULAR_SPRITES } from "./regulars.ts";
import { VIEW, friendRows, hitTest, renderScene, tileAt, type BuildView, type Floater } from "./render.ts";
import { HOST_HELLO, HOST_STATE, SAVE_WRITE, SHARE_REQUEST, SHARE_RESULT, parseStaffRoster, type ShareAction, type ShareOutcome } from "./roster.ts";
import { renderDayCard, shareText } from "./card.ts";
import { CafeAudio, type TrackId } from "./audio.ts";
import "@rarefriends/friendsdk/frame.css";
import "./style.css";

const GUESTS = createGuests(18);
const rf = (value: bigint) => `${formatGameAmount(value, 18)} RF`;
const DIRECTIONS: Record<string, { dx: number; dy: number }> = {
  w: { dx: 0, dy: -1 }, arrowup: { dx: 0, dy: -1 }, s: { dx: 0, dy: 1 }, arrowdown: { dx: 0, dy: 1 },
  a: { dx: -1, dy: 0 }, arrowleft: { dx: -1, dy: 0 }, d: { dx: 1, dy: 0 }, arrowright: { dx: 1, dy: 0 },
};
type Menu = "upgrades" | "capsules" | "settings" | "help" | null;
type Tab = "menu" | "kitchen" | "staff";
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
const stars = (rating: number) => "★★★★★".slice(0, Math.round(rating)) + "☆☆☆☆☆".slice(0, 5 - Math.round(rating));
type CapsuleResult = { play: bigint; outcomeId: number; exclusive: ItemKind | null; beans: number; redeemed: boolean };
const CAPSULE_COLORS = ["#b7ada3", "#b9bfc6", "#9fabc2", "#e2d49e"];
const DEFAULT_TOOL: BuildTool = { tab: "items", mode: "place", kind: "table", dir: 0 };

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
  const audio = useRef<CafeAudio | null>(null), [capsuleTab, setCapsuleTab] = useState<"machine" | "collection" | "recipes">("machine"), [spinning, setSpinning] = useState(false);
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [reveal, setReveal] = useState<CapsuleResult[] | null>(null), [, setTick] = useState(0);
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
      if (!linked.current && data.save && restoreCafe(state, data.save)) { setToast("Welcome back! This wallet's shop has been restored."); setHud(readHud(state)); applyPrefs(state.prefs); }
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
      window.parent.postMessage({ type: HOST_HELLO }, "*");
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
          else if (event.kind === "levelup") { setToast(`Level ${event.level}! New dishes, tables, staff slots or an expansion may be available.`); audio.current?.levelUp(); }
          else if (event.kind === "tired") { setToast(`Slot ${event.slot + 1} is tired. Tap them (or press T) to send them to the break room.`); audio.current?.tired(event.slot); }
          else if (event.kind === "workerLevel") { setToast(`Staff slot ${event.slot + 1} reached worker level ${event.level}!`); audio.current?.workerLevel(); }
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
        renderScene(ctx, { state, now, reducedMotion: live.current.reducedMotion, guests: GUESTS, regulars: regularMap, friend: sprites,
          staffSprites: staffSprites.current, floaters: floaters.current, hover: hover.current, build: live.current.build ? buildView.current : null }, pixelScale);
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
    let ghost: BuildView["ghost"] = null, valid = false;
    if (build.cursor && build.tab === "items" && (build.mode === "place" || moving)) {
      const kind = moving ? moving.kind : build.kind;
      ghost = { kind, x: build.cursor.x, y: build.cursor.y, dir: build.dir };
      valid = !placementProblem(state.items, ghost, plan(state), moving?.id) && (Boolean(moving) || state.beans >= catalogItem(kind).cost);
    }
    buildView.current = { cursor: build.cursor, ghost, valid, selected: build.selected };
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
    if (build.mode === "place") { problem = placeItem(state, build.kind, tile, build.dir); done = `${catalogItem(build.kind).name} placed.`; }
    else if (build.mode === "sell") {
      const item = itemAt(state, tile);
      problem = item ? sellItem(state, item.id) : "Nothing to sell there.";
      done = item ? `Sold for ☕ ${Math.floor(catalogItem(item.kind).cost / 2)}.` : "";
    } else if (build.selected === null) {
      const item = itemAt(state, tile);
      if (!item) problem = "Tap an item to move it.";
      else { setBuild({ ...build, selected: item.id, dir: item.dir, cursor: tile }); setBuildMessage(`Moving ${catalogItem(item.kind).name}: tap a new tile.`); return; }
    } else {
      problem = moveItem(state, build.selected, tile, build.dir); done = "Moved.";
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
      if (DIRECTIONS[key]) { event.preventDefault(); const { dx, dy } = DIRECTIONS[key]; setBuild({ ...build, cursor: { x: Math.max(0, Math.min(10, cursor.x + dx)), y: Math.max(0, Math.min(10, cursor.y + dy)) } }); }
      else if (key === "enter" || key === " " || key === "e") { event.preventDefault(); buildAt(cursor); }
      else if (key === "r") { event.preventDefault(); setBuild({ ...build, dir: build.dir ? 0 : 1 }); }
      else if (key === "delete" || key === "backspace") { event.preventDefault(); const item = itemAt(state, cursor); setBuildMessage(item ? sellItem(state, item.id) ?? "Sold." : "Nothing to sell there."); refresh(); }
      else if (key === "escape") { event.preventDefault(); if (build.selected !== null) setBuild({ ...build, selected: null }); else exitBuild(); }
      return;
    }
    if (DIRECTIONS[key]) { event.preventDefault(); setManual(state, DIRECTIONS[key]); return; }
    if (event.repeat) return;
    if (/^[1-9]$/.test(key)) { event.preventDefault(); say(actOnTable(state, Number(key) - 1)); cue("select"); }
    else if (key === "0") { event.preventDefault(); say(actOnTable(state, 9)); cue("select"); }
    else if (key === "c") { event.preventDefault(); say(actOnCounter(state)); cue("select"); }
    else if (key === "x") { event.preventDefault(); clearQueue(state); say("Task list cleared."); }
    else if (key === "b") { event.preventDefault(); enterBuild(); }
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
  function purchase(item: "machine" | "slot" | "expand") {
    const state = cafe.current;
    if (!state || paused) return;
    const problem = buy(state, item);
    if (problem) setError(problem); else { setError(""); cue("purchase"); say(item === "slot" ? "New staff slot unlocked. Choose a Friend for it." : item === "expand" ? "The shop grew by 2 × 2. More room to build!" : "Kitchen upgraded."); }
    setHud(readHud(state)); refresh();
  }
  function unlock(id: DishId) {
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

  const state = cafe.current;
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
    ctx.clearRect(0, 0, 54, 54); ctx.fillStyle = "#fff";
    rows.forEach((row, y) => [...row].forEach((pixel, x) => { if (pixel === "#") ctx.fillRect(x * 3, y * 3, 9, 9); }));
    ctx.fillStyle = "#161616";
    rows.forEach((row, y) => [...row].forEach((pixel, x) => { if (pixel === "#") ctx.fillRect(x * 3 + 3, y * 3 + 3, 3, 3); }));
  }, [portraitReady, friendId]);

  return <section className="cafe-game" aria-label={shop.name} aria-busy={busy}
    data-phase={hud?.phase ?? "loading"} data-beans={hud?.beans ?? 0} data-served={hud?.served ?? 0} data-customers={hud?.customers ?? 0}
    data-build={build ? "on" : "off"} data-items={state?.items.length ?? 0} data-shop={state?.shop ?? ""} data-owned={state?.ownedFriends.length ?? 0} data-linked={linked.current ? "yes" : "no"}>
    <div className="cafe-world" inert={menu !== null || reveal !== null || paused || undefined}>
      <canvas ref={canvas} tabIndex={blocked ? -1 : 0}
        aria-label={build ? "Build mode. Tap a tile or use arrow keys and Enter to place, R to rotate, Delete to sell, Escape to finish."
          : "Shop floor. Tap a guest to take their order or serve them, tap the counter to pick up dishes, tap the floor to walk. Keys: WASD or arrows walk, E acts nearby, 1 to 0 act on a table, C picks up, X clears tasks, B builds."}
        onPointerDown={tap}
        onPointerMove={event => {
          if (event.pointerType !== "mouse" || !cafe.current) return;
          const point = pointerToView(event);
          if (build) { const tile = tileAt(cafe.current!, point.x, point.y); if (tile && (tile.x !== build.cursor?.x || tile.y !== build.cursor?.y)) setBuild({ ...build, cursor: tile }); return; }
          const hit = hitTest(cafe.current, point.x, point.y); hover.current = hit?.kind === "tile" ? hit.tile : null;
        }}
        onPointerLeave={() => { hover.current = null; }}
        onKeyDown={keyDown} onKeyUp={keyUp} onBlur={() => { if (cafe.current) setManual(cafe.current, null); }} />
      {hud && <>
        <div className="cafe-hud">
          <div className="cafe-card">
            <canvas ref={portrait} className="cafe-portrait" width={54} height={54} role="img" aria-label={`Manager: your Friend #${friendId.toString()}, ${familyName}`} />
            <strong className="cafe-title">{shop.name}</strong>
            <span className="cafe-day">Day {hud.day} · {build ? "building" : hud.phase === "open" ? hud.closing ? "last orders" : clock : hud.phase === "summary" ? "closed" : "not open yet"}</span>
            <span className="cafe-clock" aria-hidden="true"><i style={{ width: `${hud.progress * 100}%` }} /></span>
            <span className="cafe-stats"><b aria-label={`${hud.beans} Beans`}>☕ {hud.beans}</b><b aria-label={`Rating ${hud.rating.toFixed(1)} of 5`}>{stars(hud.rating)}</b><b>Lv {hud.level}</b></span>
            <span className="cafe-xp" aria-label={nextXp ? `${hud.xp} of ${nextXp} XP` : "Max level"}><i style={{ width: `${nextXp ? Math.min(100, (hud.xp - prevXp) / (nextXp - prevXp) * 100) : 100}%` }} /></span>
          </div>
          {!build && <div className="cafe-actions">
            <button type="button" onClick={enterBuild}>Build</button>
            <button type="button" onClick={() => openMenu("upgrades")}>Upgrades</button>
            <button type="button" onClick={() => openMenu("capsules")}>Capsules<span className="cafe-wide"> · RF</span></button>
            <button type="button" onClick={() => openMenu("settings")} aria-label="Settings">⚙</button>
            <button type="button" aria-pressed={!muted} aria-label="Sound" title={muted ? "Sound off" : "Sound on"} onClick={toggleMute}>{muted ? "♪̸" : "♪"}</button>
          </div>}
        </div>
        {build && state && <BuildBar state={state} tool={build} message={buildMessage || toolLabel(build)} onDone={exitBuild} onPrefs={changePrefs}
          onTool={next => { setBuild({ ...build, ...next, selected: next.mode === "move" ? build.selected : null }); setBuildMessage(next.tab === "items" ? toolLabel(next) : ""); }}
          onFinish={(surface, id) => { const problem = applyFinish(state, surface, id); setBuildMessage(problem ?? `${surface === "wallpaper" ? "Wallpaper" : "Floor"} applied.`); if (!problem) cue("purchase"); setHud(readHud(state)); refresh(); }} />}
        {hud.phase === "open" && !build && <div className="cafe-footer">
          <p role="status" aria-live="polite">{toast || (hud.queue ? `${hud.queue} task${hud.queue > 1 ? "s" : ""} queued${hud.carrying ? ` · carrying ${hud.carrying}` : ""}` : hud.carrying ? `Carrying ${hud.carrying} dish${hud.carrying > 1 ? "es" : ""}` : "Tap a guest to take an order · tap the counter when a dish is ready")}</p>
          {hud.queue > 0 && <button type="button" onClick={() => { if (cafe.current) { clearQueue(cafe.current); setHud(readHud(cafe.current)); } }}>Clear tasks</button>}
        </div>}
      </>}
    </div>

    {status && <div className="cafe-status" role={failed ? "alert" : "status"}><div className="cafe-steam" aria-hidden="true">☕</div><p>{status}</p>
      {failed && <button type="button" disabled={paused} onClick={() => setRevision(value => value + 1)}>Retry</button>}</div>}

    {hud?.phase === "intro" && !menu && !build && state && state.started && <GameMenu title={`Welcome back to ${shop.name}`}>
      <p>Your wallet's shop is restored: day {state.day}, level {state.level}, ☕ {state.beans} Beans, {state.items.length} placed items and {state.staff.length} staff.</p>
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
        <p><span>Beans earned</span><strong>☕ {state.today.beans}</strong></p>
        <p><span>Of which tips</span><strong>☕ {state.today.tips}</strong></p>
        <p><span>Biggest bill</span><strong>☕ {state.today.best}</strong></p>
        {state.today.vips > 0 && <p><span>Genesis VIPs</span><strong>{state.today.vips}</strong></p>}
        <p><span>Rating</span><strong>{stars(state.rating)} {state.rating.toFixed(1)}</strong></p>
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

    {menu === "upgrades" && state && <GameMenu title={`Upgrades · ☕ ${state.beans} Beans`} onClose={closeMenu}>
      <div className="cafe-tabs" role="tablist" aria-label="Upgrade categories">
        {(["menu", "kitchen", "staff"] as const).map(name => <button type="button" role="tab" key={name} aria-selected={tab === name} onClick={() => { setTab(name); setError(""); setPicking(null); }}>{name === "menu" ? "Menu" : name === "kitchen" ? "Shop" : "Staff"}</button>)}
      </div>
      {tab === "menu" ? shopById(state.shop).menu.map(dish => {
        const on = availableDishes(state).includes(dish.id), special = dish.blend !== undefined;
        return <div className="cafe-row" key={dish.id}>
          <span><strong>{dish.name}</strong><small>{dish.price} Beans · cooks {dish.cook}s{special ? ` · needs a kept ${BLEND_BONUSES[dish.blend!].name}` : dish.level > 1 ? ` · Lv ${dish.level}` : ""}</small></span>
          {on ? <em>On menu</em> : special ? <button type="button" onClick={() => setMenu("capsules")}>Capsules</button>
            : <button type="button" disabled={paused || state.level < dish.level || state.beans < dish.unlockCost} onClick={() => unlock(dish.id)}>{state.level < dish.level ? `Lv ${dish.level}` : `☕ ${dish.unlockCost}`}</button>}
        </div>;
      }) : tab === "kitchen" ? <>
        <div className="cafe-row">
          <span><strong>{shop.station === "espresso" ? "Espresso machine" : shop.station === "tank" ? "Seafood station" : shop.station === "oven" ? "Bakery oven" : shop.station === "grill" ? "Flat-top grill" : "Steamer & wok"} Lv {state.machine + 1}</strong>
            <small>Dishes cook {Math.round(state.machine * 12)}% faster now; each level adds 12%.</small></span>
          {purchaseCost(state, "machine") === null ? <em>Maxed</em> : <button type="button" disabled={paused || state.beans < purchaseCost(state, "machine")!} onClick={() => purchase("machine")}>☕ {purchaseCost(state, "machine")}</button>}
        </div>
        <p className="cafe-note">{kitchenSlots(state)} dish{kitchenSlots(state) > 1 ? "es" : ""} cook at once (1 + chefs). You carry {carryCapacity(state, manager(state))}. Ambience {ambience(state)}/5 ({ambiencePoints(state)} points from décor, wallpaper and floor) raises tips, patience and arrivals. Up to {tableLimit(state.level)} tables at level {state.level}.</p>
        <div className="cafe-row">
          <span><strong>{purchaseCost(state, "expand") === null ? `Shop size ${state.size} × ${state.size}` : `Expand to ${state.size + 2} × ${state.size + 2}`}</strong>
            <small>{purchaseCost(state, "expand") === null ? "Fully expanded." : `Now ${state.size} × ${state.size}. Adds 2 tiles each way: more dining room, a longer kitchen counter. Between days only.`}</small></span>
          {purchaseCost(state, "expand") === null ? <em>Maxed</em> : <button type="button" disabled={paused || state.phase === "open" || state.level < purchaseLevel(state, "expand") || state.beans < purchaseCost(state, "expand")!} onClick={() => purchase("expand")}>{state.level < purchaseLevel(state, "expand") ? `Lv ${purchaseLevel(state, "expand")}` : `☕ ${purchaseCost(state, "expand")}`}</button>}
        </div>
        <button type="button" disabled={paused} onClick={enterBuild}>Open build mode</button>
      </> : <StaffPanel state={state} candidates={candidates} picking={picking} paused={paused} onPick={setPicking} onUnlock={() => purchase("slot")}
        onAssign={(slot, who) => { const problem = assignStaff(state, slot, who, "waiter"); setError(problem ?? ""); if (!problem) { cue("select"); setPicking(null); } refresh(); }}
        onRole={(slot, role) => { setStaffRole(state, slot, role); cue("select"); refresh(); }}
        onBreak={id => { say(sendToBreak(state, id)); cue("select"); refresh(); }} />}
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
          {(["machine", "collection", "recipes"] as const).map(name => <button type="button" role="tab" key={name} aria-selected={capsuleTab === name} onClick={() => setCapsuleTab(name)}>
            {name === "machine" ? "Machine" : name === "collection" ? `Collection · ${state.collection.size}/${EXCLUSIVES.length}` : `Kept · ${blendCount.toString()}`}</button>)}
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
        </> : capsuleTab === "collection" ? <div className="cafe-collection">
          {EXCLUSIVES.map(item => {
            const owned = state.collection.has(item.kind), placed = state.items.some(placedItem => placedItem.kind === item.kind);
            return <div key={item.kind} className={owned ? "" : "locked"}>
              <ItemPreview kind={item.kind} locked={!owned} statue={friend.current ? friendRows(friend.current, "down", false, 0) : null} />
              <strong>{owned ? item.name : "???"}</strong><small>{definition.outcomes[item.tier!]?.name} · +{item.ambience} ambience</small>
              <small>{owned ? item.text.replace("RF exclusive · ", "") : "Not collected yet"}</small>
              {owned && <button type="button" disabled={paused || placed} onClick={() => { setMenu(null); setBuild({ ...DEFAULT_TOOL, kind: item.kind, selected: null, cursor: null }); setBuildMessage(`Placing ${item.name}: tap a tile.`); focusCanvas(); }}>{placed ? "Placed" : "Place"}</button>}
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
              <small>{exclusive ? `New RF exclusive: ${exclusive.name} (+${exclusive.ambience} ambience)` : `Duplicate collectible: +☕ ${result.beans} Beans`}</small></span>
            <button type="button" disabled={busy || paused || result.redeemed} onClick={() => void act(() => client.redeem(result.outcomeId, 1n), () => {
              cue("reward"); setReveal(current => current?.map((item, other) => other === index ? { ...item, redeemed: true } : item) ?? null);
            })}>{result.redeemed ? "Redeemed" : `Redeem · ${rf(outcome.reward)}`}</button>
          </div>;
        })}
      </div>
      <div className="cafe-buttons">
        <button type="button" className="rf-frame-primary" disabled={busy || paused} onClick={() => { setReveal(null); say("Kept recipes are boosting your shop. New exclusives are in Build → Furniture."); }}>Keep the rest</button>
        {reveal.some(result => result.exclusive) && <button type="button" disabled={busy || paused} onClick={() => { const first = reveal.find(result => result.exclusive)!.exclusive!; setReveal(null); setMenu(null); setBuild({ ...DEFAULT_TOOL, kind: first, selected: null, cursor: null }); setBuildMessage(`Placing ${catalogItem(first).name}: tap a tile.`); focusCanvas(); }}>Place my new exclusive</button>}
      </div>
      {error && <p role="alert">{error}</p>}
    </GameMenu>}

    {menu === "settings" && <GameMenu title="Settings" onClose={closeMenu}>
      <button type="button" aria-pressed={!muted} onClick={toggleMute}>{muted ? "Sound off" : "Sound on"}</button>
      {cafe.current && <MusicControls prefs={cafe.current.prefs} collected={cafe.current.collection} onChange={changePrefs} />}
      <label className="cafe-check"><input type="checkbox" checked={reducedMotion} onChange={event => setReducedMotion(event.target.checked)} /> Reduce motion</label>
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
        <li><strong>WASD / arrows</strong>: walk · <strong>E / Space</strong>: act nearby · <strong>1–9, 0</strong>: act on that table · <strong>C</strong>: pick up · <strong>X</strong>: clear tasks.</li>
        <li><strong>Tap a tired staff Friend</strong> (zzz bubble) or press <strong>T</strong> to send them to the break room for 15–30 s.</li>
        <li><strong>Build (B)</strong>: tap tiles to place tables and décor. <strong>Move</strong>: tap an item, then a tile. <strong>Sell</strong>: 50% back. <strong>R</strong> rotates a chair; arrows + Enter work too; <strong>Esc</strong> finishes.</li>
      </ul>
      <p>Tasks queue up (numbered markers), so you can tap several guests in a row. Guests leave unhappy if their patience bar runs out. A day lasts {Math.round(DAY_LENGTH / 60 * 10) / 10} minutes; the shop pauses while a menu or build mode is open.</p>
      <button type="button" onClick={closeMenu}>Back to the shop</button>
    </GameMenu>}
  </section>;
}
