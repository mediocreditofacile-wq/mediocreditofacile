// Le regole pure della pratica sul settore "distinta" (oggi Led Office): quando
// l'invio parte come pratica, quando diventa una segnalazione, quali documenti
// mancano e quali formati passano. Spec mcf_spec-ledoffice-motore_v1, paragrafi 5 e 9.
//
// Modulo puro e client-safe: niente database, niente rete. Lo importano il server
// (pratica-distinta.ts, che lo riesporta, e /api/motore/upload) e il browser, che
// controlla il formato di ogni file prima di caricarlo e segna le voci obbligatorie.
// Il server ricontrolla tutto: il browser si aggira.

import type { ChecklistConfig, VoceChecklist } from './config-distinta';
import type { DocumentoPratica } from './pratica';
import type { ColorePrefiltro } from './prefiltro';

/** Un documento della pratica caricato sotto una voce della checklist */
export interface DocumentoVoce extends DocumentoPratica {
  voce: string;
}

export type ErroreInvio = 'proposta_mancante' | 'cliente_bloccato' | 'proposta_non_valida';

export type DecisioneInvio =
  | { tipo: 'pratica' }
  | { tipo: 'segnalazione' }
  | { tipo: 'rifiuto'; error: ErroreInvio };

/**
 * Pratica, segnalazione o rifiuto, dal semaforo ricalcolato sul server:
 *  - bloccato: rifiuto, niente pratica;
 *  - rosso: segnalazione, con o senza proposta. Un rosso arrivato dopo il preventivo
 *    (eventi chiusi presenti, cliente segnato da MCF) trasforma l'invio;
 *  - verde o giallo con una proposta valida: pratica;
 *  - verde o giallo senza canale per quell'importo, con la segnalazione chiesta:
 *    segnalazione. `nessunCanale` lo prova il server rifacendo l'instradamento;
 *  - verde o giallo senza proposta: rifiuto. `propostaIndicata` distingue la proposta
 *    che non c'e' (proposta_mancante) da quella indicata che non regge
 *    (proposta_non_valida: non visibile, di un altro cliente, non di distinta).
 */
export function decidiInvio(opts: {
  semaforo: ColorePrefiltro;
  propostaValida: boolean;
  segnalazioneChiesta: boolean;
  nessunCanale: boolean;
  propostaIndicata?: boolean;
}): DecisioneInvio {
  if (opts.semaforo === 'bloccato') return { tipo: 'rifiuto', error: 'cliente_bloccato' };
  if (opts.semaforo === 'rosso') return { tipo: 'segnalazione' };
  if (opts.propostaValida) return { tipo: 'pratica' };
  if (opts.segnalazioneChiesta && opts.nessunCanale) return { tipo: 'segnalazione' };
  return { tipo: 'rifiuto', error: opts.propostaIndicata ? 'proposta_non_valida' : 'proposta_mancante' };
}

/**
 * La voce della proposta firmata. Nella segnalazione non si chiede: la proposta di
 * vendita non e' uscita (rosso o nessun canale), quindi non c'e' niente da firmare.
 * Si riconosce dal nome perche' la checklist si scrive dal Pannello MCF.
 */
const PROPOSTA_FIRMATA = /proposta di vendita/i;

/** Le voci da chiedere per questo invio: nella segnalazione tutte tranne la proposta firmata */
export function vociPerInvio(voci: VoceChecklist[], segnalazione: boolean): VoceChecklist[] {
  return segnalazione ? voci.filter((v) => !PROPOSTA_FIRMATA.test(v.nome)) : voci;
}

/**
 * La voce dello ZIP unico (22/10/2026, deciso da Alberto dopo la telefonata con Luca
 * Maimone): il commerciale puo' mandare tutti i documenti in un solo file ZIP al posto
 * della checklist. Con lo ZIP le voci obbligatorie non fermano l'invio: la completezza
 * la controlla MCF aprendo il file, e la mail lo dice. Non sta nella checklist del
 * Pannello: la offre sempre il portale, sotto le voci.
 */
export const VOCE_ZIP = 'Tutti i documenti in un unico ZIP';

/** I tipi con cui i browser dichiarano un file ZIP (Windows: x-zip-compressed) */
export const TIPI_ZIP = ['application/zip', 'application/x-zip-compressed', 'application/x-zip', 'multipart/x-zip'];

