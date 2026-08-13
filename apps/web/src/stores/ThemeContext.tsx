import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import type { StyleSpecification } from 'maplibre-gl'

export type Theme = 'light' | 'dark'

interface ThemeContextType {
  theme: Theme
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export type MapStyleName = 'carto-positron' | 'carto-dark-matter'

const CARTO_SUBDOMAINS = ['a', 'b', 'c', 'd']

function buildCartoTiles(dark: boolean): string[] {
  const base = dark ? 'dark_all' : 'light_all'
  return CARTO_SUBDOMAINS.map(
    (s) => `https://${s}.basemaps.cartocdn.com/${base}/{z}/{x}/{y}{ratio}.png`,
  )
}

const MAP_STYLES: Record<MapStyleName, StyleSpecification> = {
  'carto-positron': {
    version: 8,
    sources: {
      carto: {
        type: 'raster',
        tiles: buildCartoTiles(false),
        tileSize: 256,
        attribution: '© OpenStreetMap contributors © CARTO',
      },
    },
    layers: [
      {
        id: 'carto-bg',
        type: 'background',
        paint: { 'background-color': '#f8f4f0' },
      },
      {
        id: 'carto-tiles',
        type: 'raster',
        source: 'carto',
      },
    ],
  },
  'carto-dark-matter': {
    version: 8,
    sources: {
      carto: {
        type: 'raster',
        tiles: buildCartoTiles(true),
        tileSize: 256,
        attribution: '© OpenStreetMap contributors © CARTO',
      },
    },
    layers: [
      {
        id: 'carto-bg',
        type: 'background',
        paint: { 'background-color': '#0f1419' },
      },
      {
        id: 'carto-tiles',
        type: 'raster',
        source: 'carto',
      },
    ],
  },
}

const DARK_THEME_COLOR = '#071320'
const LIGHT_THEME_COLOR = '#e9edf4'

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}

export function getMapStyleUrl(theme: Theme): StyleSpecification {
  return MAP_STYLES[theme === 'dark' ? 'carto-dark-matter' : 'carto-positron']
}

function applyTheme(theme: Theme) {
  document.body.classList.toggle('light', theme === 'light')
  document.documentElement.classList.toggle('dark', theme === 'dark')
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) {
    meta.setAttribute('content', theme === 'dark' ? DARK_THEME_COLOR : LIGHT_THEME_COLOR)
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem('convoy_theme')
    if (stored === 'dark' || stored === 'light') return stored
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })

  useEffect(() => {
    localStorage.setItem('convoy_theme', theme)
    applyTheme(theme)
  }, [theme])

  const toggleTheme = () => setTheme((t) => (t === 'light' ? 'dark' : 'light'))

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>
}
