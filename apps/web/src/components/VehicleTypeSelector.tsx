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
              ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
              : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
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
