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
