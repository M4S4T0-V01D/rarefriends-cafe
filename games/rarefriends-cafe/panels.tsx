"use client";

import { useEffect, useRef } from "react";
import {
  CATALOG, FAMILY_NAMES, FLOORS, MAX_STAFF_SLOTS, SHOPS, STAFF_ROLES, WALLPAPERS, WORKER_LEVEL_XP, catalogItem, tableLimit, tierOf, workerLevel,
  type DishShape, type Finish, type ItemKind, type ShopId,
} from "./data.ts";
import { generationOf, purchaseCost, purchaseLevel, staffAt, staffPower, tableCount, type CafeState, type StaffRole, type StaffWho } from "./engine.ts";
import type { GuestArt } from "./guests.ts";
import { drawShape, INK } from "./render.ts";

/** A small canvas showing a 16 × 16 one-bit Friend frame in the canonical black-with-white-halo style. */
export function SpriteChip({ rows, size = 36, label }: { rows: readonly string[] | null; size?: number; label: string }) {
  const node = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = node.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, 54, 54);
    if (!rows) return;
    ctx.fillStyle = "#fff";
    rows.forEach((row, y) => [...row].forEach((pixel, x) => { if (pixel === "#") ctx.fillRect(x * 3, y * 3, 9, 9); }));
    ctx.fillStyle = INK;
    rows.forEach((row, y) => [...row].forEach((pixel, x) => { if (pixel === "#") ctx.fillRect(x * 3 + 3, y * 3 + 3, 3, 3); }));
  }, [rows]);
  return <canvas ref={node} className="cafe-chip" width={54} height={54} style={{ width: size, height: size }} role="img" aria-label={label} />;
}

function DishPreview({ shapes }: { shapes: readonly (readonly [DishShape, string, string])[] }) {
  const node = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = node.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, 120, 40);
    shapes.forEach(([shape, color, accent], index) => drawShape(ctx, shape, color, accent, 22 + index * 38, 24, 1.3));
  }, [shapes]);
  return <canvas ref={node} className="cafe-dishes" width={120} height={40} aria-hidden="true" />;
}

export function ShopPicker({ value, onChange }: { value: ShopId; onChange: (id: ShopId) => void }) {
  return <div className="cafe-shops" role="radiogroup" aria-label="Choose your shop">
    {SHOPS.map(shop => <button type="button" role="radio" key={shop.id} aria-checked={value === shop.id} onClick={() => onChange(shop.id)}
      style={{ ["--shop" as string]: shop.accent }}>
      <DishPreview shapes={[shop.menu[1], shop.menu[3], shop.menu[5]].map(dish => [dish.shape, dish.color, dish.accent] as const)} />
      <strong>{shop.name}</strong><small>{shop.kind}</small>
    </button>)}
  </div>;
}

export type StaffCandidate = { who: StaffWho; label: string; detail: string; rows: readonly string[] | null };
export function staffCandidates(state: CafeState, guests: readonly GuestArt[], ownedRows: (id: number) => readonly string[] | null, ownedFamily: (id: number) => number | null): StaffCandidate[] {
  return [
    // Your own Friends first, best generation (Gen 1) at the top.
    ...[...state.ownedFriends].sort((a, b) => (state.generations[a] ?? 99) - (state.generations[b] ?? 99)).map(id => {
      const family = ownedFamily(id), tier = tierOf(state.generations[id] ?? null);
      return { who: { owned: id }, label: `Your Friend #${id}`, detail: `${state.generations[id] ? tier.name : "Owned"} · ${family === null ? "loading art…" : FAMILY_NAMES[family]} · power ×${tier.power.toFixed(2)}`, rows: ownedRows(id) };
    }),
    ...state.applicants.map(index => ({ who: { guest: index }, label: `${guests[index].name} (guest Friend)`, detail: `${guests[index].family} · guest applicant · power ×1.00`, rows: guests[index].frames[0] })),
  ];
}
const sameWho = (a: StaffWho, b: StaffWho) => ("owned" in a && "owned" in b && a.owned === b.owned) || ("guest" in a && "guest" in b && a.guest === b.guest);

