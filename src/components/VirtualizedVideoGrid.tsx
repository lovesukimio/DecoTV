'use client';

import { ReactNode, useCallback, useMemo } from 'react';
import { VirtuosoGrid } from 'react-virtuoso';

type VirtualizationMode = 'auto' | 'always' | 'never';

interface VirtualizedVideoGridProps<T> {
  data: T[];
  className: string;
  itemClassName?: string;
  itemKey: (item: T, index: number) => string;
  renderItem: (item: T, index: number) => ReactNode;
  onEndReached?: (index: number) => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  mode?: VirtualizationMode;
  virtualizationThreshold?: number;
  overscan?: number;
}

function resolveItemId(item: unknown): string | null {
  if (!item || typeof item !== 'object') {
    return null;
  }

  const record = item as Record<string, unknown>;
  const candidates = ['vod_id', 'id', 'douban_id', 'uuid', 'key', 'slug'];

  for (const candidate of candidates) {
    const value = record[candidate];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }

  return null;
}

export default function VirtualizedVideoGrid<T>({
  data,
  className,
  itemClassName = 'w-full',
  itemKey,
  renderItem,
  onEndReached,
  hasMore = true,
  isLoadingMore = false,
  mode = 'auto',
  virtualizationThreshold = 120,
  overscan = 2000,
}: VirtualizedVideoGridProps<T>) {
  const shouldVirtualize =
    mode === 'always' ||
    (mode === 'auto' && data.length >= virtualizationThreshold);

  const resolvedKeys = useMemo(() => {
    const keyCount = new Map<string, number>();

    return data.map((item, index) => {
      const rawKey = itemKey(item, index);
      const trimmedKey = rawKey?.trim();
      const baseKey = trimmedKey || resolveItemId(item) || 'unknown-item';
      const duplicateCount = keyCount.get(baseKey) ?? 0;

      keyCount.set(baseKey, duplicateCount + 1);

      if (duplicateCount === 0) {
        return baseKey;
      }

      return `${baseKey}_${index}`;
    });
  }, [data, itemKey]);

  const handleEndReached = useCallback(
    (index: number) => {
      if (!onEndReached) return;
      if (!hasMore || isLoadingMore || data.length === 0) return;
      onEndReached(index);
    },
    [data.length, hasMore, isLoadingMore, onEndReached],
  );

  const footer = useCallback(() => {
    if (!onEndReached) {
      return null;
    }

    return (
      <div className='flex min-h-[60px] w-full items-center justify-center py-4'>
        {isLoadingMore ? (
          <span
            className='inline-block h-5 w-5 animate-spin rounded-full border-2 border-slate-500/50 border-t-emerald-300'
            aria-hidden='true'
          />
        ) : null}
      </div>
    );
  }, [isLoadingMore, onEndReached]);

  const normalizedOverscan = Math.max(overscan, 2000);
  const reverseOverscan = Math.max(Math.round(normalizedOverscan * 1.2), 2000);
  const mainOverscan = normalizedOverscan;

  const components = onEndReached
    ? {
        Footer: footer,
      }
    : undefined;

  const endReached = onEndReached ? handleEndReached : undefined;

  const increaseViewportBy = useMemo(
    () => ({
      top: Math.max(Math.round(normalizedOverscan * 0.75), 1200),
      bottom: Math.max(Math.round(normalizedOverscan * 1.1), 2000),
    }),
    [normalizedOverscan],
  );

  if (!shouldVirtualize) {
    return (
      <div className={className}>
        {data.map((item, index) => (
          <div
            key={resolvedKeys[index]}
            className={itemClassName}
            style={{
              contentVisibility: 'auto',
              containIntrinsicSize: '360px',
            }}
          >
            {renderItem(item, index)}
          </div>
        ))}
      </div>
    );
  }

  return (
    <VirtuosoGrid
      useWindowScroll
      data={data}
      listClassName={className}
      itemClassName={itemClassName}
      overscan={{ main: mainOverscan, reverse: reverseOverscan }}
      increaseViewportBy={increaseViewportBy}
      computeItemKey={(index) => resolvedKeys[index]}
      itemContent={(index, item) => renderItem(item, index)}
      components={components}
      endReached={endReached}
    />
  );
}
