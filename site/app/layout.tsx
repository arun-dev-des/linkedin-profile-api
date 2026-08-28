import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/theme-provider';
import { Sidebar } from '@/components/sidebar';
import { Toaster } from '@/components/ui/sonner';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL('https://linkedin-profile-api-phi.vercel.app'),
  title: {
    default: 'LinkedIn Profile API',
    template: '%s · LinkedIn Profile API',
  },
  description:
    "A hosted API that turns a LinkedIn profile URL into structured JSON, built by reverse-engineering LinkedIn's internal Voyager API. No browser automation.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${mono.variable}`}>
      <body className="min-h-dvh antialiased">
        <ThemeProvider>
          <div className="mx-auto flex min-h-dvh max-w-[1400px] md:grid md:grid-cols-[232px_1fr]">
            <Sidebar />
            <main className="min-w-0 flex-1">{children}</main>
          </div>
          <Toaster position="bottom-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
