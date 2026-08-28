#!/usr/bin/env node
/**
 * Builds the static showcase site into dist/.
 *
 * Sources, in order of preference for single-sourcing:
 *   - web/pages/*.md            site-only content (the landing page)
 *   - docs/*.md                 rendered verbatim (also live in the repo)
 *   - sections of README.md     extracted by heading, so there's one source of truth
 *
 * The interactive app is public/index.html, copied in with an injected API base
 * so the same widget works both same-origin (on the API host) and here.
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(root + p, 'utf8');

const API_URL = 'https://linkedin-profile-api-production-3c84.up.railway.app';
const REPO = 'https://github.com/arun-dev-des/linkedin-profile-api';
const BLOB = `${REPO}/blob/main`;

/** Pull one or more `## Heading` sections out of a markdown document. */
function section(markdown, ...headings) {
  const lines = markdown.split('\n');
  const out = [];
  for (const heading of headings) {
    const start = lines.findIndex((l) => l.trim() === `## ${heading}`);
    if (start === -1) throw new Error(`section not found: "${heading}"`);
    let end = start + 1;
    while (end < lines.length && !/^#{1,2} /.test(lines[end])) end += 1;
    out.push(
      lines
        .slice(start, end)
        .join('\n')
        .replace(/\n+---\s*$/, '')
        .trim(),
    );
  }
  return out.join('\n\n');
}

/** Rewrite repo-relative links so they work on the deployed site. */
function fixLinks(html) {
  return (
    html
      // docs/<name>.md and ../<name>.md (sibling docs) -> site page
      .replace(/href="(?:\.\.\/|docs\/)?([A-Za-z-]+)\.md(#[^"]*)?"/g, (_m, name, hash) => {
        if (name !== 'README') return `href="/${name}${hash ?? ''}"`;
        return hash ? `href="/api${hash}"` : `href="${BLOB}/README.md"`;
      })
      // source files (any depth of ../) -> GitHub blob
      .replace(
        /href="(?:\.\.\/)*(fetch_profile\.py|src\/[^"#]+)(#L\d+(?:-L\d+)?)?"/g,
        `href="${BLOB}/$1$2"`,
      )
      .replace(/href="(?:\.\.\/)*fixtures\/([^"]+)"/g, `href="${BLOB}/fixtures/$1"`)
      .replace(/href="(https:\/\/[^"]+)"/g, 'href="$1" target="_blank" rel="noopener"')
  );
}

marked.use({
  renderer: {
    table(header, body) {
      const t =
        typeof header === 'object'
          ? marked.Renderer.prototype.table.call(this, header)
          : `<table><thead>${header}</thead><tbody>${body}</tbody></table>`;
      return `<div class="table-wrap">${t}</div>`;
    },
  },
});

const layout = read('/web/layout.html');
const navSlugs = ['app', 'approach', 'how-the-fetch-works', 'apk-provenance', 'endpoint-map', 'api'];

function page({ slug, title, description = '', md, wide = false }) {
  let content = fixLinks(marked.parse(md));
  // Pull an <!-- title --> / <!-- description --> hint out of the markdown if present.
  const tHint = md.match(/<!--\s*title:\s*(.+?)\s*-->/);
  const dHint = md.match(/<!--\s*description:\s*(.+?)\s*-->/);
  content = content.replace(/<!--[\s\S]*?-->/g, '');

  let outHtml = layout
    .replaceAll('{{title}}', tHint?.[1] ?? title)
    .replaceAll('{{description}}', dHint?.[1] ?? description)
    .replace('{{content}}', content)
    .replace('{{main-class}}', wide ? 'wide' : '');

  for (const s of navSlugs) {
    outHtml = outHtml.replace(`{{active-${s}}}`, s === slug ? ' aria-current="page"' : '');
  }
  writeFileSync(`${dist}/${slug === 'index' ? 'index' : slug}.html`, outHtml);
  console.log(`  ${slug}.html`);
}

const dist = root + 'dist';
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
console.log('building site →');

const readme = read('/README.md');

page({ slug: 'index', title: 'Overview', md: read('/web/pages/index.md') });

page({
  slug: 'approach',
  title: 'Approach',
  description: 'How the LinkedIn Voyager endpoint was reverse-engineered and verified.',
  md: `[← Overview](/)\n\n${section(readme, 'Approach — how the endpoint was reverse-engineered')}`,
});

page({
  slug: 'api',
  title: 'API Reference',
  description: 'Endpoints, response schema, error codes, and known limitations.',
  md:
    `[← Overview](/)\n\n` +
    [
      section(readme, 'API documentation'),
      section(readme, 'Response schema'),
      section(readme, 'Known limitations'),
    ].join('\n\n---\n\n'),
});

page({
  slug: 'how-the-fetch-works',
  title: 'The request, line by line',
  description: 'A beginner-friendly walkthrough of the single authenticated request.',
  md: `[← Overview](/)\n\n${read('/docs/how-the-fetch-works.md')}`,
});

page({
  slug: 'apk-provenance',
  title: 'APK Provenance',
  description: "Verifying the endpoint against the LinkedIn Android app's compiled code.",
  md: `[← Overview](/)\n\n${read('/docs/apk-provenance.md')}`,
});

page({
  slug: 'endpoint-map',
  title: 'Endpoint map',
  description: 'Every LinkedIn profile endpoint found, and why one call covers almost everything.',
  md: `[← Overview](/)\n\n${read('/docs/endpoint-map.md')}`,
});

// The interactive app: public/index.html with an injected absolute API base.
const appHtml = read('/public/index.html').replace(
  '<head>',
  `<head>\n    <script>window.API_BASE=${JSON.stringify(API_URL)}</script>`,
);
writeFileSync(`${dist}/app.html`, appHtml);
console.log('  app.html  (from public/index.html)');

copyFileSync(root + 'web/site.css', `${dist}/site.css`);
console.log('  site.css');

writeFileSync(`${dist}/robots.txt`, 'User-agent: *\nAllow: /\n');

console.log('done → dist/');
