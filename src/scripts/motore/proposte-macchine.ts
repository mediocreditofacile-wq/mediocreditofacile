// Scheda Proposte del settore "macchine": famiglia, allestimento, accessori,
// consegna, durata e prezzo; poi canoni sulle due tabelle, date e costi.
// Il conto lo fa il server (/api/motore/proposte): qui si raccolgono le scelte e
// si disegna quello che torna. Ogni cambio rifa' il conto dopo una breve pausa.

import { dataEstesaDaIso as giorno } from '../../lib/duplex-calendario';
import { bloccoSemaforo } from './cliente';
import { $, apiJson, esc, euro, stato, traduci } from './comune';
import { accessoriPer, cambiaQuantita, ETICHETTA_ALLESTIMENTO, famiglie, listinoConfigurazione, tieniCompatibili, type Famiglia, type VoceVista } from './macchine-catalogo';

const pad = (n: number) => String(n).padStart(2, '0');
const oggiIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

let famigliaScelta: Famiglia | null = null;
let macchina: VoceVista | null = null;
let quantita: Record<string, number> = {};
let prezzoToccato = false;
let consegna = oggiIso();
let durata = 60;
let timer: ReturnType<typeof setTimeout> | undefined;
let richiesta = 0;

/** L'input che va al server: lo stesso serve al preventivo PDF */
export function inputMacchine() {
  if (!macchina) return null;
  // Senza ricerca la proposta si fa lo stesso: niente semaforo, e il cliente
  // del preventivo e' il nome scritto a mano
  const intestatario = document.getElementById('intestatario') as HTMLInputElement | null;
  return {
    f: stato.slug,
    ricercaId: stato.ricerca?.id ?? '',
    intestatario: stato.ricerca ? '' : intestatario?.value ?? '',
    codice: macchina.codice,
    accessori: { ...quantita },
    prezzo: Number($<HTMLInputElement>('prezzo').value) || null,
    consegna,
    durata,
  };
}

function rendiFamiglie() {
  const lista = famiglie(stato.catalogo);
  $('catalogo').innerHTML = lista.length
    ? lista.map((f) => `
        <button type="button" class="mt-voce" data-famiglia="${esc(f.nome)}" aria-pressed="${famigliaScelta?.nome === f.nome}">
          <span class="mt-voce__nome">${esc(f.nome)}</span>
          <span class="mt-id">${f.varianti.length > 1 ? f.varianti.map((v) => esc(ETICHETTA_ALLESTIMENTO[v.attributi?.allestimento] ?? v.nome)).join(' · ') : ''}</span>
          <span class="mt-voce__prezzo">da ${euro(f.da)}</span>
        </button>`).join('')
    : '<p class="mt-vuoto">Il catalogo di questo fornitore è vuoto. Scrivi a Mediocredito Facile.</p>';
}

function rendiConfigurazione() {
  const box = $('macchine-config');
  if (!famigliaScelta || !macchina) { box.innerHTML = ''; return; }
  const varianti = famigliaScelta.varianti;
  const acc = accessoriPer(famigliaScelta, macchina);
  const durate: number[] = stato.proposta?.esito?.macchine?.righe?.map((r: any) => r.durata) ?? [24, 36, 48, 60];
  box.innerHTML = `
    <div class="mt-griglia">
      ${varianti.length > 1 ? `
        <label class="mt-campo"><span>Allestimento</span>
          <select id="mc-allestimento" class="mt-input">${varianti.map((v) => `
            <option value="${esc(v.codice)}" ${v.codice === macchina!.codice ? 'selected' : ''}>${esc(ETICHETTA_ALLESTIMENTO[v.attributi?.allestimento] ?? v.nome)} - ${euro(v.prezzo)}</option>`).join('')}
          </select></label>` : ''}
      <label class="mt-campo"><span>Consegna prevista</span>
        <input type="date" id="mc-consegna" class="mt-input" value="${esc(consegna)}" /></label>
    </div>
    ${acc.length ? `
      <p class="mt-semaforo__tit" style="margin-top:16px">Accessori</p>
      <ul class="mt-accessori">${acc.map((a) => {
        const q = quantita[a.codice] ?? 0;
        const passo = Number(a.attributi?.passo) || 1;
        const max = Number(a.attributi?.massimo) || 1;
        return `<li>
          <span>${esc(a.nome)} <span class="mt-id">${euro(a.prezzo)}${passo > 1 ? ` x ${passo}${a.attributi?.nota ? `, ${esc(a.attributi.nota)}` : ''}` : ''}</span></span>
          <span class="mt-contatore">
            <button type="button" class="mt-btn mt-btn--secondario" data-acc="${esc(a.codice)}" data-verso="-1" ${q === 0 ? 'disabled' : ''} aria-label="Togli ${esc(a.nome)}">−</button>
            <span aria-live="polite">${q}</span>
            <button type="button" class="mt-btn mt-btn--secondario" data-acc="${esc(a.codice)}" data-verso="1" ${q >= max ? 'disabled' : ''} aria-label="Aggiungi ${esc(a.nome)}">+</button>
          </span></li>`;
      }).join('')}</ul>` : ''}
    <p class="mt-semaforo__tit" style="margin-top:16px">Durata</p>
    <div class="mt-durate" role="group" aria-label="Durata">${durate.map((d) => `
      <button type="button" class="mt-btn ${d === durata ? '' : 'mt-btn--secondario'}" data-durata="${d}" aria-pressed="${d === durata}">${d} mesi</button>`).join('')}
    </div>`;
}

