import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BLOB } from './site';

// During `next build` the cwd is site/; the docs and README live one level up.
const repoRoot = join(process.cwd(), '..');
const read = (rel: string) => readFileSync(join(repoRoot, rel), 'utf8');
const readLocal = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

/** Pull one or more `## Heading` sections out of a markdown document. */
function section(markdown: string, ...headings: string[]): string {
  const lines = markdown.split('\n');
  return headings
    .map((heading) => {
      const start = lines.findIndex((l) => l.trim() === `## ${heading}`);
      if (start === -1) throw new Error(`section not found: "${heading}"`);
      let end = start + 1;
      while (end < lines.length && !/^#{1,2} /.test(lines[end])) end += 1;
      return lines
        .slice(start, end)
        .join('\n')
        .replace(/\n+---\s*$/, '')
        .trim();
    })
    .join('\n\n');
}

/** Rewrite repo-relative markdown links so they resolve on the site. */
function fixLinks(md: string): string {
  return md
    .replace(/\]\((?:\.\.\/|docs\/)?([A-Za-z-]+)\.md(#[^)]*)?\)/g, (_m, name: string, hash?: string) => {
      if (name !== 'README') return `](/${name}${hash ?? ''})`;
      return hash ? `](/api${hash})` : `](${BLOB}/README.md)`;
    })
    .replace(
      /\]\((?:\.\.\/)*(fetch_profile\.py|src\/[^)#]+)(#L\d+(?:-L\d+)?)?\)/g,
      `](${BLOB}/$1$2)`,
    )
    .replace(/\]\((?:\.\.\/)*fixtures\/([^)]+)\)/g, `](${BLOB}/fixtures/$1)`)
    .replace(/\]\(\/app\)/g, '](/)');
}

export interface Doc {
  title: string;
  description: string;
  markdown: string;
}

const README = () => read('README.md');

export function getDoc(slug: string): Doc {
  switch (slug) {
    case 'approach': {
      const intro = readLocal('content/approach-intro.md').replace(/<!--[\s\S]*?-->/g, '').trim();
      return {
        title: 'Approach',
        description:
          "A hosted API that turns a LinkedIn profile URL into structured JSON, from a reverse-engineered call to LinkedIn's internal Voyager API.",
        markdown: fixLinks(
          `${intro}\n\n---\n\n${section(README(), 'Approach — how the endpoint was reverse-engineered')}`,
        ),
      };
    }
    case 'api':
      return {
        title: 'API Reference',
        description: 'Endpoints, response schema, error codes, and known limitations.',
        markdown: fixLinks(
          [
            section(README(), 'API documentation'),
            section(README(), 'Response schema'),
            section(README(), 'Known limitations'),
          ].join('\n\n---\n\n'),
        ),
      };
    case 'how-the-fetch-works':
      return {
        title: 'The request, line by line',
        description: 'A beginner-friendly walkthrough of the single authenticated request.',
        markdown: fixLinks(read('docs/how-the-fetch-works.md')),
      };
    case 'apk-provenance':
      return {
        title: 'APK Provenance',
        description: "Verifying the endpoint against the LinkedIn Android app's compiled code.",
        markdown: fixLinks(read('docs/apk-provenance.md')),
      };
    case 'endpoint-map':
      return {
        title: 'Endpoint map',
        description:
          'Every LinkedIn profile endpoint found, and why one call covers almost everything.',
        markdown: fixLinks(read('docs/endpoint-map.md')),
      };
    default:
      throw new Error(`unknown doc: ${slug}`);
  }
}
