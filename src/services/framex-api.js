export const FRAMEX_BACKENDS = [
  "https://api.framextv.xyz",
  "https://api.framextv.cc",
  "https://api.framextv.tech"
];

export const WORKER_RELAYS = [
  "https://crap.hybrows.workers.dev",
  "https://frappe.hybrows.workers.dev"
];

const cache = new Map();

export function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

export function setCached(key, value, ttlMs = 300_000) {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

export async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "application/json, text/plain, */*",
        ...(options.headers || {})
      },
      signal: controller.signal
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchFrameXJson(path, timeoutMs = 4000) {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;

  try {
    return await Promise.any(
      FRAMEX_BACKENDS.map(async (base) => {
        const res = await fetchWithTimeout(`${base}${cleanPath}`, {}, timeoutMs);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status} from ${base}`);
        }
        return await res.json();
      })
    );
  } catch (err) {
    throw new Error(`All FrameX backends failed for ${cleanPath}: ${err.message || err}`);
  }
}
