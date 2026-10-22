// Sezione Cliente e tab Info aggiuntive.
//
// La scheda ridotta e' quello che l'agente vede di suo: anagrafica, i numeri
// che contano, il rating (informativo, non entra nel semaforo) e un primo
// semaforo senza importo. Le info aggiuntive stanno in un tab a parte: soci,
// amministratori, anagrafica estesa, indici e bilancio riclassificato. Gli
// eventi negativi non arrivano mai qui: li vede solo MCF, all'invio della pratica.

import { spiegazioneIndicazione } from '../../lib/motore/spiegazione-indicazione';
import { $, api, apiJson, apriTab, esc, ETICHETTA_SEMAFORO, euro, messaggio, num, stato, traduci } from './comune';

const SCALA = ['A1', 'A2', 'A3', 'B1', 'B2', 'B3', 'C1', 'C2', 'C3'];

export function bloccoSemaforo(credito: any, titolo: string, nota = ''): string {
  const s = credito?.semaforo ?? 'giallo';
  const etichetta = credito?.etichetta ?? ETICHETTA_SEMAFORO[s] ?? s;
  // Sul bloccato (prefiltro) resta solo il testo fisso: niente criteri, niente cifre
  if (s === 'bloccato') {
    const testo = (credito?.righe ?? []).map((r: string) => `<li>${esc(r)}</li>`).join('');
    return `
    <div class="mt-semaforo mt-semaforo--bloccato">
      <span class="mt-semaforo__luce" aria-hidden="true"></span>
      <div>
        <p class="mt-semaforo__tit">${esc(titolo)}: ${esc(etichetta)}</p>
        ${testo ? `<ul class="mt-righe">${testo}</ul>` : ''}
        <p class="mt-nota" style="margin:8px 0 0">Valutazione indicativa, non è una delibera.</p>
      </div>
    </div>`;
  }
  // Il prefiltro ha anche criteri "da verificare" (ok null): li dice. Gli altri semafori restano come sono
  const prefiltro = Array.isArray(credito?.motivazioniRichieste);
  const esito = (c: any) => (c.ok === false ? ' (da guardare)' : prefiltro && c.ok === null ? ' (da verificare)' : '');
  const criteri = (credito?.criteri ?? [])
    .map((c: any) => `<li class="${c.ok === false ? 'ko' : ''}">${esc(c.nome)}: ${esc(c.valore)}${esito(c)}</li>`)
    .join('');
  const righe = (credito?.righe ?? []).map((r: string) => `<li>${esc(r)}</li>`).join('');
  return `
    <div class="mt-semaforo mt-semaforo--${esc(s)}${credito?.provvisorio ? ' mt-semaforo--provvisorio' : ''}">
      <span class="mt-semaforo__luce" aria-hidden="true"></span>
      <div>
        <p class="mt-semaforo__tit">${esc(titolo)}: ${esc(etichetta)}${credito?.provvisorio ? ' <span class="mt-id">provvisorio</span>' : ''}</p>
        ${righe ? `<ul class="mt-righe">${righe}</ul>` : ''}
        <ul class="mt-criteri">${criteri}</ul>
        ${credito?.massimale != null ? `<p class="mt-nota" style="margin:8px 0 0">Massimale finanziabile stimato: ${euro(credito.massimale)}.</p>` : ''}
        ${credito?.indicazioneMassima != null ? `<p class="mt-nota" style="margin:8px 0 0">Indicazione massima importo finanziabile: <strong>${euro(credito.indicazioneMassima)}</strong>.</p>` : ''}
        <p class="mt-nota" style="margin:8px 0 0">Valutazione indicativa, non è una delibera.${nota ? ` ${esc(nota)}` : ''}</p>
      </div>
    </div>`;
}

/** Dopo la linea del Registro: fin dove arriva il noleggio. Vuota senza indicazione */
function fraseNoleggio(credito: any): string {
  if (credito?.indicazioneMassima == null) return '';
  return ` Con il noleggio può arrivare fino a <strong>${euro(credito.indicazioneMassima)}</strong>, ${esc(spiegazioneIndicazione(credito.indicazioneBase))}.`;
}

function cifra(et: string, val: string, sub = '') {
  return `<div class="mt-cifra"><div class="mt-cifra__et">${esc(et)}</div><div class="mt-cifra__val">${val}</div>${sub ? `<div class="mt-cifra__sub">${sub}</div>` : ''}</div>`;
}

/** Il titolo del semaforo della scheda: sul settore distinta e' il prefiltro sul cliente */
const titoloScheda = () => (stato.settore === 'distinta' ? 'Prefiltro sul cliente' : 'Prima valutazione');

