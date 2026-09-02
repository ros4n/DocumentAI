import { forwardRef } from 'react'
import type { InputHTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/utils'
import { Warning } from '../icons'

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  icon: ReactNode
  error?: string
  trailing?: ReactNode
}

const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, icon, error, trailing, id, className, ...props },
  ref
) {
  const fid = id ?? label.toLowerCase().replace(/\s+/g, '-')
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fid} className="text-xs font-medium text-text-muted">
        {label}
      </label>
      <div
        className={cn(
          'flex items-center gap-2 rounded-xl border bg-surface-raised px-3 transition-colors',
          error ? 'border-danger' : 'border-border focus-within:border-accent'
        )}
      >
        <span className="shrink-0 text-text-faint">{icon}</span>
        <input
          id={fid}
          ref={ref}
          className={cn(
            'h-11 flex-1 bg-transparent text-[15px] text-text outline-none placeholder:text-text-faint',
            className
          )}
          {...props}
        />
        {trailing}
      </div>
      {error && (
        <p role="alert" className="flex items-center gap-1 text-xs text-danger">
          <Warning size={13} weight="fill" />
          {error}
        </p>
      )}
    </div>
  )
})

export default Field
