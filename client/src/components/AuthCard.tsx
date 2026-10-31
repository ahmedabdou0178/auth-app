import type { ReactNode } from 'react';

interface AuthCardProps {
  title: string;
  description?: string;
  footer?: ReactNode;
  children: ReactNode;
}

/** Centered card used by every page; 360px wide screens keep a 16px gutter. */
export function AuthCard({ title, description, footer, children }: AuthCardProps) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-[26rem]">
        <section className="rounded-xl border border-line bg-white px-6 py-8 shadow-[0_1px_2px_rgb(24_33_47/0.06)] sm:px-8">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
          {description && <p className="mt-1.5 text-[15px] text-muted">{description}</p>}
          <div className="mt-7">{children}</div>
        </section>
        {footer && <p className="mt-5 text-center text-sm text-muted">{footer}</p>}
      </div>
    </main>
  );
}
