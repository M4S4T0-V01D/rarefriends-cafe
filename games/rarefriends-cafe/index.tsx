"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { GameComponentProps } from "@rarefriends/friendsdk/runtime";
import { GameMenu } from "@rarefriends/friendsdk/frame";
import { formatGameAmount } from "@rarefriends/friendsdk/ui";
import { expectedReward, maximumPrize, type GamePlay, type GameSnapshot } from "@rarefriends/friendsdk/game";
import { createFriendReader, type GenerationSprites } from "@rarefriends/friendsdk/sprites";
import { createFriendSoundKit, type FriendSoundCue, type FriendSoundKit } from "@rarefriends/friendsdk/sounds";
import {
  BLEND_BONUSES, DAY_LENGTH, DECOR_NAMES, DISHES, FAMILY_NAMES, FAMILY_PERKS, LEVEL_XP, MAX_LEVEL, MAX_TABLES, type DishId,
} from "./data.ts";
import {
  actOnCounter, actOnCustomer, actOnTable, availableDishes, buy, carryCapacity, clearQueue, createCafe, dayProgress, interactNearby,
  isClosing, kitchenSlots, manager, openCafe, purchaseCost, purchaseLevel, setBlends, setManual, unlockDish, update, waiters,
  walkTo, type CafeState, type Purchase,
} from "./engine.ts";
import { createGuests } from "./guests.ts";
import { REGULAR_SPRITES } from "./regulars.ts";
import { VIEW, hitTest, renderScene, type Floater } from "./render.ts";
import type { Tile } from "./layout.ts";
import "@rarefriends/friendsdk/frame.css";
import "./style.css";

const GUESTS = createGuests(18);
const rf = (value: bigint) => `${formatGameAmount(value, 18)} RF`;
const DIRECTIONS: Record<string, { dx: number; dy: number }> = {
  w: { dx: 0, dy: -1 }, arrowup: { dx: 0, dy: -1 }, s: { dx: 0, dy: 1 }, arrowdown: { dx: 0, dy: 1 },
  a: { dx: -1, dy: 0 }, arrowleft: { dx: -1, dy: 0 }, d: { dx: 1, dy: 0 }, arrowright: { dx: 1, dy: 0 },
};
type Menu = "upgrades" | "capsules" | "settings" | "help" | null;
type Tab = "menu" | "furniture" | "staff";
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

