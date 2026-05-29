// Wordmark. The SVG markup lives in src/assets/brand/logo-{dark,light}.svg
// (two colour bakes — the mark uses three independent fills, so a single
// currentColor file can't cover both variants). Imported via vite-plugin-svgr.
import LogoDark from '@/assets/brand/logo-dark.svg?react';
import LogoLight from '@/assets/brand/logo-light.svg?react';

interface LogoProps {
  height?: number;
  className?: string;
  variant?: 'dark' | 'light';
}

const ASPECT = 250 / 50;

export function Logo({ height = 20, className = '', variant = 'dark' }: LogoProps) {
  const Mark = variant === 'dark' ? LogoDark : LogoLight;
  return <Mark width={height * ASPECT} height={height} className={className} />;
}
