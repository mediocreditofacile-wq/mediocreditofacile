import { useState, useMemo } from 'preact/hooks';
import './simulatore-noleggio.css';

// --- Coefficienti Grenke reali (tabella Sputnik++++, pagamento trimestrale) ---
const GRENKE_COEFFS: Record<number, { da: number; a: number; c: number }[]> = {
  24: [
    { da: 500, a: 2500, c: 5.014 },
    { da: 2501, a: 5000, c: 5.011 },
    { da: 5001, a: 12000, c: 4.967 },
    { da: 12001, a: 25000, c: 4.959 },
    { da: 25001, a: 50000, c: 4.882 },
    { da: 50001, a: 500000, c: 4.82 },
  ],
  30: [
    { da: 500, a: 2500, c: 4.049 },
    { da: 2501, a: 5000, c: 4.03 },
    { da: 5001, a: 12000, c: 3.998 },
    { da: 12001, a: 25000, c: 3.973 },
    { da: 25001, a: 50000, c: 3.955 },
    { da: 50001, a: 500000, c: 3.911 },
  ],
  36: [
    { da: 500, a: 2500, c: 3.634 },
    { da: 2501, a: 5000, c: 3.541 },
    { da: 5001, a: 12000, c: 3.472 },
    { da: 12001, a: 25000, c: 3.448 },
    { da: 25001, a: 50000, c: 3.41 },
    { da: 50001, a: 500000, c: 3.406 },
  ],
  48: [
    { da: 500, a: 2500, c: 3.069 },
    { da: 2501, a: 5000, c: 2.742 },
    { da: 5001, a: 12000, c: 2.712 },
    { da: 12001, a: 25000, c: 2.679 },
    { da: 25001, a: 50000, c: 2.677 },
    { da: 50001, a: 500000, c: 2.674 },
  ],
  60: [
    { da: 500, a: 2500, c: 2.672 },
    { da: 2501, a: 5000, c: 2.315 },
    { da: 5001, a: 12000, c: 2.277 },
    { da: 12001, a: 25000, c: 2.246 },
    { da: 25001, a: 50000, c: 2.212 },
    { da: 50001, a: 500000, c: 2.149 },
  ],
};

// --- Tabella riscatti per tipologia bene (fonte: tariffario ufficiale) ---
const RISCATTI: Record<string, Record<number, number | null>> = {
  'PC e Workstation': { 24: 10, 30: 7, 36: 7, 48: 4, 60: 3, 72: null, 84: null },
  'PC e Workstation Apple': { 24: 12, 30: 10, 36: 10, 48: 6, 60: 4, 72: null, 84: null },
  Notebook: { 24: 12, 30: 8, 36: 8, 48: 5, 60: 4, 72: null, 84: null },
  'Notebook Apple': { 24: 15, 30: 10, 36: 10, 48: 7, 60: 5, 72: null, 84: null },
  'Tablet / Smartphone': { 24: 12, 30: 8, 36: 8, 48: 5, 60: 4, 72: null, 84: null },
  Multifunzione: { 24: 6, 30: 4, 36: 4, 48: 3, 60: 2, 72: null, 84: null },
  Server: { 24: 7, 30: 5, 36: 5, 48: 3, 60: 2, 72: null, 84: null },
  'Monitor / TV': { 24: 8, 30: 6, 36: 6, 48: 4, 60: 3, 72: null, 84: null },
  'Stampanti / Plotter / Fax': { 24: 6, 30: 4, 36: 4, 48: 3, 60: 2, 72: null, 84: null },
  Fotocamere: { 24: 15, 30: 10, 36: 10, 48: 6, 60: 5, 72: null, 84: null },
  'Videosorveglianza / Allarme': { 24: 7, 30: 4, 36: 4, 48: 3, 60: 2, 72: null, 84: null },
  'Impianti Telefonici': { 24: 7, 30: 4, 36: 4, 48: 3, 60: 2, 72: null, 84: null },
  'Strumenti di Misurazione': { 24: 8, 30: 6, 36: 6, 48: 4, 60: 2, 72: null, 84: null },
  'Bilance Elettroniche': { 24: 8, 30: 5, 36: 5, 48: 4, 60: 2, 72: null, 84: null },
  'Sistemi di Cassa': { 24: 8, 30: 5, 36: 5, 48: 4, 60: 2, 72: null, 84: null },
  'Strumenti Elettromedicali': { 24: 9, 30: 6, 36: 6, 48: 4, 60: 3, 72: null, 84: null },
  'Arredamento per Ufficio': { 24: 6, 30: 5, 36: 5, 48: 3, 60: 2, 72: null, 84: null },
  'Software Gestionali / CAD': { 24: null, 30: null, 36: null, 48: null, 60: null, 72: null, 84: null },
  'Altri Beni Strumentali': { 24: 10, 30: 6, 36: 6, 48: 4, 60: 3, 72: null, 84: null },
  Fotovoltaico: { 24: 10, 30: 6, 36: 6, 48: 4, 60: 3, 72: 3, 84: 3 },
};

// Tutte le durate base + fotovoltaico
const DURATE_BASE = [24, 30, 36, 48, 60];
const DURATE_FOTOVOLTAICO = [24, 30, 36, 48, 60, 72, 84];

