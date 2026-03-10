const CENTER_IMAGE_NAME = "anillo.png";
const IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif|bmp|avif)$/i;
const VIDEO_EXT_RE = /\.(mp4|webm|ogg|mov|m4v)$/i;
const MEDIA_EXT_RE = /\.(png|jpe?g|webp|gif|bmp|avif|mp4|webm|ogg|mov|m4v)$/i;
const SYNC_INTERVAL_MS = 5000;
const LIMIT_STEP = 8;

const orbit = document.getElementById("orbit");
const ringButton = orbit.querySelector(".ring-center");
const ringImage = ringButton.querySelector("img");
const lightbox = document.getElementById("lightbox");
const lightboxImage = document.getElementById("lightboxImage");
const lightboxVideo = document.getElementById("lightboxVideo");
const closeButton = document.getElementById("close");
const monthTabs = Array.from(document.querySelectorAll(".book-tab"));
const monthPages = Array.from(document.querySelectorAll("[data-month-page]"));

let activePhotos = [];
let previousSignature = "";
let previousLimitBucket = 1;
let layoutSeed = Math.floor(Math.random() * 2147483647);
let syncTimer = null;
let reflowTimer = null;
let motionTargetX = 0;
let motionTargetY = 0;
let motionAnimId = null;
let motionBound = false;
let motionButton = null;
const photoMotion = new WeakMap();
let currentLightboxIndex = -1;
let touchStartX = 0;
let touchStartY = 0;

function mediaKindFromName(name) {
  return VIDEO_EXT_RE.test(name) ? "video" : "image";
}