/** E' uno ZIP? L'estensione deve esserci; il tipo, se il browser lo dichiara, deve essere uno dei TIPI_ZIP */
export function zipAmmesso(nome: string, contentType: string): boolean {
  const tipo = String(contentType ?? '').split(';')[0].trim().toLowerCase();
  return estensione(String(nome ?? '')) === 'zip' && (tipo === '' || TIPI_ZIP.includes(tipo));
}

/**
 * Il documento sta sotto la voce giusta: sotto la voce ZIP solo file .zip, sotto le
 * altre nessun .zip. Lo store accetta gli ZIP per tutta la bozza (non sa sotto quale
 * voce finira' il file), quindi il controllo vero lo fa il server all'invio. Il nome
 * sullo store tiene l'estensione: il suffisso casuale va prima del punto.
 */
export function documentoAlPostoGiusto(d: Pick<DocumentoVoce, 'voce' | 'pathname'>): boolean {
  const zip = estensione(d.pathname) === 'zip';
  return d.voce === VOCE_ZIP ? zip : !zip;
}

/**
 * Le voci per cui non e' arrivato nessun documento, nell'ordine della checklist. Le
 * obbligatorie fermano l'invio; le facoltative possono arrivare dopo e la mail a MCF
 * dice cosa manca. Un documento conta solo per la voce scritta esattamente uguale.
 * Con lo ZIP unico non manca niente: la completezza la controlla MCF.
 */
export function documentiMancanti(
  voci: VoceChecklist[],
  documenti: DocumentoVoce[],
  segnalazione: boolean,
): { obbligatori: string[]; facoltativi: string[] } {
  if (documenti.some((d) => d.voce === VOCE_ZIP)) return { obbligatori: [], facoltativi: [] };
  const arrivate = new Set(documenti.map((d) => d.voce));
  const mancanti = vociPerInvio(voci, segnalazione).filter((v) => !arrivate.has(v.nome));
  return {
    obbligatori: mancanti.filter((v) => v.obbligatoria).map((v) => v.nome),
    facoltativi: mancanti.filter((v) => !v.obbligatoria).map((v) => v.nome),
  };
}

// --- formati -----------------------------------------------------------------

type Formato = ChecklistConfig['formati'][number];

const TIPI: Record<Formato, string[]> = { pdf: ['application/pdf'], jpg: ['image/jpeg'] };
const ESTENSIONI: Record<Formato, string[]> = { pdf: ['pdf'], jpg: ['jpg', 'jpeg'] };
const NOMI: Record<Formato, string> = { pdf: 'PDF', jpg: 'JPG' };

const estensione = (nome: string) => /\.([a-z0-9]+)$/i.exec(nome.trim())?.[1]?.toLowerCase() ?? '';

/**
 * Il file passa? Decide il tipo, quando il browser lo dichiara: una foto HEIC che
 * Safari ha convertito in JPEG (input con accept="application/pdf,image/jpeg") puo'
 * tenere il nome vecchio, e conta che sia un JPEG. Senza tipo decide l'estensione;
 * senza tutti e due no. Lo store accetta gli stessi tipi (tipiAmmessi), quindi un
 * tipo che qui non passa non passerebbe nemmeno li'.
 */
export function formatoAmmesso(nome: string, contentType: string, formati: Formato[]): boolean {
  const tipo = String(contentType ?? '').split(';')[0].trim().toLowerCase();
  if (tipo) return formati.some((f) => TIPI[f]?.includes(tipo));
  const est = estensione(String(nome ?? ''));
  return est !== '' && formati.some((f) => ESTENSIONI[f]?.includes(est));
}

/** I tipi che lo store Blob accetta per questi formati: PDF e JPG danno application/pdf e image/jpeg */
export function tipiAmmessi(formati: Formato[]): string[] {
  return [...new Set(formati.flatMap((f) => TIPI[f] ?? []))];
}

/** Quello che il commerciale legge accanto alla voce quando il file non passa: "Solo PDF o JPG" */
export function testoFormati(formati: Formato[]): string {
  return `Solo ${formati.map((f) => NOMI[f]).filter(Boolean).join(' o ')}`;
}