// Trova il coefficiente Grenke per un valore e una durata
function getCoeff(valore: number, durata: number): number | null {
  const fasce = GRENKE_COEFFS[durata];
  if (!fasce) return null;
  const fascia = fasce.find((f) => valore >= f.da && valore <= f.a);
  return fascia ? fascia.c : null;
}

// Formatta in euro
function eur(n: number): string {
  return n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 });
}

export default function SimulatoreNoleggio() {
  const [tipologia, setTipologia] = useState('Altri Beni Strumentali');
  const [valore, setValore] = useState(50000);
  const [valoreInput, setValoreInput] = useState('50000');
  const [durata, setDurata] = useState(36);

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

  // Tipologia "Software Gestionali / CAD" non è prevista
  const isSoftware = tipologia === 'Software Gestionali / CAD';
  const isNonDisponibile = riscattoPerc === null;

  // Calcolo risultati
  const risultati = useMemo(() => {
    if (isSoftware || isNonDisponibile || valore < 500 || valore > 500000) return null;

    // Per durate 72 e 84 (solo fotovoltaico) non ci sono coefficienti Grenke standard
    // Usiamo il coefficiente della durata 60 con una riduzione proporzionale
    let coeff: number | null;
    if (durata === 72) {
      coeff = getCoeff(valore, 60);
      if (coeff) coeff = coeff * 0.88; // Stima riduzione per durata più lunga
    } else if (durata === 84) {
      coeff = getCoeff(valore, 60);
      if (coeff) coeff = coeff * 0.79; // Stima riduzione per durata più lunga
    } else {
      coeff = getCoeff(valore, durata);
    }

    if (!coeff) return null;

    const canoneMensile = (valore * coeff) / 100;
    const canoneTrimestrale = canoneMensile * 3;
    const valoreRiscatto = (valore * riscattoPerc!) / 100;
    const totaleContratto = canoneMensile * durata + valoreRiscatto;

    return {
      canoneMensile,
      canoneTrimestrale,
      valoreRiscatto,
      totaleContratto,
      riscattoPerc: riscattoPerc!,
      coeff,
      risparmioLiquidita: valore,
    };
  }, [valore, durata, tipologia, riscattoPerc, isSoftware, isNonDisponibile]);

  // Gestione input valore con validazione
  const handleValoreChange = (e: Event) => {
    const raw = (e.target as HTMLInputElement).value.replace(/[^\d]/g, '');
    setValoreInput(raw);
    const num = parseInt(raw, 10);
    if (!isNaN(num)) {
      setValore(Math.min(500000, Math.max(0, num)));
    }
  };

  const handleValoreBlur = () => {
    const clamped = Math.min(500000, Math.max(500, valore));
    setValore(clamped);
    setValoreInput(clamped.toString());
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

  // Push evento quando i risultati cambiano
  useMemo(() => {
    if (risultati) pushCalcolo();
  }, [risultati]);

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
            onChange={(e) => setTipologia((e.target as HTMLSelectElement).value)}
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
          <span class="sim__hint">Min €500 — Max €500.000</span>
        </div>

        {/* Durata */}
        <div class="sim__field">
          <label class="sim__label" for="durata">Durata contratto</label>
          <select
            id="durata"
            class="sim__select"
            value={durata}
            onChange={(e) => setDurata(parseInt((e.target as HTMLSelectElement).value, 10))}
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
              ? 'Non previsto per Software'
              : isNonDisponibile
                ? 'Non disponibile per questa combinazione'
                : `${riscattoPerc}%`}
          </div>
        </div>
      </div>

      {/* --- RISULTATI --- */}
      <div class="sim__results">
        {isSoftware ? (
          <div class="sim__message">
            <span class="material-icons-outlined sim__message-icon">info</span>
            <p>Il noleggio operativo per <strong>Software Gestionali / CAD</strong> richiede
            una valutazione personalizzata. Contattaci per un preventivo dedicato.</p>
          </div>
        ) : isNonDisponibile ? (
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

            <div class="sim__result-grid">
              <div class="sim__result-card sim__result-card--small">
                <span class="sim__result-label">Riscatto finale ({risultati.riscattoPerc}%)</span>
                <span class="sim__result-value">{eur(risultati.valoreRiscatto)}</span>
              </div>
              <div class="sim__result-card sim__result-card--small">
                <span class="sim__result-label">Totale a fine contratto</span>
                <span class="sim__result-value">{eur(risultati.totaleContratto)}</span>
              </div>
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
              <p>* Coefficienti Grenke Italia SpA — Rete Rent (tabella Sputnik++++).</p>
              {(durata === 72 || durata === 84) && (
                <p>* Per durate di {durata} mesi i coefficienti sono stimati. Richiedi un preventivo
                personalizzato per l'importo esatto.</p>
              )}
            </div>
          </>
        ) : (
          <div class="sim__message">
            <span class="material-icons-outlined sim__message-icon">edit</span>
            <p>Inserisci un valore tra €500 e €500.000 per calcolare il canone.</p>
          </div>
        )}
      </div>
    </div>
  );
}
