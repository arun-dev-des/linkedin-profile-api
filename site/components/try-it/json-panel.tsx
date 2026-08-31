'use client';

import { useState } from 'react';
import { Check, Copy, Loader2 } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { JsonTree } from './json-tree';
import { EntityResolver } from './entity-resolver';
import type { ProfileEnvelope, RawPayload } from '@/lib/types';

export function JsonPanel({
  data,
  raw,
  rawLoading,
  rawError,
  onNeedRaw,
}: {
  data: ProfileEnvelope;
  raw: RawPayload | null;
  rawLoading: boolean;
  rawError: string | null;
  onNeedRaw: () => void;
}) {
  const [tab, setTab] = useState('tree');
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const payload = tab === 'full' || tab === 'resolver' ? raw : data;
    if (!payload) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <Tabs
      value={tab}
      onValueChange={(v) => {
        setTab(v);
        if ((v === 'full' || v === 'resolver') && !raw && !rawLoading) onNeedRaw();
      }}
      className="flex h-full flex-col gap-0"
    >
      <div className="border-border flex items-center border-b pr-2">
        <TabsList className="h-10 rounded-none border-0 bg-transparent p-0">
          <Tab value="tree">Tree</Tab>
          <Tab value="raw">Raw</Tab>
          <Tab value="full">
            Full JSON <span className="text-muted-foreground ml-1">· not normalised</span>
          </Tab>
          <Tab value="resolver">Resolver</Tab>
        </TabsList>
        <Button
          variant="outline"
          size="sm"
          onClick={copy}
          className="ml-auto h-7 gap-1.5 px-2 text-[11px]"
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="p-3">
          <TabsContent value="tree" className="mt-0">
            <JsonTree data={data} />
          </TabsContent>
          <TabsContent value="raw" className="mt-0">
            <pre className="font-mono text-[12px] leading-relaxed whitespace-pre">
              {JSON.stringify(data, null, 2)}
            </pre>
          </TabsContent>
          <TabsContent value="full" className="mt-0">
            {rawLoading && (
              <div className="text-muted-foreground flex items-center gap-2 py-6 text-sm">
                <Loader2 className="size-4 animate-spin" /> fetching the raw payload…
              </div>
            )}
            {rawError && <div className="text-destructive py-4 text-sm">{rawError}</div>}
            {raw && (
              <>
                <p className="text-muted-foreground mb-3 text-[11.5px]">
                  The unprocessed Voyager payload —{' '}
                  {(JSON.stringify(raw).length / 1024).toFixed(0)}&nbsp;KB, {raw.included?.length}{' '}
                  entities in <code className="font-mono">included[]</code>, cross-referenced by URN.{' '}
                  <code className="font-mono">src/linkedin/normalize.js</code> turns this into the
                  Tree.
                </p>
                <JsonTree data={raw} />
              </>
            )}
          </TabsContent>
          <TabsContent value="resolver" className="mt-0">
            {rawLoading && (
              <div className="text-muted-foreground flex items-center gap-2 py-6 text-sm">
                <Loader2 className="size-4 animate-spin" /> fetching the raw payload…
              </div>
            )}
            {rawError && <div className="text-destructive py-4 text-sm">{rawError}</div>}
            {raw && (
              <EntityResolver
                key={data.profile.profileUrn ?? data.profile.publicId ?? undefined}
                raw={raw}
              />
            )}
          </TabsContent>
        </div>
      </ScrollArea>
    </Tabs>
  );
}

function Tab({ value, children }: { value: string; children: React.ReactNode }) {
  return (
    <TabsTrigger
      value={value}
      className="text-muted-foreground data-[state=active]:text-foreground data-[state=active]:border-primary h-10 rounded-none border-0 border-b-2 border-transparent bg-transparent px-3.5 text-[12.5px] font-medium shadow-none data-[state=active]:shadow-none"
    >
      {children}
    </TabsTrigger>
  );
}
