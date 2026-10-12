// La rete del fornitore: richieste di accesso, agenti, inviti. Solo referente
// e MCF. Parla con /api/portale-utenti, la stessa API di Green-Go: agisce
// sempre e solo sull'organizzazione della sessione.

import { $, apiJson, data, esc, messaggio, stato, traduci } from './comune';

const ETICHETTA_RICHIESTA: Record<string, string> = { nuova: 'Da decidere', approvata: 'Approvata', rifiutata: 'Rifiutata' };
const ETICHETTA_INVITO: Record<string, string> = {
  da_inviare: 'Non ancora inviato', inviato: 'Inviato', accettato: 'Accettato', fallito: 'Non partito',
};

const urlUtenti = () => `/api/portale-utenti?partner=${encodeURIComponent(stato.slug)}`;
const post = (corpo: Record<string, unknown>) =>
  apiJson('/api/portale-utenti', { method: 'POST', body: JSON.stringify({ ...corpo, partner: stato.slug }) });

async function carica() {
  const { res, corpo } = await apiJson(urlUtenti());
  if (!res.ok || !corpo?.ok) return;
  rendiRichieste(corpo.richieste ?? []);
  rendiMembri(corpo.membri ?? []);
  rendiInviti(corpo.inviti ?? []);
}

function rendiRichieste(richieste: any[]) {
  $('richieste-blocco').hidden = richieste.length === 0;
  if (!richieste.length) return;
  $('richieste').innerHTML = `<div class="mt-scorri"><table class="mt-tabella">
    <thead><tr><th>Chi</th><th>Contatti</th><th>Quando</th><th>Stato</th><th></th></tr></thead>
    <tbody>${richieste.map((r) => `<tr class="${r.stato === 'nuova' ? '' : 'spenta'}">
      <td>${esc(r.nome)}${r.azienda ? `<br><span class="mt-id">${esc(r.azienda)}</span>` : ''}</td>
      <td>${esc(r.email)}${r.telefono ? `<br><span class="mt-id">${esc(r.telefono)}</span>` : ''}</td>
      <td>${data(r.creato)}</td>
      <td>${ETICHETTA_RICHIESTA[r.stato] ?? esc(r.stato)}</td>
      <td>${r.stato !== 'nuova' ? '' : `
        <button type="button" class="mt-link" data-richiesta="${esc(r.id)}" data-esito="approva">Approva</button>
        · <button type="button" class="mt-link" data-richiesta="${esc(r.id)}" data-esito="rifiuta">Rifiuta</button>`}</td>
    </tr>`).join('')}</tbody></table></div>`;
}

function rendiMembri(membri: any[]) {
  $('membri').innerHTML = !membri.length
    ? '<p class="mt-vuoto">Ancora nessuno oltre a te.</p>'
    : `<div class="mt-scorri"><table class="mt-tabella">
      <thead><tr><th>Persona</th><th>Ruolo</th><th class="num">Preventivi</th><th>Stato</th><th></th></tr></thead>
      <tbody>${membri.map((m) => `<tr class="${m.attivo ? '' : 'spenta'}">
        <td>${esc(m.nome || '—')}<br><span class="mt-id">${esc(m.email)}</span></td>
        <td>${m.ruolo === 'referente' ? 'Referente' : 'Agente'}</td>
        <td class="num">${esc(m.preventivi)}</td>
        <td>${m.attivo ? 'Attivo' : 'Sospeso'}</td>
        <td>${m.id === stato.utente?.id
          ? '<span class="mt-id">sei tu</span>'
          : `<button type="button" class="mt-link" data-membro="${esc(m.id)}" data-azione="${m.attivo ? 'sospendi' : 'riattiva'}">${m.attivo ? 'Sospendi' : 'Riattiva'}</button>`}</td>
      </tr>`).join('')}</tbody></table></div>`;
}

function rendiInviti(inviti: any[]) {
  $('inviti').innerHTML = !inviti.length
    ? '<p class="mt-vuoto">Nessun invito.</p>'
    : `<div class="mt-scorri"><table class="mt-tabella">
      <thead><tr><th>Persona</th><th>Stato</th><th>Inviato</th><th></th></tr></thead>
      <tbody>${inviti.map((i) => `<tr>
        <td>${esc(i.nome)}<br><span class="mt-id">${esc(i.email)}</span></td>
        <td>${ETICHETTA_INVITO[i.stato] ?? esc(i.stato)}</td>
        <td>${i.inviato_il ? data(i.inviato_il) : '<span class="mt-id">parte col giro delle 7, o mandalo ora</span>'}</td>
        <td>${i.stato === 'accettato' ? '' : `<button type="button" class="mt-link" data-invito="${esc(i.id)}">${i.stato === 'inviato' ? 'Rimanda ora' : 'Manda ora'}</button>`}</td>
      </tr>`).join('')}</tbody></table></div>`;
}

export function montaRete() {
  const box = $('rete-msg');
  $('inv-btn').addEventListener('click', async () => {
    const nome = $<HTMLInputElement>('inv-nome').value.trim();
    const email = $<HTMLInputElement>('inv-email').value.trim();
    if (!nome || !email) return messaggio(box, 'Servono nome e email.', false);
    const { res, corpo } = await post({ azione: 'invita', nome, email, ruolo: 'agente' });
    if (!res.ok || !corpo?.ok) return messaggio(box, traduci(corpo?.error ?? ''), false);
    messaggio(box, `${nome} è in coda. L'invito parte col prossimo scaglione.`, true);
    $<HTMLInputElement>('inv-nome').value = '';
    $<HTMLInputElement>('inv-email').value = '';
    void carica();
  });

  $('inv-ora').addEventListener('click', async () => {
    const { res, corpo } = await post({ azione: 'svuota_coda' });
    if (!res.ok || !corpo?.ok) return messaggio(box, traduci(corpo?.error ?? ''), false);
    messaggio(box, `Inviti partiti: ${corpo.inviati}. Rimandati: ${corpo.rimandati}. Non partiti: ${corpo.falliti}.`, corpo.falliti === 0);
    void carica();
  });

  document.addEventListener('click', async (e) => {
    const el = (e.target as HTMLElement).closest('[data-membro], [data-invito], [data-richiesta]') as HTMLButtonElement | null;
    if (!el) return;
    el.disabled = true;
    const corpoReq = el.dataset.membro
      ? { azione: el.dataset.azione, utente: el.dataset.membro }
      : el.dataset.richiesta
        ? { azione: `${el.dataset.esito}_richiesta`, richiesta: el.dataset.richiesta }
        : { azione: 'manda_ora', invito: el.dataset.invito };
    const { res, corpo } = await post(corpoReq);
    el.disabled = false;
    if (!res.ok || !corpo?.ok) {
      void carica();
      return messaggio(box, traduci(corpo?.error ?? ''), false);
    }
    if (el.dataset.invito) messaggio(box, "L'invito è partito.", true);
    if (el.dataset.richiesta) messaggio(box, corpo.approvata ? "Approvata: l'invito è in coda." : 'Richiesta archiviata.', true);
    void carica();
  });

  document.addEventListener('mt:tab', (e) => {
    if ((e as CustomEvent).detail === 'rete') void carica();
  });
}
