import Image from 'next/image';
import type { CSSProperties } from 'react';

/**
 * The brand is served as artwork, never redrawn.
 *
 * Every component here points at a crop of the one official logo file, so no
 * part of the identity is reconstructed in CSS or type.
 * `davixroom-logo-full-dark.png` is the authoritative original and is used
 * as-is wherever the full lockup appears; the rest are lossless crops of it at
 * native resolution.
 *
 * Anything placed directly on the page ground also carries `feather-edges`,
 * which fades its outer margin so the artwork's ambient field does not read as
 * a lighter panel against pure black. The `-padded` crops exist to give that
 * falloff empty margin to work in — it never reaches a pixel of the logo.
 */

type BrandImageProps = {
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly priority?: boolean;
};

/** The complete lockup: mark, wordmark, tagline, byline and floor glow. */
export const Lockup = ({ className, style, priority = false }: BrandImageProps) => (
  <Image
    src="/brand/davixroom-logo-full-dark.png"
    alt="DavixRoom — Live Development Workspace, by Davix Tech"
    width={1536}
    height={1024}
    priority={priority}
    className={`feather-edges ${className ?? ''}`}
    style={style}
  />
);

/** The DR mark alone — a monitor with a cursor in it. The brand's primitive. */
export const Mark = ({ className, style, priority = false }: BrandImageProps) => (
  <Image
    src="/brand/davixroom-mark.png"
    alt=""
    width={608}
    height={355}
    priority={priority}
    aria-hidden
    className={className}
    style={style}
  />
);

/** The DAVIXROOM wordmark alone. */
export const Wordmark = ({ className, style, priority = false }: BrandImageProps) => (
  <Image
    src="/brand/davixroom-wordmark.png"
    alt=""
    width={1329}
    height={139}
    priority={priority}
    aria-hidden
    className={className}
    style={style}
  />
);

/** Mark with margin to feather into, for placement directly on the page ground. */
export const MarkSoft = ({ className, style, priority = false }: BrandImageProps) => (
  <Image
    src="/brand/davixroom-mark-padded.png"
    alt=""
    width={728}
    height={475}
    priority={priority}
    aria-hidden
    className={`feather-edges ${className ?? ''}`}
    style={style}
  />
);

/** Wordmark with margin to feather into. */
export const WordmarkSoft = ({ className, style }: BrandImageProps) => (
  <Image
    src="/brand/davixroom-wordmark-padded.png"
    alt=""
    width={1534}
    height={229}
    aria-hidden
    className={`feather-edges ${className ?? ''}`}
    style={style}
  />
);

/**
 * Compact mark-plus-wordmark for headers and footers.
 *
 * The full lockup carries a tagline and byline that turn to mud below about
 * 200px wide, so navigation uses the two primary elements only. At this size
 * the tight crops are correct — their ambient edge is a few pixels wide and
 * invisible.
 */
export const BrandLockupSmall = ({ className }: BrandImageProps) => (
  <span className={`flex items-center gap-2.5 ${className ?? ''}`}>
    <Mark className="h-6 w-auto" priority />
    <Wordmark className="h-[13px] w-auto" priority />
    <span className="sr-only">DavixRoom</span>
  </span>
);
