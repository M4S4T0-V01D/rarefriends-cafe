/**
 * Pixel-art interface icons in the café's palette: 12 × 12 sprites (the loading cup is 16 × 16), drawn once to a
 * canvas and cached as data URLs, then shown as crisp pixelated images. Ink-only icons ("mono") flip to light ink in
 * dark mode through CSS.
 */

const PALETTE: Record<string, string> = {
  K: "#161616", W: "#ffffff", B: "#7a5238", b: "#b8875e", G: "#b8962e", g: "#ecc967", R: "#d8b6b4", r: "#b07c7a",
  S: "#b4c3ab", s: "#7d9670", U: "#afbccb", u: "#7f8ea3", Y: "#e2d7ad", O: "#8f8a82", o: "#d9d6cf",
};
const STAR = [
  ".....KK.....", "....KggK....", "....KggK....", "...KgggGK...", "KKKKgggGKKKK", "KggggggggGGK",
  ".KgggggggGK.", "..KggggggK..", "..KgggGggK..", ".KggGKKGggK.", ".KgGK..KGgK.", ".KKK....KKK.",
];
const NOTE = [
  "....KKKKKKK.", "....KKKKKKK.", "....K.....K.", "....K.....K.", "....K.....K.", "....K.....K.",
  "....K.....K.", "..KKK...KKK.", ".KKKK..KKKK.", ".KKKK..KKKK.", "..KK....KK..", "............",
];
const TURN = [
  "...KKKKK.K..", "..KKKKKKKK..", ".KK....KKK..", "KK....KKKK..", "KK..........", "KK..........",
  "KK........KK", "KK........KK", ".KK......KK.", "..KKKKKKKK..", "...KKKKKK...", "............",
];
const BOX = [
  "............", ".KKKKKKKKKK.", ".KWWWWWWWWK.", ".KWWWWWWWWK.", ".KWWWWWWWWK.", ".KWWWWWWWWK.",
  ".KWWWWWWWWK.", ".KWWWWWWWWK.", ".KWWWWWWWWK.", ".KWWWWWWWWK.", ".KKKKKKKKKK.", "............",
];
const ICONS = {
  bean: [
    "....KKKK....", "..KKbbbbKK..", ".KbbbbbbbbK.", ".KbbbBbbbbK.", "KbbbbBbbbbbK", "KbbbbBBbbbbK",
    "KbbbbbBbbbbK", "KbbbbbBBbbbK", ".KbbbbbBbbK.", ".KbbbbbbbbK.", "..KKbbbbKK..", "....KKKK....",
  ],
  rf: [
    "....KKKK....", "..KKggggKK..", ".KgggggggGK.", ".KggGGGGgGK.", "KgggGggGggGK", "KgggGGGgggGK",
    "KgggGggGggGK", "KgggGgggGgGK", ".KgggggggGK.", ".KGgggggGGK.", "..KKGGGGKK..", "....KKKK....",
  ],
  star: STAR,
  starEmpty: STAR.map(row => row.replace(/[gG]/g, "o")),
  starHalf: STAR.map(row => row.split("").map((c, i) => i >= 6 && (c === "g" || c === "G") ? "o" : c).join("")),
  clock: [
    "...KKKKKK...", "..KWWWWWWK..", ".KWWWWKWWWK.", "KWWWWWKWWWWK", "KWWWWWKWWWWK", "KWWWWWKKKWWK",
    "KWWWWWWWWWWK", "KWWWWWWWWWWK", ".KWWWWWWWWK.", "..KWWWWWWK..", "...KKKKKK...", "............",
  ],
  hammer: [
    "..KKKKKKKK..", ".KOooooooOK.", ".KOOOOOOOOK.", "..KKKbbKKK..", "....KbbK....", "....KbbK....",
    "....KbbK....", "....KbbK....", "....KbbK....", "....KbbK....", "....KbbK....", "....KKKK....",
  ],
  up: [
    ".....KK.....", "....KSSK....", "...KSSSSK...", "..KSSSSSSK..", ".KSSSSSSSSK.", "KKKKSSSSKKKK",
    "...KSSSSK...", "...KSSSSK...", "...KSSSSK...", "...KsSSsK...", "...KssssK...", "...KKKKKK...",
  ],
  capsule: [
    "....KKKK....", "..KKWWWWKK..", ".KWWoWWWWWK.", ".KWoWWWWWWK.", "KWWWWWWWWWWK", "KKKKKKKKKKKK",
    "KRRRRRRRRRRK", "KRRRRRRRRRRK", ".KRRRRRRRRK.", ".KrRRRRRRrK.", "..KKrrrrKK..", "....KKKK....",
  ],
  pause: Array.from({ length: 12 }, (_, i) => i === 0 || i === 11 ? "............" : "..KKK..KKK.."),
  gear: [
    ".....KK.....", "..K.KOOK.K..", ".KOKOOOOKOK.", "..KOOOOOOK..", ".KOOOKKOOOK.", "KOOOK..KOOOK",
    "KOOOK..KOOOK", ".KOOOKKOOOK.", "..KOOOOOOK..", ".KOKOOOOKOK.", "..K.KOOK.K..", ".....KK.....",
  ],
  note: NOTE,
  noteOff: NOTE.map((row, y) => row.split("").map((c, x) => Math.abs(x - (11 - y)) <= 0 || Math.abs(x - (10 - y)) <= 0 ? "r" : c).join("")),
  plus: Array.from({ length: 12 }, (_, y) => y === 5 || y === 6 ? ".KKKKKKKKKK." : y >= 1 && y <= 10 ? ".....KK....." : "............"),
  minus: Array.from({ length: 12 }, (_, y) => y === 5 || y === 6 ? ".KKKKKKKKKK." : "............"),
  turnRight: TURN,
  turnLeft: TURN.map(row => row.split("").reverse().join("")),
  fit: [
    "KKKK....KKKK", "KKKK....KKKK", "KK........KK", "KK........KK", "............", "............",
    "............", "............", "KK........KK", "KK........KK", "KKKK....KKKK", "KKKK....KKKK",
  ],
  close: [
    "KK........KK", "KKK......KKK", ".KKK....KKK.", "..KKK..KKK..", "...KKKKKK...", "....KKKK....",
    "....KKKK....", "...KKKKKK...", "..KKK..KKK..", ".KKK....KKK.", "KKK......KKK", "KK........KK",
  ],
  box: BOX,
  boxDone: BOX.map((row, y) => row.split("").map((c, x) => c === "W" ? "S" : c).join("")).map((row, y) => {
    const tick: Record<number, number[]> = { 3: [8], 4: [7], 5: [3, 6], 6: [4, 5], 7: [5] };
    return row.split("").map((c, x) => tick[y]?.includes(x) ? "K" : c).join("");
  }),
  spark: [
    ".....KK.....", ".....KK.....", "....KgGK....", "....KgGK....", "..KKggGGKK..", "KKgggggGGGKK",
    "KKggggGGGGKK", "..KKgGGGKK..", "....KgGK....", "....KgGK....", ".....KK.....", ".....KK.....",
  ],
  chevronDown: ["............", "............", "............", "..KK....KK..", "..KKK..KKK..", "...KKKKKK...", "....KKKK....", ".....KK.....", "............", "............", "............", "............"],
  chevronUp: ["............", "............", "............", "............", ".....KK.....", "....KKKK....", "...KKKKKK...", "..KKK..KKK..", "..KK....KK..", "............", "............", "............"],
  cup: [
    "................", "................", "................", "..KKKKKKKKKKK...", "..KWWWWWWWWWK...", "..KBBBBBBBBBKKK.",
    "..KWWWWWWWWWK.K.", "..KRRRRRRRRRK.K.", "..KWWWWWWWWWKKK.", "..KWWWWWWWWWK...", "...KWWWWWWWK....", "....KKKKKKK.....",
    "KKKKKKKKKKKKKKK.", ".KoooooooooooK..", "..KKKKKKKKKKK...", "................",
  ],
} satisfies Record<string, readonly string[]>;
export type IconName = keyof typeof ICONS;
/** Ink-only icons, which flip to light ink in dark mode. */
const MONO = new Set<IconName>(["pause", "plus", "minus", "turnLeft", "turnRight", "fit", "close", "chevronDown", "chevronUp", "note"]);

