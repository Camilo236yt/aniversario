const CENTER_IMAGE_NAME = "anillo.png";
const DEFAULT_COLLECTION_SOURCE = "photos.json";
const VIDEO_EXT_RE = /\.(mp4|webm|ogg|mov|m4v)$/i;
const MEDIA_EXT_RE = /\.(png|jpe?g|webp|gif|bmp|avif|mp4|webm|ogg|mov|m4v)$/i;
const MONTH_5_DIRECTORY = "x-meses/meses-5/";
const MONTH_5_COLLECTION = {
  center: `${MONTH_5_DIRECTORY}WhatsApp Video 2026-07-29 at 6.21.17 PM.mp4`,
  photos: [
    "WhatsApp Image 2026-07-29 at 6.20.50 PM (1).jpeg",
    "WhatsApp Image 2026-07-29 at 6.20.50 PM.jpeg",
    "WhatsApp Image 2026-07-29 at 6.20.52 PM (1).jpeg",
    "WhatsApp Image 2026-07-29 at 6.20.52 PM.jpeg",
    "WhatsApp Image 2026-07-29 at 6.21.12 PM (1).jpeg",
    "WhatsApp Image 2026-07-29 at 6.21.12 PM.jpeg",
    "WhatsApp Image 2026-07-29 at 6.21.13 PM.jpeg",
    "WhatsApp Image 2026-07-29 at 6.21.14 PM (1).jpeg",
    "WhatsApp Image 2026-07-29 at 6.21.14 PM (2).jpeg",
    "WhatsApp Image 2026-07-29 at 6.21.14 PM.jpeg",
    "WhatsApp Image 2026-07-29 at 6.21.15 PM (1).jpeg",
    "WhatsApp Image 2026-07-29 at 6.21.15 PM.jpeg",
    "WhatsApp Image 2026-07-29 at 6.21.16 PM (1).jpeg",
    "WhatsApp Image 2026-07-29 at 6.21.16 PM (2).jpeg",
    "WhatsApp Image 2026-07-29 at 6.21.16 PM.jpeg",
    "WhatsApp Video 2026-07-29 at 6.21.17 PM (1).mp4",
    "WhatsApp Image 2026-07-29 at 6.21.17 PM.jpeg"
  ].map((name) => `${MONTH_5_DIRECTORY}${name}`)
};
const SYNC_INTERVAL_MS = 120000;
const LIMIT_STEP = 8;
const RESIZE_SETTLE_MS = 120;
const POINTER_REST_DELAY_MS = 140;
const MOTION_FRAME_MS = 1000 / 30;
const IS_FILE_PROTOCOL = window.location.protocol === "file:";
const motionMediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

const lightbox = document.getElementById("lightbox");
const lightboxImage = document.getElementById("lightboxImage");
const lightboxVideo = document.getElementById("lightboxVideo");
const closeButton = document.getElementById("close");
const lightboxPrev = document.getElementById("lightboxPrev");
const lightboxNext = document.getElementById("lightboxNext");
const lightboxCount = document.getElementById("lightboxCount");
const backgroundMusic = document.getElementById("backgroundMusic");
const musicToggle = document.getElementById("musicToggle");
const beatHearts = document.getElementById("beatHearts");
const monthTabs = Array.from(document.querySelectorAll(".book-tab"));
const monthPages = Array.from(document.querySelectorAll("[data-month-page]"));
const defaultMonth = monthTabs.find((tab) => tab.classList.contains("active"))?.dataset.month
  || monthTabs[0]?.dataset.month
  || "1";

