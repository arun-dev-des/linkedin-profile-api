# A reverse-engineered LinkedIn Profile API

Paste a LinkedIn profile URL, get the profile back as structured JSON — name,
headline, location, experience, education, skills, certifications, languages,
images. One authenticated request to LinkedIn's own internal API. No browser
automation, no HTML scraping.

[**Try it →**](/) &nbsp;·&nbsp; [Sample response](https://linkedin-profile-api-production-3c84.up.railway.app/profile/sample) &nbsp;·&nbsp; [Source on GitHub](https://github.com/arun-dev-des/linkedin-profile-api)

- **Node + Express on Railway** — the hosted API
- **Single Voyager API call** per lookup, then a pure-function transform
- **Provenance verified** against the LinkedIn Android app's compiled code
- **Offline-tested normalizer** — every real-payload edge case has a test

---

## What it does

`GET /profile?url=<linkedin profile url>` returns:

```json
{
  "profile": {
    "name": "Arunkumar Alagarsamy",
    "headline": "Product Designer · Design Engineer · AI Builder",
    "location": "Bengaluru, Karnataka, India",
    "about": "…",
    "experience": [
      { "title": "Product Designer", "company": "Applix",
        "startDate": "2024-08", "endDate": "2025-08", "current": false, "description": "…" }
    ],
    "education": [ ],
    "skills": [ "Design Systems", "Figma (Software)" ],
    "certifications": [ ],
    "languages": [ ],
    "featured": [ ],
    "images": { "profilePicture": "https://media.licdn.com/…", "backgroundImage": "…" }
  },
  "meta": { "fetchedAt": "…", "cached": false, "source": "linkedin-voyager" }
}
```

Full field reference and error codes are on the [API page](/api).

## How it works, in one paragraph

LinkedIn's apps talk to an internal API called **Voyager**. Profile data lives in a
resource named `identityDashProfiles`. Requesting it with `q=memberIdentity` and a
`decorationId` of `…FullProfileWithEntities-107` returns the whole profile —
experience, education, skills, and more — in **one** authenticated `GET`, using the
`li_at` and `JSESSIONID` cookies from a logged-in session. The response is
LinkedIn's "normalized" format: a flat array of entities linked by URN, which a
[pure-function normalizer](/how-the-fetch-works) reassembles into the schema above.

## Why this is a real endpoint, not a lucky guess

The exact request was verified against **two first-party LinkedIn clients**:

- **The website** — its server-driven UI resolves the same `identityDashProfiles`
  resource, just server-side; the browser never sees the JSON.
- **The Android app** (`com.linkedin.android` 4.1.1239) — its compiled code
  contains, verbatim, the finder `identityDashProfilesByMemberIdentity` and the
  decoration `com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-107`.

The full walkthrough, including a one-line command to reproduce the APK check, is
on the [Provenance page](/apk-provenance).

## Architecture

- **`src/linkedin/client.js`** — the authenticated Voyager `GET`s (profile, plus the
  skills finder for `?full=1`), with upstream `401/403/404/410/429/999` mapped onto
  clean API statuses.
- **`src/linkedin/normalize.js`** — resolves LinkedIn's URN-linked entity graph into
  a clean tree. Pure function, no I/O, tested entirely offline against a real
  captured payload — including every edge case that payload contains (null
  `locationName` resolved via a Geo lookup, all-null Geo stubs, placeholder school
  names, unsorted positions, missing company logos).
- **`src/server.js`** — Express: the `/profile` route, an always-available
  `/profile/sample`, a per-IP rate limiter, and a short-lived response cache.

Read the [reverse-engineering write-up](/approach) for the investigation, the
[endpoint map](/endpoint-map) for every profile endpoint found, or the
[known limitations](/api#known-limitations) for what the endpoint does and doesn't
expose.
