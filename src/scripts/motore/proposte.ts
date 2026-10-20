// Sezione Proposte: catalogo, prezzo trattato, proposte di noleggio e leasing,
// business plan energetico sui fornitori fotovoltaico. I settori macchine e
// distinta hanno una scheda loro (proposte-macchine.ts, proposte-distinta.ts).
//
// Il calcolo e' tutto lato server (/api/motore/proposte): qui si raccolgono le
// scelte dell'agente e si disegna quello che torna. Ogni cambio rifa' il conto
// dopo una breve pausa, cosi' digitare un prezzo non manda dieci richieste.

import { bloccoSemaforo } from './cliente';
import { $, apiJson, esc, euro, num, stato, traduci } from './comune';
import { aggiornaProposteDistinta, inputDistinta, montaProposteDistinta } from './proposte-distinta';
import { aggiornaCatalogoMacchine, inputMacchine, montaProposteMacchine } from './proposte-macchine';

let voceScelta: any = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let richiestaInCorso = 0;

const fv = () => stato.settore === 'fotovoltaico';
const campo = (id: string) => document.getElementById(id) as HTMLInputElement | null;

function rendiCatalogo() {
  const attr = (v: any) => {
    const a = v.attributi ?? {};
    if (!fv()) return v.descrizione ? esc(v.descrizione) : '';
    return `${num(a.kwp)} kWp${a.kwh_accumulo ? ` · accumulo ${num(a.kwh_accumulo)} kWh` : ''}`;
  };
  $('catalogo').innerHTML = stato.catalogo.length
    ? stato.catalogo
      .map((v) => `
        <button type="button" class="mt-voce" data-voce="${esc(v.codice)}" aria-pressed="${voceScelta?.codice === v.codice}">
          <span class="mt-voce__nome">${esc(v.nome)}</span>
          <span class="mt-id">${attr(v)}</span>
          <span class="mt-voce__prezzo">${euro(v.prezzo)} di listino</span>
        </button>`)
      .join('')
    : '<p class="mt-vuoto">Il catalogo di questo fornitore è vuoto. Scrivi a Mediocredito Facile.</p>';
}

function scegliVoce(codice: string) {
  voceScelta = stato.catalogo.find((v) => v.codice === codice) ?? null;
  if (!voceScelta) return;
  $<HTMLInputElement>('prezzo').value = String(voceScelta.prezzo);
  $('prezzo-listino').textContent = `Listino ${euro(voceScelta.prezzo)}. Il prezzo si può ritoccare: le proposte seguono.`;
  rendiCatalogo();
  pianifica(0);
}

/** L'input che va al server: lo stesso servira' al preventivo PDF */
export function inputCorrente() {
  if (stato.settore === 'macchine') return inputMacchine();
  if (stato.settore === 'distinta') return inputDistinta();
  if (!stato.ricerca || !voceScelta) return null;
  const val = (id: string) => campo(id)?.value ?? '';
  return {
    f: stato.slug,
    ricercaId: stato.ricerca.id,
    codice: voceScelta.codice,
    prezzo: Number($<HTMLInputElement>('prezzo').value) || voceScelta.prezzo,
    bp: fv()
      ? {
          provincia: val('bp-provincia').toUpperCase(),
          comune: val('bp-comune'),
          consumoAnnuo: Number(val('bp-consumo')) || null,
          prezzoKwh: Number(val('bp-prezzo-kwh')) || null,
          profilo: val('bp-profilo') || 'diurno',
          durata: Number(val('bp-durata')) || null,
          includiSabatini: campo('bp-sabatini')?.checked !== false,
          includiIper: campo('bp-iper')?.checked !== false,
        }
      : undefined,
  };
}

function pianifica(ms = 450) {
  clearTimeout(timer);
  timer = setTimeout(() => void calcola(), ms);
}

