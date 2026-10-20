// Le pratiche del motore dei portali.
//
// ATTENZIONE — FILE SERVER-ONLY.
//
// Una pratica nasce da una ricerca di merito (il cliente e' quello verificato,
// non uno scritto a mano) e facoltativamente da un preventivo salvato. I
// documenti salgono dal browser direttamente sullo store Blob, sotto una
// cartella di bozza con un identificativo casuale; qui si controlla che ogni
// percorso stia in quella cartella e si salva l'elenco.
//
// All'invio parte la verifica eventi negativi sull'azienda (0,45 euro): e' il
// momento in cui il cliente e' vero. Se la stessa verifica e' gia' stata fatta
// negli ultimi 30 giorni, da qui o da /tools/valutazione, si usa quella
// (registro verifiche-cache). L'esito lo vede solo MCF.
//
// Lo stato si sposta da uno qualunque a un altro qualunque, anche di piu'
// passi alla volta e su piu' pratiche insieme. Ogni cambio resta in 'storia'.

import { buildChecklist } from '../checklist-pratica';
import { query, queryUna } from '../db';
import { formattaIban } from '../iban';
import { DESTINATARIO_MCF, escapeHtml, inviaMail, layoutMail } from '../mail-portale';
import {
  avviaNegativita,
  entroIlTetto,
  esitoNegativita,
  leggiVerifica,
  scriviVerifica,
  sorgenteCarrozzeria,
} from '../openapi';
import { BASE_URL } from '../auth';
import { codiceVerifica } from './eventi-stato';
import { percorsoPortale } from '../percorso-portale';
import { decidiVerifica } from '../verifiche-cache';
import { euro } from '../prospetti-pv';
import type { RicercaSalvata } from './calcolo-proposta';
import { generaId, filtroVisibilita, type EsitoMotore } from './sessione';

type Sessione = Extract<EsitoMotore, { ok: true }>;

export const STATI = ['ricevuta', 'in-lavorazione', 'in-delibera', 'approvata', 'declinata'] as const;
export type StatoPratica = (typeof STATI)[number];

export const ETICHETTA_STATO: Record<StatoPratica, string> = {
  'ricevuta': 'Ricevuta',
  'in-lavorazione': 'In lavorazione',
  'in-delibera': 'In delibera',
  'approvata': 'Approvata',
  'declinata': 'Declinata',
};

export const FORME = ['Società di capitali', 'Società di persone', 'Ditta individuale', 'Lavoratore autonomo', 'Altro'] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** La cartella in cui il browser carica i documenti di una pratica non ancora inviata */
export const cartellaBozza = (slug: string, bozza: string) => `pratiche/${slug}/bozze/${bozza}/`;

export function bozzaValida(bozza: string): boolean {
  return UUID.test(bozza);
}

export interface DocumentoPratica { nome: string; pathname: string; size: number }

/**
 * I documenti dichiarati dal browser, tenuti solo se stanno nella cartella della bozza.
 * `voce` (la voce della checklist sotto cui e' stato caricato) passa solo se il browser
 * la manda: oggi lo fa il settore distinta, dove il server tiene poi soltanto i
 * documenti delle voci di quel cliente (pratica-distinta.ts). Gli altri fornitori non
 * la mandano e il loro elenco resta com'era.
 */
export function documentiDellaBozza(
  slug: string,
  bozza: string,
  grezzi: unknown,
): (DocumentoPratica & { voce?: string })[] {
  if (!bozzaValida(bozza) || !Array.isArray(grezzi)) return [];
  const cartella = cartellaBozza(slug, bozza);
  return grezzi
    .map((d) => d as Record<string, unknown>)
    .filter((d) => typeof d?.pathname === 'string' && d.pathname.startsWith(cartella) && !d.pathname.includes('..'))
    .slice(0, 40)
    .map((d) => {
      const voce = typeof d.voce === 'string' ? d.voce.trim().slice(0, 300) : '';
      return {
        nome: String(d.nome ?? '').slice(0, 160) || String(d.pathname).split('/').pop()!,
        pathname: String(d.pathname),
        size: Number(d.size) || 0,
        ...(voce ? { voce } : {}),
      };
    });
}

/**
 * Verifica eventi negativi sull'azienda: dal registro se c'e', altrimenti a pagamento.
 * La usa anche la pratica di distinta (pratica-distinta.ts): stessa regola, non si ripaga.
 */
