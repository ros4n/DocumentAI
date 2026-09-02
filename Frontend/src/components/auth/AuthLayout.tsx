import type { ReactNode } from 'react'

interface AuthLayoutProps {
  title: string
  subtitle: string
  children: ReactNode
  footer?: ReactNode
}

export default function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
  return (
    <div className="flex min-h-[100dvh] flex-col justify-center px-7 py-12">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 grid size-16 place-items-center rounded-2xl border border-border bg-surface-raised shadow-sm">
          <img src="/icon.svg" alt="" className="h-8 w-8" />
        </div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-text-muted">{subtitle}</p>
      </div>

      <div className="flex flex-col gap-3">{children}</div>

      {footer && <p className="mt-6 text-center text-sm text-text-muted">{footer}</p>}
    </div>
  )
}
