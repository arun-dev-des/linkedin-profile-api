'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Zap,
  BookOpen,
  Compass,
  Terminal,
  ShieldCheck,
  Waypoints,
  Braces,
  Activity,
  type LucideIcon,
} from 'lucide-react';
import { NAV, REPO } from '@/lib/site';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/theme-toggle';

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.4 5.4 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
      <path d="M9 18c-4.51 2-5-2-7-2" />
    </svg>
  );
}

const ICONS: Record<string, LucideIcon> = {
  zap: Zap,
  'book-open': BookOpen,
  compass: Compass,
  terminal: Terminal,
  'shield-check': ShieldCheck,
  waypoints: Waypoints,
  braces: Braces,
};

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="bg-sidebar border-border sticky top-0 z-10 flex h-auto shrink-0 flex-row items-center gap-1 overflow-x-auto border-b p-2 md:h-dvh md:flex-col md:items-stretch md:overflow-y-auto md:border-r md:border-b-0 md:p-3">
      <Link
        href="/"
        className="text-foreground shrink-0 px-2.5 py-1.5 text-sm font-bold whitespace-nowrap md:mb-3"
      >
        LinkedIn&nbsp;Profile&nbsp;API
      </Link>

      <nav className="flex flex-row gap-0.5 md:flex-col">
        {NAV.map((item, i) => {
          const Icon = ICONS[item.icon];
          const active = pathname === item.href;
          const showLabel = item.group && NAV[i - 1]?.group !== item.group;
          return (
            <div key={item.href} className="contents">
              {showLabel && (
                <p className="text-muted-foreground mt-4 hidden px-2.5 pb-1 text-[10.5px] font-semibold tracking-[0.07em] uppercase md:block">
                  {item.group}
                </p>
              )}
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-[9px] px-2.5 py-2 text-sm whitespace-nowrap transition-colors',
                  active
                    ? 'bg-accent text-foreground font-semibold'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                <Icon className="size-[19px] shrink-0 opacity-85" strokeWidth={1.75} />
                {item.label}
              </Link>
            </div>
          );
        })}
      </nav>

      <div className="border-border ml-auto flex flex-row items-center gap-1 md:mt-auto md:ml-0 md:flex-col md:items-stretch md:border-t md:pt-3">
        <a
          href={REPO}
          target="_blank"
          rel="noopener"
          className="text-muted-foreground hover:bg-accent hover:text-foreground flex items-center gap-3 rounded-[9px] px-2.5 py-2 text-sm whitespace-nowrap transition-colors"
        >
          <GithubIcon className="size-[19px] shrink-0" />
          <span className="hidden md:inline">GitHub&nbsp;↗</span>
        </a>
        <a
          href="https://linkedin-profile-api-production-3c84.up.railway.app/health"
          target="_blank"
          rel="noopener"
          className="text-muted-foreground hover:bg-accent hover:text-foreground flex items-center gap-3 rounded-[9px] px-2.5 py-2 text-sm whitespace-nowrap transition-colors"
        >
          <Activity className="size-[19px] shrink-0" strokeWidth={1.75} />
          <span className="hidden md:inline">API status</span>
          <span className="ml-auto hidden size-[7px] rounded-full bg-green-500 md:block" />
        </a>
        <ThemeToggle />
      </div>
    </aside>
  );
}