function openLightbox(src, altText, kind = "image") {
  currentLightboxIndex = activePhotos.findIndex((item) => item.src === src);

  if (kind === "video") {
    lightboxImage.style.display = "none";
    lightboxImage.removeAttribute("src");
    lightboxVideo.style.display = "block";
    lightboxVideo.src = src;
    lightboxVideo.setAttribute("aria-label", altText || "Video ampliado");
    lightboxVideo.load();
    lightboxVideo.play().catch(() => {});
  } else {
    lightboxVideo.pause();
    lightboxVideo.style.display = "none";
    lightboxVideo.removeAttribute("src");
    lightboxImage.style.display = "block";
    lightboxImage.src = src;
    lightboxImage.alt = altText;
  }

  lightbox.classList.add("open");
  lightbox.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeLightbox() {
  lightboxVideo.pause();
  lightboxVideo.style.display = "none";
  lightboxVideo.removeAttribute("src");
  lightboxImage.style.display = "block";
  lightbox.classList.remove("open");
  lightbox.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  currentLightboxIndex = -1;
}

function openLightboxByIndex(index) {
  if (!activePhotos.length) {
    return;
  }

  const wrapped = ((index % activePhotos.length) + activePhotos.length) % activePhotos.length;
  const item = activePhotos[wrapped];
  openLightbox(item.src, item.caption || `Momento ${wrapped + 1}`, item.kind || "image");
}

function activateMonth(month) {
  monthTabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.month === month);
  });

  monthPages.forEach((page) => {
    const active = page.dataset.monthPage === month;
    page.classList.toggle("active", active);
    page.setAttribute("aria-hidden", active ? "false" : "true");
  });

  if (month !== "1") {
    closeLightbox();
  } else {
    layoutPhotos();
    applyMotion();
  }
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function createRng(seed) {
  let t = seed >>> 0;
  return function next() {
    t += 0x6D2B79F5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function collectionSignature(collection) {
  const items = collection.photos.map((item) => item.key || item.name.toLowerCase()).join("|");
  return `${collection.centerKey || collection.centerName.toLowerCase()}|${items}`;
}

function fallbackCollection() {
  return {
    centerName: CENTER_IMAGE_NAME,
    centerKey: CENTER_IMAGE_NAME,
    centerSrc: CENTER_IMAGE_NAME,
    photos: []
  };
}

function normalizeCollection(data) {
  const centerRaw = typeof data?.center === "string" ? data.center.trim() : CENTER_IMAGE_NAME;
  const centerName = centerRaw || CENTER_IMAGE_NAME;
  const photosRaw = Array.isArray(data?.photos) ? data.photos : [];

  const cleanPhotos = photosRaw
    .map((entry, index) => {
      if (typeof entry === "string") {
        const name = entry.trim();
        if (!name) {
          return null;
        }
        return {
          name,
          src: name,
          key: name.toLowerCase(),
          kind: mediaKindFromName(name),
          caption: `Momento ${index + 1}`
        };
      }

      if (entry && typeof entry === "object" && typeof entry.src === "string") {
        const src = entry.src.trim();
        if (!src) {
          return null;
        }
        const baseName = src.split("/").pop() || src;
        return {
          name: baseName,
          src,
          key: src.toLowerCase(),
          kind: mediaKindFromName(src),
          caption: typeof entry.caption === "string" && entry.caption.trim()
            ? entry.caption.trim()
            : `Momento ${index + 1}`
        };
      }

      return null;
    })
    .filter((item) => item && MEDIA_EXT_RE.test(item.src) && item.src.toLowerCase() !== centerName.toLowerCase());

  const uniqueMap = new Map();
  cleanPhotos.forEach((item) => {
    if (!uniqueMap.has(item.key)) {
      uniqueMap.set(item.key, item);
    }
  });

  const unique = Array.from(uniqueMap.values()).sort((a, b) => a.name.localeCompare(b.name, "es", { numeric: true }));

  return {
    centerName,
    centerKey: centerName.toLowerCase(),
    centerSrc: centerName,
    photos: unique
  };
}

async function readFromJson() {
  const response = await fetch("photos.json", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("photos-json-unavailable");
  }

  const data = await response.json();
  const normalized = normalizeCollection(data);
  if (!normalized.photos.length) {
    throw new Error("photos-json-empty");
  }
  return normalized;
}

async function readFromDirectoryListing() {
  const response = await fetch("./", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("listing-unavailable");
  }

  const html = await response.text();
  const doc = new DOMParser().parseFromString(html, "text/html");
  const files = [];

  doc.querySelectorAll("a[href]").forEach((anchor) => {
    const rawHref = anchor.getAttribute("href");
    if (!rawHref || rawHref.startsWith("#") || rawHref.startsWith("?")) {
      return;
    }

    let fileName = "";
    try {
      const url = new URL(rawHref, window.location.href);
      fileName = decodeURIComponent(url.pathname.split("/").pop() || "");
    } catch (_error) {
      fileName = decodeURIComponent(rawHref.split("/").pop() || "");
    }

    if (fileName && MEDIA_EXT_RE.test(fileName)) {
      files.push(fileName);
    }
  });

  const unique = Array.from(new Set(files));
  if (!unique.length) {
    throw new Error("listing-empty");
  }

  const centerName = unique.find((name) => name.toLowerCase() === CENTER_IMAGE_NAME) || CENTER_IMAGE_NAME;
  const photos = unique
    .filter((name) => name.toLowerCase() !== centerName.toLowerCase())
    .sort((a, b) => a.localeCompare(b, "es", { numeric: true }))
    .map((name, index) => ({
      name,
      src: name,
      key: name.toLowerCase(),
      kind: mediaKindFromName(name),
      caption: `Momento ${index + 1}`
    }));

  return {
    centerName,
    centerKey: centerName.toLowerCase(),
    centerSrc: centerName,
    photos
  };
}

async function getCollection() {
  try {
    return await readFromJson();
  } catch (_jsonError) {
    try {
      return await readFromDirectoryListing();
    } catch (_listingError) {
      return fallbackCollection();
    }
  }
}

function renderPhotos() {
  orbit.querySelectorAll(".photo").forEach((node) => node.remove());

  const fragment = document.createDocumentFragment();
  activePhotos.forEach((item, index) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "photo";
    card.dataset.src = item.src;
    card.dataset.kind = item.kind || "image";
    card.style.setProperty("--i", String(index));
    card.style.setProperty("--depth", (0.75 + (index % 4) * 0.12).toFixed(2));
    card.style.setProperty("--s", "1");
    card.style.setProperty("--mx", "0px");
    card.style.setProperty("--my", "0px");
    card.style.setProperty("--mr", "0deg");

    if ((item.kind || "image") === "video") {
      const video = document.createElement("video");
      video.src = item.src;
      video.muted = true;
      video.loop = true;
      video.autoplay = true;
      video.playsInline = true;
      video.preload = "metadata";
      video.setAttribute("aria-label", item.caption || `Video ${index + 1}`);
      card.appendChild(video);
    } else {
      const img = document.createElement("img");
      img.src = item.src;
      img.alt = item.caption || `Recuerdo ${index + 1}`;
      img.loading = "lazy";
      card.appendChild(img);
    }

    const caption = document.createElement("p");
    caption.className = "caption";
    caption.textContent = item.caption || `Momento ${index + 1}`;

    card.appendChild(caption);
    photoMotion.set(card, {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      r: 0,
      vr: 0,
      phase: Math.random() * Math.PI * 2,
      spring: 0.05 + Math.random() * 0.03,
      damping: 0.81 + Math.random() * 0.08
    });
    fragment.appendChild(card);
  });

  orbit.appendChild(fragment);
}

function applyMotion(now = performance.now()) {
  const cards = orbit.querySelectorAll(".photo");
  const t = now * 0.001;
  cards.forEach((card) => {
    let state = photoMotion.get(card);
    if (!state) {
      state = {
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        r: 0,
        vr: 0,
        phase: Math.random() * Math.PI * 2,
        spring: 0.06,
        damping: 0.86
      };
      photoMotion.set(card, state);
    }

    const depth = Number(card.style.getPropertyValue("--depth")) || 1;
    const idleX = Math.sin(t * 1.9 + state.phase) * (0.9 + depth * 0.7);
    const idleY = Math.cos(t * 1.4 + state.phase * 0.8) * (0.5 + depth * 0.55);
    const targetX = (motionTargetX * depth) + idleX;
    const targetY = (motionTargetY * depth) + idleY;

    state.vx += (targetX - state.x) * state.spring;
    state.vy += (targetY - state.y) * state.spring;
    state.vx *= state.damping;
    state.vy *= state.damping;
    state.x += state.vx;
    state.y += state.vy;

    const rotTarget = (state.x * 0.85) + (state.vx * 0.35);
    state.vr += (rotTarget - state.r) * 0.11;
    state.vr *= 0.82;
    state.r += state.vr;

    const speed = Math.hypot(state.vx, state.vy);
    card.style.setProperty("--mx", `${state.x.toFixed(2)}px`);
    card.style.setProperty("--my", `${state.y.toFixed(2)}px`);
    card.style.setProperty("--mr", `${state.r.toFixed(2)}deg`);
    card.style.setProperty("--swing-speed", speed.toFixed(4));
  });
}

function updateMotion(normalizedX, normalizedY) {
  motionTargetX = clamp(normalizedX, -2.2, 2.2) * 26;
  motionTargetY = clamp(normalizedY, -2.2, 2.2) * 20;
}

function startMotionPhysics() {
  if (motionAnimId != null) {
    return;
  }

  const step = (now) => {
    applyMotion(now);
    motionAnimId = requestAnimationFrame(step);
  };

  motionAnimId = requestAnimationFrame(step);
}

function bindDeviceMotion() {
  if (motionBound) {
    return;
  }
  motionBound = true;
  window.addEventListener("devicemotion", (event) => {
    const acc = event.accelerationIncludingGravity || event.acceleration;
    if (!acc) {
      return;
    }

    // Movement-based input: reacts to phone shifts (left/right, up/down),
    // without relying on orientation angles.
    const ax = typeof acc.x === "number" ? acc.x : 0;
    const ay = typeof acc.y === "number" ? acc.y : 0;
    const nx = clamp(ax / 2.2, -2.2, 2.2);
    const ny = clamp((-ay) / 2.6, -2.2, 2.2);
    updateMotion(nx, ny);
  }, { passive: true });
}

function ensureMotionPermissionButton() {
  if (typeof DeviceOrientationEvent === "undefined" || typeof DeviceOrientationEvent.requestPermission !== "function") {
    bindDeviceMotion();
    return;
  }

  motionButton = document.createElement("button");
  motionButton.type = "button";
  motionButton.className = "motion-toggle";
  motionButton.textContent = "Activar movimiento";
  motionButton.addEventListener("click", async () => {
    try {
      const state = await DeviceOrientationEvent.requestPermission();
      if (state === "granted") {
        bindDeviceMotion();
        motionButton?.remove();
      }
    } catch (_error) {
      // Ignore permission errors, keep static layout.
    }
  });
  document.body.appendChild(motionButton);
}

function layoutPhotos() {
  const cards = Array.from(orbit.querySelectorAll(".photo"));
  const ring = orbit.querySelector(".ring-center");
  if (!cards.length || !ring) {
    return;
  }

  const orbitRect = orbit.getBoundingClientRect();
  const sampleRect = cards[0].getBoundingClientRect();
  const compact = orbitRect.width < 980;
  const cardW = sampleRect.width;
  const cardH = sampleRect.height;
  const ringRadiusX = ring.offsetWidth / 2;
  const ringRadiusY = ring.offsetHeight / 2;
  const margin = compact ? 14 : 28;
  const ringGap = compact ? 18 : 22;

  const maxRadiusX = Math.max(0, orbitRect.width / 2 - cardW / 2 - margin);
  const maxRadiusY = Math.max(0, orbitRect.height / 2 - cardH / 2 - margin);
  const minRadiusX = ringRadiusX + (cardW * (compact ? 0.52 : 0.58)) + ringGap;
  const minRadiusY = ringRadiusY + (cardH * (compact ? 0.48 : 0.56)) + ringGap;
  const startX = Math.min(minRadiusX, maxRadiusX);
  const startY = Math.min(minRadiusY, maxRadiusY);
  const ringSpanX = Math.max(0, maxRadiusX - startX);
  const ringSpanY = Math.max(0, maxRadiusY - startY);
  const desiredRings = compact
    ? (activePhotos.length > 20 ? 3 : activePhotos.length > 6 ? 2 : 1)
    : (activePhotos.length > 30 ? 4 : activePhotos.length > 14 ? 3 : activePhotos.length > 7 ? 2 : 1);
  const fitByX = Math.max(1, Math.floor(ringSpanX / (cardW * (compact ? 0.82 : 0.7))) + 1);
  const fitByY = Math.max(1, Math.floor(ringSpanY / (cardH * (compact ? 0.8 : 0.65))) + 1);
  const ringCount = Math.min(desiredRings, Math.min(fitByX, fitByY));

  const groups = Array.from({ length: ringCount }, () => []);
  const rng = createRng(layoutSeed + activePhotos.length * 97);
  const shuffled = cards.slice();

  if (activePhotos.length > 12) {
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
  }

  shuffled.forEach((card, index) => {
    groups[index % ringCount].push(card);
  });

  const gentleLayout = activePhotos.length <= 16;

  groups.forEach((group, ringIndex) => {
    if (!group.length) {
      return;
    }

    const ratio = ringCount === 1 ? 1 : ringIndex / (ringCount - 1);
    const radiusX = clamp(startX + ringSpanX * ratio, startX, maxRadiusX);
    const radiusY = clamp(startY + ringSpanY * ratio, startY, maxRadiusY);
    const angleStep = (Math.PI * 2) / group.length;
    const angleOffset = gentleLayout
      ? (-Math.PI / 2) + (ringIndex % 2 ? angleStep / 2 : 0)
      : rng() * Math.PI * 2;
    group.forEach((card, index) => {
      const jitterRange = gentleLayout
        ? (compact ? 0.03 : 0.018)
        : Math.min(0.18, angleStep * 0.2);
      const jitter = (rng() - 0.5) * jitterRange;
      const angle = angleOffset + (index * angleStep) + jitter;
      const tx = Math.cos(angle) * radiusX;
      const ty = Math.sin(angle) * radiusY;
      const tilt = gentleLayout
        ? Math.round((rng() - 0.5) * (compact ? 6 : 5))
        : Math.round((rng() - 0.5) * (compact ? 9 : 11));
      card.style.setProperty("--tx", `${tx.toFixed(1)}px`);
      card.style.setProperty("--ty", `${ty.toFixed(1)}px`);
      card.style.setProperty("--r", `${tilt}deg`);
    });
  });
}

function triggerReflowAnimation() {
  orbit.classList.remove("reflow");
  if (reflowTimer) {
    clearTimeout(reflowTimer);
  }
  requestAnimationFrame(() => {
    orbit.classList.add("reflow");
    reflowTimer = setTimeout(() => {
      orbit.classList.remove("reflow");
    }, 1000);
  });
}

async function refreshCollection({ forceShuffle = false } = {}) {
  const collection = await getCollection();
  const signature = collectionSignature(collection);
  const changed = signature !== previousSignature;

  if (!changed && !forceShuffle) {
    layoutPhotos();
    return;
  }

  closeLightbox();
  activePhotos = collection.photos;
  ringButton.dataset.src = collection.centerSrc;
  ringButton.dataset.kind = "image";
  ringImage.src = collection.centerSrc;
  previousSignature = signature;

  const nextLimitBucket = Math.max(1, Math.ceil(activePhotos.length / LIMIT_STEP));
  const crossedLimit = nextLimitBucket !== previousLimitBucket;
  previousLimitBucket = nextLimitBucket;

  if (changed || crossedLimit || forceShuffle) {
    layoutSeed = Math.floor(Math.random() * 2147483647);
  }

  renderPhotos();
  layoutPhotos();
  applyMotion();
  triggerReflowAnimation();
}

function startSyncLoop() {
  if (syncTimer) {
    clearInterval(syncTimer);
  }

  syncTimer = setInterval(() => {
    refreshCollection();
  }, SYNC_INTERVAL_MS);
}

refreshCollection({ forceShuffle: true });
startSyncLoop();

window.addEventListener("load", () => refreshCollection());
window.addEventListener("resize", () => {
  layoutPhotos();
  applyMotion();
});
window.addEventListener("mousemove", (event) => {
  const nx = ((event.clientX / window.innerWidth) - 0.5) * 2;
  const ny = ((event.clientY / window.innerHeight) - 0.5) * 2;
  updateMotion(nx, ny);
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    refreshCollection();
  }
});

monthTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    activateMonth(tab.dataset.month || "1");
  });
});

orbit.addEventListener("click", (event) => {
  const target = event.target.closest("[data-src]");
  if (!target) {
    return;
  }

  const src = target.dataset.src;
  const kind = target.dataset.kind || "image";
  const altText = target.querySelector("img")?.alt || target.querySelector(".caption")?.textContent || "Media ampliada";
  openLightbox(src, altText, kind);
});

closeButton.addEventListener("click", closeLightbox);

lightbox.addEventListener("click", (event) => {
  if (event.target === lightbox) {
    closeLightbox();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeLightbox();
  }
  if (!lightbox.classList.contains("open")) {
    return;
  }
  if (event.key === "ArrowRight") {
    openLightboxByIndex(currentLightboxIndex + 1);
  } else if (event.key === "ArrowLeft") {
    openLightboxByIndex(currentLightboxIndex - 1);
  }
});

lightbox.addEventListener("touchstart", (event) => {
  if (!lightbox.classList.contains("open")) {
    return;
  }
  const t = event.changedTouches[0];
  touchStartX = t.clientX;
  touchStartY = t.clientY;
}, { passive: true });

lightbox.addEventListener("touchend", (event) => {
  if (!lightbox.classList.contains("open")) {
    return;
  }
  const t = event.changedTouches[0];
  const dx = t.clientX - touchStartX;
  const dy = t.clientY - touchStartY;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);

  // Horizontal swipe to switch media.
  if (absX > 45 && absX > absY * 1.2) {
    if (dx < 0) {
      openLightboxByIndex(currentLightboxIndex + 1);
    } else {
      openLightboxByIndex(currentLightboxIndex - 1);
    }
  }
}, { passive: true });

ensureMotionPermissionButton();
startMotionPhysics();

