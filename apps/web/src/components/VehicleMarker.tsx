export type VehicleType = 'car' | 'truck' | 'motorcycle' | 'other' | 'trekker'

const VEHICLE_ICONS: Record<VehicleType, string> = {
  car: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M5 17h14M5 17a2 2 0 01-2-2V9a2 2 0 012-2h1l2-3h8l2 3h1a2 2 0 012 2v6a2 2 0 01-2 2M5 17v2m14-2v2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="7.5" cy="14.5" r="1.5" fill="currentColor"/><circle cx="16.5" cy="14.5" r="1.5" fill="currentColor"/></svg>`,
  truck: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M1 3h15v13H1zM16 8h4l3 3v5h-7V8z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>`,
  motorcycle: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M5 18a3 3 0 100-6 3 3 0 000 6zM19 18a3 3 0 100-6 3 3 0 000 6zM5 12l4-6h6l2 3M9 6l3 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  trekker: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="5" r="3" stroke="currentColor" stroke-width="2"/><path d="M12 10v4m0 0l-3 6m3-6l3 6M8 14h8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  other: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><rect x="3" y="6" width="18" height="12" rx="2" stroke="currentColor" stroke-width="2"/><circle cx="7.5" cy="18" r="1.5"/><circle cx="16.5" cy="18" r="1.5"/></svg>`,
}

const DISTINCT_COLORS = [
  '#6366f1',
  '#f59e0b',
  '#10b981',
  '#ef4444',
  '#8b5cf6',
  '#06b6d4',
  '#f97316',
  '#ec4899',
  '#14b8a6',
  '#3b82f6',
  '#eab308',
  '#84cc16',
  '#a855f7',
  '#22d3ee',
  '#fb923c',
]

const colorAssignments = new Map<string, string>()

export function getDistinctColor(vehicleId: string, existingColor?: string): string {
  if (colorAssignments.has(vehicleId)) return colorAssignments.get(vehicleId)!
  const usedColors = new Set(colorAssignments.values())
  if (existingColor && existingColor.trim() && !usedColors.has(existingColor)) {
    colorAssignments.set(vehicleId, existingColor)
    return existingColor
  }
  let chosen = DISTINCT_COLORS.find((c) => !usedColors.has(c))
  if (!chosen) {
    const idx = colorAssignments.size % DISTINCT_COLORS.length
    chosen = DISTINCT_COLORS[idx]
  }
  colorAssignments.set(vehicleId, chosen)
  return chosen
}

export function resetVehicleColors(): void {
  colorAssignments.clear()
}

export function createVehicleMarkerElement(
  type: VehicleType = 'car',
  color = '#6366f1',
): HTMLDivElement {
  const el = document.createElement('div')
  el.style.cssText = `
    width: 36px;
    height: 36px;
    background: ${color};
    border: 2px solid white;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    cursor: pointer;
  `
  el.innerHTML = VEHICLE_ICONS[type] || VEHICLE_ICONS.other
  return el
}

export function createHeadingArrow(heading: number): HTMLDivElement {
  const el = document.createElement('div')
  el.style.cssText = `
    position: absolute;
    top: -12px;
    left: 50%;
    transform: translateX(-50%) rotate(${heading}deg);
    width: 0;
    height: 0;
    border-left: 5px solid transparent;
    border-right: 5px solid transparent;
    border-bottom: 8px solid white;
    filter: drop-shadow(0 1px 2px rgba(0,0,0,0.3));
  `
  return el
}
