# LinkedIn Profile API

A hosted HTTP API that accepts a LinkedIn profile URL and returns the profile's
public information (name, headline, location, about, experience, education,
skills, certifications, languages, profile images) as structured JSON.

The data is retrieved by calling LinkedIn's own internal API directly with
server-side session credentials. **No browser automation** (Selenium / Puppeteer
/ Playwright) and **no HTML scraping** are involved.

The single API call is implemented in [`fetch_profile.py`](fetch_profile.py)
(function `fetch_profile_view`). A line-by-line, beginner-friendly walkthrough of
that request lives in [`docs/how-the-fetch-works.md`](docs/how-the-fetch-works.md).

> **Status:** reverse-engineering and a working proof-of-concept are complete.
> The public hosted service and its response schema are still being built; this
> README documents the approach, the endpoint, and its limitations. API
> reference and deployment instructions will be added when the service ships.

---

## How the API was reverse-engineered

LinkedIn's web app is backed by an internal API commonly known as **Voyager**
(`https://www.linkedin.com/voyager/api/...`). Profile data lives in a resource
called `identityDashProfiles`. The goal was to confirm that a specific, stable
way of calling that resource exists and is still used by real LinkedIn clients —
not a fragile side path.

Two independent first-party sources were checked (August 2026).

### 1. The LinkedIn website

The logged-in web app was inspected with Chrome DevTools while loading a profile
and its full experience list.

**Reproduce:** log into linkedin.com, open any profile, open DevTools → Network,
filter by `voyager`, reload, then open `…/in/<id>/details/experience/` and watch
the requests.

Findings:

- LinkedIn's website has moved to a **server-driven UI**. Profile pages are
  rendered on LinkedIn's servers and delivered to the browser as finished HTML.
  The browser makes **no `voyager/api` calls for profile content** — the data
  never reaches the client as JSON.
- The only profile-identity request the browser still makes is a GraphQL
  gateway call:
  `GET /voyager/api/graphql?queryId=voyagerIdentityDashProfiles.<hash>&variables=(memberIdentity:<urn>)`.
  Its response is a stub (`entityUrn`, `versionTag`) whose schema is typed as
  `com.linkedin.voyager.dash.identity.profile.Profile` — i.e. the **same
  backend resource** this project calls, reached through a different transport.
- "Save to PDF" and "Show all experiences" also trigger no client-side profile
  API call; both are handled server-side.

Conclusion: the website confirms the `identityDashProfiles` resource is current,
but no longer exposes profile data to the browser. A direct API client is
therefore the only practical non-scraping option.

### 2. The LinkedIn Android app

The official Android app (`com.linkedin.android`, version 4.1.1239) was
statically analysed — the APK was unpacked and its compiled code searched for
string constants.

**Reproduce:** download the APK (e.g. from APKMirror), then:

```bash
unzip -o com.linkedin.android*.apk -d apk
strings apk/classes*.dex | grep -E \
  'FullProfileWithEntities|FullProfileByMemberIdentity|identityDashProfilesByMemberIdentity|deco\.identity\.profile'
```

Full step-by-step with expected output:
[`docs/apk-provenance.md`](docs/apk-provenance.md).

Present in the app, verbatim:

| Constant | Meaning |
| --- | --- |
| `identityDashProfilesByMemberIdentity` | Look up a profile by member identity — the finder this project uses (`q=memberIdentity`) |
| `com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-107` | The response projection ("decoration") this project uses, at a newer version |
| `FullProfileByMemberIdentity`, `FullProfileWithEntitiesV2` | Related finder / projection names |
| `voyagerIdentityDashProfiles.<hash>` (×~35) | Persisted GraphQL queries against the same resource |

Conclusion: the mobile app uses the **identical `identityDashProfiles`
resource**, over both a REST/Rest.li binding with a `decorationId` and GraphQL
persisted queries. Calling it via `q=memberIdentity` with a
`FullProfileWithEntities` decoration is a genuine, current first-party LinkedIn
client pattern.

### Provenance → code

Every non-obvious value in the request maps to something observed above:

