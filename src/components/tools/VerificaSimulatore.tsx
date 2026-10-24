import { useEffect, useState } from 'preact/hooks';
import { pivaValida, pulisciPiva } from '../../lib/piva';
import { CHIAVE_ESITO } from '../../scripts/esito-grazie';
import './verifica-simulatore.css';

// Verifica del cliente sotto il simulatore di noleggio operativo.
//
// Due moduli: "per la mia azienda" (compila l'imprenditore) e "per un mio
// cliente" (compila il fornitore). Importo, durata, tipologia e canone arrivano
// dal simulatore con l'evento 'simulatore:calcolo'. Il server verifica il
// cliente nelle banche dati e risponde con l'esito, che passa a /grazie in
// sessionStorage: /grazie resta la pagina di destinazione perche' la conversione
// Google Ads scatta sulla sua visita. Nell'URL non va niente.

type Variante = 'azienda' | 'cliente';

interface Simulazione {
  importo: number | null;
  durata: number | null;
  tipologia: string;
  canone: string;
}

function evento(nome: string, extra: Record<string, unknown> = {}) {
  const dl = (window as any).dataLayer;
  if (dl && typeof dl.push === 'function') {
    try { dl.push({ event: nome, ...extra }); } catch { /* mai bloccare */ }
  }
}

const euro = (n: number) => `${n.toLocaleString('it-IT', { useGrouping: 'always' } as Intl.NumberFormatOptions)} €`;

