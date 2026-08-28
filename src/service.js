import { readFileSync } from 'node:fs';

import { config } from './config.js';
import { TtlCache } from './cache.js';
import { fetchProfileRaw } from './linkedin/client.js';
import { normalizeProfile } from './linkedin/normalize.js';

const cache = new TtlCache(config.cacheTtlMs);

const envelope = (profile, { cached = false, partial = {}, source = 'linkedin-voyager' } = {}) => ({
  profile,
  meta: {
    fetchedAt: new Date().toISOString(),
    cached,
    source,
    ...(Object.keys(partial).length > 0 && { partial }),
  },
});

/**
 * Fetches and normalizes one profile, serving from cache when warm.
 *
 * @param {string} publicId
 * @returns {Promise<object>} the API response envelope
 */
export async function getProfile(publicId) {
  const hit = cache.get(publicId);
  if (hit) return envelope(hit.profile, { cached: true, partial: hit.partial });

  const raw = await fetchProfileRaw(publicId);
  const { profile, partial } = normalizeProfile(raw);

  cache.set(publicId, { profile, partial });
  return envelope(profile, { partial });
}

/**
 * The reference payload, normalized through exactly the same code path as a
 * live lookup. Always available — LinkedIn is never contacted — so the API can
 * still demonstrate its output shape when a request is bot-blocked upstream.
 */
let sample = null;

export function getSampleProfile() {
  if (!sample) {
    const raw = JSON.parse(readFileSync(new URL('../fixtures/raw-profile.json', import.meta.url)));
    sample = normalizeProfile(raw);
  }
  return envelope(sample.profile, { partial: sample.partial, source: 'cached-fixture' });
}