async function calcola() {
  const input = inputCorrente();
  if (!input) return;
  const mia = ++richiestaInCorso;
  $('proposte-esito').innerHTML = '<p class="mt-nota" style="margin-top:24px">Calcolo le proposte...</p>';
  const { res, corpo } = await apiJson('/api/motore/proposte', { method: 'POST', body: JSON.stringify(input) });
  // Una risposta vecchia non deve coprire quella del prezzo appena digitato
  if (mia !== richiestaInCorso) return;
  if (!res.ok || !corpo?.ok) {
    $('proposte-esito').innerHTML = `<p class="mt-msg mt-msg--errore">${esc(traduci(corpo?.error ?? ''))}</p>`;
    return;
  }
  stato.proposta = { input, esito: corpo };
  rendiEsito(corpo);
  document.dispatchEvent(new CustomEvent('mt:proposta'));
}

function tabellaNoleggio(r: any): string {
  if (!r.noleggio.length) return `<p class="mt-nota">${esc(r.motivoNoNoleggio ?? 'Noleggio non disponibile su questo importo.')}</p>`;
  const scelta = r.bp?.durata;
  return `
    <div class="mt-scorri"><table class="mt-tabella">
      <thead><tr><th>Durata</th><th class="num">Canone mensile</th><th class="num">Riscatto finale</th><th class="num">Totale</th></tr></thead>
      <tbody>${r.noleggio
        .map((n: any) => `<tr class="${n.durata === scelta ? 'scelta' : ''}">
          <td>${n.durata} mesi</td><td class="num">${euro(n.canone, 2)}</td>
          <td class="num">${euro(n.riscatto)} <span class="mt-id">${num(n.riscattoPerc)}%</span></td>
          <td class="num">${euro(n.totale)}</td></tr>`)
        .join('')}</tbody>
    </table></div>
    <p class="mt-nota">Zero anticipo, canone deducibile, Centrale Rischi non impegnata. Il riscatto è un valore medio indicativo.${
      r.notaNoleggio ? ` ${esc(r.notaNoleggio)}` : ''}</p>`;
}

function tabellaLeasing(r: any): string {
  if (!r.leasing.length) return `<p class="mt-nota">${esc(r.motivoNoLeasing ?? 'Leasing non disponibile su questo importo.')}</p>`;
  const scelta = r.bp?.durata;
  return `
    <div class="mt-scorri"><table class="mt-tabella">
      <thead><tr><th>Durata</th><th class="num">Anticipo</th><th class="num">Rata mensile</th><th class="num">Riscatto</th><th class="num">Totale</th></tr></thead>
      <tbody>${r.leasing
        .map((l: any) => `<tr class="${l.durata === scelta ? 'scelta' : ''}">
          <td>${l.durata} mesi<br><span class="mt-id">anticipo + ${l.numRate} rate</span></td>
          <td class="num">${euro(l.anticipo)} <span class="mt-id">${num(l.anticipoPerc)}%</span></td>
          <td class="num">${euro(l.rata, 2)}</td>
          <td class="num">${euro(l.riscatto)} <span class="mt-id">${num(l.riscattoPerc)}%</span></td>
          <td class="num">${euro(l.totale)}</td></tr>`)
        .join('')}</tbody>
    </table></div>
    <p class="mt-nota">Il totale comprende istruttoria (${euro(r.leasing[0].speseIstruttoria)}) e incasso delle rate (${euro(r.leasing[0].speseIncassoRata)} a rata).
      La rata definitiva la assegna la società di leasing sul merito creditizio del cliente.</p>`;
}

