import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  Check,
  CircleAlert,
  CircleCheck,
  Copy,
  Info,
  Loader2,
  TriangleAlert,
  X,
} from 'lucide-react'
import { copyText } from '../lib/clipboard'
import { cx } from '../lib/format'
import type { ToastMessage, ToastKind } from '../types'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: ReactNode
  loading?: boolean
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  loading,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={cx('btn', `btn-${variant}`, `btn-${size}`, className)}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Loader2 className="spin" size={16} /> : icon}
      {children ? <span>{children}</span> : null}
    </button>
  )
}

export function IconButton({
  label,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode }) {
  return (
    <button className={cx('icon-btn', className)} aria-label={label} title={label} {...rest}>
      {children}
    </button>
  )
}

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'violet' | 'cyan'

export function Badge({
  children,
  tone = 'neutral',
  dot = false,
  className,
  title,
}: {
  children: ReactNode
  tone?: Tone
  dot?: boolean
  className?: string
  title?: string
}) {
  return (
    <span className={cx('badge', `badge-${tone}`, className)} title={title}>
      {dot ? <span className="badge-dot" /> : null}
      {children}
    </span>
  )
}

export function Card({
  children,
  className,
  as: Tag = 'section',
}: {
  children: ReactNode
  className?: string
  as?: 'section' | 'div' | 'article'
}) {
  return <Tag className={cx('card', className)}>{children}</Tag>
}

export function SectionCard({
  title,
  description,
  icon,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title: ReactNode
  description?: ReactNode
  icon?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <Card className={cx('section-card', className)}>
      <div className="section-head">
        <div className="section-head-main">
          {icon ? <div className="section-icon">{icon}</div> : null}
          <div>
            <h2>{title}</h2>
            {description ? <p>{description}</p> : null}
          </div>
        </div>
        {actions ? <div className="section-actions">{actions}</div> : null}
      </div>
      <div className={cx('section-body', bodyClassName)}>{children}</div>
    </Card>
  )
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'neutral',
  onClick,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  icon: ReactNode
  tone?: Tone
  onClick?: () => void
}) {
  const content = (
    <>
      <div className={cx('stat-icon', `stat-icon-${tone}`)}>{icon}</div>
      <div className="stat-copy">
        <span className="stat-label">{label}</span>
        <strong className="stat-value">{value}</strong>
        {hint ? <span className="stat-hint">{hint}</span> : null}
      </div>
    </>
  )
  if (onClick) {
    return (
      <button className="stat-card stat-card-button" onClick={onClick} type="button">
        {content}
      </button>
    )
  }
  return <div className="stat-card">{content}</div>
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
  danger,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: ReactNode
  description?: ReactNode
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <label className={cx('toggle-row', disabled && 'is-disabled', danger && 'is-danger')}>
      <span className="toggle-copy">
        <span className="toggle-label">{label}</span>
        {description ? <span className="toggle-description">{description}</span> : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className={cx('toggle', checked && 'is-on')}
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
      >
        <span className="toggle-thumb" />
      </button>
    </label>
  )
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  ariaLabel: string
}) {
  return (
    <div className="search-input">
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
      />
      {value ? (
        <button type="button" className="search-clear" onClick={() => onChange('')} aria-label="Clear search">
          <X size={14} />
        </button>
      ) : null}
    </div>
  )
}

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: ReactNode
  hint?: ReactNode
  error?: ReactNode
  children: ReactNode
  htmlFor?: string
}) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
      {action ? <div className="empty-action">{action}</div> : null}
    </div>
  )
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  closeLabel = 'Close dialog',
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  closeLabel?: string
}) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previous
    }
  }, [open, onClose])

  if (!open) return null
  return createPortal(
    <div className="modal-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className={cx('modal', `modal-${size}`)} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : closeLabel}>
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            {description ? <p>{description}</p> : null}
          </div>
          <IconButton label={closeLabel} onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-footer">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  )
}

export function ScoreRing({ score, size = 92 }: { score: number; size?: number }) {
  const stroke = 7
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (Math.max(0, Math.min(100, score)) / 100) * circumference
  const tone = score >= 85 ? 'good' : score >= 65 ? 'warn' : 'bad'
  return (
    <div className={cx('score-ring', `score-${tone}`)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className="score-track" cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} />
        <circle
          className="score-value"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <div className="score-label">
        <strong>{score}</strong>
        <span>/ 100</span>
      </div>
    </div>
  )
}

export function StatusIcon({ status }: { status: 'pass' | 'warn' | 'fail' | 'info' }) {
  if (status === 'pass') return <CircleCheck size={17} className="status-pass" />
  if (status === 'warn') return <TriangleAlert size={17} className="status-warn" />
  if (status === 'fail') return <CircleAlert size={17} className="status-fail" />
  return <Info size={17} className="status-info" />
}

export function CopyButton({
  text,
  label = 'Copy',
  onCopied,
  size = 'sm',
}: {
  text: string
  label?: string
  onCopied?: (ok: boolean) => void
  size?: ButtonSize
}) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 1800)
    return () => window.clearTimeout(timer)
  }, [copied])
  return (
    <Button
      size={size}
      variant="secondary"
      icon={copied ? <Check size={15} /> : <Copy size={15} />}
      onClick={async () => {
        const ok = await copyText(text)
        setCopied(ok)
        onCopied?.(ok)
      }}
    >
      {copied ? 'Copied' : label}
    </Button>
  )
}

const toastIcons: Record<ToastKind, ReactNode> = {
  success: <CircleCheck size={18} />,
  error: <CircleAlert size={18} />,
  warning: <TriangleAlert size={18} />,
  info: <Info size={18} />,
}

export function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: ToastMessage[]
  onDismiss: (id: number) => void
}) {
  return createPortal(
    <div className="toast-stack" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={cx('toast', `toast-${toast.kind}`)}>
          <div className="toast-icon">{toastIcons[toast.kind]}</div>
          <div className="toast-copy">
            <strong>{toast.title}</strong>
            {toast.detail ? <span>{toast.detail}</span> : null}
          </div>
          <button className="toast-close" onClick={() => onDismiss(toast.id)} aria-label="Dismiss notification">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>,
    document.body,
  )
}

export function Spinner({ size = 18, label }: { size?: number; label?: string }) {
  return (
    <span className="spinner-wrap" role="status">
      <Loader2 size={size} className="spin" />
      {label ? <span>{label}</span> : null}
    </span>
  )
}
