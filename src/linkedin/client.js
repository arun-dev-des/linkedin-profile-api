import { config, hasCredentials } from '../config.js';
import { ApiError, classifyUpstreamBody, fromUpstreamStatus } from '../errors.js';

const VOYAGER = 'https://www.linkedin.com/voyager/api';
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * One authenticated GET against Voyager, with the full error-classification
 * chain. Every header and cookie here is justified in the "Provenance -> code"
 * table in README.md; do not change one without checking it.
 *
 * @param {URL} url
 * @returns {Promise<object>} the normalized+json payload: { data, included }
 */
async function voyagerGet(url) {
  if (!hasCredentials()) {
    throw new ApiError(
      503,
      'not_configured',
      'Server is missing LinkedIn credentials (LI_AT / JSESSIONID). See .env.example.',
    );
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
    response = await fetch(url, { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
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

  // A bot challenge can arrive as 200 + HTML instead of an error status.
  const contentType = response.headers.get('content-type') ?? '';
  const body = contentType.includes('json') ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    // 403 for a missing profile looks identical to 403 for bad auth except in
    // the body — check that before assuming the credentials are broken.
    throw classifyUpstreamBody(response.status, body) ?? fromUpstreamStatus(response.status);
  }

  if (body === null) {
    throw new ApiError(
      503,
      'upstream_blocked',
      'LinkedIn returned a non-JSON response, which usually means a bot challenge ' +
        'was served instead of the API payload.',
    );
  }

  // Some errors arrive as HTTP 200 wrapping an exception envelope.
  if (body?.data?.exceptionClass || typeof body?.data?.status === 'number') {
    throw (
      classifyUpstreamBody(body.data.status ?? response.status, body) ??
      fromUpstreamStatus(body.data.status ?? 502)
    );
  }

  return body;
}

/**
 * Fetches the raw profile payload — the one call that returns experience,
 * education, skills, certifications, images and more in a single response.
 * Port of fetch_profile_view() in fetch_profile.py.
 *
 * @param {string} publicId  e.g. "iamarun4official"
 * @returns {Promise<object>} { data, included }
 */
export function fetchProfileRaw(publicId) {
  const url = new URL(`${VOYAGER}/identity/dash/profiles`);
  url.searchParams.set('q', 'memberIdentity');
  url.searchParams.set('memberIdentity', publicId);
  url.searchParams.set('decorationId', config.decorationId);
  return voyagerGet(url);
}

/**
 * Fetches the *complete* skills list for a profile.
 *
 * The FullProfileWithEntities decoration hard-caps skills at 20 regardless of
 * how many the profile has (see docs/endpoint-map.md). This dedicated finder
 * returns all of them; no decorationId is needed.
 *
 * @param {string} profileUrn  the subject's `urn:li:fsd_profile:…`
 * @returns {Promise<object>} { data, included }
 */
export function fetchProfileSkills(profileUrn) {
  const url = new URL(`${VOYAGER}/identity/dash/profileSkills`);
  url.searchParams.set('q', 'viewee');
  url.searchParams.set('profileUrn', profileUrn);
  url.searchParams.set('start', '0');
  url.searchParams.set('count', '100');
  return voyagerGet(url);
}
