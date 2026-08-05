import { BrandLockupSmall } from '@/components/brand/logo';

export const SiteFooter = () => (
  <footer className="mx-auto w-full max-w-6xl px-6 py-14 sm:px-10">
    <div className="flex flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <BrandLockupSmall />
        <p className="eyebrow mt-4">Live Development Workspace</p>
      </div>

      <div className="text-faint flex flex-col gap-1 text-xs sm:items-end">
        <p>
          By{' '}
          <span className="text-brand tracking-[0.2em] uppercase">Davix Tech</span>
        </p>
        <p>© {new Date().getFullYear()} Davix Tech. All rights reserved.</p>
      </div>
    </div>
  </footer>
);
