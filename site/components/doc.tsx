import { getDoc } from '@/lib/content';
import { renderMarkdown } from '@/lib/markdown';
import { CopyButtons } from '@/components/copy-buttons';

export async function Doc({ slug }: { slug: string }) {
  const doc = getDoc(slug);
  const html = await renderMarkdown(doc.markdown);

  return (
    <article className="prose mx-auto w-full max-w-3xl px-6 py-11 md:px-10 lg:max-w-4xl">
      <div dangerouslySetInnerHTML={{ __html: html }} />
      <CopyButtons />
    </article>
  );
}

export function docMetadata(slug: string) {
  const doc = getDoc(slug);
  return { title: doc.title, description: doc.description };
}
