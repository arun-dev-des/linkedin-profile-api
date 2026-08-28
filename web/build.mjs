#!/usr/bin/env node
/**
 * Builds the static showcase site into dist/.
 *
 * The home page (/) is the live app — public/index.html's widget lifted into
 * the shared sidebar layout, with an injected API base so it calls the hosted
 * API. Everything else is a doc page:
 *   - web/pages/*.md        site-only content (the Overview page)
 *   - docs/*.md             rendered verbatim (also live in the repo)
 *   - sections of README.md extracted by heading, so there's one source of truth
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';
import { createHighlighter } from 'shiki';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(root + p, 'utf8');

const escHtml = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

/* Build-time syntax highlighting — VS Code themes, no runtime JS. */
const shiki = await createHighlighter({
  themes: ['github-light', 'github-dark-default'],
  langs: ['js', 'ts', 'json', 'bash', 'shell', 'http', 'html', 'css', 'python', 'diff', 'md'],
});
const SHIKI_LANGS = new Set(shiki.getLoadedLanguages());

/** Per-page heading-id deduper, reset before each marked.parse(). */
let slugCounts = new Map();
function slugify(text) {
  const base =
    String(text)
      .toLowerCase()
      .trim()
      .replace(/[`*_~]/g, '')
      .replace(/[^\w]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'section';
  const n = (slugCounts.get(base) ?? 0) + 1;
  slugCounts.set(base, n);
  return n === 1 ? base : `${base}-${n}`;
}

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
      .replace(/href="\/app"/g, 'href="/"')
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
    code({ text, lang }) {
      const inner = SHIKI_LANGS.has(lang)
        ? shiki.codeToHtml(text, {
            lang,
            themes: { light: 'github-light', dark: 'github-dark-default' },
            defaultColor: false,
          })
        : `<pre class="shiki plain"><code>${escHtml(text)}</code></pre>`;
      return `<div class="code-wrap">${inner}</div>`;
    },
    heading({ tokens, depth }) {
      const html = this.parser.parseInline(tokens);
      const plain = tokens.map((t) => t.text ?? '').join('');
      const id = slugify(plain);
      const anchor =
        depth > 1 && depth < 4
          ? ` <a class="hanchor" href="#${id}" aria-label="Link to “${escHtml(plain)}”">#</a>`
          : '';
      return `<h${depth} id="${id}">${html}${anchor}</h${depth}>\n`;
    },
  },
});

const dist = root + 'dist';

// Content-hash the stylesheet so a deploy always busts the CDN/browser cache.
const cssSource = read('/web/site.css');
const cssName = `site.${createHash('sha256').update(cssSource).digest('hex').slice(0, 10)}.css`;

const layout = read('/web/layout.html').replaceAll('/site.css', `/${cssName}`);
const navSlugs = [
  'index',
  'overview',
  'approach',
  'how-the-fetch-works',
  'apk-provenance',
  'endpoint-map',
  'api',
];

/** Fill the shared layout and write dist/<slug>.html. */
function renderLayout({ slug, title, description = '', contentHtml, headExtra = '', mainClass = '' }) {
  let outHtml = layout
    .replaceAll('{{title}}', title)
    .replaceAll('{{description}}', description)
    .replace('{{head-extra}}', headExtra)
    .replace('{{content}}', contentHtml)
    .replace('{{main-class}}', mainClass);
  for (const s of navSlugs) {
    outHtml = outHtml.replace(`{{active-${s}}}`, s === slug ? ' aria-current="page"' : '');
  }
  writeFileSync(`${dist}/${slug}.html`, outHtml);
  console.log(`  ${slug}.html`);
}

/** A markdown doc page. */
function page({ slug, title, description = '', md, wide = false }) {
  const tHint = md.match(/<!--\s*title:\s*(.+?)\s*-->/);
  const dHint = md.match(/<!--\s*description:\s*(.+?)\s*-->/);
  slugCounts = new Map();
  const contentHtml = fixLinks(marked.parse(md)).replace(/<!--[\s\S]*?-->/g, '');
  renderLayout({
    slug,
    title: tHint?.[1] ?? title,
    description: dHint?.[1] ?? description,
    contentHtml,
    mainClass: wide ? 'wide' : '',
  });
}

/**
 * The home page: lift the widget's <style> and <body> out of public/index.html
 * into the shared layout. The page-level rules (:root tokens, `* box-sizing`,
 * `body`) are dropped — site.css owns those — and the widget's own <header>
 * (redundant with the sidebar brand) becomes a one-line intro.
 */
function appPage() {
  const src = read('/public/index.html');

  const style = src
    .match(/<style>([\s\S]*?)<\/style>/)[1]
    .replace(/:root\s*\{[^}]*\}/g, '')
    .replace(/@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{[^}]*\}\s*\}/g, '')
    .replace(/\*\s*\{\s*box-sizing:[^}]*\}/g, '')
    .replace(/\bbody\s*\{[^}]*\}/g, '')
    .trim();

  const body = src
    .match(/<body>([\s\S]*?)<\/body>/)[1]
    .replace(
      /<header>[\s\S]*?<\/header>/,
      '<h1>Try it</h1>\n<p class="app-intro">Paste a LinkedIn profile URL to get it back as ' +
        'structured JSON. <a href="/overview">How it works</a> · ' +
        `<a href="${REPO}" target="_blank" rel="noopener">Source</a></p>`,
    );

  renderLayout({
    slug: 'index',
    title: 'Try it',
    description:
      'Paste a LinkedIn profile URL and get it back as structured JSON, from a ' +
      "reverse-engineered call to LinkedIn's internal API.",
    headExtra: `<style>\n${style}\n</style>`,
    contentHtml: `<script>window.API_BASE=${JSON.stringify(API_URL)}</script>\n${body}`,
    mainClass: 'app',
  });
}

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
console.log('building site →');

const readme = read('/README.md');
const back = '[← Overview](/overview)\n\n';

appPage();

page({
  slug: 'overview',
  title: 'Overview',
  md: read('/web/pages/overview.md'),
});

page({
  slug: 'approach',
  title: 'Approach',
  description: 'How the LinkedIn Voyager endpoint was reverse-engineered and verified.',
  md: back + section(readme, 'Approach — how the endpoint was reverse-engineered'),
});

page({
  slug: 'api',
  title: 'API Reference',
  description: 'Endpoints, response schema, error codes, and known limitations.',
  wide: true,
  md:
    back +
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
  md: back + read('/docs/how-the-fetch-works.md'),
});

page({
  slug: 'apk-provenance',
  title: 'APK Provenance',
  description: "Verifying the endpoint against the LinkedIn Android app's compiled code.",
  md: back + read('/docs/apk-provenance.md'),
});

page({
  slug: 'endpoint-map',
  title: 'Endpoint map',
  description: 'Every LinkedIn profile endpoint found, and why one call covers almost everything.',
  wide: true,
  md: back + read('/docs/endpoint-map.md'),
});

writeFileSync(`${dist}/${cssName}`, cssSource);
console.log(`  ${cssName}`);

writeFileSync(`${dist}/robots.txt`, 'User-agent: *\nAllow: /\n');

console.log('done → dist/');
