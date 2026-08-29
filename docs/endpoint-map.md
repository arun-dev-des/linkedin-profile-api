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
| `Profile` | 1 (+ stubs) | the subject, plus anyone else resolved on the profile (e.g. a publication co-author — see `Publication` below) |
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
| `MemberRelationship` | 6 | connection-degree info between the *credentialed account* and each resolved member — never read by `normalizeProfile()`, stripped from `/profile/raw` (see below) |
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

**`*memberRelationship` is the one pointer `normalizeProfile()` deliberately
never follows.** Every `Profile` entity LinkedIn resolves in this
response — the subject, and anyone else referenced (a publication co-author,
say) — carries its own `*memberRelationship` pointer describing how the
*credentialed account* relates to that specific person. Following it
resolves a `MemberRelationship` entity whose `…noInvitation.{inviter,
*inviterResolutionResult}` embeds the credentialed account's own `Profile`
entity and URN — the server operator's own LinkedIn identity, present in
every single lookup regardless of who was actually asked about. Confirmed
live: fetching Reid Hoffman's profile returns not just Reid Hoffman, but a
`Profile` entity for the account whose cookies this server runs on, plus one
`MemberRelationship` entity per resolved member (6 of them) carrying that
account's URN.

Since none of that is read by `normalizeProfile()`, `/profile/raw` and
`/profile/sample/raw` run the payload through `sanitizeRawPayload()` first: a
graph walk from the root profile identical to the one `normalizeProfile()`
itself performs, except it never crosses a `*memberRelationship` edge. A
co-author's `Profile` (reached via `*profilePublications` ->
`authors[].standardizedContributor["*profile"]`, a completely different path)
survives; the credentialed account's own `Profile` — reachable *only* through
the excluded edge — doesn't. `GET /profile` was never affected; this only
touches the two raw-payload routes.

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

- **`profileComponents`** (`sectionType:experience`) — the section API
  LinkedIn's **SDUI** uses; needs a persisted-query id and a specific variable
  shape. **This is where career breaks live** — see below.
- **`profileCards`** — the full card stack rendered on the profile page.
  `…ProfileCards.c7d33a73c633e2f96731688717a89d9e` with just
  `(profileUrn:<urn>)` returns every card, the Experience one included — but
  capped at 5 entries with a "Show all N experiences" footer, so
  `profileComponents` is the better source.

Persisted query ids for both are in the APK:

```bash
strings apk/classes*.dex | grep -oE 'voyagerIdentityDashProfile(Components|Cards)\.[a-f0-9]+' | sort -u
```

### Dead / not found