function sezioneBp(r: any): string {
  const b = r.bp;
  if (!b) return '';
  // Le durate del business plan sono quelle del noleggio su questo importo
  const sel = campo('bp-durata');
  if (sel) {
    const attuale = sel.value;
    sel.innerHTML = `<option value="">Consigliata (${b.durataConsigliata} mesi)</option>${b.durate
      .map((m: number) => `<option value="${m}">${m} mesi</option>`).join('')}`;
    sel.value = b.durate.includes(Number(attuale)) ? attuale : '';
  }
  const age = document.getElementById('bp-agevolazioni');
  if (age) {
    age.hidden = !b.conLeasing;
    document.getElementById('lab-sabatini')!.hidden = !b.agevolazioniAperte?.sabatini;
    document.getElementById('lab-iper')!.hidden = !b.agevolazioniAperte?.iper;
  }

  const fonte = b.datiRealiConsumo
    ? 'Calcolato sui consumi reali del cliente.'
    : 'Stima per un cliente tipo: senza i consumi della bolletta si usano le ipotesi di zona, e i prospetti lo dichiarano.';
  const agevolazioni = [
    b.conSabatini ? `<tr><td>Contributo Nuova Sabatini</td><td class="num">${euro(b.sabatini)}</td></tr><tr><td>Al netto della gestione pratica</td><td class="num">${euro(b.sabatiniNetto)}</td></tr>` : '',
    b.conIper ? `<tr><td>Risparmio IRES da iperammortamento</td><td class="num">${euro(b.iresIper)}</td></tr><tr><td>Al netto della pratica 4.0</td><td class="num">${euro(b.iperNetto)}</td></tr>` : '',
  ].join('');

  return `
    <h3 class="mt-h3">Il business plan</h3>
    <p class="mt-nota" style="margin-top:0">${b.durataForzata ? `Durata ${b.durata} mesi, scelta da te: la consigliata è ${b.durataConsigliata}.` : `Durata consigliata ${b.durata} mesi: la più corta in cui il canone, al netto della deducibilità, è coperto dal risparmio.`}</p>
    <div class="mt-kpi">
      <div class="mt-kpi__card"><span class="mt-kpi__num">${euro(b.canone, 2)}</span><span class="mt-kpi__et">Canone mensile a ${b.durata} mesi</span></div>
      <div class="mt-kpi__card"><span class="mt-kpi__num">${Math.round(b.coperturaCanone * 100)}%</span><span class="mt-kpi__et">Quota del canone coperta dal risparmio in bolletta</span></div>
      <div class="mt-kpi__card"><span class="mt-kpi__num">${euro(b.beneficioMese)}</span><span class="mt-kpi__et">Beneficio energetico al mese</span></div>
      <div class="mt-kpi__card"><span class="mt-kpi__num">${num(b.produzione)} kWh</span><span class="mt-kpi__et">Produzione stimata all'anno</span></div>
    </div>
    <div class="mt-due">
      <div>
        <p class="mt-semaforo__tit">Noleggio operativo</p>
        <table class="mt-tabella"><tbody>
          <tr><td>Totale canoni a ${b.durata} mesi</td><td class="num">${euro(b.totCanoni)}</td></tr>
          <tr><td>Riscatto finale</td><td class="num">${euro(b.riscatto)}</td></tr>
          <tr><td>Risparmio fiscale (IRES e IRAP)</td><td class="num">${euro(b.fiscoNol)}</td></tr>
          <tr class="scelta"><td>Costo netto stimato</td><td class="num">${euro(b.costoNettoNol)}</td></tr>
        </tbody></table>
      </div>
      ${b.conLeasing ? `
      <div>
        <p class="mt-semaforo__tit">Leasing finanziario</p>
        <table class="mt-tabella"><tbody>
          <tr><td>Anticipo ${num(b.leasing.anticipoPerc)}%</td><td class="num">${euro(b.leasing.anticipo)}</td></tr>
          <tr><td>${b.leasing.numRate} rate da</td><td class="num">${euro(b.leasing.rata, 2)}</td></tr>
          <tr><td>Totale con riscatto e spese</td><td class="num">${euro(b.totLeasing)}</td></tr>
          ${agevolazioni}
          <tr class="scelta"><td>Costo netto stimato</td><td class="num">${euro(b.costoNettoLeasing)}</td></tr>
        </tbody></table>
        <p class="mt-nota">Il leasing porta la proprietà del bene e apre le agevolazioni, ma impegna le linee bancarie e chiede una delibera piena.</p>
      </div>` : ''}
    </div>
    <h3 class="mt-h3">Il bilancio energetico</h3>
    <table class="mt-tabella"><tbody>
      <tr><td>Produzione stimata</td><td class="num">${num(b.produzione)} kWh/anno</td></tr>
      <tr><td>Autoconsumata</td><td class="num">${num(b.autoKwh)} kWh (${Math.round(b.autoconsumoQuota * 100)}%)</td></tr>
      <tr><td>Immessa in rete</td><td class="num">${num(b.cedKwh)} kWh</td></tr>
      <tr><td>Prezzo energia usato</td><td class="num">${num(b.prezzoKwh, 2)} €/kWh</td></tr>
      <tr><td>Beneficio complessivo</td><td class="num">${euro(b.beneficioAnno)}/anno</td></tr>
    </tbody></table>
    <p class="mt-nota">${fonte}</p>`;
}

