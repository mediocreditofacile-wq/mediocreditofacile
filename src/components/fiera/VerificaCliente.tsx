import { useState, useEffect } from 'preact/hooks';
import { pivaValida, pulisciPiva } from '../../lib/piva';
import { valutaCredito, ETICHETTE_FIERA } from '../../lib/credit-policy';

// Verifica del cliente finale sulla pagina /fiera: il fornitore scrive la partita
// IVA di un suo cliente e vede ragione sociale, sede, stato e un semaforo.
//
// Il semaforo non passa da nessun modello: e' src/lib/credit-policy.ts, le
// stesse soglie del tool Marotta, applicate ai dati gratuiti di IT-advanced e
// all'importo scritto nel simulatore qui sopra.
//
// Mai "approvato", mai un tasso, mai una promessa di delibera: sotto il semaforo
// c'e' sempre "valutazione indicativa, non è una delibera".
//
// I dati trovati restano in memoria. Finiscono nei campi nascosti del modulo e
// quindi da qualche parte solo se il fornitore manda il lead.

interface Scheda {
  ragioneSociale: string | null;
  indirizzo: string | null;
  stato: string | null;
  formaGiuridica: string | null;
  inizioAttivita: string | null;
  annoBilancio: number | null;
  fatturato: number | null;
  utile: number | null;
  patrimonioNetto: number | null;
}

type Fase = 'pronta' | 'cerco' | 'trovata' | 'nessuna' | 'errore' | 'frequenza' | 'registrazione';

function evento(nome: string, extra: Record<string, unknown>) {
  const dl = (window as any).dataLayer;
  if (dl && typeof dl.push === 'function') {
    try { dl.push({ event: nome, ...extra }); } catch { /* mai bloccare */ }
  }
}

function campo(id: string, valore: string) {
  const el = document.getElementById(id) as HTMLInputElement | null;
  if (el) el.value = valore;
}

/** "ATTIVA" -> "Attiva": Openapi scrive lo stato tutto maiuscolo */
const frase = (t: string | null) => (t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : '');