let activeMonth = defaultMonth;
let activeAlbum = null;
let activeOrbit = null;
let activeRingButton = null;
let activeRingImage = null;
let activeCollectionSource = DEFAULT_COLLECTION_SOURCE;
let activePhotos = [];
let activeCards = [];
let previousSignature = "";
let previousLimitBucket = 1;
let layoutSeed = Math.floor(Math.random() * 2147483647);
let syncTimer = null;
let reflowTimer = null;
let resizeTimer = null;
let motionTargetX = 0;
let motionTargetY = 0;
let motionAnimId = null;
let lastMotionFrameAt = 0;
let motionBound = false;
let motionButton = null;
let pointerFrameId = null;
let pointerResetTimer = null;
let pointerClientX = window.innerWidth / 2;
let pointerClientY = window.innerHeight / 2;
let videoCardObserver = null;
const photoMotion = new WeakMap();
let currentLightboxIndex = -1;
let touchStartX = 0;
let touchStartY = 0;
let refreshGeneration = 0;
let activeRefreshController = null;
let shouldResumeMusicAfterLightboxVideo = false;
let audioContext = null;
let audioSource = null;
let audioAnalyser = null;
let audioData = null;
let musicFrameId = null;
let smoothedMusicLevel = 0;
let smoothedMusicBass = 0;
let smoothedMusicMid = 0;
let smoothedMusicTreble = 0;
let lastBeatHeartAt = 0;

function mediaKindFromName(name) {
  return VIDEO_EXT_RE.test(name) ? "video" : "image";
}

function isAbortError(error) {
  return Boolean(error && typeof error === "object" && error.name === "AbortError");
}

function setActiveAlbumContext(month = activeMonth) {
  activeMonth = month;
  refreshGeneration += 1;

  const page = monthPages.find((entry) => entry.dataset.monthPage === month) || null;
  const album = page?.querySelector("[data-album]") || null;

  activeAlbum = album;
  activeOrbit = album?.querySelector("[data-orbit]") || null;
  activeRingButton = activeOrbit?.querySelector(".ring-center") || null;
  activeRingImage = activeRingButton?.querySelector("img, video") || null;
  activeCollectionSource = album?.dataset.source || DEFAULT_COLLECTION_SOURCE;

  const ringSource = activeRingButton?.dataset.src || "";
  const ringKind = activeRingButton?.dataset.kind || mediaKindFromName(ringSource);
  const ringHasSource = Boolean(activeRingImage?.getAttribute("src") || activeRingImage?.currentSrc);
  if (activeRingImage && ringSource && !ringHasSource) {
    setRingCenterMedia(activeRingButton, ringSource, ringKind);
  }

  if (!activeAlbum) {
    activePhotos = [];
    activeCards = [];
    previousSignature = "";
    previousLimitBucket = 1;
  }
}

function hasActiveAlbum() {
  return Boolean(activeAlbum && activeOrbit && activeRingButton && activeRingImage);
}

function shouldAnimateMotion() {
  return hasActiveAlbum() && !document.hidden && !motionMediaQuery.matches;
}

function shouldSyncCollection() {
  return hasActiveAlbum() && !document.hidden && !IS_FILE_PROTOCOL;
}

function shouldAutoplayAlbumVideos() {
  return hasActiveAlbum()
    && (activeRingButton?.dataset.kind === "video" || activePhotos.some((item) => item.kind === "video"))
    && !document.hidden;
}

function resetMotionState() {
  motionTargetX = 0;
  motionTargetY = 0;
  activeCards.forEach((card) => {
    const state = photoMotion.get(card);
    if (state) {
      state.x = 0;
      state.y = 0;
      state.vx = 0;
      state.vy = 0;
      state.r = 0;
      state.vr = 0;
    }
    card.style.setProperty("--mx", "0px");
    card.style.setProperty("--my", "0px");
    card.style.setProperty("--mr", "0deg");
  });
}

function stopMotionPhysics({ reset = false } = {}) {
  if (motionAnimId != null) {
    cancelAnimationFrame(motionAnimId);
    motionAnimId = null;
  }
  if (pointerFrameId != null) {
    cancelAnimationFrame(pointerFrameId);
    pointerFrameId = null;
  }
  if (pointerResetTimer) {
    clearTimeout(pointerResetTimer);
    pointerResetTimer = null;
  }
  if (reset) {
    resetMotionState();
  }
}

