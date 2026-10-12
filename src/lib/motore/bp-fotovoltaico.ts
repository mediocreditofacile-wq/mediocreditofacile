// Business plan fotovoltaico del motore dei portali.
//
// ATTENZIONE — FILE SERVER-ONLY.
//
// Usa lo stesso motore dei prospetti PDF (src/lib/prospetti-pv.ts), non un
// modello suo: Arca Energia calcola l'iperammortamento in un altro modo, e se
// lo schermo dicesse una cifra e il PDF un'altra l'agente se ne accorgerebbe
// davanti al cliente. Rispetto a Green-Go cambiano due cose, e le decide il
// motore delle proposte: il canone porta il markup della credit policy, e il
// leasing e' quello del partner (Alba sul demo) invece del 6 per cento.

import { agevolazioneAttiva } from '../../data/leasing';
import { getTabella } from '../tabelle-canoni';
import {
  calcolaPreventivo,
  type Calcolo,
  type InputPreventivo,
  type OpzioniProspetto,
  type Profilo,
} from '../prospetti-pv';
import { condizioniLeasing, leasingPartner, tabellaConMarkup, type EsitoProposte } from './proposte';
import type { Carrozzeria, VoceCatalogo } from './carrozzeria';

/** Quello che l'agente aggiunge al pacchetto: dove e quanto consuma il cliente */
export interface InputBp {
  provincia: string;
  comune?: string;
  consumoAnnuo?: number | null;
  prezzoKwh?: number | null;
  profilo?: Profilo;
  durata?: number | null;
  includiSabatini?: boolean;
  includiIper?: boolean;
}

export interface EsitoBp {
  calcolo: Calcolo;
  input: InputPreventivo;
  opzioni: OpzioniProspetto;
  conLeasing: boolean;
  agevolazioniAperte: { sabatini: boolean; iper: boolean };
}

const numero = (v: unknown) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

/** Il pacchetto del catalogo porta potenza, accumulo e tipo di installazione */
export function datiImpianto(voce: VoceCatalogo) {
  const a = voce.attributi ?? {};
  const inst = String(a.installazione ?? 'tetto');
  return {
    kwp: numero(a.kwp),
    kwhAccumulo: numero(a.kwh_accumulo),
    installazione: (['tetto', 'pensilina', 'terra'].includes(inst) ? inst : 'tetto') as InputPreventivo['installazione'],
  };
}

export function businessPlan(
  carrozzeria: Carrozzeria,
  voce: VoceCatalogo,
  importo: number,
  cliente: { nome: string; formaGiuridica: InputPreventivo['forma_giuridica'] },
  bp: InputBp,
  proposte: EsitoProposte,
  opzioniPdf: Pick<OpzioniProspetto, 'fornitoreNome' | 'fornitoreCitta' | 'separati' | 'brand'> = {},
): EsitoBp | null {
  if (proposte.bloccate || !proposte.noleggio.length) return null;
  const impianto = datiImpianto(voce);
  if (impianto.kwp <= 0) return null;

  const tabella = tabellaConMarkup(getTabella(carrozzeria.tabellaCanoni), proposte.markup);
  const durata = numero(bp.durata);
  const input: InputPreventivo = {
    cliente: cliente.nome,
    comune: (bp.comune ?? '').slice(0, 80),
    provincia: (bp.provincia ?? '').trim().slice(0, 2).toUpperCase(),
    forma_giuridica: cliente.formaGiuridica,
    rif_preventivo: voce.nome,
    kwp: impianto.kwp,
    kwh_accumulo: impianto.kwhAccumulo,
    importo,
    installazione: impianto.installazione,
    consumo_annuo: numero(bp.consumoAnnuo) || null,
    prezzo_kwh: numero(bp.prezzoKwh) || null,
    profilo: bp.profilo === 'h24' ? 'h24' : 'diurno',
    durata: tabella.durate.includes(durata) ? durata : null,
  };

  // Il leasing c'e' se il motore delle proposte lo ha proposto: stessa soglia,
  // stesso partner, stesso anticipo. Le agevolazioni le apre solo il leasing,
  // e solo se il registro AGEVOLAZIONI_STATO le da' per aperte.
  const conLeasing = proposte.leasing.length > 0;
  const sabatini = conLeasing && agevolazioneAttiva('sabatini');
  const iper = conLeasing && agevolazioneAttiva('iperammortamento');
  const { partner, anticipoPerc, markup } = condizioniLeasing(carrozzeria, proposte.credito);

  const opzioni: OpzioniProspetto = {
    ...opzioniPdf,
    includiSabatini: sabatini && bp.includiSabatini !== false,
    includiIper: iper && bp.includiIper !== false,
    conLeasing,
    leasing: conLeasing ? (d) => leasingPartner(partner, importo, d, anticipoPerc, markup) : undefined,
  };

  const calcolo = calcolaPreventivo(input, tabella, opzioni);
  return { calcolo, input, opzioni, conLeasing: conLeasing && calcolo.leasingEsterno != null, agevolazioniAperte: { sabatini, iper } };
}

/**
 * I numeri del business plan per lo schermo. Solo risultati: nessun
 * coefficiente, nessuna fascia. Senza leasing i campi del leasing non escono,
 * cosi' il 6 per cento di confronto del motore non arriva mai all'agente.
 */
export function bpPerSchermo(e: EsitoBp) {
  const c = e.calcolo;
  const base = {
    durate: c.durate,
    canoni: c.canoni,
    riscatti: c.riscatti,
    durata: c.durata,
    durataConsigliata: c.durataConsigliata,
    durataForzata: c.durataForzata,
    canone: c.canone,
    totCanoni: c.totCanoni,
    riscatto: c.riscatto,
    zona: c.zona,
    produzione: c.produzione,
    autoconsumoQuota: c.autoconsumoQuota,
    autoKwh: c.autoKwh,
    cedKwh: c.cedKwh,
    prezzoKwh: c.prezzoKwh,
    datiRealiConsumo: c.datiRealiConsumo,
    beneficioAnno: c.beneficioAnno,
    beneficioMese: c.beneficioMese,
    coperturaCanone: c.coperturaCanone,
    margineMese: c.margineMese,
    fiscoNol: c.fiscoNol,
    costoNettoNol: c.costoNettoNol,
    conLeasing: e.conLeasing,
    agevolazioniAperte: e.agevolazioniAperte,
  };
  if (!e.conLeasing || !c.leasingEsterno) return base;
  return {
    ...base,
    leasing: c.leasingEsterno,
    totLeasing: c.totLeasing,
    interessi: c.interessi,
    sabatini: c.sabatini,
    sabatiniNetto: c.sabatiniNetto,
    iresIper: c.iresIper,
    iperNetto: c.iperNetto,
    conSabatini: c.conSabatini,
    conIper: c.conIper,
    costoNettoLeasing: c.costoNettoLeasing,
  };
}
