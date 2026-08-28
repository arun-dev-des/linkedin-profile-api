import { Doc, docMetadata } from '@/components/doc';

export function generateMetadata() {
  return docMetadata('overview');
}

export default function Page() {
  return <Doc slug="overview" />;
}
