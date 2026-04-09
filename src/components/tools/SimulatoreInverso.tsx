import { useState, useMemo } from 'preact/hooks';
import { GRENKE_COEFFS, RISCATTI, DURATE_BASE, DURATE_FOTOVOLTAICO, eur } from '../../data/grenke';
import './simulatore-inverso.css';

// Calcolo inverso: dal canone mensile risale al valore massimo del bene.
// Il coefficiente Grenke dipende dalla fascia di importo, ma l'importo e' cio' che calcoliamo.
// Soluzione: iterare le fasce dalla piu' alta alla piu' bassa e verificare la coerenza.
function calcolaInverso(
  canoneMensile: number,
  durata: number,
  riscattoPerc: number | null,
) {
  // Recupera le fasce per la durata base (72/84 usano quelle di 60 con riduzione)
  const durataBase = durata === 72 || durata === 84 ? 60 : durata;
  const moltiplicatore = durata === 72 ? 0.88 : durata === 84 ? 0.79 : 1;
  const fasce = GRENKE_COEFFS[durataBase];
  if (!fasce) return null;

  // Itera dalla fascia piu' alta alla piu' bassa
  for (let i = fasce.length - 1; i >= 0; i--) {
    const coeff = fasce[i].c * moltiplicatore;
    const importo = (canoneMensile * 100) / coeff;

    if (importo >= fasce[i].da && importo <= fasce[i].a) {
      // Il valore calcolato cade dentro questa fascia: trovato
      const canoneVerifica = (importo * coeff) / 100;
      const canoneTrimestrale = canoneVerifica * 3;
      const valoreRiscatto = riscattoPerc != null ? (importo * riscattoPerc) / 100 : 0;
      const totaleContratto = canoneVerifica * durata + valoreRiscatto;

      return {
        importoMassimo: importo,
        canoneVerifica,
        canoneTrimestrale,
        valoreRiscatto,
        totaleContratto,
        riscattoPerc,
        coeff,
        fascia: fasce[i],
      };
    }
  }

  // Fallback: il canone e' troppo basso per le fasce alte, prova con la fascia minima
  const coeffMin = fasce[0].c * moltiplicatore;
  const importoMin = (canoneMensile * 100) / coeffMin;

  if (importoMin < 500) return null; // Sotto il minimo noleggiabile

  const canoneVerifica = (importoMin * coeffMin) / 100;
  const canoneTrimestrale = canoneVerifica * 3;
  const valoreRiscatto = riscattoPerc != null ? (importoMin * riscattoPerc) / 100 : 0;
  const totaleContratto = canoneVerifica * durata + valoreRiscatto;

  return {
    importoMassimo: importoMin,
    canoneVerifica,
    canoneTrimestrale,
    valoreRiscatto,
    totaleContratto,
    riscattoPerc,
    coeff: coeffMin,
    fascia: fasce[0],
  };
}

