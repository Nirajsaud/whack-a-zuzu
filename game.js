const ROUND_MS = 60000;
// The key names the round length: a best set under other rules isn't comparable.
const BEST_KEY = "whack-a-zuzu-best-60s";

// Things stay up for less time, and appear more often, as the round goes on: a gentle
// start that ends at more than twice the pace. A "Faster!" banner marks each third.
const UP_MS = { start: 1300, end: 560 };
const GAP_MS = { start: 950, end: 380 };
const SPEED_UP_EVERY_MS = 20000;
// A mouse has to travel to each hole where a finger just taps it, so with a mouse
// everything stays up a little longer.
const MOUSE_UP_SHARE = 1.25;

// What can come out of a hole. points: what a hit is worth before the multiplier (the
// bomb's is taken away). upShare: how long it stays up next to a plain Zuzu. color: its
// floating label. vibe: the phone's buzz when it's hit.
const KINDS = {
  zuzu: { points: 1, upShare: 1, color: "#ffffff", vibe: 12 },
  gold: { points: 5, upShare: 0.7, color: "#ffd23f", vibe: [15, 30, 15] },
  clock: { points: 0, upShare: 0.8, color: "#5eea98", vibe: [15, 30, 15] },
  bomb: { points: -3, upShare: 1, color: "#ff6a5c", vibe: [70, 40, 140] },
};
const GOLD_CHANCE = 0.07;
const CLOCK_CHANCE = 0.05;
const CLOCK_BONUS_MS = 3000;
const BOMB_CHANCE = 0.18;
// No bombs in the opening seconds, while the player settles in.
const BOMB_FREE_MS = 3000;

// Every STREAK_PER_MULT hits in a row raise the multiplier, up to MAX_MULT.
const STREAK_PER_MULT = 4;
const MAX_MULT = 5;

// The frenzy: for the last stretch two come up at a time, more often, with fewer bombs
// and no clocks (so the frenzy can't be stretched out).
const FRENZY_MS = 10000;
const FRENZY_GAP_SHARE = 0.7;
const FRENZY_SPAWNS = 2;
const FRENZY_BOMB_CHANCE = 0.1;

// Highest first: the rank on the end card is the first one whose score has been reached.
const RANKS = [
  { score: 250, name: "Zuzu's Nemesis" },
  { score: 150, name: "Bonk Master" },
  { score: 80, name: "Sharp Swinger" },
  { score: 30, name: "Bonker" },
  { score: 0, name: "Rookie" },
];

// Resting place below the hole, as a % of the character's own height.
const HIDDEN = 160;
const MALLET_REST = -15;
const MALLET_STRIKE = -62;
const CONFETTI_COLORS = ["#ff6f00", "#ffd23f", "#ffffff", "#020ba5", "#e04c4c"];
const SMOKE_COLORS = ["#ff6f00", "#ffd23f", "#6a6a6a", "#2a2a2a"];

const $ = (id) => document.getElementById(id);
const board = $("board");
const boardWrap = $("board-wrap");
const fx = $("fx");
const scoreEl = $("score");
const timeEl = $("time");
const bestEl = $("best");
const comboEl = $("combo");
const countdownEl = $("countdown");
const overlay = $("overlay");
const playBtn = $("play");
const muteBtn = $("mute");
const faceBtn = $("face-btn");
const mallet = $("mallet");
const malletArt = mallet.querySelector(".mallet-art");

const hasMouse = matchMedia("(hover: hover) and (pointer: fine)").matches;

// A shared link carries the sender's score as ?beat=96. Anything that isn't a sensible
// whole number is ignored.
const beatParam = Number(new URLSearchParams(location.search).get("beat"));
const challenge = Number.isInteger(beatParam) && beatParam > 0 && beatParam < 100000 ? beatParam : 0;

const holes = [];

let score = 0;
let best = loadBest();
let streak = 0;
let bestStreak = 0;
let mult = 1;
let hits = 0;
let misses = 0;
let bombsHit = 0;
let running = false;
let frenzy = false;
let startedAt = 0;
let bonusMs = 0;
let spawnTimer = null;
let tickTimer = null;
let lastHole = null;
let lastSecond = 0;
let lastHalfSecond = 0;
let speedStage = 0;

