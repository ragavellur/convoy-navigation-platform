function ConvoyTypeBadge({ convoyType }: { convoyType?: string }) {
  const type = convoyType || 'vehicle'
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
      style={{
        background: type === 'trekker' ? 'var(--badge-trekker-bg)' : 'var(--badge-vehicle-bg)',
        color: type === 'trekker' ? 'var(--badge-trekker-text)' : 'var(--badge-vehicle-text)',
      }}
    >
      {type === 'trekker' ? '🥾 Trekker' : '🚗 Vehicle'}
    </span>
  )
}

export default ConvoyTypeBadge
