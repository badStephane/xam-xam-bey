import { useEffect } from 'react'
import { frameSrc, SECTIONS } from './frames'
import { StyleGuide } from './StyleGuide'

const SIZE = { mobile: { w: 390, h: 844 }, desktop: { w: 1100, h: 760 } }

export function Planches() {
  // La page est construite après le chargement : on rejoue l'ancre de l'URL (#s03b…).
  useEffect(() => {
    if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView()
  }, [])
  return (
    <>
      <nav className="toc" aria-label="Sections">
        <a href="#guide">GUIDE</a>
        {SECTIONS.map(s => <a key={s.n} href={`#s${s.n}`}>{s.n} {s.title.split(' · ')[0].toUpperCase()}</a>)}
      </nav>
      <div className="board">
        <header className="col" style={{ gap: 10, maxWidth: 980 }}>
          <span className="eyebrow">PLANCHES V2 · DIRECTION 4B · FICHES SUR CARTE</span>
          <h1 style={{ margin: 0, font: '700 72px/1 var(--f-hud)', letterSpacing: '.03em' }}>XAM XAM BËY</h1>
          <p style={{ margin: 0, fontSize: 19, color: 'var(--soft)', textWrap: 'pretty' }}>
            Les écrans en mobile (390 px) et ordinateur (1100 px), modes sombre et clair, avec les deux modes de questionnaire. Les maquettes chargent l’application réelle en mode démonstration : données d’exemple du dépôt, progression fictive, rien n’est enregistré. Application : <a href="index.html">index.html</a>.
          </p>
        </header>
        <StyleGuide />
        {SECTIONS.map(s => (
          <section key={s.n} id={`s${s.n}`} className="col" style={{ gap: 24 }}>
            <div className="sec-h"><span className="mono" style={{ fontSize: 14, fontWeight: 700, color: 'var(--acc)' }}>{s.n}</span><h2>{s.title}</h2><span style={{ fontSize: 17, color: 'var(--hud2)' }}>{s.desc}</span></div>
            <div className="frames">
              {s.frames.map(f => {
                const size = f.mobile ? SIZE.mobile : SIZE.desktop
                return (
                  <div key={f.label} className="frame">
                    <span>{f.label}</span>
                    <iframe className={f.mobile ? 'm' : 'd'} src={frameSrc(f)} title={`${s.title} · ${f.label}`} width={size.w} height={size.h} loading="lazy" />
                  </div>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </>
  )
}
