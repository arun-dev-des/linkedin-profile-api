import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { normalizeProfile } from '../src/linkedin/normalize.js';
import { parseProfileUrl } from '../src/linkedin/url.js';

const payload = JSON.parse(readFileSync(new URL('../fixtures/raw-profile.json', import.meta.url)));
const { profile, partial } = normalizeProfile(payload);

/* ------------------------------------------------------------ identity */

test('extracts identity fields', () => {
  assert.equal(profile.publicId, 'iamarun4official');
  assert.equal(profile.name, 'Arunkumar Alagarsamy');
  assert.equal(profile.firstName, 'Arunkumar');
  assert.equal(profile.lastName, 'Alagarsamy');
  assert.equal(profile.profileUrl, 'https://www.linkedin.com/in/iamarun4official/');
  assert.match(profile.headline, /Product Designer/);
  assert.ok(profile.about?.length > 0, 'about should be populated');
});

test('resolves location through the Geo entity', () => {
  // Profile.locationName is null in the payload — this only passes if the
  // geoLocation["*geo"] pointer was followed.
  assert.equal(profile.location, 'Bengaluru, Karnataka, India');
  assert.equal(profile.countryCode, 'IN');
});

test('resolves industry from industryUrn', () => {
  assert.equal(profile.industry, 'Information Technology & Services');
});

/* -------------------------------------------------------------- images */

