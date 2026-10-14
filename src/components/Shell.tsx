import { useState, type ReactNode } from 'react'
import { useApp } from '../AppContext'
import { XP_BAR_SEGMENTS } from '../lib/constants'
import { isRevScreen, PROGRESS_SCREENS, type Screen } from '../lib/params'
import { levelFill } from '../lib/grades'
import { xpLevel } from '../lib/srs'
import { useGrade } from '../hooks/useGrade'
import { BottomNav } from './BottomNav'
import { Segments } from './Segments'

const SUBNAV: Array<[Screen, string]> = [['revision', 'AUJOURD’HUI'], ['plan', 'PLAN ANNUEL'], ['fiches', 'FICHES'], ['progression', 'PROGRESSION']]

const Sun = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" /></svg>
const Moon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" /></svg>

const Person = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" /></svg>

/** Compte sur téléphone (UX-4) : adresse en clair, accès admin, déconnexion. Les onglets sont masqués sous 760 px. */
function AccountPanel({ pieces, onClose }: { pieces: string; onClose(): void }) {
  const { ui, rev, isAdmin, go } = useApp()
  return (
    <div id="account-panel" className="account" role="region" aria-label="Mon compte">
      <span className="lbl">CONNECTÉ AVEC</span>
      <b className="account-mail">{rev.email}</b>
      <span className="lbl">{pieces}</span>
      <div className="row">
        {isAdmin && <button className="btn-mono" onClick={() => { onClose(); go('admin') }} aria-current={ui.screen === 'admin' ? 'page' : undefined}>ESPACE ADMIN</button>}
        <button className="btn-mono" onClick={() => { onClose(); rev.signOut() }}>SE DÉCONNECTER</button>
      </div>
    </div>
  )
}

export function Shell({ children }: { children: ReactNode }) {
  const { ui, rev, docs, isAdmin, mobile, go, toggleTheme } = useApp()
  const [accountOpen, setAccountOpen] = useState(false)
  const lvl = rev.status === 'ready' ? xpLevel(rev.prog.xp) : null
  const grade = useGrade(rev.userId, rev.prog, rev.status === 'ready')
  // PROGRESSION reste active sur Ligue et Badges (16-design §1) : la sous-navigation garde 4 puces.
  const subOf = (s: Screen): Screen => (PROGRESS_SCREENS.includes(s) ? 'progression' : s)
  const showSub = rev.status === 'ready' && SUBNAV.some(([s]) => s === subOf(ui.screen))
  const current = (on: boolean) => (on ? 'page' as const : undefined)
  const pieces = `${ui.seen.filter(id => docs.some(d => d.id === id)).length}/${docs.length} PIÈCES`
  // Sous 760 px, connecté : le bouton compte remplace le compteur de pièces (place de l'en-tête à 360 px).
  const account = mobile && !!rev.email
  return (
    <div className="has-bottom-nav">
      <header className="shell-h">
        <div className="brand">
          <span className="logo" aria-hidden="true">XXB</span>
          <span className="brand-name">XAM XAM BËY</span>
          {account
            ? <button className="icon-btn" onClick={() => setAccountOpen(o => !o)} aria-expanded={accountOpen} aria-controls="account-panel" aria-label={`Mon compte (${rev.email})`}><Person /></button>
            : <span className="who">{lvl && <>NIV. {lvl.lv}<br /></>}{pieces}</span>}
          <button className="icon-btn" onClick={toggleTheme} aria-label={ui.dark ? 'Passer en mode clair' : 'Passer en mode sombre'}>{ui.dark ? <Sun /> : <Moon />}</button>
        </div>
        {account && accountOpen && <AccountPanel pieces={pieces} onClose={() => setAccountOpen(false)} />}
        {lvl && (
          <div className="col g6">
            <div className="row mono xp-row" style={{ justifyContent: 'space-between', fontSize: '0.6875rem', fontWeight: 500, letterSpacing: '.06em' }}>
              <span style={{ color: 'var(--acc)' }}>NIV. {lvl.lv} · {grade.name.toUpperCase()}</span>
              <span className="muted">{lvl.xp} / {lvl.next} XP</span>
            </div>
            <Segments className="xp-bar" count={XP_BAR_SEGMENTS} on={levelFill(lvl.xp)} />
          </div>
        )}
        <nav className="tabs" aria-label="Navigation principale">
          <button className="tab" onClick={() => go('bibliotheque')} aria-current={current(ui.screen === 'bibliotheque')}>BIBLIOTHÈQUE</button>
          <button className="tab" onClick={() => go('revision', { session: null })} aria-current={current(isRevScreen(ui.screen))}>RÉVISION<span className="tag-resp">RESPONSABLES</span></button>
          {isAdmin && <button className="tab" style={{ maxWidth: 140 }} onClick={() => go('admin')} aria-current={current(ui.screen === 'admin')}>ADMIN</button>}
        </nav>
        {showSub && (
          <nav className="chips subnav" aria-label="Révision">
            {SUBNAV.map(([s, label]) => <button key={s} className="chip" onClick={() => go(s)} aria-current={current(subOf(ui.screen) === s)}>{label}</button>)}
            {rev.email && <button className="chip" style={{ marginLeft: 'auto' }} onClick={rev.signOut} title={`Connecté : ${rev.email}`}>SE DÉCONNECTER</button>}
          </nav>
        )}
      </header>
      <main>{children}</main>
      <footer className="foot">Plateforme de révision indépendante, construite sur les documents du dossier Xam Xam Bëy. Ce n’est pas un site officiel de l’association.</footer>
      <BottomNav />
    </div>
  )
}
