import { useState, useMemo } from 'preact/hooks';
import { RISCATTI, DURATE_BASE, DURATE_FOTOVOLTAICO, getAdjustedCoeff, getPioneerCoeff, eur } from '../../data/grenke';
import './simulatore-noleggio.css';

export default function SimulatoreNoleggio() {
  const [tipologia, setTipologia] = useState('Altri Beni Strumentali');
  const [valore, setValore] = useState(0);
  const [valoreInput, setValoreInput] = useState('');
  const [durata, setDurata] = useState(36);
  const [calcolato, setCalcolato] = useState(false);

  // Durate disponibili in base alla tipologia
  const durateDisponibili = useMemo(() => {
    return tipologia === 'Fotovoltaico' ? DURATE_FOTOVOLTAICO : DURATE_BASE;
  }, [tipologia]);

  // Se la durata selezionata non è disponibile, resetta a 36
  useMemo(() => {
    if (!durateDisponibili.includes(durata)) {
      setDurata(36);
    }
  }, [durateDisponibili]);

  // Percentuale di riscatto per tipologia e durata
  const riscattoPerc = RISCATTI[tipologia]?.[durata] ?? null;

  // Software usa coefficienti Pioneer (riscatto 0%, max €100.000)
  const isSoftware = tipologia === 'Software Gestionali / CAD';
  const isNonDisponibile = riscattoPerc === null;
  const valoreMax = isSoftware ? 100000 : 500000;

  // Calcolo risultati (solo dopo click su "Calcola")
  const risultati = useMemo(() => {
    if (!calcolato || isNonDisponibile || valore < 500 || valore > valoreMax) return null;

    // Software: usa tabella Pioneer++++. Tutto il resto: Sputnik++++.
    const coeff = isSoftware ? getPioneerCoeff(valore, durata) : getAdjustedCoeff(valore, durata);

    if (!coeff) return null;

    const canoneMensile = (valore * coeff) / 100;
    const canoneTrimestrale = canoneMensile * 3;
    const valoreRiscatto = (valore * (riscattoPerc ?? 0)) / 100;
    const totaleContratto = canoneMensile * durata + valoreRiscatto;

    return {
      canoneMensile,
      canoneTrimestrale,
      valoreRiscatto,
      totaleContratto,
      riscattoPerc: riscattoPerc ?? 0,
      coeff,
      risparmioLiquidita: valore,
    };
  }, [calcolato, valore, durata, tipologia, riscattoPerc, isSoftware, isNonDisponibile]);

  // Gestione input valore con validazione
  const handleValoreChange = (e: Event) => {
    const raw = (e.target as HTMLInputElement).value.replace(/[^\d]/g, '');
    setValoreInput(raw);
    setCalcolato(false);
    const num = parseInt(raw, 10);
    if (!isNaN(num)) {
      setValore(Math.min(500000, Math.max(0, num)));
    }
  };

  const handleValoreBlur = () => {
    if (valore > 0) {
      const clamped = Math.min(valoreMax, Math.max(500, valore));
      setValore(clamped);
      setValoreInput(clamped.toString());
    }
  };

  // Evento GTM per tracciamento
  const pushCalcolo = () => {
    if (typeof window !== 'undefined' && (window as any).dataLayer) {
      (window as any).dataLayer.push({
        event: 'calcolo_eseguito',
        tool: 'simulatore_noleggio',
        tipologia,
        valore,
        durata,
        canone_mensile: risultati?.canoneMensile,
      });
    }
  };

  // Click su "Calcola"
  const handleCalcola = () => {
    if (valore > 0) {
      const clamped = Math.min(500000, Math.max(500, valore));
      setValore(clamped);
      setValoreInput(clamped.toString());
    }
    setCalcolato(true);
    pushCalcolo();
  };

  return (
    <div class="sim">
      {/* --- FORM INPUT --- */}
      <div class="sim__form">
        {/* Tipologia bene */}
        <div class="sim__field">
          <label class="sim__label" for="tipologia">Tipologia bene</label>
          <select
            id="tipologia"
            class="sim__select"
            value={tipologia}
            onChange={(e) => { setTipologia((e.target as HTMLSelectElement).value); setCalcolato(false); }}
          >
            {Object.keys(RISCATTI).map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        {/* Valore bene */}
        <div class="sim__field">
          <label class="sim__label" for="valore">Valore del bene (€)</label>
          <input
            id="valore"
            type="text"
            inputMode="numeric"
            class="sim__input"
            value={valoreInput}
            onInput={handleValoreChange}
            onBlur={handleValoreBlur}
            placeholder="50000"
          />
          <span class="sim__hint">Min €500 — Max €{isSoftware ? '100.000' : '500.000'}</span>
        </div>

        {/* Durata */}
        <div class="sim__field">
          <label class="sim__label" for="durata">Durata contratto</label>
          <select
            id="durata"
            class="sim__select"
            value={durata}
            onChange={(e) => { setDurata(parseInt((e.target as HTMLSelectElement).value, 10)); setCalcolato(false); }}
          >
            {durateDisponibili.map((d) => (
              <option key={d} value={d}>{d} mesi</option>
            ))}
          </select>
        </div>

        {/* Riscatto (read-only) */}
        <div class="sim__field">
          <label class="sim__label">Riscatto finale</label>
          <div class="sim__readonly">
            {isSoftware
              ? '0% — non previsto per Software'
              : isNonDisponibile
                ? 'Non disponibile per questa combinazione'
                : `${riscattoPerc}%`}
          </div>
        </div>
        {/* Hint valore max per software */}
        {isSoftware && (
          <span class="sim__hint">Software: valore max €100.000 — coefficienti Pioneer++++</span>
        )}
        {/* Bottone Calcola */}
        <button
          type="button"
          class="sim__button"
          onClick={handleCalcola}
          disabled={valore < 1}
        >
          Calcola preventivo
        </button>
      </div>

      {/* --- RISULTATI --- */}
      <div class="sim__results">
        {isNonDisponibile ? (
          <div class="sim__message">
            <span class="material-icons-outlined sim__message-icon">warning</span>
            <p>La combinazione <strong>{tipologia}</strong> con durata <strong>{durata} mesi</strong> non
            è disponibile. Prova a cambiare la durata.</p>
          </div>
        ) : risultati ? (
          <>
            <h3 class="sim__results-title">Il tuo preventivo</h3>

            <div class="sim__result-card sim__result-card--main">
              <span class="sim__result-label">Canone mensile</span>
              <span class="sim__result-value">{eur(risultati.canoneMensile)}</span>
            </div>

            <div class="sim__result-card">
              <span class="sim__result-label">Canone trimestrale anticipato</span>
              <span class="sim__result-value">{eur(risultati.canoneTrimestrale)}</span>
            </div>

            <div class="sim__result-card">
              <span class="sim__result-label">Riscatto finale ({risultati.riscattoPerc}%)</span>
              <span class="sim__result-value">{eur(risultati.valoreRiscatto)}</span>
            </div>

            <div class="sim__risparmio">
              <span class="material-icons-outlined sim__risparmio-icon">savings</span>
              <p>Con il noleggio operativo conservi <strong>{eur(risultati.risparmioLiquidita)}</strong> di
              liquidità rispetto all'acquisto diretto.</p>
            </div>

            <div class="sim__note">
              <p>* Pagamento standard: trimestrale anticipato. Canone mensile disponibile
              sopra €12.000/mese con maggiorazione +5%.</p>
              <p>* Assicurazione obbligatoria non inclusa nei coefficienti indicati.</p>
              <p>* Coefficienti Grenke Italia SpA — Rete Rent (tabella {isSoftware ? 'Pioneer++++' : 'Sputnik++++'}){isSoftware ? '. Riscatto non previsto per Software.' : '.'}</p>
              {(durata === 72 || durata === 84) && (
                <p>* Per durate di {durata} mesi i coefficienti sono stimati. Richiedi un preventivo
                personalizzato per l'importo esatto.</p>
              )}
            </div>
          </>
        ) : (
          <div class="sim__message">
            <span class="material-icons-outlined sim__message-icon">edit</span>
            <p>Compila i campi e premi <strong>Calcola preventivo</strong> per vedere il risultato.</p>
          </div>
        )}
      </div>
    </div>
  );
}
