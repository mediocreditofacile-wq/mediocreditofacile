import { useState, useMemo } from 'preact/hooks';
import {
  ECONOCOM_PA_DURATA_MESI,
  ECONOCOM_PA_IMPORTO_MIN,
  calcolaRataEconocomPA,
} from '../../data/econocom-pa';
import './simulatore-econocom-pa.css';

/**
 * Simulatore noleggio operativo Econocom per la Pubblica Amministrazione.
 *
 * Input: importo dell'investimento (parcheggi fotovoltaici, riqualificazione
 * energetica, illuminazione, ecc. da proporre a comuni, ASL, aziende ospedaliere
 * e municipalizzate fuori dal codice degli appalti).
 *
 * Output: rata mensile indicativa a 60 mesi (unica durata fornita da Econocom)
 * + canone complessivo di periodo + fascia coefficiente applicata.
 *
 * Niente istruttoria, niente riscatto, niente IVA: rata indicativa "alla cieca"
 * per dare al commerciale un numero da mostrare al sindaco / direttore aziendale
 * durante il primo incontro. Il preventivo definitivo arriva da Econocom su misura.
 */

const fmtEUR0 = (v: number) =>
  new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(v);

const fmtEUR2 = (v: number) =>
  new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);

export default function SimulatoreEconocomPA() {
  const [importoInput, setImportoInput] = useState('');

  const importo = useMemo(() => {
    const clean = importoInput.replace(/[^\d]/g, '');
    return clean ? parseInt(clean, 10) : 0;
  }, [importoInput]);

  const risultato = useMemo(() => calcolaRataEconocomPA(importo), [importo]);
  const sottoSoglia = importo > 0 && importo < ECONOCOM_PA_IMPORTO_MIN;

  const handleInput = (e: Event) => {
    const raw = (e.target as HTMLInputElement).value.replace(/[^\d]/g, '');
    // Cap di sicurezza a 99 milioni per evitare overflow visivi
    const num = raw ? Math.min(99_000_000, parseInt(raw, 10)) : 0;
    setImportoInput(num ? num.toString() : '');
  };

  // Formattazione live con separatori migliaia
  const importoFormatted = importo
    ? new Intl.NumberFormat('it-IT').format(importo)
    : '';

  return (
    <div class="sepa">
      <div class="sepa__panel">
        {/* === Colonna input === */}
        <div class="sepa__form">
          <p class="sepa__legend">Stima rata indicativa</p>

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
                onInput={handleInput}
              />
              <span class="sepa__input-suffix">€</span>
            </div>
            <p class="sepa__hint">
              Costo del bene o dell'opera (parcheggio fotovoltaico, riqualificazione,
              illuminazione, impiantistica). Importo minimo {fmtEUR0(ECONOCOM_PA_IMPORTO_MIN)}.
            </p>
          </div>

          <span class="sepa__duration-pill">Durata fissa {ECONOCOM_PA_DURATA_MESI} mesi</span>

          <p class="sepa__note">
            La condizione applicata dipende dalla fascia di investimento:
            piu' alto l'importo, migliore la condizione. Per durate superiori
            (72/84 mesi) o operazioni fuori range, Econocom valuta caso per caso.
          </p>
        </div>

        {/* === Colonna risultato === */}
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
            <span class="sepa__result-label">Stima Econocom — 60 mesi</span>

            <div>
              <p class="sepa__result-fascia">{risultato.fascia.label}</p>
              <p class="sepa__result-coeff">
                Coefficiente applicato: {risultato.fascia.coefficiente.toFixed(4).replace('.', ',')}
              </p>
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
              da Econocom dopo analisi dell'ente e del progetto. Importi netti IVA,
              senza spese istruttoria ne' valore di riscatto.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