export async function negativitaAllInvio(e: Sessione, piva: string) {
  try {
    const registro = await leggiVerifica(piva);
    const decisione = decidiVerifica(registro, 'negativita');
    if (decisione.azione === 'registro') {
      return { id: decisione.id, avviata: decisione.avviata, pronto: decisione.pronto, dati: decisione.dati ?? null, daRegistro: true };
    }
    const sorgente = sorgenteCarrozzeria(e.carrozzeria.slug);
    const tetto = await entroIlTetto('IT-negativita', sorgente, e.carrozzeria.tettoMeseEuro);
    // Budget finito: la pratica parte lo stesso, la verifica la lancia MCF a mano
    if (!tetto.ok) return { id: null, pronto: false, saltata: 'tetto' };
    const id = await avviaNegativita(piva, sorgente);
    if (!id) return { id: null, pronto: false, saltata: 'errore' };
    const avviata = new Date().toISOString();
    await scriviVerifica(piva, 'negativita', { id, avviata, pronto: false }).catch(() => {});
    return { id, avviata, pronto: false };
  } catch (err) {
    console.error(JSON.stringify({ evento: 'motore_negativita_errore', piva, msg: String(err) }));
    return { id: null, pronto: false, saltata: 'errore' };
  }
}

export interface InputPratica {
  ricerca: RicercaSalvata;
  propostaId: string | null;
  bozza: string;
  prodotto: 'noleggio' | 'leasing';
  durata: number;
  importo: number;
  formaGiuridica: string;
  referente: { nome: string; telefono: string; email: string };
  /** Normalizzato e controllato (src/lib/iban.ts). Sta in app.pratica.dati e nella mail a MCF, mai nello storico. */
  iban: string;
  note: string;
  documenti: DocumentoPratica[];
}

export async function creaPratica(e: Sessione, p: InputPratica): Promise<string> {
  const { contesto, carrozzeria } = e;
  const checklist = buildChecklist(p.formaGiuridica, p.importo, carrozzeria.documentiExtra);
  const negativita = await negativitaAllInvio(e, codiceVerifica(p.ricerca));
  const adesso = new Date().toISOString();
  const dati = {
    prodotto: p.prodotto,
    durata: p.durata,
    formaGiuridica: p.formaGiuridica,
    referente: p.referente,
    iban: p.iban,
    note: p.note,
    checklist,
    bozza: p.bozza,
  };
  const storia = [{ a: 'ricevuta', chi: contesto.nome || contesto.email, quando: adesso }];

  const idBase = generaId(carrozzeria.prefisso, 'P');
  let id = '';
  for (let t = 0; t < 4 && !id; t++) {
    const prova = t ? `${idBase}-${t + 1}` : idBase;
    const righe = await query(
      `INSERT INTO app.pratica (id, fornitore_slug, organization_id, user_id, proposta_id, piva, cliente_nome,
                                importo, dati, documenti, negativita, storia)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (id) DO NOTHING RETURNING id`,
      [prova, carrozzeria.slug, contesto.organizationId, contesto.userId, p.propostaId, p.ricerca.piva,
       p.ricerca.dati_credito.scheda.ragioneSociale || 'Cliente', p.importo, JSON.stringify(dati),
       JSON.stringify(p.documenti), JSON.stringify(negativita), JSON.stringify(storia)],
    );
    if (righe.length) id = prova;
  }
  if (!id) throw new Error('id_pratica_occupato');

  await mailPratica(e, id, p, checklist, negativita).catch((err) =>
    console.error(JSON.stringify({ evento: 'motore_pratica_mail_errore', id, msg: String(err) })));
  console.log(JSON.stringify({
    evento: 'motore_pratica', fornitore: carrozzeria.slug, id, userId: contesto.userId,
    importo: p.importo, documenti: p.documenti.length,
    negativita: (negativita as any).daRegistro ? 'registro' : negativita.id ? 'avviata' : `saltata_${(negativita as any).saltata}`,
  }));
  return id;
}

