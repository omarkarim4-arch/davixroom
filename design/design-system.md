# DavixRoom design system

The identity is emissive: light-blue artwork glowing out of true black. Dark is
not a mode here — it is the brand. Building a light theme and inverting it would
lose the thing that makes the logo work.

## Brand assets

All artwork lives in `public/brand/` and is served as images. **No part of the
identity is ever redrawn in CSS or type.**

| File | What it is | Used by |
| --- | --- | --- |
| `davixroom-logo-full-dark.png` | The authoritative original, untouched | `Lockup` — hero, intro finale |
| `davixroom-mark.png` | DR mark, tight crop | `Mark` — header, sign-in |
| `davixroom-wordmark.png` | DAVIXROOM wordmark, tight crop | `Wordmark` — header, footer |
| `davixroom-mark-padded.png` | DR mark with margin | `MarkSoft` — intro, CTA watermark |
| `davixroom-wordmark-padded.png` | Wordmark with margin | `WordmarkSoft` — intro |

Every derived file is a lossless crop of the original at native resolution.
`src/app/icon.png`, `apple-icon.png` and `opengraph-image.png` are generated from
the same source. Import them through `@/components/brand/logo`, never by path.

### The feather rule

The artwork sits in a faint blue-black ambient field (about `rgb(0,1,6)`), not on
pure black. A hard-edged crop on a `#000` page therefore reads as a slightly
lighter panel. Anything placed directly on the page ground carries the
`feather-edges` utility, which fades the outer margin to transparent so that
edge becomes the glow it was always meant to be.

Two consequences to respect:

- `feather-edges` masks the **element box**, so the image must fill its box
  exactly. Never combine it with `object-contain` or a height cap — letterboxing
  leaves the mask ramp in empty space and exposes the artwork's real edge. Cap
  size by constraining width (see the hero's `w-[min(88vw,760px,69dvh)]`).
- Images using it must keep artwork inside 6–94% horizontally and 11–89%
  vertically. That is what the `-padded` crops are for.

The falloff is CSS rather than baked into the files deliberately: encoding it as
PNG alpha produced images that decoded correctly but stalled Chrome's rasteriser,
rendering the logo invisible.

## Colour

Tokens are defined in `src/app/globals.css` under `@theme`.

| Token | Value | Role |
| --- | --- | --- |
| `void` | `#000000` | Page ground. Exactly black — the artwork depends on it. |
| `surface` | `#08090C` | Raised panels, cards |
| `raised` | `#0E1016` | Hover state for panels |
| `brand` | `#0A84FF` | Primary brand blue |
| `brand-bright` | `#3BA9FF` | Gradient top / highlight |
| `brand-deep` | `#0057D9` | Gradient bottom / shadow side |
| `glint` | `#9FDFFF` | Speculars, focus rings |
| `ink` | `#EDEFF2` | Primary text |
| `muted` | `#8A93A0` | Secondary text |
| `faint` | `#4A515C` | Tertiary, metadata |

Two gradients mirror the logo's own light logic, so accents inherit its light
source rather than a flat blue:

- `--gradient-mark` — bright left to deep right, as the DR mark runs. Primary
  buttons use this.
- `--gradient-wordmark` — light top to deep bottom, as the wordmark runs.
  Available as the `text-gradient-brand` utility for emphasis in headings.

Borders are `white/8` hairlines. Grids of cards are built as a `bg-white/8`
container with `gap-px`, so the dividing lines are the background showing
through rather than borders that double up.

## Type

No display face. The wordmark's custom terminals cannot be matched by any
webfont, and adding a lookalike would compete with the artwork rather than
support it. The brand's typographic signature is **tracking**, not a novelty
face — so that is what carries into the UI.

- **Body and headings** — Geist Sans. Headings run `tracking-tight` and
  `text-balance`.
- **Eyebrows and labels** — the `eyebrow` utility: 11px, `0.36em` tracking,
  uppercase, muted. This is the logo's tagline treatment, reused.
- **Technical metadata** — Geist Mono, uppercase, wide tracking. Step indices,
  project status, security labels.

## Motion

Restrained. The page is a product surface, not a showcase.

- `dvx-rise` — sections lift 18px and fade as they enter, driven by
  `animation-timeline: view()`. The distance is small on purpose.
- The intro sequence — see below.
- `prefers-reduced-motion: reduce` disables both outright.

Avoid `backdrop-filter`. It buys almost nothing over a near-black page and forces
everything beneath it into its own compositing layer, which is how the hero logo
first went missing from rendered frames.

## The intro sequence

`src/components/landing/intro-sequence.tsx`, with beats in `globals.css`.

The viewport itself powers on like a screen — there is no literal television.
Beats run on absolute CSS `animation-delay`s from one shared t=0, so nothing
drives frames in JavaScript. `animation-fill-mode: both` holds each beat's start
state before its delay elapses, which is what keeps the screen genuinely black
at t=0.

| t | Beat |
| --- | --- |
| 0.00s | Black |
| 0.35s | CRT strike: a hairline of light blooms to fill the screen |
| 1.15s | The DR mark resolves out of overexposure |
| 1.90s | A cursor travels in and clicks the D |
| 3.05s | The wordmark wipes in beneath it |
| 3.75s | Crossfade to the official lockup; overlay retires |

Two details worth keeping:

- The cursor lands at 41.67%/29.3% of the artwork's frame — exactly where the
  logo's own cursor sits. The click and the finished mark agree on one point.
- The assembled parts are positioned as fractions of the lockup's own
  1536×1024 frame, so the final crossfade lands pixel-aligned instead of
  sliding into place.

It plays **once per session**, is dismissed by any input, and is decided before
first paint by a blocking inline script in `layout.tsx` that stamps
`data-intro="play|skip"` on `<html>`. Running that in an effect instead would
flash a black overlay on every navigation. The `<html>` element carries
`suppressHydrationWarning` for exactly this reason.

## Routing

`/` is the public landing page, and redirects signed-in callers to `/dashboard`.
It decides with `getAuthenticatedCaller` rather than `withCurrentUser`, so an
anonymous visit never touches the database.

Sign-in still redirects to `/`, which forwards on. That is deliberate: the
redirect lives in a server action, and server actions are backend surface.
