// Le azioni sotto le proposte: generare il preventivo PDF, caricare la pratica.
// Il preventivo riusa l'input della proposta a schermo: i numeri del PDF sono
// quelli che l'agente sta guardando, ricalcolati dalla stessa funzione.

import { $, apiJson, apriTab, esc, messaggio, stato, traduci } from './comune';
import { inputCorrente } from './proposte';
import { bottoneDoc, caricaStorico } from './storico';

const ETICHETTA_DOC = (nome: string) =>
  /leasing/i.test(nome) ? 'Prospetto di leasing' : /infografic/i.test(nome) ? 'Infografico del noleggio' : 'Prospetto di noleggio';

function rendiAzioni() {
  const box = document.getElementById('proposte-azioni');
  const esito = stato.proposta?.esito;
  if (!box || !esito) return;
  const fv = stato.settore === 'fotovoltaico';
  box.innerHTML = `
    ${esito.bloccate ? '' : `<button type="button" class="mt-btn" id="genera-btn">${fv ? 'Genera i prospetti PDF' : 'Salva il preventivo'}</button>`}
    <button type="button" class="mt-btn ${esito.bloccate ? '' : 'mt-btn--secondario'}" id="pratica-btn">Carica la pratica</button>
    <div id="genera-esito" style="flex-basis:100%"></div>`;
}

async function genera(btn: HTMLButtonElement) {
  const input = inputCorrente();
  const box = $('genera-esito');
  if (!input) return;
  btn.disabled = true;
  btn.textContent = 'Preparo i documenti...';
  const { res, corpo } = await apiJson('/api/motore/preventivo', { method: 'POST', body: JSON.stringify(input) });
  btn.disabled = false;
  btn.textContent = stato.settore === 'fotovoltaico' ? 'Genera di nuovo' : 'Salva di nuovo';
  if (!res.ok || !corpo?.ok) {
    box.innerHTML = '<p class="mt-msg"></p>';
    return messaggio(box.firstElementChild as HTMLElement, traduci(corpo?.error ?? ''), false);
  }
  stato.ultimoPreventivo = corpo.id;
  const docs = (corpo.documenti ?? []) as { nome: string; pathname: string }[];
  box.innerHTML = `
    <div class="mt-card" style="margin-top:8px">
      <p class="mt-semaforo__tit">Preventivo ${esc(corpo.id)} salvato</p>
      ${docs.length
        ? `<p class="mt-nota" style="margin:0 0 8px">Da consegnare al cliente. Restano riscaricabili dallo Storico.</p>
           <p>${docs.map((d) => bottoneDoc(d, ETICHETTA_DOC(d.nome))).join(' · ')}</p>`
        : `<p class="mt-nota" style="margin:0">${stato.settore === 'fotovoltaico'
            ? 'I PDF non sono pronti: il servizio di generazione non ha risposto. Il preventivo è salvato, riprova tra qualche minuto.'
            : 'Preventivo salvato nello storico.'}</p>`}
    </div>`;
  void caricaStorico();
}

export function montaAzioni() {
  document.addEventListener('mt:azioni', rendiAzioni);
  document.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.id === 'genera-btn') void genera(t as HTMLButtonElement);
    if (t.id === 'pratica-btn') {
      apriTab('pratiche');
      document.dispatchEvent(new CustomEvent('mt:nuova-pratica'));
    }
  });
}
