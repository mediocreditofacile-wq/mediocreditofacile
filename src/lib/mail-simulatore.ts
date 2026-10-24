// Mail ad Alberto per ogni verifica del cliente sul simulatore di noleggio.
// Funzioni pure: oggetto e corpo, senza invio (lo fa l'API con inviaMail).

import { escapeHtml, layoutMail } from './mail-portale';
import type { EsitoSimulatore } from './esito-simulatore';

export interface AziendaLetta {
  piva: string;
  trovata: boolean;
  ragioneSociale: string | null;
  forma: string | null;
  ateco: string | null;
  indirizzo: string | null;
  stato: string | null;
  inizioAttivita: string | null;
  annoBilancio: number | null;
  fatturato: number | null;
  utile: number | null;
}

export interface LeadSimulatore {
  variante: 'azienda' | 'cliente';
  nome: string;
  telefono: string;
  email: string;
  importo: number;
  durata: string;
  tipologia: string;
  canone: string;
  /** Null se la ricerca non e' partita (tetto, errore) */
  cliente: AziendaLetta | null;
  clientePiva: string;
  /** Solo sul modulo del fornitore */
  fornitore?: { piva: string; letta: AziendaLetta | null };
  esito: EsitoSimulatore | null;
  scheda: 'ordinata' | 'in-cache' | 'tetto' | 'no';
  /** Cose da sapere prima di richiamare: tetti, errori, partite IVA uguali */
  avvisi: string[];
}

const euro = (n: number) =>
  `${Math.round(n).toLocaleString('it-IT', { useGrouping: 'always' } as Intl.NumberFormatOptions)} €`;

const COLORE: Record<string, string> = { verde: 'verde', giallo: 'giallo', rosso: 'rosso' };

export function oggettoMail(l: LeadSimulatore): string {
  const nome = l.cliente?.ragioneSociale ?? `P.IVA ${l.clientePiva}`;
  const colore = l.esito ? COLORE[l.esito.colore] : 'senza esito';
  return `Simulatore: ${nome} · ${euro(l.importo)} · ${colore}`;
}

function riga(etichetta: string, valore: unknown): string {
  if (valore == null || valore === '') return '';
  return `<tr><td style="padding:4px 12px 4px 0;color:#787782;vertical-align:top">${escapeHtml(etichetta)}</td><td style="padding:4px 0">${escapeHtml(valore)}</td></tr>`;
}

function tabellaAzienda(a: AziendaLetta): string {
  if (!a.trovata) return `<p>Partita IVA ${escapeHtml(a.piva)} non trovata nel registro imprese.</p>`;
  return `<table style="border-collapse:collapse;font-size:14px">
    ${riga('Ragione sociale', a.ragioneSociale)}
    ${riga('Partita IVA', a.piva)}
    ${riga('Forma', a.forma)}
    ${riga('Stato', a.stato)}
    ${riga('ATECO', a.ateco)}
    ${riga('Sede', a.indirizzo)}
    ${riga('Inizio attività', a.inizioAttivita)}
    ${riga('Ultimo bilancio', a.annoBilancio)}
    ${riga('Fatturato', a.fatturato != null ? euro(a.fatturato) : null)}
    ${riga('Utile', a.utile != null ? euro(a.utile) : null)}
  </table>`;
}

export function corpoMail(l: LeadSimulatore, sito = 'https://www.mediocreditofacile.it'): string {
  const chi = l.variante === 'cliente' ? 'Un fornitore per un suo cliente' : "Un'azienda per sé";
  const sezioni: string[] = [];

  if (l.avvisi.length) {
    sezioni.push(`<div style="background:#FFF4EC;border-left:3px solid #FE6F3A;padding:8px 12px;margin-bottom:16px">${l.avvisi.map((a) => `<p style="margin:4px 0">${escapeHtml(a)}</p>`).join('')}</div>`);
  }

  sezioni.push(`<p><strong>${escapeHtml(chi)}</strong></p>
    <table style="border-collapse:collapse;font-size:14px">
      ${riga('Nome', l.nome)}
      ${riga('Cellulare', l.telefono)}
      ${riga('Email', l.email)}
      ${riga('Importo', euro(l.importo))}
      ${riga('Durata', l.durata ? `${l.durata} mesi` : '')}
      ${riga('Tipologia', l.tipologia)}
      ${riga('Canone simulato', l.canone)}
    </table>`);

  sezioni.push(`<h2 style="font-size:16px;color:#664CCD;margin:20px 0 8px">Cliente finale</h2>`);
  sezioni.push(l.cliente ? tabellaAzienda(l.cliente) : `<p>Partita IVA ${escapeHtml(l.clientePiva)}: verifica non eseguita.</p>`);

  if (l.esito) {
    const criteri = l.esito.criteri
      .map((c) => `<li>${c.ok === true ? '✓' : c.ok === false ? '✗' : '–'} ${escapeHtml(c.nome)}: ${escapeHtml(c.valore)}</li>`)
      .join('');
    sezioni.push(`<p style="margin-top:12px"><strong>Esito: ${escapeHtml(l.esito.colore)}</strong></p><ul style="font-size:14px">${criteri}</ul>`);
  }

  if (l.scheda === 'ordinata' || l.scheda === 'in-cache') {
    const testo = l.scheda === 'ordinata' ? 'Scheda completa ordinata (0,81 €)' : 'Scheda completa già in archivio';
    sezioni.push(`<p>${testo}: patrimonio netto e punteggio in <a href="${sito}/tools/valutazione">/tools/valutazione</a>, fra le ricerche recenti.</p>`);
  } else if (l.scheda === 'tetto') {
    sezioni.push('<p>Scheda completa non ordinata: tetto di spesa del simulatore raggiunto.</p>');
  }

  if (l.fornitore) {
    sezioni.push(`<h2 style="font-size:16px;color:#664CCD;margin:20px 0 8px">Fornitore</h2>`);
    sezioni.push(l.fornitore.letta ? tabellaAzienda(l.fornitore.letta) : `<p>Partita IVA ${escapeHtml(l.fornitore.piva)}: verifica non eseguita.</p>`);
  }

  return layoutMail(oggettoMail(l), sezioni.join('\n'));
}
