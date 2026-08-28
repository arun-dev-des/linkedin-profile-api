'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable';
import { PRESETS } from '@/lib/site';
import { fetchProfile, fetchProfileRaw } from '@/lib/api';
import type { ProfileEnvelope, RawPayload } from '@/lib/types';
import { ProfileCard } from './profile-card';
import { JsonPanel } from './json-panel';

export function TryIt() {
  const [url, setUrl] = useState(PRESETS[0].url);
  const [full, setFull] = useState(false);
  const [activeUrl, setActiveUrl] = useState<string | null>(null);

  const [data, setData] = useState<ProfileEnvelope | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [raw, setRaw] = useState<RawPayload | null>(null);
  const [rawLoading, setRawLoading] = useState(false);
  const [rawError, setRawError] = useState<string | null>(null);

  const reqId = useRef(0);

  const run = useCallback(async (linkedinUrl: string, wantFull: boolean) => {
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    setData(null);
    setRaw(null);
    setRawError(null);
    setActiveUrl(linkedinUrl);

    // Reflect the current lookup in the URL without touching the Next router
    // (a full navigation would unmount this page).
    if (window.location.pathname === '/') {
      const params = new URLSearchParams({ url: linkedinUrl });
      if (wantFull) params.set('full', '1');
      window.history.replaceState(window.history.state, '', `/?${params}`);
    }

    try {
      const res = await fetchProfile(linkedinUrl, wantFull);
      if (id === reqId.current) setData(res);
    } catch (e) {
      if (id === reqId.current) setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, []);

  const loadRaw = useCallback(async () => {
    if (!activeUrl || raw || rawLoading) return;
    setRawLoading(true);
    setRawError(null);
    try {
      setRaw(await fetchProfileRaw(activeUrl));
    } catch (e) {
      setRawError(e instanceof Error ? e.message : 'Could not fetch the raw payload.');
    } finally {
      setRawLoading(false);
    }
  }, [activeUrl, raw, rawLoading]);

  // On mount: honour ?url= / ?full=1, else load the first preset.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const presetUrl = q.get('url') ?? PRESETS[0].url;
    const presetFull = q.get('full') === '1';
    setUrl(presetUrl);
    setFull(presetFull);
    run(presetUrl, presetFull);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (url.trim()) run(url.trim(), full);
  };

  const toggleFull = (v: boolean) => {
    setFull(v);
    if (activeUrl) run(activeUrl, v);
  };

  return (
    <div className="flex h-dvh flex-col">
      <div className="border-border shrink-0 border-b px-6 py-5 md:px-10">
        <h1 className="text-2xl font-bold tracking-tight">Try it</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          A LinkedIn profile URL in, structured JSON out.{' '}
          <a href="/overview" className="text-primary hover:underline">
            How it works
          </a>
        </p>

        <form onSubmit={submit} className="mt-4 flex max-w-2xl gap-2">
          <div className="relative flex-1">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.linkedin.com/in/…"
              className="pl-9"
              spellCheck={false}
            />
          </div>
          <Button type="submit" disabled={loading}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : 'Fetch'}
          </Button>
        </form>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {PRESETS.map((preset) => {
            const active = activeUrl === preset.url;
            return (
              <Button
                key={preset.id}
                size="sm"
                variant={active ? 'default' : 'outline'}
                onClick={() => {
                  setUrl(preset.url);
                  run(preset.url, full);
                }}
                className="h-7 rounded-full px-3 text-xs font-normal"
                title={preset.note}
              >
                {preset.name}
              </Button>
            );
          })}
          <div className="ml-1 flex items-center gap-2">
            <Switch id="full" checked={full} onCheckedChange={toggleFull} />
            <Label htmlFor="full" className="text-muted-foreground text-xs font-normal">
              Complete skills list <span className="font-mono">?full=1</span>
            </Label>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {error ? (
          <div className="p-6 md:p-10">
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </div>
        ) : (
          <ResizablePanelGroup orientation="horizontal" className="h-full">
            <ResizablePanel defaultSize="50" minSize="28">
              <ScrollArea className="h-full">
                <div className="p-5 md:p-6">
                  {loading || !data ? <CardSkeleton /> : <ProfileCard data={data} />}
                </div>
              </ScrollArea>
            </ResizablePanel>

            <ResizableHandle withHandle />

            <ResizablePanel defaultSize="50" minSize="28">
              {loading || !data ? (
                <div className="space-y-2 p-4">
                  <Skeleton className="h-6 w-40" />
                  <Skeleton className="h-64 w-full" />
                </div>
              ) : (
                <JsonPanel
                  data={data}
                  raw={raw}
                  rawLoading={rawLoading}
                  rawError={rawError}
                  onNeedRaw={loadRaw}
                />
              )}
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </div>
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="bg-card border-border overflow-hidden rounded-xl border">
      <Skeleton className="h-24 w-full rounded-none" />
      <div className="-mt-11 space-y-3 px-5 pb-5">
        <Skeleton className="size-[88px] rounded-full" />
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="border-border space-y-2 border-t px-5 py-4">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </div>
  );
}
