import type { ReactNode } from 'react'
import { Loader2, ShieldAlert } from 'lucide-react'
import { Button, Modal } from './ui'

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  danger,
  onConfirm,
  onClose,
  children,
}: {
  open: boolean
  title: string
  description?: string
  confirmLabel: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onClose: () => void
  children?: ReactNode
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <span className="modal-footer-note" />
          <Button variant="ghost" onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="confirm-body">
        <span className={`confirm-icon ${danger ? 'is-danger' : ''}`}>
          <ShieldAlert size={24} />
        </span>
        <div>{children}</div>
      </div>
    </Modal>
  )
}

export function BusyOverlay({
  busy,
}: {
  busy: { title: string; detail?: string } | null
}) {
  if (!busy) return null
  return (
    <div className="busy-overlay" role="status" aria-live="polite">
      <div className="busy-card">
        <div className="busy-spinner">
          <Loader2 size={28} className="spin" />
        </div>
        <h3>{busy.title}</h3>
        {busy.detail ? <p>{busy.detail}</p> : null}
        <div className="busy-bar">
          <span />
        </div>
        <span className="busy-note">Everything happens locally in your browser.</span>
      </div>
    </div>
  )
}
