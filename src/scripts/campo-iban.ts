// Campo IBAN dei moduli pratica, nel browser. Lo usano il motore dei portali
// (src/scripts/motore/pratiche.ts) e i portali pratiche (/tools/<slug>).
//
// Uscendo dal campo l'IBAN torna a gruppi di quattro se e' giusto, e se e'
// sbagliato il commerciale lo sa subito, col motivo, invece che all'invio. La
// regola e' quella del server (src/lib/iban.ts): qui serve solo ad anticiparla.
// Il messaggio va anche in setCustomValidity, cosi' sui moduli che usano
// reportValidity() l'invio si ferma sul campo giusto.

import { controllaIban, formattaIban } from '../lib/iban';

export interface CampoIban {
  /** Controlla il valore, mostra il motivo se c'e' e dice se si puo' inviare */
  verifica(): boolean;
}

export function initCampoIban(input: HTMLInputElement, esito: HTMLElement | null): CampoIban {
  const mostra = (testo: string) => {
    input.setCustomValidity(testo);
    input.setAttribute('aria-invalid', String(Boolean(testo)));
    if (esito) {
      esito.textContent = testo;
      esito.hidden = !testo;
    }
  };
  const verifica = () => {
    const r = controllaIban(input.value);
    if (r.ok) input.value = formattaIban(r.iban);
    mostra(r.ok ? '' : r.messaggio);
    return r.ok;
  };

  input.addEventListener('input', () => mostra(''));
  // Campo lasciato vuoto uscendo: non si rimprovera ancora, ci pensa l'invio
  input.addEventListener('blur', () => { if (input.value.trim()) verifica(); });
  return { verifica };
}
