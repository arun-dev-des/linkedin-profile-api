import { profileUrlFor } from './url.js';

/**
 * Turns LinkedIn's "normalized+json" payload into a clean profile object.
 *
 * LinkedIn returns a flat `included[]` array of entities cross-referenced by
 * asterisk-prefixed URN pointers (`"*company": "urn:li:fsd_company:7941"`)
 * rather than nesting. Normalizing means indexing everything by `entityUrn`
 * and walking those pointers.
 *
 * Every field is optional — the brief says "when available" — so this never
 * throws on missing data. Absent values become null or [].
 */

// LinkedIn sometimes stores a placeholder like "invalid562524" where a school
// name should be. Real in this fixture, so filter it out.
const PLACEHOLDER_NAME = /^invalid\d+$/i;

const cleanName = (name) =>
  typeof name === 'string' && name.trim() !== '' && !PLACEHOLDER_NAME.test(name) ? name : null;

/** Index every entity by its URN. All `*` references resolve within this map. */
function buildIndex(payload) {
  const index = new Map();
  for (const entity of payload?.included ?? []) {
    if (entity?.entityUrn) index.set(entity.entityUrn, entity);
  }
  return index;
}

const resolve = (index, urn) => (typeof urn === 'string' ? (index.get(urn) ?? null) : null);

/** Shallow-copies the named keys off an object. */
const pick = (obj, keys) => Object.fromEntries(keys.map((k) => [k, obj[k]]));

/**
 * Resolves a CollectionResponse reference into its member entities.
 * Empty collections carry `"elements": []` with no `*elements` key at all,
 * so the fallback matters.
 */
function resolveCollection(index, urn) {
  const collection = resolve(index, urn);
  return (collection?.['*elements'] ?? []).map((u) => resolve(index, u)).filter(Boolean);
}

const pagingFor = (index, urn) => resolve(index, urn)?.paging ?? null;

/* ------------------------------------------------------------------ dates */

/** `{year: 2024, month: 9}` -> "2024-09"; `{year: 2024}` -> "2024". */
function formatDate(date) {
  if (!date?.year) return null;
  return date.month ? `${date.year}-${String(date.month).padStart(2, '0')}` : String(date.year);
}

/**
 * A currently-held role omits `end` entirely. `dateRange` itself can be null.
 */
function readDateRange(range) {
  const startDate = formatDate(range?.start);
  const endDate = formatDate(range?.end);
  return { startDate, endDate, current: Boolean(startDate) && !endDate };
}

/** Sortable integer for a formatted date string, for newest-first ordering. */
function dateSortKey(formatted) {
  if (!formatted) return -1;
  const [year, month] = formatted.split('-');
  return Number(year) * 100 + (month ? Number(month) : 0);
}

/* ----------------------------------------------------------------- images */

/**
 * Image URLs are assembled as rootUrl + the chosen artifact's path segment —
 * plain concatenation, no separator. Artifacts are NOT sorted, so pick the
 * widest rather than trusting position.
 */
function vectorImageUrl(vectorImage) {
  const artifacts = vectorImage?.artifacts;
  if (!vectorImage?.rootUrl || !Array.isArray(artifacts) || artifacts.length === 0) return null;

  const widest = artifacts.reduce((best, a) => ((a?.width ?? 0) > (best?.width ?? 0) ? a : best));
  return widest?.fileIdentifyingUrlPathSegment
    ? vectorImage.rootUrl + widest.fileIdentifyingUrlPathSegment
    : null;
}

/**
 * Prefer displayImageReference: originalImageReference points at
 * linkedin.com/dms/prv/ which requires authentication.
 */
const pictureUrl = (picture) =>
  vectorImageUrl(picture?.displayImageReference?.vectorImage) ??
  vectorImageUrl(picture?.originalImageReference?.vectorImage);

/** Company and school logos sit one level shallower than profile pictures. */
const logoUrl = (org) => vectorImageUrl(org?.logo?.vectorImage);

/* --------------------------------------------------------------- location */

