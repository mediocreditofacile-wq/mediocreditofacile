import { useState, useMemo } from 'preact/hooks';
import { ESG_COEFFS, ESG_DURATE, getEsgCoeff, esgPrezzoDaCanone } from '../../data/esg';
import { PIONEER_COEFFS, getPioneerCoeff, eur } from '../../data/grenke';
import './simulatore-portale.css';

// Simulatore in stile ReteRent per i portali partner (Expo Energia, Stilo):
// una o piu' tabelle coefficienti e doppio calcolo, dal prezzo di vendita ai
// canoni su tutte le durate e dal canone al prezzo.
// Le tabelle da mostrare arrivano dalla pagina con la prop `tabelle`.

export type Tabella = 'esg' | 'pioneer';

const PIONEER_DURATE = [24, 30, 36, 48, 60];

const TABELLE: Record<Tabella, { label: string; hint: string; min: number; max: number; durate: number[] }> = {
  esg: {
    label: 'ESG — Fotovoltaico',
    hint: 'Impianti fotovoltaici e efficienza energetica. Canone mensile. Durate 72/84 mesi disponibili solo dalle fasce di importo alte.',
    min: 800,
    max: 240000,
    durate: ESG_DURATE,
  },
  pioneer: {
    label: 'Pioneer — Hardware e tecnologia',
    hint: 'Centralini telefonici, hardware di rete, casse automatiche, POS e software. Canone mensile con fatturazione trimestrale anticipata.',
    min: 500,
    max: 100000,
    durate: PIONEER_DURATE,
  },
};

interface Props {
  /** Tabelle coefficienti disponibili nel portale. Prima della lista = attiva all'apertura. */
  tabelle?: Tabella[];
  /** Ragione sociale del partner, mostrata in fondo alla stampa per il cliente */
  partner?: string;
  /** Etichetta del bene nella stampa (es. "Impianto fotovoltaico") per tabella */
  etichetteBene?: Partial<Record<Tabella, string>>;
}

// Coefficiente per la tabella attiva
function getCoeff(tabella: Tabella, importo: number, durata: number): number | null {
  return tabella === 'esg' ? getEsgCoeff(importo, durata) : getPioneerCoeff(importo, durata);
}

// Inverso Pioneer: dal canone al prezzo, provando ogni fascia
function pioneerPrezzoDaCanone(canone: number, durata: number): number | null {
  const fasce = PIONEER_COEFFS[durata];
  if (!fasce || canone <= 0) return null;
  for (const f of fasce) {
    const prezzo = (canone / f.c) * 100;
    if (prezzo >= f.da && prezzo <= f.a) return prezzo;
  }
  return null;
}

