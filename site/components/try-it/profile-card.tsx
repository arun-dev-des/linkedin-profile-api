'use client';

import { ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { ProfileEnvelope } from '@/lib/types';

/**
 * Annotates a rendered value with the JSON field it came from.
 *
 * The point of this page is to show what the API returns, and the card and
 * the JSON panel sit side by side — so being able to hover a value and see
 * `profile.experience[0].title` makes the card itself the schema
 * documentation. The underline is transparent until hover so ~40 annotated
 * values don't turn the card into a sea of dotted lines.
 *
 * Where the card composes several fields into one string (company ·
 * employmentType), the tooltip names both rather than pretending it's one
 * field.
 */
function FieldTip({
  path,
  children,
  className,
}: {
  path: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={<span />}
        className={cn(
          'cursor-help underline decoration-dotted decoration-transparent underline-offset-4',
          'transition-colors hover:decoration-current',
          className,
        )}
      >
        {children}
      </TooltipTrigger>
      {/* max-w-sm, and wrapping rather than nowrap: composed paths like
          `experience[0].startDate · .endDate · .current · .location` overflow
          the default max-w-xs and would be clipped. */}
      <TooltipContent side="top" className="max-w-sm">
        <code className="font-mono text-[11px] leading-relaxed break-words">{path}</code>
      </TooltipContent>
    </Tooltip>
  );
}

/** Wraps a node in a FieldTip only when a path is supplied. */
const tip = (node: React.ReactNode, path?: string) =>
  path ? <FieldTip path={path}>{node}</FieldTip> : node;

const humanize = (s: string | null) =>
  !s
    ? ''
    : s
        .toLowerCase()
        .replace(/_/g, ' ')
        .replace(/^./, (c) => c.toUpperCase());

function dateSpan(a: string | null, b: string | null, current: boolean) {
  if (!a && !b) return '';
  return `${a ?? ''}${a || b ? ' – ' : ''}${current ? 'Present' : (b ?? '')}`.trim();
}

function Initial({ text }: { text: string }) {
  return (
    <div className="bg-muted border-border text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-lg border text-sm font-semibold">
      {(text || '?').trim().charAt(0).toUpperCase()}
    </div>
  );
}

function Logo({ src, fallback }: { src: string | null; fallback: string }) {
  if (!src) return <Initial text={fallback} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      loading="lazy"
      className="bg-muted border-border size-10 shrink-0 rounded-lg border object-contain"
    />
  );
}

