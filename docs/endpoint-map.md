# The LinkedIn profile endpoint map

What this project calls, what else exists, and why the single call is enough for
almost everything. All of this was found the same way the main endpoint was —
`strings` on the LinkedIn Android APK's `classes*.dex`, then live testing (see
[the provenance write-up](apk-provenance.md)).

---

## The call this service makes

```
GET /voyager/api/identity/dash/profiles
    ?q=memberIdentity
    &memberIdentity=<publicIdentifier>
    &decorationId=com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-107
```

One authenticated request. The response is a flat `included[]` array of
cross-referenced entities.

### Entities in a `FullProfileWithEntities-107` response

Counts below are from a real rich profile (Reid Hoffman, 179 entities):

| Entity | Count | What it is |
| --- | --- | --- |
| `Profile` | 1 (+ stubs) | the subject; extra `Profile` entities are referenced by `MemberRelationship` |
| `Position` | 11 | individual roles |
| `PositionGroup` | **10** | roles grouped by company (the "Company — 3 roles" block) — **hard cap**, `paging.total` was 32 |
| `Company` | 28 | resolved employers + volunteer orgs — `name`, `url`, `logo`, staff count |
| `School` | 5 | resolved schools |
| `Education` | 6 | degrees |
| `Skill` | **20** | **hard cap** — `paging.total` was 47 |
| `Honor` | 9 | awards (`title`, `issuer`, `issuedOn`, `description`, `occupation`) — surfaced as `profile.honors` |
| `VolunteerExperience` | 14 | `role`, `companyName`, `cause`, `dateRange`, `description` — surfaced as `profile.volunteerExperience` |
| `Publication` | 6 | `name`, `publisher`, `publishedOn`, `url`, `description`, `authors[]` — surfaced as `profile.publications` |
| `TreasuryMedia` | **3** | "Featured" links/media — also capped |
| `MemberRelationship` | 6 | connection-degree info to other members |
| `Geo` | 5 | resolved locations (many are all-`null` stubs) |
| `Industry` | 5 | resolved industry names |
| `EmploymentType` | 1 | "Full-time" etc. |
| `StandardizedFieldOfStudy` | 1 | mostly empty stubs |
| `CollectionResponse` | 42 | the wrappers holding `paging` + `*elements` pointers, one per section |

The **`Profile` entity** carries `firstName`/`lastName`, `headline`, `summary`
(about), `locationName` + `geoLocation`, `industryUrn`, `profilePicture` +
`backgroundPicture`, `pronounUnion`, `premium`/`influencer`/`creator` flags,
`birthDateOn`, `address`, `volunteerCauses`, plus `*`-pointers to all 17
sections (`*profileSkills`, `*profileHonors`, `*memberRelationship`, …).

Sections usually **empty**: `*profileCourses`, `*profilePatents`,
`*profileProjects`, `*profileTestScores`, `*profileOrganizations`,
`*profileVideoPreview`, `*profileRingStatusCollection`.

**One honest signal, checked on every list section.** `normalizeProfile()`
compares each collection's resolved count against its own `paging.total` and,
when they differ, adds a matching key to `meta.partial` — the same check now
runs for `skills`, `experience` (`{ returnedGroups, totalGroups }`, since the
cap is on position *groups*, not flattened role entries), `featured`,
`volunteerExperience`, `honors`, and `publications`. In practice only
`profileSkills`, `profilePositionGroups`, and `profileTreasuryMediaProfile`
have ever been observed exceeding their own `paging.total` in this decoration
— the other three (14/9/6 on Reid Hoffman, all well under the default
20-item page) show no sign of being capped. The check runs on all six anyway,
uniformly, on the chance a profile with more honors, volunteer roles, or
publications than that ever turns up — cheaper to check always than to
special-case it later.

---

## Other profile resources

### Top-level `identityDashProfiles` finders — same resource, other `q=`

| `q=` | Returns |
| --- | --- |
| `memberIdentity` | by vanity slug — **what this service uses** |
| `me` | the credentialed account's own profile |
| `profileUrn` / `byId` / `Ids` | by `urn:li:fsd_profile:…` |
| `sameName` | other people with the same name |
| `browsemap` | "people also viewed" |
| `decisionMakers`, `followerInsights`, `connectionsUsingOrganizationProduct` | sales / recruiter surfaces |

### Per-section finders — `?q=viewee&profileUrn=<URN>`

Every one returns HTTP 200. They exist for `profileSkills`, `profilePositions`,
`profilePositionGroups`, `profileEducations`, `profileCertifications`,
`profileLanguages`, `profileHonors`, `profileVolunteerExperiences`,
`profilePublications`, `profileProjects`, `profileTestScores`, `profileCourses`,
`profileOrganizations`, `profilePatents`, `profileTreasuryMedia` (+ `ByPosition`,
`ByEducation`), `profileEndorsements`, `profileTopVoiceBadgeDetails`,
`profileVerifiedInfo`.

**These add almost nothing over the main call.** Field-for-field diff against
`FullProfileWithEntities-107`:

| Section endpoint | Difference |
| --- | --- |
| **`profileSkills` (`&count=100`)** | **The whole list.** The main call caps at 20 regardless of total. `count` is honored — this is a call worth making, and this project makes it. |
| **`profilePositions` (`&count=100`)** | **The whole list**, unlike `profilePositionGroups` (below). `count` is honored here too — a rich profile capped at 10 groups by the main call gets all individual roles (Reid Hoffman: 33 of 33, verified live). Adds `hasSkillAssociations`, `regionUrn`, and — for at least one role, seen live — a **more precise date** (`{year, month}` vs the main call's `{year}`). **Loses** resolved `*company` / `*employmentType` / `*geo` — bare URNs only, no inlined `Company`, so `companyLogo`/`companyUrl`/`employmentType` can't be reconstructed from this call alone. This project makes it too, filling those three back in from the main call's own resolution where the position was already known — see below. |
| `profilePositionGroups` (`&count=100`) | Also returns all 32 (verified live) — but only company-level fields (`companyName`, `companyUrn`, `dateRange`), no per-role `title`/`description`. **Superseded by `profilePositions` above**, which returns the same total at role granularity. |
| **`profileTreasuryMedia` (`&count=100`)** | Adds real media metadata: `width`, `height`, `previewImages`, `mediaTitle`, `mediaDescription`, `createdAtText`, `assetAvailable`. **Still capped at 3 of ~10 even with `count=100`** — verified live. Unlike skills and positions, this is a genuine server-side limit on this finder, not something a bigger `count` fixes. |
| `profileEducations` | Adds `fieldOfStudyUrn`. Loses resolved `*school` / `*company`. |
| `profileHonors` | Identical (main call additionally has `occupation`). **Parsed by this project** — see below. |
| `profileVolunteerExperiences` | Identical (main call additionally resolves `*company`). **Parsed by this project** — see below. |
| `profilePublications` | Byte-for-byte identical fields. **Parsed by this project** — see below. |

So for education, honors, volunteer, publications, languages, certifications,
industry and images, the single decoration call already returns everything —
in full, with references resolved. **Experience is the exception**: the main
call's `profilePositionGroups` collection is capped the same way skills is
(10 groups regardless of total), which is why `experience` gets the same
`meta.partial` treatment and the same `?full=1` completion path as skills —
see below.

**Honors, volunteer experience, and publications were captured live and
confirmed present in the main call, but were not wired into the normalizer
until now** — the data sat unused in the same response every lookup already
fetches. No new request, no new finder: `normalizeProfile()` now walks
`*profileHonors`, `*profileVolunteerExperiences`, and `*profilePublications`
the same way it already walked `*profileCertifications`. Each gets the same
honest `meta.partial` treatment as every other section (paging.total compared
against what's returned), on the off chance a profile ever has more than the
default 20-item page size for one of these — not observed live (Reid Hoffman:
14 / 9 / 6, all under the cap), but the check costs nothing and keeps the
"never silently incomplete" guarantee uniform across every section rather
than special-cased to the three that happened to get discovered first.
`publications[].authors` resolves each co-author's name only when that
person's `Profile` entity happens to be inlined in the same response — which
it usually is, the same mechanism that resolves a connection's name elsewhere
in the payload — and is skipped, not guessed at, when it isn't.

### GraphQL-only (404 as REST)

- **`profileComponents`** (`q=sectionType`) — the section API LinkedIn's **web
  SDUI** uses; needs a persisted-query hash and a specific variable shape.
- **`profileCards`** — the full card stack the web renders.

### Dead / not found

| | |
| --- | --- |
| `identity/profiles/{id}/profileView` | 410 |
| `identity/profiles/{id}/profileContactInfo` | 410; no dash replacement found at any tried path |
| **Career breaks** | not in any Voyager route, no entity type in the Android app — web-only (see [README "Known limitations"](../README.md#known-limitations)) |

---

## What this service wires in: `?full=1`

When `GET /profile` finds a section capped, `?full=1` spends one extra request
*per capped section* (never more than needed) fetching the dedicated finder,
in parallel:

```
GET /voyager/api/identity/dash/profileSkills
    ?q=viewee&profileUrn=<urn>&count=100
    — when meta.partial.skills is present

GET /voyager/api/identity/dash/profilePositions
    ?q=viewee&profileUrn=<urn>&count=100
    — when meta.partial.experience is present
```

No `decorationId` needed for either. Skills:
[`extractSkillNames()`](../src/linkedin/normalize.js) resolves `data['*elements']`
in order and returns every skill name; the service replaces `profile.skills`
and drops `meta.partial.skills`.

Experience: [`extractFullExperience()`](../src/linkedin/normalize.js) does the
same for `profilePositions`, then fills `companyLogo`/`companyUrl`/
`employmentType` back in — by matching each recovered position's own URN
against `enrichmentByUrn`, a map `buildExperience()` builds from what the main
call had already resolved — for every role that call had *already* returned.
Roles recovered *only* by this completion pass (the ones beyond the original
10-group cap) get `null` for those three fields, the same way a company with
no logo already does; everything else (`title`, `company`, dates,
`description`, `location`) is present either way. The service replaces
`profile.experience` and drops `meta.partial.experience`.

Both are opt-in, not default: the extra request(s) add latency and a little
more bot-detection surface, and the capped defaults (20 skills, 10 position
groups) are enough for most callers. `?full=1` is for when you specifically
need the complete list — of either or both.

**Not wired in:** completion for `featured`. `profileTreasuryMedia` is
flagged via `meta.partial.featured` when capped (see above), but — unlike
skills and experience — its dedicated finder is capped at 3 of ~10 even with
`count=100` (verified live), so there is no follow-up request that would
actually return more. Fully surfacing it would mean scraping LinkedIn's web
UI, which this project deliberately does not do — noted here so the gap is
explicit rather than silent.
