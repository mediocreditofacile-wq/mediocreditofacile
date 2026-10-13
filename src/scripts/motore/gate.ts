// Gate del portale: accesso, recupero password, attivazione invito, richiesta
// di accesso. E' lo stesso flusso di Green-Go (/tools/green-go), con
// l'indirizzo del portale preso dallo slug invece che scritto a mano.
//
// Lo usa anche /tools/stilo, che non e' sul motore: passa il proprio
// indirizzo e la propria API di sessione, e non ha la richiesta di accesso
// (i collaboratori li invita il referente), quindi quei pezzi sono facoltativi.

import { $, api, apiJson, stato, traduci } from './comune';

const VISTE = ['vista-login', 'vista-recupero', 'vista-nuova-password', 'vista-invito', 'vista-richiesta'];

function mostraVista(quale: string) {
  for (const v of VISTE) {
    const el = $(v);
    if (el) el.hidden = v !== quale;
  }
  $('gate-errore').hidden = true;
  $('gate-ok').hidden = true;
}
function errore(msg: string) {
  $('gate-errore').textContent = msg;
  $('gate-errore').hidden = false;
  $('gate-ok').hidden = true;
}
function conferma(msg: string) {
  $('gate-ok').textContent = msg;
  $('gate-ok').hidden = false;
  $('gate-errore').hidden = true;
}

const valore = (id: string) => $<HTMLInputElement>(id).value.trim();

/** Prova ad aprire la sessione; se c'e', entra */
async function provaSessione(url: string, entra: (sessione: any) => void): Promise<boolean> {
  const { res, corpo } = await apiJson(url);
  if (res.ok && corpo?.ok) {
    $('gate').hidden = true;
    $('tool').hidden = false;
    entra(corpo);
    return true;
  }
  if (corpo?.error && corpo.error !== 'sessione_assente') errore(traduci(corpo.error));
  return false;
}

export interface OpzioniGate {
  /** Indirizzo del portale, per i link di recupero e il ritorno. Default /portale/<slug> */
  percorso?: string;
  /** API che risponde ok se la sessione vale, e il cui corpo arriva a entra(). Default sessione del motore */
  urlSessione?: string;
}

