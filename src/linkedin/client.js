import { config, hasCredentials } from '../config.js';
import { ApiError, fromUpstreamStatus } from '../errors.js';

const VOYAGER_PROFILES_URL = 'https://www.linkedin.com/voyager/api/identity/dash/profiles';
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Fetches the raw Voyager payload for one profile.
 *
 * Direct port of fetch_profile_view() in fetch_profile.py — same URL, query
 * params, headers and cookies. Every value here is justified in the
 * "Provenance -> code" table in README.md; do not change one without checking it.
 *
 * @param {string} publicId  e.g. "iamarun4official"
 * @param {object} [extraParams]  additional query params (used for experiments)
 * @returns {Promise<object>} the normalized+json payload: { data, included }
 */
export async function fetchProfileRaw(publicId, extraParams = {}) {
  if (!hasCredentials()) {
    throw new ApiError(
      503,
      'not_configured',
      'Server is missing LinkedIn credentials (LI_AT / JSESSIONID). See .env.example.',
    );
  }

  const url = new URL(VOYAGER_PROFILES_URL);
  url.searchParams.set('q', 'memberIdentity');
  url.searchParams.set('memberIdentity', publicId);
  url.searchParams.set('decorationId', config.decorationId);
  for (const [key, value] of Object.entries(extraParams)) {
    url.searchParams.set(key, String(value));
  }

  const headers = {
    'User-Agent': config.userAgent,
    // LinkedIn's CSRF scheme: the token IS the JSESSIONID value, unquoted.
    'csrf-token': config.jsessionId,
    'x-restli-protocol-version': '2.0.0',
    'x-li-lang': 'en_US',
    Accept: 'application/vnd.linkedin.normalized+json+2.1',
    // JSESSIONID is stored by LinkedIn *with* literal double quotes in the value.
    Cookie: `li_at=${config.liAt}; JSESSIONID="${config.jsessionId}"`,
  };

  let response;
  try {
    response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (cause) {
    const timedOut = cause?.name === 'TimeoutError' || cause?.name === 'AbortError';
    throw new ApiError(
      504,
      timedOut ? 'upstream_timeout' : 'upstream_unreachable',
      timedOut
        ? `LinkedIn did not respond within ${REQUEST_TIMEOUT_MS / 1000}s.`
        : 'Could not reach LinkedIn.',
    );
  }

  if (!response.ok) {
    throw fromUpstreamStatus(response.status);
  }

  // A bot challenge can arrive as 200 + HTML instead of an error status.
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('json')) {
    throw new ApiError(
      503,
      'upstream_blocked',
      'LinkedIn returned a non-JSON response, which usually means a bot challenge ' +
        'was served instead of the API payload.',
    );
  }

  return response.json();
}
