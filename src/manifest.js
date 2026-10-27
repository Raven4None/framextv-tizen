export const manifest = {
  id: "org.framextv.stremio",
  version: "1.0.0",
  name: "FrameXTV Streams",
  description:
    "Catálogo y Streams directos de FrameXTV (4K / 1080p HLS & MP4, Multi-Audio Español/Inglés y Subtítulos integrados)",
  logo: "https://framextv.cc/icon-512.png",
  background: "https://framextv.cc/icon-512.png",
  types: ["movie", "series"],
  idPrefixes: ["tt", "framex:", "tmdb:"],
  resources: [
    "catalog",
    {
      name: "meta",
      types: ["movie", "series"],
      idPrefixes: ["framex:", "tmdb:"]
    },
    {
      name: "stream",
      types: ["movie", "series"],
      idPrefixes: ["tt", "framex:", "tmdb:"]
    },
    {
      name: "subtitles",
      types: ["movie", "series"],
      idPrefixes: ["tt", "framex:", "tmdb:"]
    }
  ],
  catalogs: [
    {
      type: "movie",
      id: "framextv_movies",
      name: "FrameXTV - Películas",
      extra: [
        { name: "search", isRequired: false },
        { name: "skip", isRequired: false }
      ]
    },
    {
      type: "series",
      id: "framextv_series",
      name: "FrameXTV - Series",
      extra: [
        { name: "search", isRequired: false },
        { name: "skip", isRequired: false }
      ]
    }
  ],
  behaviorHints: {
    configurable: false,
    configurationRequired: false
  }
};