function stopVideoPreviewPlayback(scope = activeOrbit, { includeCenter = true } = {}) {
  if (videoCardObserver) {
    videoCardObserver.disconnect();
    videoCardObserver = null;
  }

  if (!scope) {
    return;
  }

  const selector = includeCenter ? ".photo video, .ring-center video" : ".photo video";
  scope.querySelectorAll(selector).forEach((video) => {
    video.pause();
  });
}

function playVideoPreview(video) {
  if (!shouldAutoplayAlbumVideos()) {
    return;
  }

  const playAttempt = video.play();
  if (playAttempt && typeof playAttempt.catch === "function") {
    playAttempt.catch(() => {});
  }
}

function syncVideoPreviewPlayback() {
  stopVideoPreviewPlayback(activeOrbit, { includeCenter: false });

  if (!shouldAutoplayAlbumVideos() || !activeOrbit) {
    return;
  }

  const centerVideo = activeOrbit.querySelector(".ring-center video");
  if (centerVideo) {
    playVideoPreview(centerVideo);
  }

  const videos = Array.from(activeOrbit.querySelectorAll(".photo video"));
  if (!videos.length) {
    return;
  }

  if (!("IntersectionObserver" in window)) {
    videos.forEach((video) => {
      playVideoPreview(video);
    });
    return;
  }

  videoCardObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const video = entry.target;
      if (
        entry.isIntersecting
        && entry.intersectionRatio >= 0.35
        && shouldAutoplayAlbumVideos()
        && video.closest("[data-orbit]") === activeOrbit
      ) {
        playVideoPreview(video);
      } else {
        video.pause();
      }
    });
  }, {
    root: activeOrbit,
    rootMargin: "120px 0px 120px 0px",
    threshold: [0.35, 0.7]
  });

  videos.forEach((video) => {
    videoCardObserver.observe(video);
  });
}

function openLightbox(src, altText, kind = "image") {
  currentLightboxIndex = activePhotos.findIndex((item) => item.src === src);
  updateLightboxNavigation();

  if (kind === "video") {
    pauseBackgroundMusicForLightboxVideo();
    lightboxImage.style.display = "none";
    lightboxImage.removeAttribute("src");
    lightboxVideo.style.display = "block";
    lightboxVideo.src = src;
    lightboxVideo.setAttribute("aria-label", altText || "Video ampliado");
    lightboxVideo.load();
    lightboxVideo.play().catch(() => {});
  } else {
    lightboxVideo.pause();
    restoreBackgroundMusicAfterLightboxVideo();
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
  restoreBackgroundMusicAfterLightboxVideo();
  lightboxVideo.style.display = "none";
  lightboxVideo.removeAttribute("src");
  lightboxImage.style.display = "block";
  lightbox.classList.remove("open");
  lightbox.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  currentLightboxIndex = -1;
  updateLightboxNavigation();
}

function updateLightboxNavigation() {
  const hasMoments = activePhotos.length > 0;
  if (lightboxPrev) {
    lightboxPrev.disabled = !hasMoments;
  }
  if (lightboxNext) {
    lightboxNext.disabled = !hasMoments;
  }
  if (lightboxCount) {
    lightboxCount.textContent = currentLightboxIndex >= 0
      ? `Momento ${currentLightboxIndex + 1} de ${activePhotos.length}`
      : "Momento central";
  }
}

function openLightboxByIndex(index) {
  if (!activePhotos.length) {
    return;
  }

  const wrapped = ((index % activePhotos.length) + activePhotos.length) % activePhotos.length;
  const item = activePhotos[wrapped];
  openLightbox(item.src, item.caption || `Momento ${wrapped + 1}`, item.kind || "image");
}

function navigateLightbox(direction) {
  if (!activePhotos.length) {
    return;
  }
  const nextIndex = currentLightboxIndex < 0
    ? (direction > 0 ? 0 : activePhotos.length - 1)
    : currentLightboxIndex + direction;
  openLightboxByIndex(nextIndex);
}

function activateMonth(month) {
  const previousOrbit = activeOrbit;
  stopVideoPreviewPlayback(previousOrbit);
  setActiveAlbumContext(month);

  monthTabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.month === month);
  });

  monthPages.forEach((page) => {
    const active = page.dataset.monthPage === month;
    page.classList.toggle("active", active);
    page.setAttribute("aria-hidden", active ? "false" : "true");
  });

  closeLightbox();

  if (hasActiveAlbum()) {
    refreshCollection({ forceShuffle: true }).catch(() => {});
  }

  syncRuntimeState();
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
    centerKind: "image",
    photos: []
  };
}

