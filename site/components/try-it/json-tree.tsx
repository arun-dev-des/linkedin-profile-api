'use client';

import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

type Json = unknown;

function leaf(value: Json) {
  if (value === null) return <span className="text-muted-foreground italic">null</span>;
  if (typeof value === 'string')
    return <span style={{ color: 'var(--jstr)' }}>&quot;{value}&quot;</span>;
  if (typeof value === 'number') return <span style={{ color: 'var(--jnum)' }}>{value}</span>;
  if (typeof value === 'boolean') return <span className="text-primary">{String(value)}</span>;
  return <span>{String(value)}</span>;
}

function Key({ name }: { name?: string | number }) {
  if (name === undefined) return null;
  return (
    <>
      <span style={{ color: 'var(--jkey)' }}>{name}</span>
      <span className="text-muted-foreground">: </span>
    </>
  );
}

function Node({
  name,
  value,
  depth,
}: {
  name?: string | number;
  value: Json;
  depth: number;
}) {
  const [open, setOpen] = useState(depth < 2);

  if (value === null || typeof value !== 'object') {
    return (
      <div className="pl-[1.1rem] whitespace-pre-wrap">
        <Key name={name} />
        {leaf(value)}
      </div>
    );
  }

  const isArray = Array.isArray(value);
  const entries: [string | number, Json][] = isArray
    ? (value as Json[]).map((v, i) => [i, v])
    : Object.entries(value as Record<string, Json>);
  const bracket = isArray ? ['[', ']'] : ['{', '}'];

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="hover:bg-accent/50 -ml-1 flex w-full items-baseline rounded px-1 text-left"
      >
        <ChevronRight
          className={cn(
            'mt-[3px] mr-0.5 size-3 shrink-0 self-start transition-transform',
            open && 'rotate-90',
          )}
          strokeWidth={2.75}
        />
        <span className="whitespace-pre-wrap">
          <Key name={name} />
          {bracket[0]}{' '}
          <span className="text-muted-foreground italic">
            {entries.length} {isArray ? 'items' : 'keys'}
          </span>
          {!open && <span className="text-muted-foreground"> {bracket[1]}</span>}
        </span>
      </button>
      {open && (
        <div className="pl-[1.1rem]">
          {entries.map(([k, v]) => (
            <Node key={k} name={k} value={v} depth={depth + 1} />
          ))}
          <div className="text-muted-foreground pl-1">{bracket[1]}</div>
        </div>
      )}
    </div>
  );
}

export function JsonTree({ data }: { data: Json }) {
  return (
    <div className="font-mono text-[12px] leading-[1.7]">
      <Node value={data} depth={0} />
    </div>
  );
}
