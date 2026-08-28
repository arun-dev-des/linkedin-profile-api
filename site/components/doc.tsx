import { getDoc } from '@/lib/content';
import { renderMarkdown } from '@/lib/markdown';
import { CopyButtons } from '@/components/copy-buttons';

export async function Doc({ slug }: { slug: string }) {
  const doc = getDoc(slug);
  const html = await renderMarkdown(doc.markdown);

  return (
    <article className="prose w-full max-w-4xl px-6 py-10 md:px-10 md:py-12 xl:max-w-5xl">
      <div dangerouslySetInnerHTML={{ __html: html }} />
      <CopyButtons />
    </article>
  );
}

export function docMetadata(slug: string) {
  const doc = getDoc(slug);
  return { title: doc.title, description: doc.description };
}
