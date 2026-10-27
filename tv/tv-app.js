(() => {
  const state = {
    currentTab: "movie",
    items: [],
    activeItem: null,
    activeStreams: [],
    currentStreamIdx: 0,
    hls: null,
    hudTimer: null
  };

  // Register Samsung Tizen remote keys when running inside Tizen OS
  try {
    if (window.tizen && window.tizen.tvinputdevice) {
      ["MediaPlay", "MediaPause", "MediaPlayPause", "MediaFastForward", "MediaRewind", "ColorF0Red"].forEach((k) => {
        try { window.tizen.tvinputdevice.registerKey(k); } catch {}
      });
    }
  } catch {}

  const gridEl = document.getElementById("catalogGrid");
  const sectionHeading = document.getElementById("sectionHeading");
  const searchBar = document.getElementById("searchBar");
  const searchInput = document.getElementById("searchInput");
  const detailModal = document.getElementById("detailModal");
  const streamsContainer = document.getElementById("streamsContainer");
  const playerScreen = document.getElementById("playerScreen");
  const playerHud = document.getElementById("playerHud");
  const videoEl = document.getElementById("videoEl");

  function getVisibleFocusables() {
    if (playerScreen.classList.contains("open")) {
      return Array.from(playerScreen.querySelectorAll(".focusable"));
    }
    if (detailModal.classList.contains("open")) {
      return Array.from(detailModal.querySelectorAll(".focusable"));
    }
    return Array.from(document.querySelectorAll("header .focusable, main .focusable")).filter(
      (el) => el.offsetParent !== null
    );
  }

  function setFocus(el) {
    if (!el) return;
    document.querySelectorAll(".focusable.focused").forEach((n) => n.classList.remove("focused"));
    el.classList.add("focused");
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }

  function moveFocus(direction) {
    const list = getVisibleFocusables();
    if (list.length === 0) return;
    const current = document.querySelector(".focusable.focused") || list[0];
    if (!current.classList.contains("focused")) {
      setFocus(list[0]);
      return;
    }

    const r1 = current.getBoundingClientRect();
    const cx1 = r1.left + r1.width / 2;
    const cy1 = r1.top + r1.height / 2;

    let best = null;
    let bestScore = Infinity;

    for (const candidate of list) {
      if (candidate === current) continue;
      const r2 = candidate.getBoundingClientRect();
      const cx2 = r2.left + r2.width / 2;
      const cy2 = r2.top + r2.height / 2;
      const dx = cx2 - cx1;
      const dy = cy2 - cy1;

      if (direction === "left" && dx >= -10) continue;
      if (direction === "right" && dx <= 10) continue;
      if (direction === "up" && dy >= -10) continue;
      if (direction === "down" && dy <= 10) continue;

      const primary = direction === "left" || direction === "right" ? Math.abs(dx) : Math.abs(dy);
      const orth = direction === "left" || direction === "right" ? Math.abs(dy) : Math.abs(dx);
      const dist = primary + orth * 2.6;

      if (dist < bestScore) {
        bestScore = dist;
        best = candidate;
      }
    }

    if (best) setFocus(best);
  }

  async function loadCatalog(type, searchQuery = "") {
    gridEl.innerHTML = `<div style="grid-column: 1 / -1; color: #9ca3af; font-size: 20px;">Cargando catálogo...</div>`;
    const catalogId = type === "series" ? "framextv_series" : "framextv_movies";
    const extraPath = searchQuery ? `/search=${encodeURIComponent(searchQuery)}` : "";
    try {
      const res = await fetch(`/catalog/${type}/${catalogId}${extraPath}.json`);
      const data = await res.json();
      state.items = data.metas || [];
      renderGrid();
    } catch {
      gridEl.innerHTML = `<div style="grid-column: 1 / -1; color: #f43f5e;">Error cargando catálogo</div>`;
    }
  }

  function renderGrid() {
    gridEl.innerHTML = "";
    for (const item of state.items) {
      const card = document.createElement("div");
      card.className = "card focusable";
      card.tabIndex = 0;
      card.innerHTML = `
        <img src="${item.poster || ""}" alt="${item.name}" loading="lazy" />
        <div class="card-overlay">
          <div class="card-title">${item.name}</div>
          <div class="card-meta">${item.releaseInfo || ""} ${item.imdbRating ? "· ★ " + item.imdbRating : ""}</div>
        </div>
      `;
      card.addEventListener("click", () => openDetail(item));
      gridEl.appendChild(card);
    }
    const firstCard = gridEl.querySelector(".card");
    if (firstCard) setFocus(firstCard);
  }

  async function openDetail(item) {
    state.activeItem = item;
    document.getElementById("modalPoster").src = item.poster || "";
    document.getElementById("modalTitle").textContent = item.name;
    document.getElementById("modalSub").textContent = `${(item.type || "movie").toUpperCase()} · ${item.releaseInfo || ""}`;
    document.getElementById("modalDesc").textContent = item.description || "";
    streamsContainer.innerHTML = `<div style="color:#14f195;font-size:20px;">⚡ Midiendo latencia de servidores y filtrando ≤480p / CAM...</div>`;
    detailModal.classList.add("open");

    try {
      let targetId = item.id;
      if ((item.type === "series" || item.type === "tv") && !targetId.includes(":1:1")) {
        targetId = `${targetId}:1:1`;
      }
      const res = await fetch(`/stream/${item.type || "movie"}/${encodeURIComponent(targetId)}.json`);
      const data = await res.json();
      state.activeStreams = data.streams || [];
      renderStreams();
    } catch {
      streamsContainer.innerHTML = `<div style="color:#f43f5e;">Error al resolver servidores.</div>`;
    }
  }

  function renderStreams() {
    streamsContainer.innerHTML = "";
    if (state.activeStreams.length === 0) {
      streamsContainer.innerHTML = `<div style="color:#f43f5e;font-size:20px;">No se encontraron streams ≥720p libres de CAM.</div>`;
      return;
    }

    // Auto-play button at top (automatically picks #1 fastest stream)
    const autoBtn = document.createElement("button");
    autoBtn.className = "stream-btn focusable";
    autoBtn.style.borderColor = "#14f195";
    autoBtn.innerHTML = `
      <div>
        <div style="font-weight:800;font-size:20px;color:#14f195;">▶ Reproducir Ahora (Auto-Fastest)</div>
        <div style="color:#d4d4d8;font-size:15px;margin-top:4px;">${state.activeStreams[0].title.replace(/\n/g, " · ")}</div>
      </div>
      <span class="stream-badge">${state.activeStreams[0].name.replace(/\n/g, " ")}</span>
    `;
    autoBtn.addEventListener("click", () => startPlayback(0));
    streamsContainer.appendChild(autoBtn);

    state.activeStreams.forEach((st, idx) => {
      const btn = document.createElement("button");
      btn.className = "stream-btn focusable";
      btn.innerHTML = `
        <div>
          <div style="font-weight:700;">${st.title.split("\n")[0]}</div>
          <div style="color:#9ca3af;font-size:14px;margin-top:4px;">${st.title.split("\n").slice(1).join(" · ")}</div>
        </div>
        <span class="stream-badge">${st.name.replace(/\n/g, " ")}</span>
      `;
      btn.addEventListener("click", () => startPlayback(idx));
      streamsContainer.appendChild(btn);
    });

    setFocus(autoBtn);
  }

  function attachPreferredSubtitles(stream) {
    // Clear old tracks
    Array.from(videoEl.querySelectorAll("track")).forEach((t) => t.remove());
    const subs = Array.isArray(stream.subtitles) ? stream.subtitles : [];
    const spaSubs = subs.filter((s) => s.lang === "spa" || s.id.includes("es-419")).slice(0, 3);
    const engSubs = subs.filter((s) => s.lang === "eng").slice(0, 1);
    const selected = [...spaSubs, ...engSubs];

    selected.forEach((sub, idx) => {
      const track = document.createElement("track");
      track.kind = "subtitles";
      const isLatam = sub.id.includes("es-419");
      track.label = isLatam ? `Español (Latinoamérica) #${idx + 1}` : sub.lang === "spa" ? `Español #${idx + 1}` : "English";
      track.srclang = sub.lang === "spa" ? "es" : "en";
      track.src = `/subtitles-proxy?url=${encodeURIComponent(sub.url)}`;
      if (idx === 0) track.default = true;
      videoEl.appendChild(track);
    });

    setTimeout(() => {
      if (videoEl.textTracks && videoEl.textTracks.length > 0) {
        for (let i = 0; i < videoEl.textTracks.length; i++) {
          videoEl.textTracks[i].mode = i === 0 ? "showing" : "disabled";
        }
      }
    }, 600);
  }

  function startPlayback(idx) {
    const stream = state.activeStreams[idx];
    if (!stream) return;
    state.currentStreamIdx = idx;

    playerScreen.classList.add("open");
    document.getElementById("hudTitle").textContent = state.activeItem ? state.activeItem.name : "Reproduciendo";
    document.getElementById("hudInfo").textContent = `${stream.title.replace(/\n/g, " · ")} | 🇺🇸 Audio EN + 🇲🇽 Sub LATAM`;
    showHudTemporarily();

    if (state.hls) {
      state.hls.destroy();
      state.hls = null;
    }

    attachPreferredSubtitles(stream);

    if (window.Hls && window.Hls.isSupported() && (stream.url.includes(".m3u8") || stream.title.includes("[HLS]"))) {
      const hls = new window.Hls({
        enableWorker: true,
        startLevel: -1,
        capLevelToPlayerSize: false
      });
      state.hls = hls;
      hls.loadSource(stream.url);
      hls.attachMedia(videoEl);

      hls.on(window.Hls.Events.MANIFEST_PARSED, (_, data) => {
        // Block levels <= 480p when HD (>=720p) levels exist
        const levels = data.levels || [];
        const minHdIdx = levels.findIndex((lv) => (lv.height || 0) >= 720);
        if (minHdIdx > 0) {
          hls.autoLevelCapping = -1;
          hls.currentLevel = levels.length - 1;
        }
        videoEl.play().catch(() => {});
      });

      // Automatically select English audio track when multiple audio tracks exist
      hls.on(window.Hls.Events.AUDIO_TRACKS_UPDATED, (_, data) => {
        const tracks = data.audioTracks || [];
        const engIdx = tracks.findIndex(
          (t) => /en|eng|english|ingl/i.test(`${t.lang || ""} ${t.name || ""}`)
        );
        if (engIdx >= 0 && hls.audioTrack !== engIdx) {
          hls.audioTrack = engIdx;
        }
      });
    } else {
      videoEl.src = stream.url;
      videoEl.play().catch(() => {});
    }
  }

  function closePlayer() {
    if (state.hls) {
      state.hls.destroy();
      state.hls = null;
    }
    videoEl.pause();
    videoEl.removeAttribute("src");
    playerScreen.classList.remove("open");
    const firstBtn = streamsContainer.querySelector(".focusable");
    if (firstBtn) setFocus(firstBtn);
  }

  function showHudTemporarily() {
    playerHud.classList.remove("hidden");
    clearTimeout(state.hudTimer);
    state.hudTimer = setTimeout(() => {
      if (!videoEl.paused) playerHud.classList.add("hidden");
    }, 4000);
  }

  // Top nav & player button actions
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;

    if (action === "tab") {
      document.querySelectorAll(".nav-btn[data-action='tab']").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const tab = btn.dataset.tab;
      if (tab === "search") {
        searchBar.classList.add("visible");
        setFocus(searchInput);
      } else {
        searchBar.classList.remove("visible");
        state.currentTab = tab;
        sectionHeading.textContent = tab === "series" ? "Tendencias en Series" : "Tendencias en Películas";
        loadCatalog(tab);
      }
    } else if (action === "run-search") {
      const q = searchInput.value.trim();
      if (q) {
        sectionHeading.textContent = `Resultados para "${q}"`;
        loadCatalog(state.currentTab, q);
      }
    } else if (action === "player-toggle") {
      if (videoEl.paused) videoEl.play();
      else videoEl.pause();
      showHudTemporarily();
    } else if (action === "player-next-server") {
      const next = (state.currentStreamIdx + 1) % state.activeStreams.length;
      startPlayback(next);
    } else if (action === "player-close") {
      closePlayer();
    }
  });

  // Remote Control (D-Pad, OK/Enter, Back/Return, Media Keys)
  window.addEventListener("keydown", (e) => {
    const code = e.keyCode || e.which;
    const isBack = e.key === "Escape" || e.key === "Backspace" || code === 10009 || code === 461 || code === 4;

    if (playerScreen.classList.contains("open")) {
      showHudTemporarily();
      if (isBack) {
        e.preventDefault();
        closePlayer();
        return;
      }
      if (e.key === "ArrowLeft") {
        videoEl.currentTime = Math.max(0, videoEl.currentTime - 10);
        return;
      }
      if (e.key === "ArrowRight") {
        videoEl.currentTime = Math.min(videoEl.duration || Infinity, videoEl.currentTime + 10);
        return;
      }
      if (e.key === "Enter" || code === 415 || code === 19 || code === 179) {
        e.preventDefault();
        if (videoEl.paused) videoEl.play();
        else videoEl.pause();
        return;
      }
    }

    if (isBack && document.activeElement !== searchInput) {
      if (detailModal.classList.contains("open")) {
        e.preventDefault();
        detailModal.classList.remove("open");
        const firstCard = gridEl.querySelector(".card");
        if (firstCard) setFocus(firstCard);
        return;
      }
    }

    if (e.key === "ArrowLeft") { e.preventDefault(); moveFocus("left"); }
    else if (e.key === "ArrowRight") { e.preventDefault(); moveFocus("right"); }
    else if (e.key === "ArrowUp") { e.preventDefault(); moveFocus("up"); }
    else if (e.key === "ArrowDown") { e.preventDefault(); moveFocus("down"); }
    else if (e.key === "Enter") {
      if (document.activeElement === searchInput) {
        const q = searchInput.value.trim();
        if (q) loadCatalog(state.currentTab, q);
      } else {
        const focused = document.querySelector(".focusable.focused");
        if (focused) {
          e.preventDefault();
          focused.click();
        }
      }
    }
  });

  // Initial load
  loadCatalog("movie");
})();
