// Pannello MCF: spesa del mese, configurazione della carrozzeria, catalogo.
// Lo vede solo l'admin MCF; le API lo ricontrollano comunque.
//
// L'import del catalogo legge le righe copiate da Excel: prima riga con le
// intestazioni, separatore tabulazione, punto e virgola o virgola. Le colonne
// riconosciute stanno in src/lib/motore/catalogo-import.ts.

import { $, api, apiJson, esc, euro, euroEsatto, messaggio, num, stato, traduci } from './comune';
import { aggiornaCatalogo } from './proposte';
import { leggiIncollato } from '../../lib/motore/catalogo-import';
import { etichettaMese } from '../../lib/motore/richieste';

let dati: any = null;

const opzioni = (lista: { valore: string; etichetta: string }[] | undefined, scelto: string) =>
  (lista ?? []).map((o) => `<option value="${esc(o.valore)}" ${o.valore === scelto ? 'selected' : ''}>${esc(o.etichetta)}</option>`).join('');

function rendi() {
  const c = dati.config;
  const s = dati.spesa;
  const r = dati.richieste;
  const quante = (n: number) => `${num(n)} ${n === 1 ? 'richiesta' : 'richieste'}`;
  const conto = (x: any) => r.prezzo != null
    ? `${quante(x.richieste)} a ${euro(r.prezzo, 2)}: <strong>${euro(x.importo, 2)}</strong>`
    : quante(x.richieste);
  const fv = c.settore === 'fotovoltaico';
  const mc = c.settore === 'macchine';
  $('mcf').innerHTML = `
    <article class="mt-card">
      <p class="mt-semaforo__tit">Ricerche del mese</p>
      <p class="mt-lead" style="margin:0">${euro(s.euro, 2)} su un tetto di ${euro(c.tettoMeseEuro)}, ${num(s.chiamate)} chiamate a Openapi (${esc(s.mese)}).
        Le schede già in cache non costano e non contano.</p>
    </article>
    ${r ? `<article class="mt-card">
      <p class="mt-semaforo__tit">Richieste da addebitare a ${esc(stato.carrozzeria?.nome ?? 'questo fornitore')}</p>
      <p class="mt-lead" style="margin:0">
        ${esc(etichettaMese(r.corrente.mese))}: ${conto(r.corrente)}${r.corrente.margine != null ? `, margine sulla spesa Openapi ${euro(r.corrente.margine, 2)}` : ''}.<br>
        ${esc(etichettaMese(r.precedente.mese))}: ${conto(r.precedente)}.
        ${r.prezzo == null ? '<br>Prezzo per richiesta non impostato: si imposta qui sotto, nella configurazione.' : ''}</p>
      <p class="mt-nota" style="margin:8px 0 0">Un cliente al mese: la stessa partita IVA verificata di nuovo nello stesso mese non conta. Il referente vede lo stesso conteggio nello Storico, senza importi.</p>
    </article>` : ''}

    <h3 class="mt-h3">Configurazione</h3>
    <div class="mt-griglia">
      <label class="mt-campo"><span>Settore</span><select id="cf-settore" class="mt-input">
        <option value="fotovoltaico" ${fv ? 'selected' : ''}>Fotovoltaico, con business plan</option>
        <option value="macchine" ${mc ? 'selected' : ''}>Macchine, con accessori e consegna</option>
        <option value="generico" ${!fv && !mc ? 'selected' : ''}>Generico</option></select></label>
      <label class="mt-campo"><span>Etichetta del bene</span><input id="cf-etichetta" class="mt-input" value="${esc(c.etichettaBene)}" /></label>
      <label class="mt-campo"><span>Listino del noleggio</span><select id="cf-listino" class="mt-input">
        ${opzioni(dati.opzioni?.listini, c.tabellaCanoni)}</select></label>
      <label class="mt-campo"><span>Listino affiancato</span><select id="cf-alternativa" class="mt-input">
        <option value="">Nessuno</option>${opzioni(dati.opzioni?.listini, c.tabellaAlternativa ?? '')}</select></label>
      <label class="mt-campo"><span>Regole del semaforo</span><select id="cf-regole" class="mt-input">
        ${opzioni(dati.opzioni?.regole, c.regoleSemaforo)}</select></label>
      <label class="mt-campo"><span>Partner del leasing</span><select id="cf-partner" class="mt-input">
        ${opzioni(dati.opzioni?.partner, c.partnerLeasing)}</select></label>
      <label class="mt-campo"><span>Leasing da, euro (0 = sempre)</span><input id="cf-soglia" type="number" min="0" step="1000" class="mt-input" value="${esc(c.sogliaLeasing)}" /></label>
      <label class="mt-campo"><span>Tetto ricerche al mese, euro</span><input id="cf-tetto" type="number" min="0" step="5" class="mt-input" value="${esc(c.tettoMeseEuro)}" /></label>
      <label class="mt-campo"><span>Prezzo per richiesta al fornitore, euro</span><input id="cf-prezzo-verifica" type="number" min="0" step="any" class="mt-input" value="${esc(c.prezzoVerifica ?? '')}" placeholder="vuoto: non si fattura" /></label>
      <label class="mt-campo"><span>Colore della testata</span><input id="cf-colore" type="color" class="mt-input" value="${esc(c.colore ?? '#664CCD')}" /></label>
      <label class="mt-campo"><span>Colore dei titoli nei PDF</span><input id="cf-accento" type="color" class="mt-input" value="${esc(c.accento ?? c.colore ?? '#664CCD')}" /></label>
    </div>
    <label class="mt-campo" style="margin-top:16px"><span>Documenti in più nella checklist, uno per riga</span>
      <textarea id="cf-extra" class="mt-input" rows="3">${esc((c.documentiExtra ?? []).join('\n'))}</textarea></label>
    <label class="mt-toggle" style="margin-top:12px"><input type="checkbox" id="cf-demo" ${c.demo ? 'checked' : ''} /> Portale dimostrativo (scritto a video e nei PDF)</label>
    <label class="mt-toggle" style="margin-top:12px"><input type="checkbox" id="cf-leasing" ${c.leasing !== false ? 'checked' : ''} /> Proponi anche il leasing</label>
    <div class="mt-azioni"><button type="button" id="cf-salva" class="mt-btn">Salva la configurazione</button></div>
    <p id="cf-msg" class="mt-msg" hidden></p>

    <h3 class="mt-h3">Catalogo</h3>
    <div class="mt-scorri"><table class="mt-tabella">
      <thead><tr><th>Codice</th><th>Nome</th>${fv ? '<th class="num">kWp</th><th class="num">Accumulo</th>' : ''}${mc ? '<th>Famiglia</th><th>Tipo</th>' : ''}<th class="num">Prezzo</th><th>Stato</th></tr></thead>
      <tbody>${dati.catalogo.map((v: any) => `<tr class="${v.attivo ? '' : 'spenta'}">
        <td>${esc(v.codice)}</td><td>${esc(v.nome)}</td>
        ${fv ? `<td class="num">${v.attributi?.kwp != null ? num(v.attributi.kwp) : '—'}</td><td class="num">${v.attributi?.kwh_accumulo ? `${num(v.attributi.kwh_accumulo)} kWh` : '—'}</td>` : ''}
        ${mc ? `<td>${esc(v.attributi?.famiglia ?? '—')}</td><td>${v.attributi?.tipo === 'accessorio' ? `accessorio${v.attributi.passo > 1 ? `, a ${v.attributi.passo}` : ''}, max ${v.attributi.massimo}${v.attributi.allestimento ? `, solo versione ${esc(v.attributi.allestimento)}` : ''}` : esc(v.attributi?.allestimento ?? 'macchina')}</td>` : ''}
        <td class="num">${euroEsatto(v.prezzo)}</td>
        <td><button type="button" class="mt-link" data-voce-stato="${esc(v.codice)}" data-attivo="${v.attivo ? '0' : '1'}">${v.attivo ? 'Spegni' : 'Riaccendi'}</button></td>
      </tr>`).join('')}</tbody></table></div>

    <h3 class="mt-h3">Importa da Excel</h3>
    <p class="mt-nota" style="margin-top:0">Copia le righe dal foglio, intestazione compresa, e incollale qui. Colonne riconosciute: codice, nome,
      prezzo${fv ? ', kwp, accumulo, installazione' : ''}${mc ? ', famiglia, allestimento (cavo, batteria, steam; su un accessorio lo offre solo con quella versione), tipo (accessorio), passo, massimo, nota' : ''}, descrizione. Lo stesso codice aggiorna la voce, non la duplica.</p>
    <textarea id="cf-incolla" class="mt-input" rows="6" placeholder="codice&#9;nome&#9;prezzo${fv ? '&#9;kwp&#9;accumulo' : ''}"></textarea>
    <div class="mt-azioni">
      <button type="button" id="cf-importa" class="mt-btn mt-btn--secondario">Importa le righe</button>
      <span id="cf-anteprima" class="mt-nota"></span>
    </div>
    <p id="cf-import-msg" class="mt-msg" hidden></p>`;
}

