// Dalla scheda Openapi ai dati della proposta di vendita che il commerciale non deve
// piu' scrivere (decisione di Alberto del 21/10/2026, dopo la prova con Maurizio
// Palumbo): il firmatario, cioe' il legale rappresentante, e i recapiti per la
// fatturazione elettronica.
//
// Due destinatari diversi, come nel resto del motore:
//  - fatturazione (PEC e codice SDI): dati pubblici dell'azienda, vanno nella scheda
//    ridotta e il commerciale li vede gia' compilati;
//  - firmatario (nome, data di nascita, codice fiscale): resta sul server, in
//    app.ricerca_merito, e finisce solo stampato sulla proposta di vendita che quella
//    persona firma. A schermo l'agente continua a non vedere codici fiscali e date di
//    nascita (vedi merito.ts).
//
// La residenza il Registro non la da': sulla proposta resta vuota.
// Modulo puro: lo usano la verifica, il calcolo della distinta e i test.

export interface FatturazioneRegistro {
  /** Minuscola, solo se ha la forma di un indirizzo email */
  pec: string | null;
  /** Sette caratteri; "0000000" vuol dire nessun codice e vale null */
  sdi: string | null;
}

export interface Firmatario {
  nome: string;
  /** GG/MM/AAAA, vuota se il Registro non la da' */
  nascita: string;
  /** Sedici caratteri in maiuscolo, vuoto se il Registro non lo da' */
  codiceFiscale: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SDI = /^[A-Z0-9]{7}$/;
const CODICE_FISCALE = /^[A-Z0-9]{16}$/;

const testo = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

function pecDa(v: unknown): string | null {
  const pec = testo(v).toLowerCase();
  return EMAIL.test(pec) ? pec : null;
}

/**
 * PEC e codice SDI dell'azienda. La PEC di IT-full (Registro imprese) prima di quella
 * di IT-advanced: quando sono diverse, quella del Registro e' l'indirizzo iscritto.
 * Il codice SDI c'e' solo in IT-advanced.
 */
export function fatturazioneDaScheda(s: { full?: any; advanced?: any } | null | undefined): FatturazioneRegistro {
  const sdi = testo(s?.advanced?.sdiCode).toUpperCase();
  return {
    pec: pecDa(s?.full?.pec) ?? pecDa(s?.advanced?.pec),
    sdi: SDI.test(sdi) && !/^0+$/.test(sdi) ? sdi : null,
  };
}

/** AAAA-MM-GG, anche con l'ora in coda, in GG/MM/AAAA. Vuota se non si legge */
function nascitaItaliana(v: unknown): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(testo(v));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

/**
 * Il primo legale rappresentante persona fisica del Registro (IT-full managers). Null se
 * non c'e', oppure se e' una societa' (il socio unico che amministra): li' il firmatario
 * lo indica MCF.
 */
export function firmatarioDaScheda(s: { full?: any } | null | undefined): Firmatario | null {
  const managers: any[] = Array.isArray(s?.full?.managers) ? s!.full.managers : [];
  const m = managers.find((x) => x?.isLegalRepresentative && testo(x.surname));
  if (!m) return null;
  const cf = testo(m.taxCode).toUpperCase();
  return {
    nome: `${testo(m.name)} ${testo(m.surname)}`.trim().toUpperCase(),
    nascita: nascitaItaliana(m.birthDate),
    codiceFiscale: CODICE_FISCALE.test(cf) ? cf : '',
  };
}
