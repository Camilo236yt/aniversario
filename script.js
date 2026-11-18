const VIDEO_EXT = /\.(mp4|webm|ogg|mov|m4v)$/i;
const MEDIA_EXT = /\.(png|jpe?g|webp|gif|bmp|avif|mp4|webm|ogg|mov|m4v)$/i;
const PREVIEW_EXT = /\.(png|jpe?g)$/i;

const tabs = [...document.querySelectorAll(".book-tab[data-month]")];
const pages = [...document.querySelectorAll("[data-month-page]")];
const lightbox = document.getElementById("lightbox");
const lightboxImage = document.getElementById("lightboxImage");
const lightboxVideo = document.getElementById("lightboxVideo");
const lightboxCount = document.getElementById("lightboxCount");
const lightboxPrev = document.getElementById("lightboxPrev");
const lightboxNext = document.getElementById("lightboxNext");
const music = document.getElementById("backgroundMusic");
const musicToggle = document.getElementById("musicToggle");
const collections = new WeakMap();

let activePage;
let request;
let viewingIndex = -1;
let opener;
let swipeStart;
let resumeMusic = false;

function previewFor(src) {
  if (src === "anillo.png") return "optimized/anillo.webp";

  if (src.startsWith("x-meses/") && PREVIEW_EXT.test(src)) {
    return src.replace(/^x-meses\//, "optimized/").replace(PREVIEW_EXT, ".webp");
  }

  return src;
}

function normalizeCollection(data, centerButton) {
  const centerSrc = typeof data.center === "string" && MEDIA_EXT.test(data.center.trim())
    ? data.center.trim()
    : centerButton.dataset.src;
  const center = {
    src: centerSrc,
    preview: previewFor(centerSrc),
    caption: "Momento central",
    isVideo: VIDEO_EXT.test(centerSrc)
  };
  const items = [center];
  const seen = new Set([centerSrc.toLowerCase()]);

  data.photos.forEach((entry, index) => {
    const rawSource = typeof entry === "string" ? entry : entry?.src;
    const src = typeof rawSource === "string" ? rawSource.trim() : "";
    if (!MEDIA_EXT.test(src) || seen.has(src.toLowerCase())) return;

    seen.add(src.toLowerCase());
    items.push({
      src,
      preview: typeof entry?.preview === "string" && entry.preview.trim() || previewFor(src),
      caption: typeof entry?.caption === "string" && entry.caption.trim() || `Momento ${index + 1}`,
      isVideo: VIDEO_EXT.test(src)
    });
  });

  return items;
}

function usePreview(img, preview, original) {
  img.onerror = () => {
    img.onerror = null;
    if (preview !== original) img.src = original;
  };

  if (img.getAttribute("src") !== preview) {
    img.src = preview;
  } else if (img.complete && !img.naturalWidth) {
    img.onerror();
  }
}

function videoPlaceholder(src) {
  const placeholder = document.createElement("span");
  placeholder.className = "video-placeholder";
  if (src.startsWith("x-meses/") && /\.mp4$/i.test(src)) {
    const poster = document.createElement("img");
    poster.alt = "";
    poster.loading = "lazy";
    poster.decoding = "async";
    poster.onerror = () => poster.remove();
    poster.src = `${src.replace(/^x-meses\//, "optimized/")}.webp`;
    placeholder.append(poster);
  }
  const label = document.createElement("span");
  label.textContent = "Reproducir video";
  placeholder.append(label);
  return placeholder;
}

function renderAlbum(album, items) {
  const centerButton = album.querySelector(".ring-center");
  const [center, ...photos] = items;

  if (center.isVideo) {
    centerButton.replaceChildren(videoPlaceholder(center.src));
    centerButton.setAttribute("aria-label", "Reproducir el video central");
  } else {
    const img = centerButton.querySelector("img") || document.createElement("img");
    img.alt = "";
    img.decoding = "async";
    img.fetchPriority = "high";
    usePreview(img, center.preview, center.src);
    if (!centerButton.contains(img)) centerButton.replaceChildren(img);
  }

  centerButton.dataset.src = center.src;
  centerButton.dataset.kind = center.isVideo ? "video" : "image";
  centerButton.dataset.index = "0";

  const fragment = document.createDocumentFragment();
  photos.forEach((item, index) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "photo";
    card.dataset.index = String(index + 1);

    if (item.isVideo) {
      card.append(videoPlaceholder(item.src));
    } else {
      const img = document.createElement("img");
      img.alt = "";
      img.loading = "lazy";
      img.decoding = "async";
      usePreview(img, item.preview, item.src);
      card.append(img);
    }

    const caption = document.createElement("span");
    caption.className = "caption";
    caption.textContent = item.caption;
    card.append(caption);
    fragment.append(card);
  });

  album.querySelector(".moments-grid").replaceChildren(fragment);
}