export function StaffPanel({ state, candidates, picking, onPick, onAssign, onRole, onUnlock, onBreak, paused }: {
  state: CafeState; candidates: StaffCandidate[]; picking: number | null; paused: boolean;
  onPick: (slot: number | null) => void; onAssign: (slot: number, who: StaffWho | null) => void; onRole: (slot: number, role: StaffRole) => void;
  onUnlock: () => void; onBreak: (workerId: number) => void;
}) {
  const cost = purchaseCost(state, "slot"), level = purchaseLevel(state, "slot");
  const describe = (who: StaffWho) => candidates.find(candidate => sameWho(candidate.who, who));
  return <>
    <p className="cafe-note">{state.ownedFriends.length ? `${state.ownedFriends.length} more of your Friends can work here. Gen 1 is the top tier, Gen 6 the lowest.` : "Only your manager Friend was found in this wallet, so guest Friends are applying."} Workers level up as they work and get tired: send them to the break room when their energy runs low.</p>
    {Array.from({ length: state.staffSlots }, (_, slot) => {
      const member = staffAt(state, slot), info = member ? describe(member.who) : null;
      return <div className="cafe-slot" key={slot}>
        <div className="cafe-row">
          <SpriteChip rows={info?.rows ?? null} label={info?.label ?? "Empty slot"} />
          <span><strong>{info?.label ?? `Slot ${slot + 1} · empty`}</strong><small>{member ? `${tierOf(generationOf(state, member.who)).name} · Lv ${workerLevel(member.xp)} · power ×${staffPower(state, member).toFixed(2)}` : "Choose a Friend for this slot."}</small>
            {member && <span className="cafe-meters">
              <i title="Worker XP" style={{ ["--fill" as string]: `${xpFraction(member.xp) * 100}%` }} className="cafe-meter-xp" />
              <i title="Energy" style={{ ["--fill" as string]: `${100 - member.fatigue}%` }} className={member.fatigue >= 70 ? "cafe-meter-energy cafe-meter-low" : "cafe-meter-energy"} />
            </span>}</span>
          <button type="button" disabled={paused} aria-expanded={picking === slot} onClick={() => onPick(picking === slot ? null : slot)}>{member ? "Change" : "Choose"}</button>
        </div>
        {member && <div className="cafe-roles" role="radiogroup" aria-label={`Role for slot ${slot + 1}`}>
          {STAFF_ROLES.map(role => <button type="button" role="radio" key={role.id} aria-checked={member.role === role.id} title={role.text} disabled={paused} onClick={() => onRole(slot, role.id)}>{role.name}</button>)}
          {(() => { const worker = state.workers.find(item => item.slot === slot); return worker && <button type="button" disabled={paused || worker.duty !== "work" || member.fatigue < 20} onClick={() => onBreak(worker.id)}>{worker.duty !== "work" ? "On break" : `Break · ${Math.round(100 - member.fatigue)}%`}</button>; })()}
          <button type="button" disabled={paused} onClick={() => onAssign(slot, null)}>Dismiss</button>
        </div>}
        {picking === slot && <div className="cafe-candidates">
          {candidates.map(candidate => {
            const elsewhere = state.staff.find(other => sameWho(other.who, candidate.who) && other.slot !== slot);
            return <button type="button" key={"owned" in candidate.who ? `o${candidate.who.owned}` : `g${candidate.who.guest}`} disabled={paused} onClick={() => onAssign(slot, candidate.who)}>
              <SpriteChip rows={candidate.rows} size={28} label="" /><span><strong>{candidate.label}</strong><small>{elsewhere ? `Moves from slot ${elsewhere.slot + 1}` : candidate.detail}</small></span>
            </button>;
          })}
        </div>}
      </div>;
    })}
    {state.staffSlots < MAX_STAFF_SLOTS && cost !== null && <div className="cafe-row">
      <span><strong>Staff slot {state.staffSlots + 1}</strong><small>{state.staffSlots}/{MAX_STAFF_SLOTS} slots. Earn and level up to grow your team.</small></span>
      <button type="button" disabled={paused || state.level < level || state.beans < cost} onClick={onUnlock}>{state.level < level ? `Lv ${level}` : `☕ ${cost}`}</button>
    </div>}
  </>;
}