test('assembles image URLs from rootUrl + widest artifact', () => {
  assert.match(profile.images.profilePicture, /^https:\/\/media\.licdn\.com\//);
  // The widest profile artifact is the 800x800 crop.
  assert.match(profile.images.profilePicture, /800_800/);
  assert.match(profile.images.backgroundImage, /^https:\/\/media\.licdn\.com\//);
  // Must not use originalImageReference, which needs authentication.
  assert.doesNotMatch(profile.images.profilePicture, /\/dms\/prv\//);
});

/* ---------------------------------------------------------- experience */

test('flattens position groups into individual roles', () => {
  assert.equal(profile.experience.length, 10);

  for (const role of profile.experience) {
    assert.ok(role.title, 'every role should have a title');
    assert.ok(role.company, 'every role should have a company');
  }
});

test('sorts experience: current roles first, then newest start date', () => {
  // This fixture has no current roles, so ordering reduces to newest-start-first.
  // The current-first tie-break is exercised by the synthetic case below.
  const keys = profile.experience.map((r) => Number(r.startDate?.slice(0, 4) ?? 0));
  assert.deepEqual(keys, [...keys].sort((a, b) => b - a));
});

test('a current role outranks an ended role with a later start date', () => {
  // Minimal normalized+json payload: one profile, two single-position groups.
  const mk = (payload) => normalizeProfile(payload).profile.experience;
  const experience = mk({
    data: { '*elements': ['urn:li:fsd_profile:X'] },
    included: [
      {
        entityUrn: 'urn:li:fsd_profile:X',
        firstName: 'A',
        lastName: 'B',
        '*profilePositionGroups': 'urn:li:collectionResponse:G',
      },
      { entityUrn: 'urn:li:collectionResponse:G', '*elements': ['urn:li:g:1', 'urn:li:g:2'] },
      { entityUrn: 'urn:li:g:1', '*profilePositionInPositionGroup': 'urn:li:collectionResponse:P1' },
      { entityUrn: 'urn:li:g:2', '*profilePositionInPositionGroup': 'urn:li:collectionResponse:P2' },
      { entityUrn: 'urn:li:collectionResponse:P1', '*elements': ['urn:li:p:1'] },
      { entityUrn: 'urn:li:collectionResponse:P2', '*elements': ['urn:li:p:2'] },
      {
        entityUrn: 'urn:li:p:1',
        title: 'Ended later',
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
  assert.equal(experience[0].title, 'Still here');
  assert.equal(experience[0].current, true);
});

test('reports position-group truncation honestly, like skills', () => {
  // Same shape as the "current role" synthetic fixture above, but the
  // groups CollectionResponse claims a paging.total larger than what's
  // actually attached — the shape LinkedIn sends for a profile with more
  // roles than the projection returns (e.g. 32 groups, 10 returned).
  const { partial } = normalizeProfile({
    data: { '*elements': ['urn:li:fsd_profile:X'] },
    included: [
      {
        entityUrn: 'urn:li:fsd_profile:X',
        firstName: 'A',
        lastName: 'B',
        '*profilePositionGroups': 'urn:li:collectionResponse:G',
      },
      {
        entityUrn: 'urn:li:collectionResponse:G',
        '*elements': ['urn:li:g:1'],
        paging: { total: 32 },
      },
      { entityUrn: 'urn:li:g:1', '*profilePositionInPositionGroup': 'urn:li:collectionResponse:P1' },
      { entityUrn: 'urn:li:collectionResponse:P1', '*elements': ['urn:li:p:1'] },
      { entityUrn: 'urn:li:p:1', title: 'One of many', companyName: 'X' },
    ],
  });
  assert.deepEqual(partial.experience, { returnedGroups: 1, totalGroups: 32 });
});

test('does not flag experience as partial when paging.total matches what was returned', () => {
  // The committed fixture's groups collection isn't capped (10 of 10).
  assert.equal(partial.experience, undefined);
});

test('resolves company metadata, tolerating a missing logo', () => {
  const applix = profile.experience.find((r) => r.company === 'Applix');
  assert.equal(applix.companyUrl, 'https://www.linkedin.com/company/applix/');
  assert.equal(applix.companyLogo, null, 'Applix has no logo in the payload');
  assert.equal(applix.employmentType, 'Full-time');

  const withLogo = profile.experience.find((r) => r.company === 'Uptown Ideas');
  assert.match(withLogo.companyLogo, /^https:\/\/media\.licdn\.com\//);
});

test('formats year-only and month-precision date ranges', () => {
  const applix = profile.experience.find((r) => r.company === 'Applix');
  assert.equal(applix.startDate, '2024');
  assert.equal(applix.endDate, '2025');

  const uptown = profile.experience.find((r) => r.title === 'Graphic Designer');
  assert.equal(uptown.startDate, '2015-10');
  assert.equal(uptown.endDate, '2016-10');
});

test('marks no role as current when every position has an end date', () => {
  assert.equal(
    profile.experience.some((r) => r.current),
    false,
  );
});

test('keeps descriptions where present and nulls them where absent', () => {
  const described = profile.experience.filter((r) => r.description !== null);
  assert.ok(described.length > 0, 'some roles carry a description');
  assert.ok(
    described.length < profile.experience.length,
    'roles without a description key should normalize to null, not throw',
  );
});

/* ----------------------------------------------------------- education */

test('parses education and filters the placeholder school name', () => {
  assert.equal(profile.education.length, 2);

  const care = profile.education.find((e) => e.school === 'CARE School of Engineering');
  assert.equal(care.degree, 'Bachelor of Engineering (B.E.)');
  assert.equal(care.fieldOfStudy, 'Computer Science');
  assert.equal(care.startDate, '2011');
  assert.equal(care.endDate, '2015');

  // The second entry has schoolName "invalid562524" and a null dateRange.
  for (const entry of profile.education) {
    assert.doesNotMatch(entry.school ?? '', /^invalid\d+$/);
  }
});

/* ------------------------------ skills, certifications, languages, featured */

test('returns skills and reports the truncation honestly', () => {
  assert.equal(profile.skills.length, 20);
  assert.ok(profile.skills.includes('Design Systems'));
  // LinkedIn's projection caps this at 20 of 31.
  assert.deepEqual(partial.skills, { returned: 20, total: 31 });
});

test('exposes the root profile URN for follow-up calls', () => {
  const { profileUrn } = normalizeProfile(payload);
  assert.match(profileUrn, /^urn:li:fsd_profile:/);
});

test('parses certifications', () => {
  assert.equal(profile.certifications.length, 1);
  const [cert] = profile.certifications;
  assert.equal(cert.name, 'Introduction to Modern Application Development');
  assert.equal(cert.authority, 'NPTEL');
  assert.equal(cert.startDate, '2016-09');
  assert.equal(cert.endDate, '2016-10');
});

test('returns an empty array for genuinely empty sections', () => {
  // This profile has no languages listed — must be [], never null or a throw.
  assert.deepEqual(profile.languages, []);
});

test('parses featured links', () => {
  assert.equal(profile.featured.length, 3);
  assert.ok(profile.featured.every((f) => f.url?.startsWith('http')));
  // The committed fixture's treasury-media collection isn't capped (3 of 3).
  assert.equal(partial.featured, undefined);
});

test('reports featured/treasury-media truncation honestly, like skills', () => {
  const { partial } = normalizeProfile({
    data: { '*elements': ['urn:li:fsd_profile:X'] },
    included: [
      {
        entityUrn: 'urn:li:fsd_profile:X',
        firstName: 'A',
        lastName: 'B',
        '*profileTreasuryMediaProfile': 'urn:li:collectionResponse:T',
      },
      {
        entityUrn: 'urn:li:collectionResponse:T',
        '*elements': ['urn:li:t:1'],
        paging: { total: 10 },
      },
      { entityUrn: 'urn:li:t:1', title: 'Resume', data: { Url: 'https://example.com/r' } },
    ],
  });
  assert.deepEqual(partial.featured, { returned: 1, total: 10 });
});

/* ------------------------------ volunteer experience, honors, publications */

test('returns an empty array for volunteer experience, honors and publications when absent', () => {
  // This profile has none of the three listed — must be [], never null or a
  // throw, and never silently dropped from the profile object either.
  assert.deepEqual(profile.volunteerExperience, []);
  assert.deepEqual(profile.honors, []);
  assert.deepEqual(profile.publications, []);
});

test('parses volunteer experience, resolving the company like an employer', () => {
  const { profile: p } = normalizeProfile({
    data: { '*elements': ['urn:li:fsd_profile:X'] },
    included: [
      {
        entityUrn: 'urn:li:fsd_profile:X',
        firstName: 'A',
        lastName: 'B',
        '*profileVolunteerExperiences': 'urn:li:collectionResponse:V',
      },
      { entityUrn: 'urn:li:collectionResponse:V', '*elements': ['urn:li:v:1'], paging: { total: 1 } },
      {
        entityUrn: 'urn:li:v:1',
        role: 'Chair, Board of Directors',
        companyName: 'Opportunity@Work',
        cause: 'ECONOMIC_EMPOWERMENT',
        '*company': 'urn:li:fsd_company:1',
        dateRange: { start: { year: 2016, month: 6 } },
        description: 'Nonprofit social enterprise.',
      },
      {
        entityUrn: 'urn:li:fsd_company:1',
        name: 'Opportunity@Work',
        url: 'https://www.linkedin.com/company/opportunity-work/',
      },
    ],
  });

  assert.deepEqual(p.volunteerExperience, [
    {
      role: 'Chair, Board of Directors',
      company: 'Opportunity@Work',
      companyUrl: 'https://www.linkedin.com/company/opportunity-work/',
      companyLogo: null,
      cause: 'ECONOMIC_EMPOWERMENT',
      startDate: '2016-06',
      endDate: null,
      current: true,
      description: 'Nonprofit social enterprise.',
    },
  ]);
});

test('parses honors, formatting issuedOn as a single date (not a range)', () => {
  const { profile: p } = normalizeProfile({
    data: { '*elements': ['urn:li:fsd_profile:X'] },
    included: [
      {
        entityUrn: 'urn:li:fsd_profile:X',
        firstName: 'A',
        lastName: 'B',
        '*profileHonors': 'urn:li:collectionResponse:H',
      },
      { entityUrn: 'urn:li:collectionResponse:H', '*elements': ['urn:li:h:1'], paging: { total: 1 } },
      {
        entityUrn: 'urn:li:h:1',
        title: 'Sigillum Magnum',
        issuer: 'University of Bologna',
        issuedOn: { year: 2023, month: 9 },
        description: 'A silver-bronze medal.',
      },
    ],
  });

  assert.deepEqual(p.honors, [
    {
      title: 'Sigillum Magnum',
      issuer: 'University of Bologna',
      issuedOn: '2023-09',
      description: 'A silver-bronze medal.',
    },
  ]);
});

test('resolves publication co-authors present in included[], skips ones that aren\'t', () => {
  const { profile: p } = normalizeProfile({
    data: { '*elements': ['urn:li:fsd_profile:X'] },
    included: [
      {
        entityUrn: 'urn:li:fsd_profile:X',
        firstName: 'A',
        lastName: 'B',
        '*profilePublications': 'urn:li:collectionResponse:P',
      },
      { entityUrn: 'urn:li:collectionResponse:P', '*elements': ['urn:li:p:1'], paging: { total: 1 } },
      {
        entityUrn: 'urn:li:p:1',
        name: 'Superagency',
        publisher: 'Authors Equity',
        publishedOn: { year: 2025, month: 1, day: 28 },
        url: 'https://www.superagency.ai/',
        description: 'A book about AI.',
        authors: [
          { standardizedContributor: { '*profile': 'urn:li:fsd_profile:X' } }, // resolvable
          { standardizedContributor: { '*profile': 'urn:li:fsd_profile:not-included' } }, // not in included[]
        ],
      },
    ],
  });

  assert.equal(p.publications.length, 1);
  assert.equal(p.publications[0].publishedOn, '2025-01');
  assert.deepEqual(p.publications[0].authors, [{ name: 'A B', profileUrl: null }]);
});

test('reports honors truncation honestly, like every other capped section', () => {
  const { partial } = normalizeProfile({
    data: { '*elements': ['urn:li:fsd_profile:X'] },
    included: [
      {
        entityUrn: 'urn:li:fsd_profile:X',
        firstName: 'A',
        lastName: 'B',
        '*profileHonors': 'urn:li:collectionResponse:H',
      },
      {
        entityUrn: 'urn:li:collectionResponse:H',
        '*elements': ['urn:li:h:1'],
        paging: { total: 25 },
      },
      { entityUrn: 'urn:li:h:1', title: 'One of many' },
    ],
  });
  assert.deepEqual(partial.honors, { returned: 1, total: 25 });
});

/* --------------------------------------------------------- URL parsing */

test('parses profile URLs in the shapes users actually paste', () => {
  const expected = 'iamarun4official';
  for (const input of [
    'https://www.linkedin.com/in/iamarun4official/',
    'https://www.linkedin.com/in/iamarun4official',
    'http://linkedin.com/in/iamarun4official/',
    'linkedin.com/in/iamarun4official',
    'https://in.linkedin.com/in/iamarun4official/',
    'https://www.linkedin.com/in/iamarun4official/details/experience/',
    'https://www.linkedin.com/in/iamarun4official/?originalSubdomain=in',
  ]) {
    assert.equal(parseProfileUrl(input), expected, `failed on: ${input}`);
  }
});

test('rejects non-profile URLs with a 400', () => {
  for (const input of [
    '',
    'https://example.com',
    'https://www.linkedin.com/company/applix/',
    'not a url',
  ]) {
    assert.throws(() => parseProfileUrl(input), { status: 400 }, `should reject: ${input}`);
  }
});

/* ------------------------------------------------------------- hygiene */

test('strips LinkedIn-internal fields from the output', () => {
  // profileUrn is the one URN deliberately exposed — it's the member's stable
  // id, and the point of the field. Drop it before the sweep so the guard
  // still catches every *accidental* URN or raw-entity leak elsewhere.
  const { profileUrn, ...rest } = profile;
  assert.match(profileUrn, /^urn:li:fsd_profile:/, 'profileUrn should be the member urn');

  const serialized = JSON.stringify(rest);
  for (const leak of ['$type', '$recipeTypes', 'entityUrn', 'multiLocale', 'urn:li:']) {
    assert.equal(serialized.includes(leak), false, `output should not contain ${leak}`);
  }
});

test('exposes the profile badges as booleans, never null', () => {
  // The fixture profile is premium but neither an influencer nor a creator —
  // absent flags must normalize to false, not null or undefined.
  assert.deepEqual(profile.badges, { premium: true, influencer: false, creator: false });

  // A payload with no flags at all must still produce all three as false.
  const { profile: bare } = normalizeProfile({
    data: { '*elements': ['urn:li:fsd_profile:X'] },
    included: [{ entityUrn: 'urn:li:fsd_profile:X', firstName: 'A', lastName: 'B' }],
  });
  assert.deepEqual(bare.badges, { premium: false, influencer: false, creator: false });
  assert.equal(bare.profileUrn, 'urn:li:fsd_profile:X');
});
