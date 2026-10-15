// Il preventivo del motore dei portali: salva la proposta, genera i PDF, avvisa MCF.
//
// ATTENZIONE — FILE SERVER-ONLY.
//
// I numeri escono da calcolaProposta(), la stessa funzione che li mostra a
// schermo: non esiste un secondo calcolo per il PDF. Sui fornitori fotovoltaico
// i documenti sono i prospetti del microservizio (repo ~/dev/mcf-prospetti-pv):
//  - prospetto di noleggio e infografico col marchio del fornitore
//  - prospetto di leasing a marchio MCF con l'iscrizione OAM, solo quando il
//    motore delle proposte ha proposto il leasing
// Il leasing viaggia gia' calcolato (leasing_esterno): il microservizio lo
// stampa cosi' com'e', senza rifarlo al tasso fisso di confronto.
// Sugli altri settori i documenti li fa pdf-generico.ts, qui dentro la funzione:
// preventivo di noleggio col nome del fornitore e, se c'e' il leasing, prospetto
// di leasing a marchio MCF con l'iscrizione OAM.
//
// Se il microservizio non risponde il preventivo NON fallisce: la proposta si
// salva lo stesso, la mail parte senza allegati e il portale lo dice.

import { brandFornitore } from '../brand-fornitore';
import { query } from '../db';
import { dataEstesaDaIso } from '../duplex-calendario';
import { DESTINATARIO_MCF, escapeHtml, inviaMail, layoutMail } from '../mail-portale';
import { generaPdf, salvaPdf, type DocumentoGenerato } from '../preventivi-pv';
import { buildPayloadPdf, euro } from '../prospetti-pv';
import { getTabella } from '../tabelle-canoni';
import { esitoPerSchermo, type CalcoloProposta } from './calcolo-proposta';
import { documentiGenerici } from './pdf-generico';
import { documentiMacchine } from './pdf-macchine';
import { tabellaConMarkup } from './proposte';
import { generaId, type EsitoMotore } from './sessione';

type Sessione = Extract<EsitoMotore, { ok: true }>;

export const NOTA_DEMO = 'Documento dimostrativo: catalogo e importi di esempio';

export interface EsitoPreventivo {
  ok: boolean;
  error?: string;
  id?: string;
  pdfPronti?: boolean;
  documenti?: { nome: string; pathname: string }[];
}

/** I prospetti del microservizio sul fotovoltaico, i preventivi generici sugli altri settori */
async function documentiPdf(e: Sessione, c: CalcoloProposta, id: string) {
  const { carrozzeria } = e;
  const bp = c.bp;
  if (carrozzeria.settore === 'macchine') {
    const pdf = documentiMacchine(c, carrozzeria, id, { nome: e.contesto.nome ?? '', email: e.contesto.email });
    const documenti = await salvaPdf(carrozzeria.slug, id, pdf);
    return { documenti, allegati: pdf, attesi: pdf.length, err: documenti.length === pdf.length ? undefined : 'salvataggio_pdf' };
  }
  if (carrozzeria.settore !== 'fotovoltaico') {
    const pdf = documentiGenerici(c, carrozzeria, id);
    const documenti = await salvaPdf(carrozzeria.slug, id, pdf);
    return { documenti, allegati: pdf, attesi: pdf.length, err: documenti.length === pdf.length ? undefined : 'salvataggio_pdf' };
  }
  if (!bp) {
    return { documenti: [] as DocumentoGenerato[], allegati: [] as { filename: string; contenuto: string }[], attesi: 0, err: 'pdf_non_previsto' };
  }
  const brand = await brandFornitore({
    logo: carrozzeria.brand.logo,
    colore: carrozzeria.brand.colore,
    accento: carrozzeria.brand.accento,
    nome: carrozzeria.nome,
  });
  const payload = buildPayloadPdf(bp.input, bp.calcolo, {
    ...bp.opzioni,
    fornitoreNome: carrozzeria.nome,
    fornitoreCitta: carrozzeria.citta ?? undefined,
    fornitoreEtichetta: carrozzeria.nome,
    separati: true,
    brand,
  });
  if (carrozzeria.demo) payload.nota_demo = NOTA_DEMO;

  // I coefficienti viaggiano col markup gia' dentro: il PDF stampa lo stesso
  // canone che l'agente ha visto a schermo
  const tabella = tabellaConMarkup(getTabella(carrozzeria.tabellaCanoni), c.esito.markup);
  const r = await generaPdf(payload, tabella);
  const documenti = r.ok && r.pdf ? await salvaPdf(carrozzeria.slug, id, r.pdf) : [];
  return { documenti, allegati: r.ok && r.pdf ? r.pdf : [], attesi: bp.conLeasing ? 3 : 2, err: r.err };
}

