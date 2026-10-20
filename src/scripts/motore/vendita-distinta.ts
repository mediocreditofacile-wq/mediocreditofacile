// Sezione "Dati per la proposta di vendita" della scheda Proposte, settore distinta
// (oggi Led Office). Spec mcf_spec-ledoffice-motore_v1, paragrafo 7.
//
// Amministratore (nome dal legale rappresentante del Registro, il resto dal suo
// documento d'identita'), telefono ed email del firmatario, persona di riferimento,
// IBAN, codice SDI o PEC. Ragione sociale, sede e partita IVA vengono dalla verifica
// e non si scrivono. Il controllo e' leggiDatiVendita, lo stesso del server: qui
// anticipa soltanto quello che il server dira'. Gli stessi dati precompilano il
// modulo della pratica (pratiche-distinta.ts).

import { leggiDatiVendita } from '../../lib/motore/dati-vendita';
import { initCampoIban } from '../campo-iban';
import { $, esc, stato } from './comune';
import { mancantiProposte } from './distinta-browser';

const campoTesto = (id: string) => (document.getElementById(id) as HTMLInputElement | null)?.value.trim() ?? '';

/** I dati per la proposta di vendita come li ha scritti il commerciale, nella forma di leggiDatiVendita */
export function datiVenditaCorrenti() {
  return {
    amministratore: {
      nome: campoTesto('dv-amm-nome'),
      nascita: campoTesto('dv-amm-nascita'),
      codiceFiscale: campoTesto('dv-amm-cf').toUpperCase(),
      residenza: campoTesto('dv-amm-residenza'),
    },
    telefono: campoTesto('dv-telefono'),
    email: campoTesto('dv-email'),
    riferimento: { nome: campoTesto('dv-rif-nome'), telefono: campoTesto('dv-rif-telefono') },
    iban: campoTesto('dv-iban'),
    sdi: campoTesto('dv-sdi').toUpperCase(),
    pec: campoTesto('dv-pec'),
  };
}

/** Le chiavi di leggiDatiVendita che oggi non reggono; vuoto se i dati sono completi */
export function venditaMancanti(): string[] {
  const esito = leggiDatiVendita(datiVenditaCorrenti());
  return esito.ok ? [] : esito.mancanti;
}

/** I campi del modulo per ogni chiave di leggiDatiVendita. L'IBAN lo segna campo-iban */
const CAMPI_VENDITA: Record<string, string[]> = {
  'amministratore.nome': ['dv-amm-nome'],
  'amministratore.nascita': ['dv-amm-nascita'],
  'amministratore.codiceFiscale': ['dv-amm-cf'],
  'amministratore.residenza': ['dv-amm-residenza'],
  telefono: ['dv-telefono'],
  email: ['dv-email'],
  'riferimento.nome': ['dv-rif-nome'],
  'riferimento.telefono': ['dv-rif-telefono'],
  sdi_o_pec: ['dv-sdi', 'dv-pec'],
};

interface OpzioniCampo { valore?: string; tipo?: string; segnaposto?: string; max?: number; nota?: string; maiuscolo?: boolean; modo?: string }

function campo(id: string, etichetta: string, opz: OpzioniCampo = {}) {
  return `
    <label class="mt-campo"><span>${esc(etichetta)}</span>
      <input type="${opz.tipo ?? 'text'}" id="${id}" class="mt-input${opz.maiuscolo ? ' mt-input--maiuscolo' : ''}" autocomplete="off"
        ${opz.max ? `maxlength="${opz.max}"` : ''} ${opz.segnaposto ? `placeholder="${esc(opz.segnaposto)}"` : ''}
        ${opz.modo ? `inputmode="${opz.modo}"` : ''} value="${esc(opz.valore ?? '')}" />
      ${opz.nota ? `<small>${esc(opz.nota)}</small>` : ''}
    </label>`;
}

/** Il modulo da capo, per il cliente della ricerca aperta */
export function rendiVendita() {
  const r = stato.ricerca!;
  // Il nome dell'amministratore parte dal legale rappresentante del Registro
  const legale = (r.info?.amministratori ?? []).find((m: any) => m.legaleRappresentante)?.nome ?? '';
  $('distinta-vendita').innerHTML = `
    <h3 class="mt-h3">Dati per la proposta di vendita</h3>
    <p class="mt-nota" style="margin-top:0">Ragione sociale, sede e partita IVA vengono dalla verifica. Data di nascita, codice fiscale e
      residenza dell'amministratore si copiano dal suo documento d'identità. Il preventivo del canone esce anche senza questi dati.</p>
    <div class="mt-griglia">
      ${campo('dv-amm-nome', 'Amministratore, nome e cognome', { valore: legale, max: 120, nota: legale ? 'Dal legale rappresentante del Registro.' : '' })}
      ${campo('dv-amm-nascita', 'Data di nascita', { segnaposto: 'GG/MM/AAAA', max: 10, modo: 'numeric' })}
      ${campo('dv-amm-cf', 'Codice fiscale', { max: 16, maiuscolo: true })}
      ${campo('dv-amm-residenza', 'Residenza', { max: 200, segnaposto: 'Via, numero civico, CAP, comune e provincia' })}
      ${campo('dv-telefono', 'Telefono del firmatario', { tipo: 'tel', max: 40 })}
      ${campo('dv-email', 'Email del firmatario', { tipo: 'email', max: 120 })}
      ${campo('dv-rif-nome', 'Persona di riferimento', { max: 120 })}
      ${campo('dv-rif-telefono', 'Telefono della persona di riferimento', { tipo: 'tel', max: 40 })}
      ${campo('dv-sdi', 'Codice SDI', { max: 7, maiuscolo: true, nota: 'Basta uno fra codice SDI e PEC.' })}
      ${campo('dv-pec', 'PEC', { tipo: 'email', max: 120 })}
    </div>
    <label class="mt-campo" style="margin-top:16px"><span>IBAN del conto aziendale</span>
      <input type="text" id="dv-iban" class="mt-input mt-input--iban" autocomplete="off" spellcheck="false"
        inputmode="text" maxlength="48" placeholder="27 caratteri, inizia con IT" aria-describedby="dv-iban-esito" />
      <small>Quello su cui il cliente pagherà i canoni.</small>
      <span id="dv-iban-esito" class="mt-campo__errore" role="alert" hidden></span></label>
    <p id="dv-mancanti" class="mt-nota"></p>`;
  initCampoIban($<HTMLInputElement>('dv-iban'), $('dv-iban-esito'));
}

/**
 * Cosa manca alle due proposte, sotto i campi: l'indirizzo di consegna (lo sceglie la
 * distinta) e i dati che non reggono. Con `segna` i campi scritti ma sbagliati si
 * colorano: succede uscendo dalla casella, non mentre si scrive.
 */
export function aggiornaVendita(indirizzoConsegna: string, segna = false) {
  const chiavi = venditaMancanti();
  const mancano = mancantiProposte(chiavi, indirizzoConsegna);
  const el = document.getElementById('dv-mancanti');
  if (el) {
    el.textContent = mancano.length
      ? `Per la proposta di vendita mancano: ${mancano.join(', ')}.`
      : 'Dati completi: insieme al preventivo del canone esce la proposta di vendita da far firmare.';
  }
  if (!segna) return;
  for (const [chiave, ids] of Object.entries(CAMPI_VENDITA)) {
    for (const id of ids) {
      const input = document.getElementById(id) as HTMLInputElement | null;
      if (!input) continue;
      if (chiavi.includes(chiave) && input.value.trim() !== '') input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
    }
  }
}