function setRingCenterMedia(button, src, kind = "image") {
  if (!button) {
    return null;
  }

  const normalizedKind = kind === "video" ? "video" : "image";
  const expectedTag = normalizedKind === "video" ? "VIDEO" : "IMG";
  let media = button.querySelector("img, video");

  if (!media || media.tagName !== expectedTag) {
    media?.remove();
    media = document.createElement(normalizedKind === "video" ? "video" : "img");
    button.appendChild(media);
  }

  if (normalizedKind === "video") {
    media.src = src;
    media.muted = true;
    media.defaultMuted = true;
    media.autoplay = true;
    media.loop = true;
    media.playsInline = true;
    media.preload = "metadata";
    media.disablePictureInPicture = true;
    media.setAttribute("autoplay", "");
    media.setAttribute("muted", "");
    media.setAttribute("aria-label", "Momento central del album");
    media.load();
    media.play().catch(() => {});
  } else {
    media.src = src;
    media.alt = "Momento central del album";
    media.loading = "eager";
    media.decoding = "async";
    media.fetchPriority = "high";
  }

  button.dataset.src = src;
  button.dataset.kind = normalizedKind;
  activeRingImage = media;
  return media;
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

  const unique = Array.from(uniqueMap.values());

  return {
    centerName,
    centerKey: centerName.toLowerCase(),
    centerSrc: centerName,
    centerKind: mediaKindFromName(centerName),
    photos: unique
  };
}

async function readFromJson(source = DEFAULT_COLLECTION_SOURCE) {
  const response = await fetch(source, {
    cache: "default",
    signal: activeRefreshController?.signal
  });
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

async function getCollection({ source = DEFAULT_COLLECTION_SOURCE } = {}) {
  try {
    return await readFromJson(source);
  } catch (jsonError) {
    if (isAbortError(jsonError)) {
      throw jsonError;
    }
    if (source === "photos-5.json") {
      return normalizeCollection(MONTH_5_COLLECTION);
    }
    return fallbackCollection();
  }
}

function renderPhotos() {
  if (!activeOrbit) {
    return;
  }

  activeCards.forEach((node) => node.remove());

  const fragment = document.createDocumentFragment();
  const nextCards = [];
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
      video.playsInline = true;
      video.preload = "none";
      video.disablePictureInPicture = true;
      video.setAttribute("aria-hidden", "true");
      video.setAttribute("aria-label", item.caption || `Video ${index + 1}`);
      card.appendChild(video);
    } else {
      const img = document.createElement("img");
      img.src = item.src;
      img.alt = item.caption || `Recuerdo ${index + 1}`;
      img.loading = "lazy";
      img.decoding = "async";
      img.fetchPriority = "low";
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
    nextCards.push(card);
  });

  activeCards = nextCards;
  activeOrbit.appendChild(fragment);
}

