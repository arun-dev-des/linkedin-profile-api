import 'dotenv/config';

/**
 * All configuration comes from the environment. Credentials are never
 * hard-coded and never logged — see README "Secrets".
 */
export const config = {
  liAt: process.env.LI_AT ?? '',
  jsessionId: process.env.JSESSIONID ?? '',

  // LinkedIn versions its response projections and retires old ones (HTTP 410).
  // Default is the value shipped by the Android app — see docs/apk-provenance.md.
  decorationId:
    process.env.DECORATION_ID ??
    'com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-107',

  // Career breaks exist only in LinkedIn's server-driven-UI GraphQL response,
  // not in any Rest.li resource — see docs/endpoint-map.md. Persisted GraphQL
  // queries are versioned exactly like decorationId; this hash ships in the
  // Android app and will eventually be retired.
  careerBreakQueryId:
    process.env.CAREER_BREAK_QUERY_ID ??
    'voyagerIdentityDashProfileComponents.4d8c0decb1483bab947f7bbaba1c3107',

  userAgent:
    process.env.LI_USER_AGENT ??
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36',

  port: Number(process.env.PORT ?? 3000),

  // The showcase site is deployed separately (Vercel). When set, the API host's
  // "/" redirects there instead of serving the legacy single-file UI, which
  // stays reachable at /index.html. Set to an empty string to keep "/" local.
  showcaseUrl:
    process.env.SHOWCASE_URL ?? 'https://linkedin-profile-api-phi.vercel.app/',

  // Successful lookups are cached briefly so a reviewer refreshing the page
  // doesn't burn the LinkedIn session's rate limit.
  cacheTtlMs: Number(process.env.CACHE_TTL_MS ?? 60 * 60 * 1000),

  rateLimit: {
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60 * 1000),
    max: Number(process.env.RATE_LIMIT_MAX ?? 30),
  },
};

/** True when both session cookies are present. */
export function hasCredentials() {
  return Boolean(config.liAt && config.jsessionId);
}

/** Names of any missing required credentials, for a clear startup warning. */
export function missingCredentials() {
  return [
    ['LI_AT', config.liAt],
    ['JSESSIONID', config.jsessionId],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);
}
