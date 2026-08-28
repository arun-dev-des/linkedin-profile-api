import type { Metadata } from 'next';
import { TryIt } from '@/components/try-it/try-it';

export const metadata: Metadata = {
  title: 'Try it',
  description:
    "Paste a LinkedIn profile URL and get it back as structured JSON, from a reverse-engineered call to LinkedIn's internal API.",
};

export default function Page() {
  return <TryIt />;
}