export default function VerificaSimulatore() {
  const [variante, setVariante] = useState<Variante>('azienda');
  const [sim, setSim] = useState<Simulazione>({ importo: null, durata: null, tipologia: '', canone: '' });
  const [invio, setInvio] = useState(false);
  const [errore, setErrore] = useState('');

  useEffect(() => {
    const ultimo = (window as any).__mcfSimulazione as Simulazione | undefined;
    if (ultimo) setSim(ultimo);
    const ascolta = (e: Event) => setSim((e as CustomEvent<Simulazione>).detail);
    window.addEventListener('simulatore:calcolo', ascolta);
    return () => window.removeEventListener('simulatore:calcolo', ascolta);
  }, []);

  const pulisci = (e: Event) => {
    const el = e.target as HTMLInputElement;
    el.value = pulisciPiva(el.value).slice(0, 11);
    el.setCustomValidity('');
  };

  async function invia(e: Event) {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    setErrore('');

    // Partite IVA: controllo formale prima di spendere un giro sul server
    for (const nome of ['cliente_piva', 'fornitore_piva']) {
      const el = form.elements.namedItem(nome) as HTMLInputElement | null;
      if (el && !pivaValida(pulisciPiva(el.value))) {
        el.setCustomValidity('Questa partita IVA non torna: controlla le 11 cifre.');
      }
    }
    if (!form.reportValidity()) return;

    const dati = new FormData(form);
    dati.set('variante', variante);
    if (sim.importo) dati.set('importo', String(sim.importo));
    dati.set('durata', sim.durata ? String(sim.durata) : '');
    dati.set('tipologia', sim.tipologia);
    dati.set('canone', sim.canone);

    setInvio(true);
    try {
      const r = await fetch('/api/simulatore-verifica', { method: 'POST', body: dati });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) {
        setErrore(j.messaggio ?? 'Qualcosa non è andato. Riprova tra poco, oppure chiamami al +39 393 995 7840.');
        setInvio(false);
        return;
      }
      try {
        if (j.risultato) sessionStorage.setItem(CHIAVE_ESITO, JSON.stringify({ ...j.risultato, consegnato: j.consegnato, preventivo: j.preventivo ?? null }));
      } catch { /* senza sessionStorage /grazie mostra il messaggio generico */ }
      evento('simulatore_verifica_inviata', { variante, esito: j.risultato?.colore ?? j.risultato?.motivo ?? 'nessuno' });
      window.location.href = '/grazie';
    } catch {
      setErrore('Il collegamento non risponde. Riprova tra poco, oppure chiamami al +39 393 995 7840.');
      setInvio(false);
    }
  }

  const perCliente = variante === 'cliente';

  return (
    <div class="vsim">
      <div class="vsim__schede" role="tablist" aria-label="Per chi è il bene">
        <button type="button" role="tab" aria-selected={!perCliente} class={`vsim__scheda${!perCliente ? ' vsim__scheda--attiva' : ''}`} onClick={() => setVariante('azienda')}>
          Il bene è per la mia azienda
        </button>
        <button type="button" role="tab" aria-selected={perCliente} class={`vsim__scheda${perCliente ? ' vsim__scheda--attiva' : ''}`} onClick={() => setVariante('cliente')}>
          Il bene è per un mio cliente
        </button>
      </div>

      <p class="vsim__intro">
        {perCliente
          ? "Scrivi la partita IVA del tuo cliente: interroghiamo le banche dati e ti dico subito come si presenta a una società di noleggio e la fattibilità dell'operazione. Scarichi subito il preventivo; entro 24 ore lavorative ti richiamo per i chiarimenti e i dettagli."
          : "Scrivi la partita IVA della tua azienda: interroghiamo le banche dati e ti dico subito come si presenta a una società di noleggio e la fattibilità dell'operazione. Scarichi subito il preventivo; entro 24 ore lavorative ti richiamo per i chiarimenti e i dettagli."}
      </p>

      <form class="vsim__form" onSubmit={invia} noValidate={false}>
        <input name="website" type="text" tabIndex={-1} autoComplete="off" class="vsim__trappola" aria-hidden="true" />
        <input type="hidden" name="fonte" value="simulatore-noleggio-operativo" />

        <div class="vsim__campo">
          <label for="vsim-cliente">{perCliente ? 'Partita IVA del tuo cliente' : 'Partita IVA della tua azienda'}</label>
          <input id="vsim-cliente" name="cliente_piva" inputMode="numeric" autoComplete="off" maxLength={13} placeholder="11 cifre" required onInput={pulisci} />
        </div>

        {perCliente && (
          <div class="vsim__campo">
            <label for="vsim-fornitore">Partita IVA della tua azienda</label>
            <input id="vsim-fornitore" name="fornitore_piva" inputMode="numeric" autoComplete="off" maxLength={13} placeholder="11 cifre" required onInput={pulisci} />
          </div>
        )}

        <div class="vsim__campo">
          <label for="vsim-nome">Nome e cognome</label>
          <input id="vsim-nome" name="nome" autoComplete="name" required />
        </div>

        <div class="vsim__doppio">
          <div class="vsim__campo">
            <label for="vsim-tel">Cellulare</label>
            <input id="vsim-tel" name="telefono" type="tel" autoComplete="tel" placeholder="+39 333 123 4567" required />
          </div>
          <div class="vsim__campo">
            <label for="vsim-email">Email</label>
            <input id="vsim-email" name="email" type="email" autoComplete="email" required />
          </div>
        </div>

        {sim.importo ? (
          <p class="vsim__riepilogo">
            Importo {euro(sim.importo)}{sim.durata ? `, ${sim.durata} mesi` : ''}{sim.canone ? `, canone ${sim.canone}` : ''}. Lo prendo dal simulatore qui sopra.
          </p>
        ) : (
          <div class="vsim__campo">
            <label for="vsim-importo">Importo del bene, IVA esclusa (€)</label>
            <input id="vsim-importo" name="importo" inputMode="numeric" placeholder="25.000" required />
          </div>
        )}

        <label class="vsim__privacy">
          <input type="checkbox" name="privacy" required />
          <span>
            Ho letto l'<a href="/privacy" target="_blank" rel="noopener">informativa sulla privacy</a>
            {perCliente ? ' e il mio cliente sa che chiedo una verifica a suo nome.' : '.'}
          </span>
        </label>

        {errore && <p class="vsim__errore" role="alert">{errore}</p>}

        <button type="submit" class="vsim__invia" disabled={invio}>
          {invio ? 'Interrogo le banche dati…' : 'Verifica e scarica il preventivo'}
        </button>
        <p class="vsim__nota">Gratis e senza impegno. Valutazione indicativa sui dati pubblici delle banche dati, non è una delibera.</p>
      </form>
    </div>
  );
}
