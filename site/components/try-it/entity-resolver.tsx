'use client';

import { useMemo, useState } from 'react';
import { Search as SearchIcon, ArrowRight, ArrowUpRight, ArrowLeft } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { JsonTree } from './json-tree';
import type { RawPayload } from '@/lib/types';

type Entity = { $type?: string; entityUrn?: string; [k: string]: unknown };

interface IndexedEntity {
  entity: Entity;
  index: number;
}

interface Reference {
  fromUrn: string;
  key: string;
}

const ROOT = '__data__';
const EMPTY_SET: Set<string> = new Set();

/**
 * The top-level fields `src/linkedin/normalize.js` actually reads off each
 * entity kind, keyed by the last segment of `$type` — everything else on
 * that entity is present in LinkedIn's payload but never makes it into the
 * normalized profile. Kept in sync with normalize.js by hand; if a field
 * there changes, update the matching list here.
 */
const USED_FIELDS: Record<string, string[]> = {
  Profile: [
    'firstName', 'lastName', 'publicIdentifier', 'locationName', 'geoLocation', 'location',
    'headline', 'industryUrn', 'summary', 'pronounUnion', 'premium', 'influencer', 'creator',
    'profilePicture', 'backgroundPicture', 'entityUrn',
    '*profileSkills', '*profilePositionGroups', '*profileTreasuryMediaProfile',
    '*profileVolunteerExperiences', '*profileHonors', '*profilePublications',
    '*profileEducations', '*profileCertifications', '*profileLanguages',
  ],
  Position: [
    'title', 'companyName', '*company', '*employmentType', 'locationName', 'geoLocationName',
    '*geo', 'dateRange', 'description', 'entityUrn',
  ],
  PositionGroup: ['*company', '*profilePositionInPositionGroup', 'companyName'],
  Company: ['name', 'url', 'logo'],
  Education: [
    'schoolName', '*school', '*company', 'degreeName', 'fieldOfStudy', 'dateRange', 'grade',
    'activities', 'description',
  ],
  School: ['name', 'url', 'logo'],
  Skill: ['name'],
  Certification: ['name', 'authority', 'licenseNumber', 'url', 'dateRange'],
  Language: ['name', 'proficiency'],
  TreasuryMedia: ['title', 'data', 'providerName'],
  VolunteerExperience: ['role', '*company', 'companyName', 'cause', 'dateRange', 'description'],
  Honor: ['title', 'issuer', 'issuedOn', 'description'],
  Publication: ['name', 'publisher', 'publishedOn', 'url', 'description', 'authors'],
  Geo: ['defaultLocalizedName'],
  Industry: ['name'],
  EmploymentType: ['name'],
  CollectionResponse: ['*elements', 'paging'],
};

function usedFieldsFor(entity: Entity): Set<string> {
  const kind = entity.$type ? String(entity.$type).split('.').pop() : undefined;
  return new Set(kind ? (USED_FIELDS[kind] ?? []) : []);
}

function isUrn(v: unknown): v is string {
  return typeof v === 'string' && v.startsWith('urn:');
}

/**
 * `data['*elements'][0]` — the same lookup `normalizeProfile()` does to find
 * the root Profile entity (see normalize.js). Used to open the resolver
 * there by default instead of requiring a first search for it every time.
 */
function rootUrnOf(raw: RawPayload): string | null {
  const elements = (raw.data as { ['*elements']?: unknown } | null | undefined)?.['*elements'];
  const first = Array.isArray(elements) ? elements[0] : undefined;
  return typeof first === 'string' ? first : null;
}

/**
 * Same two structures normalize.js builds — `index` (entityUrn -> entity, for
 * resolving a `*pointer`) plus a `reverse` map (entityUrn -> who points at it)
 * that normalize.js has no need for, but is exactly what answers "what led
 * here?" while exploring.
 */
function buildIndexes(raw: RawPayload) {
  const index = new Map<string, IndexedEntity>();
  raw.included.forEach((entity, i) => {
    if (entity.entityUrn) index.set(entity.entityUrn, { entity, index: i });
  });

  const reverse = new Map<string, Reference[]>();
  const addRef = (targetUrn: string, fromUrn: string, key: string) => {
    if (!reverse.has(targetUrn)) reverse.set(targetUrn, []);
    reverse.get(targetUrn)!.push({ fromUrn, key });
  };

  const walkValue = (value: unknown, fromUrn: string, key: string) => {
    if (isUrn(value)) addRef(value, fromUrn, key);
    else if (Array.isArray(value)) value.forEach((v) => walkValue(v, fromUrn, key));
  };

  raw.included.forEach((entity) => {
    if (!entity.entityUrn) return;
    for (const [key, value] of Object.entries(entity)) {
      if (key.startsWith('*')) walkValue(value, entity.entityUrn, key);
    }
  });

  if (raw.data && typeof raw.data === 'object') {
    for (const [key, value] of Object.entries(raw.data as Record<string, unknown>)) {
      if (key.startsWith('*')) walkValue(value, ROOT, key);
    }
  }

  return { index, reverse };
}

