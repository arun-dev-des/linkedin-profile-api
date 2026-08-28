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

test('sorts experience newest first', () => {
  const keys = profile.experience.map((r) => Number(r.startDate?.slice(0, 4) ?? 0));
  assert.deepEqual(keys, [...keys].sort((a, b) => b - a));
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
  const serialized = JSON.stringify(profile);
  for (const leak of ['$type', '$recipeTypes', 'entityUrn', 'multiLocale', 'urn:li:']) {
    assert.equal(serialized.includes(leak), false, `output should not contain ${leak}`);
  }
});
