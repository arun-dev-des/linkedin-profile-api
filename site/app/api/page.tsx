import { Doc, docMetadata } from '@/components/doc';

export function generateMetadata() {
  return docMetadata('api');
}

export default function Page() {
  return <Doc slug="api" />;
}