/**
 * Geo entities are frequently all-null stubs (4 of 6 in the reference
 * payload), so callers must always have a fallback.
 */
const geoName = (index, geoUrn) => resolve(index, geoUrn)?.defaultLocalizedName ?? null;

/* ---------------------------------------------------------------- sections */

function buildExperience(index, profile) {
  const groupsUrn = profile['*profilePositionGroups'];
  const groups = resolveCollection(index, groupsUrn);
  const entries = [];

  for (const group of groups) {
    const groupCompany = resolve(index, group['*company']);

    for (const position of resolveCollection(index, group['*profilePositionInPositionGroup'])) {
      const company = resolve(index, position['*company']) ?? groupCompany;

      entries.push({
        // Internal only — used to carry companyUrl/companyLogo/employmentType
        // over to a ?full=1 completion fetch, which can't resolve them itself
        // (see extractFullExperience). Stripped before the entry is returned.
        _urn: position.entityUrn ?? null,
        title: position.title ?? null,
        // The position's own companyName is what the profile page displays, and
        // can differ from the company's canonical current name.
        company: position.companyName ?? group.companyName ?? company?.name ?? null,
        companyUrl: company?.url ?? null,
        companyLogo: logoUrl(company),
        employmentType: resolve(index, position['*employmentType'])?.name ?? null,
        location:
          position.locationName ?? position.geoLocationName ?? geoName(index, position['*geo']),
        ...readDateRange(position.dateRange),
        description: position.description ?? null,
      });
    }
  }

  // Positions arrive unsorted. Present LinkedIn-style: current roles first, then
  // newest start date first.
  entries.sort(
    (a, b) =>
      Number(b.current) - Number(a.current) || dateSortKey(b.startDate) - dateSortKey(a.startDate),
  );

  // Keep company/employmentType enrichment for a possible ?full=1 completion
  // pass, keyed by the position's own URN, before stripping it from the
  // public shape.
  const enrichmentByUrn = new Map(
    entries.filter((e) => e._urn).map((e) => [e._urn, pick(e, ['companyUrl', 'companyLogo', 'employmentType'])]),
  );
  const publicEntries = entries.map(({ _urn, ...rest }) => rest);

  // LinkedIn caps *profilePositionGroups itself (rich profiles: 10 of 32 seen
  // in the wild) — the same way it caps skills. The cap is on groups, not
  // flattened entries, so report it at that level rather than pretending
  // entries.length is comparable to the group total.
  const groupsPaging = pagingFor(index, groupsUrn);
  const partial =
    groupsPaging?.total > groups.length
      ? { returnedGroups: groups.length, totalGroups: groupsPaging.total }
      : null;

  return { entries: publicEntries, partial, enrichmentByUrn };
}

function buildEducation(index, profile) {
  return resolveCollection(index, profile['*profileEducations']).map((education) => {
    const school = resolve(index, education['*school']);
    const asCompany = resolve(index, education['*company']);

    return {
      school: cleanName(education.schoolName) ?? school?.name ?? asCompany?.name ?? null,
      schoolUrl: school?.url ?? null,
      schoolLogo: logoUrl(school) ?? logoUrl(asCompany),
      // The standardized degree/field entities are empty stubs — use the strings.
      degree: education.degreeName ?? null,
      fieldOfStudy: education.fieldOfStudy ?? null,
      ...readDateRange(education.dateRange),
      grade: education.grade ?? null,
      activities: education.activities ?? null,
      description: education.description ?? null,
    };
  });
}

const buildCertifications = (index, profile) =>
  resolveCollection(index, profile['*profileCertifications']).map((certification) => ({
    name: certification.name ?? null,
    authority: certification.authority ?? null,
    licenseNumber: certification.licenseNumber ?? null,
    url: certification.url ?? null,
    ...readDateRange(certification.dateRange),
  }));

const buildLanguages = (index, profile) =>
  resolveCollection(index, profile['*profileLanguages']).map((language) => ({
    name: language.name ?? null,
    proficiency: language.proficiency ?? null,
  }));

