import { fetchFrameXJson } from "../services/framex-api.js";

const BACKEND_PROVIDERS = [
  { id: "super_dragon", label: "Servidor Dragon", badge: "Multi-Audio" },
  { id: "titan", label: "Servidor Titan", badge: "Direct MP4 1080p" },
  { id: "giant", label: "Servidor Giant", badge: "1080p Multi-Audio" },
  { id: "bowler", label: "Servidor Bowler", badge: "Fast HLS" },
  { id: "archer_queen", label: "Servidor Archer", badge: "Multi-Server" }
];

function formatAudioBadge(source) {
  if (Array.isArray(source.audioTracks) && source.audioTracks.length > 0) {
    const labels = source.audioTracks.map((t) => t.label || t.language || "").filter(Boolean);
    const hasEn = labels.some((l) => /en|eng|english|ingl/i.test(l));
    if (hasEn) {
      return `🔊 Audio: 🇺🇸 English (${labels.join(", ")}) + 🇲🇽 Sub LATAM`;
    }
    return `🔊 Audio: ${labels.join(", ")} + 🇲🇽 Sub LATAM`;
  }
  if (source.hasMultipleAudio) {
    return "🔊 Audio: 🇺🇸 English (Multi-Audio) + 🇲🇽 Sub LATAM";
  }
  return "🔊 Audio: 🇺🇸 English (Original) + 🇲🇽 Sub LATAM";
}

export async function resolveBackendProviders({ tmdbId, mediaType, season = 1, episode = 1 }) {
  const results = await Promise.allSettled(
    BACKEND_PROVIDERS.map(async (prov) => {
      let path = `/api/stream?id=${encodeURIComponent(tmdbId)}&type=${mediaType}&provider=${prov.id}`;
      if (mediaType === "tv") {
        path += `&season=${season}&episode=${episode}`;
      }
      const data = await fetchFrameXJson(path, 4000);
      if (!data?.success || !Array.isArray(data.sources)) {
        return [];
      }
      return data.sources.map((src) => ({
        ...src,
        providerId: prov.id,
        providerLabel: prov.label,
        providerBadge: prov.badge,
        topHeaders: data.headers || src.headers || null
      }));
    })
  );

  const streams = [];
  const seenUrls = new Set();

  for (const res of results) {
    if (res.status !== "fulfilled" || !Array.isArray(res.value)) continue;
    for (const src of res.value) {
      const url = (src.url || "").trim();
      if (!url || !url.startsWith("http") || seenUrls.has(url)) continue;
      seenUrls.add(url);

      const quality = src.quality || "1080p";
      const serverName = (src.server || src.providerLabel || "FrameX")
        .replace(/Archer Queen I/g, "Servidor Archer")
        .replace(/Bowler XVIII/g, "Servidor Bowler")
        .replace(/Super Dragon XIII/g, "Servidor Dragon");
      const format = (src.type || (url.includes(".mp4") ? "mp4" : "hls")).toUpperCase();
      const audioInfo = formatAudioBadge(src);

      const streamObj = {
        name: `FrameXTV\n${quality}`,
        title: `🎬 ${serverName} [${format}]\n${audioInfo}`,
        url
      };

      const headers = src.headers || src.topHeaders;
      if (headers && Object.keys(headers).length > 0 && !src.skipProxy) {
        streamObj.behaviorHints = {
          notWebReady: true,
          proxyHeaders: {
            request: headers
          }
        };
      } else {
        streamObj.behaviorHints = {
          notWebReady: false
        };
      }

      streams.push(streamObj);
    }
  }

  return streams;
}