function rendiScheda(s: any, credito: any): string {
  const trend = s.trendFatturato != null ? `${s.trendFatturato > 0 ? '+' : ''}${num(s.trendFatturato, 1)}% sull'anno prima` : '';
  const rating = s.rating
    ? `<div class="mt-rating" aria-label="classe ${s.rating.posizione} di 9">${SCALA.map((_, i) => `<span class="${i < s.rating.posizione ? 'on' : ''}"></span>`).join('')}</div>`
    : '';
  return `
    <article class="mt-card mt-card--evidenza">
      <div class="mt-card__testa">
        <div>
          <p class="mt-rs">${esc(s.ragioneSociale)}</p>
          <p class="mt-meta">
            P.IVA ${esc(s.piva)}${s.formaGiuridica ? ` · ${esc(s.formaGiuridica)}` : ''}${s.statoAttivita ? ` · ${esc(s.statoAttivita)}` : ''}<br>
            ${s.sede ? esc(s.sede) : ''}${s.attivaDal ? ` · attiva dal ${esc(s.attivaDal)}` : ''}<br>
            ${s.ateco ? `ATECO ${esc(s.ateco)}` : ''}
          </p>
        </div>
        ${credito?.semaforo === 'bloccato' ? '' : '<button type="button" class="mt-btn" data-vai="proposte">Vai alle proposte</button>'}
      </div>
      <div class="mt-cifre">
        ${cifra('Fatturato', euro(s.fatturato), [s.annoBilancio ? `esercizio ${s.annoBilancio}` : '', trend].filter(Boolean).join(' · '))}
        ${cifra("Utile d'esercizio", euro(s.utile))}
        ${cifra('Patrimonio netto', euro(s.patrimonioNetto))}
        ${cifra('EBITDA', euro(s.ebitda))}
        ${cifra('Dipendenti', s.dipendenti != null ? num(s.dipendenti) : '—')}
        ${cifra('Rating', s.rating ? `${esc(s.rating.classe)} <small class="mt-id">classe ${s.rating.posizione} di 9</small>` : '—',
          s.rating ? `${esc(s.rating.descrizione ?? '')}${rating}` : 'nessuna classe assegnata')}
      </div>
      ${s.lineaCreditoConsigliata ? `<p class="mt-nota" style="margin:16px 0 0">Linea di credito commerciale consigliata dal Registro: ${euro(s.lineaCreditoConsigliata)}.<span id="frase-noleggio">${fraseNoleggio(credito)}</span> Il rating è informativo e non entra nel semaforo.</p>` : ''}
      <div id="scheda-semaforo">${bloccoSemaforo(credito, titoloScheda(), credito?.etichetta ? '' : 'Senza importo pesano solo utile e anni di attività: il rapporto con il fatturato arriva col prezzo.')}</div>
      <p class="mt-nota" style="margin:16px 0 0">Soci, amministratori e bilancio completo sono nel tab <button type="button" class="mt-link" data-vai="info">Info aggiuntive</button>.</p>
    </article>`;
}

function tabellaRighe(righe: any[]): string {
  if (!righe?.length) return '<p class="mt-nota">Nessun dato.</p>';
  return `<div class="mt-scorri"><table class="mt-tabella"><tbody>${righe
    .map((r) => (r.sotto
      ? `<tr class="sotto"><td colspan="2">${esc(r.etichetta)}</td></tr>`
      : `<tr><td>${esc(r.etichetta)}</td><td class="num">${esc(r.valore)}</td></tr>`))
    .join('')}</tbody></table></div>`;
}

function rendiInfo(info: any, scheda: any): string {
  if (!info) {
    return `<p class="mt-vuoto">Le info aggiuntive di ${esc(scheda?.ragioneSociale ?? 'questa azienda')} non sono più in archivio
      (restano 30 giorni dalla verifica). Rifai la verifica dalla sezione Cliente per averle di nuovo.</p>`;
  }
  const soci = info.soci?.length
    ? `<table class="mt-tabella"><thead><tr><th>Socio</th><th class="num">Quota</th></tr></thead><tbody>${info.soci
      .map((x: any) => `<tr><td>${esc(x.nome)}${x.persona ? '' : ' <span class="mt-id">società</span>'}</td><td class="num">${x.quota != null ? `${num(x.quota, 2)}%` : '—'}</td></tr>`)
      .join('')}</tbody></table>`
    : '<p class="mt-nota">Nessun socio in elenco: è il caso delle cooperative e delle ditte individuali.</p>';
  const amm = info.amministratori?.length
    ? `<table class="mt-tabella"><thead><tr><th>Nome</th><th>Ruolo</th><th class="num">Età</th></tr></thead><tbody>${info.amministratori
      .map((m: any) => `<tr><td>${esc(m.nome)}${m.legaleRappresentante ? ' <span class="mt-id">legale rappresentante</span>' : ''}</td><td>${esc(m.ruoli)}</td><td class="num">${m.eta ?? '—'}</td></tr>`)
      .join('')}</tbody></table>`
    : '<p class="mt-nota">Nessun amministratore in elenco.</p>';
  const bilancio = info.bilancio?.length
    ? info.bilancio.map((b: any) => `<details><summary>${esc(b.titolo)} <span class="mt-id">${b.voci.length} voci</span></summary>${tabellaRighe(b.voci)}</details>`).join('')
    : '<p class="mt-nota">Bilancio riclassificato non disponibile.</p>';

  return `
    <p class="mt-rs">${esc(scheda?.ragioneSociale ?? '')}</p>
    <p class="mt-meta">P.IVA ${esc(scheda?.piva ?? '')}</p>
    <h3 class="mt-h3">Soci</h3>${soci}
    <h3 class="mt-h3">Amministratori</h3>${amm}
    <h3 class="mt-h3">Bilancio riclassificato</h3>${bilancio}
    <h3 class="mt-h3">Indici e aggregati economici</h3>
    <details><summary>Apri gli indici</summary>${tabellaRighe(info.indici)}</details>
    <h3 class="mt-h3">Anagrafica e inquadramento</h3>
    <details><summary>Apri l'anagrafica</summary>${tabellaRighe(info.anagrafica)}</details>`;
}

