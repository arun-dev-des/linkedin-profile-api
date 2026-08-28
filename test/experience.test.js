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
  assert.equal(roles.length, 10);
  assert.equal(roles.length, positionsPayload.data.paging.total);
  for (const role of roles) {
    assert.ok(role.title, 'every role should have a title');
    assert.ok(role.company, 'every role should have a company');
  }
});

test('extractFullExperience agrees with the main call on title/company/role', () => {
  // This fixture profile isn't capped (10 of 10 groups), so the two finders
  // should describe the same roles — a parity check on the fields both share.
  //
  // startDate is compared at year precision only: profilePositions can
  // return a *more* precise date than profilePositionGroups does. For this
  // fixture's Applix role, the main call has {year: 2024} while
  // profilePositions has {year: 2024, month: 8} for the identical position —
  // real LinkedIn data drift between its own two endpoints, not a parsing
  // bug. A completed experience list can end up slightly more precise than
  // the capped one, never less.
  const { profile } = normalizeProfile(profilePayload);
  const full = extractFullExperience(positionsPayload);

  assert.equal(full.length, profile.experience.length);
  const byTitleAndCompanyAndYear = (list) =>
    new Set(list.map((r) => `${r.title}@@${r.company}@@${r.startDate?.slice(0, 4)}`));
  assert.deepEqual(byTitleAndCompanyAndYear(full), byTitleAndCompanyAndYear(profile.experience));
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
