import { badRequest } from '../errors.js';

// linkedin.com/in/<publicIdentifier> — the slug is what LinkedIn calls the
// "member identity". Tolerates locale subdomains (in.linkedin.com), trailing
// path segments (/details/experience/), query strings, and a missing scheme.
const PROFILE_URL = /^(?:https?:\/\/)?(?:[\w-]+\.)*linkedin\.com\/in\/([^/?#]+)/i;

/**
 * Extracts the public identifier from a LinkedIn profile URL.
 * Port of extract_public_id() in fetch_profile.py.
 *
 * @param {string} url
 * @returns {string} the public identifier, e.g. "iamarun4official"
 * @throws {ApiError} 400 when the input is not a LinkedIn profile URL
 */
export function parseProfileUrl(url) {
  if (typeof url !== 'string' || url.trim() === '') {
    throw badRequest('Missing required query parameter "url".');
  }

  const match = PROFILE_URL.exec(url.trim());
  if (!match) {
    throw badRequest(
      `Not a LinkedIn profile URL: "${url}". Expected the form ` +
        'https://www.linkedin.com/in/<publicIdentifier>/',
    );
  }

  // Slugs are percent-encoded when they contain non-ASCII characters.
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

/** Canonical profile URL for a public identifier. */
export function profileUrlFor(publicId) {
  return `https://www.linkedin.com/in/${encodeURIComponent(publicId)}/`;
}
