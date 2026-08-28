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
| `PositionGroup` | 10 | roles grouped by company (the "Company — 3 roles" block) |
| `Company` | 28 | resolved employers + volunteer orgs — `name`, `url`, `logo`, staff count |
| `School` | 5 | resolved schools |
| `Education` | 6 | degrees |
| `Skill` | **20** | **hard cap** — `paging.total` was 47 |
| `Honor` | 9 | awards (`title`, `issuer`, `issuedOn`, `description`, `occupation`) |
| `VolunteerExperience` | 14 | `role`, `companyName`, `cause`, `dateRange`, `description` |
| `Publication` | 6 | `name`, `publisher`, `publishedOn`, `url`, `description`, `authors[]` |
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
| **`profileSkills` (`&count=100`)** | **The whole list.** The main call caps at 20 regardless of total. This is the one call worth making — see below. |
| **`profileTreasuryMedia`** | Adds real media metadata: `width`, `height`, `previewImages`, `mediaTitle`, `mediaDescription`, `createdAtText`, `assetAvailable`. Still capped (3 of ~10). |
| `profilePositions` | Adds `hasSkillAssociations`, `regionUrn`. **Loses** resolved `*company` / `*employmentType` / `*geo` — bare URNs only, no inlined `Company`. |
| `profileEducations` | Adds `fieldOfStudyUrn`. Loses resolved `*school` / `*company`. |
| `profileHonors` | Identical (main call additionally has `occupation`). |
| `profileVolunteerExperiences` | Identical (main call additionally resolves `*company`). |
| `profilePublications` | Byte-for-byte identical fields. |

So for experience, education, honors, volunteer, publications, languages,
certifications, industry and images, the single decoration call already returns
everything — in full, with references resolved.

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

The only worthwhile follow-up call. When `GET /profile` finds the skills list
capped (`meta.partial.skills` present), `?full=1` makes **one** extra request:

```
GET /voyager/api/identity/dash/profileSkills
    ?q=viewee
    &profileUrn=<the subject's urn:li:fsd_profile:…>
    &count=100
```

No `decorationId` needed. The response is `{ data: { *elements: [...] }, included: [...] }`;
[`extractSkillNames()`](../src/linkedin/normalize.js) resolves `*elements` in
order and returns every skill name. The service then replaces `profile.skills`
and drops `meta.partial.skills`.

It's opt-in, not default: the extra request adds latency and a little more
bot-detection surface, and 20 skills is enough for most callers. `?full=1` is
for when you specifically need the complete list.

**Not wired in:** `profileTreasuryMedia` completion (the "Featured" section stays
capped at what the main call returns). The endpoint returns a different entity
shape and would need its own parser; featured links are lower value than skills.
Noted here so the gap is explicit.
