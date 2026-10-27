import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { manifest } from "./manifest.js";
import { resolveMediaTarget } from "./services/id-mapper.js";
import { getFrameXCatalog, getFrameXMeta } from "./services/catalog-meta.js";
import { resolveBackendProviders } from "./resolvers/framex-backend.js";
import { resolveCineJoyStreams } from "./resolvers/cinejoy.js";
import { resolveNflixStreams } from "./resolvers/nflixtv.js";
import { resolveFrameXSubtitles } from "./resolvers/subtitles.js";
import { fetchWithTimeout, getCached, setCached } from "./services/framex-api.js";
import { rankStreams } from "./services/stream-ranking.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 7000;
const HOST = "0.0.0.0";

app.use(cors());
app.use("/tv", express.static(path.join(__dirname, "../tv")));

function parseExtra(extraParam = "") {
  const extra = {};
  if (!extraParam) return extra;
  const clean = extraParam.replace(/\.json$/i, "");
  for (const part of clean.split("&")) {
    const [k, v] = part.split("=");
    if (k && v !== undefined) {
      extra[decodeURIComponent(k)] = decodeURIComponent(v);
    }
  }
  return extra;
}

function withTimeout(promise, ms, fallbackValue = []) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(fallbackValue), ms))
  ]);
}

app.get("/", (req, res) => {
  const hostHeader = req.headers.host || `192.168.100.40:${PORT}`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>FrameXTV Stremio Addon</title>
  <style>
    body { background: #09090b; color: #f4f4f5; font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .card { background: #18181b; border: 1px solid #27272a; border-radius: 16px; padding: 32px; max-width: 480px; text-align: center; box-shadow: 0 20px 40px rgba(0,0,0,0.6); }
    h1 { margin-top: 0; font-size: 24px; }
    p { color: #a1a1aa; font-size: 14px; line-height: 1.5; }
    .btn { display: inline-block; margin-top: 16px; padding: 12px 24px; background: #fff; color: #000; font-weight: 700; text-decoration: none; border-radius: 10px; }
    code { display: block; background: #09090b; padding: 10px; border-radius: 8px; margin-top: 12px; color: #14F195; font-size: 12px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>FrameXTV Stremio Addon</h1>
    <p>Addon activo con extracción automática de múltiples proveedores (Super Dragon, Titan, Giant, Bowler, Archer Queen, CineJoy 4K y Balloon).</p>
    <code>http://${hostHeader}/manifest.json</code>
    <a class="btn" href="stremio://${hostHeader}/manifest.json">Instalar en Stremio</a>
  </div>
</body>
</html>`);
});

app.get("/manifest.json", (_req, res) => {
  res.json(manifest);
});

app.get(["/catalog/:type/:id.json", "/catalog/:type/:id/:extra.json"], async (req, res) => {
  const { type, id, extra: rawExtra } = req.params;
  const extra = parseExtra(rawExtra);
  console.log(`[Catalog] type=${type} id=${id} extra=${JSON.stringify(extra)}`);
  const metas = await getFrameXCatalog(type, id, extra);
  res.json({ metas });
});

app.get("/meta/:type/:id.json", async (req, res) => {
  const { type, id } = req.params;
  console.log(`[Meta] type=${type} id=${id}`);
  const meta = await getFrameXMeta(type, id);
  res.json({ meta: meta || null });
});

app.get("/stream/:type/:id.json", async (req, res) => {
  const { type, id } = req.params;
  const startTime = Date.now();
  console.log(`[Stream Request] type=${type} id=${id}`);

  const streamCacheKey = `streams_out:${type}:${id}`;
  const cachedStreams = getCached(streamCacheKey);
  if (cachedStreams) {
    console.log(`[Stream Cache Hit] ${id} (${cachedStreams.length} streams)`);
    return res.json({ streams: cachedStreams });
  }

  const target = await resolveMediaTarget(type, id);
  if (!target || !target.tmdbId) {
    console.warn(`[Stream Warning] Could not resolve TMDB ID for ${id}`);
    return res.json({ streams: [] });
  }

  console.log(
    `[Stream Resolved] ${id} -> TMDB=${target.tmdbId} (${target.mediaType} S${target.season}E${target.episode})`
  );

  const [backendRes, cinejoyRes, nflixRes, subsRes] = await Promise.allSettled([
    withTimeout(resolveBackendProviders(target), 4500, []),
    withTimeout(resolveCineJoyStreams(target), 4500, []),
    withTimeout(resolveNflixStreams(target), 4500, []),
    withTimeout(resolveFrameXSubtitles(target), 4500, [])
  ]);

  const allStreams = [
    ...(backendRes.status === "fulfilled" ? backendRes.value : []),
    ...(cinejoyRes.status === "fulfilled" ? cinejoyRes.value : []),
    ...(nflixRes.status === "fulfilled" ? nflixRes.value : [])
  ];

  const subtitles = subsRes.status === "fulfilled" ? subsRes.value : [];

  // Deduplicate streams by URL
  const seen = new Set();
  const dedupedStreams = [];
  for (const s of allStreams) {
    if (!s.url || seen.has(s.url)) continue;
    seen.add(s.url);
    dedupedStreams.push(s);
  }

  // Filter out CAM / <=480p / dead links and sort by fastest real latency (TTFB)
  const finalStreams = await rankStreams(dedupedStreams);
  for (const s of finalStreams) {
    if (subtitles.length > 0) {
      s.subtitles = subtitles;
    }
  }

  if (finalStreams.length > 0) {
    setCached(streamCacheKey, finalStreams, 300_000);
  }

  console.log(
    `[Stream Response] ${id} -> ${finalStreams.length} streams, ${subtitles.length} subtitles in ${
      Date.now() - startTime
    }ms`
  );
  res.json({ streams: finalStreams });
});

app.get("/subtitles/:type/:id.json", async (req, res) => {
  const { type, id } = req.params;
  const target = await resolveMediaTarget(type, id);
  if (!target || !target.tmdbId) {
    return res.json({ subtitles: [] });
  }
  const subtitles = await resolveFrameXSubtitles(target);
  res.json({ subtitles });
});

app.get("/subtitles-proxy", async (req, res) => {
  const targetUrl = String(req.query.url || "").trim();
  if (!targetUrl.startsWith("http")) {
    return res.status(400).send("Invalid subtitle URL");
  }
  try {
    const subRes = await fetchWithTimeout(targetUrl, {}, 6000);
    if (!subRes.ok) return res.status(subRes.status).end();
    let text = await subRes.text();
    if (!text.trim().startsWith("WEBVTT")) {
      const converted = text
        .replace(/\r\n/g, "\n")
        .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2");
      text = `WEBVTT\n\n${converted}`;
    }
    res.setHeader("Content-Type", "text/vtt; charset=utf-8");
    res.send(text);
  } catch {
    res.status(502).end();
  }
});

app.listen(PORT, HOST, () => {
  console.log(`🚀 FrameXTV Stremio Addon running on http://192.168.100.40:${PORT}/manifest.json`);
  console.log(`📺 FrameXTV Smart TV Web App on http://192.168.100.40:${PORT}/tv`);
});
