interface VehicleTypeSelectorProps {
  selected: string
  onSelect: (type: string) => void
}

const VEHICLE_TYPES = [
  { value: 'car', label: 'Car', icon: '🚗' },
  { value: 'truck', label: 'Truck', icon: '🚛' },
  { value: 'motorcycle', label: 'Motorcycle', icon: '🏍️' },
  { value: 'other', label: 'Other', icon: '🚐' },
]

function VehicleTypeSelector({ selected, onSelect }: VehicleTypeSelectorProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {VEHICLE_TYPES.map((vehicle) => (
        <button
          key={vehicle.value}
          onClick={() => onSelect(vehicle.value)}
          className={`flex items-center p-3 border rounded-lg text-sm font-medium transition-colors ${
            selected === vehicle.value
              ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]'
              : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-hover)]'
          }`}
        >
          <span className="text-xl mr-2">{vehicle.icon}</span>
          {vehicle.label}
        </button>
      ))}
    </div>
  )
}

export default VehicleTypeSelector
