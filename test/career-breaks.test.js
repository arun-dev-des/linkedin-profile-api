import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { extractCareerBreaks, normalizeProfile } from '../src/linkedin/normalize.js';

const load = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/${name}.json`, import.meta.url)));

// Both captured live from the SDUI experience query, trimmed to the
// entityComponent nodes the parser actually reads.
const ongoing = load('sdui-experience-iamarun4official'); // an open-ended break
const closed = load('sdui-experience-padamkataria'); // a break with an end date

test('extracts an in-progress career break, with location and description', () => {
  const [b] = extractCareerBreaks(ongoing);
  assert.deepEqual(
    { ...b, description: null },
    {
      type: 'Professional development',
      startDate: '2025-07',
      endDate: null,
      current: true,
      location: 'Greater Bengaluru Area',
      description: null,
    },
  );
  // The description lives several levels down in subComponents, not on the
  // entity itself — assert it survives that walk.
  assert.match(b.description, /^Built and shipped two products independently:/);
  assert.ok(b.description.includes('greymemory'), 'multi-paragraph text kept intact');
});

test('extracts a completed career break, tolerating a missing location', () => {
  const [b] = extractCareerBreaks(closed);
  assert.deepEqual(
    { ...b, description: null },
    {
      type: 'Personal goal pursuit',
      startDate: '2025-02',
      endDate: '2025-06',
      current: false,
      location: null,
      description: null,
    },
  );
  assert.match(b.description, /^Took time out to travel and train\./);
  assert.ok(b.description.includes('\n'), 'newlines preserved');
});

test('returns a null description when the break has none', () => {
  const [b] = extractCareerBreaks({
    entityComponent: {
      titleV2: { text: { text: 'Break' } },
      subtitle: { text: 'Career Break' },
      caption: { text: 'Jan 2020 - Feb 2020 · 2 mos' },
    },
  });
  assert.equal(b.description, null);
});

test('does not mistake ordinary roles for career breaks', () => {
  // Both fixtures carry the full experience list — 13 and 7 entity components
  // respectively — of which exactly one each is a break. Everything else has
  // a company in the subtitle where a break has the literal "Career Break".
  assert.equal(extractCareerBreaks(ongoing).length, 1);
  assert.equal(extractCareerBreaks(closed).length, 1);
});

test('parses the SDUI caption formats LinkedIn actually renders', () => {
  const mk = (caption) => ({
    entityComponent: {
      titleV2: { text: { text: 'Break' } },
      subtitle: { text: 'Career Break' },
      caption: { text: caption },
    },
  });

  const dates = (caption) => {
    const [b] = extractCareerBreaks(mk(caption));
    return { startDate: b.startDate, endDate: b.endDate, current: b.current };
  };

  // Month precision, closed range — the duration suffix must be ignored.
  assert.deepEqual(dates('Feb 2025 - Jun 2025 · 5 mos'), {
    startDate: '2025-02',
    endDate: '2025-06',
    current: false,
  });
  // Open-ended.
  assert.deepEqual(dates('Jul 2025 - Present · 1 yr 2 mos'), {
    startDate: '2025-07',
    endDate: null,
    current: true,
  });
  // Year-only precision, as LinkedIn renders when no month was entered.
  assert.deepEqual(dates('2021 - 2022 · 1 yr'), {
    startDate: '2021',
    endDate: '2022',
    current: false,
  });
  // An en-dash separator instead of a hyphen.
  assert.deepEqual(dates('Feb 2025 – Jun 2025 · 5 mos'), {
    startDate: '2025-02',
    endDate: '2025-06',
    current: false,
  });
});

test('sorts multiple breaks newest first', () => {
  const payload = {
    elements: [
      {
        entityComponent: {
          titleV2: { text: { text: 'Older' } },
          subtitle: { text: 'Career Break' },
          caption: { text: 'Jan 2018 - Jun 2018 · 6 mos' },
        },
      },
      {
        entityComponent: {
          titleV2: { text: { text: 'Newer' } },
          subtitle: { text: 'Career Break' },
          caption: { text: 'Feb 2025 - Jun 2025 · 5 mos' },
        },
      },
    ],
  };
  assert.deepEqual(
    extractCareerBreaks(payload).map((b) => b.type),
    ['Newer', 'Older'],
  );
});

test('tolerates empty, malformed, and error responses', () => {
  assert.deepEqual(extractCareerBreaks(null), []);
  assert.deepEqual(extractCareerBreaks({}), []);
  assert.deepEqual(extractCareerBreaks({ data: { errors: [{ message: 'nope' }] } }), []);
  // A break with no caption at all must still parse, not throw.
  const noCaption = {
    entityComponent: { titleV2: { text: { text: 'B' } }, subtitle: { text: 'Career Break' } },
  };
  assert.deepEqual(extractCareerBreaks(noCaption), [
    { type: 'B', startDate: null, endDate: null, current: false, location: null, description: null },
  ]);
});

test('normalizeProfile always declares careerBreaks, even though it never fills it', () => {
  // The entity graph has no career-break data at all; the field exists so the
  // response shape is identical whether or not the SDUI call ran.
  const { profile } = normalizeProfile(load('raw-profile'));
  assert.deepEqual(profile.careerBreaks, []);
});