/** "Featured" links shown on the profile. Also capped by LinkedIn — same
 * treatment as skills: report the shortfall rather than hide it. */
function buildFeatured(index, profile) {
  const urn = profile['*profileTreasuryMediaProfile'];
  const entries = resolveCollection(index, urn).map((media) => ({
    title: media.title ?? null,
    url: media.data?.Url ?? null,
    provider: media.providerName ?? null,
  }));

  const paging = pagingFor(index, urn);
  const partial = paging?.total > entries.length ? { returned: entries.length, total: paging.total } : null;

  return { entries, partial };
}

/**
 * Volunteer roles. The main call resolves `*company` here (unlike featured
 * media), so the logo/URL come for free.
 */
function buildVolunteerExperience(index, profile) {
  const urn = profile['*profileVolunteerExperiences'];
  const entries = resolveCollection(index, urn).map((volunteer) => {
    const company = resolve(index, volunteer['*company']);
    return {
      role: volunteer.role ?? null,
      company: volunteer.companyName ?? company?.name ?? null,
      companyUrl: company?.url ?? null,
      companyLogo: logoUrl(company),
      // Raw LinkedIn enum, e.g. "ECONOMIC_EMPOWERMENT" — same treatment as
      // `pronouns`; humanizing enum strings is a display concern, not this
      // layer's job.
      cause: volunteer.cause ?? null,
      ...readDateRange(volunteer.dateRange),
      description: volunteer.description ?? null,
    };
  });

  const paging = pagingFor(index, urn);
  const partial = paging?.total > entries.length ? { returned: entries.length, total: paging.total } : null;

  return { entries, partial };
}

/** Awards and honors. `issuedOn` is a single Date, not a range. */
function buildHonors(index, profile) {
  const urn = profile['*profileHonors'];
  const entries = resolveCollection(index, urn).map((honor) => ({
    title: honor.title ?? null,
    issuer: honor.issuer ?? null,
    issuedOn: formatDate(honor.issuedOn),
    description: honor.description ?? null,
  }));

  const paging = pagingFor(index, urn);
  const partial = paging?.total > entries.length ? { returned: entries.length, total: paging.total } : null;

  return { entries, partial };
}

/**
 * A co-author is a pointer to another member's Profile entity
 * (`authors[].standardizedContributor["*profile"]`) — resolvable only when
 * that entity happens to be inlined in this response's `included[]` (it
 * usually is, the same way a connection's Profile stub rides along). No
 * entity means no way to know the name from this payload; skip rather than
 * guess.
 */
function resolvePublicationAuthor(index, author) {
  const person = resolve(index, author?.standardizedContributor?.['*profile']);
  const name = [person?.firstName, person?.lastName].filter(Boolean).join(' ') || null;
  if (!name) return null;
  return { name, profileUrl: person.publicIdentifier ? profileUrlFor(person.publicIdentifier) : null };
}

/** Books, papers, and articles. `publishedOn` is a single Date, not a range. */
function buildPublications(index, profile) {
  const urn = profile['*profilePublications'];
  const entries = resolveCollection(index, urn).map((publication) => ({
    name: publication.name ?? null,
    publisher: publication.publisher ?? null,
    publishedOn: formatDate(publication.publishedOn),
    url: publication.url ?? null,
    description: publication.description ?? null,
    authors: (publication.authors ?? [])
      .map((author) => resolvePublicationAuthor(index, author))
      .filter(Boolean),
  }));

  const paging = pagingFor(index, urn);
  const partial = paging?.total > entries.length ? { returned: entries.length, total: paging.total } : null;

  return { entries, partial };
}

/**
 * Skill names from a standalone `profileSkills?q=viewee` response, in the order
 * LinkedIn returns them (which is the profile's own display order). Used to
 * replace the 20-capped list from the main call — see docs/endpoint-map.md.
 *
 * @param {object} payload  raw Voyager response from fetchProfileSkills()
 * @returns {string[]}
 */
