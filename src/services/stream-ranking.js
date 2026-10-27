import { fetchWithTimeout } from "./framex-api.js";

/**
 * Stream ranking pipeline:
 *   1. Drop cinema captures (CAM / TS / TC / screeners).
 *   2. Drop anything at or below 480p (declared label or real HLS resolution).
 *   3. Probe every candidate in parallel (TTFB) and drop dead links.
 *   4. Sort by fastest latency; the first stream becomes the auto-selected one.
 */

const CAM_REGEX =
  /(^|[^a-z0-9])(cam|camrip|hdcam|hd-cam|ts|hdts|telesync|tele-sync|telecine|tc|hdtc|scr|screener|dvdscr|bdscr|r5)([^a-z0-9]|$)/i;

const LOW_QUALITY_REGEX = /(^|[^0-9])(144|240|360|380|480)p?([^0-9]|$)|\bSD\b|\bLQ\b/i;

const MIN_HEIGHT = 720; // anything below 720p is considered low quality
const PROBE_TIMEOUT_MS = 2000;

function streamText(stream) {
  return `${stream.name || ""} ${stream.title || ""} ${stream.description || ""}`;
}

export function isCinemaCapture(stream) {
  // Only look at labels and the URL path (query strings contain random tokens like "ts=")
  let urlPath = "";
  try {
    urlPath = new URL(stream.url).pathname;
  } catch {
    urlPath = "";
  }
  return CAM_REGEX.test(streamText(stream)) || CAM_REGEX.test(urlPath.replace(/[/_.]/g, " "));
}

export function isDeclaredLowQuality(stream) {
  const qualityLabel = String(stream.name || "").split("\n").slice(1).join(" ");
  return LOW_QUALITY_REGEX.test(qualityLabel);
}

/** Highest RESOLUTION height advertised in an HLS master playlist, or null. */
function parseMaxHlsHeight(playlistText) {
  let max = null;
  for (const match of playlistText.matchAll(/RESOLUTION=(\d+)x(\d+)/gi)) {
    const h = parseInt(match[2], 10);
    if (!Number.isNaN(h) && (max === null || h > max)) max = h;
  }
  return max;
}

/**
 * Measures time-to-first-byte for a stream and, for HLS masters, reads the real max resolution.
 * Returns { ok, latencyMs, maxHeight }.
 */
export async function probeStream(stream, timeoutMs = PROBE_TIMEOUT_MS) {
  const headers = { ...(stream.behaviorHints?.proxyHeaders?.request || {}) };
  const isHls = /\.m3u8(\?|$)/i.test(stream.url) || /\[HLS\]/.test(stream.title || "");
  if (!isHls) headers.Range = "bytes=0-1023";

  const t0 = Date.now();
  try {
    const res = await fetchWithTimeout(stream.url, { headers }, timeoutMs);
    const latencyMs = Date.now() - t0;
    if (!res.ok && res.status !== 206) {
      res.body?.cancel?.().catch(() => {});
      return { ok: false, latencyMs, maxHeight: null };
    }

    let maxHeight = null;
    if (isHls) {
      const text = await res.text();
      if (!text.includes("#EXTM3U")) return { ok: false, latencyMs, maxHeight: null };
      maxHeight = parseMaxHlsHeight(text);
    } else {
      res.body?.cancel?.().catch(() => {});
    }
    return { ok: true, latencyMs, maxHeight };
  } catch {
    return { ok: false, latencyMs: Date.now() - t0, maxHeight: null };
  }
}

function qualityLabelFromHeight(h) {
  if (!h) return null;
  if (h >= 2000) return "4K";
  if (h >= 1000) return "1080p";
  if (h >= 700) return "720p";
  return `${h}p`;
}

/**
 * Full pipeline. Returns streams sorted by latency, with the fastest flagged as recommended.
 */
export async function rankStreams(streams, { log = console.log } = {}) {
  const stats = { input: streams.length, cam: 0, lowDeclared: 0, dead: 0, lowReal: 0 };

  const candidates = streams.filter((s) => {
    if (isCinemaCapture(s)) {
      stats.cam++;
      return false;
    }
    if (isDeclaredLowQuality(s)) {
      stats.lowDeclared++;
      return false;
    }
    return true;
  });

  const probes = await Promise.all(candidates.map((s) => probeStream(s)));

  const alive = [];
  candidates.forEach((s, i) => {
    const p = probes[i];
    if (!p.ok) {
      stats.dead++;
      return;
    }
    if (p.maxHeight !== null && p.maxHeight < MIN_HEIGHT) {
      stats.lowReal++;
      return;
    }
    alive.push({ stream: s, latencyMs: p.latencyMs, maxHeight: p.maxHeight });
  });

  alive.sort((a, b) => a.latencyMs - b.latencyMs);

  const ranked = alive.map(({ stream, latencyMs, maxHeight }, idx) => {
    const realQuality = qualityLabelFromHeight(maxHeight);
    const [, ...qualityParts] = String(stream.name || "").split("\n");
    const quality = realQuality || qualityParts.join(" ") || "HD";
    const prefix = idx === 0 ? "⚡ Recomendado" : `#${idx + 1}`;
    return {
      ...stream,
      name: `FrameXTV\n${quality}`,
      title: `${prefix} · ${latencyMs} ms\n${stream.title}`,
      behaviorHints: {
        ...(stream.behaviorHints || {}),
        bingeGroup: `framextv-${quality}`
      }
    };
  });

  log(
    `[Ranking] in=${stats.input} cam=${stats.cam} lowLabel=${stats.lowDeclared} lowReal=${stats.lowReal} dead=${stats.dead} out=${ranked.length}` +
      (alive[0] ? ` fastest=${alive[0].latencyMs}ms` : "")
  );
  return ranked;
}
