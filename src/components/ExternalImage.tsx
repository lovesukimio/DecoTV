import Image, { type ImageProps } from 'next/image';

/**
 * External runtime image wrapper.
 * Defaults to unoptimized to avoid environment-specific Next image allowlist issues.
 */
export default function ExternalImage(props: ImageProps) {
  const { unoptimized = true, decoding = 'async', ...rest } = props;
  return <Image {...rest} decoding={decoding} unoptimized={unoptimized} />;
}