function aggiornaPrezzo() {
  if (!macchina || !famigliaScelta) return;
  const tot = listinoConfigurazione(macchina, accessoriPer(famigliaScelta, macchina), quantita);
  const extra = Math.round((tot - macchina.prezzo) * 100) / 100;
  if (!prezzoToccato) $<HTMLInputElement>('prezzo').value = String(tot);
  $('prezzo-listino').innerHTML =
    `Listino ${euro(macchina.prezzo)}${extra ? ` + accessori ${euro(extra)} = ${euro(tot)}` : ''}. Il prezzo si può ritoccare: le proposte seguono.` +
    (prezzoToccato ? ' <button type="button" class="mt-link" id="mc-usa-listino">Torna al listino</button>' : '');
}

function pianifica(ms = 450) {
  clearTimeout(timer);
  timer = setTimeout(() => void calcola(), ms);
}

async function calcola() {
  const input = inputMacchine();
  if (!input) return;
  const mia = ++richiesta;
  $('proposte-esito').innerHTML = '<p class="mt-nota" style="margin-top:24px">Calcolo le proposte...</p>';
  const { res, corpo } = await apiJson('/api/motore/proposte', { method: 'POST', body: JSON.stringify(input) });
  if (mia !== richiesta) return;
  if (!res.ok || !corpo?.ok) {
    $('proposte-esito').innerHTML = `<p class="mt-msg mt-msg--errore">${esc(traduci(corpo?.error ?? ''))}</p>`;
    return;
  }
  stato.proposta = { input, esito: corpo };
  rendiEsito(corpo);
  document.dispatchEvent(new CustomEvent('mt:proposta'));
}

function pagamento(p: any, nome: string, mesi: number): string {
  if (!p) return `<div class="mt-card"><p class="mt-nota" style="margin:0">${esc(nome)}: non disponibile su questo importo.</p></div>`;
  return `
    <div class="mt-card">
      <p class="mt-semaforo__tit">${esc(nome)}: inizia a pagare il ${esc(giorno(p.primaFattura))}</p>
      <table class="mt-tabella"><tbody>
        <tr><td>Canone mensile</td><td class="num">${euro(p.canone, 2)}</td></tr>
        <tr><td>Fattura trimestrale anticipata</td><td class="num">${euro(p.trimestre, 2)}</td></tr>
        <tr><td>Pro rata, ${p.giorniProRata} giorni a ${euro(p.costoGiornaliero, 2)}</td>
            <td class="num">${euro(p.importoProRata, 2)} <span class="mt-id">${p.inCoda ? 'in coda' : 'alla consegna'}</span></td></tr>
        <tr><td>Fine contratto</td><td class="num">${esc(giorno(p.fineContratto))}</td></tr>
        <tr class="scelta"><td>Totale in ${mesi} mesi, polizza esclusa</td><td class="num">${euro(p.totale, 2)}</td></tr>
      </tbody></table>
    </div>`;
}

