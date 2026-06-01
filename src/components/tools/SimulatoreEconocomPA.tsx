import { useState, useMemo } from 'preact/hooks';
import {
  ECONOCOM_PA_DURATA_MESI,
  ECONOCOM_PA_IMPORTO_MIN,
  calcolaRataEconocomPA,
} from '../../data/econocom-pa';
import { calcolaBilancioEnergetico } from '../../data/bp-fotovoltaico';
import './simulatore-econocom-pa.css';

/**
 * Simulatore noleggio operativo Econocom per la Pubblica Amministrazione.
 *
 * Caso d'uso: Gianfranco di Arca Energia parla con sindaci, direttori ASL,
 * dirigenti di municipalizzate. Vuole dare due numeri al volo:
 *   1) "Ecco la rata mensile indicativa Econocom per questo investimento."
 *   2) "E con la bolletta che state pagando + la vendita in rete, la rata
 *       si paga praticamente da sola."
 *
 * Per (1) usa i 4 coefficienti Econocom per fascia (60 mesi, min 150.000 €).
 * Per (2) attiva il business plan: stessa matematica del simulatore Arca
 * (modello autoconsumo dinamico, PVGIS, ritiro dedicato GSE 0,13 €/kWh)
 * estratta in `src/data/bp-fotovoltaico.ts` per condivisione.
 *
 * Niente leasing, niente agevolazioni 4.0, niente PDF brandizzato: per la PA
 * il preventivo formale lo costruisce Econocom su misura. Zona di
 * irraggiamento forzata a Sud (i clienti di Gianfranco sono giu').
 */

const fmtEUR0 = (v: number) =>
  new Intl.NumberFormat('it-IT', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
  }).format(v);

