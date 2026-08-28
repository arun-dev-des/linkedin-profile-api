import { Doc, docMetadata } from '@/components/doc';

export function generateMetadata() {
  return docMetadata('approach');
}

export default function Page() {
  return <Doc slug="approach" />;
}
