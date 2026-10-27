import { WORKER_RELAYS, fetchWithTimeout } from "../services/framex-api.js";

async function fetchBalloonWithFailover(targetUrl) {
  try {
    const directRes = await fetchWithTimeout(targetUrl, {}, 4000);
    if (directRes.ok) return directRes;
  } catch {
    // Fallback to FrameXTV Cloudflare worker relays
  }

  for (const relay of WORKER_RELAYS) {
    try {
      const relayUrl = `${relay}/?url=${encodeURIComponent(targetUrl)}`;
      const res = await fetchWithTimeout(relayUrl, {}, 5000);
      if (res.ok) return res;
    } catch {
      continue;
    }
  }
  return null;
}

export async function resolveNflixStreams({ tmdbId, mediaType, season = 1, episode = 1 }) {
  try {
    const params = new URLSearchParams();
    params.set("id", String(tmdbId));
    params.set("type", mediaType === "tv" ? "tv" : "movie");
    if (mediaType === "tv") {
      params.set("season", String(season));
      params.set("episode", String(episode));
    }

    const url = `https://nflixtv.cc/api/mint-direct/api/v1/play?${params.toString()}`;
    const res = await fetchBalloonWithFailover(url);
    if (!res) return [];

    const data = await res.json();
    const rawSources = [...(data.sources || []), ...(data.menuSources || [])];
    if (rawSources.length === 0 && (data.url || data.progressiveUrl)) {
      rawSources.push({
        url: data.url,
        progressiveUrl: data.progressiveUrl,
        quality: data.quality || "1080p"
      });
    }

    const streams = [];
    const seen = new Set();

    for (const s of rawSources) {
      const streamUrl = (s.url || "").trim();
      if (streamUrl && streamUrl.startsWith("http") && !seen.has(streamUrl)) {
        seen.add(streamUrl);
        const quality = s.quality || data.quality || "1080p";
        streams.push({
          name: `FrameXTV\n${quality}`,
          title: `⚡ Servidor NFlix [HLS]\n🔊 Direct Stream + Subtítulos`,
          url: streamUrl,
          behaviorHints: { notWebReady: false }
        });
      }

      const progUrl = (s.progressiveUrl || "").trim();
      if (progUrl && progUrl.startsWith("http") && !seen.has(progUrl)) {
        seen.add(progUrl);
        const quality = s.progressiveQuality || s.quality || "1080p";
        streams.push({
          name: `FrameXTV\n${quality}`,
          title: `⚡ Servidor NFlix [MP4]\n⚡ Direct Progressive MP4`,
          url: progUrl,
          behaviorHints: { notWebReady: false }
        });
      }
    }

    return streams;
  } catch {
    return [];
  }
}
