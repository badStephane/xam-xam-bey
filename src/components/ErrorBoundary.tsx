import { Component, type ErrorInfo, type ReactNode } from 'react'
import { purgeableKeys } from '../lib/cache'
import { allKeys, removeKeys } from '../lib/storage'

interface Props { children: ReactNode }
interface State { failed: boolean }

/** Efface les caches du site (catalogue, pièces vues, thème), jamais la progression, puis recharge la bibliothèque. */
function purgeAndReload(): void {
  removeKeys(purgeableKeys(allKeys()))
  location.replace(`${location.origin}${location.pathname}`)
}

/**
 * Filet racine (FE-3, point 12) : une erreur de rendu affiche un écran de secours en français au lieu d'une page blanche.
 * Il ne dépend ni du contexte de l'application ni du réseau.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[xxb] Erreur d’affichage', error, info.componentStack)
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children
    return (
      <div id="app" data-xt="dark">
        <main>
          <div className="gate">
            <div className="stack">
              <div className="gate-card" role="alert">
                <div className="band" style={{ background: 'var(--stamp)' }}>PROBLÈME D’AFFICHAGE</div>
                <div className="gate-body">
                  <h1>Cette page n’a pas pu s’afficher</h1>
                  <p>Un problème est survenu sur cet appareil. Touchez « Recharger » : les données gardées par le site sont remises à zéro. Votre progression de révision est conservée.</p>
                  <button className="ink-btn big" style={{ minHeight: 50, padding: '0 20px' }} onClick={purgeAndReload}>Recharger</button>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    )
  }
}