function loadBest() {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be unavailable (private mode); the game works without it.
  }
}

// A short buzz on phones that support it (Android; iOS ignores it).
function buzz(pattern) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}

// A quick bounce back to full size, for anything that just changed or got hit.
function pop(target, from, duration, ease) {
  gsap.fromTo(target, { scale: from }, { scale: 1, duration, ease, overwrite: true });
}

// The nine holes are copies of the template in index.html.
function buildBoard() {
  const template = $("hole-template").content.firstElementChild;
  for (let i = 0; i < 9; i++) {
    const el = template.cloneNode(true);
    el.setAttribute("aria-label", `Hole ${i + 1}`);
    board.appendChild(el);

    const hole = {
      el,
      zuzu: el.querySelector(".zuzu"),
      eyes: el.querySelector(".eyes"),
      bomb: el.querySelector(".bomb"),
      kind: "zuzu",
      timer: null,
    };
    gsap.set([hole.zuzu, hole.bomb], { yPercent: HIDDEN });
    holes.push(hole);

    el.addEventListener("pointerdown", () => whack(hole));
    el.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        whack(hole);
      }
    });
  }
}

function elapsedMs() {
  return performance.now() - startedAt;
}

// Clocks add to the time left without winding back how far into the round we are.
function remainingMs() {
  return Math.max(ROUND_MS + bonusMs - elapsedMs(), 0);
}

// How far through the round's difficulty ramp we are.
function progress() {
  return Math.min(elapsedMs() / ROUND_MS, 1);
}

function lerp(range, t) {
  return range.start + (range.end - range.start) * t;
}

function setScore(value) {
  score = Math.max(value, 0);
  scoreEl.textContent = score;
}

function pickHole() {
  const free = holes.filter((hole) => hole !== lastHole && !hole.el.classList.contains("up"));
  return free[Math.floor(Math.random() * free.length)];
}

function pickKind() {
  const bombChance = frenzy ? FRENZY_BOMB_CHANCE : BOMB_CHANCE;
  let roll = Math.random();

  if (roll < GOLD_CHANCE) return "gold";
  roll -= GOLD_CHANCE;
  if (!frenzy) {
    if (roll < CLOCK_CHANCE) return "clock";
    roll -= CLOCK_CHANCE;
  }
  if (roll < bombChance && elapsedMs() > BOMB_FREE_MS) return "bomb";
  return "zuzu";
}

// The character springs up out of the hole. Zuzu glances to one side while it waits.
function popUp(hole, kind) {
  const { el, zuzu, eyes, bomb } = hole;
  const [actor, other] = kind === "bomb" ? [bomb, zuzu] : [zuzu, bomb];
  hole.kind = kind;
  el.dataset.kind = kind;
  el.classList.add("up");

  gsap.killTweensOf([zuzu, eyes, bomb]);
  gsap.set(other, { yPercent: HIDDEN });
  gsap.set(actor, { scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 });
  gsap.set(eyes, { scaleY: 1, xPercent: 0 });
  gsap.to(actor, { yPercent: 0, duration: 0.34, ease: "back.out(2.4)" });
  gsap.to(eyes, {
    xPercent: gsap.utils.random([-14, 14]),
    duration: 0.18,
    delay: 0.3,
    ease: "power2.out",
    repeat: 1,
    yoyo: true,
    repeatDelay: 0.22,
  });
  sound.pop();

  const upTime = lerp(UP_MS, progress()) * KINDS[kind].upShare * (hasMouse ? MOUSE_UP_SHARE : 1);
  hole.timer = setTimeout(() => duck(hole), upTime);
}

// The character drops back down unhit. It stops being whackable as soon as it starts.
function duck(hole) {
  clearTimeout(hole.timer);
  hole.el.classList.remove("up", "hit");
  gsap.to(hole.kind === "bomb" ? hole.bomb : hole.zuzu, { yPercent: HIDDEN, duration: 0.2, ease: "power2.in", overwrite: true });
}

function spawn() {
  if (!running) return;

  for (let i = 0; i < (frenzy ? FRENZY_SPAWNS : 1); i++) {
    const hole = pickHole();
    if (!hole) break;
    lastHole = hole;
    popUp(hole, pickKind());
  }

  const gap = lerp(GAP_MS, progress()) * (0.75 + Math.random() * 0.5) * (frenzy ? FRENZY_GAP_SHARE : 1);
  spawnTimer = setTimeout(spawn, gap);
}