let attesaEventi: ReturnType<typeof setTimeout> | undefined;

/**
 * Eventi negativi "in verifica": la pagina richiede l'esito ogni dieci secondi
 * (dal database, non da Openapi) e ridisegna il semaforo quando cambia. Si ferma
 * quando arriva un esito, dopo due minuti, o se nel frattempo si cerca un altro cliente.
 */
function aspettaEventi(ricercaId: string, giro = 0) {
  clearTimeout(attesaEventi);
  attesaEventi = setTimeout(async () => {
    if (stato.ricerca?.id !== ricercaId) return;
    const { res, corpo } = await apiJson(api('merito', { id: ricercaId, eventi: '1' }));
    if (stato.ricerca?.id !== ricercaId || !res.ok || !corpo?.ok) return;
    stato.ricerca.credito = corpo.credito;
    stato.ricerca.eventi = corpo.eventi;
    const box = document.getElementById('scheda-semaforo');
    if (box) box.innerHTML = bloccoSemaforo(corpo.credito, titoloScheda());
    // Se gli eventi spengono l'indicazione (rosso), sparisce anche la frase sul noleggio
    const frase = document.getElementById('frase-noleggio');
    if (frase) frase.innerHTML = fraseNoleggio(corpo.credito);
    if (corpo.eventi === 'in-verifica' && giro < 12) aspettaEventi(ricercaId, giro + 1);
    else document.dispatchEvent(new CustomEvent('mt:eventi'));
  }, 10_000);
}

/** Mette la ricerca al centro del portale: scheda, info, proposte */
export function usaRicerca(r: { ricercaId: string; scheda: any; info: any; credito: any; eventi?: string | null }) {
  stato.ricerca = { id: r.ricercaId, scheda: r.scheda, info: r.info, credito: r.credito, eventi: r.eventi ?? null };
  stato.proposta = null;
  stato.ultimoPreventivo = null;
  $('scheda').innerHTML = rendiScheda(r.scheda, r.credito);
  $('info').innerHTML = rendiInfo(r.info, r.scheda);
  document.dispatchEvent(new CustomEvent('mt:ricerca'));
  if (r.eventi === 'in-verifica') aspettaEventi(r.ricercaId);
}

/** Riapre una ricerca dallo Storico e porta sulla scheda indicata. False se non si e' riaperta */
export async function riapriRicerca(id: string, tab = 'cliente'): Promise<boolean> {
  const { res, corpo } = await apiJson(api('merito', { id }));
  if (!res.ok || !corpo?.ok) {
    alert(traduci(corpo?.error ?? ''));
    return false;
  }
  usaRicerca(corpo);
  apriTab(tab);
  return true;
}

export function montaCliente() {
  const btn = $<HTMLButtonElement>('cerca-btn');
  const campo = $<HTMLInputElement>('piva');
  const msg = $('cerca-msg');

  async function cerca() {
    const piva = campo.value.replace(/\D/g, '');
    if (piva.length !== 11) return messaggio(msg, 'Servono le 11 cifre della partita IVA.', false);
    btn.disabled = true;
    btn.textContent = 'Verifico...';
    msg.hidden = true;
    const { res, corpo } = await apiJson('/api/motore/merito', {
      method: 'POST',
      body: JSON.stringify({ f: stato.slug, piva }),
    });
    btn.disabled = false;
    btn.textContent = 'Verifica';
    if (!res.ok || !corpo?.ok) return messaggio(msg, traduci(corpo?.error ?? ''), false);
    usaRicerca(corpo);
  }

  btn.addEventListener('click', () => void cerca());
  campo.addEventListener('keydown', (e) => { if (e.key === 'Enter') void cerca(); });

  // I bottoni dentro le schede portano agli altri tab
  document.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest('[data-vai]') as HTMLElement | null;
    if (el) apriTab(el.dataset.vai!);
  });
}
