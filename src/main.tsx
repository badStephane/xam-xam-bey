import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { AppProvider } from './AppContext'
import './styles/app.css'

const root = document.getElementById('root')
if (!root) throw new Error('Élément #root introuvable')
createRoot(root).render(<StrictMode><AppProvider><App /></AppProvider></StrictMode>)
