import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  mergePositionsCompletion,
  mergeSkillsCompletion,
  normalizeProfile,
} from '../src/linkedin/normalize.js';

const profilePayload = JSON.parse(
  readFileSync(new URL('../fixtures/raw-profile.json', import.meta.url)),
);
const skillsPayload = JSON.parse(
  readFileSync(new URL('../fixtures/raw-skills.json', import.meta.url)),
);
const positionsPayload = JSON.parse(
  readFileSync(new URL('../fixtures/raw-positions.json', import.meta.url)),
);

/* ------------------------------------------------------ mergeSkillsCompletion */

test('mergeSkillsCompletion repoints *profileSkills at the complete list', () => {
  const merged = mergeSkillsCompletion(profilePayload, skillsPayload);
  const { profile, partial } = normalizeProfile(merged);

  assert.equal(profile.skills.length, 31, 'was capped at 20; the completion call has 31');
  assert.equal(partial.skills, undefined, 'no longer capped, so no partial marker');
});

test('mergeSkillsCompletion folds in every skill entity the base payload lacked', () => {
  const merged = mergeSkillsCompletion(profilePayload, skillsPayload);
  const baseUrns = new Set(profilePayload.included.map((e) => e.entityUrn));
  const newUrns = skillsPayload.included
    .map((e) => e.entityUrn)
    .filter((urn) => urn && !baseUrns.has(urn));

  assert.ok(newUrns.length > 0, 'fixture should actually exercise the merge');
  const mergedUrns = new Set(merged.included.map((e) => e.entityUrn));
  for (const urn of newUrns) assert.ok(mergedUrns.has(urn));
});

test('mergeSkillsCompletion does not touch the original payload (pure)', () => {
  const before = JSON.stringify(profilePayload);
  mergeSkillsCompletion(profilePayload, skillsPayload);
  assert.equal(JSON.stringify(profilePayload), before);
});

test('mergeSkillsCompletion is a no-op when the completion list is no longer than the capped one', () => {
  const merged = mergeSkillsCompletion(profilePayload, skillsPayload);
  // Feeding the already-merged payload back in: nothing left to complete.
  const mergedAgain = mergeSkillsCompletion(merged, skillsPayload);
  assert.deepEqual(mergedAgain, merged);
});

test('mergeSkillsCompletion tolerates malformed input', () => {
  assert.deepEqual(mergeSkillsCompletion({}, skillsPayload), {});
  assert.deepEqual(mergeSkillsCompletion(profilePayload, {}), profilePayload);
  assert.deepEqual(mergeSkillsCompletion(profilePayload, null), profilePayload);
});

/* -------------------------------------------------- mergePositionsCompletion */

test('mergePositionsCompletion adds only entities the base payload lacked', () => {
  const merged = mergePositionsCompletion(profilePayload, positionsPayload);
  const baseUrns = new Set(profilePayload.included.map((e) => e.entityUrn));
  const newUrns = positionsPayload.included
    .map((e) => e.entityUrn)
    .filter((urn) => urn && !baseUrns.has(urn));

  assert.equal(merged.included.length, profilePayload.included.length + newUrns.length);
});

test('mergePositionsCompletion never changes what normalizeProfile() produces', () => {
  // It only adds discoverable entities — it can't (and doesn't try to)
  // rewire *profilePositionGroups, so the normalized experience list is
  // identical before and after.
  const before = normalizeProfile(profilePayload).profile.experience;
  const merged = mergePositionsCompletion(profilePayload, positionsPayload);
  const after = normalizeProfile(merged).profile.experience;
  assert.deepEqual(after, before);
});

test('mergePositionsCompletion does not touch the original payload (pure)', () => {
  const before = JSON.stringify(profilePayload);
  mergePositionsCompletion(profilePayload, positionsPayload);
  assert.equal(JSON.stringify(profilePayload), before);
});

test('mergePositionsCompletion tolerates malformed input', () => {
  assert.deepEqual(mergePositionsCompletion({}, positionsPayload), {});
  assert.deepEqual(mergePositionsCompletion(profilePayload, {}), profilePayload);
  assert.deepEqual(mergePositionsCompletion(profilePayload, null), profilePayload);
});