function Entry({
  logo,
  fallback,
  title,
  sub,
  dates,
  desc,
  paths,
}: {
  logo?: string | null;
  fallback?: string;
  title: string;
  sub?: string;
  dates?: string;
  desc?: string | null;
  /** JSON field names behind each slot, already prefixed with the array index. */
  paths?: { title?: string; sub?: string; dates?: string; desc?: string };
}) {
  return (
    <div className="border-border flex gap-3 border-t py-3 first:border-t-0">
      {logo !== undefined && <Logo src={logo} fallback={fallback ?? sub ?? title} />}
      <div className="min-w-0">
        <div className="font-semibold">{tip(title, paths?.title)}</div>
        {sub && <div className="text-sm">{tip(sub, paths?.sub)}</div>}
        {dates && (
          <div className="text-muted-foreground mt-0.5 text-[13px]">{tip(dates, paths?.dates)}</div>
        )}
        {desc && (
          <p className="text-muted-foreground mt-1.5 text-[13px] whitespace-pre-wrap">
            {tip(desc, paths?.desc)}
          </p>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  path,
  children,
}: {
  title: string;
  /** The array or object this section renders, e.g. `profile.experience[]`. */
  path?: string;
  children: React.ReactNode;
}) {
  if (!children) return null;
  return (
    <section className="border-border border-t px-5 py-4">
      <h3 className="text-muted-foreground mb-3 text-[11px] font-semibold tracking-[0.06em] uppercase">
        {tip(title, path)}
      </h3>
      {children}
    </section>
  );
}

export function ProfileCard({ data }: { data: ProfileEnvelope }) {
  const p = data.profile;
  const m = data.meta;

  // This page and the API deploy independently, so the response can be a
  // version behind what `Profile` describes — a section added to the schema
  // is simply absent until the API catches up. Defaulting every list here
  // means a newer page never crashes against an older API; the section just
  // doesn't render. Same reason `images` is read defensively below.
  const {
    experience = [],
    careerBreaks = [],
    education = [],
    skills = [],
    certifications = [],
    languages = [],
    featured = [],
    volunteerExperience = [],
    honors = [],
    publications = [],
  } = p;

  return (
    <div className="bg-card border-border overflow-hidden rounded-xl border shadow-sm">
      <div
        className="from-primary h-24 bg-gradient-to-tr to-sky-400 bg-cover bg-center"
        title="profile.images.backgroundImage"
        style={
          p.images?.backgroundImage
            ? { backgroundImage: `url(${p.images.backgroundImage})` }
            : undefined
        }
      />
      <div className="-mt-11 px-5 pb-5">
        {p.images?.profilePicture ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={p.images.profilePicture}
            alt=""
            className="border-card bg-muted size-[88px] rounded-full border-4 object-cover"
          />
        ) : (
          <div className="border-card bg-muted size-[88px] rounded-full border-4" />
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold tracking-tight">
            <FieldTip path="profile.name">{p.name ?? 'Unknown'}</FieldTip>
          </h2>
          {p.badges?.influencer && (
            <FieldTip path="profile.badges.influencer">
              <Badge variant="secondary" className="font-normal">
                Influencer
              </Badge>
            </FieldTip>
          )}
          {p.badges?.creator && (
            <FieldTip path="profile.badges.creator">
              <Badge variant="secondary" className="font-normal">
                Creator
              </Badge>
            </FieldTip>
          )}
          {p.badges?.premium && (
            <FieldTip path="profile.badges.premium">
              <Badge variant="secondary" className="font-normal">
                Premium
              </Badge>
            </FieldTip>
          )}
        </div>
        {p.headline && (
          <p className="mt-0.5">
            <FieldTip path="profile.headline">{p.headline}</FieldTip>
          </p>
        )}
        <div className="text-muted-foreground mt-1.5 text-[13.5px]">
          <FieldTip path="profile.location · profile.industry">
            {[p.location, p.industry].filter(Boolean).join(' · ')}
          </FieldTip>
          {p.profileUrl && (
            <>
              {' · '}
              <a
                href={p.profileUrl}
                target="_blank"
                rel="noopener"
                className="text-primary inline-flex items-center gap-0.5 hover:underline"
              >
                LinkedIn <ExternalLink className="size-3" />
              </a>
            </>
          )}
        </div>
      </div>

      {p.about && (
        <Section title="About" path="profile.about">
          <p className="whitespace-pre-wrap">{p.about}</p>
        </Section>
      )}

      {experience.length > 0 && (
        <Section title="Experience" path={`profile.experience[] · ${experience.length} items`}>
          {experience.map((e, i) => (
            <Entry
              key={i}
              logo={e.companyLogo}
              fallback={e.company ?? ''}
              title={e.title ?? ''}
              sub={[e.company, e.employmentType].filter(Boolean).join(' · ')}
              dates={[dateSpan(e.startDate, e.endDate, e.current), e.location]
                .filter(Boolean)
                .join('  ·  ')}
              desc={e.description}
              paths={{
                title: `profile.experience[${i}].title`,
                sub: `profile.experience[${i}].company · .employmentType`,
                dates: `profile.experience[${i}].startDate · .endDate · .current · .location`,
                desc: `profile.experience[${i}].description`,
              }}
            />
          ))}
          {m.partial?.experience && (
            <p className="text-muted-foreground mt-2.5 text-[12.5px]">
              Showing {m.partial.experience.returnedGroups} of {m.partial.experience.totalGroups}{' '}
              companies — turn on “Complete skills &amp; experience” above.
            </p>
          )}
        </Section>
      )}

      {careerBreaks.length > 0 && (
        <Section
          title="Career Breaks"
          path={`profile.careerBreaks[] · ${careerBreaks.length} items`}
        >
          {careerBreaks.map((b, i) => (
            <Entry
              key={i}
              logo={null}
              fallback={b.type ?? 'Career Break'}
              title={b.type ?? 'Career Break'}
              sub="Career Break"
              dates={[dateSpan(b.startDate, b.endDate, b.current), b.location]
                .filter(Boolean)
                .join('  ·  ')}
              desc={b.description}
              paths={{
                title: `profile.careerBreaks[${i}].type`,
                dates: `profile.careerBreaks[${i}].startDate · .endDate · .current · .location`,
                desc: `profile.careerBreaks[${i}].description`,
              }}
            />
          ))}
        </Section>
      )}

      {education.length > 0 && (
        <Section title="Education" path={`profile.education[] · ${education.length} items`}>
          {education.map((e, i) => {
            const degree = [e.degree, e.fieldOfStudy].filter(Boolean).join(', ');
            return (
              <Entry
                key={i}
                logo={e.schoolLogo}
                fallback={e.school ?? degree}
                title={e.school || degree || 'Education'}
                sub={e.school ? degree : undefined}
                dates={dateSpan(e.startDate, e.endDate, e.current)}
                desc={e.description}
                paths={{
                  title: `profile.education[${i}].school`,
                  sub: `profile.education[${i}].degree · .fieldOfStudy`,
                  dates: `profile.education[${i}].startDate · .endDate`,
                  desc: `profile.education[${i}].description`,
                }}
              />
            );
          })}
        </Section>
      )}

      {skills.length > 0 && (
        <Section title="Skills" path={`profile.skills[] · ${skills.length} items`}>
          <div className="flex flex-wrap gap-2">
            {skills.map((s) => (
              <Badge key={s} variant="secondary" className="font-normal">
                {s}
              </Badge>
            ))}
          </div>
          {m.partial?.skills && (
            <p className="text-muted-foreground mt-2.5 text-[12.5px]">
              Showing {m.partial.skills.returned} of {m.partial.skills.total} — turn on “Complete
              skills &amp; experience” above.
            </p>
          )}
        </Section>
      )}

      {certifications.length > 0 && (
        <Section
          title="Certifications"
          path={`profile.certifications[] · ${certifications.length} items`}
        >
          {certifications.map((c, i) => (
            <Entry
              key={i}
              logo={null}
              fallback={c.authority ?? c.name ?? ''}
              title={c.name ?? ''}
              sub={c.authority ?? undefined}
              dates={[dateSpan(c.startDate, c.endDate, c.current), c.licenseNumber]
                .filter(Boolean)
                .join('  ·  ')}
            />
          ))}
        </Section>
      )}

      {languages.length > 0 && (
        <Section title="Languages" path={`profile.languages[] · ${languages.length} items`}>
          <div className="flex flex-wrap gap-2">
            {languages.map((l, i) => (
              <Badge key={i} variant="secondary" className="font-normal">
                {l.name}
                {l.proficiency ? ` · ${humanize(l.proficiency)}` : ''}
              </Badge>
            ))}
          </div>
        </Section>
      )}

      {featured.length > 0 && (
        <Section title="Featured" path={`profile.featured[] · ${featured.length} items`}>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {featured.map((f, i) => (
              <li key={i}>
                <a
                  href={f.url ?? '#'}
                  target="_blank"
                  rel="noopener"
                  className="text-primary hover:underline"
                >
                  {f.title || f.url}
                </a>
                {f.provider && <span className="text-muted-foreground"> — {f.provider}</span>}
              </li>
            ))}
          </ul>
          {m.partial?.featured && (
            <p className="text-muted-foreground mt-2.5 text-[12.5px]">
              Showing {m.partial.featured.returned} of {m.partial.featured.total} — LinkedIn caps
              this section server-side, there&apos;s no complete-list request that helps.
            </p>
          )}
        </Section>
      )}

      {volunteerExperience.length > 0 && (
        <Section
          title="Volunteering"
          path={`profile.volunteerExperience[] · ${volunteerExperience.length} items`}
        >
          {volunteerExperience.map((v, i) => (
            <Entry
              key={i}
              logo={v.companyLogo}
              fallback={v.company ?? ''}
              title={v.role ?? ''}
              sub={[v.company, v.cause ? humanize(v.cause) : null].filter(Boolean).join(' · ')}
              dates={dateSpan(v.startDate, v.endDate, v.current)}
              desc={v.description}
              paths={{
                title: `profile.volunteerExperience[${i}].role`,
                sub: `profile.volunteerExperience[${i}].company · .cause`,
                dates: `profile.volunteerExperience[${i}].startDate · .endDate · .current`,
                desc: `profile.volunteerExperience[${i}].description`,
              }}
            />
          ))}
          {m.partial?.volunteerExperience && (
            <p className="text-muted-foreground mt-2.5 text-[12.5px]">
              Showing {m.partial.volunteerExperience.returned} of{' '}
              {m.partial.volunteerExperience.total}.
            </p>
          )}
        </Section>
      )}

      {honors.length > 0 && (
        <Section title="Honors & Awards" path={`profile.honors[] · ${honors.length} items`}>
          {honors.map((h, i) => (
            <Entry
              key={i}
              logo={null}
              fallback={h.issuer ?? h.title ?? ''}
              title={h.title ?? ''}
              sub={h.issuer ?? undefined}
              dates={h.issuedOn ?? undefined}
              desc={h.description}
              paths={{
                title: `profile.honors[${i}].title`,
                sub: `profile.honors[${i}].issuer`,
                dates: `profile.honors[${i}].issuedOn`,
                desc: `profile.honors[${i}].description`,
              }}
            />
          ))}
          {m.partial?.honors && (
            <p className="text-muted-foreground mt-2.5 text-[12.5px]">
              Showing {m.partial.honors.returned} of {m.partial.honors.total}.
            </p>
          )}
        </Section>
      )}

      {publications.length > 0 && (
        <Section
          title="Publications"
          path={`profile.publications[] · ${publications.length} items`}
        >
          {publications.map((pub, i) => (
            <Entry
              key={i}
              logo={null}
              fallback={pub.publisher ?? pub.name ?? ''}
              title={pub.name ?? ''}
              sub={[
                pub.publisher,
                pub.authors.length ? pub.authors.map((a) => a.name).join(', ') : null,
              ]
                .filter(Boolean)
                .join(' · ')}
              dates={pub.publishedOn ?? undefined}
              desc={pub.description}
              paths={{
                title: `profile.publications[${i}].name`,
                sub: `profile.publications[${i}].publisher · .authors[].name`,
                dates: `profile.publications[${i}].publishedOn`,
                desc: `profile.publications[${i}].description`,
              }}
            />
          ))}
          {m.partial?.publications && (
            <p className="text-muted-foreground mt-2.5 text-[12.5px]">
              Showing {m.partial.publications.returned} of {m.partial.publications.total}.
            </p>
          )}
        </Section>
      )}

      <footer className="border-border text-muted-foreground border-t px-5 py-3.5 text-xs">
        {m.cached ? 'cached' : 'fetched'} {new Date(m.fetchedAt).toLocaleString()} · {m.source}
      </footer>
    </div>
  );
}