export function extractSkillNames(payload) {
  const index = buildIndex(payload);
  const ordered = payload?.data?.['*elements'] ?? [];
  return ordered
    .map((urn) => resolve(index, urn)?.name)
    .filter((name) => typeof name === 'string' && name.trim() !== '');
}

/**
 * Full experience list from a standalone `profilePositions?q=viewee` response
 * — unlike `profilePositionGroups`, LinkedIn honors `count` here, so
 * `count=100` returns every individual role rather than the 10-group cap the
 * main call hits. Used to replace a capped `experience` list — see
 * docs/endpoint-map.md.
 *
 * The trade-off: this finder returns bare `companyUrn`/`employmentTypeUrn`,
 * not resolved `Company`/`EmploymentType` entities, so on its own it can't
 * reproduce `companyLogo`, `companyUrl`, or `employmentType`. `enrichmentByUrn`
 * (from `buildExperience`'s return value) fills those back in for roles the
 * main call had already resolved; roles recovered only here get `null` for
 * those three fields — the same tolerated gap as a company with no logo.
 *
 * @param {object} payload  raw Voyager response from fetchProfilePositions()
 * @param {Map<string, object>} [enrichmentByUrn]  urn -> {companyUrl, companyLogo, employmentType}
 * @returns {object[]}  same shape as profile.experience
 */
export function extractFullExperience(payload, enrichmentByUrn = new Map()) {
  const index = buildIndex(payload);
  const ordered = payload?.data?.['*elements'] ?? [];

  const entries = ordered
    .map((urn) => resolve(index, urn))
    .filter(Boolean)
    .map((position) => {
      const enrichment = enrichmentByUrn.get(position.entityUrn) ?? {};
      return {
        title: position.title ?? null,
        company: position.companyName ?? null,
        companyUrl: enrichment.companyUrl ?? null,
        companyLogo: enrichment.companyLogo ?? null,
        employmentType: enrichment.employmentType ?? null,
        location: position.locationName ?? position.geoLocationName ?? null,
        ...readDateRange(position.dateRange),
        description: position.description ?? null,
      };
    });

  return entries.sort(
    (a, b) =>
      Number(b.current) - Number(a.current) || dateSortKey(b.startDate) - dateSortKey(a.startDate),
  );
}

/* ------------------------------------------------------- career breaks */

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * Parses one side of an SDUI date caption: "Jul 2025" -> "2025-07",
 * "2021" -> "2021", "Present" -> null.
 *
 * Unlike every other date in this file, these arrive as rendered display
 * text rather than a `{year, month}` record, because career breaks only
 * exist in the server-driven-UI response. The request pins `x-li-lang:
 * en_US`, so month names are English three-letter abbreviations.
 */
function parseSduiDate(part) {
  const text = part?.trim();
  if (!text || /^present$/i.test(text)) return null;

  const withMonth = /^([A-Za-z]{3})[a-z]*\s+(\d{4})$/.exec(text);
  if (withMonth) {
    const month = MONTHS[withMonth[1].toLowerCase()];
    return month ? `${withMonth[2]}-${String(month).padStart(2, '0')}` : withMonth[2];
  }

  const yearOnly = /^(\d{4})$/.exec(text);
  return yearOnly ? yearOnly[1] : null;
}

/**
 * Splits an SDUI caption into a date range.
 * "Feb 2025 - Jun 2025 · 5 mos" -> { startDate: "2025-02", endDate: "2025-06" }
 * "Jul 2025 - Present · 1 yr 2 mos" -> { startDate: "2025-07", endDate: null, current: true }
 */
function readSduiCaption(caption) {
  // Everything from the "·" on is a humanized duration ("· 1 yr 2 mos").
  const range = (caption ?? '').split('·')[0].trim();
  const [rawStart, rawEnd] = range.split(/\s+[-–]\s+/);

  const startDate = parseSduiDate(rawStart);
  const endDate = parseSduiDate(rawEnd);
  // "Present" is the only reason a parsed end is absent when text was there.
  const current = Boolean(startDate) && /present/i.test(rawEnd ?? '');

  return { startDate, endDate, current };
}

