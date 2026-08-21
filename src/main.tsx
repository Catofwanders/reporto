import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyPalette, readPalette } from './theme'

// Before the first render: the palette is a document-level attribute, and applying it
// inside a component would paint the default first and swap a frame later.
applyPalette(readPalette())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