function entityLabel(entity: Entity): string {
  const name =
    (entity.name as string) ||
    [entity.firstName, entity.lastName].filter(Boolean).join(' ') ||
    (entity.title as string) ||
    (entity.companyName as string) ||
    (entity.schoolName as string) ||
    (entity.defaultLocalizedName as string) ||
    null;
  return name || (entity.$type ? String(entity.$type).split('.').pop()! : 'Entity');
}

function labelForUrn(index: Map<string, IndexedEntity>, urn: string): string {
  if (urn === ROOT) return 'data (root)';
  const entry = index.get(urn);
  return entry ? entityLabel(entry.entity) : urn;
}

function pointersOf(entity: Entity) {
  const out: { key: string; urn: string }[] = [];
  for (const [key, value] of Object.entries(entity)) {
    if (!key.startsWith('*')) continue;
    if (isUrn(value)) out.push({ key, urn: value });
    else if (Array.isArray(value)) value.forEach((v) => isUrn(v) && out.push({ key, urn: v }));
  }
  return out;
}

function RefChip({
  label,
  sub,
  onClick,
  icon: Icon,
}: {
  label: string;
  sub: string;
  onClick?: () => void;
  icon: typeof ArrowRight;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      title={sub}
      className="border-border bg-card hover:bg-accent/50 flex max-w-full cursor-pointer items-center gap-1 rounded-md border px-2 py-1 text-left text-[11px] disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="max-w-[150px] truncate font-medium">{label}</span>
      <Icon className="text-muted-foreground size-3 shrink-0" />
      <span className="text-muted-foreground truncate font-mono">{sub}</span>
    </button>
  );
}

/**
 * The caller should pass a `key` derived from the loaded profile's identity
 * (see JsonPanel) — that remounts this component, and its search/selection/
 * history state, whenever a different profile's payload arrives, rather than
 * this component reaching for a reset effect.
 */