async function mailPratica(e: Sessione, id: string, p: InputPratica, checklist: string[], negativita: any) {
  const { contesto, carrozzeria } = e;
  const s = p.ricerca.dati_credito.scheda;
  const riga = (et: string, val: string) =>
    `<tr><td style="padding:4px 12px 4px 0;width:200px;vertical-align:top"><strong>${et}</strong></td><td>${escapeHtml(val)}</td></tr>`;
  const neg = negativita.pronto
    ? 'gia\' in registro, esito nel pannello'
    : negativita.id ? 'avviata, l\'esito arriva nel pannello' : `non avviata (${negativita.saltata}): lanciala da /tools/valutazione`;
  const link = `${BASE_URL}${percorsoPortale(carrozzeria.slug)}`;
  return inviaMail({
    to: DESTINATARIO_MCF,
    subject: `Pratica ${carrozzeria.nome} — ${s.ragioneSociale} — ${euro(p.importo, 0)} euro`,
    html: layoutMail('Nuova pratica dal portale', `
      <p style="font-size:14px;color:#787782;margin:0 0 18px">
        Portale ${escapeHtml(carrozzeria.nome)}${carrozzeria.demo ? ' (dimostrativo)' : ''} — pratica ${escapeHtml(id)}<br>
        Caricata da ${escapeHtml(contesto.nome || contesto.email)} (${escapeHtml(contesto.email)})
      </p>
      <table style="font-size:14px;border-collapse:collapse;width:100%">
        ${riga('Cliente', `${s.ragioneSociale}, P.IVA ${s.piva}`)}
        ${riga('Forma giuridica', p.formaGiuridica)}
        ${riga('Referente', p.referente.nome || '-')}
        ${riga('Cellulare', p.referente.telefono)}
        ${riga('Email', p.referente.email)}
        ${riga('IBAN', formattaIban(p.iban))}
        ${riga('Prodotto', `${p.prodotto === 'leasing' ? 'Leasing finanziario' : 'Noleggio operativo'}, ${p.durata} mesi`)}
        ${riga('Importo', `${euro(p.importo, 0)} euro`)}
        ${riga('Rating', s.rating ? `${s.rating.classe} (${s.rating.descrizione ?? ''})` : 'non assegnato')}
        ${riga('Eventi negativi', neg)}
        ${riga('Documenti caricati', `${p.documenti.length}`)}
        ${p.note ? riga('Note', p.note) : ''}
      </table>
      <h3 style="color:#0F1020;font-size:15px;margin:20px 0 8px">Checklist</h3>
      <ul style="font-size:14px;margin:0;padding-left:18px">${checklist.map((c) => `<li>${escapeHtml(c)}</li>`).join('')}</ul>
      <p style="margin:22px 0 0"><a href="${link}" style="color:#664CCD">Apri il portale</a> per i documenti e lo stato.</p>
    `),
  });
}

/**
 * Sposta una o piu' pratiche allo stato indicato, da qualunque stato. Solo
 * MCF. Restituisce quante pratiche ha toccato.
 */
export async function spostaStato(e: Sessione, ids: string[], stato: StatoPratica): Promise<number> {
  const chi = e.contesto.nome || e.contesto.email;
  const righe = await query(
    `UPDATE app.pratica
        SET storia = storia || jsonb_build_array(jsonb_build_object('da', stato, 'a', $3::text, 'chi', $4::text, 'quando', now())),
            stato = $3, aggiornato = now()
      WHERE fornitore_slug = $1 AND id = ANY($2::text[]) AND stato <> $3
      RETURNING id`,
    [e.carrozzeria.slug, ids, stato, chi],
  );
  return righe.length;
}

/** Aggiorna l'esito della verifica eventi negativi di una pratica, se e' pronto */
export async function aggiornaNegativita(e: Sessione, praticaId: string) {
  const { where, valori } = filtroVisibilita(e, '', 2);
  const p = await queryUna<{ piva: string; negativita: any }>(
    `SELECT piva, negativita FROM app.pratica WHERE id = $1 AND ${where}`,
    [praticaId, ...valori],
  );
  if (!p) return null;
  const n = p.negativita ?? {};
  if (n.pronto || !n.id) return n;
  const esito = await esitoNegativita(n.id, sorgenteCarrozzeria(e.carrozzeria.slug));
  if (!esito.pronto) return n;
  const nuovo = { ...n, pronto: true, dati: esito.dati, concluso: new Date().toISOString() };
  await query(`UPDATE app.pratica SET negativita = $2 WHERE id = $1`, [praticaId, JSON.stringify(nuovo)]);
  await scriviVerifica(p.piva, 'negativita', { id: n.id, avviata: n.avviata, pronto: true, dati: esito.dati, concluso: nuovo.concluso }).catch(() => {});
  return nuovo;
}
