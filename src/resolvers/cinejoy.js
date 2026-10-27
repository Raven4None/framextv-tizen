import crypto from "node:crypto";
import { fetchWithTimeout } from "../services/framex-api.js";

const WING_BASE = "https://api.wing.st";
const CINEJOY_ORIGIN = "https://cinejoy.pk";
const CINEJOY_REFERER = "https://cinejoy.pk/";
const ENC_DEC_API = "https://enc-dec.app/api";

function fromBase64Url(str) {
  let b64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  return new Uint8Array(Buffer.from(b64, "base64"));
}

function toBase64Url(uint8) {
  return Buffer.from(uint8)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function decryptCineJoyPayload(responseKey, aad, encryptedBuffer) {
  const bytes = new Uint8Array(encryptedBuffer);
  const iv = bytes.slice(0, 12);
  const ciphertext = bytes.slice(12);
  const keyBytes = fromBase64Url(responseKey);
  const aadBytes = fromBase64Url(aad);

  const cryptoKey = await crypto.webcrypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );

  const decrypted = await crypto.webcrypto.subtle.decrypt(
    { name: "AES-GCM", iv, additionalData: aadBytes, tagLength: 128 },
    cryptoKey,
    ciphertext
  );

  return JSON.parse(new TextDecoder("utf-8").decode(decrypted));
}

async function queryCineJoyServer(serverName, is4K, mediaType, tmdbId, season, episode) {
  const isSeries = mediaType === "tv" || mediaType === "series";
  let target = `${WING_BASE}/?title=movie&type=${isSeries ? "series" : "movie"}&year=&imdb=&tmdb=${encodeURIComponent(
    tmdbId
  )}&server=${encodeURIComponent(serverName)}`;
  if (isSeries) {
    target += `&season=${season}&episode=${episode}`;
  }

  const encRes = await fetchWithTimeout(
    `${ENC_DEC_API}/enc-cinejoy?url=${encodeURIComponent(target)}`,
    {},
    5000
  );
  if (!encRes.ok) return [];

  const encJson = await encRes.json();
  if (encJson.status !== 200 || !encJson.result?.data) return [];

  const payloadBytes = fromBase64Url(encJson.result.data);
  const state = encJson.result.state;

  const gatewayRes = await fetchWithTimeout(
    `${WING_BASE}/g`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        Accept: "application/json, text/plain, */*"
      },
      body: payloadBytes
    },
    6000
  );
  if (!gatewayRes.ok) return [];

  const arrayBuf = await gatewayRes.arrayBuffer();
  let decoded = null;

  if (state?.responseKey && state?.aad && arrayBuf.byteLength > 28) {
    try {
      decoded = await decryptCineJoyPayload(state.responseKey, state.aad, arrayBuf);
    } catch {
      decoded = null;
    }
  }

  if (!decoded) {
    try {
      const b64Text = toBase64Url(new Uint8Array(arrayBuf));
      const decRes = await fetchWithTimeout(
        `${ENC_DEC_API}/dec-cinejoy`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: b64Text, state })
        },
        5000
      );
      if (decRes.ok) {
        decoded = (await decRes.json()).result;
      }
    } catch {
      decoded = null;
    }
  }

  const streamItems = decoded?.data?.stream || decoded?.stream;
  if (!Array.isArray(streamItems) || streamItems.length === 0) return [];

  const results = [];
  for (const item of streamItems) {
    if (!item || typeof item !== "object") continue;
    if (item.type === "hls" && item.playlist) {
      const rawUrl = item.playlist.trim();
      if (!rawUrl.startsWith("http")) continue;
      const quality = is4K ? "4K / 1080p" : serverName === "Nebula" ? "1080p" : "Auto HD";
      results.push({
        name: `FrameXTV\n${quality}`,
        title: `🎬 CineJoy 4K (${serverName}) [HLS]\n🔊 Multi-Audio HLS + Subtítulos`,
        url: rawUrl,
        behaviorHints: {
          notWebReady: true,
          proxyHeaders: {
            request: {
              Referer: CINEJOY_REFERER,
              Origin: CINEJOY_ORIGIN
            }
          }
        }
      });
    } else if (item.type === "file" && item.qualities && typeof item.qualities === "object") {
      for (const [qLabel, qObj] of Object.entries(item.qualities)) {
        const fileUrl = (qObj?.url || "").trim();
        if (!fileUrl.startsWith("http")) continue;
        results.push({
          name: `FrameXTV\n${qLabel}`,
          title: `🎬 CineJoy (${serverName}) [MP4]\n⚡ Direct MP4 Stream`,
          url: fileUrl,
          behaviorHints: {
            notWebReady: true,
            proxyHeaders: {
              request: {
                Referer: CINEJOY_REFERER,
                Origin: CINEJOY_ORIGIN
              }
            }
          }
        });
      }
    }
  }

  return results;
}

export async function resolveCineJoyStreams({ tmdbId, mediaType, season = 1, episode = 1 }) {
  const servers = [
    ["Lisbon", true],
    ["Nebula", false],
    ["Solara", false]
  ];

  const settled = await Promise.allSettled(
    servers.map(([name, is4K]) => queryCineJoyServer(name, is4K, mediaType, tmdbId, season, episode))
  );

  const out = [];
  const seen = new Set();
  for (const res of settled) {
    if (res.status !== "fulfilled" || !Array.isArray(res.value)) continue;
    for (const s of res.value) {
      if (!seen.has(s.url)) {
        seen.add(s.url);
        out.push(s);
      }
    }
  }
  return out;
}
