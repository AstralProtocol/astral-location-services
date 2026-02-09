/**
 * Fetch-based API client for Astral Location Services.
 * Works in both Node.js and browser environments.
 */

// Default schema UIDs registered on Base Sepolia
const DEFAULT_SCHEMAS = {
  84532: {
    numeric: '0xc2b013ecb68d59b28f5d301203ec630335d97c37b400b16b359db6972572e02a',
    boolean: '0x4958625091a773dcfb37a1c33099a378f32a975a7fb61f33d53c4be7589898f5',
  },
};

const DEFAULT_RECIPIENT = '0x0000000000000000000000000000000000000001';

/** Max retries for 429 responses */
const MAX_RETRIES = 3;
/** Base delay for exponential backoff (ms) */
const BASE_RETRY_DELAY = 2000;
/** Max delay between retries (ms) */
const MAX_RETRY_DELAY = 15000;

/**
 * Fetch with automatic retry on 429 (Too Many Requests).
 * Honors Retry-After header when present; falls back to exponential backoff.
 */
async function fetchWithRetry(url, init, retries = MAX_RETRIES) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, init);

    if (res.status !== 429 || attempt === retries) {
      return res;
    }

    // Determine wait time from Retry-After header or exponential backoff
    const retryAfter = res.headers.get('retry-after');
    let waitMs;
    if (retryAfter) {
      const secs = parseInt(retryAfter, 10);
      // Cap the retry-after wait to MAX_RETRY_DELAY
      waitMs = Math.min(secs * 1000, MAX_RETRY_DELAY);
    } else {
      waitMs = Math.min(BASE_RETRY_DELAY * 2 ** attempt, MAX_RETRY_DELAY);
    }

    await new Promise(r => setTimeout(r, waitMs));
  }
}

/**
 * Create an API client for a given base URL.
 * @param {string} baseUrl - The base URL of the API (e.g. 'http://localhost:3000')
 * @param {number} [chainId=84532] - Chain ID for attestation requests
 */
export function createClient(baseUrl, chainId = 84532) {
  const url = baseUrl.replace(/\/$/, '');
  const schemas = DEFAULT_SCHEMAS[chainId] || DEFAULT_SCHEMAS[84532];

  async function request(path, body) {
    const res = await fetchWithRetry(`${url}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    return { status: res.status, ok: res.ok, body: json };
  }

  async function get(path) {
    const res = await fetchWithRetry(`${url}${path}`);
    const json = await res.json().catch(() => null);
    return { status: res.status, ok: res.ok, body: json };
  }

  /** Merge default schema + recipient into opts */
  function numericDefaults(opts) {
    return { schema: schemas.numeric, recipient: DEFAULT_RECIPIENT, ...opts };
  }

  function booleanDefaults(opts) {
    return { schema: schemas.boolean, recipient: DEFAULT_RECIPIENT, ...opts };
  }

  return {
    baseUrl: url,
    chainId,

    /** GET /health */
    health() {
      return get('/health');
    },

    /** GET / (API info) */
    info() {
      return get('/');
    },

    compute: {
      /** POST /compute/v0/distance */
      distance(from, to, opts = {}) {
        return request('/compute/v0/distance', {
          from,
          to,
          chainId,
          ...numericDefaults(opts),
        });
      },

      /** POST /compute/v0/area */
      area(geometry, opts = {}) {
        return request('/compute/v0/area', {
          geometry,
          chainId,
          ...numericDefaults(opts),
        });
      },

      /** POST /compute/v0/length */
      length(geometry, opts = {}) {
        return request('/compute/v0/length', {
          geometry,
          chainId,
          ...numericDefaults(opts),
        });
      },

      /** POST /compute/v0/contains */
      contains(container, containee, opts = {}) {
        return request('/compute/v0/contains', {
          container,
          containee,
          chainId,
          ...booleanDefaults(opts),
        });
      },

      /** POST /compute/v0/within */
      within(geometry, target, radius, opts = {}) {
        return request('/compute/v0/within', {
          geometry,
          target,
          radius,
          chainId,
          ...booleanDefaults(opts),
        });
      },

      /** POST /compute/v0/intersects */
      intersects(geometry1, geometry2, opts = {}) {
        return request('/compute/v0/intersects', {
          geometry1,
          geometry2,
          chainId,
          ...booleanDefaults(opts),
        });
      },
    },

    verify: {
      /** POST /verify/v0/stamp */
      stamp(stamp) {
        return request('/verify/v0/stamp', { stamp });
      },

      /** POST /verify/v0/proof */
      proof(proof, options = {}) {
        return request('/verify/v0/proof', {
          proof,
          options: {
            chainId,
            recipient: DEFAULT_RECIPIENT,
            ...options,
          },
        });
      },

      /** GET /verify/v0/plugins */
      plugins() {
        return get('/verify/v0/plugins');
      },
    },
  };
}
