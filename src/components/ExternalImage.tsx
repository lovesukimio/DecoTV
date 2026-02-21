'use client';

import Image, { type ImageProps } from 'next/image';
import { SyntheticEvent, useCallback, useState } from 'react';

/**
 * External runtime image wrapper.
 * 默认不走 Next.js 图片优化，以避免域名白名单限制。
 * 当图片加载失败（如 502 Bad Gateway）时，自动显示 SVG 占位图。
 */
export default function ExternalImage(props: ImageProps) {
  const {
    unoptimized = true,
    decoding = 'async',
    onError: externalOnError,
    ...rest
  } = props;

  const [hasError, setHasError] = useState(false);

  const handleError = useCallback(
    (e: SyntheticEvent<HTMLImageElement, Event>) => {
      setHasError(true);
      // NOTE: 仍然调用外部传入的 onError（如 VideoCard 的 setIsLoading）
      if (typeof externalOnError === 'function') {
        externalOnError(e);
      }
    },
    [externalOnError],
  );

  // 图片加载失败时使用内联 SVG 占位图
  if (hasError) {
    return (
      <div
        className='absolute inset-0 flex items-center justify-center bg-gray-200 dark:bg-gray-700 rounded-lg'
        aria-label={typeof rest.alt === 'string' ? rest.alt : '图片加载失败'}
      >
        <svg
          className='w-10 h-10 text-gray-400 dark:text-gray-500'
          fill='none'
          stroke='currentColor'
          viewBox='0 0 24 24'
          aria-hidden='true'
        >
          <path
            strokeLinecap='round'
            strokeLinejoin='round'
            strokeWidth={1.5}
            d='M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z'
          />
        </svg>
      </div>
    );
  }

  return (
    <Image
      {...rest}
      decoding={decoding}
      unoptimized={unoptimized}
      onError={handleError}
    />
  );
}
