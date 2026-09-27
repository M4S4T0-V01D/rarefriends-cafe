// Preview page music: the game's own procedural "Street Bossa", started from the floating record button.
// Browsers only allow audio after a click, so it never autoplays.
import { CafeAudio } from "../../games/rarefriends-cafe/audio.ts";

const button = document.getElementById("music") as HTMLButtonElement | null;
if (button) {
  const player = new CafeAudio();
  const label = button.querySelector<HTMLElement>(".music-label");
  let playing = false;
  player.setTrack("bossa"); player.setSfx(false); player.setVolume(0.55);
  const show = () => {
    button.setAttribute("aria-pressed", String(playing));
    button.classList.toggle("on", playing);
    if (label) label.textContent = playing ? "Street Bossa" : "Play the café music";
  };
  button.addEventListener("click", () => {
    playing = !playing;
    player.setMuted(!playing);
    if (playing) player.unlock();
    show();
  });
  // Rest while the tab is hidden, pick the tune back up on return.
  document.addEventListener("visibilitychange", () => {
    if (!playing) return;
    player.setMuted(document.hidden);
    if (!document.hidden) player.unlock();
  });
  show();
}
