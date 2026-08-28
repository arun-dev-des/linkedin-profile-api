export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? 'https://linkedin-profile-api-production-3c84.up.railway.app';

export const REPO = 'https://github.com/arun-dev-des/linkedin-profile-api';
export const BLOB = `${REPO}/blob/main`;

export const NAV: { href: string; label: string; icon: string; group?: string }[] = [
  { href: '/', label: 'Try it', icon: 'zap' },
  { href: '/overview', label: 'Overview', icon: 'book-open' },
  { href: '/approach', label: 'Approach', icon: 'compass', group: 'Docs' },
  { href: '/how-the-fetch-works', label: 'The request', icon: 'terminal', group: 'Docs' },
  { href: '/apk-provenance', label: 'Provenance', icon: 'shield-check', group: 'Docs' },
  { href: '/endpoint-map', label: 'Endpoints', icon: 'waypoints', group: 'Docs' },
  { href: '/api', label: 'API reference', icon: 'braces', group: 'Docs' },
];

/** Quick-pick profiles for the Try-it search. */
export const PRESETS: { id: string; name: string; note: string; url: string }[] = [
  {
    id: 'iamarun4official',
    name: 'Arunkumar Alagarsamy',
    note: 'this submission',
    url: 'https://www.linkedin.com/in/iamarun4official/',
  },
  {
    id: 'reidhoffman',
    name: 'Reid Hoffman',
    note: 'LinkedIn co-founder · rich profile',
    url: 'https://www.linkedin.com/in/reidhoffman/',
  },
  {
    id: 'padamkataria',
    name: 'Padam Kataria',
    note: 'Tross co-founder',
    url: 'https://www.linkedin.com/in/padamkataria/',
  },
  {
    id: 'meetcshah19',
    name: 'Meet Shah',
    note: 'Tross co-founder',
    url: 'https://www.linkedin.com/in/meetcshah19/',
  },
];