/** Inserisce la proposta; se l'id del secondo e' gia' preso si aggiunge un suffisso */
async function salvaProposta(e: Sessione, c: CalcoloProposta, idBase: string, corpo: Record<string, unknown>) {
  const { contesto, carrozzeria } = e;
  const mc = c.macchine;
  const numeri = {
    ...esitoPerSchermo(c),
    scelta: mc
      ? { durata: mc.durata, canone: mc.tradizionale?.canone ?? null, canoneAlternativo: mc.alternativa?.canone ?? null }
      : c.bp
        ? {
            durata: c.bp.calcolo.durata,
            canone: c.bp.calcolo.canone,
            rataLeasing: c.bp.calcolo.leasingEsterno?.rata ?? null,
          }
        : null,
  };
  // L'input dell'agente, per poter rifare lo stesso conto
  const dati = mc
    ? { codice: corpo.codice, accessori: corpo.accessori ?? {}, prezzo: c.prezzo, consegna: mc.consegna, durata: mc.durata }
    : { codice: corpo.codice, prezzo: c.prezzo, bp: c.inputBp };
  for (let tentativo = 0; tentativo < 4; tentativo++) {
    const id = tentativo ? `${idBase}-${tentativo + 1}` : idBase;
    const righe = await query(
      `INSERT INTO app.proposta (id, fornitore_slug, organization_id, user_id, ricerca_id, piva, cliente_nome,
                                 voce_codice, descrizione, prezzo, semaforo, anticipo, markup, dati, numeri)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT (id) DO NOTHING RETURNING id`,
      [id, carrozzeria.slug, contesto.organizationId, contesto.userId, c.ricerca?.id ?? null, c.cliente.piva ?? '',
       c.cliente.nome || 'Senza intestatario', c.voce.codice, c.descrizione, c.prezzo, c.esito.semaforo,
       c.esito.anticipoRichiesto, c.esito.markup,
       JSON.stringify(dati), JSON.stringify(numeri)],
    );
    if (righe.length) return id;
  }
  throw new Error('id_proposta_occupato');
}

