import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { normalizeProfile } from '../src/linkedin/normalize.js';
import { parseProfileUrl } from '../src/linkedin/url.js';

const payload = JSON.parse(readFileSync(new URL('../fixtures/raw-profile.json', import.meta.url)));
const { profile, partial } = normalizeProfile(payload);

/* ------------------------------------------------------------ identity */

test('extracts identity fields', () => {
  assert.equal(profile.publicId, 'reidhoffman');
  assert.equal(profile.name, 'Reid Hoffman');
  assert.equal(profile.firstName, 'Reid');
  assert.equal(profile.lastName, 'Hoffman');
  assert.equal(profile.profileUrl, 'https://www.linkedin.com/in/reidhoffman/');
  assert.match(profile.headline, /Co-Founder, LinkedIn/);
  assert.ok(profile.about?.length > 0, 'about should be populated');
});

test('resolves location through the Geo entity', () => {
  // Profile.locationName is null in the payload — this only passes if the
  // geoLocation["*geo"] pointer was followed.
  assert.equal(profile.location, 'United States');
  assert.equal(profile.countryCode, 'US');
});

test('resolves industry from industryUrn', () => {
  assert.equal(profile.industry, 'Venture Capital & Private Equity');
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
  // Every role in this fixture is current (no endDate) — ordering reduces to
  // newest-start-first. The current-vs-ended tie-break is exercised by the
  // synthetic case below.
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

test('reports experience truncation honestly on a genuinely capped profile', () => {
  // The committed fixture's groups collection IS capped — 10 of 32 groups
  // (a rich, decades-long career like this one hits LinkedIn's own cap).
  assert.deepEqual(partial.experience, { returnedGroups: 10, totalGroups: 32 });
});

test('resolves company metadata from a real position', () => {
  const inflection = profile.experience.find((r) => r.company === 'Inflection AI');
  assert.match(inflection.companyUrl, /^https:\/\/www\.linkedin\.com\/company\//);
  assert.match(inflection.companyLogo, /^https:\/\/media\.licdn\.com\//);
  assert.equal(inflection.employmentType, 'Part-time');
});

test('tolerates a company with no logo in the payload', () => {
  // Synthetic — every real role in the committed fixture happens to have a
  // resolved logo, so the "missing logo" branch needs a constructed case.
  const { profile: p } = normalizeProfile({
    data: { '*elements': ['urn:li:fsd_profile:X'] },
    included: [
      {
        entityUrn: 'urn:li:fsd_profile:X',
        firstName: 'A',
        lastName: 'B',
        '*profilePositionGroups': 'urn:li:collectionResponse:G',
      },
      { entityUrn: 'urn:li:collectionResponse:G', '*elements': ['urn:li:g:1'] },
      {
        entityUrn: 'urn:li:g:1',
        '*profilePositionInPositionGroup': 'urn:li:collectionResponse:P',
        '*company': 'urn:li:fsd_company:1',
      },
      { entityUrn: 'urn:li:collectionResponse:P', '*elements': ['urn:li:p:1'] },
      { entityUrn: 'urn:li:p:1', title: 'Role', companyName: 'NoLogo Co' },
      {
        entityUrn: 'urn:li:fsd_company:1',
        name: 'NoLogo Co',
        url: 'https://www.linkedin.com/company/nologo/',
      },
    ],
  });
  assert.equal(p.experience[0].companyLogo, null, 'a company with no logo field must normalize to null');
  assert.equal(p.experience[0].companyUrl, 'https://www.linkedin.com/company/nologo/');
});

test('formats year-only and month-precision date ranges', () => {
  // Year-only precision is common on older/honorary entries — education
  // carries a clean real example; experience (below) covers month precision.
  const stanford = profile.education.find((e) => e.school === 'Stanford University');
  assert.equal(stanford.startDate, '1985');
  assert.equal(stanford.endDate, '1990');

  const greylock = profile.experience.find((r) => r.company === 'Greylock');
  assert.equal(greylock.startDate, '2009-11');
  assert.equal(greylock.endDate, null);
});

test('marks every role as current when none has an end date', () => {
  // This fixture's subject is still active in every listed role.
  assert.equal(
    profile.experience.every((r) => r.current),
    true,
  );
});

test('keeps descriptions where present and nulls them where absent', () => {
  // Every experience entry in this fixture happens to carry a description;
  // education has the present/absent mix instead — same formatting path.
  const described = profile.education.filter((e) => e.description !== null);
  assert.ok(described.length > 0, 'some entries carry a description');
  assert.ok(
    described.length < profile.education.length,
    'entries without a description key should normalize to null, not throw',
  );
});

/* ----------------------------------------------------------- education */

test('parses education from real entries', () => {
  assert.equal(profile.education.length, 6);

  const stanford = profile.education.find((e) => e.school === 'Stanford University');
  assert.equal(stanford.degree, 'B.S.');
  assert.equal(stanford.fieldOfStudy, 'Symbolic Systems');

  const oxford = profile.education.find((e) => e.school === 'Oxford University');
  assert.equal(oxford.degree, 'M.St.');
  assert.equal(oxford.startDate, '1990-09');
  assert.equal(oxford.endDate, '1993-06');
});

test('filters a placeholder school name like "invalid562524"', () => {
  // Synthetic — this fixture's subject has no placeholder-named school, so
  // the filter itself is exercised directly rather than left unverified.
  const { profile: p } = normalizeProfile({
    data: { '*elements': ['urn:li:fsd_profile:X'] },
    included: [
      {
        entityUrn: 'urn:li:fsd_profile:X',
        firstName: 'A',
        lastName: 'B',
        '*profileEducations': 'urn:li:collectionResponse:E',
      },
      { entityUrn: 'urn:li:collectionResponse:E', '*elements': ['urn:li:e:1'], paging: { total: 1 } },
      { entityUrn: 'urn:li:e:1', schoolName: 'invalid562524' },
    ],
  });
  assert.equal(p.education[0].school, null);
});

/* ------------------------------ skills, certifications, languages, featured */

test('returns skills and reports the truncation honestly', () => {
  assert.equal(profile.skills.length, 20);
  assert.ok(profile.skills.includes('Entrepreneurship'));
  // LinkedIn's projection caps this at 20 of 47.
  assert.deepEqual(partial.skills, { returned: 20, total: 47 });
});

test('exposes the root profile URN for follow-up calls', () => {
  const { profileUrn } = normalizeProfile(payload);
  assert.match(profileUrn, /^urn:li:fsd_profile:/);
});

test('returns an empty array when a profile has no certifications', () => {
  // This fixture's subject genuinely has none listed.
  assert.deepEqual(profile.certifications, []);
});

test('parses a certification', () => {
  // Synthetic — exercises the parsing path itself, since the committed
  // fixture has no certifications to draw a real example from.
  const { profile: p } = normalizeProfile({
    data: { '*elements': ['urn:li:fsd_profile:X'] },
    included: [
      {
        entityUrn: 'urn:li:fsd_profile:X',
        firstName: 'A',
        lastName: 'B',
        '*profileCertifications': 'urn:li:collectionResponse:C',
      },
      { entityUrn: 'urn:li:collectionResponse:C', '*elements': ['urn:li:c:1'], paging: { total: 1 } },
      {
        entityUrn: 'urn:li:c:1',
        name: 'Introduction to Modern Application Development',
        authority: 'NPTEL',
        dateRange: { start: { year: 2016, month: 9 }, end: { year: 2016, month: 10 } },
      },
    ],
  });
  assert.deepEqual(p.certifications, [
    {
      name: 'Introduction to Modern Application Development',
      authority: 'NPTEL',
      licenseNumber: null,
      url: null,
      startDate: '2016-09',
      endDate: '2016-10',
      current: false,
    },
  ]);
});

test('returns an empty array for genuinely empty sections', () => {
  // This profile has no languages listed — must be [], never null or a throw.
  assert.deepEqual(profile.languages, []);
});

test('parses featured links', () => {
  assert.equal(profile.featured.length, 3);
  assert.ok(profile.featured.every((f) => f.url?.startsWith('http')));
  // The committed fixture's treasury-media collection IS capped (3 of 10).
  assert.deepEqual(partial.featured, { returned: 3, total: 10 });
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

test('parses volunteer experience from real entries', () => {
  assert.equal(profile.volunteerExperience.length, 14);
  const opportunity = profile.volunteerExperience.find((v) => v.company === 'Opportunity@Work');
  assert.equal(opportunity.role, 'Chair, Board of Directors');
  assert.equal(opportunity.cause, 'ECONOMIC_EMPOWERMENT');
  assert.match(opportunity.companyUrl, /^https:\/\/www\.linkedin\.com\/company\//);
});

test('parses honors from real entries', () => {
  assert.equal(profile.honors.length, 9);
  const sigillum = profile.honors.find((h) => h.title === 'Sigillum Magnum');
  assert.equal(sigillum.issuer, 'University of Bologna');
  assert.equal(sigillum.issuedOn, '2023-09');
});

test('parses publications and resolves real co-authors', () => {
  assert.equal(profile.publications.length, 6);
  const superagency = profile.publications.find((p) => p.name === 'Superagency');
  assert.equal(superagency.publisher, 'Authors Equity');
  assert.equal(superagency.publishedOn, '2025-01');
  assert.deepEqual(superagency.authors, [
    { name: 'Reid Hoffman', profileUrl: 'https://www.linkedin.com/in/reidhoffman/' },
    { name: 'Greg Beato', profileUrl: 'https://www.linkedin.com/in/gregbeato/' },
  ]);
});

test('returns an empty array for volunteer experience, honors and publications when absent from the payload', () => {
  // Synthetic — the committed fixture's subject has all three populated
  // (covered above with real data), so the "none of them present" shape is
  // exercised directly here instead.
  const { profile: p } = normalizeProfile({
    data: { '*elements': ['urn:li:fsd_profile:X'] },
    included: [{ entityUrn: 'urn:li:fsd_profile:X', firstName: 'A', lastName: 'B' }],
  });
  assert.deepEqual(p.volunteerExperience, []);
  assert.deepEqual(p.honors, []);
  assert.deepEqual(p.publications, []);
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
  const expected = 'reidhoffman';
  for (const input of [
    'https://www.linkedin.com/in/reidhoffman/',
    'https://www.linkedin.com/in/reidhoffman',
    'http://linkedin.com/in/reidhoffman/',
    'linkedin.com/in/reidhoffman',
    'https://in.linkedin.com/in/reidhoffman/',
    'https://www.linkedin.com/in/reidhoffman/details/experience/',
    'https://www.linkedin.com/in/reidhoffman/?originalSubdomain=in',
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
  // The fixture profile is premium, an influencer, and a creator — all three
  // flags true, unlike a bare/default profile.
  assert.deepEqual(profile.badges, { premium: true, influencer: true, creator: true });

  // A payload with no flags at all must still produce all three as false.
  const { profile: bare } = normalizeProfile({
    data: { '*elements': ['urn:li:fsd_profile:X'] },
    included: [{ entityUrn: 'urn:li:fsd_profile:X', firstName: 'A', lastName: 'B' }],
  });
  assert.deepEqual(bare.badges, { premium: false, influencer: false, creator: false });
  assert.equal(bare.profileUrn, 'urn:li:fsd_profile:X');
});
