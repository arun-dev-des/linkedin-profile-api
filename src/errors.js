/**
 * Errors that carry the HTTP status and machine-readable code the API should
 * return. Keeps upstream LinkedIn failures from leaking raw into responses.
 */
export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }

  toJSON() {
    return { error: { code: this.code, message: this.message } };
  }
}

export const badRequest = (message) => new ApiError(400, 'invalid_request', message);

export const notFound = (message) => new ApiError(404, 'profile_not_found', message);

/**
 * LinkedIn returns 403 for both a genuine auth failure and a profile that
 * doesn't exist / isn't visible. The two are only distinguishable by the body:
 * an inaccessible profile comes back as a JSON error envelope with a
 * user-visible message, whereas a real auth failure returns a login redirect
 * or a non-JSON challenge.
 *
 * @param {number} status  the HTTP status from LinkedIn
 * @param {any} body       the parsed response body, if it was JSON
 * @returns {ApiError|null} a not-found error, or null to fall through
 */
export function classifyUpstreamBody(status, body) {
  const envelope = body?.data;
  if (!envelope || typeof envelope !== 'object') return null;

  const isUserVisible =
    typeof envelope.exceptionClass === 'string' &&
    envelope.exceptionClass.includes('VoyagerUserVisibleException');
  const looksLikeMissing = /can't be accessed|not found|doesn't exist/i.test(envelope.message ?? '');

  if ((status === 403 || status === 404) && (isUserVisible || looksLikeMissing)) {
    return notFound(
      envelope.message
        ? `LinkedIn: ${envelope.message}`
        : 'No such LinkedIn profile, or it is not visible to the credentialed account.',
    );
  }
  return null;
}

/**
 * Maps a LinkedIn HTTP status onto our own. The 429/999 branch is the one that
 * matters in production: a hosted server calling from a datacenter IP is far
 * more likely to be bot-flagged than a laptop on a home connection.
 */
export function fromUpstreamStatus(status) {
  switch (status) {
    case 401:
    case 403:
      return new ApiError(
        502,
        'upstream_auth_failed',
        'LinkedIn rejected the session. The li_at/JSESSIONID pair is likely expired ' +
          'or mismatched, or the User-Agent is inconsistent with the session.',
      );
    case 404:
      return notFound('No such LinkedIn profile, or it is not visible to the credentialed account.');
    case 410:
      return new ApiError(
        502,
        'decoration_stale',
        'LinkedIn retired this DECORATION_ID version. Pull a current one from the ' +
          'latest Android APK (see docs/apk-provenance.md) and update the env var.',
      );
    case 429:
    case 999:
      return new ApiError(
        503,
        'upstream_blocked',
        'LinkedIn rate-limited or bot-blocked this request. This is expected from ' +
          'datacenter IP ranges; try again shortly or use /profile/sample.',
      );
    default:
      return new ApiError(502, 'upstream_error', `LinkedIn returned an unexpected status ${status}.`);
  }
}
