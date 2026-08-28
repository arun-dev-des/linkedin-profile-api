import { readFileSync } from 'node:fs';

import { config } from './config.js';
import { TtlCache } from './cache.js';
import { fetchProfileRaw, fetchProfileSkills } from './linkedin/client.js';
import { extractSkillNames, normalizeProfile } from './linkedin/normalize.js';

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
 * If the main call capped the skills list, spend one extra request on the
 * dedicated finder to get all of them. Best-effort: a failure here leaves the
 * capped list and its `partial.skills` marker in place rather than failing the
 * whole lookup.
 */
async function completeSkills(profile, partial, profileUrn) {
  if (!partial.skills || !profileUrn) return;
  try {
    const full = extractSkillNames(await fetchProfileSkills(profileUrn));
    if (full.length >= profile.skills.length) {
      profile.skills = full;
      delete partial.skills;
    }
  } catch (err) {
    console.warn(`skills completion failed for ${profileUrn}: ${err.code ?? err.message}`);
  }
}

/**
 * Fetches and normalizes one profile, serving from cache when warm.
 *
 * @param {string} publicId
 * @param {object} [opts]
 * @param {boolean} [opts.full]  also fetch the complete skills list (one extra
 *   upstream request, only when the main call capped it at 20)
 * @returns {Promise<object>} the API response envelope
 */
export async function getProfile(publicId, { full = false } = {}) {
  const key = `${publicId}|${full ? 'full' : 'basic'}`;
  const hit = cache.get(key);
  if (hit) return envelope(hit.profile, { cached: true, partial: hit.partial });

  const raw = await fetchProfileRaw(publicId);
  cache.set(`raw|${publicId}`, raw);
  const { profile, partial, profileUrn } = normalizeProfile(raw);

  if (full) await completeSkills(profile, partial, profileUrn);

  cache.set(key, { profile, partial });
  return envelope(profile, { partial });
}

/**
 * The unprocessed Voyager payload for a profile — `data` plus the flat
 * `included[]` entity array, before normalization. Backs the "not normalised"
 * view in the browser UI; a live lookup would populate the cache anyway.
 */
export async function getProfileRaw(publicId) {
  const key = `raw|${publicId}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const raw = await fetchProfileRaw(publicId);
  cache.set(key, raw);
  return raw;
}

/**
 * The reference payload, normalized through exactly the same code path as a
 * live lookup. Always available — LinkedIn is never contacted — so the API can
 * still demonstrate its output shape when a request is bot-blocked upstream.
 */
let sampleRaw = null;
let sample = null;

function readSampleRaw() {
  if (!sampleRaw) {
    sampleRaw = JSON.parse(readFileSync(new URL('../fixtures/raw-profile.json', import.meta.url)));
  }
  return sampleRaw;
}

export function getSampleProfile() {
  if (!sample) sample = normalizeProfile(readSampleRaw());
  return envelope(sample.profile, { partial: sample.partial, source: 'cached-fixture' });
}

/** The unprocessed payload behind /profile/sample. */
export function getSampleRaw() {
  return readSampleRaw();
}
