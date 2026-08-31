import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { extractFullExperience, normalizeProfile } from '../src/linkedin/normalize.js';

const positionsPayload = JSON.parse(
  readFileSync(new URL('../fixtures/raw-positions.json', import.meta.url)),
);
const profilePayload = JSON.parse(
  readFileSync(new URL('../fixtures/raw-profile.json', import.meta.url)),
);

test('extractFullExperience parses a real profilePositions response', () => {
  const roles = extractFullExperience(positionsPayload);
  assert.equal(roles.length, 33);
  assert.equal(roles.length, positionsPayload.data.paging.total);
  for (const role of roles) {
    assert.ok(role.title, 'every role should have a title');
    assert.ok(role.company, 'every role should have a company');
  }
});

test('extractFullExperience is a superset of the capped list from the main call', () => {
  // The committed fixture IS capped (10 of 32 groups) — unlike an exact
  // parity check, this holds regardless of whether a given profile happens
  // to be capped, so it isn't fragile to a subject's group count changing
  // between recaptures. Mirrors extractSkillNames's superset test.
  //
  // startDate is compared at year precision only: profilePositions can
  // return a *more* precise date than profilePositionGroups does — real
  // LinkedIn data drift between its own two endpoints, not a parsing bug.
  const { profile } = normalizeProfile(profilePayload);
  const full = extractFullExperience(positionsPayload);

  assert.ok(full.length > profile.experience.length);
  const key = (r) => `${r.title}@@${r.company}@@${r.startDate?.slice(0, 4)}`;
  const fullKeys = new Set(full.map(key));
  for (const role of profile.experience) {
    assert.ok(fullKeys.has(key(role)), `"${role.title}" @ "${role.company}" missing from the complete list`);
  }
});

test('extractFullExperience fills in company enrichment where a urn matches, nulls it otherwise', () => {
  const enrichmentByUrn = new Map([
    ['urn:li:fsd_position:known', { companyUrl: 'https://li.com/co/x', companyLogo: 'https://img/x', employmentType: 'Full-time' }],
  ]);
  const roles = extractFullExperience(
    {
      data: { '*elements': ['urn:li:fsd_position:known', 'urn:li:fsd_position:unknown'] },
      included: [
        { entityUrn: 'urn:li:fsd_position:known', title: 'Known role', companyName: 'X' },
        { entityUrn: 'urn:li:fsd_position:unknown', title: 'Recovered-only role', companyName: 'Y' },
      ],
    },
    enrichmentByUrn,
  );

  const known = roles.find((r) => r.title === 'Known role');
  const unknown = roles.find((r) => r.title === 'Recovered-only role');
  assert.deepEqual(
    { companyUrl: known.companyUrl, companyLogo: known.companyLogo, employmentType: known.employmentType },
    { companyUrl: 'https://li.com/co/x', companyLogo: 'https://img/x', employmentType: 'Full-time' },
  );
  assert.deepEqual(
    { companyUrl: unknown.companyUrl, companyLogo: unknown.companyLogo, employmentType: unknown.employmentType },
    { companyUrl: null, companyLogo: null, employmentType: null },
  );
});

test('extractFullExperience sorts current roles first, then newest start date', () => {
  const roles = extractFullExperience({
    data: { '*elements': ['urn:li:p:1', 'urn:li:p:2'] },
    included: [
      {
        entityUrn: 'urn:li:p:1',
        title: 'Ended',
        companyName: 'X',
        dateRange: { start: { year: 2021 }, end: { year: 2023 } },
      },
      {
        entityUrn: 'urn:li:p:2',
        title: 'Still here',
        companyName: 'Y',
        dateRange: { start: { year: 2014 } },
      },
    ],
  });
  assert.equal(roles[0].title, 'Still here');
  assert.equal(roles[0].current, true);
});

test('extractFullExperience tolerates an empty / malformed response', () => {
  assert.deepEqual(extractFullExperience({}), []);
  assert.deepEqual(extractFullExperience({ data: {}, included: [] }), []);
  assert.deepEqual(extractFullExperience(null), []);
});

test('normalizeProfile exposes an experienceEnrichment map keyed by position urn', () => {
  const { experienceEnrichment } = normalizeProfile(profilePayload);
  assert.ok(experienceEnrichment instanceof Map);
  assert.ok(experienceEnrichment.size > 0);
  for (const value of experienceEnrichment.values()) {
    assert.deepEqual(Object.keys(value).sort(), ['companyLogo', 'companyUrl', 'employmentType']);
  }
});