function applyMotion(now = performance.now()) {
  if (!activeOrbit || !activeCards.length) {
    return;
  }

  const t = now * 0.001;
  activeCards.forEach((card) => {
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
  if (motionAnimId != null || !shouldAnimateMotion()) {
    return;
  }

  const step = (now) => {
    if (!shouldAnimateMotion()) {
      stopMotionPhysics();
      return;
    }
    if (now - lastMotionFrameAt >= MOTION_FRAME_MS) {
      lastMotionFrameAt = now;
      applyMotion(now);
    }
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
    if (!shouldAnimateMotion()) {
      return;
    }
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
  if (!activeOrbit || !activeCards.length) {
    return;
  }

  const ring = activeOrbit.querySelector(".ring-center");
  if (!ring) {
    return;
  }

  const orbitRect = activeOrbit.getBoundingClientRect();
  const sampleRect = activeCards[0].getBoundingClientRect();
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
  const shuffled = activeCards.slice();

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
  if (!activeOrbit) {
    return;
  }

  const orbitNode = activeOrbit;
  orbitNode.classList.remove("reflow");
  if (reflowTimer) {
    clearTimeout(reflowTimer);
  }
  requestAnimationFrame(() => {
    if (orbitNode !== activeOrbit) {
      return;
    }
    orbitNode.classList.add("reflow");
    reflowTimer = setTimeout(() => {
      orbitNode.classList.remove("reflow");
    }, 1000);
  });
}

async function refreshCollection({ forceShuffle = false } = {}) {
  if (!hasActiveAlbum()) {
    return;
  }

  if (activeRefreshController) {
    activeRefreshController.abort();
  }
  const controller = new AbortController();
  activeRefreshController = controller;

  const requestGeneration = refreshGeneration;
  const currentRingButton = activeRingButton;
  const currentRingImage = activeRingImage;
  try {
    const collection = await getCollection({
      source: activeCollectionSource
    });

    if (
      requestGeneration !== refreshGeneration
      || currentRingButton !== activeRingButton
      || currentRingImage !== activeRingImage
    ) {
      return;
    }

    const signature = collectionSignature(collection);
    const changed = signature !== previousSignature;

    if (!changed && !forceShuffle) {
      layoutPhotos();
      return;
    }

    closeLightbox();
    activePhotos = collection.photos;
    setRingCenterMedia(currentRingButton, collection.centerSrc, collection.centerKind);
    previousSignature = signature;

    const nextLimitBucket = Math.max(1, Math.ceil(activePhotos.length / LIMIT_STEP));
    const crossedLimit = nextLimitBucket !== previousLimitBucket;
    previousLimitBucket = nextLimitBucket;

    if (changed || crossedLimit || forceShuffle) {
      layoutSeed = Math.floor(Math.random() * 2147483647);
    }

  renderPhotos();
  layoutPhotos();
  syncVideoPreviewPlayback();
  if (shouldAnimateMotion()) {
    applyMotion();
  }
    triggerReflowAnimation();
  } catch (error) {
    if (!isAbortError(error)) {
      throw error;
    }
  } finally {
    if (activeRefreshController === controller) {
      activeRefreshController = null;
    }
  }
}

function startSyncLoop() {
  if (syncTimer || !shouldSyncCollection()) {
    return;
  }

  syncTimer = setInterval(() => {
    refreshCollection().catch(() => {});
  }, SYNC_INTERVAL_MS);
}

function stopSyncLoop() {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
}

function syncRuntimeState() {
  if (shouldAnimateMotion()) {
    startMotionPhysics();
  } else {
    stopMotionPhysics({ reset: true });
  }

  if (shouldAutoplayAlbumVideos()) {
    syncVideoPreviewPlayback();
  } else {
    stopVideoPreviewPlayback();
  }

  if (shouldSyncCollection()) {
    startSyncLoop();
  } else {
    stopSyncLoop();
  }
}

function updateMusicToggleState() {
  if (!musicToggle) {
    return;
  }

  const paused = !backgroundMusic || backgroundMusic.paused;
  const label = paused ? "Reproducir musica" : "Pausar musica";
  const icon = musicToggle.querySelector("[data-music-icon]");
  musicToggle.classList.toggle("paused", paused);
  musicToggle.setAttribute("aria-label", label);
  musicToggle.title = label;
  if (icon) {
    icon.textContent = paused ? "\u266A" : "||";
  }
}

function hideMusicToggle() {
  musicToggle?.classList.remove("show");
  updateMusicToggleState();
}

function showMusicToggle() {
  musicToggle?.classList.add("show");
  updateMusicToggleState();
}

function pauseBackgroundMusicForLightboxVideo() {
  if (!backgroundMusic || backgroundMusic.paused) {
    return;
  }

  shouldResumeMusicAfterLightboxVideo = true;
  backgroundMusic.pause();
}

function restoreBackgroundMusicAfterLightboxVideo() {
  if (!shouldResumeMusicAfterLightboxVideo) {
    return;
  }

  shouldResumeMusicAfterLightboxVideo = false;
  tryPlayBackgroundMusic({ fromGesture: true });
}

function setMusicVariables({ level = 0, bass = 0, mid = 0, treble = 0 } = {}) {
  const root = document.documentElement;
  root.style.setProperty("--music-level", level.toFixed(3));
  root.style.setProperty("--music-bass", bass.toFixed(3));
  root.style.setProperty("--music-mid", mid.toFixed(3));
  root.style.setProperty("--music-treble", treble.toFixed(3));
}

function resetMusicVariables() {
  smoothedMusicLevel = 0;
  smoothedMusicBass = 0;
  smoothedMusicMid = 0;
  smoothedMusicTreble = 0;
  setMusicVariables();
}

function averageAudioBins(start, end) {
  if (!audioData) {
    return 0;
  }

  const last = Math.min(end, audioData.length);
  if (start >= last) {
    return 0;
  }

  let total = 0;
  for (let index = start; index < last; index += 1) {
    total += audioData[index];
  }
  return total / ((last - start) * 255);
}

function emitBeatHeart(beatStrength = 0.5) {
  if (!beatHearts) {
    return;
  }

  const heart = document.createElement("span");
  heart.className = "beat-heart";
  const strength = Math.min(Math.max(beatStrength, 0.25), 1);
  const x = 10 + Math.random() * 80;
  const drift = (Math.random() - 0.5) * 34;
  const size = 18 + strength * 28 + Math.random() * 12;
  const duration = 1.7 + Math.random() * 0.7;
  const rotate = -28 + Math.random() * 56;
  const spin = -42 + Math.random() * 84;
  const hue = 338 + Math.random() * 18;
  const light = 62 + Math.random() * 12;

  heart.style.setProperty("--x", `${x.toFixed(1)}vw`);
  heart.style.setProperty("--drift", `${drift.toFixed(1)}vw`);
  heart.style.setProperty("--size", `${size.toFixed(1)}px`);
  heart.style.setProperty("--dur", `${duration.toFixed(2)}s`);
  heart.style.setProperty("--rot", `${rotate.toFixed(1)}deg`);
  heart.style.setProperty("--spin", `${spin.toFixed(1)}deg`);
  heart.style.setProperty("--beat", strength.toFixed(3));
  heart.style.setProperty("--heart-hue", hue.toFixed(1));
  heart.style.setProperty("--heart-light", `${light.toFixed(1)}%`);
  beatHearts.appendChild(heart);

  heart.addEventListener("animationend", () => {
    heart.remove();
  }, { once: true });
}

function maybeEmitBeatHeart(bass, level) {
  const now = performance.now();
  const beatRise = bass - smoothedMusicBass;
  if (bass < 0.11 || beatRise < 0.025 || now - lastBeatHeartAt < 95) {
    return;
  }

  lastBeatHeartAt = now;
  const strength = Math.max(bass, level);
  const burstCount = bass > 0.58 ? 5 : bass > 0.4 ? 4 : bass > 0.24 ? 3 : 2;

  for (let index = 0; index < burstCount; index += 1) {
    setTimeout(() => {
      emitBeatHeart(Math.max(0.3, strength - (index * 0.05)));
    }, index * 45);
  }

  if (bass > 0.5) {
    setTimeout(() => emitBeatHeart(Math.max(level, bass * 0.9)), 190);
  }
}

function initMusicAnalyser() {
  if (audioAnalyser) {
    return true;
  }
  if (!backgroundMusic) {
    return false;
  }

  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) {
    return false;
  }

  try {
    audioContext = new AudioContextCtor();
    audioAnalyser = audioContext.createAnalyser();
    audioAnalyser.fftSize = 128;
    audioAnalyser.smoothingTimeConstant = 0.82;
    audioSource = audioContext.createMediaElementSource(backgroundMusic);
    audioSource.connect(audioAnalyser);
    audioAnalyser.connect(audioContext.destination);
    audioData = new Uint8Array(audioAnalyser.frequencyBinCount);
    return true;
  } catch (_error) {
    audioContext = null;
    audioSource = null;
    audioAnalyser = null;
    audioData = null;
    return false;
  }
}

function updateMusicEffects() {
  if (
    !audioAnalyser
    || !audioData
    || !backgroundMusic
    || backgroundMusic.paused
    || document.hidden
    || motionMediaQuery.matches
  ) {
    stopMusicEffects();
    return;
  }

  audioAnalyser.getByteFrequencyData(audioData);
  const bass = averageAudioBins(0, 8);
  const mid = averageAudioBins(8, 24);
  const treble = averageAudioBins(24, audioData.length);
  const level = Math.min(1, (bass * 0.48) + (mid * 0.34) + (treble * 0.18));
  maybeEmitBeatHeart(bass, level);

  smoothedMusicLevel += (level - smoothedMusicLevel) * 0.18;
  smoothedMusicBass += (bass - smoothedMusicBass) * 0.2;
  smoothedMusicMid += (mid - smoothedMusicMid) * 0.16;
  smoothedMusicTreble += (treble - smoothedMusicTreble) * 0.14;

  setMusicVariables({
    level: smoothedMusicLevel,
    bass: smoothedMusicBass,
    mid: smoothedMusicMid,
    treble: smoothedMusicTreble
  });

  musicFrameId = requestAnimationFrame(updateMusicEffects);
}

function startMusicEffects() {
  if (!backgroundMusic || backgroundMusic.paused || motionMediaQuery.matches) {
    return;
  }

  if (!initMusicAnalyser()) {
    return;
  }

  document.body.classList.add("music-reactive");
  if (audioContext?.state === "suspended") {
    audioContext.resume().catch(() => {});
  }

  if (musicFrameId == null) {
    musicFrameId = requestAnimationFrame(updateMusicEffects);
  }
}

function stopMusicEffects() {
  if (musicFrameId != null) {
    cancelAnimationFrame(musicFrameId);
    musicFrameId = null;
  }
  document.body.classList.remove("music-reactive");
  beatHearts?.replaceChildren();
  resetMusicVariables();
}

function tryPlayBackgroundMusic({ fromGesture = false } = {}) {
  if (!backgroundMusic) {
    return;
  }

  backgroundMusic.volume = 0.68;
  const playAttempt = backgroundMusic.play();
  if (playAttempt && typeof playAttempt.then === "function") {
    playAttempt
      .then(() => {
        hideMusicToggle();
        startMusicEffects();
      })
      .catch(() => {
        if (fromGesture || !backgroundMusic.paused) {
          return;
        }
        showMusicToggle();
      });
  } else {
    hideMusicToggle();
    startMusicEffects();
  }
}

setActiveAlbumContext(activeMonth);
refreshCollection({ forceShuffle: true }).catch(() => {});
syncRuntimeState();
tryPlayBackgroundMusic();

window.addEventListener("load", () => {
  if (!activeCards.length && !activeRefreshController) {
    refreshCollection({ forceShuffle: true }).catch(() => {});
  }
});
window.addEventListener("resize", () => {
  if (resizeTimer) {
    clearTimeout(resizeTimer);
  }
  resizeTimer = setTimeout(() => {
    layoutPhotos();
    if (shouldAnimateMotion()) {
      applyMotion();
    }
  }, RESIZE_SETTLE_MS);
});
window.addEventListener("pointermove", (event) => {
  if (!shouldAnimateMotion()) {
    return;
  }

  pointerClientX = event.clientX;
  pointerClientY = event.clientY;
  if (pointerResetTimer) {
    clearTimeout(pointerResetTimer);
  }
  pointerResetTimer = setTimeout(() => {
    updateMotion(0, 0);
  }, POINTER_REST_DELAY_MS);

  if (pointerFrameId != null) {
    return;
  }

  pointerFrameId = requestAnimationFrame(() => {
    pointerFrameId = null;
    const nx = ((pointerClientX / window.innerWidth) - 0.5) * 2;
    const ny = ((pointerClientY / window.innerHeight) - 0.5) * 2;
    updateMotion(nx, ny);
  });
}, { passive: true });

document.addEventListener("visibilitychange", () => {
  syncRuntimeState();
  if (!document.hidden) {
    refreshCollection().catch(() => {});
    if (backgroundMusic && !backgroundMusic.paused) {
      startMusicEffects();
    }
  } else {
    stopMusicEffects();
  }
});

if (typeof motionMediaQuery.addEventListener === "function") {
  motionMediaQuery.addEventListener("change", () => {
    syncRuntimeState();
    if (motionMediaQuery.matches) {
      stopMusicEffects();
    } else if (backgroundMusic && !backgroundMusic.paused) {
      startMusicEffects();
    }
  });
}

monthTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    activateMonth(tab.dataset.month || "1");
  });
});

