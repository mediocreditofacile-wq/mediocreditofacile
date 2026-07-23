import { useState, useMemo } from 'preact/hooks';
import { ESG_COEFFS, ESG_DURATE, getEsgCoeff, esgPrezzoDaCanone } from '../../data/esg';
import { PIONEER_COEFFS, getPioneerCoeff, eur } from '../../data/grenke';
import {
  BCC_DURATE, BCC_MIN, BCC_MAX, bccRata, bccPrezzoDaRata, bccSpeseIstruttoria,
  bccImpostaFinanziamento, BCC_TASSO_ZERO, bccTassoZeroRata, bccTassoZeroCostoFornitore,
  type ClasseRischioBcc, type ProdottoBcc,
} from '../../data/bcc';
import './simulatore-portale.css';

// Simulatore in stile ReteRent per i portali partner (Expo Energia, Stilo):
// una o piu' tabelle coefficienti e doppio calcolo, dal prezzo di vendita ai
// canoni su tutte le durate e dal canone al prezzo.
// Le tabelle da mostrare arrivano dalla pagina con la prop `tabelle`.
//
// Ogni tabella e' un canale di quotazione: 'esg' e 'pioneer' sono le tabelle
// Grenke (coefficiente per fascia e durata), 'bcc-lo' e' la locazione operativa
// BCC Rent&Lease, che quota anche per classe di rischio del bene.

export type Tabella = 'esg' | 'pioneer' | 'bcc-lo' | 'bcc-lf' | 'bcc-ff' | 'bcc-zero';

// Quale prodotto BCC sta dietro a ciascun canale
const PRODOTTO_BCC: Partial<Record<Tabella, ProdottoBcc>> = { 'bcc-lo': 'lo', 'bcc-lf': 'lf', 'bcc-ff': 'ff' };

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
  'bcc-lo': {
    label: 'BCC — Locazione operativa',
    hint: 'Noleggio puro: il canone e\' un costo pieno, riscatto finale 1%. Spese di incasso gia\' comprese nel canone, istruttoria una tantum a parte.',
    min: BCC_MIN,
    max: BCC_MAX,
    durate: BCC_DURATE,
  },
  'bcc-lf': {
    label: 'BCC — Locazione finanziaria (leasing)',
    hint: 'Leasing: a fine contratto il cliente riscatta il bene all\'1% e ne diventa proprietario. Conviene sugli importi alti.',
    min: BCC_MIN,
    max: BCC_MAX,
    durate: BCC_DURATE,
  },
  'bcc-zero': {
    label: `BCC — Tasso zero ${BCC_TASSO_ZERO.durata} mesi (campagna)`,
    hint: `Campagna a tasso zero: il cliente paga l'importo in ${BCC_TASSO_ZERO.durata} rate senza un euro di interessi. Il costo lo sostieni tu come fornitore, con un contributo sull'imponibile. Unica durata prevista dalla campagna.`,
    min: BCC_MIN,
    max: BCC_MAX,
    durate: [BCC_TASSO_ZERO.durata],
  },
  'bcc-ff': {
    label: 'BCC — Finanziamento finalizzato',
    hint: 'Il bene e\' subito di proprieta\' del cliente e si finanzia l\'acquisto: nessun riscatto finale. Oltre i 18 mesi si aggiunge l\'imposta sostitutiva del 2,5 per mille.',
    min: BCC_MIN,
    max: BCC_MAX,
    durate: BCC_DURATE,
  },
};

interface Props {
  /** Tabelle coefficienti disponibili nel portale. Prima della lista = attiva all'apertura. */
  tabelle?: Tabella[];
  /** Ragione sociale del partner, mostrata in fondo alla stampa per il cliente */
  partner?: string;
  /** Etichetta del bene nella stampa (es. "Impianto fotovoltaico") per tabella */
  etichetteBene?: Partial<Record<Tabella, string>>;
  /** Classe di rischio BCC del bene trattato dal partner (3 = telecomunicazioni) */
  classeBcc?: ClasseRischioBcc;
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
  classeBcc = 3,
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

  // Canone mensile per la tabella attiva
  const prodottoBcc = PRODOTTO_BCC[tabella];
  const tassoZero = tabella === 'bcc-zero';
  const canonePer = (importo: number, durata: number): number | null => {
    if (tassoZero) return bccTassoZeroRata(importo);
    if (prodottoBcc) return bccRata(prodottoBcc, importo, durata, classeBcc);
    const c = tabella === 'esg' ? getEsgCoeff(importo, durata) : getPioneerCoeff(importo, durata);
    return c ? (importo * c) / 100 : null;
  };

