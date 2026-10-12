// Sezione Cliente e tab Info aggiuntive.
//
// La scheda ridotta e' quello che l'agente vede di suo: anagrafica, i numeri
// che contano, il rating (informativo, non entra nel semaforo) e un primo
// semaforo senza importo. Le info aggiuntive stanno in un tab a parte: soci,
// amministratori, anagrafica estesa, indici e bilancio riclassificato. Gli
// eventi negativi non arrivano mai qui: li vede solo MCF, all'invio della pratica.

import { $, api, apiJson, apriTab, esc, ETICHETTA_SEMAFORO, euro, messaggio, num, stato, traduci } from './comune';

const SCALA = ['A1', 'A2', 'A3', 'B1', 'B2', 'B3', 'C1', 'C2', 'C3'];

export function bloccoSemaforo(credito: any, titolo: string, nota = ''): string {
  const s = credito?.semaforo ?? 'giallo';
  const criteri = (credito?.criteri ?? [])
    .map((c: any) => `<li class="${c.ok === false ? 'ko' : ''}">${esc(c.nome)}: ${esc(c.valore)}${c.ok === false ? ' (da guardare)' : ''}</li>`)
    .join('');
  return `
    <div class="mt-semaforo mt-semaforo--${esc(s)}">
      <span class="mt-semaforo__luce" aria-hidden="true"></span>
      <div>
        <p class="mt-semaforo__tit">${esc(titolo)}: ${ETICHETTA_SEMAFORO[s] ?? esc(s)}</p>
        <ul class="mt-criteri">${criteri}</ul>
        ${credito?.massimale != null ? `<p class="mt-nota" style="margin:8px 0 0">Massimale finanziabile stimato: ${euro(credito.massimale)}.</p>` : ''}
        <p class="mt-nota" style="margin:8px 0 0">Valutazione indicativa, non è una delibera.${nota ? ` ${esc(nota)}` : ''}</p>
      </div>
    </div>`;
}

function cifra(et: string, val: string, sub = '') {
  return `<div class="mt-cifra"><div class="mt-cifra__et">${esc(et)}</div><div class="mt-cifra__val">${val}</div>${sub ? `<div class="mt-cifra__sub">${sub}</div>` : ''}</div>`;
}

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
        <button type="button" class="mt-btn" data-vai="proposte">Vai alle proposte</button>
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
      ${s.lineaCreditoConsigliata ? `<p class="mt-nota" style="margin:16px 0 0">Linea di credito commerciale consigliata dal Registro: ${euro(s.lineaCreditoConsigliata)}. Il rating è informativo e non entra nel semaforo.</p>` : ''}
      ${bloccoSemaforo(credito, 'Prima valutazione', 'Senza importo pesano solo utile e anni di attività: il rapporto con il fatturato arriva col prezzo.')}
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

/** Mette la ricerca al centro del portale: scheda, info, proposte */
export function usaRicerca(r: { ricercaId: string; scheda: any; info: any; credito: any }) {
  stato.ricerca = { id: r.ricercaId, scheda: r.scheda, info: r.info, credito: r.credito };
  stato.proposta = null;
  stato.ultimoPreventivo = null;
  $('scheda').innerHTML = rendiScheda(r.scheda, r.credito);
  $('info').innerHTML = rendiInfo(r.info, r.scheda);
  document.dispatchEvent(new CustomEvent('mt:ricerca'));
}

export async function riapriRicerca(id: string) {
  const { res, corpo } = await apiJson(api('merito', { id }));
  if (!res.ok || !corpo?.ok) return alert(traduci(corpo?.error ?? ''));
  usaRicerca(corpo);
  apriTab('cliente');
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