async function carica() {
  const { res, corpo } = await apiJson(api('admin'));
  if (!res.ok || !corpo?.ok) {
    $('mcf').innerHTML = `<p class="mt-msg mt-msg--errore">${esc(traduci(corpo?.error ?? ''))}</p>`;
    return;
  }
  dati = corpo;
  rendi();
}

async function ricaricaCatalogo() {
  const { corpo } = await apiJson(api('sessione'));
  if (corpo?.ok) aggiornaCatalogo(corpo.catalogo ?? []);
}

async function post(corpo: Record<string, unknown>) {
  return apiJson('/api/motore/admin', { method: 'POST', body: JSON.stringify({ f: stato.slug, ...corpo }) });
}

export function montaAdmin() {
  document.addEventListener('mt:tab', (e) => { if ((e as CustomEvent).detail === 'mcf') void carica(); });

  document.addEventListener('input', (e) => {
    if ((e.target as HTMLElement).id !== 'cf-incolla') return;
    const righe = leggiIncollato((e.target as HTMLTextAreaElement).value);
    $('cf-anteprima').textContent = righe.length ? `${righe.length} righe riconosciute` : '';
  });

  document.addEventListener('click', async (e) => {
    const t = e.target as HTMLElement;
    if (t.id === 'cf-salva') {
      const val = (id: string) => $<HTMLInputElement>(id).value;
      const { res, corpo } = await post({
        azione: 'config',
        config: {
          settore: val('cf-settore'), etichettaBene: val('cf-etichetta'), tabellaCanoni: val('cf-listino'),
          partnerLeasing: val('cf-partner'), sogliaLeasing: Number(val('cf-soglia')), tettoMeseEuro: Number(val('cf-tetto')),
          colore: val('cf-colore'), accento: val('cf-accento'), demo: $<HTMLInputElement>('cf-demo').checked,
          documentiExtra: val('cf-extra').split('\n').map((x) => x.trim()).filter(Boolean),
          tabellaAlternativa: val('cf-alternativa'), regoleSemaforo: val('cf-regole'),
          leasing: $<HTMLInputElement>('cf-leasing').checked,
          prezzoVerifica: val('cf-prezzo-verifica'),
        },
      });
      if (!res.ok || !corpo?.ok) return messaggio($('cf-msg'), traduci(corpo?.error ?? ''), false);
      await carica();
      messaggio($('cf-msg'), 'Configurazione salvata. Colori e settore si vedono ricaricando la pagina.', true);
    }
    if (t.id === 'cf-importa') {
      const righe = leggiIncollato($<HTMLTextAreaElement>('cf-incolla').value);
      if (!righe.length) return messaggio($('cf-import-msg'), "Non trovo righe: serve l'intestazione e almeno una riga.", false);
      const { res, corpo } = await post({ azione: 'importa', righe });
      if (!res.ok || !corpo?.ok) return messaggio($('cf-import-msg'), traduci(corpo?.error ?? ''), false);
      await carica();
      await ricaricaCatalogo();
      messaggio($('cf-import-msg'), `Voci salvate: ${corpo.salvate}.${corpo.scartate?.length ? ` Righe scartate (manca codice, nome o prezzo): ${corpo.scartate.join(', ')}.` : ''}`, !corpo.scartate?.length);
    }
    const sv = t.closest('[data-voce-stato]') as HTMLElement | null;
    if (sv) {
      await post({ azione: 'attiva', codice: sv.dataset.voceStato, attivo: sv.dataset.attivo === '1' });
      await carica();
      await ricaricaCatalogo();
    }
  });
}
