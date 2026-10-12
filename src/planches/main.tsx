import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Planches } from './Planches'
import '../styles/planches.css'

const root = document.getElementById('root')
if (!root) throw new Error('Élément #root introuvable')
createRoot(root).render(<StrictMode><Planches /></StrictMode>)
