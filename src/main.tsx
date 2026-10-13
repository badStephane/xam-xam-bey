import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { AppProvider } from './AppContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import { registerServiceWorker } from './sw/register'
import './styles/fonts.css'
import './styles/app.css'

const root = document.getElementById('root')
if (!root) throw new Error('Élément #root introuvable')
createRoot(root).render(<StrictMode><ErrorBoundary><AppProvider><App /></AppProvider></ErrorBoundary></StrictMode>)
// Hors ligne minimal (E3) : inscrit après le chargement de la page, en production seulement.
registerServiceWorker()
