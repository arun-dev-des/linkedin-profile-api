import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { extractSkillNames, normalizeProfile } from '../src/linkedin/normalize.js';

const skillsPayload = JSON.parse(
  readFileSync(new URL('../fixtures/raw-skills.json', import.meta.url)),
);
const profilePayload = JSON.parse(
  readFileSync(new URL('../fixtures/raw-profile.json', import.meta.url)),
);

test('extractSkillNames returns the complete list from a profileSkills response', () => {
  const names = extractSkillNames(skillsPayload);
  assert.equal(names.length, 47, 'the dedicated finder returns all 47, not the 20 cap');
  assert.equal(names.length, skillsPayload.data.paging.total);
  assert.ok(names.every((n) => typeof n === 'string' && n.length > 0));
});

test('extractSkillNames preserves LinkedIn display order', () => {
  // Order comes from data["*elements"], not the included[] array order.
  const names = extractSkillNames(skillsPayload);
  const firstUrn = skillsPayload.data['*elements'][0];
  const firstEntity = skillsPayload.included.find((e) => e.entityUrn === firstUrn);
  assert.equal(names[0], firstEntity.name);
});

test('extractSkillNames is a superset of the capped list from the main call', () => {
  const { profile } = normalizeProfile(profilePayload);
  const complete = extractSkillNames(skillsPayload);
  for (const capped of profile.skills) {
    assert.ok(complete.includes(capped), `"${capped}" missing from the complete list`);
  }
  assert.ok(complete.length > profile.skills.length);
});

test('extractSkillNames tolerates an empty / malformed response', () => {
  assert.deepEqual(extractSkillNames({}), []);
  assert.deepEqual(extractSkillNames({ data: {}, included: [] }), []);
  assert.deepEqual(extractSkillNames(null), []);
});