export async function avviaGate(entra: (sessione: any) => void, opzioni: OpzioniGate = {}) {
  const percorso = opzioni.percorso ?? `/portale/${stato.slug}`;
  const urlSessione = opzioni.urlSessione ?? api('sessione');
  const params = new URLSearchParams(location.search);
  const idInvito = params.get('invito');
  const tokenReset = params.get('token');
  let invitoAccountEsistente = false;
  let emailInvito = '';

  // --- accesso ---
  $('login-btn').addEventListener('click', async () => {
    const btn = $<HTMLButtonElement>('login-btn');
    const email = valore('login-email').toLowerCase();
    const password = $<HTMLInputElement>('login-pwd').value;
    if (!email || !password) return errore('Servono email e password.');
    btn.disabled = true;
    const { res } = await apiJson('/api/auth/sign-in/email', { method: 'POST', body: JSON.stringify({ email, password }) });
    btn.disabled = false;
    if (!res.ok) return errore('Email o password non corretti.');
    await provaSessione(urlSessione, entra);
  });
  for (const id of ['login-email', 'login-pwd']) {
    $(id).addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') $('login-btn').click(); });
  }

  $('logout-btn').addEventListener('click', async () => {
    await apiJson('/api/auth/sign-out', { method: 'POST', body: '{}' });
    location.href = percorso;
  });

  // --- recupero password ---
  $('vai-recupero').addEventListener('click', () => {
    $<HTMLInputElement>('recupero-email').value = valore('login-email');
    mostraVista('vista-recupero');
  });
  $('torna-login').addEventListener('click', () => mostraVista('vista-login'));
  $('torna-login-2')?.addEventListener('click', () => mostraVista('vista-login'));
  $('vai-richiesta')?.addEventListener('click', () => mostraVista('vista-richiesta'));

  $('recupero-btn').addEventListener('click', async () => {
    const btn = $<HTMLButtonElement>('recupero-btn');
    const email = valore('recupero-email').toLowerCase();
    if (!email) return errore('Serve la tua email.');
    btn.disabled = true;
    await apiJson('/api/auth/request-password-reset', {
      method: 'POST',
      body: JSON.stringify({ email, redirectTo: `${location.origin}${percorso}` }),
    });
    btn.disabled = false;
    // Risposta sempre uguale: dire "questa email non esiste" aiuterebbe solo chi prova a caso
    conferma("Se quell'indirizzo è registrato, il link è partito. Controlla la posta.");
  });

  $('nuova-pwd-btn').addEventListener('click', async () => {
    const btn = $<HTMLButtonElement>('nuova-pwd-btn');
    const password = $<HTMLInputElement>('nuova-pwd').value;
    if (password.length < 10) return errore('La password deve avere almeno dieci caratteri.');
    btn.disabled = true;
    const { res } = await apiJson('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ newPassword: password, token: tokenReset }),
    });
    btn.disabled = false;
    if (!res.ok) return errore('Il link non è più valido. Chiedine un altro.');
    history.replaceState(null, '', percorso);
    mostraVista('vista-login');
    conferma('Password aggiornata. Ora puoi accedere.');
  });

  // --- richiesta di accesso ---
  $('req-btn')?.addEventListener('click', async () => {
    const btn = $<HTMLButtonElement>('req-btn');
    if (!valore('req-nome') || !valore('req-email')) return errore('Servono almeno nome e email.');
    btn.disabled = true;
    const { res, corpo } = await apiJson('/api/portale-richiesta', {
      method: 'POST',
      body: JSON.stringify({
        fornitore: stato.slug,
        nome: valore('req-nome'),
        azienda: valore('req-azienda'),
        email: valore('req-email'),
        telefono: valore('req-telefono'),
        sito: valore('req-sito'),
      }),
    });
    btn.disabled = false;
    if (!res.ok || !corpo?.ok) return errore(traduci(corpo?.error ?? ''));
    conferma('Richiesta inviata. Ti arriva un invito via email appena viene attivata.');
    for (const c of ['req-nome', 'req-azienda', 'req-email', 'req-telefono']) $<HTMLInputElement>(c).value = '';
  });

  // --- invito ---
  async function apriInvito(id: string) {
    const { res, corpo } = await apiJson(`/api/portale-invito?id=${encodeURIComponent(id)}`);
    if (!res.ok || !corpo?.ok) {
      mostraVista('vista-login');
      return errore(traduci(corpo?.error ?? 'invito_inesistente'));
    }
    invitoAccountEsistente = Boolean(corpo.accountEsistente);
    emailInvito = corpo.email;
    mostraVista('vista-invito');
    $('invito-desc').textContent = invitoAccountEsistente
      ? `Hai già un accesso con ${corpo.email}: entra con la tua password e il portale ${corpo.organizzazione} si aggiunge ai tuoi.`
      // Il punto finale non si raddoppia sui nomi che ne hanno gia' uno (STILO S.R.L.)
      : `Accesso per ${corpo.email} sul portale ${String(corpo.organizzazione).replace(/\.$/, '')}. Scegli una password: è personale, non va condivisa.`;
    $('invito-nota').textContent = invitoAccountEsistente ? '' : 'Almeno dieci caratteri.';
    $('invito-nome').hidden = invitoAccountEsistente;
    $<HTMLInputElement>('invito-pwd').placeholder = invitoAccountEsistente ? 'La tua password' : 'Scegli una password';
    $('invito-btn').textContent = invitoAccountEsistente ? 'Aggiungi il portale' : 'Entra nel portale';
  }

  $('invito-btn').addEventListener('click', async () => {
    const btn = $<HTMLButtonElement>('invito-btn');
    const password = $<HTMLInputElement>('invito-pwd').value;
    const nome = valore('invito-nome');
    if (password.length < 10) return errore('La password deve avere almeno dieci caratteri.');
    if (!invitoAccountEsistente && !nome) return errore('Serve nome e cognome.');
    btn.disabled = true;
    if (invitoAccountEsistente) {
      const login = await apiJson('/api/auth/sign-in/email', {
        method: 'POST',
        body: JSON.stringify({ email: emailInvito, password }),
      });
      if (!login.res.ok) { btn.disabled = false; return errore('Password non corretta.'); }
    }
    const { res, corpo } = await apiJson('/api/portale-invito', {
      method: 'POST',
      body: JSON.stringify({ id: idInvito, nome, password }),
    });
    btn.disabled = false;
    if (!res.ok || !corpo?.ok) return errore(traduci(corpo?.error ?? ''));
    history.replaceState(null, '', percorso);
    if (!(await provaSessione(urlSessione, entra))) {
      mostraVista('vista-login');
      conferma('Accesso attivato. Entra con la tua password.');
    }
  });

  // --- avvio ---
  if (idInvito) return apriInvito(idInvito);
  if (tokenReset) return mostraVista('vista-nuova-password');
  if (params.get('richiesta') && $('vista-richiesta')) mostraVista('vista-richiesta');
  else mostraVista('vista-login');
  // Se la sessione c'e' ancora, il portale si apre senza chiedere niente
  await provaSessione(urlSessione, entra);
}