function whack(hole) {
  if (!running) return;
  const { el } = hole;

  // The hole dips under the mallet whether or not anything is in it.
  pop(el, 0.92, 0.45, "elastic.out(1, 0.4)");

  // A second tap on something already hit is neither a hit nor a miss.
  if (el.classList.contains("hit")) return;

  if (!el.classList.contains("up")) {
    misses++;
    sound.miss();
    breakCombo();
    return;
  }

  el.classList.add("hit");
  clearTimeout(hole.timer);
  buzz(KINDS[hole.kind].vibe);

  if (hole.kind === "bomb") hitBomb(hole);
  else hitZuzu(hole);
}

function hitZuzu({ el, zuzu, eyes, kind }) {
  const points = KINDS[kind].points * mult;
  hits++;
  streak++;
  bestStreak = Math.max(bestStreak, streak);
  setScore(score + points);

  // Squashed flat with its eyes shut, a dazed wobble, then it sinks.
  gsap.killTweensOf([zuzu, eyes]);
  gsap.set(eyes, { scaleY: 0.12, xPercent: 0 });
  gsap
    .timeline({ onComplete: () => el.classList.remove("up", "hit") })
    .to(zuzu, { scaleX: 1.16, scaleY: 0.7, yPercent: 24, duration: 0.07, ease: "power2.out" })
    .to(zuzu, { scaleX: 1, scaleY: 1, rotation: gsap.utils.random([-9, 9]), duration: 0.22, ease: "elastic.out(1, 0.5)" })
    .to(zuzu, { yPercent: HIDDEN, rotation: 0, duration: 0.22, ease: "back.in(1.6)" });

  // Effects grow with the multiplier.
  const special = kind !== "zuzu";
  burst(el, {
    label: kind === "clock" ? `+${CLOCK_BONUS_MS / 1000}s` : `+${points}`,
    labelColor: KINDS[kind].color,
    labelScale: 1 + (mult - 1) * 0.18 + (special ? 0.3 : 0),
    stars: (special ? 14 : 7) + (mult - 1) * 3,
    reach: 1 + (mult - 1) * 0.12,
  });
  gsap.fromTo(board, { x: gsap.utils.random([-5, 5]) }, { x: 0, duration: 0.4, ease: "elastic.out(1, 0.3)", overwrite: true });

  if (kind === "clock") {
    bonusMs += CLOCK_BONUS_MS;
    tick();
    pop(timeEl, 1.7, 0.5, "elastic.out(1, 0.4)");
  } else {
    pop(scoreEl, 1.6, 0.4, "back.out(3)");
  }
  if (special) sound[kind]();
  else sound.bonk(streak);

  const nextMult = Math.min(1 + Math.floor(streak / STREAK_PER_MULT), MAX_MULT);
  if (nextMult > mult) {
    mult = nextMult;
    showCombo();
  }
}

function hitBomb({ el, bomb }) {
  const lost = Math.min(score, -KINDS.bomb.points);
  bombsHit++;
  setScore(score - lost);

  gsap.killTweensOf(bomb);
  gsap.to(bomb, {
    scaleX: 1.5,
    scaleY: 1.5,
    opacity: 0,
    duration: 0.16,
    ease: "power2.out",
    onComplete: () => {
      el.classList.remove("up", "hit");
      gsap.set(bomb, { yPercent: HIDDEN, scaleX: 1, scaleY: 1, opacity: 1 });
    },
  });

  burst(el, {
    label: lost > 0 ? `-${lost}` : "Boom!",
    labelColor: KINDS.bomb.color,
    labelScale: 1.3,
    ringColor: "#ff6f00",
    puffs: 12,
    reach: 1.3,
  });
  gsap.fromTo($("flash"), { opacity: 0.5 }, { opacity: 0, duration: 0.45, ease: "power2.out", overwrite: true });
  gsap.fromTo(board, { x: -12, rotation: -1.2 }, { x: 0, rotation: 0, duration: 0.7, ease: "elastic.out(1.2, 0.2)", overwrite: true });
  pop(scoreEl, 0.6, 0.5, "elastic.out(1, 0.4)");

  sound.bomb();
  breakCombo();
}