function rendiEsito(r: any) {
  const m = r.macchine;
  const alt: string | null = m.nomeAlternativa;
  const differenza = r.importo !== r.listino ? `Prezzo trattato ${euro(r.importo)} contro ${euro(r.listino)} di listino.` : '';
  const avvisi = r.avvisi?.length ? `<ul class="mt-avvisi">${r.avvisi.map((a: string) => `<li>${esc(a)}</li>`).join('')}</ul>` : '';
  const cella = (v: number | null, dec = 2) => (v == null ? '—' : euro(v, dec));

  const tabella = `
    <div class="mt-scorri"><table class="mt-tabella">
      <thead><tr><th>Durata</th><th class="num">Tradizionale</th>${alt ? `<th class="num">${esc(alt)}</th>` : ''}<th class="num">Riscatto</th><th class="num">Totale tradizionale</th></tr></thead>
      <tbody>${m.righe.map((x: any) => `
        <tr class="${x.durata === m.durata ? 'scelta' : ''}"><td>${x.durata} mesi</td>
          <td class="num">${cella(x.canone)}</td>${alt ? `<td class="num">${cella(x.canoneAlternativo)}</td>` : ''}
          <td class="num">${euro(x.riscatto)} <span class="mt-id">${x.riscattoPerc}%</span></td>
          <td class="num">${cella(x.totale, 0)}</td></tr>`).join('')}</tbody>
    </table></div>
    <p class="mt-nota">Zero anticipo, canone deducibile. Il totale somma canoni, istruttoria e riscatto; la polizza è a parte.${r.notaNoleggio ? ` ${esc(r.notaNoleggio)}` : ''}</p>`;

  const dettaglio = `
    <h3 class="mt-h3">Con consegna il ${esc(giorno(m.consegna))}, a ${m.durata} mesi</h3>
    <div class="mt-due">${pagamento(m.tradizionale, 'Tradizionale', m.durata)}${alt ? pagamento(m.alternativa, alt, m.durata) : ''}</div>
    <table class="mt-tabella" style="margin-top:16px"><tbody>
      <tr><td>Spese di istruttoria, una tantum</td><td class="num">${euro(m.istruttoria)}</td></tr>
      <tr><td>Polizza all risk, all'anno, fuori dal totale</td><td class="num">${euro(m.polizzaAnnua, 2)}</td></tr>
      <tr><td>Riscatto finale facoltativo, ${m.riscattoPerc}%</td><td class="num">${euro(m.riscatto, 2)}</td></tr>
    </tbody></table>
    ${alt === 'Grace Period' ? '<p class="mt-nota"><a href="/docs/duplex-grace-period.pdf" target="_blank" rel="noopener">Come funziona la Grace Period</a>: il foglio da girare al cliente.</p>' : ''}`;

  const semaforo = r.semaforo === 'non-verificato'
    ? `<div class="mt-card">
        <p class="mt-semaforo__tit">Cliente non ancora verificato</p>
        <p class="mt-nota" style="margin:0 0 10px">Canoni e date valgono già, e il preventivo si può consegnare.
          Prima della visita o della dimostrazione verifica la partita IVA: qui compare il semaforo.${differenza ? ` ${esc(differenza)}` : ''}</p>
        <button type="button" class="mt-btn mt-btn--secondario" data-vai="cliente">Verifica il cliente</button>
      </div>`
    : bloccoSemaforo(r, `Valutazione su ${euro(r.importo)}`, differenza);
  $('proposte-esito').innerHTML = `
    ${semaforo}
    ${avvisi}
    ${r.motivoNoNoleggio && !m.righe.some((x: any) => x.canoneAlternativo != null)
      ? `<p class="mt-msg mt-msg--errore">${esc(r.motivoNoNoleggio)}</p>`
      : `<h3 class="mt-h3">Canoni per durata</h3>${tabella}${dettaglio}`}
    <div id="proposte-azioni" class="mt-azioni"></div>`;
  rendiConfigurazione();
  document.dispatchEvent(new CustomEvent('mt:azioni'));
}

