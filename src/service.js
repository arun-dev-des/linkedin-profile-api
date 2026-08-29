import { readFileSync } from 'node:fs';

import { config } from './config.js';
import { TtlCache } from './cache.js';
import {
  fetchExperienceComponents,
  fetchProfileRaw,
  fetchProfilePositions,
  fetchProfileSkills,
} from './linkedin/client.js';
import {
  extractCareerBreaks,
  extractFullExperience,
  extractSkillNames,
  normalizeProfile,
  sanitizeRawPayload,
} from './linkedin/normalize.js';

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
 * If the main call capped the experience list (10 position groups), spend one
 * extra request on the `profilePositions` finder, which — unlike
 * `profilePositionGroups` — honors `count` and returns every individual role.
 * `companyLogo`/`companyUrl`/`employmentType` are filled back in for roles the
 * main call already resolved (`enrichmentByUrn`); roles recovered only here
 * get `null` for those three. Best-effort, same as completeSkills: a failure
 * leaves the capped list and its `partial.experience` marker in place.
 */
async function completeExperience(profile, partial, profileUrn, enrichmentByUrn) {
  if (!partial.experience || !profileUrn) return;
  try {
    const raw = await fetchProfilePositions(profileUrn);
    const full = extractFullExperience(raw, enrichmentByUrn);
    if (full.length >= profile.experience.length) {
      profile.experience = full;
      delete partial.experience;
    }
  } catch (err) {
    console.warn(`experience completion failed for ${profileUrn}: ${err.code ?? err.message}`);
  }
}

/**
 * Career breaks live only in the server-driven-UI GraphQL response, never in
 * the entity graph the rest of this service reads (see docs/endpoint-map.md),
 * so they cost one extra request on every lookup.
 *
 * Strictly best-effort, and deliberately so: this call depends on a persisted
 * GraphQL query id that LinkedIn versions and retires. When it breaks,
 * `careerBreaks` goes empty and every entity-derived field is unaffected —
 * a lookup must never fail because the SDUI side did.
 */
async function addCareerBreaks(profile, profileUrn) {
  profile.careerBreaks = [];
  if (!profileUrn) return;
  try {
    profile.careerBreaks = extractCareerBreaks(await fetchExperienceComponents(profileUrn));
  } catch (err) {
    console.warn(`career-break lookup failed for ${profileUrn}: ${err.code ?? err.message}`);
  }
}

/**
 * Fetches and normalizes one profile, serving from cache when warm.
 *
 * Always costs one extra request beyond the main call, for career breaks.
 *
 * @param {string} publicId
 * @param {object} [opts]
 * @param {boolean} [opts.full]  also fetch complete skills and experience
 *   lists — up to two further upstream requests, each only when the main call
 *   capped that section
 * @returns {Promise<object>} the API response envelope
 */
export async function getProfile(publicId, { full = false } = {}) {
  const key = `${publicId}|${full ? 'full' : 'basic'}`;
  const hit = cache.get(key);
  if (hit) return envelope(hit.profile, { cached: true, partial: hit.partial });

  const raw = await fetchProfileRaw(publicId);
  cache.set(`raw|${publicId}`, raw);
  const { profile, partial, profileUrn, experienceEnrichment } = normalizeProfile(raw);

  await Promise.all([
    // Always — career breaks aren't a "completion", they're a section the
    // entity graph simply doesn't carry.
    addCareerBreaks(profile, profileUrn),
    ...(full
      ? [
          completeSkills(profile, partial, profileUrn),
          completeExperience(profile, partial, profileUrn, experienceEnrichment),
        ]
      : []),
  ]);

  cache.set(key, { profile, partial });
  return envelope(profile, { partial });
}

/**
 * The unprocessed Voyager payload for a profile — `data` plus the flat
 * `included[]` entity array, before normalization. Backs the "not normalised"
 * view in the browser UI; a live lookup would populate the cache anyway.
 *
 * Sanitized before it leaves this function — see `sanitizeRawPayload()` — but
 * the cache stores the true, unsanitized payload (shared with `getProfile()`,
 * which needs the full graph) and is never mutated in place.
 */
export async function getProfileRaw(publicId) {
  const key = `raw|${publicId}`;
  const hit = cache.get(key);
  if (hit) return sanitizeRawPayload(hit);

  const raw = await fetchProfileRaw(publicId);
  cache.set(key, raw);
  return sanitizeRawPayload(raw);
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

/** The unprocessed payload behind /profile/sample, sanitized the same way as getProfileRaw(). */
export function getSampleRaw() {
  return sanitizeRawPayload(readSampleRaw());
}
