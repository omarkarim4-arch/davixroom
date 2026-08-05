import { MarkSoft } from '@/components/brand/logo';
import { ActionLink } from '@/components/ui/action-link';

export const CtaBand = () => (
  <section className="relative overflow-hidden border-y border-white/8">
    {/* The mark as watermark: present, not shouting. */}
    <MarkSoft className="pointer-events-none absolute top-1/2 left-1/2 h-[150%] w-auto max-w-none -translate-x-1/2 -translate-y-1/2 opacity-[0.08]" />
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{
        background:
          'radial-gradient(ellipse at center, rgba(10,132,255,0.14), transparent 65%)',
      }}
    />

    <div className="relative mx-auto flex w-full max-w-6xl flex-col items-center gap-8 px-6 py-24 text-center sm:px-10 sm:py-32">
      <h2 className="max-w-2xl text-3xl leading-[1.15] font-semibold tracking-tight text-balance sm:text-[2.5rem]">
        Your work already has a history.{' '}
        <span className="text-gradient-brand">Give it somewhere to live.</span>
      </h2>
      <ActionLink href="/sign-in">Enter your room</ActionLink>
    </div>
  </section>
);
