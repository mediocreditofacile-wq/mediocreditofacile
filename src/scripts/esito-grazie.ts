// Esito della verifica del simulatore di noleggio, mostrato su /grazie.
//
// Il modulo (src/components/tools/VerificaSimulatore.tsx) salva la risposta del
// server in sessionStorage e rimanda qui: /grazie resta la destinazione perche'
// la conversione Google Ads scatta sulla sua visita. Testi decisi con Alberto il
// 24/10/2026: mai "approvato", mai una promessa di esito.

export const CHIAVE_ESITO = 'mcf_esito_simulatore';

export interface RisultatoSimulatore {
  variante: 'azienda' | 'cliente';
  colore: 'verde' | 'giallo' | 'rosso' | null;
  motivo: 'non_trovata' | 'ferma' | 'non_verificata' | null;
  ragioneSociale: string | null;
  indirizzo: string | null;
  forma: string | null;
  criteri: { chiave: string; nome: string; valore: string; ok: boolean | null }[];
  indicazioni: string[];
  documenti: string[];
  importo: number;
  consegnato?: boolean;
  preventivo?: { filename: string; base64: string } | null;
}

const esc = (v: unknown) =>
  String(v ?? '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' })[c]!);

/** La frase dell'esito, con "tua azienda" o "tuo cliente" secondo il modulo */
export function fraseEsito(r: RisultatoSimulatore): string {
  const cliente = r.variante === 'cliente';
  const chi = cliente ? 'del tuo cliente' : 'della tua azienda';
  const soggetto = cliente ? "L'azienda del tuo cliente" : "L'azienda";
  switch (r.colore) {
    case 'verde':
      return `I numeri ${chi} sono in linea con quello che chiedono le società di noleggio. Il preventivo lo scarichi qui sotto; entro 24 ore lavorative ti richiamo per i dettagli del caso e del bene.`;
    case 'giallo':
      return 'La pratica si può presentare, ma dai numeri pubblici emerge qualche elemento da capire meglio: presentata così com\'è rischierebbe un no. Con i documenti in mano la imposto io nel modo giusto e scelgo la società di noleggio più adatta. Ti richiamo entro 24 ore lavorative.';
    case 'rosso':
      return `${soggetto} ha meno di due anni di attività, e per le società di noleggio è una pratica fuori standard. Fuori standard non vuol dire impossibile: va studiata da un professionista, a partire dalla storia di chi c'è dietro. Ti richiamo entro 24 ore lavorative.`;
    default:
      if (r.motivo === 'non_verificata') return 'In questo momento le banche dati non hanno risposto. Ho ricevuto la richiesta: la verifico io e ti richiamo entro 24 ore lavorative per i dettagli.';
      return 'Non trovo questa partita IVA tra le aziende attive nelle banche dati. Ti richiamo io per capire, entro 24 ore lavorative.';
  }
}

export function htmlEsito(r: RisultatoSimulatore): string {
  const colore = r.colore ?? 'neutro';
  const titolo = r.colore ? 'Ecco come si presenta la pratica' : 'Richiesta ricevuta';
  const azienda = r.ragioneSociale
    ? `<p class="grazie-esito__azienda"><strong>${esc(r.ragioneSociale)}</strong>${r.forma ? ` · ${esc(r.forma)}` : ''}${r.indirizzo ? `<br>${esc(r.indirizzo)}` : ''}</p>`
    : '';
  const criteri = r.criteri.length
    ? `<h2>I dati pubblici dell'azienda</h2><ul class="grazie-esito__criteri">${r.criteri
        .map((c) => `<li class="${c.ok === true ? 'ok' : c.ok === false ? 'ko' : 'nd'}">${esc(c.nome)}: ${esc(c.valore)}</li>`)
        .join('')}</ul>`
    : '';
  const indicazioni = r.indicazioni.length
    ? `<h2>Cosa guarda una società di noleggio</h2><ul class="grazie-esito__indicazioni">${r.indicazioni.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`
    : '';
  const documenti = r.documenti.length
    ? `<h2>Per andare avanti prepara</h2><ul class="grazie-esito__documenti">${r.documenti.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>`
    : '';
  const ripiego = r.consegnato === false
    ? `<div class="grazie-esito__azioni"><a href="https://wa.me/393939957840?text=${encodeURIComponent('Ho appena fatto la verifica sul simulatore di noleggio operativo.')}">Scrivimi su WhatsApp</a><a href="tel:+393939957840">Chiamami al +39 393 995 7840</a></div>`
    : `<div class="grazie-esito__azioni"><a href="/">Torna alla home</a></div>`;

  const scarica = r.preventivo
    ? `<p class="grazie-esito__scarica"><button type="button" id="grazie-scarica">Scarica il preventivo in PDF</button></p>`
    : '';

  return `<h1>${titolo}</h1>${azienda}
    <div class="grazie-esito__colore grazie-esito__colore--${colore}"><span class="grazie-esito__punto" aria-hidden="true"></span><p>${esc(fraseEsito(r))}</p></div>
    ${scarica}
    ${criteri}${indicazioni}${documenti}
    ${r.colore ? '<p class="grazie-esito__nota">Valutazione indicativa sui dati pubblici delle banche dati, non è una delibera.</p>' : ''}
    ${ripiego}`;
}

export function mostraEsitoSimulatore(): void {
  let r: RisultatoSimulatore | null = null;
  try {
    const grezzo = sessionStorage.getItem(CHIAVE_ESITO);
    if (grezzo) {
      sessionStorage.removeItem(CHIAVE_ESITO);
      r = JSON.parse(grezzo);
    }
  } catch {
    return;
  }
  if (!r || !Array.isArray(r.documenti)) return;
  const box = document.getElementById('grazie-esito');
  if (!box) return;
  box.innerHTML = htmlEsito(r);
  box.hidden = false;
  const pdf = r.preventivo;
  if (pdf) {
    // Il PDF resta in memoria: l'esito e' gia' stato tolto da sessionStorage
    const bytes = Uint8Array.from(atob(pdf.base64), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    document.getElementById('grazie-scarica')?.addEventListener('click', () => {
      const a = document.createElement('a');
      a.href = url;
      a.download = pdf.filename;
      a.click();
      const dl = (window as any).dataLayer;
      if (dl && typeof dl.push === 'function') dl.push({ event: 'simulatore_preventivo_scaricato' });
    });
  }
  box.closest('.grazie')?.classList.add('grazie--esito');
}
