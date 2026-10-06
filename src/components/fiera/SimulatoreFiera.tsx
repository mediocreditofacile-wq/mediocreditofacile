import { useState, useEffect, useRef } from 'preact/hooks';
import { getEsgCoeff, ESG_DURATE, ESG_MIN, ESG_MAX } from '../../data/esg';
import { eur } from '../../data/grenke';
import VerificaCliente from './VerificaCliente';

// Simulatore del canone per /fiera. Versione ridotta: importo e durata, in uscita
// il canone mensile. Coefficienti dalla tabella Grenke ESG++++ (fotovoltaico),
// gli stessi del portale: qui non c'e' nessun numero ricopiato.
//
// Il canone si aggiorna mentre si digita, senza pulsante: in fiera serve a far
// vedere la velocita', e il calcolo gira tutto nel browser, senza rete.
//
// Gli stili stanno nel blocco inline di fiera.astro: nessun CSS in piu' da scaricare.

const DURATE = ESG_DURATE.filter((d) => d <= 60);

export default function SimulatoreFiera() {
  const [pronto, setPronto] = useState(false);
  const [testo, setTesto] = useState('');
  const [durata, setDurata] = useState(60);
  const tracciato = useRef(false);

  // Finche' l'isola non si idrata la pagina mostra il ripiego (vedi CSS in fiera.astro)
  useEffect(() => setPronto(true), []);

  const importo = parseInt(testo, 10) || 0;
  const coeff = importo ? getEsgCoeff(importo, durata) : null;
  const canone = coeff ? (importo * coeff) / 100 : null;

  let avviso = '';
  if (importo && importo < ESG_MIN) avviso = `Il noleggio parte da ${eur(ESG_MIN)}.`;
  else if (importo > ESG_MAX) avviso = `Oltre ${eur(ESG_MAX)} si quota su misura: scrivimi qui sotto.`;

  useEffect(() => {
    if (canone == null) return;
    // Il simulato viaggia col lead, se poi il fornitore compila il modulo
    const i = document.getElementById('sim_importo') as HTMLInputElement | null;
    const d = document.getElementById('sim_durata') as HTMLInputElement | null;
    if (i) i.value = String(importo);
    if (d) d.value = String(durata);
    if (!tracciato.current) {
      tracciato.current = true;
      const dl = (window as any).dataLayer;
      if (dl && typeof dl.push === 'function') {
        try { dl.push({ event: 'fiera_simulazione', importo, durata }); } catch { /* mai bloccare */ }
      }
    }
  }, [canone]);

  // Il campo mostra le migliaia separate ma lo stato tiene solo cifre
  const onInput = (e: Event) => {
    const el = e.target as HTMLInputElement;
    const cifre = el.value.replace(/\D/g, '').slice(0, 7);
    setTesto(cifre);
    el.value = cifre ? Number(cifre).toLocaleString('it-IT', { useGrouping: 'always' } as Intl.NumberFormatOptions) : '';
  };

  return (
    <section class="simf card" data-pronto={pronto ? '1' : undefined} aria-labelledby="simf-titolo">
      <h2 id="simf-titolo">Quanto paga il tuo cliente al mese</h2>
      <div class="simf__area">
      <p class="simf__ripiego">Il simulatore si sta caricando. Se non compare, scrivimi l'importo nel modulo qui sotto.</p>

      <div class="simf__corpo">
        <div class="campo">
          <label for="simf-importo">Importo della fornitura, IVA esclusa</label>
          <div class="simf__euro">
            <input
              type="text"
              id="simf-importo"
              inputmode="numeric"
              autocomplete="off"
              placeholder="es. 35.000"
              onInput={onInput}
            />
            <span aria-hidden="true">€</span>
          </div>
        </div>

        <div class="campo">
          <span class="simf__etichetta" id="simf-durata">Durata</span>
          <div class="simf__durate" role="radiogroup" aria-labelledby="simf-durata">
            {DURATE.map((d) => (
              <button
                type="button"
                role="radio"
                aria-checked={d === durata}
                class={d === durata ? 'on' : ''}
                onClick={() => setDurata(d)}
              >
                {d} mesi
              </button>
            ))}
          </div>
        </div>

        <div class="simf__esito" aria-live="polite">
          <span class="simf__cifra">{canone != null ? eur(canone) : '—'}</span>
          <span class="simf__unita">al mese + IVA, per {durata} mesi</span>
        </div>
        {avviso && <p class="simf__avviso">{avviso}</p>}
        <p class="simf__nota">Canone indicativo, non è un'offerta.</p>
      </div>
      </div>

      {pronto && <VerificaCliente importo={importo || null} />}
    </section>
  );
}