async function mailMcf(e: Sessione, c: CalcoloProposta, id: string, allegati: { filename: string; contenuto: string }[]) {
  const { contesto, carrozzeria } = e;
  const cl = c.cliente;
  const rating = c.ricerca?.dati_credito.scheda.rating;
  const eur = (v: number, dec = 0) => `${euro(v, dec)} euro`;
  const riga = (et: string, val: string) =>
    `<tr><td style="padding:4px 12px 4px 0;width:210px;vertical-align:top"><strong>${et}</strong></td><td>${escapeHtml(val)}</td></tr>`;
  const b = c.bp?.calcolo;
  const mc = c.macchine;
  const sem = !cl.verificato
    ? 'nessuno, cliente non verificato'
    : c.esito.locatore
    ? c.esito.locatore.etichetta
    : `${c.esito.semaforo}${c.esito.anticipoRichiesto ? `, anticipo richiesto ${c.esito.anticipoRichiesto}%` : ''}${c.esito.markup ? `, markup ${c.esito.markup}%` : ''}`;
  return inviaMail({
    to: DESTINATARIO_MCF,
    subject: `${carrozzeria.nome} — ${contesto.nome || contesto.email} — ${cl.nome || 'senza intestatario'}${cl.verificato ? '' : ' (non verificato)'} — ${eur(c.prezzo)}`,
    allegati: allegati.map((f) => ({ filename: f.filename, content: f.contenuto })),
    html: layoutMail('Nuovo preventivo dal portale', `
      <p style="font-size:14px;color:#787782;margin:0 0 18px">
        Portale ${escapeHtml(carrozzeria.nome)}${carrozzeria.demo ? ' (dimostrativo)' : ''} — preventivo ${escapeHtml(id)}<br>
        Generato da ${escapeHtml(contesto.nome || contesto.email)} (${escapeHtml(contesto.email)})
      </p>
      <table style="font-size:14px;border-collapse:collapse;width:100%">
        ${riga('Cliente', cl.verificato ? `${cl.nome}, P.IVA ${cl.piva}` : `${cl.nome || 'non indicato'} (cliente non verificato)`)}
        ${cl.verificato ? riga('Rating', rating ? `${rating.classe} (${rating.descrizione ?? ''})` : 'non assegnato') : ''}
        ${riga('Semaforo', sem)}
        ${riga(mc ? 'Configurazione' : 'Offerta', mc ? c.descrizione : `${c.voce.nome} (${c.voce.codice})`)}
        ${riga('Prezzo trattato', `${eur(c.prezzo)} (listino ${eur(mc?.listino ?? c.voce.prezzo)})`)}
        ${mc ? riga('Noleggio scelto', `${mc.durata} mesi: ${mc.tradizionale ? `${eur(mc.tradizionale.canone, 2)} tradizionale` : 'tradizionale fuori listino'}${mc.alternativa ? `, ${eur(mc.alternativa.canone, 2)} ${mc.nomeAlternativa}` : ''}`) : ''}
        ${mc ? riga('Consegna prevista', dataEstesaDaIso(mc.consegna)) : ''}
        ${b ? riga('Noleggio scelto', `${b.durata} mesi, ${eur(b.canone, 2)} al mese`) : ''}
        ${b?.leasingEsterno ? riga('Leasing', `${b.durata} mesi, anticipo ${b.leasingEsterno.anticipoPerc}%, rata ${eur(b.leasingEsterno.rata, 2)}`) : ''}
        ${b ? riga('Copertura del canone', `${euro(b.coperturaCanone * 100, 0)}%`) : ''}
        ${!b && !mc && c.esito.noleggio.length ? riga('Noleggio', c.esito.noleggio.map((n) => `${n.durata} mesi ${eur(n.canone, 2)}`).join(' · ')) : ''}
        ${!b && !mc && c.esito.leasing.length ? riga('Leasing', c.esito.leasing.map((l) => `${l.durata} mesi ${eur(l.rata, 2)}`).join(' · ')) : ''}
      </table>
      ${allegati.length ? '' : `<p style="font-size:14px;color:#8A2D0E;margin:16px 0 0">I PDF non sono allegati: il servizio di generazione non ha risposto o il settore non li prevede. I numeri restano validi.</p>`}
    `),
  });
}

export async function generaPreventivoMotore(
  e: Sessione,
  c: CalcoloProposta,
  corpo: Record<string, unknown>,
): Promise<EsitoPreventivo> {
  if (c.esito.bloccate) return { ok: false, error: 'proposta_bloccata' };

  // Prima si riserva l'id con la riga, poi si generano i PDF nella sua
  // cartella: due agenti nello stesso secondo non finiscono nella stessa.
  const id = await salvaProposta(e, c, generaId(e.carrozzeria.prefisso), corpo);
  const pdf = await documentiPdf(e, c, id);
  const pdfPronti = pdf.attesi > 0 && pdf.documenti.length === pdf.attesi;
  await query(`UPDATE app.proposta SET documenti = $2, pdf_pronti = $3 WHERE id = $1`, [
    id, JSON.stringify(pdf.documenti.map((d) => ({ nome: d.nome, pathname: d.pathname }))), pdfPronti,
  ]);
  const mail = await mailMcf(e, c, id, pdfPronti ? pdf.allegati : []);

  console.log(JSON.stringify({
    evento: 'motore_preventivo',
    fornitore: e.carrozzeria.slug,
    id,
    userId: e.contesto.userId,
    prezzo: c.prezzo,
    semaforo: c.esito.semaforo,
    pdf_ok: pdfPronti,
    pdf_err: pdf.err,
    mail_ok: mail.ok,
  }));

  return { ok: true, id, pdfPronti, documenti: pdf.documenti.map((d) => ({ nome: d.nome, pathname: d.pathname })) };
}