  // Griglia canoni per tutte le durate della tabella attiva
  const canoni = useMemo(() => {
    if (prezzoCalcolato < cfg.min || prezzoCalcolato > cfg.max) return null;
    return cfg.durate.map((d) => ({ durata: d, canone: canonePer(prezzoCalcolato, d) }));
  }, [prezzoCalcolato, tabella, classeBcc]);

  // Spese istruttoria una tantum: su BCC si pagano a parte, non sono nel canone
  const speseIstruttoria = prodottoBcc && !tassoZero && prezzoCalcolato > 0
    ? bccSpeseIstruttoria(prezzoCalcolato)
    : null;
  // Sul tasso zero il costo e' del fornitore: contributo sull'imponibile + istruttoria
  const costoFornitore = tassoZero && prezzoCalcolato > 0
    ? bccTassoZeroCostoFornitore(prezzoCalcolato)
    : null;
  // Sul finanziamento l'imposta dipende anche dalla durata: uso quella scelta, altrimenti la piu' lunga
  const imposta = prodottoBcc === 'ff' && prezzoCalcolato > 0
    ? bccImpostaFinanziamento(prezzoCalcolato, durataScelta ?? 60)
    : null;

  const handleCambioTabella = (t: Tabella) => {
    setTabella(t);
    setPrezzoCalcolato(0);
    setDurataScelta(null);
    setPrezzoRicavato(null);
    setCanoneCalcolato(0);
    // Se la durata scelta non esiste nel nuovo canale, torno alla piu' lunga disponibile
    const durate = TABELLE[t].durate;
    if (!durate.includes(durataCanone)) setDurataCanone(durate.includes(60) ? 60 : durate[durate.length - 1]);
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
    const prezzo = tassoZero
      ? num * BCC_TASSO_ZERO.durata
      : prodottoBcc
      ? bccPrezzoDaRata(prodottoBcc, num, durataCanone, classeBcc)
      : tabella === 'esg'
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
          <div class="sp__canale" hidden={disponibili.length < 2}>
            <label class="sp__label" for="sp-canale">Prodotto</label>
            <select
              id="sp-canale"
              class="sp__select sp__select--canale"
              value={tabella}
              onChange={(e) => handleCambioTabella((e.target as HTMLSelectElement).value as Tabella)}
            >
              {disponibili.map((t) => (
                <option key={t} value={t}>{TABELLE[t].label}</option>
              ))}
            </select>
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
                <p class="sp__nota">
                  Canone mensile indicativo, imponibile IVA, salvo delibera della società di noleggio.
                  {costoFornitore !== null && (
                    <> Il cliente non paga interessi: la campagna ti costa <strong>{eur(costoFornitore)}</strong>
                    {' '}({(BCC_TASSO_ZERO.contributoFornitore * 100).toLocaleString('it-IT')}% dell'imponibile
                    piu' {eur(BCC_TASSO_ZERO.speseIstruttoriaFornitore)} di istruttoria), trattenuti da BCC sul bonifico.</>
                  )}
                  {speseIstruttoria !== null && (
                    <> Su questo importo le spese di istruttoria sono <strong>{eur(speseIstruttoria)}</strong> una tantum,
                    a carico del cliente: non sono comprese nella rata.
                    {prodottoBcc === 'ff'
                      ? <> Il bene e' subito di proprieta' del cliente, nessun riscatto finale{imposta ? <>, piu' l'imposta sostitutiva di {eur(imposta)}</> : null}.</>
                      : <> Riscatto finale 1%.</>}
                    </>
                  )}
                </p>
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
            {tassoZero && 'Finanziamento a tasso zero: nessun interesse a carico del cliente. '}
            Canoni mensili indicativi, imponibili IVA, salvo approvazione della società di noleggio.
            {speseIstruttoria !== null && ` Spese di istruttoria ${eur(speseIstruttoria)} una tantum, non comprese nella rata.${prodottoBcc === 'ff' ? ` Nessun riscatto finale: il bene e' subito di proprieta'.${imposta ? ` Imposta sostitutiva ${eur(imposta)}.` : ''}` : ' Riscatto finale 1% del prezzo di vendita.'}`}
            {' '}La proposta definitiva viene confermata dopo l'esame della documentazione del cliente.
          </p>
          <p class="sp__print-footer">
            Mediocredito Facile — mediocreditofacile.it — +39 393 995 7840{partner ? ` — in collaborazione con ${partner}` : ''}
          </p>
        </div>
      )}
    </div>
  );
}