/**
 * The description an entity component renders beneath itself.
 *
 * SDUI nests it several levels down —
 * `subComponents.components[].components.fixedListComponent.components[]
 *  .components.textComponent.text.text` — and the exact depth varies by
 * component, so this walks for the first `textComponent` rather than
 * hard-coding that path. Career-break entries carry exactly one (verified
 * against two real profiles); taking the first is therefore unambiguous
 * here, and returning null is the right answer when there is none.
 */
function sduiDescription(subComponents) {
  let text = null;

  const walk = (node) => {
    if (text !== null || !node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(walk);

    const candidate = node.textComponent?.text?.text;
    if (typeof candidate === 'string' && candidate.trim() !== '') {
      text = candidate;
      return;
    }
    for (const value of Object.values(node)) walk(value);
  };

  walk(subComponents);
  return text;
}

/**
 * Extracts career breaks from a `profileComponents?sectionType=experience`
 * GraphQL response (see fetchExperienceComponents).
 *
 * The response is a component tree, not an entity graph, so this walks it
 * looking for `entityComponent` nodes and keeps the ones whose subtitle is
 * literally "Career Break" — that's how LinkedIn labels them, with the
 * *title* holding the break type ("Professional development", "Personal
 * goal pursuit"). Normal roles in the same list carry a company name in
 * that subtitle instead, so the check cleanly separates the two.
 *
 * @param {object} payload  GraphQL response from fetchExperienceComponents()
 * @returns {object[]}
 */
export function extractCareerBreaks(payload) {
  const found = [];

  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object') return;

    const entity = node.entityComponent;
    if (entity && /^career break$/i.test(entity.subtitle?.text?.trim() ?? '')) {
      found.push({
        type: entity.titleV2?.text?.text ?? null,
        ...readSduiCaption(entity.caption?.text),
        location: entity.metadata?.text ?? null,
        description: sduiDescription(entity.subComponents),
      });
    }

    for (const value of Object.values(node)) walk(value);
  };

  walk(payload);

  return found.sort((a, b) => dateSortKey(b.startDate) - dateSortKey(a.startDate));
}

/**
 * Strips viewer-identifying data out of a raw Voyager payload before it's
 * returned over `/profile/raw` or `/profile/sample/raw`.
 *
 * Every member LinkedIn resolves on the profile — the subject, and anyone
 * else referenced (a publication co-author, for instance) — carries its own
 * `*memberRelationship` pointer. That resolves to a `MemberRelationship`
 * entity describing how the *credentialed account* relates to that person,
 * which embeds the credentialed account's own Profile entity and URN via
 * `…noInvitation.{inviter, *inviterResolutionResult}`. That's the server's
 * own LinkedIn identity, riding along on every single lookup regardless of
 * who was asked about — not something a public, unauthenticated endpoint
 * should hand out. `normalizeProfile()` never reads `*memberRelationship`
 * (see docs/endpoint-map.md), so this costs nothing functionally.
 *
 * The fix: walk every `*`-pointer reachable from the root profile — the same
 * graph `normalizeProfile()` itself walks — except through
 * `*memberRelationship`, and drop any entity that isn't reachable that way.
 * A co-author's Profile (reachable via `*profilePublications` ->
 * `authors[].standardizedContributor["*profile"]`) survives; the
 * credentialed account's own Profile (reachable *only* via
 * `*memberRelationship`) doesn't.
 *
 * @param {object} payload  raw Voyager response: { data, included }
 * @returns {object} a new { data, included } with unreachable entities dropped
 */
