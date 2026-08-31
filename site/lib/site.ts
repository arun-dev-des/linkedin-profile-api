export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? 'https://linkedin-profile-api-production-3c84.up.railway.app';

export const REPO = 'https://github.com/arun-dev-des/linkedin-profile-api';
export const BLOB = `${REPO}/blob/main`;

export const NAV: { href: string; label: string; icon: string; group?: string }[] = [
  { href: '/', label: 'Try it', icon: 'zap' },
  { href: '/approach', label: 'Approach', icon: 'compass', group: 'Docs' },
  { href: '/apk-provenance', label: 'Provenance', icon: 'shield-check', group: 'Docs' },
  { href: '/endpoint-map', label: 'Endpoints', icon: 'waypoints', group: 'Docs' },
  { href: '/api', label: 'API reference', icon: 'braces', group: 'Docs' },
];

/**
 * Quick-pick profiles for the Try-it search. `sample: true` marks the one
 * preset that loads from `/profile/sample` — the committed fixture, served
 * with zero LinkedIn calls — instead of a live `/profile?url=…` lookup.
 */
export const PRESETS: { id: string; name: string; note: string; url: string; sample?: boolean }[] = [
  {
    id: 'reidhoffman',
    name: 'Reid Hoffman',
    note: 'LinkedIn co-founder · cached, no LinkedIn call',
    url: 'https://www.linkedin.com/in/reidhoffman/',
    sample: true,
  },
  {
    id: 'williamhgates',
    name: 'Bill Gates',
    note: 'Microsoft co-founder · live fetch',
    url: 'https://www.linkedin.com/in/williamhgates/',
  },
  {
    id: 'padamkataria',
    name: 'Padam Kataria',
    note: 'Tross co-founder · live fetch',
    url: 'https://www.linkedin.com/in/padamkataria/',
  },
  {
    id: 'meetcshah19',
    name: 'Meet Shah',
    note: 'Tross co-founder · live fetch',
    url: 'https://www.linkedin.com/in/meetcshah19/',
  },
  {
    id: 'iamarun4official',
    name: 'Arunkumar Alagarsamy',
    note: 'this submission · live fetch',
    url: 'https://www.linkedin.com/in/iamarun4official/',
  },
];
