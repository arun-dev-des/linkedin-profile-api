import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { normalizeProfile, sanitizeRawPayload } from '../src/linkedin/normalize.js';

const fixture = JSON.parse(
  readFileSync(new URL('../fixtures/raw-profile.json', import.meta.url)),
);

// Mirrors the real shape observed live: every member LinkedIn resolves on a
// profile — the subject included — carries its own `*memberRelationship`
// pointer, which resolves to a MemberRelationship entity embedding the
// *credentialed account's* own Profile via `*inviterResolutionResult`.
function payloadWithViewerLeak() {
  return {
    data: { '*elements': ['urn:li:fsd_profile:subject'] },
    included: [
      {
        entityUrn: 'urn:li:fsd_profile:subject',
        firstName: 'Subject',
        lastName: 'Person',
        '*memberRelationship': 'urn:li:fsd_memberRelationship:1',
      },
      {
        entityUrn: 'urn:li:fsd_memberRelationship:1',
        $type: 'com.linkedin.voyager.dash.relationships.MemberRelationship',
        memberRelationshipUnion: {
          noConnection: {
            invitationUnion: {
              noInvitation: {
                '*inviterResolutionResult': 'urn:li:fsd_profile:viewer',
                inviter: 'urn:li:fsd_profile:viewer',
              },
            },
          },
        },
      },
      {
        entityUrn: 'urn:li:fsd_profile:viewer',
        firstName: 'The',
        lastName: 'Server Operator',
        publicIdentifier: 'the-server-operator',
      },
    ],
  };
}

test('drops an entity reachable only through *memberRelationship', () => {
  const clean = sanitizeRawPayload(payloadWithViewerLeak());
  const urns = clean.included.map((e) => e.entityUrn);

  assert.ok(urns.includes('urn:li:fsd_profile:subject'), 'the subject must stay');
  assert.ok(!urns.includes('urn:li:fsd_memberRelationship:1'), 'the relationship entity must go');
  assert.ok(!urns.includes('urn:li:fsd_profile:viewer'), "the viewer's own profile must go");
  assert.equal(JSON.stringify(clean).includes('viewer'), false, 'no trace of the viewer urn/name');
});

test('keeps an entity reached through a legitimate content pointer, even if it also has its own *memberRelationship', () => {
  // Same shape as a real publication co-author: reachable via
  // *profilePublications -> Publication -> authors[].standardizedContributor
  // ["*profile"] -> co-author's own Profile, which (like every resolved
  // member) also carries a *memberRelationship of its own.
  const payload = {
    data: { '*elements': ['urn:li:fsd_profile:subject'] },
    included: [
      {
        entityUrn: 'urn:li:fsd_profile:subject',
        firstName: 'Subject',
        lastName: 'Person',
        '*profilePublications': 'urn:li:collectionResponse:P',
      },
      { entityUrn: 'urn:li:collectionResponse:P', '*elements': ['urn:li:p:1'] },
      {
        entityUrn: 'urn:li:p:1',
        name: 'A Book',
        authors: [{ standardizedContributor: { '*profile': 'urn:li:fsd_profile:coauthor' } }],
      },
      {
        entityUrn: 'urn:li:fsd_profile:coauthor',
        firstName: 'Co',
        lastName: 'Author',
        publicIdentifier: 'coauthor',
        '*memberRelationship': 'urn:li:fsd_memberRelationship:2',
      },
      {
        entityUrn: 'urn:li:fsd_memberRelationship:2',
        memberRelationshipUnion: {
          noConnection: { invitationUnion: { noInvitation: { inviter: 'urn:li:fsd_profile:viewer' } } },
        },
      },
      { entityUrn: 'urn:li:fsd_profile:viewer', firstName: 'The', lastName: 'Server Operator' },
    ],
  };

  const clean = sanitizeRawPayload(payload);
  const urns = clean.included.map((e) => e.entityUrn);

  assert.ok(urns.includes('urn:li:fsd_profile:coauthor'), 'the legitimately-referenced co-author must stay');
  assert.ok(
    !urns.includes('urn:li:fsd_memberRelationship:2'),
    "the co-author's own relationship entity must still go",
  );
  assert.ok(!urns.includes('urn:li:fsd_profile:viewer'), "the viewer's own profile must still go");

  // And normalizeProfile() must still resolve the co-author's name correctly
  // from the sanitized payload — sanitizing must never break real output.
  const { profile } = normalizeProfile(clean);
  assert.deepEqual(profile.publications[0].authors, [
    { name: 'Co Author', profileUrl: 'https://www.linkedin.com/in/coauthor/' },
  ]);
});

test('strips the credentialed account\'s own leaked identity from a real third-party capture', () => {
  // Unlike a self-lookup, this fixture was captured by one account (the
  // server operator's) viewing a *different* person's profile — the shape
  // this whole service exists for — so the viewer's own identity really is
  // reachable via *memberRelationship, and sanitizing measurably shrinks
  // included[].
  const clean = sanitizeRawPayload(fixture);
  assert.ok(clean.included.length < fixture.included.length, 'sanitizing should have dropped entities');
  // An entity can legitimately keep its own *memberRelationship *pointer*
  // after sanitizing (see the "legitimate content pointer" test below) — what
  // must be gone is any trace of the credentialed account's own identity.
  assert.equal(JSON.stringify(clean).toLowerCase().includes('arun'), false);
});

test('never changes what normalizeProfile() produces', () => {
  const before = normalizeProfile(fixture).profile;
  const after = normalizeProfile(sanitizeRawPayload(fixture)).profile;
  assert.deepEqual(before, after);
});

test('tolerates empty and malformed payloads', () => {
  assert.deepEqual(sanitizeRawPayload({}), {});
  assert.deepEqual(sanitizeRawPayload(null), null);
  assert.deepEqual(sanitizeRawPayload({ data: {}, included: [] }), { data: {}, included: [] });
});
