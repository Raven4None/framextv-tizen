const BASE = "http://127.0.0.1:7000";

async function runTests() {
  console.log("=== 1. Testing /manifest.json ===");
  const manRes = await fetch(`${BASE}/manifest.json`);
  const manifest = await manRes.json();
  console.log("Addon ID:", manifest.id, "Name:", manifest.name, "Catalogs:", manifest.catalogs.length);

  console.log("\n=== 2. Testing /catalog/movie/framextv_movies.json ===");
  const catRes = await fetch(`${BASE}/catalog/movie/framextv_movies.json`);
  const catData = await catRes.json();
  console.log("Movies in catalog:", catData.metas?.length);
  if (catData.metas?.length > 0) {
    console.log("First movie:", catData.metas[0].id, "-", catData.metas[0].name);
  }

  console.log("\n=== 3. Testing /stream/movie/tt1375666.json (Inception) ===");
  const movieStreamRes = await fetch(`${BASE}/stream/movie/tt1375666.json`);
  const movieStreamData = await movieStreamRes.json();
  console.log("Streams returned for Inception:", movieStreamData.streams?.length);
  for (const s of (movieStreamData.streams || []).slice(0, 4)) {
    console.log(`  - [${s.name.replace("\n", " ")}] ${s.title.replace("\n", " | ")} (subs: ${s.subtitles?.length || 0})`);
  }

  console.log("\n=== 4. Testing /stream/series/tt0903747:1:1.json (Breaking Bad S1E1) ===");
  const tvStreamRes = await fetch(`${BASE}/stream/series/tt0903747:1:1.json`);
  const tvStreamData = await tvStreamRes.json();
  console.log("Streams returned for Breaking Bad S1E1:", tvStreamData.streams?.length);
  for (const s of (tvStreamData.streams || []).slice(0, 4)) {
    console.log(`  - [${s.name.replace("\n", " ")}] ${s.title.replace("\n", " | ")} (subs: ${s.subtitles?.length || 0})`);
  }
}

runTests().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
