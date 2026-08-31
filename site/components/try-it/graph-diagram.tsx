'use client';

import { useState } from 'react';

export interface GraphNode {
  urn: string;
  key: string;
  label: string;
  clickable: boolean;
}

const ROW_H = 46;
const CANVAS_W = 620;
const GAP_X = 150;
const CAP = 6;

/** First CAP-1 items plus a synthetic "+N more" slot once a side overflows. */
function layout(nodes: GraphNode[], expanded: boolean) {
  if (expanded || nodes.length <= CAP) return { items: nodes, moreCount: 0 };
  return { items: nodes.slice(0, CAP - 1), moreCount: nodes.length - (CAP - 1) };
}

function columnY(canvasH: number, rows: number, i: number) {
  const colH = rows * ROW_H;
  const start = (canvasH - colH) / 2;
  return start + ROW_H / 2 + i * ROW_H;
}

type Placed = { x: number; y: number; label: string; sub: string; urn: string | null; clickable: boolean };

/**
 * A node's own key/pointer-field label (e.g. "*profilePositionGroups") sits
 * inside the node itself, on its own row — not floated at the edge midpoint.
 * Many entities here are bare CollectionResponse boxes with no distinguishing
 * name, so that key is the only thing telling them apart; a floating label
 * also collides with neighbors once several edges converge near the center.
 */
function Node({
  n,
  align,
  onSelect,
  onExpand,
}: {
  n: Placed;
  align: 'left' | 'right';
  onSelect: (urn: string) => void;
  onExpand: () => void;
}) {
  const anchor = align === 'right' ? undefined : '-translate-x-full';

  if (!n.urn) {
    return (
      <button
        type="button"
        onClick={onExpand}
        className={`border-border text-muted-foreground hover:text-foreground absolute -translate-y-1/2 cursor-pointer rounded-md border border-dashed px-2 py-1.5 text-[11px] ${anchor ?? ''}`}
        style={{ left: n.x, top: n.y }}
      >
        {n.label}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onSelect(n.urn!)}
      disabled={!n.clickable}
      title={n.sub ? `${n.label} — ${n.sub}` : n.label}
      className={`border-border bg-card hover:bg-accent/50 absolute max-w-[150px] -translate-y-1/2 cursor-pointer rounded-md border px-2 py-1 text-left disabled:cursor-not-allowed disabled:opacity-50 ${anchor ?? ''}`}
      style={{ left: n.x, top: n.y }}
    >
      <div className="truncate text-[11px] font-medium">{n.label}</div>
      {n.sub && (
        <div className="text-muted-foreground truncate font-mono text-[9px]">{n.sub}</div>
      )}
    </button>
  );
}

/**
 * A local graph view of the currently selected entity: it in the center,
 * "points to" targets fanned out to the right, "referenced by" sources
 * fanned out to the left — the same two arrays the List view renders as
 * chips, laid out spatially instead. Clicking a node re-centers on it via
 * `onSelect`, same as a chip click.
 */
export function GraphDiagram({
  centerLabel,
  pointsTo,
  referencedBy,
  onSelect,
}: {
  centerLabel: string;
  pointsTo: GraphNode[];
  referencedBy: GraphNode[];
  onSelect: (urn: string) => void;
}) {
  const [expandedRight, setExpandedRight] = useState(false);
  const [expandedLeft, setExpandedLeft] = useState(false);

  const right = layout(pointsTo, expandedRight);
  const left = layout(referencedBy, expandedLeft);
  const rightRows = right.items.length + (right.moreCount > 0 ? 1 : 0);
  const leftRows = left.items.length + (left.moreCount > 0 ? 1 : 0);
  const rows = Math.max(rightRows, leftRows, 1);
  const canvasH = rows * ROW_H + 16;

  const centerX = CANVAS_W / 2;
  const centerY = canvasH / 2;
  const rightX = centerX + GAP_X;
  const leftX = centerX - GAP_X;

  const rightPlaced: Placed[] = right.items.map((n, i) => ({
    x: rightX,
    y: columnY(canvasH, rightRows, i),
    label: n.label,
    sub: n.key,
    urn: n.urn,
    clickable: n.clickable,
  }));
  if (right.moreCount > 0) {
    rightPlaced.push({
      x: rightX,
      y: columnY(canvasH, rightRows, right.items.length),
      label: `+${right.moreCount} more`,
      sub: '',
      urn: null,
      clickable: false,
    });
  }

  const leftPlaced: Placed[] = left.items.map((n, i) => ({
    x: leftX,
    y: columnY(canvasH, leftRows, i),
    label: n.label,
    sub: n.key,
    urn: n.urn,
    clickable: n.clickable,
  }));
  if (left.moreCount > 0) {
    leftPlaced.push({
      x: leftX,
      y: columnY(canvasH, leftRows, left.items.length),
      label: `+${left.moreCount} more`,
      sub: '',
      urn: null,
      clickable: false,
    });
  }

  return (
    <div className="border-border bg-background overflow-auto rounded-md border">
      <div className="relative" style={{ width: CANVAS_W, height: canvasH }}>
        <svg className="absolute inset-0" width={CANVAS_W} height={canvasH}>
          {rightPlaced.map((n, i) => (
            <line
              key={`r-edge-${i}`}
              x1={centerX}
              y1={centerY}
              x2={n.x}
              y2={n.y}
              stroke="var(--border)"
              strokeWidth={1.5}
            />
          ))}
          {leftPlaced.map((n, i) => (
            <line
              key={`l-edge-${i}`}
              x1={centerX}
              y1={centerY}
              x2={n.x}
              y2={n.y}
              stroke="var(--border)"
              strokeWidth={1.5}
            />
          ))}
        </svg>

        <div
          className="border-primary/50 bg-primary/10 text-foreground absolute max-w-[170px] -translate-x-1/2 -translate-y-1/2 truncate rounded-md border px-2.5 py-1.5 text-center text-[12px] font-semibold"
          style={{ left: centerX, top: centerY }}
          title={centerLabel}
        >
          {centerLabel}
        </div>

        {rightPlaced.map((n, i) => (
          <Node key={`r-${i}`} n={n} align="right" onSelect={onSelect} onExpand={() => setExpandedRight(true)} />
        ))}
        {leftPlaced.map((n, i) => (
          <Node key={`l-${i}`} n={n} align="left" onSelect={onSelect} onExpand={() => setExpandedLeft(true)} />
        ))}
      </div>
    </div>
  );
}