function showCombo() {
  $("combo-mult").textContent = `x${mult}`;
  gsap.fromTo(
    comboEl,
    { autoAlpha: 1, xPercent: -50, y: 0, scale: 1.7, rotation: gsap.utils.random([-8, 8]) },
    { scale: 1, rotation: 0, duration: 0.5, ease: "elastic.out(1, 0.45)", overwrite: true }
  );
  sound.comboUp(mult);
}

function breakCombo() {
  streak = 0;
  if (mult === 1) return;
  mult = 1;
  sound.comboBreak();
  gsap
    .timeline()
    .to(comboEl, { rotation: 10, duration: 0.05, repeat: 3, yoyo: true, overwrite: true })
    .to(comboEl, { autoAlpha: 0, y: 24, rotation: 20, duration: 0.3, ease: "power2.in" })
    .set(comboEl, { y: 0, rotation: 0 });
}

function addFx(className, x, y) {
  const node = document.createElement("span");
  node.className = className;
  fx.appendChild(node);
  gsap.set(node, { x, y });
  return node;
}

// A shock ring, a spray of stars or smoke, and a floating label, centred on whatever
// was in the hole.
function burst(holeEl, { label, labelColor, labelScale = 1, ringColor, stars = 0, puffs = 0, reach = 1 }) {
  const wrap = boardWrap.getBoundingClientRect();
  const rect = holeEl.getBoundingClientRect();
  const x = rect.left - wrap.left + rect.width / 2;
  const y = rect.top - wrap.top + rect.height * 0.42;
  const remove = (node) => () => node.remove();
  // Effects are drawn for a 110px hole and scale with the board.
  const size = rect.width / 110;

  const ring = addFx("ring", x, y);
  if (ringColor) ring.style.borderColor = ringColor;
  gsap.fromTo(
    ring,
    { scale: 0.4, opacity: 1 },
    { scale: (rect.width / 22) * reach, opacity: 0, duration: 0.4, ease: "power2.out", onComplete: remove(ring) }
  );

  const pieces = stars + puffs;
  for (let i = 0; i < pieces; i++) {
    const isStar = i < stars;
    const piece = addFx(isStar ? "star" : "puff", x, y);
    if (!isStar) piece.style.background = gsap.utils.random(SMOKE_COLORS);
    const angle = (i / pieces) * Math.PI * 2 + Math.random() * 0.6;
    const distance = rect.width * gsap.utils.random(0.45, 0.8) * reach;
    gsap.to(piece, {
      x: x + Math.cos(angle) * distance,
      y: y + Math.sin(angle) * distance,
      rotation: gsap.utils.random(-220, 220),
      scale: size * (isStar ? gsap.utils.random(0.5, 1.2) : gsap.utils.random(0.6, 1.8)),
      duration: isStar ? 0.5 : 0.65,
      ease: "power3.out",
    });
    gsap.to(piece, { opacity: 0, duration: 0.25, delay: isStar ? 0.3 : 0.4, onComplete: remove(piece) });
  }

  const tag = addFx("plus", x, y);
  tag.textContent = label;
  tag.style.color = labelColor;
  gsap.set(tag, { xPercent: -50, yPercent: -50 });
  gsap.fromTo(tag, { scale: 0.4 }, { scale: labelScale * size, duration: 0.25, ease: "back.out(3)" });
  gsap.to(tag, { y: y - rect.height * 0.6, duration: 0.7, ease: "power2.out" });
  gsap.to(tag, { opacity: 0, duration: 0.25, delay: 0.45, onComplete: remove(tag) });
}

function confetti() {
  const width = boardWrap.clientWidth;
  const height = boardWrap.clientHeight;
  for (let i = 0; i < 44; i++) {
    const piece = addFx("confetti", gsap.utils.random(0, width), -20);
    piece.style.background = gsap.utils.random(CONFETTI_COLORS);
    gsap.to(piece, {
      x: `+=${gsap.utils.random(-70, 70)}`,
      y: height + 30,
      rotation: gsap.utils.random(-540, 540),
      duration: gsap.utils.random(1.3, 2.4),
      delay: gsap.utils.random(0, 0.5),
      ease: "power1.in",
      onComplete: () => piece.remove(),
    });
  }
}