| Value in [`fetch_profile.py`](fetch_profile.py) | Line | Backed by |
| --- | --- | --- |
| `https://www.linkedin.com/voyager/api/identity/dash/profiles` | [L64](fetch_profile.py#L64) | `voyager/api/` + `identity/profiles` path fragments in the APK; `dash` resource generation |
| `q=memberIdentity` | [L66](fetch_profile.py#L66) | APK constant `identityDashProfilesByMemberIdentity`; web GraphQL `variables=(memberIdentity:…)` |
| `decorationId` (`DECORATION_ID`, default `…FullProfileWithEntities-107`) | [L33](fetch_profile.py#L33), [L68](fetch_profile.py#L68) | APK constant `com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-107` |
| `csrf-token: <JSESSIONID>` | [L73](fetch_profile.py#L73) | web capture: `csrf-token` header equals the `JSESSIONID` cookie value on every Voyager call |
| `x-restli-protocol-version: 2.0.0` | [L74](fetch_profile.py#L74) | sent by every Voyager call in the web capture |
| `Accept: application/vnd.linkedin.normalized+json+2.1` | [L76](fetch_profile.py#L76) | Accept header used by LinkedIn's own web client for this resource |

---

## The endpoint

```
GET https://www.linkedin.com/voyager/api/identity/dash/profiles
    ?q=memberIdentity
    &memberIdentity=<publicIdentifier>
    &decorationId=com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-107
```

`<publicIdentifier>` is the slug from the profile URL:
`https://www.linkedin.com/in/<publicIdentifier>/`.

Required request headers:

| Header | Value |
| --- | --- |
| `csrf-token` | the `JSESSIONID` cookie value (without quotes) |
| `x-restli-protocol-version` | `2.0.0` |
| `accept` | `application/vnd.linkedin.normalized+json+2.1` |
| `x-li-lang` | `en_US` |
| `user-agent` | a normal desktop browser UA, consistent between requests |

## Authentication

LinkedIn's session is carried by two cookies, extracted once from a logged-in
browser session and supplied server-side:

- `li_at` — the session token
- `JSESSIONID` — sent both as a cookie (quoted: `"ajax:12345..."`) and as the
  `csrf-token` header (unquoted)

These belong to a real LinkedIn account and are treated as secrets (see below).

---

## Known limitations

- **`decorationId` is versioned.** LinkedIn increments the trailing number
  (`-107` today, `-93` in an earlier capture) as the schema evolves. Old
  versions keep working for a while, then start returning `400`/`410`. The
  value is configurable (`DECORATION_ID`) so it can be updated without a code
  change.
- **Session lifetime.** `li_at` is long-lived but is revoked on password change
  and some security events. There is no refresh flow — the cookies must be
  re-extracted manually when they expire. `JSESSIONID` and the `csrf-token`
  header must always match.
- **Anti-automation.** LinkedIn runs bot-detection on its endpoints (observed:
  PerimeterX / HUMAN, reCAPTCHA Enterprise, Cloudflare Bot Management). Requests
  from datacenter IP ranges, or at high volume, may be challenged, rate-limited,
  or blocked. This service is intended for low-volume, on-demand, single-profile
  lookups.
- **Coverage varies.** Private profiles, out-of-network members, and certain
  fields depend on the relationship between the credentialed account and the
  target profile. Some sections may be missing or partial.
- **Terms of Service.** Automated access to LinkedIn is contrary to LinkedIn's
  User Agreement. This project is for a technical hiring exercise and
  educational purposes.

---

## Local proof-of-concept

A single-file script fetches the raw payload for one profile:

```bash
export LI_AT="<li_at cookie value>"
export JSESSIONID="ajax:<digits>"          # no surrounding quotes
export DECORATION_ID="com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-107"

python fetch_profile.py https://www.linkedin.com/in/<publicIdentifier>/
```

It writes the unprocessed response to `raw_response.json`, which is the basis
for designing the public API's response schema.

## Secrets

No credentials are committed to this repository. `li_at` and `JSESSIONID` are
provided only via environment variables (or a local, git-ignored `.env` file).
Raw API dumps and any file that may contain personal profile data are
git-ignored as well.

---

## Roadmap

- [ ] Public HTTP endpoint: `GET /profile?url=<linkedin profile url>`
- [ ] Normalise the Voyager payload into a documented JSON schema
- [ ] Deploy over HTTPS
- [ ] API reference and deployment guide in this README
