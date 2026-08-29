'use client';

import { ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { ProfileEnvelope } from '@/lib/types';

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
}: {
  logo?: string | null;
  fallback?: string;
  title: string;
  sub?: string;
  dates?: string;
  desc?: string | null;
}) {
  return (
    <div className="border-border flex gap-3 border-t py-3 first:border-t-0">
      {logo !== undefined && <Logo src={logo} fallback={fallback ?? sub ?? title} />}
      <div className="min-w-0">
        <div className="font-semibold">{title}</div>
        {sub && <div className="text-sm">{sub}</div>}
        {dates && <div className="text-muted-foreground mt-0.5 text-[13px]">{dates}</div>}
        {desc && (
          <p className="text-muted-foreground mt-1.5 text-[13px] whitespace-pre-wrap">{desc}</p>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  if (!children) return null;
  return (
    <section className="border-border border-t px-5 py-4">
      <h3 className="text-muted-foreground mb-3 text-[11px] font-semibold tracking-[0.06em] uppercase">
        {title}
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
        <h2 className="mt-3 text-xl font-semibold tracking-tight">{p.name ?? 'Unknown'}</h2>
        {p.headline && <p className="mt-0.5">{p.headline}</p>}
        <div className="text-muted-foreground mt-1.5 text-[13.5px]">
          {[p.location, p.industry].filter(Boolean).join(' · ')}
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
        <Section title="About">
          <p className="whitespace-pre-wrap">{p.about}</p>
        </Section>
      )}

      {experience.length > 0 && (
        <Section title="Experience">
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
            />
          ))}
          {m.partial?.experience && (
            <p className="text-muted-foreground mt-2.5 text-[12.5px]">
              Showing {m.partial.experience.returnedGroups} of{' '}
              {m.partial.experience.totalGroups} companies — turn on “Complete skills &amp;
              experience” above.
            </p>
          )}
        </Section>
      )}

      {careerBreaks.length > 0 && (
        <Section title="Career Breaks">
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
            />
          ))}
        </Section>
      )}

      {education.length > 0 && (
        <Section title="Education">
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
              />
            );
          })}
        </Section>
      )}

      {skills.length > 0 && (
        <Section title="Skills">
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
        <Section title="Certifications">
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
        <Section title="Languages">
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
        <Section title="Featured">
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
        <Section title="Volunteering">
          {volunteerExperience.map((v, i) => (
            <Entry
              key={i}
              logo={v.companyLogo}
              fallback={v.company ?? ''}
              title={v.role ?? ''}
              sub={[v.company, v.cause ? humanize(v.cause) : null].filter(Boolean).join(' · ')}
              dates={dateSpan(v.startDate, v.endDate, v.current)}
              desc={v.description}
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
        <Section title="Honors & Awards">
          {honors.map((h, i) => (
            <Entry
              key={i}
              logo={null}
              fallback={h.issuer ?? h.title ?? ''}
              title={h.title ?? ''}
              sub={h.issuer ?? undefined}
              dates={h.issuedOn ?? undefined}
              desc={h.description}
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
        <Section title="Publications">
          {publications.map((pub, i) => (
            <Entry
              key={i}
              logo={null}
              fallback={pub.publisher ?? pub.name ?? ''}
              title={pub.name ?? ''}
              sub={[pub.publisher, pub.authors.length ? pub.authors.map((a) => a.name).join(', ') : null]
                .filter(Boolean)
                .join(' · ')}
              dates={pub.publishedOn ?? undefined}
              desc={pub.description}
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