function xpFraction(xp: number) {
  const level = workerLevel(xp), from = level > 1 ? WORKER_LEVEL_XP[level - 2] : 0, to = WORKER_LEVEL_XP[level - 1];
  return to === undefined ? 1 : (xp - from) / (to - from);
}

export type BuildTool = { tab: "items" | "walls" | "floors"; mode: "place" | "move" | "sell"; kind: ItemKind; dir: 0 | 1 };
export function BuildBar({ state, tool, onTool, onFinish, onDone, message }: {
  state: CafeState; tool: BuildTool; onTool: (tool: BuildTool) => void; onFinish: (surface: "wallpaper" | "floor", id: string) => void; onDone: () => void; message: string;
}) {
  const finishes = (surface: "wallpaper" | "floor", list: readonly Finish[]) => list.map(finish => {
    const owned = state.finishes.has(finish.id), active = state[surface] === finish.id;
    return <button type="button" key={finish.id} aria-pressed={active} onClick={() => onFinish(surface, finish.id)} disabled={!owned && state.beans < finish.cost}>
      <i className="cafe-swatch" style={{ background: `linear-gradient(135deg, ${finish.colors[0]} 50%, ${finish.colors[1]} 50%)` }} />
      <span>{finish.name}<small>{active ? "In use" : owned ? "Owned" : `☕ ${finish.cost}`}{finish.ambience ? ` · +${finish.ambience}` : ""}</small></span>
    </button>;
  });
  return <div className="cafe-build" role="toolbar" aria-label="Build mode">
    <div className="cafe-build-head">
      <div className="cafe-tabs" role="tablist" aria-label="Build categories">
        {(["items", "walls", "floors"] as const).map(tab => <button type="button" role="tab" key={tab} aria-selected={tool.tab === tab} onClick={() => onTool({ ...tool, tab })}>{tab === "items" ? "Furniture" : tab === "walls" ? "Wallpaper" : "Floor"}</button>)}
      </div>
      <span className="cafe-build-status" role="status">{message || `☕ ${state.beans} · tables ${tableCount(state)}/${tableLimit(state.level)}`}</span>
      <button type="button" className="rf-frame-primary" onClick={onDone}>Done</button>
    </div>
    <div className="cafe-build-row">
      {tool.tab === "items" ? <>
        {(["move", "sell"] as const).map(mode => <button type="button" key={mode} aria-pressed={tool.mode === mode} onClick={() => onTool({ ...tool, mode })}>
          <span>{mode === "move" ? "✥ Move" : "✕ Sell"}<small>{mode === "move" ? "tap item, then tile" : "50% refund"}</small></span></button>)}
        <button type="button" onClick={() => onTool({ ...tool, dir: tool.dir ? 0 : 1 })} aria-label={`Rotate chair (R), now facing ${tool.dir ? "left" : "right"}`}><span>⟲ Rotate<small>R</small></span></button>
        {CATALOG.map(item => <button type="button" key={item.kind} aria-pressed={tool.mode === "place" && tool.kind === item.kind} disabled={state.beans < item.cost}
          onClick={() => onTool({ ...tool, mode: "place", kind: item.kind })}><span>{item.name}<small>☕ {item.cost}{item.ambience ? ` · +${item.ambience}` : ""}</small></span></button>)}
      </> : tool.tab === "walls" ? finishes("wallpaper", WALLPAPERS) : finishes("floor", FLOORS)}
    </div>
  </div>;
}
export const toolLabel = (tool: BuildTool) => tool.mode === "place" ? `Placing ${catalogItem(tool.kind).name}` : tool.mode === "move" ? "Move" : "Sell";
