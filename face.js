// "Play with your own face": the player picks a photo, positions it inside Zuzu's visor,
// and every Zuzu on the board wears it. The photo is cropped in the browser and kept in
// localStorage; it is never sent anywhere.
(() => {
  const FACE_KEY = "whack-a-zuzu-face";
  const MAX_ZOOM = 4;
  // The visor is wide and short, so start zoomed right out, centred a little above the
  // middle, where the face is in most photos.
  const START = { zoom: 1, x: 0.5, y: 0.42 };

  const board = document.getElementById("board");
  const faceBtn = document.getElementById("face-btn");
  const dialog = document.getElementById("face-dialog");
  const canvas = document.getElementById("face-canvas");
  const fileInput = document.getElementById("face-file");
  const zoomInput = document.getElementById("face-zoom");
  const chooseBtn = document.getElementById("face-choose");
  const saveBtn = document.getElementById("face-save");
  const resetBtn = document.getElementById("face-reset");
  const cancelBtn = document.getElementById("face-cancel");
  const ctx = canvas.getContext("2d");

  // The photo being positioned, and where the crop is centred on it (in its own pixels).
  let photo = null;
  let zoom = START.zoom;
  let centreX = 0;
  let centreY = 0;
  let drag = null;

  // Only a face this page saved itself is trusted: a JPEG data URL and nothing else. Any
  // other value in storage (another page on the same site can write there) is ignored,
  // so it can never make the game load an outside address.
  const SAVED_FACE = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/;

  function loadSaved() {
    try {
      const saved = localStorage.getItem(FACE_KEY);
      return saved && SAVED_FACE.test(saved) ? saved : null;
    } catch {
      return null;
    }
  }

  function store(url) {
    try {
      if (url) localStorage.setItem(FACE_KEY, url);
      else localStorage.removeItem(FACE_KEY);
    } catch {
      // Storage can be full or unavailable; the face still applies for this visit.
    }
  }

  function apply(url) {
    board.classList.toggle("has-face", Boolean(url));
    faceBtn.classList.toggle("on", Boolean(url));
    faceBtn.setAttribute("aria-label", url ? "Change your face" : "Play with your own face");
    resetBtn.hidden = !url;
    if (url) board.style.setProperty("--face", `url("${url}")`);
    else board.style.removeProperty("--face");
  }

  // Canvas pixels per photo pixel at the current zoom; at zoom 1 the photo just covers
  // the visor.
  function scale() {
    return Math.max(canvas.width / photo.width, canvas.height / photo.height) * zoom;
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!photo) {
      ctx.fillStyle = "#020ba5";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const s = scale();
    const viewW = canvas.width / s;
    const viewH = canvas.height / s;
    // Keep the crop inside the photo, so the visor is always full.
    centreX = Math.min(Math.max(centreX, viewW / 2), photo.width - viewW / 2);
    centreY = Math.min(Math.max(centreY, viewH / 2), photo.height - viewH / 2);
    ctx.drawImage(photo, centreX - viewW / 2, centreY - viewH / 2, viewW, viewH, 0, 0, canvas.width, canvas.height);
  }

  function setPhoto(image, start) {
    photo = image;
    zoom = start.zoom;
    centreX = image.width * start.x;
    centreY = image.height * start.y;
    zoomInput.value = zoom;
    zoomInput.disabled = false;
    saveBtn.disabled = false;
    dialog.classList.add("has-photo");
    draw();
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = src;
    });
  }

  async function readFile(file) {
    if (!file || !file.type.startsWith("image/")) return;
    let objectUrl = null;
    try {
      // createImageBitmap honours the photo's rotation, which phone cameras rely on.
      const image = window.createImageBitmap
        ? await createImageBitmap(file, { imageOrientation: "from-image" })
        : await loadImage((objectUrl = URL.createObjectURL(file)));
      setPhoto(image, START);
    } catch {
      chooseBtn.textContent = "Couldn't open that. Try another photo";
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
  }

  async function open() {
    photo = null;
    zoomInput.disabled = true;
    saveBtn.disabled = true;
    dialog.classList.remove("has-photo");
    chooseBtn.textContent = "Choose a photo";
    draw();
    dialog.showModal();

    // Reopening with a face already set shows it, ready to be replaced.
    const saved = loadSaved();
    if (saved) {
      try {
        setPhoto(await loadImage(saved), { zoom: 1, x: 0.5, y: 0.5 });
        saveBtn.disabled = true;
      } catch {
        // A stored face that no longer loads is treated as no face.
      }
    }
  }

  faceBtn.addEventListener("click", open);
  chooseBtn.addEventListener("click", () => fileInput.click());
  cancelBtn.addEventListener("click", () => dialog.close());

  fileInput.addEventListener("change", () => {
    readFile(fileInput.files[0]);
    fileInput.value = "";
  });

  zoomInput.addEventListener("input", () => {
    zoom = Number(zoomInput.value);
    saveBtn.disabled = false;
    draw();
  });

  canvas.addEventListener("pointerdown", (event) => {
    if (!photo) return;
    drag = { x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!drag) return;
    // Screen pixels to canvas pixels, then to photo pixels.
    const perPixel = canvas.width / canvas.clientWidth / scale();
    centreX -= (event.clientX - drag.x) * perPixel;
    centreY -= (event.clientY - drag.y) * perPixel;
    drag = { x: event.clientX, y: event.clientY };
    saveBtn.disabled = false;
    draw();
  });

  const endDrag = () => {
    drag = null;
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  saveBtn.addEventListener("click", () => {
    const url = canvas.toDataURL("image/jpeg", 0.85);
    store(url);
    apply(url);
    dialog.close();
  });

  resetBtn.addEventListener("click", () => {
    store(null);
    apply(null);
    dialog.close();
  });

  apply(loadSaved());
})();
