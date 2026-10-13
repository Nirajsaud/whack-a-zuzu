// The Share button on the end card. It opens a sheet with a picture of the result (Zuzu
// wearing the player's face if they set one, the score, the rank) and a challenge message
// with the link. From there the player can copy the message, save the picture, or hand
// both to the device's share window.
//
// The picture is drawn as soon as the round ends, so it is ready when the sheet opens.
const shareCard = (() => {
  const W = 1080;
  const H = 1350;
  // Zuzu's head is 248.87 x 187.15 in its own units; U is one of them on the card.
  const U = 2;
  const HEAD_X = W / 2 - (248.87 * U) / 2;
  const HEAD_Y = 345;
  const FONT = {
    display: '"Poppins", "Segoe UI", sans-serif',
    mono: '"JetBrains Mono", Consolas, monospace',
  };

  const button = document.getElementById("share");
  const board = document.getElementById("board");
  const dialog = document.getElementById("share-dialog");
  const preview = document.getElementById("share-preview");
  const message = document.getElementById("share-message");
  const copyBtn = document.getElementById("share-copy");
  const sendBtn = document.getElementById("share-send");
  const saveBtn = document.getElementById("share-save");
  const closeBtn = document.getElementById("share-close");

  let result = null;
  let pending = null;
  let file = null;

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = src;
    });
  }

  // The player's face, if they set one: it lives on the board as a CSS variable.
  function faceUrl() {
    const match = getComputedStyle(board).getPropertyValue("--face").match(/url\(["']?(.+?)["']?\)/);
    return match ? match[1] : null;
  }

  function pill(ctx, x, y, w, h) {
    panel(ctx, x, y, w, h, Math.min(w, h) / 2);
  }

  function panel(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // A white, black-outlined capsule: Zuzu's ears and antenna.
  function shellPart(ctx, x, y, w, h) {
    pill(ctx, HEAD_X + x * U, HEAD_Y + y * U, w * U, h * U);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.lineWidth = 2.057 * U;
    ctx.strokeStyle = "#000";
    ctx.stroke();
  }

  function part(ctx, image, x, y, w, h) {
    ctx.drawImage(image, HEAD_X + x * U, HEAD_Y + y * U, w * U, h * U);
  }

  // The photo cut to the visor's shape, a touch smaller so the blue rim shows.
  function facePatch(photo, visor) {
    const w = Math.round(185.102 * U);
    const h = Math.round(113.837 * U);
    const patch = document.createElement("canvas");
    patch.width = w;
    patch.height = h;
    const ctx = patch.getContext("2d");
    ctx.drawImage(visor, w * 0.025, h * 0.035, w * 0.95, h * 0.93);
    ctx.globalCompositeOperation = "source-in";
    ctx.drawImage(photo, 0, 0, w, h);
    return patch;
  }

  async function draw({ score, rank, hits, accuracy, streak }) {
    const face = faceUrl();
    const [head, visor, eyes, photo] = await Promise.all([
      loadImage("assets/zuzu/head.svg"),
      loadImage("assets/zuzu/face.svg"),
      loadImage("assets/zuzu/eyes.svg"),
      face ? loadImage(face) : null,
      document.fonts.load(`700 90px ${FONT.display}`),
      document.fonts.load(`700 90px ${FONT.mono}`),
    ]);

    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    ctx.textAlign = "center";

    ctx.fillStyle = "#f9ebdb";
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "#000";
    ctx.font = `700 92px ${FONT.display}`;
    ctx.fillText("Whack-a-Zuzu", W / 2, 160);

    // The board, with one glowing hatch and Zuzu in it.
    panel(ctx, 130, 225, W - 260, 600, 70);
    ctx.fillStyle = "#141414";
    ctx.fill();

    const glow = ctx.createRadialGradient(W / 2, 640, 0, W / 2, 525, 300);
    glow.addColorStop(0, "#2a3cf0");
    glow.addColorStop(0.4, "#020ba5");
    glow.addColorStop(0.8, "#01043a");
    ctx.beginPath();
    ctx.arc(W / 2, 525, 265, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();
    ctx.lineWidth = 12;
    ctx.strokeStyle = "#3a3a3a";
    ctx.stroke();

    shellPart(ctx, 0, 69.93, 32.907, 74.041);
    shellPart(ctx, 215.95, 69.93, 32.907, 74.041);
    shellPart(ctx, 90.49, 0, 69.927, 32.907);
    part(ctx, head, 16.45, 8.23, 215.952, 178.932);
    part(ctx, visor, 32.91, 41.13, 185.102, 113.837);
    if (photo) part(ctx, facePatch(photo, visor), 32.91, 41.13, 185.102, 113.837);
    else part(ctx, eyes, 72.18, 64.01, 104.43, 66.685);

    ctx.fillStyle = "#000";
    ctx.font = `700 190px ${FONT.mono}`;
    ctx.fillText(String(score), W / 2, 1010);

    ctx.fillStyle = "#4a4a4a";
    ctx.font = `500 40px ${FONT.mono}`;
    ctx.fillText(score === 1 ? "point" : "points", W / 2, 1065);

    ctx.font = `600 50px ${FONT.display}`;
    const rankWidth = ctx.measureText(rank).width + 90;
    pill(ctx, W / 2 - rankWidth / 2, 1100, rankWidth, 84);
    ctx.fillStyle = "#000";
    ctx.fill();
    ctx.fillStyle = "#f9ebdb";
    ctx.fillText(rank, W / 2, 1160);

    ctx.fillStyle = "#4a4a4a";
    ctx.font = `500 34px ${FONT.mono}`;
    ctx.fillText(`${hits} hits  ·  ${accuracy} accuracy  ·  streak ${streak}`, W / 2, 1238);

    ctx.fillStyle = "#000";
    ctx.font = `600 38px ${FONT.display}`;
    ctx.fillText(`Can you beat me?  ${location.host}${location.pathname.replace(/\/(index\.html)?$/, "")}`, W / 2, 1305);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    return new File([blob], "whack-a-zuzu.png", { type: "image/png" });
  }

  function saveToDevice() {
    const link = document.createElement("a");
    link.href = preview.src;
    link.download = file.name;
    link.click();
  }

  function flash(target, text) {
    const original = target.textContent;
    target.textContent = text;
    setTimeout(() => {
      target.textContent = original;
    }, 2000);
  }

  // Called when a round ends: remember the result and start drawing its picture.
  function prepare(data) {
    result = data;
    file = null;
    button.hidden = false;
    pending = draw(data)
      .then((made) => {
        file = made;
        return made;
      })
      .catch(() => {
        // Without a picture, the sheet still offers the message and link.
      });
    return pending;
  }

  function hide() {
    button.hidden = true;
  }

  // The link carries the score to beat, so whoever opens it starts with the challenge.
  function challengeUrl() {
    return `${location.origin}${location.pathname}?beat=${result.score}`;
  }

  // The link sits on a line of its own: messaging apps turn a bare address on its own
  // line into a tappable link most reliably.
  function challengeText() {
    return `I scored ${result.score} on Whack-a-Zuzu (${result.rank}). Bet you can't beat me!\n${challengeUrl()}`;
  }

  async function open() {
    if (!result) return;
    await pending;
    const [words, url] = challengeText().split("\n");
    const link = document.createElement("a");
    link.href = url;
    link.textContent = url;
    link.target = "_blank";
    link.rel = "noopener";
    message.replaceChildren(words, document.createElement("br"), link);
    if (file) preview.src = URL.createObjectURL(file);
    preview.parentElement.hidden = !file;
    saveBtn.hidden = !file;
    sendBtn.hidden = !navigator.share;
    dialog.showModal();
  }

  button.addEventListener("click", open);
  closeBtn.addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => URL.revokeObjectURL(preview.src));
  saveBtn.addEventListener("click", saveToDevice);

  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(challengeText());
      flash(copyBtn, "Copied!");
    } catch {
      // No clipboard access: highlight the message so it can be copied by hand.
      getSelection().selectAllChildren(message);
      flash(copyBtn, "Press Ctrl+C");
    }
  });

  // The message goes along as text because many apps drop a separate link when a
  // picture is attached. Some (Windows' share window among them) drop the text too,
  // which is why Copy message sits beside this.
  sendBtn.addEventListener("click", async () => {
    const text = challengeText();
    const withPicture = file && navigator.canShare && navigator.canShare({ files: [file] });
    try {
      await navigator.share(withPicture ? { files: [file], text } : { text });
    } catch (error) {
      // Closing the share window is not a failure.
      if (error.name !== "AbortError") flash(sendBtn, "Couldn't share");
    }
  });

  return { prepare, hide };
})();
