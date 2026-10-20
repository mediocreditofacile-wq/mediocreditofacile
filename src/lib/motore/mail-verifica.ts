// La mail ad Alberto per ogni verifica nuova di un fornitore col semaforo del
// locatore (decisione del 15/10/2026) o col prefiltro (Led Office, 20/10/2026).
// Una sola, con l'esito finale degli eventi; una seconda solo se un esito arrivato
// tardi porta il rosso.
//
// Sul prefiltro la mail porta quello che il commerciale non vede: motivo ed effetto
// della segnalazione di MCF, data, canale e fornitore della pratica recente.
//
// ATTENZIONE — FILE SERVER-ONLY.

import { DESTINATARIO_MCF, escapeHtml, inviaMail, layoutMail, type EsitoMail } from '../mail-portale';
import { datiLocatore, type DatiCreditoMotore, type SchedaRidotta } from './merito';
import { datiPrefiltro, valutaPrefiltro, type PraticaTrovata, type SegnaliPrefiltro } from './prefiltro';
import { TESTO_EVENTI, valutaLocatore, type StatoEventi } from './semaforo-locatore';

export interface DatiMailVerifica {
  fornitore: string;
  agente: { nome: string; email: string };
  scheda: SchedaRidotta;
  dati: DatiCreditoMotore;
  /** Cosa si e' pagato adesso: la scheda, la verifica eventi, o tutte e due */
  nuova: { scheda: boolean; eventi: boolean };
  /** Seconda mail: un esito arrivato tardi che cambia il colore */
  aggiornamento?: boolean;
  /** Fornitori col prefiltro: i segnali letti alla ricerca. Assente = semaforo del locatore */
  prefiltro?: { segnali: SegnaliPrefiltro };
}

export const FONTE_PRATICA: Record<PraticaTrovata['fonte'], string> = {
  motore: 'portale dei fornitori',
  portale: 'portale pratiche',
  esterna: 'storico importato',
};

const eur = (n: number | null | undefined) =>
  n == null ? 'non disponibile'
    : `${n.toLocaleString('it-IT', { maximumFractionDigits: 0, useGrouping: 'always' } as Intl.NumberFormatOptions)} euro`;

export function corpoMailVerifica(d: DatiMailVerifica, eventi: StatoEventi, oggi: Date = new Date()) {
  // Senza distinta: alla verifica valgono solo le regole sul cliente, le categorie non servono
  const v = d.prefiltro
    ? valutaPrefiltro(datiPrefiltro(d.dati), d.prefiltro.segnali, eventi, [], null, oggi)
    : valutaLocatore(datiLocatore(d.dati), null, eventi, oggi);
  const s = d.scheda;
  const riga = (et: string, val: string) =>
    `<tr><td style="padding:4px 12px 4px 0;width:200px;vertical-align:top"><strong>${escapeHtml(et)}</strong></td><td>${escapeHtml(val)}</td></tr>`;
  const segnalato = d.prefiltro?.segnali.segnalato;
  const recente = d.prefiltro?.segnali.praticaRecente;
  const righeMcf = [
    segnalato ? riga('Cliente segnalato', `${segnalato.motivo}, effetto ${segnalato.effetto}`) : '',
    recente
      ? riga('Pratica recente', [
        recente.data.split('-').reverse().join('/'),
        recente.canale ?? 'canale non indicato',
        recente.fornitore ?? 'fornitore non indicato',
        FONTE_PRATICA[recente.fonte],
      ].join(', '))
      : '',
  ].join('');
  const subject = `${d.aggiornamento ? 'Aggiornamento verifica' : 'Verifica'} ${d.fornitore} — ${s.ragioneSociale} — ${v.etichetta}`;
  const html = layoutMail(d.aggiornamento ? 'Esito della verifica aggiornato' : 'Verifica cliente dal portale', `
    <p style="font-size:14px;color:#787782;margin:0 0 18px">
      Portale ${escapeHtml(d.fornitore)} — ricerca di ${escapeHtml(d.agente.nome || d.agente.email)} (${escapeHtml(d.agente.email)})
    </p>
    <table style="font-size:14px;border-collapse:collapse;width:100%">
      ${riga('Cliente', `${s.ragioneSociale}, P.IVA ${s.piva}`)}
      ${riga('Sede', s.sede ?? '-')}
      ${riga('Forma giuridica', s.formaGiuridica ?? '-')}
      ${riga('Semaforo', v.etichetta)}
      ${riga('Fatturato', `${eur(d.dati.fatturato)}${d.dati.annoBilancio ? ` (${d.dati.annoBilancio})` : ''}`)}
      ${riga('Patrimonio netto', eur(d.dati.patrimonioNetto))}
      ${riga('Eventi negativi', TESTO_EVENTI[eventi])}
      ${riga('Origine', `scheda ${d.nuova.scheda ? 'nuova' : 'dalla cache'}, eventi ${d.nuova.eventi ? 'nuovi' : 'dal registro'}`)}${righeMcf}
    </table>
    ${v.righe.length ? `<ul style="font-size:14px;margin:16px 0 0;padding-left:18px">${v.righe.map((r) => `<li>${escapeHtml(r)}</li>`).join('')}</ul>` : ''}
    ${v.criteri.length ? `<h3 style="color:#0F1020;font-size:15px;margin:20px 0 8px">Criteri</h3>
    <ul style="font-size:14px;margin:0;padding-left:18px">${v.criteri.map((c) => `<li>${escapeHtml(c.nome)}: ${escapeHtml(c.valore)}</li>`).join('')}</ul>` : ''}
    <p style="font-size:13px;color:#787782;margin:18px 0 0">Valutazione indicativa, non è una delibera, fatta senza importo. Il dettaglio degli eventi è nel registro di /tools/valutazione.</p>
  `);
  return { subject, html };
}

export function mandaMailVerifica(d: DatiMailVerifica, eventi: StatoEventi): Promise<EsitoMail> {
  const m = corpoMailVerifica(d, eventi);
  return inviaMail({ to: DESTINATARIO_MCF, subject: m.subject, html: m.html });
}
