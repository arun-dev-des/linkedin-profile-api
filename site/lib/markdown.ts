import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import rehypePrettyCode from 'rehype-pretty-code';
import rehypeStringify from 'rehype-stringify';

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)
  .use(rehypeSlug)
  .use(rehypeAutolinkHeadings, {
    behavior: 'append',
    properties: { className: ['heading-anchor'], 'aria-hidden': 'true', tabIndex: -1 },
    content: { type: 'text', value: '#' },
  })
  .use(rehypePrettyCode, {
    theme: { light: 'github-light', dark: 'github-dark-default' },
    keepBackground: false,
    defaultLang: 'text',
  })
  .use(rehypeStringify);

/** Markdown → HTML string, with GFM tables, heading anchors, and Shiki code. */
export async function renderMarkdown(md: string): Promise<string> {
  const file = await processor.process(md);
  return String(file)
    .replace(/<table>/g, '<div class="table-wrap"><table>')
    .replace(/<\/table>/g, '</table></div>');
}
