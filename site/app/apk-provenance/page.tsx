import { Doc, docMetadata } from '@/components/doc';

export function generateMetadata() {
  return docMetadata('apk-provenance');
}

export default function Page() {
  return <Doc slug="apk-provenance" />;
}
