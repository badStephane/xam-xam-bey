const SWATCHES: Array<[string, string, string]> = [['Fond carte', '#0D1512', '#EEE8DA'], ['Texte carte', '#E4EDE6', '#151515'], ['Texte secondaire', '#93A79E', '#4F4B44'], ['Filet', '#2C4238', '#B9AF9B'], ['Accent action', '#C8F169', '#1D5A3F'], ['Ambre (hésitant)', '#F3AE45', '#8A5007'], ['Erreur (raté)', '#FF8B78', '#B32D17'], ['Fiche crème', '#F6F1E4', '#FBF8F0'], ['Vermillon tampon', '#C8341C', '#C8341C'], ['Vert cote', '#1D5A3F', '#1D5A3F']]
const ZONE_KEYS: Array<[string, number]> = [['01 OCT', 150], ['02 NOV', 55], ['03 DÉC', 200], ['04 JAN', 250], ['05 FÉV', 25], ['06 MAR', 125], ['07 AVR', 80], ['08 MAI', 180], ['09 JUIN', 225], ['10 JUIL', 65], ['11 AOÛT', 10], ['12 SEPT', 100]]
const SPACES = [4, 8, 12, 16, 20, 24, 32]
const RADII: Array<[string, number, string]> = [['carte 0', 0, 'var(--acc)'], ['fiche 8', 8, '#F6F1E4'], ['carte 14', 14, '#F6F1E4']]
const INK = '#151515'
const PAPER = '#FBF8F0'
const STAMP = '#C8341C'

