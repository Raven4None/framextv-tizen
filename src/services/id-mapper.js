import { fetchFrameXJson, fetchWithTimeout, getCached, setCached } from "./framex-api.js";

/**
 * Parses a Stremio ID (e.g., "tt0903747:1:2", "framex:1396:1:2", "tt0137523")
 * and resolves the numeric TMDB ID required by FrameXTV resolvers.
 */
export async function resolveMediaTarget(stremioType, rawId) {
  const mediaType = stremioType === "series" || stremioType === "tv" ? "tv" : "movie";
  const parts = String(rawId).split(":");

  let prefix = "";
  let baseId = parts[0];
  let season = 1;
  let episode = 1;

  if (baseId === "framex" || baseId === "tmdb") {
    prefix = baseId;
    baseId = parts[1] || "";
    if (mediaType === "tv") {
      season = parseInt(parts[2] || "1", 10) || 1;
      episode = parseInt(parts[3] || "1", 10) || 1;
    }
    return {
      tmdbId: String(baseId),
      imdbId: null,
      mediaType,
      season,
      episode
    };
  }

  // Standard IMDb ID: "tt0903747" or "tt0903747:1:2"
  const imdbId = baseId;
  if (mediaType === "tv") {
    season = parseInt(parts[1] || "1", 10) || 1;
    episode = parseInt(parts[2] || "1", 10) || 1;
  }

  if (!imdbId.startsWith("tt")) {
    return {
      tmdbId: String(imdbId),
      imdbId: null,
      mediaType,
      season,
      episode
    };
  }

  const cacheKey = `imdb_map:${mediaType}:${imdbId}`;
  const cached = getCached(cacheKey);
  if (cached) {
    return {
      ...cached,
      mediaType,
      season,
      episode
    };
  }

  // 1. Primary lookup via Stremio Cinemeta (fast, includes moviedb_id directly)
  let title = "";
  let year = "";
  try {
    const cineType = mediaType === "tv" ? "series" : "movie";
    const res = await fetchWithTimeout(
      `https://v3-cinemeta.strem.io/meta/${cineType}/${imdbId}.json`,
      {},
      5000
    );
    if (res.ok) {
      const data = await res.json();
      const meta = data?.meta;
      if (meta?.moviedb_id) {
        const mapped = {
          tmdbId: String(meta.moviedb_id),
          imdbId,
          title: meta.name || "",
          year: String(meta.year || "").slice(0, 4)
        };
        setCached(cacheKey, mapped, 86_400_000); // Cache 24h
        return { ...mapped, mediaType, season, episode };
      }
      if (meta?.name) {
        title = meta.name;
        year = String(meta.year || meta.releaseInfo || "").slice(0, 4);
      }
    }
  } catch {
    // Fallback below
  }

  // 2. Secondary lookup via FrameXTV /api/meta + /api/search
  try {
    if (!title) {
      const metaData = await fetchFrameXJson(`/api/meta?id=${imdbId}&type=${mediaType}`, 5000);
      if (metaData?.title) {
        title = metaData.title.replace(/\s*\(\d{4}\)\s*$/, "").trim();
        year = String(metaData.year || "").slice(0, 4);
      }
    }

    if (title) {
      const searchData = await fetchFrameXJson(
        `/api/search?q=${encodeURIComponent(title)}&type=${mediaType}&page=1`,
        6000
      );
      const results = searchData?.results || [];
      if (results.length > 0) {
        const match =
          results.find(
            (r) =>
              r.title?.toLowerCase() === title.toLowerCase() &&
              (!year || String(r.year || "").startsWith(year))
          ) || results[0];

        if (match?.id) {
          const mapped = {
            tmdbId: String(match.id),
            imdbId,
            title: match.title || title,
            year: String(match.year || year)
          };
          setCached(cacheKey, mapped, 86_400_000);
          return { ...mapped, mediaType, season, episode };
        }
      }
    }
  } catch {
    // Ignore
  }

  return null;
}
