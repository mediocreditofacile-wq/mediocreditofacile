// I dati che la proposta di vendita stampa oltre a quelli della ricerca. Spec
// mcf_spec-ledoffice-motore_v1, paragrafo 7, rivista il 21/10/2026 dopo la prova con
// Maurizio Palumbo: il commerciale scrive solo quello che il Registro non sa.
//
//  - dal commerciale: cellulare ed email del firmatario, IBAN aziendale; codice SDI o
//    PEC solo quando il Registro non ha ne' l'uno ne' l'altra;
//  - dal Registro (registro-vendita.ts, letto dal server): nome, data di nascita e
//    codice fiscale del legale rappresentante, PEC e codice SDI. Quello che il Registro
//    non da' (la residenza, un firmatario che e' una societa') resta vuoto sulla
//    proposta e lo completa MCF;
//  - la persona di riferimento e' il firmatario, col suo cellulare.
//
// Modulo puro, importabile dal browser: il browser lo chiama col solo recapito di
// fatturazione della scheda (il firmatario non lo conosce, e non gli serve). Ragione
// sociale, sede e partita IVA vengono dalla ricerca e non si scrivono qui. Il server
// ricontrolla tutto: il browser si aggira.
//
// Quello che non regge esce con una chiave stabile in `mancanti`, che la pagina mette
// accanto al campo giusto. Le chiavi escono tutte insieme, nell'ordine del modulo.

import { controllaCellulare, controllaEmail } from '../dati-cliente-pratica';
import { controllaIban } from '../iban';
import type { FatturazioneRegistro, Firmatario } from './registro-vendita';

export interface DatiVendita {
  amministratore: {
    nome: string;
    /** GG/MM/AAAA, vuota se il Registro non la da' */
    nascita: string;
    codiceFiscale: string;
    /** Vuota: il Registro non la da' */
    residenza: string;
  };
  telefono: string;
  email: string;
  riferimento: { nome: string; telefono: string };
  /** Normalizzato: senza spazi, in maiuscolo */
  iban: string;
  /** Vuoto se non c'e' */
  sdi: string;
  /** Vuota se non c'e' */
  pec: string;
}

/** Quello che il server sa gia' del cliente. Il browser passa firmatario null */
export interface RegistroVendita {
  firmatario: Firmatario | null;
  fatturazione: FatturazioneRegistro;
}

export type EsitoDatiVendita = { ok: true; dati: DatiVendita } | { ok: false; mancanti: string[] };

const CODICE_SDI = /^[A-Z0-9]{7}$/;

const oggetto = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/** Testo ripulito e tagliato; quello che non e' testo vale vuoto */
const testo = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Il Registro ha gia' un recapito per la fattura elettronica: SDI e PEC non si chiedono */
export const fatturazioneNota = (f: FatturazioneRegistro | null | undefined): boolean => Boolean(f?.pec || f?.sdi);

/**
 * Le chiavi di `mancanti`, stabili e nell'ordine del modulo (ogni campo che manca o non
 * regge ne mette una, tutte insieme): telefono, email, iban, sdi_o_pec.
 * `sdi_o_pec` esce solo quando il Registro non ha ne' PEC ne' codice SDI: allora ne
 * serve almeno uno, e quello scritto deve reggere (un valore storto non passa neanche
 * quando l'altro e' buono, perche' finirebbe sulla proposta cosi' com'e'). Con un
 * recapito del Registro quelli scritti dal browser si ignorano.
 */
export function leggiDatiVendita(v: unknown, registro: RegistroVendita): EsitoDatiVendita {
  const radice = oggetto(v);
  const mancanti: string[] = [];

  const telefono = testo(radice.telefono, 40);
  if (controllaCellulare(telefono)) mancanti.push('telefono');

  const email = testo(radice.email, 120);
  if (controllaEmail(email)) mancanti.push('email');

  const iban = controllaIban(testo(radice.iban, 60));
  if (!iban.ok) mancanti.push('iban');

  let sdi = registro.fatturazione.sdi ?? '';
  let pec = registro.fatturazione.pec ?? '';
  if (!fatturazioneNota(registro.fatturazione)) {
    sdi = testo(radice.sdi, 20).toUpperCase();
    pec = testo(radice.pec, 120);
    const sdiBuono = sdi === '' || CODICE_SDI.test(sdi);
    const pecBuona = pec === '' || controllaEmail(pec) === null;
    if (!sdiBuono || !pecBuona || (sdi === '' && pec === '')) mancanti.push('sdi_o_pec');
  }

  if (mancanti.length > 0 || !iban.ok) return { ok: false, mancanti };
  const f = registro.firmatario;
  return {
    ok: true,
    dati: {
      amministratore: { nome: f?.nome ?? '', nascita: f?.nascita ?? '', codiceFiscale: f?.codiceFiscale ?? '', residenza: '' },
      telefono,
      email,
      riferimento: { nome: f?.nome ?? '', telefono },
      iban: iban.iban,
      sdi,
      pec,
    },
  };
}
