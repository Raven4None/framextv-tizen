import { fetchFrameXJson, getCached, setCached } from "../services/framex-api.js";

const ISO_MAP = {
  es: "spa",
  spa: "spa",
  spanish: "spa",
  español: "spa",
  latino: "spa",
  en: "eng",
  eng: "eng",
  english: "eng",
  pt: "por",
  por: "por",
  portuguese: "por",
  fr: "fre",
  fre: "fre",
  fra: "fre",
  it: "ita",
  ita: "ita",
  de: "ger",
  ger: "ger",
  deu: "ger"
};

function normalizeLang(lang, label = "") {
  const lowerLabel = String(label).toLowerCase();
  if (lowerLabel.includes("spanish") || lowerLabel.includes("español") || lowerLabel.includes("latino")) {
    return "spa";
  }
  if (lowerLabel.includes("english")) {
    return "eng";
  }
  const clean = String(lang || "")
    .toLowerCase()
    .split(/[-_]/)[0]
    .trim();
  return ISO_MAP[clean] || clean || "eng";
}

/**
 * Detects Spanish variants. OpenSubtitles-style codes: "spl" = Latin America, "spn" = Spain.
 * Returns "es-419" (LATAM), "es" (generic), "es-ES" (Spain) or null when not Spanish.
 */
function spanishVariant(lang, label = "") {
  const l = String(lang || "").toLowerCase().trim();
  const lbl = String(label || "").toLowerCase();
  if (l === "spl" || l === "es-419" || l === "es-la" || l === "es-mx" || /latin|latino|latam|mexic/.test(lbl)) {
    return "es-419";
  }
  if (l === "spn" || l === "es-es" || /spain|españa|castellano|european/.test(lbl)) {
    return "es-ES";
  }
  if (l === "es" || l === "spa" || /spanish|español/.test(lbl)) {
    return "es";
  }
  return null;
}

function subtitleRank(lang, variant) {
  if (variant === "es-419") return 0;
  if (variant === "es") return 1;
  if (variant === "es-ES") return 2;
  if (lang === "eng") return 3;
  return 4;
}

export async function resolveFrameXSubtitles({ tmdbId, mediaType, season = 1, episode = 1 }) {
  if (!tmdbId) return [];

  const cacheKey = `subs:${mediaType}:${tmdbId}:${season}:${episode}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    let query = `/api/subtitles?id=${encodeURIComponent(tmdbId)}&type=${mediaType}`;
    if (mediaType === "tv") {
      query += `&season=${season}&episode=${episode}`;
    }

    const data = await fetchFrameXJson(query, 4000);
    const rawSubs = Array.isArray(data?.subtitles) ? data.subtitles : [];
    const seen = new Set();
    const formatted = [];

    for (let i = 0; i < rawSubs.length; i++) {
      const sub = rawSubs[i];
      const url = (sub?.url || "").trim();
      if (!url || !url.startsWith("http") || seen.has(url)) continue;
      seen.add(url);

      const variant = spanishVariant(sub.lang || sub.language, sub.label);
      const lang = variant ? "spa" : normalizeLang(sub.lang || sub.language, sub.label);
      formatted.push({
        id: `framex-sub-${i}-${variant || lang}`,
        url,
        lang,
        _rank: subtitleRank(lang, variant)
      });
    }

    // Priority: Spanish LATAM > Spanish (generic) > Spanish (Spain) > English > others.
    // Stremio picks the first track matching the user's preferred language, so order matters.
    formatted.sort((a, b) => a._rank - b._rank);
    for (const s of formatted) delete s._rank;

    setCached(cacheKey, formatted, 900_000);
    return formatted;
  } catch {
    return [];
  }
}
