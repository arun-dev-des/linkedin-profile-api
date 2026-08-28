import { Doc, docMetadata } from '@/components/doc';

export function generateMetadata() {
  return docMetadata('how-the-fetch-works');
}

export default function Page() {
  return <Doc slug="how-the-fetch-works" />;
}