/** RareFriends Cafe. The SDK runtime supplies wallet connection, the verified owned Friend and the fixed (simulated) RF client. */
export default function RareFriendsCafe({ friendId, client, paused }: GameComponentProps) {
  const canvas = useRef<HTMLCanvasElement>(null), portrait = useRef<HTMLCanvasElement>(null);
  const cafe = useRef<CafeState | null>(null), friend = useRef<GenerationSprites | null>(null);
  const floaters = useRef<Floater[]>([]), hover = useRef<Tile | null>(null), sound = useRef<FriendSoundKit | null>(null);
  const epoch = useRef(0), locked = useRef(false);
  const [status, setStatus] = useState("Brewing the café and loading your Friend…"), [failed, setFailed] = useState(false), [revision, setRevision] = useState(0);
  const [hud, setHud] = useState<Hud | null>(null), [menu, setMenu] = useState<Menu>(null), [tab, setTab] = useState<Tab>("menu");
  const [toast, setToast] = useState(""), [muted, setMuted] = useState(true), [reducedMotion, setReducedMotion] = useState(false);
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [reveal, setReveal] = useState<GamePlay | null>(null), [, setTick] = useState(0);
  const live = useRef({ paused, menu, reducedMotion, reveal }); live.current = { paused, menu, reducedMotion, reveal };
  const definition = client.definition;

  const say = useCallback((text: string) => { if (text) setToast(text); }, []);
  const cue = useCallback((name: FriendSoundCue) => { sound.current?.play(name); }, []);
  const syncBlends = useCallback((value: GameSnapshot) => {
    if (cafe.current) setBlends(cafe.current, value.inventory.map(amount => Number(amount > 99n ? 99n : amount)));
  }, []);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReducedMotion(preference.matches); change(); preference.addEventListener("change", change);
    return () => preference.removeEventListener("change", change);
  }, []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(""), 3200); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { if ((paused || menu) && cafe.current) setManual(cafe.current, null); }, [paused, menu]);

  // Load the verified Friend's canonical artwork and the runtime session, then run the café loop.
  useEffect(() => {
    const version = ++epoch.current;
    const node = canvas.current, ctx = node?.getContext("2d");
    sound.current = createFriendSoundKit({ muted: true }); setMuted(true);
    cafe.current = null; friend.current = null; floaters.current = []; locked.current = false;
    setHud(null); setMenu(null); setSnapshot(null); setReveal(null); setError(""); setBusy(false); setFailed(false);
    setStatus("Brewing the café and loading your Friend…");
    if (!node || !ctx) { setFailed(true); setStatus("This browser cannot draw the café."); return; }
    let frame = 0, previous = 0, lastHud = 0, pixelScale = 1;
    const resize = () => {
      const rect = node.getBoundingClientRect(), ratio = Math.min(window.devicePixelRatio || 1, 2.5);
      node.width = Math.max(1, Math.round(rect.width * ratio)); node.height = Math.max(1, Math.round(rect.height * ratio));
      pixelScale = node.width / VIEW.width;
    };
    const observer = new ResizeObserver(resize); observer.observe(node); resize();
    const stop = () => { if (cafe.current) setManual(cafe.current, null); };
    window.addEventListener("blur", stop); document.addEventListener("visibilitychange", stop);
    void Promise.all([createFriendReader().read(friendId), client.read()]).then(([sprites, value]) => {
      if (version !== epoch.current) return;
      if (value.friendId !== friendId) throw new Error("This game session does not match the selected Friend.");
      friend.current = sprites;
      const regulars = REGULAR_SPRITES.filter(item => item.tokenId !== friendId);
      cafe.current = createCafe({ familyId: sprites.familyId, guestCount: GUESTS.length, regulars: regulars.map(item => Number(item.tokenId)) });
      setSnapshot(value); syncBlends(value); setHud(readHud(cafe.current)); setStatus("");
      const regularMap = new Map(regulars.map(item => [Number(item.tokenId), item]));
      const render = (now: number) => {
        const state = cafe.current!, dt = previous ? Math.min((now - previous) / 1000, 0.1) : 0; previous = now;
        const running = !live.current.paused && !live.current.menu && !live.current.reveal && !document.hidden;
        if (running) update(state, dt);
        for (const event of state.events.splice(0)) {
          if (event.kind === "coins") {
            floaters.current.push({ text: `+${event.amount} ☕${event.vip ? " VIP" : event.double ? " ×2" : ""}`, x: event.x, y: event.y, age: 0, tone: event.vip ? "vip" : "coin" });
            sound.current?.play("reward");
          } else if (event.kind === "angry") {
            floaters.current.push({ text: "left unhappy", x: event.x, y: event.y, age: 0, tone: "angry" }); sound.current?.play("impact");
          } else if (event.kind === "ready") sound.current?.play("action-ready");
          else if (event.kind === "order") sound.current?.play("action-start");
          else if (event.kind === "levelup") { setToast(`Café level ${event.level}! New upgrades and dishes are available.`); sound.current?.play("reveal-rare"); }
          else if (event.kind === "dayEnd") sound.current?.play("reveal-common");
        }
        if (running) for (const floater of floaters.current) floater.age += dt;
        floaters.current = floaters.current.filter(floater => floater.age < 1.6);
        renderScene(ctx, { state, now, reducedMotion: live.current.reducedMotion, guests: GUESTS, regulars: regularMap, friend: sprites,
          floaters: floaters.current, hover: hover.current }, pixelScale);
        if (now - lastHud > 150) { lastHud = now; setHud(readHud(state)); }
        frame = requestAnimationFrame(render);
      };
      frame = requestAnimationFrame(render);
    }).catch(cause => {
      if (version !== epoch.current) return;
      setFailed(true);
      setStatus(cause instanceof Error && cause.message.includes("does not match") ? cause.message : "Your Friend's artwork or the café session could not load. Check your connection and retry.");
    });
    return () => {
      epoch.current++; cancelAnimationFrame(frame); observer.disconnect(); stop();
      window.removeEventListener("blur", stop); document.removeEventListener("visibilitychange", stop);
      sound.current?.dispose(); sound.current = null;
    };
  }, [friendId, client, revision, syncBlends]);

  // HUD portrait: the verified Friend's canonical idle frame, the café's star.
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

  const blocked = paused || menu !== null || reveal !== null || !hud || hud.phase !== "open";
  const refresh = () => setTick(value => value + 1);

  function pointerToView(event: { clientX: number; clientY: number }) {
    const rect = canvas.current!.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * VIEW.width / rect.width, y: (event.clientY - rect.top) * VIEW.height / rect.height };
  }
  function tap(event: React.PointerEvent<HTMLCanvasElement>) {
    const state = cafe.current;
    if (!state || blocked) return;
    event.preventDefault(); event.currentTarget.focus({ preventScroll: true }); setManual(state, null);
    const point = pointerToView(event), hit = hitTest(state, point.x, point.y);
    if (!hit) return;
    if (hit.kind === "capsule") { openMenu("capsules"); return; }
    let feedback = "";
    if (hit.kind === "customer") feedback = actOnCustomer(state, hit.id);
    else if (hit.kind === "counter") feedback = actOnCounter(state);
    else if (!walkTo(state, hit.tile)) feedback = "Can't walk there.";
    if (feedback) { say(feedback); cue("select"); }
    setHud(readHud(state));
  }
  function keyDown(event: ReactKeyboardEvent<HTMLElement>) {
    const state = cafe.current;
    if (!state || blocked || event.target !== canvas.current) return;
    const key = event.key.toLowerCase();
    if (DIRECTIONS[key]) { event.preventDefault(); setManual(state, DIRECTIONS[key]); return; }
    if (event.repeat) return;
    if (/^[1-8]$/.test(key)) { event.preventDefault(); say(actOnTable(state, Number(key) - 1)); cue("select"); }
    else if (key === "c") { event.preventDefault(); say(actOnCounter(state)); cue("select"); }
    else if (key === "x") { event.preventDefault(); clearQueue(state); say("Task list cleared."); }
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
  function openMenu(next: Menu) { if (!paused && !busy) { setMenu(next); setError(""); } }
  function closeMenu() { if (busy) return; setMenu(null); requestAnimationFrame(() => canvas.current?.focus({ preventScroll: true })); }
  function startDay() {
    const state = cafe.current;
    if (!state || paused) return;
    void sound.current?.unlock(); openCafe(state); setHud(readHud(state)); cue("action-ready");
    requestAnimationFrame(() => canvas.current?.focus({ preventScroll: true }));
  }
  function purchase(item: Purchase) {
    const state = cafe.current;
    if (!state || paused) return;
    const problem = buy(state, item);
    if (problem) setError(problem); else { setError(""); cue("purchase"); say(item === "table" ? "A new table is ready for guests." : item === "waiter" ? "A helper Friend joined your staff." : item === "chef" ? "A chef Friend joined the kitchen." : "Upgrade installed."); }
    setHud(readHud(state)); refresh();
  }
  function unlock(id: DishId) {
    const state = cafe.current;
    if (!state || paused) return;
    const problem = unlockDish(state, id);
    if (problem) setError(problem); else { setError(""); cue("purchase"); }
    setHud(readHud(state)); refresh();
  }

  // ---------- Rare Blend Capsules: the SDK's simulated RF chance-game actions ----------
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
  const pending = snapshot?.plays.find(play => play.outcomeId === null);
  const canBuyCapsule = Boolean(snapshot && snapshot.rfBalance >= definition.price && snapshot.freeStake >= maxPrize && snapshot.freeStake + definition.price >= maxPrize);
  const openCapsule = () => act(async () => {
    const version = epoch.current;
    const play = pending ?? (await client.play(1n))[0];
    const settled = await client.settle(play.id);
    if (version === epoch.current && settled.outcomeId !== null) {
      setReveal(settled);
      cue(settled.outcomeId >= 4 ? "reveal-legendary" : settled.outcomeId >= 2 ? "reveal-rare" : "reveal-common");
    }
  });
  const revealed = reveal?.outcomeId ? definition.outcomes[reveal.outcomeId - 1] : null;

  const state = cafe.current;
  const familyName = friend.current ? FAMILY_NAMES[friend.current.familyId] : "";
  const familyPerk = friend.current ? FAMILY_PERKS[friend.current.familyId] : null;
  const nextXp = hud && hud.level < MAX_LEVEL ? LEVEL_XP[hud.level - 1] : null;
  const prevXp = hud && hud.level > 1 ? LEVEL_XP[hud.level - 2] : 0;
  const blendCount = snapshot?.inventory.reduce((sum, amount) => sum + amount, 0n) ?? 0n;
  const clock = hud ? (() => { const minutes = 8 * 60 + Math.floor(hud.progress * 12 * 60); return `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`; })() : "";

  return <section className="cafe-game" aria-label="RareFriends Cafe" aria-busy={busy}
    data-phase={hud?.phase ?? "loading"} data-beans={hud?.beans ?? 0} data-served={hud?.served ?? 0} data-customers={hud?.customers ?? 0}>
    <div className="cafe-world" inert={menu !== null || reveal !== null || paused || undefined}>
      <canvas ref={canvas} tabIndex={blocked ? -1 : 0}
        aria-label="Café floor. Tap a guest to take their order or serve them, tap the counter to pick up dishes, tap the floor to walk. Keys: WASD or arrows walk, E acts nearby, 1 to 8 act on a table, C picks up, X clears tasks."
        onPointerDown={tap}
        onPointerMove={event => { if (event.pointerType !== "mouse" || !cafe.current) return; const point = pointerToView(event), hit = hitTest(cafe.current, point.x, point.y); hover.current = hit?.kind === "tile" ? hit.tile : null; }}
        onPointerLeave={() => { hover.current = null; }}
        onKeyDown={keyDown} onKeyUp={keyUp} onBlur={() => { if (cafe.current) setManual(cafe.current, null); }} />
      {hud && <>
        <div className="cafe-hud">
          <div className="cafe-card">
            <canvas ref={portrait} className="cafe-portrait" width={54} height={54} role="img" aria-label={`Manager: your Friend #${friendId.toString()}, ${familyName}`} />
            <strong className="cafe-title">RareFriends Cafe</strong>
            <span className="cafe-day">Day {hud.day} · {hud.phase === "open" ? hud.closing ? "last orders" : clock : hud.phase === "summary" ? "closed" : "not open yet"}</span>
            <span className="cafe-clock" aria-hidden="true"><i style={{ width: `${hud.progress * 100}%` }} /></span>
            <span className="cafe-stats"><b aria-label={`${hud.beans} Beans`}>☕ {hud.beans}</b><b aria-label={`Rating ${hud.rating.toFixed(1)} of 5`}>{stars(hud.rating)}</b><b>Lv {hud.level}</b></span>
            <span className="cafe-xp" aria-label={nextXp ? `${hud.xp} of ${nextXp} XP` : "Max level"}><i style={{ width: `${nextXp ? Math.min(100, (hud.xp - prevXp) / (nextXp - prevXp) * 100) : 100}%` }} /></span>
          </div>
          <div className="cafe-actions">
            <button type="button" onClick={() => openMenu("upgrades")}>Upgrades</button>
            <button type="button" onClick={() => openMenu("capsules")}>Capsules<span className="cafe-wide"> · RF</span></button>
            <button type="button" onClick={() => openMenu("settings")} aria-label="Settings">⚙</button>
            <button type="button" aria-pressed={!muted} aria-label="Sound" title={muted ? "Sound off" : "Sound on"} onClick={() => { const next = !muted; setMuted(next); sound.current?.setMuted(next); if (!next) void sound.current?.unlock(); }}>{muted ? "♪̸" : "♪"}</button>
          </div>
        </div>
        {hud.phase === "open" && <div className="cafe-footer">
          <p role="status" aria-live="polite">{toast || (hud.queue ? `${hud.queue} task${hud.queue > 1 ? "s" : ""} queued${hud.carrying ? ` · carrying ${hud.carrying}` : ""}` : hud.carrying ? `Carrying ${hud.carrying} dish${hud.carrying > 1 ? "es" : ""}` : "Tap a guest to take an order · tap the counter when a dish is ready")}</p>
          {hud.queue > 0 && <button type="button" onClick={() => { if (cafe.current) { clearQueue(cafe.current); setHud(readHud(cafe.current)); } }}>Clear tasks</button>}
        </div>}
      </>}
    </div>

    {status && <div className="cafe-status" role={failed ? "alert" : "status"}><div className="cafe-steam" aria-hidden="true">☕</div><p>{status}</p>
      {failed && <button type="button" disabled={paused} onClick={() => setRevision(value => value + 1)}>Retry</button>}</div>}

    {hud?.phase === "intro" && !menu && state && <GameMenu title="Welcome to RareFriends Cafe">
      <p>Your Rare Friend <strong>#{friendId.toString()}</strong> ({familyName}) is the café manager today.</p>
      {familyPerk && <p className="cafe-perk"><strong>{familyName} perk · {familyPerk.title}:</strong> {familyPerk.text}</p>}
      <ol className="cafe-steps">
        <li>Guest Friends walk in and sit down. <strong>Tap a guest</strong> (or press their table number) to take the order.</li>
        <li>The kitchen cooks it. When the counter bell rings, <strong>tap the counter</strong> — you pick up and deliver automatically.</li>
        <li>Fast service earns bigger tips in <strong>Beans</strong>. Spend Beans on dishes, tables, décor and helper Friends.</li>
        <li>Visit the <strong>capsule machine</strong> for Rare Blend Capsules (simulated RF) with café bonuses.</li>
      </ol>
      <button type="button" className="rf-frame-primary" disabled={paused} onClick={startDay}>Open the café</button>
      <button type="button" disabled={paused} onClick={() => openMenu("help")}>Controls</button>
    </GameMenu>}

    {hud?.phase === "summary" && !menu && state && <GameMenu title={`Day ${state.day} closed`}>
      <div className="cafe-summary">
        <p><span>Guests served</span><strong>{state.today.served}</strong></p>
        <p><span>Left unhappy</span><strong>{state.today.lost}</strong></p>
        <p><span>Beans earned</span><strong>☕ {state.today.beans}</strong></p>
        <p><span>Of which tips</span><strong>☕ {state.today.tips}</strong></p>
        <p><span>Biggest bill</span><strong>☕ {state.today.best}</strong></p>
        {state.today.vips > 0 && <p><span>Genesis VIPs</span><strong>{state.today.vips}</strong></p>}
        <p><span>Rating</span><strong>{stars(state.rating)} {state.rating.toFixed(1)}</strong></p>
      </div>
      <p>{state.today.lost === 0 && state.today.served > 0 ? "Perfect service — not a single guest left unhappy!" : "Spend your Beans on upgrades before the next day."}</p>
      <button type="button" className="rf-frame-primary" disabled={paused} onClick={startDay}>Open day {state.day + 1}</button>
      <button type="button" disabled={paused} onClick={() => openMenu("upgrades")}>Upgrades</button>
    </GameMenu>}

    {menu === "upgrades" && state && <GameMenu title={`Upgrades · ☕ ${state.beans} Beans`} onClose={closeMenu}>
      <div className="cafe-tabs" role="tablist" aria-label="Upgrade categories">
        {(["menu", "furniture", "staff"] as const).map(name => <button type="button" role="tab" key={name} aria-selected={tab === name} onClick={() => { setTab(name); setError(""); }}>{name === "menu" ? "Menu" : name === "furniture" ? "Café" : "Staff"}</button>)}
      </div>
      {tab === "menu" ? DISHES.map(dish => {
        const on = availableDishes(state).includes(dish.id), special = dish.blend !== undefined;
        return <div className="cafe-row" key={dish.id}>
          <span><strong>{dish.name}</strong><small>{dish.price} Beans · cooks {dish.cook}s{special ? ` · needs a kept ${BLEND_BONUSES[dish.blend!].name}` : dish.level > 1 ? ` · Lv ${dish.level}` : ""}</small></span>
          {on ? <em>On menu</em> : special ? <button type="button" onClick={() => setMenu("capsules")}>Capsules</button>
            : <button type="button" disabled={paused || state.level < dish.level || state.beans < dish.unlockCost} onClick={() => unlock(dish.id)}>{state.level < dish.level ? `Lv ${dish.level}` : `☕ ${dish.unlockCost}`}</button>}
        </div>;
      }) : tab === "furniture" ? <>
        <UpgradeRow state={state} item="table" name={`Table ${Math.min(MAX_TABLES, state.tables + 1)}`} detail={`${state.tables}/${MAX_TABLES} tables. More seats, more guests.`} onBuy={purchase} paused={paused} />
        <UpgradeRow state={state} item="machine" name={`Espresso machine Lv ${state.machine + 1}`} detail={`Dishes cook ${Math.round(state.machine * 12)}% faster now; each level adds 12%.`} onBuy={purchase} paused={paused} />
        <UpgradeRow state={state} item="decor" name={DECOR_NAMES[Math.min(5, state.decor + 1)]} detail={`Ambience ${state.decor}/5 (${DECOR_NAMES[state.decor]}). Raises tips, patience and guest arrivals.`} onBuy={purchase} paused={paused} />
      </> : <>
        <UpgradeRow state={state} item="waiter" name={`Helper Friend ${waiters(state) + 1}`} detail={`${waiters(state)}/2 hired. Helpers take orders and deliver dishes on their own.`} onBuy={purchase} paused={paused} />
        <UpgradeRow state={state} item="chef" name={`Chef Friend ${state.chefs + 1}`} detail={`${kitchenSlots(state)} dish${kitchenSlots(state) > 1 ? "es" : ""} cook at once. Each chef adds one.`} onBuy={purchase} paused={paused} />
        <p className="cafe-note">You carry {carryCapacity(state, manager(state))} dishes at a time. Beans and upgrades are in-café progress for this session and are not RF.</p>
      </>}
      {error && <p role="alert">{error}</p>}
    </GameMenu>}

    {menu === "capsules" && !reveal && <GameMenu title="Rare Blend Capsules" onClose={busy ? undefined : closeMenu}>
      {!snapshot ? <p role="status">Loading capsule machine…</p> : <>
        <p className="cafe-sim">{snapshot.mode === "preview" ? "Simulated RF preview — no real tokens or transactions." : "Live · Robinhood"} · Friend balance <strong>{rf(snapshot.rfBalance)}</strong> · {snapshot.consumables.toString()} capsule{snapshot.consumables === 1n ? "" : "s"}</p>
        <p>One capsule costs <strong>{rf(definition.price)}</strong> and holds one coffee blend. Keep a blend for its café bonus, or redeem it for its fixed RF value.</p>
        <table className="cafe-odds"><thead><tr><th>Blend</th><th>Chance</th><th>Value</th><th>Kept bonus</th></tr></thead>
          <tbody>{definition.outcomes.map((item, index) => <tr key={item.name}><td>{item.name}</td><td>{item.chanceBps / 100}%</td><td>{rf(item.reward)}</td><td>{BLEND_BONUSES[index]?.text}</td></tr>)}</tbody></table>
        <p className="cafe-note">Expected value {rf(expectedReward(definition))} per capsule. Every purchased capsule reserves {rf(maxPrize)} of backing; kept blends keep their RF value with no expiry.</p>
        <div className="cafe-buttons">
          <button type="button" className="rf-frame-primary" disabled={!canBuyCapsule || busy || paused} onClick={() => void act(() => client.buy(1n), () => { cue("purchase"); say("One capsule added to your Friend."); })}>Buy capsule · {rf(definition.price)}</button>
          <button type="button" disabled={busy || paused || (!pending && snapshot.consumables === 0n)} onClick={() => void openCapsule()}>{pending ? "Finish opening" : "Open a capsule"}</button>
        </div>
        {!canBuyCapsule && <p>{snapshot.rfBalance < definition.price ? "Not enough simulated RF in your Friend's wallet." : "New capsules are paused until the machine has enough free backing."}</p>}
        <h3>Kept blends · {blendCount.toString()}</h3>
        {definition.outcomes.map((item, index) => <div className="cafe-row" key={item.name}>
          <span><strong>{item.name} × {snapshot.inventory[index].toString()}</strong><small>{BLEND_BONUSES[index]?.text}{snapshot.inventory[index] > 0n ? " · active" : ""}</small></span>
          <button type="button" disabled={busy || paused || snapshot.inventory[index] === 0n || item.reward === 0n} onClick={() => void act(() => client.redeem(index + 1, 1n), () => { cue("reward"); say(`Redeemed one ${item.name} for ${rf(item.reward)}.`); })}>Redeem · {rf(item.reward)}</button>
        </div>)}
      </>}
      {busy && <p role="status">Waiting for confirmation…</p>}
      {error && <p role="alert">{error}</p>}
    </GameMenu>}

    {reveal && revealed && <GameMenu title="Capsule opened">
      <div className={`cafe-reveal cafe-reveal-${reveal.outcomeId}`}>
        <div className="cafe-capsule" aria-hidden="true"><span /></div>
        <h3>{revealed.name}</h3>
        <p>{revealed.chanceBps / 100}% chance · worth {rf(revealed.reward)} (simulated)</p>
        <p><strong>Kept bonus:</strong> {BLEND_BONUSES[reveal.outcomeId! - 1]?.text}</p>
      </div>
      <div className="cafe-buttons">
        <button type="button" className="rf-frame-primary" disabled={busy || paused} onClick={() => { setReveal(null); say(`${revealed.name} is now brewing bonuses in your café.`); }}>Keep blend</button>
        <button type="button" disabled={busy || paused} onClick={() => void act(() => client.redeem(reveal.outcomeId!, 1n), () => { setReveal(null); cue("reward"); say(`Redeemed for ${rf(revealed.reward)}.`); })}>Redeem · {rf(revealed.reward)}</button>
      </div>
      {error && <p role="alert">{error}</p>}
    </GameMenu>}

    {menu === "settings" && <GameMenu title="Settings" onClose={closeMenu}>
      <button type="button" aria-pressed={!muted} onClick={() => { const next = !muted; setMuted(next); sound.current?.setMuted(next); if (!next) void sound.current?.unlock(); }}>{muted ? "Sound off" : "Sound on"}</button>
      <label className="cafe-check"><input type="checkbox" checked={reducedMotion} onChange={event => setReducedMotion(event.target.checked)} /> Reduce motion</label>
      {familyPerk && <p className="cafe-perk"><strong>Manager #{friendId.toString()} · {familyName}</strong><br />{familyPerk.title}: {familyPerk.text}</p>}
      <p>Switch to another owned Friend with the runtime's Friend controls; each Friend manages the café with their own family perk.</p>
      <p>Beans, upgrades and café level last for this session. Capsule RF balances and outcomes are simulated by the SDK preview. Wallet connection and ownership checks are provided by FriendSDK.</p>
      <button type="button" onClick={() => setMenu("help")}>Controls</button>
    </GameMenu>}

    {menu === "help" && <GameMenu title="Controls" onClose={closeMenu}>
      <ul className="cafe-steps">
        <li><strong>Tap / click</strong> a guest: take their order, or fetch and serve their dish.</li>
        <li><strong>Tap the counter</strong>: pick up every ready dish; you deliver them automatically.</li>
        <li><strong>Tap the floor</strong>: walk. Tap the capsule machine for Rare Blend Capsules.</li>
        <li><strong>WASD / arrows</strong>: walk tile by tile · <strong>E / Space</strong>: act on what's next to you.</li>
        <li><strong>1–8</strong>: act on that table · <strong>C</strong>: pick up · <strong>X</strong>: clear your task list · <strong>Esc</strong>: close menus.</li>
      </ul>
      <p>Tasks queue up (numbered markers), so you can tap several guests in a row. Guests leave unhappy if their patience bar runs out. A day lasts {Math.round(DAY_LENGTH / 60 * 10) / 10} minutes; the café pauses while any menu is open.</p>
      <button type="button" onClick={closeMenu}>Back to the café</button>
    </GameMenu>}
  </section>;
}

function UpgradeRow({ state, item, name, detail, onBuy, paused }: { state: CafeState; item: Purchase; name: string; detail: string; onBuy: (item: Purchase) => void; paused: boolean }) {
  const cost = purchaseCost(state, item), level = purchaseLevel(state, item);
  return <div className="cafe-row">
    <span><strong>{cost === null ? name.replace(/\d+$/, "").trim() : name}</strong><small>{detail}</small></span>
    {cost === null ? <em>Maxed</em> : <button type="button" disabled={paused || state.level < level || state.beans < cost} onClick={() => onBuy(item)}>{state.level < level ? `Lv ${level}` : `☕ ${cost}`}</button>}
  </div>;
}
