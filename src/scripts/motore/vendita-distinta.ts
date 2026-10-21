// Sezione "Dati per la proposta di vendita" della scheda Proposte, settore distinta
// (oggi Led Office). Spec mcf_spec-ledoffice-motore_v1, paragrafo 7, rivista il
// 21/10/2026: il commerciale scrive solo cellulare ed email del firmatario e l'IBAN.
// Firmatario, PEC e codice SDI vengono dal Registro: PEC e SDI si vedono gia'
// compilati, i campi compaiono solo se il Registro non ha ne' l'una ne' l'altro.
// Data di nascita e codice fiscale del firmatario li mette il server sulla proposta:
// il browser non li riceve. Il controllo e' leggiDatiVendita, lo stesso del server:
// qui anticipa soltanto quello che il server dira'. Gli stessi dati precompilano il
// modulo della pratica (pratiche-distinta.ts).

import { fatturazioneNota, leggiDatiVendita } from '../../lib/motore/dati-vendita';
import type { FatturazioneRegistro } from '../../lib/motore/registro-vendita';
import { initCampoIban } from '../campo-iban';
import { $, esc, stato } from './comune';
import { mancantiProposte } from './distinta-browser';

const campoTesto = (id: string) => (document.getElementById(id) as HTMLInputElement | null)?.value.trim() ?? '';

/** PEC e codice SDI della scheda verificata (vuoti sulle schede senza) */
const fatturazione = (): FatturazioneRegistro => ({
  pec: stato.ricerca?.scheda?.pec ?? null,
  sdi: stato.ricerca?.scheda?.sdi ?? null,
});

/** Il legale rappresentante del Registro, dalle info aggiuntive: solo il nome */
const legaleRappresentante = (): string =>
  (stato.ricerca?.info?.amministratori ?? []).find((m: any) => m.legaleRappresentante)?.nome ?? '';

/** I dati per la proposta di vendita come li ha scritti il commerciale, nella forma di leggiDatiVendita */
export function datiVenditaCorrenti() {
  return {
    // Il nome serve solo a precompilare il referente della pratica: il server lo prende dal Registro
    amministratore: { nome: legaleRappresentante() },
    telefono: campoTesto('dv-telefono'),
    email: campoTesto('dv-email'),
    iban: campoTesto('dv-iban'),
    sdi: campoTesto('dv-sdi').toUpperCase(),
    pec: campoTesto('dv-pec'),
  };
}

/** Le chiavi di leggiDatiVendita che oggi non reggono; vuoto se i dati sono completi */
export function venditaMancanti(): string[] {
  const esito = leggiDatiVendita(datiVenditaCorrenti(), { firmatario: null, fatturazione: fatturazione() });
  return esito.ok ? [] : esito.mancanti;
}

/** I campi del modulo per ogni chiave di leggiDatiVendita. L'IBAN lo segna campo-iban */
const CAMPI_VENDITA: Record<string, string[]> = {
  telefono: ['dv-telefono'],
  email: ['dv-email'],
  sdi_o_pec: ['dv-sdi', 'dv-pec'],
};

interface OpzioniCampo { tipo?: string; segnaposto?: string; max?: number; nota?: string; maiuscolo?: boolean }

function campo(id: string, etichetta: string, opz: OpzioniCampo = {}) {
  return `
    <label class="mt-campo"><span>${esc(etichetta)}</span>
      <input type="${opz.tipo ?? 'text'}" id="${id}" class="mt-input${opz.maiuscolo ? ' mt-input--maiuscolo' : ''}" autocomplete="off"
        ${opz.max ? `maxlength="${opz.max}"` : ''} ${opz.segnaposto ? `placeholder="${esc(opz.segnaposto)}"` : ''} />
      ${opz.nota ? `<small>${esc(opz.nota)}</small>` : ''}
    </label>`;
}

/** Firmatario e fattura elettronica come li da' il Registro: si leggono, non si scrivono */
function dalRegistro(): string {
  const legale = legaleRappresentante();
  const f = fatturazione();
  const recapiti = [f.sdi ? `codice SDI ${f.sdi}` : '', f.pec ? `PEC ${f.pec}` : ''].filter(Boolean).join(' · ');
  return `
    <ul class="mt-criteri" style="margin:0 0 16px">
      <li>Firmatario: ${legale ? `${esc(legale)}, legale rappresentante` : 'lo indica Mediocredito Facile'}</li>
      ${recapiti ? `<li>Fattura elettronica: ${esc(recapiti)}</li>` : ''}
    </ul>`;
}

/** Il modulo da capo, per il cliente della ricerca aperta */
export function rendiVendita() {
  const chiediFatturazione = !fatturazioneNota(fatturazione());
  $('distinta-vendita').innerHTML = `
    <h3 class="mt-h3">Dati per la proposta di vendita</h3>
    <p class="mt-nota" style="margin-top:0">Ragione sociale, sede, partita IVA e dati del firmatario li prende Mediocredito
      Facile dal Registro imprese${chiediFatturazione ? '' : ', insieme al recapito per la fattura elettronica'}. Il preventivo del
      canone esce anche senza questi dati.</p>
    <p class="mt-nota" style="margin:0 0 4px">Dal Registro:</p>
    ${dalRegistro()}
    <div class="mt-griglia">
      ${campo('dv-telefono', 'Cellulare del firmatario', { tipo: 'tel', max: 40 })}
      ${campo('dv-email', 'Email del firmatario', { tipo: 'email', max: 120 })}
      ${chiediFatturazione
        ? `${campo('dv-sdi', 'Codice SDI', { max: 7, maiuscolo: true, nota: 'Il Registro non ne ha: basta uno fra codice SDI e PEC.' })}
           ${campo('dv-pec', 'PEC', { tipo: 'email', max: 120 })}`
        : ''}
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