// A word that slams in over the board and fades: the countdown, and "Frenzy!".
function announce(text, isBanner) {
  countdownEl.textContent = text;
  countdownEl.classList.toggle("banner", isBanner);
  gsap
    .timeline()
    .fromTo(countdownEl, { autoAlpha: 1, scale: 0.3 }, { scale: 1, duration: 0.3, ease: "back.out(3)", overwrite: true })
    .to(countdownEl, { autoAlpha: 0, scale: 1.6, duration: 0.22, ease: "power2.in" }, isBanner ? "+=0.5" : "+=0.18");
}

function startFrenzy() {
  frenzy = true;
  boardWrap.classList.add("frenzy");
  announce("Frenzy!", true);
  sound.frenzy();
  buzz(40);
}

function tick() {
  const remaining = remainingMs();
  const seconds = Math.ceil(remaining / 1000);
  const halfSeconds = Math.ceil(remaining / 500);

  if (!frenzy && remaining > 0 && remaining <= FRENZY_MS) startFrenzy();

  const stage = Math.floor(elapsedMs() / SPEED_UP_EVERY_MS);
  if (stage > speedStage) {
    speedStage = stage;
    if (!frenzy && remaining > 0) {
      announce("Faster!", true);
      sound.faster();
    }
  }

  if (seconds !== lastSecond) {
    lastSecond = seconds;
    timeEl.textContent = seconds;
    timeEl.classList.toggle("low", frenzy);
    if (frenzy && seconds > 0) pop(timeEl, 1.5, 0.4, "back.out(2.5)");
  }

  // The clock ticks twice a second through the frenzy.
  if (halfSeconds !== lastHalfSecond) {
    lastHalfSecond = halfSeconds;
    if (frenzy && remaining > 0) sound.tick();
  }

  if (remaining === 0) endGame();
}

// Play leads into a 3-2-1 count; the round itself begins on "Go!".
function startGame() {
  sound.unlock();
  shareCard.hide();
  faceBtn.disabled = true;

  streak = 0;
  bestStreak = 0;
  mult = 1;
  hits = 0;
  misses = 0;
  bombsHit = 0;
  frenzy = false;
  bonusMs = 0;
  lastHole = null;
  lastSecond = ROUND_MS / 1000;
  lastHalfSecond = ROUND_MS / 500;
  speedStage = 0;
  setScore(0);
  timeEl.textContent = lastSecond;
  timeEl.classList.remove("low");

  gsap.to(overlay, { autoAlpha: 0, scale: 0.92, duration: 0.2, ease: "power2.in", overwrite: true });
  gsap.fromTo(
    board.children,
    { scale: 0.85 },
    { scale: 1, duration: 0.5, ease: "back.out(2.5)", stagger: { each: 0.04, from: "center", grid: [3, 3] }, overwrite: true }
  );
  if (hasMouse) {
    document.body.classList.add("playing");
    gsap.set(malletArt, { rotation: MALLET_REST });
    gsap.to(mallet, { autoAlpha: 1, duration: 0.15 });
  }

  ["3", "2", "1"].forEach((label, i) => {
    gsap.delayedCall(0.25 + i * 0.7, () => {
      announce(label, false);
      sound.count();
    });
  });
  gsap.delayedCall(0.25 + 3 * 0.7, () => {
    announce("Go!", false);
    sound.go();
    running = true;
    startedAt = performance.now();
    tickTimer = setInterval(tick, 100);
    spawnTimer = setTimeout(spawn, 350);
  });
}

function endGame() {
  running = false;
  frenzy = false;
  clearInterval(tickTimer);
  clearTimeout(spawnTimer);
  holes.forEach(duck);

  faceBtn.disabled = false;
  boardWrap.classList.remove("frenzy");
  document.body.classList.remove("playing");
  gsap.to(mallet, { autoAlpha: 0, duration: 0.15 });
  gsap.to(comboEl, { autoAlpha: 0, duration: 0.2, overwrite: true });

  const isRecord = score > best;
  if (isRecord) {
    best = score;
    saveBest(best);
    bestEl.textContent = best;
    pop(bestEl, 1.8, 0.6, "elastic.out(1, 0.4)");
    confetti();
  }
  sound.end(isRecord);
  buzz(isRecord ? [30, 40, 30, 40, 80] : 60);
  showResults(isRecord);
}