export function EntityResolver({ raw }: { raw: RawPayload }) {
  const { index, reverse } = useMemo(() => buildIndexes(raw), [raw]);
  const [query, setQuery] = useState('');
  // Opens on the root Profile entity by default — the one thing every
  // exploration session ends up searching for first anyway.
  const [selected, setSelected] = useState<string | null>(() => rootUrnOf(raw));
  // Every hop — a search pick, a "Points to" chip, a "Referenced by" chip —
  // pushes the entity being left onto this stack, so "Back" always undoes the
  // last hop regardless of which one made it. A separate mechanism from
  // "Referenced by": that shows every entity pointing here, not just the one
  // that was actually clicked to arrive.
  const [history, setHistory] = useState<string[]>([]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const out: { urn: string; index: number; entity: Entity }[] = [];
    for (const [urn, { entity, index: idx }] of index) {
      if (
        urn.toLowerCase().includes(q) ||
        entityLabel(entity).toLowerCase().includes(q) ||
        String(idx) === q
      ) {
        out.push({ urn, index: idx, entity });
        if (out.length >= 30) break;
      }
    }
    return out;
  }, [query, index]);

  const selectedEntry = selected ? index.get(selected) : null;
  const referencedBy = selected ? (reverse.get(selected) ?? []) : [];
  const pointers = selectedEntry ? pointersOf(selectedEntry.entity) : [];
  const usedKeys = selectedEntry ? usedFieldsFor(selectedEntry.entity) : EMPTY_SET;

  const goTo = (urn: string) => {
    if (selected && selected !== urn) setHistory((h) => [...h, selected]);
    setSelected(urn);
    setQuery('');
  };

  /** Jump to position `i` in the breadcrumb trail, dropping everything after it. */
  const goToBreadcrumb = (i: number, trail: string[]) => {
    setSelected(trail[i]);
    setHistory(trail.slice(0, i));
  };

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-[11.5px]">
        Search <code className="font-mono">included[]</code> by URN, name, or array index. Pick a
        result to see what it points to and what points back to it — the same graph{' '}
        <code className="font-mono">normalize.js</code> walks.
      </p>

      <div className="relative">
        <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="urn:li:fsd_company:41315 · Google · 59"
          className="h-8 pl-8 font-mono text-[12px]"
          spellCheck={false}
        />
      </div>

      {query && (
        <div className="border-border divide-border max-h-56 divide-y overflow-y-auto rounded-md border">
          {results.length === 0 && (
            <div className="text-muted-foreground p-3 text-[12px]">No matches.</div>
          )}
          {results.map(({ urn, index: idx, entity }) => (
            <button
              key={urn}
              type="button"
              onClick={() => goTo(urn)}
              className="hover:bg-accent/50 flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2 text-left"
            >
              <span className="min-w-0">
                <span className="block truncate text-[12.5px] font-medium">
                  {entityLabel(entity)}
                </span>
                <span className="text-muted-foreground block truncate font-mono text-[10.5px]">
                  {urn}
                </span>
              </span>
              <Badge variant="outline" className="shrink-0 font-mono text-[10px]">
                [{idx}]
              </Badge>
            </button>
          ))}
        </div>
      )}

      {selectedEntry && selected && (
        <div className="space-y-3 border-t pt-3">
          {history.length > 0 && (
            <div className="flex items-center gap-1 overflow-x-auto pb-0.5 text-[11px] whitespace-nowrap">
              <button
                type="button"
                onClick={() => goToBreadcrumb(history.length - 1, history)}
                className="text-muted-foreground hover:text-foreground flex shrink-0 cursor-pointer items-center gap-1 pr-1.5 font-medium"
              >
                <ArrowLeft className="size-3.5" />
                Back
              </button>
              <span className="text-muted-foreground/30 shrink-0">|</span>
              {[...history, selected].map((urn, i, trail) => {
                const isCurrent = i === trail.length - 1;
                return (
                  <span key={urn + i} className="flex shrink-0 items-center gap-1">
                    {i > 0 && <span className="text-muted-foreground/30">/</span>}
                    <button
                      type="button"
                      onClick={() => !isCurrent && goToBreadcrumb(i, trail)}
                      disabled={isCurrent}
                      className={cn(
                        'max-w-[110px] truncate',
                        isCurrent
                          ? 'cursor-default text-foreground font-medium'
                          : 'cursor-pointer text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {labelForUrn(index, urn)}
                    </button>
                  </span>
                );
              })}
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[13px] font-semibold">{entityLabel(selectedEntry.entity)}</div>
              <div className="text-muted-foreground truncate font-mono text-[10.5px]">
                {selected}
              </div>
            </div>
            <Badge variant="outline" className="shrink-0 font-mono text-[10px]">
              included[{selectedEntry.index}]
            </Badge>
          </div>

          {selectedEntry.entity.$type ? (
            <div className="text-muted-foreground font-mono text-[10.5px]">
              {String(selectedEntry.entity.$type)}
            </div>
          ) : null}

          {pointers.length > 0 && (
            <div>
              <div className="text-muted-foreground mb-1.5 text-[11px] font-medium tracking-wide uppercase">
                Points to ({pointers.length})
              </div>
              <div className="flex flex-wrap gap-1.5">
                {pointers.map(({ key, urn }, i) => {
                  const target = index.get(urn);
                  return (
                    <RefChip
                      key={key + urn + i}
                      label={target ? entityLabel(target.entity) : 'not in included[]'}
                      sub={key}
                      icon={ArrowRight}
                      onClick={target ? () => goTo(urn) : undefined}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {referencedBy.length > 0 && (
            <div>
              <div className="text-muted-foreground mb-1.5 text-[11px] font-medium tracking-wide uppercase">
                Referenced by ({referencedBy.length})
              </div>
              <div className="flex flex-wrap gap-1.5">
                {referencedBy.map((ref, i) => {
                  const isRoot = ref.fromUrn === ROOT;
                  const source = isRoot ? null : index.get(ref.fromUrn);
                  return (
                    <RefChip
                      key={ref.fromUrn + ref.key + i}
                      label={isRoot ? 'data (root)' : source ? entityLabel(source.entity) : ref.fromUrn}
                      sub={ref.key}
                      icon={ArrowUpRight}
                      onClick={isRoot ? undefined : () => goTo(ref.fromUrn)}
                    />
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
              <div className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
                Fields
              </div>
              {usedKeys.size > 0 && (
                <div className="text-muted-foreground flex items-center gap-3 text-[10.5px]">
                  <span className="flex items-center gap-1">
                    <span className="bg-emerald-500/70 size-2 rounded-full" />
                    extracted by normalize.js
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="bg-muted-foreground/40 size-2 rounded-full" />
                    ignored
                  </span>
                </div>
              )}
            </div>
            <JsonTree data={selectedEntry.entity} usedKeys={usedKeys} />
          </div>
        </div>
      )}

      {!query && !selectedEntry && (
        <div className="text-muted-foreground py-8 text-center text-[12px]">
          Start typing to find an entity in <code className="font-mono">included[]</code>.
        </div>
      )}
    </div>
  );
}