export function sanitizeRawPayload(payload) {
  const index = buildIndex(payload);
  const rootUrn = payload?.data?.['*elements']?.[0];
  if (!rootUrn || !index.has(rootUrn)) return payload;

  const reachable = new Set();
  const queue = [rootUrn];

  const visit = (value) => {
    if (typeof value === 'string') {
      if (index.has(value) && !reachable.has(value)) queue.push(value);
    } else if (Array.isArray(value)) {
      value.forEach(visit);
    } else if (value && typeof value === 'object') {
      for (const [key, v] of Object.entries(value)) {
        if (key === '*memberRelationship') continue; // the one edge that leaks the viewer's identity
        visit(v);
      }
    }
  };

  while (queue.length > 0) {
    const urn = queue.pop();
    if (reachable.has(urn)) continue;
    reachable.add(urn);
    visit(index.get(urn));
  }

  return {
    ...payload,
    included: (payload.included ?? []).filter((e) => e?.entityUrn && reachable.has(e.entityUrn)),
  };
}

/* -------------------------------------------------------------------- main */

/**
 * @param {object} payload  raw Voyager response: { data, included }
 * @returns {{profile: object, partial: object, profileUrn: string, experienceEnrichment: Map}}
 */
export function normalizeProfile(payload) {
  const index = buildIndex(payload);

  const rootUrn = payload?.data?.['*elements']?.[0];
  const profile = resolve(index, rootUrn);
  if (!profile) {
    throw new Error('Could not locate the root Profile entity in the LinkedIn payload.');
  }

  const name = [profile.firstName, profile.lastName].filter(Boolean).join(' ') || null;
  const publicId = profile.publicIdentifier ?? null;

  // locationName is null on real profiles — the display string lives on the Geo.
  const location =
    profile.locationName ??
    geoName(index, profile.geoLocation?.['*geo']) ??
    profile.location?.countryCode ??
    null;

  const skillsPaging = pagingFor(index, profile['*profileSkills']);
  const skills = resolveCollection(index, profile['*profileSkills'])
    .map((skill) => skill.name)
    .filter(Boolean);

  const {
    entries: experience,
    partial: experiencePartial,
    enrichmentByUrn: experienceEnrichment,
  } = buildExperience(index, profile);
  const { entries: featured, partial: featuredPartial } = buildFeatured(index, profile);
  const { entries: volunteerExperience, partial: volunteerPartial } = buildVolunteerExperience(
    index,
    profile,
  );
  const { entries: honors, partial: honorsPartial } = buildHonors(index, profile);
  const { entries: publications, partial: publicationsPartial } = buildPublications(index, profile);

  // LinkedIn caps several sections inside this projection; surface any
  // shortfall rather than silently returning a partial list.
  const partial = {};
  if (skillsPaging?.total > skills.length) {
    partial.skills = { returned: skills.length, total: skillsPaging.total };
  }
  if (experiencePartial) partial.experience = experiencePartial;
  if (featuredPartial) partial.featured = featuredPartial;
  if (volunteerPartial) partial.volunteerExperience = volunteerPartial;
  if (honorsPartial) partial.honors = honorsPartial;
  if (publicationsPartial) partial.publications = publicationsPartial;

  return {
    profile: {
      publicId,
      profileUrl: publicId ? profileUrlFor(publicId) : null,
      name,
      firstName: profile.firstName ?? null,
      lastName: profile.lastName ?? null,
      headline: profile.headline ?? null,
      location,
      countryCode: profile.location?.countryCode ?? null,
      industry: resolve(index, profile.industryUrn)?.name ?? null,
      about: profile.summary ?? null,
      pronouns: profile.pronounUnion?.standardizedPronoun ?? null,
      images: {
        profilePicture: pictureUrl(profile.profilePicture),
        backgroundImage: pictureUrl(profile.backgroundPicture),
      },
      experience,
      education: buildEducation(index, profile),
      skills,
      certifications: buildCertifications(index, profile),
      languages: buildLanguages(index, profile),
      featured,
      volunteerExperience,
      honors,
      publications,
      // Never present in the entity graph — the service fills this from the
      // SDUI call (see addCareerBreaks). Declared here so the response shape
      // is identical whether or not that call ran or succeeded.
      careerBreaks: [],
    },
    partial,
    profileUrn: rootUrn,
    experienceEnrichment,
  };
}
