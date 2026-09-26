/** End-of-day share card (1200 × 675, X's 16:9 image size) and post text. */
import { FAMILY_NAMES, shopById } from "./data.ts";
import type { CafeState } from "./engine.ts";

export const PLAY_URL = "https://m4s4t0-v01d.github.io/rarefriends-cafe/";
export const SHARE_TAGS = "@RareFriendsNFT #RareFriends #RareFriendsCafe";
const stars = (rating: number) => "★★★★★".slice(0, Math.round(rating)) + "☆☆☆☆☆".slice(0, 5 - Math.round(rating));

/** Post text: at most 280 characters, counting the link as X's 23. */
export function shareText(state: CafeState, friendId: bigint, familyId: number): string {
  const shop = shopById(state.shop), day = state.today;
  const lines = [
    `Day ${state.day} at ${shop.name} ☕ served ${day.served} guest${day.served === 1 ? "" : "s"}, earned ${day.beans} Beans, ${stars(state.rating)} ${state.rating.toFixed(1)}.`,
    `My Rare Friend #${friendId} (${FAMILY_NAMES[familyId] ?? "Friend"}) runs the shop!`,
    `Play: ${PLAY_URL}`,
    SHARE_TAGS,
  ];
  return lines.join("\n");
}
/** X counts every link as 23 characters. */
export const postLength = (text: string) => text.replace(/https?:\/\/\S+/g, "x".repeat(23)).length;

const INK = "#161616", PAPER = "#efede7", MUTED = "#6d6b67";

/** Draw the card: a snapshot of the shop on the left, the day's numbers and the manager on the right. */
export function renderDayCard(options: {
  state: CafeState; friendId: bigint; familyId: number; scene: CanvasImageSource | null; portrait: readonly string[] | null;
}): HTMLCanvasElement {
  const { state, friendId, familyId, scene, portrait } = options, shop = shopById(state.shop), day = state.today;
  const canvas = document.createElement("canvas");
  canvas.width = 1200; canvas.height = 675;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = PAPER; ctx.fillRect(0, 0, 1200, 675);
  ctx.fillStyle = "rgba(22,22,22,.05)";
  for (let y = 6; y < 675; y += 14) for (let x = (y / 14) % 2 ? 12 : 5; x < 1200; x += 14) ctx.fillRect(x, y, 2, 2);

  // Shop snapshot in a framed "photo".
  ctx.save(); ctx.translate(40, 40);
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 700, 520); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.strokeRect(0, 0, 700, 520);
  ctx.fillStyle = INK; ctx.fillRect(10, 530, 700, 6); ctx.fillRect(710, 10, 6, 526);
  if (scene) { ctx.save(); ctx.beginPath(); ctx.rect(14, 14, 672, 448); ctx.clip(); ctx.filter = "grayscale(.25) contrast(1.02)"; ctx.drawImage(scene, 14, 14, 672, 448); ctx.restore(); }
  ctx.strokeRect(14, 14, 672, 448);
  ctx.fillStyle = INK; ctx.font = "bold 22px ui-monospace, Menlo, monospace"; ctx.textAlign = "left";
  ctx.fillText(`${shop.name.toUpperCase()} · DAY ${state.day}`, 20, 500);
  ctx.restore();

  // Stats column.
  const x = 790;
  ctx.textAlign = "left"; ctx.fillStyle = INK;
  ctx.font = "bold 30px ui-monospace, Menlo, monospace"; ctx.fillText("DAY REPORT", x, 80);
  ctx.fillStyle = shop.accent; ctx.fillRect(x, 94, 370, 8);
  ctx.fillStyle = MUTED; ctx.font = "18px ui-monospace, Menlo, monospace"; ctx.fillText(shop.kind, x, 132);
  const rows: [string, string][] = [
    ["Guests served", String(day.served)], ["Left unhappy", String(day.lost)], ["Beans earned", `☕ ${day.beans}`],
    ["Tips", `☕ ${day.tips}`], ["Biggest bill", `☕ ${day.best}`], ["Rating", `${stars(state.rating)} ${state.rating.toFixed(1)}`],
    ["Shop level", String(state.level)],
  ];
  rows.forEach(([label, value], index) => {
    const y = 180 + index * 40;
    ctx.fillStyle = INK; ctx.font = "20px ui-monospace, Menlo, monospace"; ctx.textAlign = "left"; ctx.fillText(label, x, y);
    ctx.font = "bold 22px ui-monospace, Menlo, monospace"; ctx.textAlign = "right"; ctx.fillText(value, x + 370, y);
    ctx.strokeStyle = "rgba(22,22,22,.2)"; ctx.setLineDash([4, 4]); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y + 12); ctx.lineTo(x + 370, y + 12); ctx.stroke(); ctx.setLineDash([]);
  });

  // Manager portrait: canonical one-bit frame, black with a white halo.
  const py = 470;
  ctx.fillStyle = "#d8b6b4"; ctx.fillRect(x, py, 96, 96); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.strokeRect(x, py, 96, 96);
  if (portrait) {
    const s = 5, ox = x + 8, oy = py + 8;
    ctx.fillStyle = "#fff"; portrait.forEach((row, ry) => [...row].forEach((pixel, rx) => { if (pixel === "#") ctx.fillRect(ox + rx * s - s, oy + ry * s - s, s * 3, s * 3); }));
    ctx.fillStyle = INK; portrait.forEach((row, ry) => [...row].forEach((pixel, rx) => { if (pixel === "#") ctx.fillRect(ox + rx * s, oy + ry * s, s, s); }));
  }
  ctx.textAlign = "left"; ctx.fillStyle = INK; ctx.font = "bold 22px ui-monospace, Menlo, monospace"; ctx.fillText(`Manager #${friendId}`, x + 112, py + 38);
  ctx.fillStyle = MUTED; ctx.font = "18px ui-monospace, Menlo, monospace"; ctx.fillText(`${FAMILY_NAMES[familyId] ?? "Friend"} · ${state.staff.length} staff`, x + 112, py + 68);

  // Footer.
  ctx.fillStyle = INK; ctx.fillRect(0, 615, 1200, 60);
  ctx.fillStyle = PAPER; ctx.font = "bold 22px ui-monospace, Menlo, monospace"; ctx.textAlign = "left"; ctx.fillText("☕ RareFriends Cafe", 40, 653);
  ctx.textAlign = "right"; ctx.font = "20px ui-monospace, Menlo, monospace"; ctx.fillText(SHARE_TAGS, 1160, 653);
  return canvas;
}