export default function SimulatoreInverso() {
  const [tipologia, setTipologia] = useState('Altri Beni Strumentali');
  const [canone, setCanone] = useState(0);
  const [canoneInput, setCanoneInput] = useState('');
  const [durata, setDurata] = useState(36);
  const [calcolato, setCalcolato] = useState(false);

  // Durate disponibili in base alla tipologia
  const durateDisponibili = useMemo(() => {
    return tipologia === 'Fotovoltaico' ? DURATE_FOTOVOLTAICO : DURATE_BASE;
  }, [tipologia]);

  // Se la durata selezionata non e' disponibile, resetta a 36
  useMemo(() => {
    if (!durateDisponibili.includes(durata)) {
      setDurata(36);
    }
  }, [durateDisponibili]);

  // Percentuale di riscatto per tipologia e durata
  const riscattoPerc = RISCATTI[tipologia]?.[durata] ?? null;

  // Tipologia Software non prevista
  const isSoftware = tipologia === 'Software Gestionali / CAD';
  const isNonDisponibile = riscattoPerc === null;

  // Calcolo risultati (solo dopo click su "Calcola")
  const risultati = useMemo(() => {
    if (!calcolato || isSoftware || isNonDisponibile || canone < 10) return null;
    return calcolaInverso(canone, durata, riscattoPerc);
  }, [calcolato, canone, durata, riscattoPerc, isSoftware, isNonDisponibile]);

  // Gestione input canone con validazione
  const handleCanoneChange = (e: Event) => {
    const raw = (e.target as HTMLInputElement).value.replace(/[^\d]/g, '');
    setCanoneInput(raw);
    setCalcolato(false);
    const num = parseInt(raw, 10);
    if (!isNaN(num)) {
      setCanone(Math.min(15000, Math.max(0, num)));
    }
  };

  const handleCanoneBlur = () => {
    if (canone > 0) {
      const clamped = Math.min(15000, Math.max(50, canone));
      setCanone(clamped);
      setCanoneInput(clamped.toString());
    }
  };

  // Evento GTM per tracciamento
  const pushCalcolo = () => {
    if (typeof window !== 'undefined' && (window as any).dataLayer) {
      (window as any).dataLayer.push({
        event: 'calcolo_eseguito',
        tool: 'simulatore_inverso',
        tipologia,
        canone_desiderato: canone,
        durata,
        importo_massimo: risultati?.importoMassimo,
      });
    }
  };

  // Click su "Calcola"
  const handleCalcola = () => {
    if (canone > 0) {
      const clamped = Math.min(15000, Math.max(50, canone));
      setCanone(clamped);
      setCanoneInput(clamped.toString());
    }
    setCalcolato(true);
    pushCalcolo();
  };

  return (
    <div class="sim-inv">
      {/* --- FORM INPUT --- */}
      <div class="sim-inv__form">
        {/* Tipologia bene */}
        <div class="sim-inv__field">
          <label class="sim-inv__label" for="inv-tipologia">Tipologia bene</label>
          <select
            id="inv-tipologia"
            class="sim-inv__select"
            value={tipologia}
            onChange={(e) => { setTipologia((e.target as HTMLSelectElement).value); setCalcolato(false); }}
          >
            {Object.keys(RISCATTI).map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        {/* Canone mensile desiderato */}
        <div class="sim-inv__field">
          <label class="sim-inv__label" for="inv-canone">Canone mensile desiderato (€)</label>
          <input
            id="inv-canone"
            type="text"
            inputMode="numeric"
            class="sim-inv__input"
            value={canoneInput}
            onInput={handleCanoneChange}
            onBlur={handleCanoneBlur}
            placeholder="500"
          />
          <span class="sim-inv__hint">Min €50 — Max €15.000</span>
        </div>

        {/* Durata */}
        <div class="sim-inv__field">
          <label class="sim-inv__label" for="inv-durata">Durata contratto</label>
          <select
            id="inv-durata"
            class="sim-inv__select"
            value={durata}
            onChange={(e) => { setDurata(parseInt((e.target as HTMLSelectElement).value, 10)); setCalcolato(false); }}
          >
            {durateDisponibili.map((d) => (
              <option key={d} value={d}>{d} mesi</option>
            ))}
          </select>
        </div>

        {/* Riscatto (read-only) */}
        <div class="sim-inv__field">
          <label class="sim-inv__label">Riscatto finale</label>
          <div class="sim-inv__readonly">
            {isSoftware
              ? 'Non previsto per Software'
              : isNonDisponibile
                ? 'Non disponibile per questa combinazione'
                : `${riscattoPerc}%`}
          </div>
        </div>

        {/* Bottone Calcola */}
        <button
          type="button"
          class="sim-inv__button"
          onClick={handleCalcola}
          disabled={isSoftware || canone < 1}
        >
          Calcola importo massimo
        </button>
      </div>

      {/* --- RISULTATI --- */}
      <div class="sim-inv__results">
        {isSoftware ? (
          <div class="sim-inv__message">
            <span class="material-icons-outlined sim-inv__message-icon">info</span>
            <p>Il noleggio operativo per <strong>Software Gestionali / CAD</strong> richiede
            una valutazione personalizzata. Contattaci per un preventivo dedicato.</p>
          </div>
        ) : isNonDisponibile ? (
          <div class="sim-inv__message">
            <span class="material-icons-outlined sim-inv__message-icon">warning</span>
            <p>La combinazione <strong>{tipologia}</strong> con durata <strong>{durata} mesi</strong> non
            è disponibile. Prova a cambiare la durata.</p>
          </div>
        ) : risultati ? (
          <>
            <h3 class="sim-inv__results-title">Il tuo risultato</h3>

            <div class="sim-inv__result-card sim-inv__result-card--main">
              <span class="sim-inv__result-label">Valore massimo del bene</span>
              <span class="sim-inv__result-value">{eur(risultati.importoMassimo)}</span>
            </div>

            <div class="sim-inv__result-card">
              <span class="sim-inv__result-label">Canone mensile confermato</span>
              <span class="sim-inv__result-value">{eur(risultati.canoneVerifica)}</span>
            </div>

            <div class="sim-inv__result-card">
              <span class="sim-inv__result-label">Canone trimestrale anticipato</span>
              <span class="sim-inv__result-value">{eur(risultati.canoneTrimestrale)}</span>
            </div>

            {risultati.riscattoPerc != null && (
              <div class="sim-inv__result-card">
                <span class="sim-inv__result-label">Riscatto finale ({risultati.riscattoPerc}%)</span>
                <span class="sim-inv__result-value">{eur(risultati.valoreRiscatto)}</span>
              </div>
            )}

            <div class="sim-inv__risparmio">
              <span class="material-icons-outlined sim-inv__risparmio-icon">savings</span>
              <p>Con un budget di <strong>{eur(canone)}/mese</strong> puoi noleggiare
              beni fino a <strong>{eur(risultati.importoMassimo)}</strong> di valore.</p>
            </div>

            <div class="sim-inv__note">
              <p>Fascia Grenke applicata: {eur(risultati.fascia.da)} — {eur(risultati.fascia.a)}</p>
              <p>* Pagamento standard: trimestrale anticipato. Canone mensile disponibile
              sopra €12.000/mese con maggiorazione +5%.</p>
              <p>* Assicurazione obbligatoria non inclusa nei coefficienti indicati.</p>
              <p>* Coefficienti Grenke Italia SpA — Rete Rent (tabella Sputnik++++).</p>
              {(durata === 72 || durata === 84) && (
                <p>* Per durate di {durata} mesi i coefficienti sono stimati. Richiedi un preventivo
                personalizzato per l'importo esatto.</p>
              )}
            </div>
          </>
        ) : calcolato && canone < 50 ? (
          <div class="sim-inv__message">
            <span class="material-icons-outlined sim-inv__message-icon">warning</span>
            <p>Il canone inserito è troppo basso per calcolare un importo noleggiabile.
            Il minimo è circa €50/mese.</p>
          </div>
        ) : calcolato && !risultati ? (
          <div class="sim-inv__message">
            <span class="material-icons-outlined sim-inv__message-icon">warning</span>
            <p>Non è stato possibile calcolare un importo per questo canone e questa durata.
            Prova ad aumentare il canone o a modificare la durata.</p>
          </div>
        ) : (
          <div class="sim-inv__message">
            <span class="material-icons-outlined sim-inv__message-icon">edit</span>
            <p>Inserisci il canone mensile desiderato e premi <strong>Calcola importo massimo</strong> per scoprire
            quanto puoi noleggiare.</p>
          </div>
        )}
      </div>
    </div>
  );
}
