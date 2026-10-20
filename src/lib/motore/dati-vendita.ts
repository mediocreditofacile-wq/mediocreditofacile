// I dati che la proposta di vendita stampa oltre a quelli della ricerca: amministratore
// (nome dal legale rappresentante della scheda, il resto lo scrive il commerciale dal
// documento d'identita'), contatti del firmatario, persona di riferimento, IBAN e
// codice SDI o PEC. Spec mcf_spec-ledoffice-motore_v1, paragrafo 7.
//
// Modulo puro, importabile dal browser. Ragione sociale, sede e partita IVA vengono
// dalla ricerca e non si scrivono qui. Il server ricontrolla tutto: il browser si aggira.
//
// Quello che non regge esce con una chiave stabile in `mancanti`, che la pagina mette
// accanto al campo giusto. Le chiavi escono tutte insieme, nell'ordine del modulo.

import { controllaCellulare, controllaEmail } from '../dati-cliente-pratica';
import { controllaIban } from '../iban';
import { giornoItaliano } from './distinta';

export interface DatiVendita {
  amministratore: {
    nome: string;
    /** GG/MM/AAAA */
    nascita: string;
    codiceFiscale: string;
    residenza: string;
  };
  telefono: string;
  email: string;
  riferimento: { nome: string; telefono: string };
  /** Normalizzato: senza spazi, in maiuscolo */
  iban: string;
  /** Vuoto se si e' scelta la PEC */
  sdi: string;
  /** Vuota se si e' scelto il codice SDI */
  pec: string;
}

export type EsitoDatiVendita = { ok: true; dati: DatiVendita } | { ok: false; mancanti: string[] };

const MAX_NOME = 120;
const MAX_RESIDENZA = 200;
/** Prima di questo anno una data di nascita e' quasi certamente una cifra saltata (79 per 1979) */
const ANNO_NASCITA_MINIMO = 1900;

const CODICE_FISCALE = /^[A-Z0-9]{16}$/;
const CODICE_SDI = /^[A-Z0-9]{7}$/;

const oggetto = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/** Testo ripulito e tagliato; quello che non e' testo vale vuoto */
const testo = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

const due = (n: number) => String(n).padStart(2, '0');

/** GG/MM/AAAA (anche senza zero iniziale) di un giorno che esiste ed e' gia' passato. Null altrimenti */
function leggiNascita(v: unknown, oggi: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(testo(v, 20));
  if (!m) return null;
  const [giorno, mese, anno] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (anno < ANNO_NASCITA_MINIMO) return null;
  // Date.UTC porta 31/02 al 3 marzo: se la data riletta non e' quella scritta, non esiste
  const d = new Date(Date.UTC(anno, mese - 1, giorno));
  if (d.getUTCFullYear() !== anno || d.getUTCMonth() !== mese - 1 || d.getUTCDate() !== giorno) return null;
  return `${anno}-${due(mese)}-${due(giorno)}` < oggi ? `${due(giorno)}/${due(mese)}/${anno}` : null;
}

/**
 * `oggi` decide se la data di nascita e' nel passato (in ora italiana) e serve ai test.
 * Il telefono della persona di riferimento e' facoltativo, ma se c'e' deve essere un numero.
 * Fra SDI e PEC ne serve almeno uno, e quello scritto deve reggere: un valore storto non
 * passa neanche quando l'altro e' buono, perche' finirebbe sulla proposta cosi' com'e'.
 */
export function leggiDatiVendita(v: unknown, oggi: Date = new Date()): EsitoDatiVendita {
  const radice = oggetto(v);
  const amm = oggetto(radice.amministratore);
  const rif = oggetto(radice.riferimento);
  const mancanti: string[] = [];

  const nome = testo(amm.nome, MAX_NOME);
  if (!nome) mancanti.push('amministratore.nome');

  const nascita = leggiNascita(amm.nascita, giornoItaliano(oggi));
  if (!nascita) mancanti.push('amministratore.nascita');

  const codiceFiscale = testo(amm.codiceFiscale, 40).toUpperCase();
  if (!CODICE_FISCALE.test(codiceFiscale)) mancanti.push('amministratore.codiceFiscale');

  const residenza = testo(amm.residenza, MAX_RESIDENZA);
  if (!residenza) mancanti.push('amministratore.residenza');

  const telefono = testo(radice.telefono, 40);
  if (controllaCellulare(telefono)) mancanti.push('telefono');

  const email = testo(radice.email, 120);
  if (controllaEmail(email)) mancanti.push('email');

  const nomeRiferimento = testo(rif.nome, MAX_NOME);
  if (!nomeRiferimento) mancanti.push('riferimento.nome');

  const telefonoRiferimento = testo(rif.telefono, 40);
  if (telefonoRiferimento && controllaCellulare(telefonoRiferimento)) mancanti.push('riferimento.telefono');

  const iban = controllaIban(testo(radice.iban, 60));
  if (!iban.ok) mancanti.push('iban');

  const sdi = testo(radice.sdi, 20).toUpperCase();
  const pec = testo(radice.pec, 120);
  const sdiBuono = sdi === '' || CODICE_SDI.test(sdi);
  const pecBuona = pec === '' || controllaEmail(pec) === null;
  if (!sdiBuono || !pecBuona || (sdi === '' && pec === '')) mancanti.push('sdi_o_pec');

  if (mancanti.length > 0 || !nascita || !iban.ok) return { ok: false, mancanti };
  return {
    ok: true,
    dati: {
      amministratore: { nome, nascita, codiceFiscale, residenza },
      telefono,
      email,
      riferimento: { nome: nomeRiferimento, telefono: telefonoRiferimento },
      iban: iban.iban,
      sdi,
      pec,
    },
  };
}
