import { useState, useEffect, useRef, useCallback } from 'react'
import { searchPlaces, NominatimResult } from '../services/nominatim'
import type { SearchResult } from '../types'

interface SearchBarProps {
  onResultSelect: (result: SearchResult) => void
  onHoverResult?: (result: SearchResult | null) => void
  mapBounds?: [number, number, number, number]
}

export default function SearchBar({ onResultSelect, onHoverResult, mapBounds }: SearchBarProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<NominatimResult[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeIndex, setActiveIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const toSearchResult = useCallback((result: NominatimResult): SearchResult => {
    const boundingBox = result.boundingbox.map(Number) as [number, number, number, number]
    return {
      id: String(result.place_id),
      name: result.display_name.split(',')[0],
      displayName: result.display_name,
      lat: parseFloat(result.lat),
      lng: parseFloat(result.lon),
      boundingBox,
    }
  }, [])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
        setActiveIndex(-1)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
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
        setActiveIndex(-1)
      } catch {
        setError('Search failed. Please try again.')
        setResults([])
        setIsOpen(false)
      } finally {
        setIsLoading(false)
      }
    }, 300)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, mapBounds])

  function handleSelect(result: NominatimResult) {
    const sr = toSearchResult(result)
    onResultSelect(sr)
    setQuery(sr.name)
    setIsOpen(false)
    setActiveIndex(-1)
    onHoverResult?.(null)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!isOpen || results.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const next = activeIndex < results.length - 1 ? activeIndex + 1 : 0
      setActiveIndex(next)
      onHoverResult?.(toSearchResult(results[next]))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const prev = activeIndex > 0 ? activeIndex - 1 : results.length - 1
      setActiveIndex(prev)
      onHoverResult?.(toSearchResult(results[prev]))
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault()
      handleSelect(results[activeIndex])
    } else if (e.key === 'Escape') {
      setIsOpen(false)
      setActiveIndex(-1)
      onHoverResult?.(null)
    }
  }

  function handleItemHover(result: NominatimResult) {
    onHoverResult?.(toSearchResult(result))
  }

  function handleItemLeave() {
    onHoverResult?.(null)
  }

  return (
    <div className="relative w-full max-w-md">
      <div className="relative">
        <input
          ref={inputRef}
          id="search-places"
          name="search-places"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search for a place..."
          className="w-full px-4 py-2 pl-10 text-sm text-white placeholder-slate-500 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-transparent transition-colors"
          style={{
            background: 'rgba(7, 19, 32, 0.85)',
            backdropFilter: 'blur(24px)',
            border: '1px solid var(--border)',
          }}
          aria-label="Search places"
          aria-expanded={isOpen}
          aria-autocomplete="list"
          aria-controls="search-results"
          aria-activedescendant={activeIndex >= 0 ? `search-result-${activeIndex}` : undefined}
          role="combobox"
        />
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500"
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
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-400"></div>
          </div>
        )}
      </div>

      {error && (
        <div
          className="absolute z-10 w-full mt-1 rounded-xl p-3"
          style={{
            background: 'rgba(7, 19, 32, 0.85)',
            backdropFilter: 'blur(24px)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
          }}
        >
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {isOpen && results.length > 0 && (
        <div
          ref={dropdownRef}
          id="search-results"
          role="listbox"
          className="absolute z-10 w-full mt-1 rounded-xl max-h-60 overflow-auto"
          style={{
            background: 'rgba(7, 19, 32, 0.95)',
            backdropFilter: 'blur(40px)',
            border: '1px solid var(--border)',
          }}
        >
          {results.map((result, index) => (
            <button
              key={result.place_id}
              id={`search-result-${index}`}
              onClick={() => handleSelect(result)}
              onMouseEnter={() => handleItemHover(result)}
              onMouseLeave={handleItemLeave}
              role="option"
              aria-selected={activeIndex === index}
              className={`w-full px-4 py-3 text-left border-b last:border-b-0 focus:outline-none transition-colors ${
                activeIndex === index ? 'bg-indigo-500/15' : 'hover:bg-white/5'
              }`}
              style={{ borderColor: 'var(--border)' }}
            >
              <div className="text-sm font-medium text-white truncate">
                {result.display_name.split(',')[0]}
              </div>
              <div className="text-xs text-slate-400 truncate mt-0.5">{result.display_name}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
