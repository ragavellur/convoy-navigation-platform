import { useState, useEffect, useRef } from 'react'
import { searchPlaces, NominatimResult } from '../services/nominatim'
import type { SearchResult } from '../types'

interface SearchBarProps {
  onResultSelect: (result: SearchResult) => void
  mapBounds?: [number, number, number, number]
}

export default function SearchBar({ onResultSelect, mapBounds }: SearchBarProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<NominatimResult[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    if (query.length < 2) return

    debounceRef.current = setTimeout(async () => {
      setIsLoading(true)
      setError(null)
      try {
        const searchResults = await searchPlaces({
          query,
          limit: 6,
          viewbox: mapBounds,
          bounded: false,
        })
        setResults(searchResults)
        setIsOpen(searchResults.length > 0)
      } catch {
        setError('Search failed. Please try again.')
        setResults([])
        setIsOpen(false)
      } finally {
        setIsLoading(false)
      }
    }, 300)

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [query, mapBounds])

  function handleSelect(result: NominatimResult) {
    const boundingBox = result.boundingbox.map(Number) as [number, number, number, number]
    onResultSelect({
      id: String(result.place_id),
      name: result.display_name.split(',')[0],
      displayName: result.display_name,
      lat: parseFloat(result.lat),
      lng: parseFloat(result.lon),
      boundingBox,
    })
    setQuery(result.display_name.split(',')[0])
    setIsOpen(false)
  }

  return (
    <div className="relative w-full max-w-md">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          placeholder="Search for a place..."
          className="w-full px-4 py-2 pl-10 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white shadow-sm"
          aria-label="Search places"
          aria-expanded={isOpen}
          aria-autocomplete="list"
          aria-controls="search-results"
          role="combobox"
        />
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        {isLoading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-600"></div>
          </div>
        )}
      </div>

      {error && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-red-200 rounded-lg shadow-lg p-3">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {isOpen && results.length > 0 && (
        <div
          ref={dropdownRef}
          id="search-results"
          role="listbox"
          className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-auto"
        >
          {results.map((result) => (
            <button
              key={result.place_id}
              onClick={() => handleSelect(result)}
              role="option"
              aria-selected={false}
              className="w-full px-4 py-3 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0 focus:bg-gray-50 focus:outline-none"
            >
              <div className="text-sm font-medium text-gray-900 truncate">
                {result.display_name.split(',')[0]}
              </div>
              <div className="text-xs text-gray-500 truncate mt-0.5">{result.display_name}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
