import test from 'node:test';
import assert from 'node:assert/strict';

import { classifyUpstreamBody, fromUpstreamStatus } from '../src/errors.js';

test('a 403 with a user-visible exception is a 404, not an auth failure', () => {
  const body = {
    data: {
      exceptionClass: 'com.linkedin.voyager.common.VoyagerUserVisibleException',
      message: "This profile can't be accessed",
      status: 403,
    },
    included: [],
  };
  const err = classifyUpstreamBody(403, body);
  assert.equal(err?.status, 404);
  assert.equal(err.code, 'profile_not_found');
  assert.match(err.message, /can't be accessed/);
});

test('a 403 with no informative body falls through to auth-failed', () => {
  assert.equal(classifyUpstreamBody(403, null), null);
  assert.equal(classifyUpstreamBody(403, { data: 'login page html' }), null);
  assert.equal(fromUpstreamStatus(403).code, 'upstream_auth_failed');
});

test('maps rate-limit and bot-block statuses to 503', () => {
  assert.equal(fromUpstreamStatus(429).status, 503);
  assert.equal(fromUpstreamStatus(999).status, 503);
  assert.equal(fromUpstreamStatus(429).code, 'upstream_blocked');
});

test('maps a retired decoration to decoration_stale', () => {
  const err = fromUpstreamStatus(410);
  assert.equal(err.code, 'decoration_stale');
  assert.match(err.message, /DECORATION_ID/);
});

test('serializes to the API error envelope', () => {
  assert.deepEqual(fromUpstreamStatus(410).toJSON(), {
    error: { code: 'decoration_stale', message: fromUpstreamStatus(410).message },
  });
});