document.addEventListener("click", (event) => {
  const target = event.target.closest(".orbit [data-src]");
  if (!target) {
    return;
  }

  if (!activeOrbit || target.closest("[data-orbit]") !== activeOrbit) {
    return;
  }

  const src = target.dataset.src;
  const kind = target.dataset.kind || "image";
  const altText = target.querySelector("img")?.alt || target.querySelector(".caption")?.textContent || "Media ampliada";
  openLightbox(src, altText, kind);
});

closeButton.addEventListener("click", closeLightbox);
lightboxPrev?.addEventListener("click", () => navigateLightbox(-1));
lightboxNext?.addEventListener("click", () => navigateLightbox(1));

musicToggle?.addEventListener("click", () => {
  if (!backgroundMusic) {
    return;
  }

  shouldResumeMusicAfterLightboxVideo = false;
  if (backgroundMusic.paused) {
    tryPlayBackgroundMusic({ fromGesture: true });
  } else {
    backgroundMusic.pause();
    updateMusicToggleState();
  }
});

backgroundMusic?.addEventListener("play", () => {
  hideMusicToggle();
  startMusicEffects();
});
backgroundMusic?.addEventListener("pause", () => {
  stopMusicEffects();
  updateMusicToggleState();
});
backgroundMusic?.addEventListener("ended", () => {
  stopMusicEffects();
  updateMusicToggleState();
});

document.addEventListener("pointerdown", () => {
  tryPlayBackgroundMusic({ fromGesture: true });
}, { once: true, passive: true });

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
    navigateLightbox(1);
  } else if (event.key === "ArrowLeft") {
    navigateLightbox(-1);
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
      navigateLightbox(1);
    } else {
      navigateLightbox(-1);
    }
  }
}, { passive: true });

ensureMotionPermissionButton();
startMotionPhysics();
