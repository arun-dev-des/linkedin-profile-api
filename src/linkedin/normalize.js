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

  // LinkedIn caps several sections inside this projection; surface any
  // shortfall rather than silently returning a partial list.
  const partial = {};
  if (skillsPaging?.total > skills.length) {
    partial.skills = { returned: skills.length, total: skillsPaging.total };
  }
  if (experiencePartial) partial.experience = experiencePartial;
  if (featuredPartial) partial.featured = featuredPartial;

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
    },
    partial,
    profileUrn: rootUrn,
    experienceEnrichment,
  };
}