function scegliFamiglia(nome: string) {
  famigliaScelta = famiglie(stato.catalogo).find((f) => f.nome === nome) ?? null;
  if (!famigliaScelta) return;
  macchina = famigliaScelta.varianti.find((v) => v.attributi?.allestimento === 'cavo') ?? famigliaScelta.varianti[0];
  quantita = {};
  prezzoToccato = false;
  aggiornaPrezzo();
  rendiFamiglie();
  rendiConfigurazione();
  pianifica(0);
}

function cambia(codice: string, verso: 1 | -1) {
  if (!famigliaScelta || !macchina) return;
  const a = accessoriPer(famigliaScelta, macchina).find((x) => x.codice === codice);
  if (!a) return;
  quantita[codice] = cambiaQuantita(quantita[codice] ?? 0, verso, Number(a.attributi?.passo) || 1, Number(a.attributi?.massimo) || 1);
  aggiornaPrezzo();
  rendiConfigurazione();
  pianifica();
}

/** Il catalogo e' cambiato dal Pannello MCF: si ridisegna senza ricaricare */
export function aggiornaCatalogoMacchine(lista: any[]) {
  stato.catalogo = lista;
  if (famigliaScelta) {
    famigliaScelta = famiglie(lista).find((f) => f.nome === famigliaScelta!.nome) ?? null;
    if (!famigliaScelta || !famigliaScelta.varianti.some((v) => v.codice === macchina?.codice)) {
      famigliaScelta = null;
      macchina = null;
      quantita = {};
    } else {
      quantita = tieniCompatibili(quantita, accessoriPer(famigliaScelta, macchina!));
    }
  }
  rendiFamiglie();
  rendiConfigurazione();
}

/** Sopra le proposte: per chi sono, o come si fanno prima della verifica */
function intestazione() {
  const r = stato.ricerca;
  $('proposte-corpo').hidden = false;
  $('proposte-cliente').textContent = r
    ? `Proposte per ${r.scheda.ragioneSociale}, P.IVA ${r.scheda.piva}.`
    : 'Scegli la macchina e prepara tutti i preventivi che servono. Quando la trattativa si fa seria, verifica la partita IVA del cliente nella sezione Verifica cliente: le proposte mostreranno il semaforo.';
  const campo = document.getElementById('campo-intestatario');
  if (campo) campo.hidden = Boolean(r);
}

export function montaProposteMacchine() {
  rendiFamiglie();
  intestazione();
  document.addEventListener('mt:ricerca', () => {
    intestazione();
    $('proposte-esito').innerHTML = '';
    rendiFamiglie();
    if (macchina) pianifica(0);
  });
  // Gli eventi negativi sono arrivati: il semaforo definitivo cambia
  document.addEventListener('mt:eventi', () => { if (macchina) pianifica(0); });

  $('catalogo').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('[data-famiglia]') as HTMLElement | null;
    if (b) scegliFamiglia(b.dataset.famiglia!);
  });
  $('macchine-config').addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const acc = t.closest('[data-acc]') as HTMLElement | null;
    if (acc) return cambia(acc.dataset.acc!, Number(acc.dataset.verso) === -1 ? -1 : 1);
    const d = t.closest('[data-durata]') as HTMLElement | null;
    if (d) {
      durata = Number(d.dataset.durata);
      rendiConfigurazione();
      pianifica(0);
    }
  });
  $('macchine-config').addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.id === 'mc-allestimento' && famigliaScelta) {
      macchina = famigliaScelta.varianti.find((v) => v.codice === t.value) ?? macchina;
      // Da batteria a cavo la batteria di scorta non si offre piu': via dalla scelta
      quantita = tieniCompatibili(quantita, accessoriPer(famigliaScelta, macchina!));
      aggiornaPrezzo();
      rendiConfigurazione();
      pianifica(0);
    }
    if (t.id === 'mc-consegna' && t.value) {
      consegna = t.value;
      pianifica(0);
    }
  });
  $('prezzo').addEventListener('input', () => {
    prezzoToccato = true;
    aggiornaPrezzo();
    pianifica();
  });
  $('prezzo-listino').addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id !== 'mc-usa-listino') return;
    prezzoToccato = false;
    aggiornaPrezzo();
    pianifica(0);
  });
}