const urls = new Map<IconName, string>();
function iconUrl(name: IconName) {
  const cached = urls.get(name);
  if (cached) return cached;
  const rows = ICONS[name], canvas = document.createElement("canvas");
  canvas.width = rows[0].length; canvas.height = rows.length;
  const ctx = canvas.getContext("2d")!;
  rows.forEach((row, y) => row.split("").forEach((c, x) => { const color = PALETTE[c]; if (color) { ctx.fillStyle = color; ctx.fillRect(x, y, 1, 1); } }));
  const url = canvas.toDataURL("image/png");
  urls.set(name, url);
  return url;
}

/** A pixel icon, decorative (the control around it carries the label). */
export function Icon({ name, size = 18, className }: { name: IconName; size?: number; className?: string }) {
  return <img src={iconUrl(name)} alt="" aria-hidden="true" width={size} height={size} draggable={false}
    className={`cafe-icon${MONO.has(name) ? " mono" : ""}${className ? ` ${className}` : ""}`} />;
}
/** An amount of Beans with the bean icon, as a price tag. */
export function Beans({ n, size = 14 }: { n: number; size?: number }) {
  return <span className="cafe-price"><Icon name="bean" size={size} />{n.toLocaleString("en-US")}<span className="cafe-sr"> Beans</span></span>;
}
/** Five stars for a 0–5 rating, in halves. */
export function Stars({ rating, size = 14 }: { rating: number; size?: number }) {
  const halves = Math.round(rating * 2);
  return <span className="cafe-stars">{[0, 1, 2, 3, 4].map(i => <Icon key={i} size={size} name={halves >= (i + 1) * 2 ? "star" : halves === i * 2 + 1 ? "starHalf" : "starEmpty"} />)}</span>;
}