export default function VerificaCliente({ importo }: { importo: number | null }) {
  const [visibile, setVisibile] = useState(true);
  const [piva, setPiva] = useState('');
  const [fase, setFase] = useState<Fase>('pronta');
  const [scheda, setScheda] = useState<Scheda | null>(null);
  const [cercata, setCercata] = useState('');

  // Il servizio puo' essere spento (tetto di spesa): in quel caso il blocco sparisce
  // e resta il modulo. Se la domanda fallisce il blocco resta: si prova alla ricerca.
  useEffect(() => {
    fetch('/api/fiera-verifica?stato=1', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j && j.attivo === false) setVisibile(false);
        else if (j?.registrazione) setFase('registrazione');
      })
      .catch(() => {});
    // Dopo il modulo il server ha esteso l'uso: si riparte
    const riapri = () => setFase((f) => (f === 'registrazione' ? 'pronta' : f));
    window.addEventListener('fiera:registrato', riapri);
    return () => window.removeEventListener('fiera:registrato', riapri);
  }, []);

  const mostraModulo = () => {
    const nota = document.getElementById('reg-nota');
    if (nota) nota.hidden = false;
    document.getElementById('form-fiera')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  async function cerca(p: string) {
    if (p === cercata && fase === 'trovata') return;
    setCercata(p);
    setFase('cerco');
    setScheda(null);
    try {
      const r = await fetch(`/api/fiera-verifica?piva=${p}`, { credentials: 'same-origin' });
      const j = await r.json().catch(() => ({}));
      if (r.status === 403 && j.registrazione) {
        setFase('registrazione');
        mostraModulo();
        evento('fiera_verifica_piva', { esito: 'registrazione' });
        return;
      }
      if (r.status === 503 && j.disattivata) {
        setVisibile(false);
        evento('fiera_verifica_piva', { esito: 'disattivata' });
        return;
      }
      if (r.status === 429) { setFase('frequenza'); return; }
      if (!r.ok) throw new Error(String(r.status));
      if (!j.trovata) {
        setFase('nessuna');
        evento('fiera_verifica_piva', { esito: 'non_trovata' });
        return;
      }
      setScheda(j as Scheda);
      setFase('trovata');
      evento('fiera_verifica_piva', { esito: 'trovata' });
    } catch {
      setFase('errore');
      evento('fiera_verifica_piva', { esito: 'errore' });
    }
  }

  const onInput = (e: Event) => {
    const el = e.target as HTMLInputElement;
    const p = pulisciPiva(el.value).slice(0, 11);
    el.value = p;
    setPiva(p);
    // Con l'undicesima cifra parte da sola: in fiera la velocita' e' la demo
    if (p.length === 11 && pivaValida(p) && fase !== 'registrazione') cerca(p);
    else if (fase !== 'registrazione') setFase('pronta');
  };

  const esito = scheda
    ? valutaCredito({
        importo,
        fatturato: scheda.fatturato,
        patrimonioNetto: scheda.patrimonioNetto,
        utile: scheda.utile,
        inizioAttivita: scheda.inizioAttivita,
      })
    : null;

  // Il cliente verificato viaggia col lead, se il fornitore lo manda
  useEffect(() => {
    campo('cliente_piva', scheda ? cercata : '');
    campo('cliente_ragione_sociale', scheda?.ragioneSociale ?? '');
    campo('cliente_valutazione', esito ? ETICHETTE_FIERA[esito.semaforo] : '');
  }, [scheda, esito?.semaforo]);

  if (!visibile) return null;

  const errata = piva.length === 11 && !pivaValida(piva);

  return (
    <div class="verf">
      <h3>Verifica il tuo cliente</h3>
      <p class="verf__sub">Scrivi la partita IVA di un tuo cliente: vedi subito chi è e come si presenta.</p>
      <div class="campo">
        <label for="verf-piva">Partita IVA del cliente</label>
        <input
          type="text"
          id="verf-piva"
          inputmode="numeric"
          autocomplete="off"
          maxLength={13}
          placeholder="11 cifre"
          onInput={onInput}
          disabled={fase === 'registrazione'}
        />
      </div>

      <div aria-live="polite">
        {errata && <p class="verf__msg">Questa partita IVA non torna: controlla le cifre.</p>}
        {fase === 'cerco' && <p class="verf__msg">Cerco nel registro imprese…</p>}
        {fase === 'nessuna' && <p class="verf__msg">Nessuna azienda con questa partita IVA. Controlla il numero, oppure mandamela nel modulo e verifico io.</p>}
        {fase === 'errore' && <p class="verf__msg">Il registro imprese non risponde in questo momento. Riprova tra poco, oppure mandami la partita IVA nel modulo qui sotto.</p>}
        {fase === 'frequenza' && <p class="verf__msg">Troppe ricerche in un minuto da questa rete. Aspetta qualche secondo e riprova.</p>}
        {fase === 'registrazione' && (
          <p class="verf__msg">
            Registrati per continuare a usare il servizio: compila il modulo qui sotto e la verifica si riapre subito.{' '}
            <button type="button" class="verf__link" onClick={mostraModulo}>Vai al modulo</button>
          </p>
        )}

        {fase === 'trovata' && scheda && esito && (
          <div class="verf__scheda">
            <p class="verf__nome">{scheda.ragioneSociale}</p>
            {scheda.indirizzo && <p class="verf__riga">{scheda.indirizzo}</p>}
            <p class="verf__riga">{[frase(scheda.stato), scheda.formaGiuridica].filter(Boolean).join(' · ')}</p>

            <div class={`verf__semaforo verf__semaforo--${esito.semaforo}`}>
              <span class="verf__punto" aria-hidden="true" />
              <span class="verf__etichetta">{ETICHETTE_FIERA[esito.semaforo]}</span>
            </div>
            <ul class="verf__criteri">
              {esito.criteri.map((c) => (
                <li key={c.chiave} class={c.ok === true ? 'ok' : c.ok === false ? 'ko' : 'nd'}>
                  {c.nome}: {c.valore}
                </li>
              ))}
            </ul>
            {!importo && <p class="verf__nota">Scrivi l'importo nel simulatore qui sopra per il confronto con il fatturato.</p>}
            <p class="verf__nota">Valutazione indicativa, non è una delibera.{scheda.annoBilancio ? ` Bilancio ${scheda.annoBilancio}.` : ''}</p>
          </div>
        )}
      </div>
    </div>
  );
}