const fmtEUR2 = (v: number) =>
  new Intl.NumberFormat('it-IT', {
    style: 'currency', currency: 'EUR',
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(v);

const fmtKwh = (v: number) =>
  `${new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0 }).format(v)} kWh`;

const fmtPct = (v: number) =>
  `${(v * 100).toFixed(0)}%`;

// Zona di irraggiamento forzata a "sud": il caso d'uso di Gianfranco e' la PA
// del meridione (Brindisi, Grottaglie...). Se in futuro serve Nord/Centro,
// basta esporre una prop e aggiungere il selettore.
const ZONA_PA = 'sud';

// Profilo di consumo che ottimizza l'autoconsumo (load match 0,58 — ospedali,
// municipalizzate, strutture attive 24/7). Scelto come default ottimistico per
// il primo incontro: rappresenta il caso piu' favorevole tra i tre profili
// disponibili (autoconsumo a R=1 ~68%, contro 58% commerciale e 45% residenziale).
// Per profili reali piu' "diurni standard" o "serali" il risparmio cala del 15-25%.
const PROFILO_OTTIMIZZANTE = 'industriale';

export default function SimulatoreEconocomPA() {
  // === Input rata ===
  const [importoInput, setImportoInput] = useState('');

  // === Modalita' business plan ===
  const [modalitaBP, setModalitaBP] = useState(false);

  // === Input BP ===
  const [potenzaInput, setPotenzaInput] = useState('');
  const [accumuloInput, setAccumuloInput] = useState('');
  const [bollettaInput, setBollettaInput] = useState('');

  // === Parsing input ===
  const importo = useMemo(() => {
    const clean = importoInput.replace(/[^\d]/g, '');
    return clean ? parseInt(clean, 10) : 0;
  }, [importoInput]);

  const potenza = useMemo(() => {
    const clean = potenzaInput.replace(/[^\d.,]/g, '').replace(',', '.');
    const n = parseFloat(clean);
    return isFinite(n) && n > 0 ? n : 0;
  }, [potenzaInput]);

  const accumulo = useMemo(() => {
    const clean = accumuloInput.replace(/[^\d]/g, '');
    return clean ? parseInt(clean, 10) : 0;
  }, [accumuloInput]);

  const bolletta = useMemo(() => {
    const clean = bollettaInput.replace(/[^\d]/g, '');
    return clean ? parseInt(clean, 10) : 0;
  }, [bollettaInput]);

  // === Calcolo rata Econocom ===
  const risultato = useMemo(() => calcolaRataEconocomPA(importo), [importo]);
  const sottoSoglia = importo > 0 && importo < ECONOCOM_PA_IMPORTO_MIN;

  // === Calcolo bilancio energetico (solo se BP attivo) ===
  // Profilo fissato sul caso piu' favorevole (vedi PROFILO_OTTIMIZZANTE).
  const bilancio = useMemo(() => {
    if (!modalitaBP) return null;
    return calcolaBilancioEnergetico(potenza, accumulo, ZONA_PA, PROFILO_OTTIMIZZANTE, bolletta);
  }, [modalitaBP, potenza, accumulo, bolletta]);

  // === Conto economico dell'investimento (solo se ho sia rata che bilancio) ===
  // Logica PA: l'ente investe in un impianto sovra-dimensionato che genera DUE
  // ricavi (autoconsumo che azzera la bolletta + vendita dell'eccedenza al GSE)
  // a fronte della rata Econocom. Quello che conta e' la CASSA NETTA mensile e i
  // KPI di investimento, non il "risparmio vs bolletta" tipico delle PMI private.
  const investimento = useMemo(() => {
    if (!risultato || !bilancio) return null;
    const ricaviMensili = bilancio.risparmioAutoconsumoMensile + bilancio.valoreImmissioneMensile;
    const cassaNettaMensile = ricaviMensili - risultato.rataMensile;
    const cassaNettaAnnua = cassaNettaMensile * 12;
    const cassaCumulata60m = cassaNettaMensile * ECONOCOM_PA_DURATA_MESI;
    const ricaviAnnui = ricaviMensili * 12;
    // Payback dell'impianto: anni per cui i SOLI ricavi (senza considerare la rata)
    // ripagano il valore dell'investimento. KPI classico degli investimenti FV.
    const paybackAnni = ricaviAnnui > 0 ? importo / ricaviAnnui : Infinity;
    return {
      ricaviMensili,
      cassaNettaMensile,
      cassaNettaAnnua,
      cassaCumulata60m,
      ricaviAnnui,
      paybackAnni,
    };
  }, [risultato, bilancio, importo]);

  // === Handlers ===
  const handleImporto = (e: Event) => {
    const raw = (e.target as HTMLInputElement).value.replace(/[^\d]/g, '');
    const num = raw ? Math.min(99_000_000, parseInt(raw, 10)) : 0;
    setImportoInput(num ? num.toString() : '');
  };

  const handlePotenza = (e: Event) => {
    const raw = (e.target as HTMLInputElement).value.replace(/[^\d.,]/g, '');
    setPotenzaInput(raw);
  };

  const handleAccumulo = (e: Event) => {
    const raw = (e.target as HTMLInputElement).value.replace(/[^\d]/g, '');
    const num = raw ? Math.min(5000, parseInt(raw, 10)) : 0;
    setAccumuloInput(num ? num.toString() : '');
  };

  const handleBolletta = (e: Event) => {
    const raw = (e.target as HTMLInputElement).value.replace(/[^\d]/g, '');
    const num = raw ? Math.min(500_000, parseInt(raw, 10)) : 0;
    setBollettaInput(num ? num.toString() : '');
  };

  // === Formattazione live ===
  const importoFormatted = importo
    ? new Intl.NumberFormat('it-IT').format(importo)
    : '';
  const bollettaFormatted = bolletta
    ? new Intl.NumberFormat('it-IT').format(bolletta)
    : '';

  return (
    <div class="sepa">
      {/* === Riga 1: input principali === */}
      <div class="sepa__panel sepa__panel--inputs">
        <div class="sepa__form">
          <p class="sepa__legend">Stima rata indicativa Econocom</p>

          <div class="sepa__field">
            <label class="sepa__label" for="sepa-importo">
              Importo dell'investimento
            </label>
            <div class="sepa__input-wrap">
              <input
                id="sepa-importo"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                class={`sepa__input${sottoSoglia ? ' sepa__input--error' : ''}`}
                placeholder="es. 400.000"
                value={importoFormatted}
                onInput={handleImporto}
              />
              <span class="sepa__input-suffix">€</span>
            </div>
            <p class="sepa__hint">
              Costo del bene o dell'opera (parcheggio fotovoltaico,
              riqualificazione, illuminazione). Importo minimo {fmtEUR0(ECONOCOM_PA_IMPORTO_MIN)}.
              Zona di irraggiamento: Sud Italia. Durata fissa {ECONOCOM_PA_DURATA_MESI} mesi.
            </p>
          </div>

          {/* Toggle business plan */}
          <label class={`sepa__toggle ${modalitaBP ? 'sepa__toggle--active' : ''}`}>
            <input
              type="checkbox"
              checked={modalitaBP}
              onChange={() => setModalitaBP((v) => !v)}
            />
            <span class="sepa__toggle-switch" aria-hidden="true" />
            <div class="sepa__toggle-body">
              <strong class="sepa__toggle-title">Confronta con la bolletta dell'ente</strong>
              <span class="sepa__toggle-desc">
                {modalitaBP
                  ? 'Business plan attivo — compila potenza impianto e bolletta attuale qui sotto.'
                  : 'Attiva per dimostrare al sindaco / dirigente che la rata si paga con la bolletta risparmiata + la vendita in rete.'}
              </span>
            </div>
          </label>

          {/* Campi BP collassabili */}
          {modalitaBP && (
            <div class="sepa__bp-fields">
              <div class="sepa__bp-grid">
                <div class="sepa__field">
                  <label class="sepa__bp-label" for="sepa-potenza">
                    Potenza impianto (kWp)
                  </label>
                  <input
                    id="sepa-potenza"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    class="sepa__input sepa__input--small"
                    placeholder="es. 100"
                    value={potenzaInput}
                    onInput={handlePotenza}
                  />
                </div>

                <div class="sepa__field">
                  <label class="sepa__bp-label" for="sepa-bolletta">
                    Bolletta attuale (€/mese)
                  </label>
                  <input
                    id="sepa-bolletta"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    class="sepa__input sepa__input--small"
                    placeholder="es. 6.000"
                    value={bollettaFormatted}
                    onInput={handleBolletta}
                  />
                </div>

                <div class="sepa__field">
                  <label class="sepa__bp-label" for="sepa-accumulo">
                    Accumulo / Batteria (kWh)
                  </label>
                  <input
                    id="sepa-accumulo"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    class="sepa__input sepa__input--small"
                    placeholder="0 = senza batteria"
                    value={accumuloInput}
                    onInput={handleAccumulo}
                  />
                </div>
              </div>

              <p class="sepa__note sepa__note--bp">
                Il consumo annuo dell'ente viene stimato dalla bolletta mensile
                al prezzo medio di rete (0,28 €/kWh). La produzione usa l'irraggiamento
                medio del Sud Italia (1.425 kWh/kWp/anno, PVGIS). L'immissione in rete
                e' valorizzata a 0,13 €/kWh (ritiro dedicato GSE). Calcolo calibrato sul
                profilo di consumo che ottimizza l'autoconsumo (ente attivo 24/7 tipo
                ospedale o municipalizzata): per uffici comunali o presidi serali il
                risparmio reale e' inferiore del 15-25%.
              </p>
            </div>
          )}
        </div>

        {/* === Pannello rata Econocom (sempre visibile) === */}
        {!importo && (
          <div class="sepa__result sepa__result-empty">
            Inserisci l'importo dell'investimento per vedere la rata mensile indicativa.
          </div>
        )}

        {sottoSoglia && (
          <div class="sepa__result sepa__result-warning">
            <span class="sepa__result-label">Sotto soglia</span>
            <p class="sepa__result-fascia">
              Importo {fmtEUR0(importo)}: Econocom lavora con operazioni di Pubblica
              Amministrazione a partire da {fmtEUR0(ECONOCOM_PA_IMPORTO_MIN)}.
            </p>
            <p class="sepa__result-disclaimer">
              Per investimenti inferiori valuta noleggio operativo standard (Grenke)
              o leasing finanziario tramite Affida (Sella / Alba / Credem).
            </p>
          </div>
        )}

        {risultato && (
          <div class="sepa__result">
            <span class="sepa__result-label">
              Rata Econocom — {ECONOCOM_PA_DURATA_MESI} mesi
            </span>

            <div>
              <p class="sepa__result-fascia">{risultato.fascia.label}</p>
            </div>

            <div class="sepa__result-rata">
              <p class="sepa__result-rata-label">Rata mensile indicativa</p>
              <span class="sepa__result-rata-value">{fmtEUR2(risultato.rataMensile)}</span>
              <span class="sepa__result-rata-unit">/mese</span>
            </div>

            <div class="sepa__result-grid">
              <div class="sepa__result-cell">
                <p class="sepa__result-cell-label">Canone complessivo</p>
                <span class="sepa__result-cell-value">{fmtEUR0(risultato.canoneComplessivo)}</span>
              </div>
              <div class="sepa__result-cell">
                <p class="sepa__result-cell-label">Investimento</p>
                <span class="sepa__result-cell-value">{fmtEUR0(importo)}</span>
              </div>
            </div>

            <p class="sepa__result-disclaimer">
              Stima a titolo indicativo. Ogni operazione viene quotata su misura
              da Econocom dopo analisi dell'ente e del progetto.
            </p>
          </div>
        )}
      </div>

      {/* === Riga 2: conto economico investimento === */}
      {modalitaBP && risultato && bilancio && investimento && (
        <div class="sepa__bp-results">
          {/* Card: conto economico dell'investimento */}
          <div class={`sepa__bp-card sepa__bp-card--conto ${investimento.cassaNettaMensile >= 0 ? 'is-positive' : 'is-negative'}`}>
            <h3 class="sepa__bp-card-title">Conto economico dell'investimento</h3>
            <p class="sepa__bp-intro">
              L'ente non possiede l'impianto (e' un noleggio operativo Econocom)
              ma <strong>ne incassa i due ricavi</strong>: azzera o riduce la
              bolletta con l'autoconsumo e vende al GSE l'energia eccedente.
            </p>

            <div class="sepa__bp-row sepa__bp-row--green">
              <span>+ Ricavo da autoconsumo <em>(bolletta evitata)</em></span>
              <span class="sepa__bp-val">+{fmtEUR2(bilancio.risparmioAutoconsumoMensile)}<span class="sepa__bp-unit">/mese</span></span>
            </div>

            <div class="sepa__bp-row sepa__bp-row--green">
              <span>+ Ricavo da vendita in rete <em>(ritiro dedicato GSE)</em></span>
              <span class="sepa__bp-val">+{fmtEUR2(bilancio.valoreImmissioneMensile)}<span class="sepa__bp-unit">/mese</span></span>
            </div>

            <div class="sepa__bp-row sepa__bp-row--neutral">
              <span>= Ricavi totali per l'ente</span>
              <span class="sepa__bp-val">{fmtEUR2(investimento.ricaviMensili)}<span class="sepa__bp-unit">/mese</span></span>
            </div>

            <div class="sepa__bp-row sepa__bp-row--red">
              <span>− Rata Econocom (60 mesi)</span>
              <span class="sepa__bp-val">−{fmtEUR2(risultato.rataMensile)}<span class="sepa__bp-unit">/mese</span></span>
            </div>

            <div class="sepa__bp-saldo">
              <span class="sepa__bp-saldo-label">
                {investimento.cassaNettaMensile >= 0
                  ? 'Cassa netta generata mensilmente'
                  : 'Quota mensile a carico dell\'ente (rata > ricavi)'}
              </span>
              <span class="sepa__bp-saldo-value">
                {investimento.cassaNettaMensile >= 0 ? '+' : ''}{fmtEUR2(investimento.cassaNettaMensile)}<span class="sepa__bp-unit">/mese</span>
              </span>
            </div>

            {investimento.cassaNettaMensile >= 0 ? (
              <p class="sepa__bp-extra">
                Sui {ECONOCOM_PA_DURATA_MESI} mesi del contratto: cassa cumulata{' '}
                <strong>{fmtEUR0(investimento.cassaCumulata60m)}</strong>.
                Da fine contratto in poi, i ricavi continuano senza piu' la rata.
              </p>
            ) : (
              <p class="sepa__bp-extra sepa__bp-extra--warn">
                L'ente paga una quota residua durante i 60 mesi, comunque molto
                inferiore alla bolletta attuale ({fmtEUR0(bolletta)}/mese). A fine
                contratto i ricavi continuano senza piu' la rata.
              </p>
            )}
          </div>

          {/* Card: KPI di investimento */}
          <div class="sepa__bp-card sepa__bp-card--kpi">
            <h3 class="sepa__bp-card-title">Indicatori di investimento</h3>

            <div class="sepa__kpi-grid">
              <div class={`sepa__kpi-cell ${investimento.cassaNettaAnnua >= 0 ? 'is-positive' : 'is-negative'}`}>
                <span class="sepa__kpi-label">Cassa netta annua</span>
                <span class="sepa__kpi-value">{investimento.cassaNettaAnnua >= 0 ? '+' : ''}{fmtEUR0(investimento.cassaNettaAnnua)}</span>
                <span class="sepa__kpi-hint">
                  {investimento.cassaNettaAnnua >= 0 ? 'in entrata per l\'ente' : 'a carico dell\'ente'}
                </span>
              </div>

              <div class={`sepa__kpi-cell ${investimento.cassaCumulata60m >= 0 ? 'is-positive' : 'is-negative'}`}>
                <span class="sepa__kpi-label">Cassa cumulata 60 mesi</span>
                <span class="sepa__kpi-value">{investimento.cassaCumulata60m >= 0 ? '+' : ''}{fmtEUR0(investimento.cassaCumulata60m)}</span>
                <span class="sepa__kpi-hint">durata del contratto Econocom</span>
              </div>

              <div class="sepa__kpi-cell">
                <span class="sepa__kpi-label">Payback dell'impianto</span>
                <span class="sepa__kpi-value">
                  {isFinite(investimento.paybackAnni)
                    ? `${investimento.paybackAnni.toFixed(1)} anni`
                    : '—'}
                </span>
                <span class="sepa__kpi-hint">solo con i ricavi (no rata) — {fmtEUR0(investimento.ricaviAnnui)}/anno</span>
              </div>
            </div>

            <p class="sepa__bp-disclaimer">
              Cassa = ricavi (autoconsumo + immissione) − rata Econocom. Payback =
              valore impianto / ricavi annui, ignora la rata e indica in quanti anni
              l'impianto si ripaga puramente con l'energia che produce.
            </p>
          </div>

          {/* Card: produzione e autoconsumo */}
          <div class="sepa__bp-card sepa__bp-card--produzione">
            <h3 class="sepa__bp-card-title">Produzione e bilancio energetico</h3>

            <div class="sepa__bp-prod-grid">
              <div class="sepa__bp-prod-cell">
                <span class="sepa__bp-prod-label">Produzione annua</span>
                <span class="sepa__bp-prod-value">{fmtKwh(bilancio.produzioneAnnua)}</span>
                <span class="sepa__bp-prod-hint">{potenza.toLocaleString('it-IT')} kWp · Sud Italia</span>
              </div>

              <div class="sepa__bp-prod-cell">
                <span class="sepa__bp-prod-label">Consumo annuo stimato</span>
                <span class="sepa__bp-prod-value">{fmtKwh(bilancio.consumoAnnuo)}</span>
                <span class="sepa__bp-prod-hint">da bolletta {fmtEUR0(bolletta)}/mese</span>
              </div>

              <div class="sepa__bp-prod-cell">
                <span class="sepa__bp-prod-label">Autosufficienza</span>
                <span class="sepa__bp-prod-value">{fmtPct(bilancio.autosufficienzaPerc)}</span>
                <span class="sepa__bp-prod-hint">
                  {bilancio.autosufficienzaPerc >= 0.95
                    ? 'consumi azzerati'
                    : 'aumenta l\'accumulo per arrivare al 100%'}
                </span>
              </div>

              <div class="sepa__bp-prod-cell">
                <span class="sepa__bp-prod-label">Autoconsumo</span>
                <span class="sepa__bp-prod-value">{fmtPct(bilancio.autoconsumoPerc)}</span>
                <span class="sepa__bp-prod-hint">{fmtKwh(bilancio.kwhAutoconsumo)}/anno</span>
              </div>

              <div class="sepa__bp-prod-cell">
                <span class="sepa__bp-prod-label">Vendita in rete</span>
                <span class="sepa__bp-prod-value">{fmtKwh(bilancio.kwhImmissione)}</span>
                <span class="sepa__bp-prod-hint">{fmtEUR0(bilancio.valoreImmissioneMensile * 12)}/anno al GSE</span>
              </div>

              <div class="sepa__bp-prod-cell">
                <span class="sepa__bp-prod-label">Ricavi totali</span>
                <span class="sepa__bp-prod-value">{fmtEUR0(investimento.ricaviAnnui)}/anno</span>
                <span class="sepa__bp-prod-hint">autoconsumo + vendita</span>
              </div>
            </div>

            <p class="sepa__bp-disclaimer">
              Stime su irraggiamento PVGIS Sud Italia (1.425 kWh/kWp/anno), prezzo
              medio di rete 0,28 €/kWh, ritiro dedicato GSE 0,13 €/kWh. Per ottenere
              autosufficienza vicina al 100% serve un accumulo dimensionato sul
              consumo notturno dell'ente. Valori reali soggetti a orientamento,
              inclinazione, ombreggiamenti e profilo di consumo effettivo.
            </p>
          </div>
        </div>
      )}

      {modalitaBP && risultato && !bilancio && (
        <div class="sepa__bp-empty">
          Inserisci potenza impianto e bolletta dell'ente per vedere il conto economico dell'investimento.
        </div>
      )}
    </div>
  );
}
