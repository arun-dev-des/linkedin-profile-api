'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const dark = resolvedTheme === 'dark';

  return (
    <button
      type="button"
      onClick={() => setTheme(dark ? 'light' : 'dark')}
      aria-label="Toggle theme"
      className="text-muted-foreground hover:bg-accent hover:text-foreground flex cursor-pointer items-center gap-3 rounded-[9px] px-2.5 py-2 text-sm whitespace-nowrap transition-colors"
    >
      {mounted && dark ? (
        <Sun className="size-[19px] shrink-0" strokeWidth={1.75} />
      ) : (
        <Moon className="size-[19px] shrink-0" strokeWidth={1.75} />
      )}
      <span className="hidden md:inline">{mounted && dark ? 'Light' : 'Dark'} mode</span>
    </button>
  );
}
