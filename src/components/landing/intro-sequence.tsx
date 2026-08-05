'use client';

import { useEffect, useState } from 'react';
import { Lockup, MarkSoft, WordmarkSoft } from '@/components/brand/logo';

/**
 * The landing intro: the viewport itself powers on like a screen, the DR mark
 * resolves, a cursor clicks it, and the official lockup assembles.
 *
 * Beats are pure CSS with absolute delays from a shared t=0 (see globals.css),
 * so nothing here drives frames — this component only decides whether to play
 * at all and how to get out of the way early.
 *
 * The mark and wordmark are positioned at the exact fractions they occupy
 * inside the full lockup, which makes the final crossfade land pixel-aligned
 * rather than sliding into place.
 */

/**
 * Positions as fractions of the lockup artwork's own 1536x1024 frame, so the
 * assembled parts sit exactly where the finished lockup will draw them and the
 * final crossfade lands pixel-aligned instead of sliding into place.
 */
const STAGE = {
  mark: { left: '26.24%', top: '10.94%', width: '47.4%' },
  wordmark: { left: '0.13%', top: '49.22%', width: '99.87%' },
  /* Where the logo's own cursor sits inside the artwork. The animated cursor
     lands here, so the click and the finished mark agree on one point. */
  click: { left: '41.67%', top: '29.3%' },
} as const;

const SEQUENCE_MS = 4850;

export const IntroSequence = () => {
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    if (document.documentElement.dataset.intro !== 'play') {
      // The inline head script already suppressed the overlay before the first
      // paint, so there is nothing to drive here and nothing to clean up.
      return;
    }

    const finish = () => setFinished(true);
    const timer = window.setTimeout(finish, SEQUENCE_MS);

    // Any deliberate input dismisses it. Keydown covers keyboard users, who
    // cannot reach the skip control: the overlay is hidden from assistive
    // technology, so nothing inside it is focusable.
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
    for (const event of events) {
      window.addEventListener(event, finish, { passive: true });
    }

    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    return () => {
      window.clearTimeout(timer);
      for (const event of events) {
        window.removeEventListener(event, finish);
      }
      document.body.style.overflow = overflow;
    };
  }, []);

  if (finished) {
    return null;
  }

  return (
    <div
      aria-hidden
      className="dvx-intro bg-void fixed inset-0 z-50 flex items-center justify-center overflow-hidden"
    >
      {/* Beat 2 — the strike: a hairline of light that blooms to fill the screen. */}
      <div
        className="dvx-strike pointer-events-none absolute inset-0 origin-center"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(190,225,255,0.85), rgba(10,132,255,0.25) 45%, transparent 75%)',
        }}
      />

      <div
        className="dvx-scanlines pointer-events-none absolute inset-0 opacity-0"
        style={{
          backgroundImage:
            'repeating-linear-gradient(to bottom, rgba(255,255,255,0.045) 0 1px, transparent 1px 3px)',
        }}
      />

      {/* The stage carries the lockup's aspect ratio so every child can be
          placed as a fraction of the artwork rather than a magic pixel value. */}
      {/* Width-constrained rather than height-capped, for the same reason as the
          hero: the parts are placed as percentages of this box, so the box must
          keep the artwork's aspect ratio exactly. */}
      <div className="relative aspect-[1536/1024] w-[min(92vw,900px,105dvh)]">
        <div className="dvx-parts-out absolute inset-0">
          <MarkSoft className="dvx-mark absolute h-auto" style={STAGE.mark} priority />
          <WordmarkSoft
            className="dvx-wordmark absolute h-auto"
            style={STAGE.wordmark}
          />
        </div>

        <Lockup className="dvx-lockup-in absolute inset-0 h-auto w-full" priority />

        <div
          className="dvx-shimmer rule-glow pointer-events-none absolute left-0 w-full origin-center"
          style={{ top: '52.4%' }}
        />

        {/* Beat 4 — cursor travel, then the click. */}
        <div
          className="dvx-cursor pointer-events-none absolute"
          style={STAGE.click}
        >
          <CursorArrow />
          <span className="dvx-ripple border-glint/70 absolute top-0 left-0 block h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full border" />
          <span className="dvx-ripple-late border-brand/60 absolute top-0 left-0 block h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full border" />
        </div>
      </div>

      {/* Cinematic finish: a vignette to keep attention centre-screen. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.85) 100%)',
        }}
      />

      <p className="dvx-skip eyebrow absolute right-6 bottom-6 sm:right-10 sm:bottom-10">
        Press any key to skip
      </p>
    </div>
  );
};

const CursorArrow = () => (
  <svg
    width="30"
    height="34"
    viewBox="0 0 15 21"
    fill="none"
    className="absolute top-0 left-0 drop-shadow-[0_0_10px_rgba(59,169,255,0.9)]"
  >
    <defs>
      <linearGradient id="dvx-cursor-fill" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#cfeaff" />
        <stop offset="55%" stopColor="#3ba9ff" />
        <stop offset="100%" stopColor="#0057d9" />
      </linearGradient>
    </defs>
    <path
      d="M0.5 0.5 L0.5 18.5 L5 14.2 L7.9 20.4 L10.6 19.1 L7.8 13.1 L13.4 12.7 Z"
      fill="url(#dvx-cursor-fill)"
      stroke="#eaf6ff"
      strokeWidth="0.7"
      strokeLinejoin="round"
    />
  </svg>
);
