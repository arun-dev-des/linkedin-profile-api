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
  mergePositionsCompletion,
  mergeSkillsCompletion,
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
 *
 * `full: true` merges in the same skills/experience completion calls
 * `getProfile(id, {full: true})` makes, so this view isn't stuck showing the
 * main call's capped lists (20 skills, 10 position groups) while the
 * normalized profile shows the complete ones. Best-effort and cached
 * separately from the base payload — a completion failure here falls back to
 * the base (still-capped) raw payload rather than failing the request; see
 * `mergeSkillsCompletion()`/`mergePositionsCompletion()` for what each merge
 * can and can't repoint.
 */
export async function getProfileRaw(publicId, { full = false } = {}) {
  const baseKey = `raw|${publicId}`;
  let raw = cache.get(baseKey);
  if (!raw) {
    raw = await fetchProfileRaw(publicId);
    cache.set(baseKey, raw);
  }

  if (!full) return sanitizeRawPayload(raw);

  const fullKey = `raw|${publicId}|full`;
  const cachedFull = cache.get(fullKey);
  if (cachedFull) return sanitizeRawPayload(cachedFull);

  const { profileUrn, partial } = normalizeProfile(raw);
  let merged = raw;
  if (partial.skills && profileUrn) {
    try {
      merged = mergeSkillsCompletion(merged, await fetchProfileSkills(profileUrn));
    } catch (err) {
      console.warn(`raw skills completion failed for ${publicId}: ${err.code ?? err.message}`);
    }
  }
  if (partial.experience && profileUrn) {
    try {
      merged = mergePositionsCompletion(merged, await fetchProfilePositions(profileUrn));
    } catch (err) {
      console.warn(`raw experience completion failed for ${publicId}: ${err.code ?? err.message}`);
    }
  }

  cache.set(fullKey, merged);
  return sanitizeRawPayload(merged);
}

/**
 * The reference payload, normalized through exactly the same code path as a
 * live lookup. Always available — LinkedIn is never contacted — so the API can
 * still demonstrate its output shape when a request is bot-blocked upstream.
 *
 * `?full=1` is also available here, same as a live lookup — but never makes a
 * request either: fixtures/raw-positions.json and raw-skills.json are the
 * *complete* completion-call responses for the same fixture subject, captured
 * and committed alongside the base profile, so completing a capped section is
 * just merging two files already on disk.
 */
let sampleRaw = null;
let samplePositions = null;
let sampleSkills = null;
let sample = null;
let sampleFull = null;

const readFixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/${name}.json`, import.meta.url)));

function readSampleRaw() {
  if (!sampleRaw) sampleRaw = readFixture('raw-profile');
  return sampleRaw;
}

function readSamplePositions() {
  if (!samplePositions) samplePositions = readFixture('raw-positions');
  return samplePositions;
}

function readSampleSkills() {
  if (!sampleSkills) sampleSkills = readFixture('raw-skills');
  return sampleSkills;
}

export function getSampleProfile({ full = false } = {}) {
  if (!sample) sample = normalizeProfile(readSampleRaw());

  if (!full) return envelope(sample.profile, { partial: sample.partial, source: 'cached-fixture' });

  if (!sampleFull) {
    const { profile, partial, experienceEnrichment } = normalizeProfile(readSampleRaw());
    if (partial.skills) {
      const names = extractSkillNames(readSampleSkills());
      if (names.length >= profile.skills.length) {
        profile.skills = names;
        delete partial.skills;
      }
    }
    if (partial.experience) {
      const complete = extractFullExperience(readSamplePositions(), experienceEnrichment);
      if (complete.length >= profile.experience.length) {
        profile.experience = complete;
        delete partial.experience;
      }
    }
    sampleFull = { profile, partial };
  }
  return envelope(sampleFull.profile, { partial: sampleFull.partial, source: 'cached-fixture' });
}

/** The unprocessed payload behind /profile/sample, sanitized the same way as getProfileRaw(). */
export function getSampleRaw({ full = false } = {}) {
  const raw = readSampleRaw();
  if (!full) return sanitizeRawPayload(raw);

  const merged = mergePositionsCompletion(
    mergeSkillsCompletion(raw, readSampleSkills()),
    readSamplePositions(),
  );
  return sanitizeRawPayload(merged);
}
