'use client';

import { useEffect } from 'react';

/** Adds a hover "Copy" button to every code block on the page. */
export function CopyButtons() {
  useEffect(() => {
    const pres = document.querySelectorAll<HTMLElement>('.prose pre');
    const cleanups: (() => void)[] = [];

    pres.forEach((pre) => {
      if (pre.parentElement?.classList.contains('code-block')) return;
      const wrap = document.createElement('div');
      wrap.className = 'code-block';
      pre.parentElement?.insertBefore(wrap, pre);
      wrap.appendChild(pre);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'copy-btn';
      btn.textContent = 'Copy';
      const onClick = async () => {
        try {
          await navigator.clipboard.writeText(pre.innerText.trim());
          btn.textContent = 'Copied';
          setTimeout(() => (btn.textContent = 'Copy'), 1400);
        } catch {
          /* clipboard unavailable */
        }
      };
      btn.addEventListener('click', onClick);
      wrap.appendChild(btn);
      cleanups.push(() => btn.removeEventListener('click', onClick));
    });

    return () => cleanups.forEach((fn) => fn());
  }, []);

  return null;
}
