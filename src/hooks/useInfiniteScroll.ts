'use client';

import { useEffect, useRef } from 'react';

interface UseInfiniteScrollOptions {
  enabled: boolean;
  hasMore: boolean;
  isLoading: boolean;
  root?: HTMLElement | null;
  rootMargin?: string;
  threshold?: number;
  onLoadMore: () => void | Promise<void>;
}

interface UseInfiniteScrollResult {
  sentinelRef: React.RefObject<HTMLDivElement | null>;
}

export function useInfiniteScroll({
  enabled,
  hasMore,
  isLoading,
  root = null,
  rootMargin = '240px 0px',
  threshold = 0.01,
  onLoadMore,
}: UseInfiniteScrollOptions): UseInfiniteScrollResult {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef(onLoadMore);
  const lockRef = useRef(false);
  const releaseRafRef = useRef<number | null>(null);

  useEffect(() => {
    loadMoreRef.current = onLoadMore;
  }, [onLoadMore]);

  useEffect(() => {
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
      if (releaseRafRef.current !== null) {
        cancelAnimationFrame(releaseRafRef.current);
        releaseRafRef.current = null;
      }
      lockRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }

    if (!enabled || !hasMore || isLoading) {
      lockRef.current = false;
      return;
    }

    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        if (lockRef.current || isLoading) return;

        lockRef.current = true;
        Promise.resolve(loadMoreRef.current()).finally(() => {
          if (releaseRafRef.current !== null) {
            cancelAnimationFrame(releaseRafRef.current);
          }
          releaseRafRef.current = requestAnimationFrame(() => {
            lockRef.current = false;
            releaseRafRef.current = null;
          });
        });
      },
      {
        root,
        rootMargin,
        threshold,
      },
    );

    observer.observe(sentinel);
    observerRef.current = observer;

    return () => {
      observer.disconnect();
      if (observerRef.current === observer) {
        observerRef.current = null;
      }
    };
  }, [enabled, hasMore, isLoading, root, rootMargin, threshold]);

  return {
    sentinelRef,
  };
}
