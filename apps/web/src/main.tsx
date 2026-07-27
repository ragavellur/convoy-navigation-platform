import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import { flushPendingPositions } from './services/positionTracking'

window.addEventListener('online', () => {
  flushPendingPositions()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