| | |
| --- | --- |
| `identity/profiles/{id}/profileView` | 410 |
| `identity/profiles/{id}/profileContactInfo` | 410; no dash replacement found at any tried path |
| ~~Career breaks~~ | **This was wrong — see [Career breaks](#career-breaks-the-sdui-exception) below.** They are not in any *Rest.li* route, but they are reachable, via GraphQL. |

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

---

## Career breaks: the SDUI exception

**An earlier version of this document said career breaks were "not in any
Voyager route, no entity type in the Android app — web-only". That was wrong,
and it had never been tested against a profile that actually has one.** They
are reachable. Just not from any Rest.li resource.

### What was verified, against a real profile with a career break

| Source | Career break present? |
| --- | --- |
| `FullProfileWithEntities-107` — **all 17** `*` section pointers | ❌ no |
| `profilePositions?q=viewee&count=100` | ❌ no |
| `profilePositionGroups?q=viewee&count=100` | ❌ no |
| `identity/dash/employmentTypes` | ❌ no — returns exactly 6 values (Full-time, Part-time, Self-employed, Freelance, Internship, Trainee); career break is not one |
| **`profileComponents` GraphQL, `sectionType:experience`** | ✅ **yes** |

The entity graph genuinely does not carry it: no `urn:li:fsd_careerBreak*`
type exists, there is no `profileCareerBreaks` finder, no career-break
decoration, and no `CareerBreak` model class in the APK.

What the APK *does* have — and what makes the old "no entity type" claim
wrong — is career break as a first-class **profile section**, sitting in the
same list as the sections that do have resources:

```
ProfileTreasuryEditModelUtilsKt$CAREER_BREAK$2
ProfileTreasuryEditModelUtilsKt$POSITION$2
ProfileTreasuryEditModelUtilsKt$EDUCATION$2
ProfileTreasuryEditModelUtilsKt$HONOR$2
ProfileTreasuryEditModelUtilsKt$VOLUNTEER$2
```

plus `buildExperienceAddCareerBreakButton` — it is added from inside the
Experience section, which is exactly where it renders.

### The call

```
GET /voyager/api/graphql
    ?queryId=voyagerIdentityDashProfileComponents.4d8c0decb1483bab947f7bbaba1c3107
    &variables=(profileUrn:<urn>,sectionType:experience)

Accept: application/json
```

**The `Accept` header is the whole trick, and is why this was missed.** With
`application/vnd.linkedin.normalized+json+2.1` — the header every other call
in this project uses — LinkedIn returns **HTTP 500**:

```
java.lang.RuntimeException: A record in the included list does not have a type.
```

That is LinkedIn's *own* normalized serializer failing on its *own* response.
The query executes fine; only the serialization step dies. Ask for plain
`application/json` and the same request returns the full section. This is the
one call in the service that does not use the normalized+json header — see
`voyagerGet(url, { accept })` in [`client.js`](../src/linkedin/client.js).

`variables` is Rest.li-style syntax, so the parentheses and colons must stay
literal — only the URN inside is percent-encoded.

### The shape, and why it is weaker than everything else here

The response is a **component tree of rendered text**, not an entity graph.
A career break looks like this:

| Field | Value |
| --- | --- |
| `entityComponent.titleV2.text.text` | `"Professional development"` — the break *type* |
| `entityComponent.subtitle.text` | `"Career Break"` — the literal marker |
| `entityComponent.caption.text` | `"Jul 2025 - Present · 1 yr 2 mos"` |
| `entityComponent.metadata.text` | `"Greater Bengaluru Area"` (often absent) |

[`extractCareerBreaks()`](../src/linkedin/normalize.js) walks the tree for
`entityComponent` nodes whose subtitle is exactly `"Career Break"` — ordinary
roles in the same list carry a company name there instead, so the two never
collide.

Three honest caveats, all consequences of this being display text:

- **Dates are parsed from rendered strings**, not `{year, month}` records.
  `"Feb 2025 - Jun 2025 · 5 mos"` → `startDate: "2025-02"`, `endDate:
  "2025-06"`. The duration suffix is discarded, `"Present"` becomes `current:
  true`, and year-only captions stay year-only.
- **It is locale-bound.** The request pins `x-li-lang: en_US` and the parser
  expects English month abbreviations. A different locale would need a
  different month table.
- **The persisted query id is versioned**, exactly like `decorationId`, and
  will be retired eventually. It is configurable via `CAREER_BREAK_QUERY_ID`;
  fresh ids come from the APK with the `strings` command above.

Because of all three, the career-break lookup is strictly **best-effort**: if
it fails for any reason, `careerBreaks` comes back `[]` and every
entity-derived field on the profile is completely unaffected. A lookup never
fails because the SDUI side did.

### Why it is a separate array, not merged into `experience`

`profile.careerBreaks` is its own top-level array rather than entries inside
`profile.experience`, so that one array is not a mix of entity-derived data
(exact dates, resolved companies, logos) and SDUI-derived data (parsed
display strings). Callers that want the LinkedIn-style combined view can
merge the two on start date; callers that want only high-confidence data can
ignore `careerBreaks` entirely.

Unlike `?full=1`, this request fires on **every** `/profile` call — a career
break is not a truncated section that needs completing, it is a section the
entity graph never had.