function ThemeColumn({ theme, label }: { theme: 'dark' | 'light'; label: string }) {
  return (
    <div data-xt={theme} className="theme-col">
      <span className="mono" style={{ fontSize: 12, fontWeight: 500, letterSpacing: '.1em', color: 'var(--hud2)' }}>COMPOSANTS · {label}</span>
      <div className="col" style={{ gap: 8 }}><span className="k">BOUTONS</span>
        <div className="row">
          <span className="b" style={{ background: 'var(--acc)', color: 'var(--on-acc)' }}>ACTION PRINCIPALE</span>
          <span className="b" style={{ border: '1px solid var(--line)' }}>SECONDAIRE</span>
          <span className="b" style={{ background: INK, color: PAPER, font: '800 15px/1 var(--f-doc)', letterSpacing: 0 }}>Sur fiche</span>
        </div>
      </div>
      <div className="col" style={{ gap: 8 }}><span className="k">CHIPS · FILTRES · ZONES</span>
        <div className="row" style={{ gap: 6 }}>
          <span className="chip" style={{ background: 'var(--hud)', color: 'var(--bg)', borderColor: 'var(--hud)' }}>TOUS</span>
          <span className="chip">PDF</span><span className="chip">◆ ESSENTIELS</span>
          <span className="col" style={{ gap: 5, padding: '4px 6px', borderBottom: '2px solid var(--acc)' }}><span style={{ width: 12, height: 12, transform: 'rotate(45deg)', background: 'var(--acc)', boxShadow: '0 0 0 5px var(--acc-soft)' }} /><span className="t10" style={{ color: 'var(--acc)' }}>01 OCT</span></span>
          <span className="col" style={{ gap: 5, padding: '4px 6px' }}><span style={{ width: 12, height: 12, transform: 'rotate(45deg)', background: 'oklch(0.72 0.12 55)', border: '1.5px solid var(--hud)' }} /><span className="t10">02 NOV</span></span>
        </div>
      </div>
      <div className="col" style={{ gap: 8 }}><span className="k">BADGES ET TAMPONS</span>
        <div className="row sheet" style={{ padding: 12 }}>
          <span className="t10" style={{ color: STAMP }}>★ ESSENTIEL</span>
          <span className="t10" style={{ padding: '2px 4px', border: '1px solid #4F4B44', color: '#4F4B44' }}>SCAN</span>
          <span className="t10" style={{ color: '#1D5A3F' }}>✓ CONSULTÉE</span>
          <span className="stamp">DEUXIÈME CHANCE</span><span className="stamp">EN COURS</span>
        </div>
        <span className="mono" style={{ alignSelf: 'flex-start', fontSize: 9, fontWeight: 500, padding: '3px 4px', border: '1px solid var(--amber)', color: 'var(--amber)' }}>OUVERTE À TOUS</span>
      </div>
      <div className="col" style={{ gap: 8 }}><span className="k">LIGNE DE RESSOURCE · FICHE PERFORÉE</span>
        <div className="sheet col" style={{ padding: '12px 12px 12px 30px', gap: 6 }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', width: 9, height: 9, marginTop: -4, borderRadius: '50%', background: 'var(--hole)', border: '1.5px solid var(--card-bd)' }} />
          <div className="row" style={{ justifyContent: 'space-between' }}><span className="mono" style={{ fontSize: 11, fontWeight: 700, color: '#1D5A3F' }}>Z1·001</span><span className="t10" style={{ color: STAMP }}>★ ESSENTIEL</span></div>
          <span style={{ font: '800 17px/1.18 var(--f-doc)' }}>Bases du scoutisme</span>
          <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
            <span className="mono" style={{ fontSize: 10.5, color: '#4F4B44' }}><b style={{ color: STAMP }}>PDF</b> · 41 P. · 0,9 MO · BASES GÉNÉRALES</span>
            <span style={{ minHeight: 44, padding: '0 14px', display: 'grid', placeItems: 'center', background: INK, color: PAPER, font: '700 13px/1 var(--f-body)' }}>Ouvrir</span>
          </div>
        </div>
      </div>
      <div className="col" style={{ gap: 8 }}><span className="k">CARTE DE RÉVISION · QCM</span>
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', inset: '6px -5px -6px 5px', border: '1.5px solid var(--card-bd)', borderRadius: 14, background: 'var(--stack)' }} />
          <div style={{ position: 'relative', background: 'var(--card)', color: INK, border: '2px solid var(--card-bd)', borderRadius: 14, overflow: 'hidden' }}>
            <div className="row t10" style={{ background: STAMP, color: PAPER, padding: '8px 12px', justifyContent: 'space-between' }}><span>ZONE 01 · BASES ET HISTOIRE</span><span>T1-01</span></div>
            <div style={{ padding: 14, font: '800 20px/1.15 var(--f-doc)' }}>Quand et où est né Baden-Powell ?</div>
          </div>
        </div>
        <div className="col" style={{ gap: 6, paddingTop: 6 }}>
          {[['A', '8 janvier 1857, à Oxford', ''], ['✓', '22 février 1857, à Londres', 'ok'], ['✕', '22 février 1867, à Londres', 'ko']].map(([l, t, k]) => (
            <span key={t} className="row" style={{ gap: 10, padding: '8px 10px', background: 'var(--card)', color: INK, border: `2px solid ${k === 'ok' ? '#1D5A3F' : k === 'ko' ? STAMP : '#C9C0AE'}`, flexWrap: 'nowrap' }}>
              <b className="t10" style={{ width: 22, height: 22, display: 'grid', placeItems: 'center', background: k === 'ok' ? '#1D5A3F' : k === 'ko' ? STAMP : 'transparent', color: k ? PAPER : INK, border: k ? 'none' : `1.5px solid ${INK}` }}>{l}</b>{t}
            </span>
          ))}
        </div>
        <span style={{ fontSize: 12.5, color: 'var(--hud2)' }}>« Je réponds » : choisir, valider, correction automatique (bonne réponse en vert, erreur en vermillon). « J’interroge » : oral noté Faux, Partiel, Juste, bande de carte noire.</span>
      </div>
    </div>
  )
}

export function StyleGuide() {
  return (
    <section id="guide" className="col" style={{ gap: 28 }}>
      <h2 style={{ margin: 0, font: '700 40px/1 var(--f-hud)' }}>Guide de style</h2>
      <div className="row" style={{ gap: 40, alignItems: 'flex-start', flexWrap: 'nowrap' }}>
        <div className="col" style={{ width: 540, gap: 26 }}>
          <div className="col" style={{ gap: 10 }}><h3 className="h3">PRINCIPE</h3>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: 'var(--body)' }}>Deux couches. La <b>carte</b> (fond, en-tête, chiffres, navigation) adopte le mode sombre ou clair. Les <b>fiches</b> (documents, cartes de révision, fiches de lecture) restent crème dans les deux modes, pour une lecture confortable et une identité constante.</p>
          </div>
          <div className="col" style={{ gap: 10 }}><h3 className="h3">COULEURS · SOMBRE / CLAIR</h3>
            <div className="swatches">{SWATCHES.map(([name, dk, lt]) => (
              <div key={name} className="swatch">
                <div className="pair"><span style={{ background: dk }} /><span style={{ background: lt }} /></div>
                <div className="col" style={{ gap: 2, minWidth: 0 }}><strong style={{ fontSize: 13.5 }}>{name}</strong><span className="mono" style={{ fontSize: 10.5, color: 'var(--hud2)' }}>{dk} · {lt}</span></div>
              </div>
            ))}</div>
          </div>
          <div className="col" style={{ gap: 10 }}><h3 className="h3">REPÈRES DES 12 ZONES · OKLCH(0.72 0.12 H)</h3>
            <div className="zones">{ZONE_KEYS.map(([k, h]) => <div key={k}><i style={{ background: `oklch(0.72 0.12 ${h})` }} />{k}</div>)}</div>
          </div>
          <div className="col" style={{ gap: 10 }}><h3 className="h3">TYPOGRAPHIE</h3>
            <div className="col boxed" style={{ gap: 14 }}>
              <div><div style={{ font: '700 36px/1 var(--f-hud)', letterSpacing: '.04em' }}>CHAKRA PETCH</div><span className="lbl">Carte : titres d’écran, boutons d’action, chiffres · 42 / 26 / 17 / 14</span></div>
              <div><div style={{ font: '800 32px/1.05 var(--f-doc)' }}>Bricolage Grotesque</div><span className="lbl">Fiches : titres de document, questions · 32 / 24 / 17</span></div>
              <div><div style={{ font: '400 17px/1.55 var(--f-body)' }}>Instrument Sans, le corps de texte pour lire une fiche en camp.</div><span className="lbl">Corps · 15 à 17 px · interligne 1,55</span></div>
              <div><div style={{ font: '700 13px/1 var(--f-mono)', letterSpacing: '.06em' }}>Z1·001 · PDF · 41 P. · 0,9 MO</div><span className="lbl">JetBrains Mono · cotes, étiquettes, raccourcis · 10 à 13 px</span></div>
            </div>
          </div>
          <div className="col" style={{ gap: 10 }}><h3 className="h3">ESPACES · RAYONS · RÈGLES</h3>
            <div className="row boxed" style={{ gap: 14, alignItems: 'flex-end', flexWrap: 'nowrap' }}>
              {SPACES.map(n => <div key={n} className="col" style={{ alignItems: 'center', gap: 6 }}><span style={{ width: n, height: n, background: 'var(--acc)' }} /><span className="mono" style={{ fontSize: 10, fontWeight: 500 }}>{n}</span></div>)}
              <span style={{ width: 1, alignSelf: 'stretch', background: 'var(--line)' }} />
              {RADII.map(([l, r, c]) => <div key={l} className="col" style={{ alignItems: 'center', gap: 6 }}><span style={{ width: 40, height: 40, border: `1.5px solid ${c}`, borderRadius: r }} /><span className="mono" style={{ fontSize: 10, fontWeight: 500 }}>{l}</span></div>)}
            </div>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--soft)' }}>Angles vifs côté carte, coins arrondis côté fiches. Cibles de 44 px minimum. Pas d’ombres floues : une fiche empilée derrière la carte de révision. Transitions de 150 à 220 ms, coupées si « réduire les animations » est actif. Focus : anneau ambre de 2 px.</p>
          </div>
        </div>
        <div className="row" style={{ gap: 40, alignItems: 'flex-start', flexWrap: 'nowrap' }}>
          <ThemeColumn theme="dark" label="SOMBRE" />
          <ThemeColumn theme="light" label="CLAIR" />
        </div>
      </div>
    </section>
  )
}