function rendiEsito(r: any) {
  const differenza = r.importo !== r.listino
    ? ` Prezzo trattato ${euro(r.importo)} contro ${euro(r.listino)} di listino.`
    : '';
  const avvisi = r.avvisi?.length ? `<ul class="mt-avvisi">${r.avvisi.map((a: string) => `<li>${esc(a)}</li>`).join('')}</ul>` : '';

  if (r.bloccate) {
    $('proposte-esito').innerHTML = `
      ${bloccoSemaforo({ semaforo: r.semaforo, criteri: r.criteri, massimale: r.massimale }, `Valutazione su ${euro(r.importo)}`)}
      <div class="mt-card">
        <p class="mt-semaforo__tit">Su questo importo non si presenta una proposta standard</p>
        <p class="mt-nota">I numeri del cliente non reggono un canone o una rata senza un'istruttoria. Puoi abbassare
          l'importo, oppure caricare la pratica: la guarda Mediocredito Facile e ti dice come presentarla.</p>
      </div>
      <div id="proposte-azioni" class="mt-azioni"></div>`;
    document.dispatchEvent(new CustomEvent('mt:azioni'));
    return;
  }

  $('proposte-esito').innerHTML = `
    ${bloccoSemaforo({ semaforo: r.semaforo, criteri: r.criteri, massimale: r.massimale }, `Valutazione su ${euro(r.importo)}`, differenza.trim())}
    ${avvisi}
    <h3 class="mt-h3">Noleggio operativo</h3>
    ${tabellaNoleggio(r)}
    <h3 class="mt-h3">Leasing finanziario</h3>
    ${tabellaLeasing(r)}
    ${sezioneBp(r)}
    <div id="proposte-azioni" class="mt-azioni"></div>`;
  document.dispatchEvent(new CustomEvent('mt:azioni'));
}

/** Nuova ricerca: si riparte dal catalogo, il cliente e' cambiato */
function suNuovaRicerca() {
  const r = stato.ricerca;
  $('proposte-corpo').hidden = !r;
  $('proposte-cliente').textContent = r
    ? `Proposte per ${r.scheda.ragioneSociale}, P.IVA ${r.scheda.piva}.`
    : 'Verifica prima un cliente nella sezione Cliente.';
  $('proposte-esito').innerHTML = '';
  // Se il cliente ha la sede in una provincia, e' un buon punto di partenza per l'impianto
  const prov = /\(([A-Z]{2})\)\s*$/.exec(r?.scheda?.sede ?? '')?.[1];
  const campoProv = campo('bp-provincia');
  if (campoProv && prov) campoProv.value = prov;
  rendiCatalogo();
  if (voceScelta) pianifica(0);
}

/** Il catalogo e' cambiato dal pannello MCF: si ridisegna senza ricaricare */
export function aggiornaCatalogo(lista: any[]) {
  if (stato.settore === 'macchine') return aggiornaCatalogoMacchine(lista);
  if (stato.settore === 'distinta') return aggiornaProposteDistinta(lista);
  stato.catalogo = lista;
  if (voceScelta && !lista.some((v) => v.codice === voceScelta.codice)) voceScelta = null;
  rendiCatalogo();
}

export function montaProposte() {
  if (stato.settore === 'macchine') return montaProposteMacchine();
  if (stato.settore === 'distinta') return montaProposteDistinta();
  rendiCatalogo();
  document.addEventListener('mt:ricerca', suNuovaRicerca);
  $('catalogo').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('[data-voce]') as HTMLElement | null;
    if (b) scegliVoce(b.dataset.voce!);
  });
  const ricalcola = () => pianifica();
  for (const id of ['prezzo', 'bp-provincia', 'bp-comune', 'bp-consumo', 'bp-prezzo-kwh']) {
    campo(id)?.addEventListener('input', ricalcola);
  }
  for (const id of ['bp-profilo', 'bp-durata', 'bp-sabatini', 'bp-iper']) {
    campo(id)?.addEventListener('change', () => pianifica(0));
  }
}
