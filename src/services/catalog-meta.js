import { fetchFrameXJson, getCached, setCached } from "./framex-api.js";

export async function getFrameXCatalog(stremioType, catalogId, extra = {}) {
  const mediaType = stremioType === "series" ? "tv" : "movie";
  const searchQuery = (extra.search || "").trim();
  const skip = parseInt(extra.skip || "0", 10) || 0;
  const page = Math.floor(skip / 20) + 1;

  const cacheKey = `catalog:${mediaType}:${searchQuery || "trending"}:${page}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const endpoint = searchQuery
      ? `/api/search?q=${encodeURIComponent(searchQuery)}&type=${mediaType}&page=${page}`
      : `/api/discover?type=${mediaType}&category=trending&page=${page}`;

    const data = await fetchFrameXJson(endpoint, 8000);
    const items = Array.isArray(data?.results) ? data.results : [];

    const metas = items.map((item) => ({
      id: `framex:${item.id}`,
      type: stremioType,
      name: item.title || item.name || "Untitled",
      poster: item.poster || item.image || undefined,
      background: item.backdrop || undefined,
      description: item.overview || "",
      releaseInfo: item.year ? String(item.year) : undefined,
      imdbRating: item.rating ? String(item.rating) : undefined,
      genres: Array.isArray(item.genres) ? item.genres : undefined
    }));

    return setCached(cacheKey, metas, 600_000);
  } catch (err) {
    console.error(`[Catalog Error] ${err.message}`);
    return [];
  }
}

export async function getFrameXMeta(stremioType, rawId) {
  const mediaType = stremioType === "series" ? "tv" : "movie";
  const tmdbId = String(rawId).replace(/^(framex:|tmdb:)/i, "").split(":")[0];
  if (!tmdbId) return null;

  const cacheKey = `meta:${mediaType}:${tmdbId}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const details = await fetchFrameXJson(
      `/api/details?id=${encodeURIComponent(tmdbId)}&type=${mediaType}`,
      8000
    );
    if (!details || !details.success) return null;

    const meta = {
      id: `framex:${tmdbId}`,
      type: stremioType,
      name: details.title || "Untitled",
      poster: details.poster || undefined,
      background: details.backdrop || undefined,
      description: details.overview || "",
      releaseInfo: details.year ? String(details.year) : undefined,
      imdbRating: details.rating ? String(details.rating) : undefined,
      runtime: details.runtime ? `${details.runtime} min` : undefined,
      genres: Array.isArray(details.genres) ? details.genres : undefined,
      cast: Array.isArray(details.cast)
        ? details.cast.slice(0, 8).map((c) => c.name).filter(Boolean)
        : undefined
    };

    if (mediaType === "tv" && Array.isArray(details.seasons)) {
      const validSeasons = details.seasons
        .map((s) => ({
          number: s.number ?? s.season_number ?? 0
        }))
        .filter((s) => s.number > 0)
        .slice(0, 15);

      const seasonResponses = await Promise.allSettled(
        validSeasons.map((s) =>
          fetchFrameXJson(`/api/season?id=${encodeURIComponent(tmdbId)}&season=${s.number}`, 7000)
        )
      );

      const videos = [];
      for (let idx = 0; idx < validSeasons.length; idx++) {
        const sNum = validSeasons[idx].number;
        const sRes = seasonResponses[idx];
        if (sRes.status !== "fulfilled" || !Array.isArray(sRes.value?.episodes)) continue;

        for (const ep of sRes.value.episodes) {
          const epNum = ep.number ?? ep.episode_number ?? 1;
          const airDate = ep.airDate || ep.air_date;
          videos.push({
            id: `framex:${tmdbId}:${sNum}:${epNum}`,
            title: ep.name || `Episodio ${epNum}`,
            season: sNum,
            episode: epNum,
            released: airDate ? new Date(airDate).toISOString() : undefined,
            thumbnail: ep.still || ep.still_path || details.backdrop || undefined,
            overview: ep.overview || ""
          });
        }
      }

      meta.videos = videos;
    }

    return setCached(cacheKey, meta, 900_000);
  } catch (err) {
    console.error(`[Meta Error] ${err.message}`);
    return null;
  }
}
