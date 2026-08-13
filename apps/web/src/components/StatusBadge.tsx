type ConvoyStatus = 'not_started' | 'active' | 'paused' | 'ended'

const STATUS_STYLES: Record<ConvoyStatus, { bg: string; text: string }> = {
  not_started: { bg: 'var(--surface-hover)', text: 'var(--text2)' },
  active: { bg: 'var(--success-bg)', text: 'var(--success-text)' },
  paused: { bg: 'var(--warning-bg)', text: 'var(--warning-text)' },
  ended: { bg: 'var(--error-bg)', text: 'var(--error-text)' },
}

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status as ConvoyStatus] || {
    bg: 'var(--surface)',
    text: 'var(--text2)',
  }
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize"
      style={{ background: style.bg, color: style.text }}
    >
      {status}
    </span>
  )
}

export default StatusBadge