async function selectMonth(month) {
  const page = pages.find((entry) => entry.dataset.monthPage === month);
  if (!page) return;

  request?.abort();
  request = null;
  activePage = page;
  if (lightbox.open) lightbox.close();
  document.body.classList.toggle("theme-month-7", month === "7");

  tabs.forEach((tab) => {
    const selected = tab.dataset.month === month;
    tab.classList.toggle("active", selected);
    tab.setAttribute("aria-pressed", String(selected));
  });

  pages.forEach((entry) => {
    const selected = entry === page;
    entry.hidden = !selected;
    entry.classList.toggle("active", selected);
    entry.setAttribute("aria-hidden", String(!selected));
  });

  const album = page.querySelector("[data-album][data-source]");
  if (!album || collections.has(page)) return;

  const centerButton = album.querySelector(".ring-center");
  const initialImage = centerButton.querySelector("img");
  if (initialImage) {
    usePreview(initialImage, previewFor(centerButton.dataset.src), centerButton.dataset.src);
  }

  const status = album.querySelector(".gallery-status");
  status.hidden = false;
  status.textContent = "Cargando recuerdos…";
  const controller = new AbortController();
  request = controller;

  try {
    const response = await fetch(album.dataset.source, { signal: controller.signal });
    if (!response.ok) throw new Error("No se pudo cargar el álbum");
    const data = await response.json();
    if (controller.signal.aborted) return;
    if (!Array.isArray(data?.photos)) throw new Error("Álbum no válido");

    const items = normalizeCollection(data, centerButton);
    renderAlbum(album, items);
    collections.set(page, items);
    status.hidden = items.length > 1;
    status.textContent = items.length > 1 ? "" : "Este mes tiene un recuerdo central.";
  } catch {
    if (controller.signal.aborted) return;
    status.textContent = "No se pudieron cargar los recuerdos. Selecciona este mes para volver a intentarlo.";
  } finally {
    if (request === controller) request = null;
  }
}

function updateMusicControl() {
  musicToggle.setAttribute("aria-pressed", String(!music.paused));
  musicToggle.title = music.paused ? "Reproducir música" : "Pausar música";
}

function restoreMusic() {
  if (!resumeMusic) return;
  resumeMusic = false;
  music.play().catch(updateMusicControl);
}

function clearVideo() {
  lightboxVideo.pause();
  if (lightboxVideo.hasAttribute("src")) {
    lightboxVideo.removeAttribute("src");
    lightboxVideo.load();
  }
}

function showMoment(index) {
  const items = collections.get(activePage);
  const item = items?.[index];
  if (!item) return;

  viewingIndex = index;
  lightboxCount.textContent = item.caption;
  lightboxPrev.disabled = items.length < 2;
  lightboxNext.disabled = items.length < 2;
  lightboxImage.hidden = item.isVideo;
  lightboxVideo.hidden = !item.isVideo;

  if (!lightbox.open) lightbox.showModal();

  if (item.isVideo) {
    if (!music.paused) {
      resumeMusic = true;
      music.pause();
    }
    lightboxImage.removeAttribute("src");
    lightboxVideo.src = item.src;
    lightboxVideo.setAttribute("aria-label", item.caption);
    lightboxVideo.play().catch(() => {});
  } else {
    clearVideo();
    lightboxImage.alt = item.caption;
    lightboxImage.src = item.src;
    restoreMusic();
  }
}

function navigate(direction) {
  const total = collections.get(activePage)?.length ?? 0;
  if (total > 1) showMoment((viewingIndex + direction + total) % total);
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => selectMonth(tab.dataset.month));
});

document.querySelector("main").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-index]");
  if (!button || !activePage?.contains(button)) return;

  opener = button;
  showMoment(Number(button.dataset.index));
});

document.getElementById("close").addEventListener("click", () => lightbox.close());
lightboxPrev.addEventListener("click", () => navigate(-1));
lightboxNext.addEventListener("click", () => navigate(1));

lightbox.addEventListener("click", (event) => {
  if (event.target === lightbox) lightbox.close();
});

lightbox.addEventListener("close", () => {
  if (lightbox.open) return;
  clearVideo();
  lightboxImage.removeAttribute("src");
  restoreMusic();
  viewingIndex = -1;
  swipeStart = null;
  if (opener && activePage?.contains(opener)) opener.focus({ preventScroll: true });
  opener = null;
});

lightbox.addEventListener("keydown", (event) => {
  if (event.target === lightboxVideo) return;

  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    event.preventDefault();
    navigate(event.key === "ArrowLeft" ? -1 : 1);
  }
});

lightbox.addEventListener("touchstart", (event) => {
  swipeStart = event.target.closest("button") ? null : event.changedTouches[0];
}, { passive: true });

lightbox.addEventListener("touchend", (event) => {
  if (!swipeStart) return;
  const end = event.changedTouches[0];
  const dx = end.clientX - swipeStart.clientX;
  const dy = end.clientY - swipeStart.clientY;
  swipeStart = null;
  if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.2) navigate(dx < 0 ? 1 : -1);
}, { passive: true });

lightbox.addEventListener("touchcancel", () => {
  swipeStart = null;
}, { passive: true });

for (const media of [lightboxImage, lightboxVideo]) {
  media.addEventListener("error", () => {
    if (lightbox.open && !media.hidden && media.hasAttribute("src")) {
      lightboxCount.textContent = "No se pudo cargar este recuerdo.";
    }
  });
}

music.volume = 0.68;
musicToggle.addEventListener("click", () => {
  if (music.paused) {
    music.play().catch(updateMusicControl);
  } else {
    music.pause();
  }
});

["play", "pause", "ended"].forEach((event) => music.addEventListener(event, updateMusicControl));
updateMusicControl();

const firstTab = tabs.find((tab) => tab.classList.contains("active")) || tabs[0];
if (firstTab) selectMonth(firstTab.dataset.month);