// The end card: the score counts up as it lands, then the rank stamps in.
function showResults(isRecord) {
  // Accuracy counts every swing that connected with a hole: hits against empty swings
  // and bombs.
  const swings = hits + misses + bombsHit;
  const accuracy = swings === 0 ? "0%" : `${Math.round((hits / swings) * 100)}%`;
  const rank = RANKS.find((entry) => score >= entry.score).name;
  const finalScoreEl = $("final-score");
  const rankEl = $("rank");

  let title = isRecord ? "New best!" : "Time's up!";
  if (challenge) title = score > challenge ? "Challenge beaten!" : `${challenge} still stands`;
  $("overlay-title").textContent = title;
  $("overlay-text").hidden = true;
  $("results").hidden = false;
  $("tally-hits").textContent = hits;
  $("tally-accuracy").textContent = accuracy;
  $("tally-streak").textContent = bestStreak;
  $("tally-bombs").textContent = bombsHit;
  rankEl.textContent = rank;
  playBtn.textContent = "Play again";
  shareCard.prepare({ score, rank, hits, accuracy, streak: bestStreak });

  const count = { value: 0 };
  const showCount = () => {
    finalScoreEl.textContent = Math.round(count.value);
  };
  showCount();
  gsap.to(count, { value: score, duration: 0.8, delay: 0.2, ease: "power2.out", onUpdate: showCount });
  gsap.fromTo(rankEl, { scale: 0, rotation: -12 }, { scale: 1, rotation: 0, duration: 0.5, delay: 0.9, ease: "back.out(2.5)" });
  gsap.from(".tally div", { y: 14, opacity: 0, duration: 0.35, ease: "back.out(2)", stagger: 0.07, delay: 0.5 });
  gsap.fromTo(
    overlay,
    { autoAlpha: 0, scale: 0.8 },
    { autoAlpha: 1, scale: 1, duration: 0.45, ease: "back.out(1.8)", overwrite: true }
  );
  playBtn.focus();
}

function setUpMallet() {
  if (!hasMouse) return;

  const moveX = gsap.quickTo(mallet, "x", { duration: 0.12, ease: "power3" });
  const moveY = gsap.quickTo(mallet, "y", { duration: 0.12, ease: "power3" });
  window.addEventListener("pointermove", (event) => {
    moveX(event.clientX);
    moveY(event.clientY);
  });

  window.addEventListener("pointerdown", () => {
    if (!running) return;
    gsap
      .timeline()
      .to(malletArt, { rotation: MALLET_STRIKE, duration: 0.05, ease: "power2.in", overwrite: true })
      .to(malletArt, { rotation: MALLET_REST, duration: 0.3, ease: "back.out(2.5)" });
  });
}

function setUpMute() {
  const render = () => {
    const muted = sound.isMuted();
    muteBtn.setAttribute("aria-pressed", String(muted));
    muteBtn.setAttribute("aria-label", muted ? "Unmute sound" : "Mute sound");
  };
  muteBtn.addEventListener("click", () => {
    sound.setMuted(!sound.isMuted());
    render();
  });
  render();
}

function intro() {
  gsap.from("h1", { y: -30, opacity: 0, duration: 0.6, ease: "back.out(2)" });
  gsap.from(".stat, .icon-btn", { y: 20, opacity: 0, duration: 0.45, ease: "back.out(2)", stagger: 0.08, delay: 0.1 });
  gsap.from(board.children, {
    scale: 0,
    duration: 0.5,
    ease: "back.out(1.8)",
    stagger: { each: 0.05, from: "center", grid: [3, 3] },
    delay: 0.2,
  });
  gsap.from(overlay, { autoAlpha: 0, scale: 0.85, duration: 0.5, ease: "back.out(1.8)", delay: 0.55 });
}

buildBoard();
setUpMallet();
setUpMute();
if (challenge) {
  $("overlay-title").textContent = "Challenge!";
  $("overlay-text").textContent = `A friend scored ${challenge}. Beat that! Bonk Zuzu, grab the gold and the clocks, and don't hit the bombs.`;
}
timeEl.textContent = ROUND_MS / 1000;
bestEl.textContent = best;
playBtn.addEventListener("click", startGame);
intro();
