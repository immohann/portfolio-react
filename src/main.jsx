import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// Note: no <StrictMode> wrapper on purpose. This app runs imperative Three.js /
// GSAP / anime.js setup in a single effect; StrictMode's double-invoke in dev
// would run that setup twice. If you add StrictMode later, make sure every
// effect below cleans up fully (they already do).
createRoot(document.getElementById('root')).render(<App />)
