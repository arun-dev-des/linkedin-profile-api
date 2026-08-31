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

## What it does

`GET /profile?url=<linkedin profile url>` returns:

```json
{
  "profile": {
    "name": "Reid Hoffman",
    "headline": "Co-Founder, LinkedIn, Manas AI & Inflection AI...",
    "location": "United States",
    "about": "…",
    "experience": [
      { "title": "Partner", "company": "Greylock",
        "startDate": "2009-11", "endDate": null, "current": true, "description": "…" }
    ],
    "education": [
      { "school": "Stanford University", "degree": "B.S.", "fieldOfStudy": "Symbolic Systems" }
    ],
    "skills": [ "Entrepreneurship", "Venture Capital", "Strategy" ],
    "certifications": [ ],
    "languages": [ ],
    "featured": [ { "title": "Blitzscaling: Book Trailer", "provider": "SlideShare" } ],
    "images": { "profilePicture": "https://media.licdn.com/…", "backgroundImage": "…" }
  },
  "meta": { "fetchedAt": "…", "cached": false, "source": "linkedin-voyager" }
}
```

Full field reference and error codes are on the [API page](/api). Every profile
endpoint that was found — and why the single call above covers almost all of
them — is on the [endpoint map](/endpoint-map).

## Architecture

- **`src/linkedin/client.js`** — the authenticated Voyager `GET`s (profile, plus the
  skills finder for `?full=1`), with upstream `401/403/404/410/429/999` mapped onto
  clean API statuses.
- **`src/linkedin/normalize.js`** — resolves LinkedIn's URN-linked entity graph into
  a clean tree. Pure function, no I/O, tested entirely offline against a real
  captured payload — including every edge case that payload contains (null
  `locationName` resolved via a Geo lookup, all-null Geo stubs, placeholder school
  names, unsorted positions, missing company logos). A line-by-line walkthrough of
  the request itself is on [The request](/how-the-fetch-works).
- **`src/server.js`** — Express: the `/profile` route, an always-available
  `/profile/sample`, a per-IP rate limiter, and a short-lived response cache.