export default function SimulatorePortale({
  tabelle = ['esg', 'pioneer'],
  partner = '',
  etichetteBene = {},
}: Props) {
  const disponibili = tabelle.length ? tabelle : (['esg', 'pioneer'] as Tabella[]);
  const [tabella, setTabella] = useState<Tabella>(disponibili[0]);

  // Simulazione dal prezzo
  const [prezzoInput, setPrezzoInput] = useState('');
  const [prezzoCalcolato, setPrezzoCalcolato] = useState(0);
  const [durataScelta, setDurataScelta] = useState<number | null>(null);

  // Simulazione dal canone
  const [canoneInput, setCanoneInput] = useState('');
  const [durataCanone, setDurataCanone] = useState(TABELLE[disponibili[0]].durate.includes(60) ? 60 : TABELLE[disponibili[0]].durate[0]);
  const [prezzoRicavato, setPrezzoRicavato] = useState<number | null>(null);
  const [canoneCalcolato, setCanoneCalcolato] = useState(0);

  const cfg = TABELLE[tabella];

  // Griglia canoni per tutte le durate della tabella attiva
  const canoni = useMemo(() => {
    if (prezzoCalcolato < cfg.min || prezzoCalcolato > cfg.max) return null;
    return cfg.durate.map((d) => {
      const c = getCoeff(tabella, prezzoCalcolato, d);
      return { durata: d, canone: c ? (prezzoCalcolato * c) / 100 : null };
    });
  }, [prezzoCalcolato, tabella]);

  const handleCambioTabella = (t: Tabella) => {
    setTabella(t);
    setPrezzoCalcolato(0);
    setDurataScelta(null);
    setPrezzoRicavato(null);
    setCanoneCalcolato(0);
    if (t === 'pioneer' && !PIONEER_DURATE.includes(durataCanone)) setDurataCanone(60);
  };

  const handleCalcolaCanoni = () => {
    const num = parseFloat(prezzoInput.replace(',', '.'));
    if (isNaN(num) || num <= 0) return;
    setPrezzoCalcolato(num);
    setDurataScelta(null);
    if (typeof window !== 'undefined' && (window as any).dataLayer) {
      (window as any).dataLayer.push({ event: 'calcolo_eseguito', tool: 'portale_partner', partner, tabella, valore: num });
    }
  };

  const handleCalcolaPrezzo = () => {
    const num = parseFloat(canoneInput.replace(',', '.'));
    if (isNaN(num) || num <= 0) return;
    setCanoneCalcolato(num);
    const prezzo = tabella === 'esg'
      ? esgPrezzoDaCanone(num, durataCanone)
      : pioneerPrezzoDaCanone(num, durataCanone);
    setPrezzoRicavato(prezzo);
  };

  const handleStampa = () => window.print();

  const fuoriFascia = prezzoCalcolato > 0 && (prezzoCalcolato < cfg.min || prezzoCalcolato > cfg.max);

  return (
    <div class="sp">
      {/* Scelta tabella coefficienti */}
      <div class="sp__panel">
        <div class="sp__panel-head">Parametri dell'offerta</div>
        <div class="sp__panel-body">
          <div class="sp__tabelle" hidden={disponibili.length < 2}>
            {disponibili.map((t) => (
              <button
                key={t}
                type="button"
                class={`sp__tabella-btn ${tabella === t ? 'sp__tabella-btn--active' : ''}`}
                onClick={() => handleCambioTabella(t)}
              >
                {TABELLE[t].label}
              </button>
            ))}
          </div>
          <p class="sp__hint">{cfg.hint} Importi da {eur(cfg.min)} a {eur(cfg.max)}, imponibili IVA.</p>
        </div>
      </div>

      <div class="sp__cols">
        {/* Simulazione a partire dal prezzo di vendita */}
        <div class="sp__panel">
          <div class="sp__panel-head">Simulazione a partire dal prezzo di vendita</div>
          <div class="sp__panel-body">
            <label class="sp__label" for="sp-prezzo">Prezzo di vendita (€)</label>
            <div class="sp__input-row">
              <input
                id="sp-prezzo"
                type="text"
                inputMode="decimal"
                class="sp__input"
                placeholder="25000"
                value={prezzoInput}
                onInput={(e) => setPrezzoInput((e.target as HTMLInputElement).value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCalcolaCanoni(); }}
              />
              <button type="button" class="sp__btn" onClick={handleCalcolaCanoni}>Calcola canone</button>
            </div>

            {fuoriFascia && (
              <p class="sp__warn">Importo fuori tabella: per questa tipologia il prezzo deve stare tra {eur(cfg.min)} e {eur(cfg.max)}. Per importi superiori contatta Mediocredito Facile.</p>
            )}

            {canoni && (
              <>
                <p class="sp__grid-title">Scegli il numero di canoni</p>
                <div class="sp__grid">
                  {canoni.map(({ durata, canone }) => (
                    <button
                      key={durata}
                      type="button"
                      class={`sp__cell ${durataScelta === durata ? 'sp__cell--active' : ''} ${canone === null ? 'sp__cell--na' : ''}`}
                      onClick={() => canone !== null && setDurataScelta(durata)}
                      disabled={canone === null}
                    >
                      <span class="sp__cell-durata">{durata} mesi</span>
                      <span class="sp__cell-canone">{canone !== null ? eur(canone) : 'n.d.'}</span>
                    </button>
                  ))}
                </div>
                <p class="sp__nota">Canone mensile indicativo, imponibile IVA, salvo delibera della società di noleggio.</p>
              </>
            )}
          </div>
        </div>

        {/* Simulazione a partire dal canone */}
        <div class="sp__panel">
          <div class="sp__panel-head">Simulazione a partire dal canone</div>
          <div class="sp__panel-body">
            <div class="sp__canone-row">
              <div class="sp__canone-field">
                <label class="sp__label" for="sp-canone">Canone mensile (€)</label>
                <input
                  id="sp-canone"
                  type="text"
                  inputMode="decimal"
                  class="sp__input"
                  placeholder="450"
                  value={canoneInput}
                  onInput={(e) => setCanoneInput((e.target as HTMLInputElement).value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCalcolaPrezzo(); }}
                />
              </div>
              <div class="sp__canone-field">
                <label class="sp__label" for="sp-durata">Numero di canoni</label>
                <select
                  id="sp-durata"
                  class="sp__select"
                  value={durataCanone}
                  onChange={(e) => setDurataCanone(parseInt((e.target as HTMLSelectElement).value, 10))}
                >
                  {cfg.durate.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>
            <button type="button" class="sp__btn sp__btn--full" onClick={handleCalcolaPrezzo}>Calcola prezzo di vendita</button>

            {canoneCalcolato > 0 && (
              prezzoRicavato !== null ? (
                <div class="sp__prezzo-card">
                  <span class="sp__cell-durata">Prezzo di vendita</span>
                  <span class="sp__prezzo-value">{eur(prezzoRicavato)}</span>
                </div>
              ) : (
                <p class="sp__warn">Nessun prezzo in tabella corrisponde a questo canone su {durataCanone} mesi. Prova a cambiare durata o importo.</p>
              )
            )}
          </div>
        </div>
      </div>

      {/* Stampa simulazione */}
      {canoni && (
        <div class="sp__actions">
          <button type="button" class="sp__btn sp__btn--ghost" onClick={handleStampa}>Stampa simulazione</button>
          <span class="sp__actions-hint">La stampa è pulita e senza riferimenti interni: puoi consegnarla al cliente.</span>
        </div>
      )}

      {/* Area stampa (visibile solo in stampa) */}
      {canoni && (
        <div class="sp__print">
          <div class="sp__print-head">
            <span class="sp__print-logo"><b>Medio</b>credito <em>Facile</em></span>
            <span class="sp__print-claim">L'OFFICINA DEL CREDITO</span>
          </div>
          <h2>Simulazione noleggio operativo</h2>
          <p>Bene: {etichetteBene[tabella] ?? (tabella === 'esg' ? 'Impianto fotovoltaico' : 'Hardware e tecnologia')} — Prezzo di vendita {eur(prezzoCalcolato)} (imponibile IVA)</p>
          <table>
            <thead><tr><th>Durata</th><th>Canone mensile</th></tr></thead>
            <tbody>
              {canoni.filter((c) => c.canone !== null).map(({ durata, canone }) => (
                <tr key={durata} class={durataScelta === durata ? 'sp__print-sel' : ''}>
                  <td>{durata} mesi</td>
                  <td>{eur(canone!)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p class="sp__print-note">
            Canoni mensili indicativi, imponibili IVA, salvo approvazione della società di noleggio.
            La proposta definitiva viene confermata dopo l'esame della documentazione del cliente.
          </p>
          <p class="sp__print-footer">
            Mediocredito Facile — mediocreditofacile.it — +39 393 995 7840{partner ? ` — in collaborazione con ${partner}` : ''}
          </p>
        </div>
      )}
    </div>
  );
}
