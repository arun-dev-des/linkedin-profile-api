import { Doc, docMetadata } from '@/components/doc';

export function generateMetadata() {
  return docMetadata('endpoint-map');
}

export default function Page() {
  return <Doc slug="endpoint-map" />;
}
