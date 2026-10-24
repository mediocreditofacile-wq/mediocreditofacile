// Client dello strumento di valutazione interno MCF.
// Rende la scheda che arriva da /api/azienda e gestisce le verifiche a richiesta.
// I dizionari (etichette, ruoli, valori, codici di bilancio) arrivano dalla pagina
// su window.__VAL__: sono dati generati, non vanno riscritti a mano.

import { montaDocumenti } from './documenti-ufficiali';
import { PAESI_SEPA, PAESI_MONDO, FORMATO_ID, nomePaese } from '../data/paesi';
import { leggiReport, sintesiReport } from '../lib/report-persona';
import { leggiEventiNegativi, sintesiEventi, conEventi, confrontoVerificaVisura, senzaProtesti } from '../lib/eventi-negativi';
import { htmlEventi } from './eventi-negativi-html';
import { riepilogoSpesa, type RiepilogoSpesa } from '../lib/tetto-openapi';
import { normalizzaIdEstero } from '../lib/id-estero';

type Dizionari = {
  CODICI: Record<string, string>;
  ETICHETTE: Record<string, string>;
  RUOLI: Record<string, string>;
  VALORI: Record<string, string>;
};

const CHIAVE_LS = 'mcf_valutazione_key';
const SCALA = ['A1', 'A2', 'A3', 'B1', 'B2', 'B3', 'C1', 'C2', 'C3'];
const COLORI = ['#0F7B34', '#2E9E43', '#66B72F', '#A8C61C', '#E3C400', '#F0A000', '#EE6B1F', '#DC3220', '#A31515'];
const PREZZI = { neg: 0.45, rep: 3.6 };

let D: Dizionari;
let chiave = '';
let schedaCorrente: any = null;   // ultima scheda caricata, serve al PDF

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const esc = (s: unknown) =>
  String(s ?? '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c] as string));

// --- formattazione -----------------------------------------------------------

/** Le date arrivano come mezzanotte italiana espressa in UTC: 1883-05-23T22:00
    e' il 24 maggio. Senza correzione si legge sempre il giorno prima. */
function dataIt(v: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}))?/.exec(v);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (m[4] && +m[4] >= 22) d.setUTCDate(d.getUTCDate() + 1);
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
}

const nf = (n: number, dec = 0) => n.toLocaleString('it-IT', { minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: 'always' });
const euro = (v: unknown) => (v == null || v === '' ? '—' : `${nf(Number(v))} €`);

function val(v: unknown): string {
  if (v == null || v === '') return '<span class="vuoto">—</span>';
  if (typeof v === 'boolean') return v ? 'sì' : 'no';
  if (typeof v === 'number') return Number.isInteger(v) ? nf(v) : nf(v, 2);
  const s = String(v);
  const d = dataIt(s);
  if (d) return d;
  return esc(D.VALORI[s.trim()] ?? s);
}

const umano = (k: string) =>
  D.ETICHETTE[k] ?? D.ETICHETTE[k.trim()] ?? (k.replace(/(?!^)([A-Z])/g, ' $1').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()));

/** Un blocco {codice, descrizione} si legge per la descrizione: il codice interno non dice niente. */
function piattoDict(v: Record<string, unknown>): string {
  if (v.description != null && v.description !== '') {
    const altri = Object.entries(v).filter(([k]) => k !== 'code' && k !== 'description');
    let s = val(v.description);
    if (altri.length) s += ' · ' + altri.map(([k, x]) => `${umano(k).toLowerCase()}: ${val(x)}`).join(' · ');
    return s;
  }
  const resto = Object.entries(v).filter(([, x]) => x != null && x !== '');
  if (!resto.length) return '<span class="vuoto">—</span>';
  if (resto.length === 1 && resto[0][0] === 'code') return val(resto[0][1]);
  return resto.map(([k, x]) => `${umano(k).toLowerCase()}: ${val(x)}`).join(' · ');
}

function righe(d: Record<string, any>): string {
  return Object.entries(d)
    .map(([k, v]) => {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        const piatto = Object.values(v).every((x) => x == null || typeof x !== 'object');
        return piatto
          ? `<tr><td>${umano(k)}</td><td class="num">${piattoDict(v)}</td></tr>`
          : `<tr class="sub"><td colspan="2">${umano(k)}</td></tr>${righe(v)}`;
      }
      if (Array.isArray(v)) return `<tr><td>${umano(k)}</td><td class="num">${v.length} voci</td></tr>`;
      // gli anni sono numeri ma non importi: 2024, non 2.024
      const cella = /year|anno/i.test(k) && typeof v === 'number' && v > 1900 && v < 2100 ? String(v) : val(v);
      return `<tr><td>${umano(k)}</td><td class="num">${cella}</td></tr>`;
    })
    .join('');
}

const tabVoci = (lista: any[]) =>
  lista
    .filter((x) => x && typeof x === 'object')
    .map((x) => {
      const desc = D.CODICI[x.code] || `<span class="vuoto">codice ${esc(x.code)} non in legenda</span>`;
      return `<tr><td>${desc}</td><td class="num">${val(x.value)}</td></tr>`;
    })
    .join('');

// --- tachimetro --------------------------------------------------------------
function tachimetro(idx: number | null): string {
  const n = 9, cx = 150, cy = 130, r0 = 78, r1 = 118;
  let out = '';
  for (let i = 0; i < n; i++) {
    const a0 = Math.PI + (i * Math.PI) / n, a1 = Math.PI + ((i + 1) * Math.PI) / n;
    const p = (r: number, a: number) => `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
    out += `<path d="M${p(r1, a0)} A${r1},${r1} 0 0 1 ${p(r1, a1)} L${p(r0, a1)} A${r0},${r0} 0 0 0 ${p(r0, a0)} Z" fill="${COLORI[i]}" opacity="${i === idx ? 1 : 0.3}"/>`;
    const am = (a0 + a1) / 2;
    out += `<text x="${(cx + 136 * Math.cos(am)).toFixed(1)}" y="${(cy + 136 * Math.sin(am) + 4).toFixed(1)}" text-anchor="middle" class="lbl${i === idx ? ' on' : ''}">${SCALA[i]}</text>`;
  }
  // Senza rating non si punta niente: una lancetta inventata è peggio di nessuna lancetta
  if (idx != null) {
    const am = Math.PI + ((idx + 0.5) * Math.PI) / n;
    out += `<line x1="${cx}" y1="${cy}" x2="${(cx + 96 * Math.cos(am)).toFixed(1)}" y2="${(cy + 96 * Math.sin(am)).toFixed(1)}" stroke="#0F1020" stroke-width="3.5" stroke-linecap="round"/>`;
    out += `<circle cx="${cx}" cy="${cy}" r="7" fill="#0F1020"/>`;
  }
  out += '<text x="30" y="152" class="cap">rischio minimo</text><text x="270" y="152" text-anchor="end" class="cap">rischio massimo</text>';
  return `<svg viewBox="0 0 300 160" class="gauge">${out}</svg>`;
}

// --- rendering della scheda --------------------------------------------------
// internationalClassification (NACE, SIC) resta fuori: sono classificazioni estere
// che arrivano solo in inglese e non aggiungono niente a chi legge la scheda.
const SEZ_ANAG = ['companyDetails', 'address', 'contacts', 'mail', 'companyStatus', 'companyDates', 'detailedLegalForm', 'atecoClassification', 'rae', 'sae', 'branches', 'corporateGroups', 'webAndSocial', 'innovativeSmeAndSu', 'soaCertification', 'artisanBusinessRegistry', 'marketable', 'development'];
const SEZ_ECON = ['ecofin', 'operatingResults', 'profitability', 'financialStatementKpi', 'indebtedness', 'leverageRatios', 'coverageRatios', 'liquidityRatios', 'structureRatios', 'financialStability', 'financialBurden', 'financialCycle', 'efficiency', 'employees', 'employeesStatistic', 'foreignTrade'];
const SEZ_COD = ['assetsAggregateValues', 'liabilitiesAggregateValues', 'incomeStatementAggregateValues', 'annualResult', 'productionValue', 'productionCosts', 'netWorth', 'debts', 'credits', 'inventory', 'tangibleFixedAssets', 'intangibleFixedAssets', 'financialFixedAssets', 'financialAssets', 'cashEquivalents', 'riskProvisions', 'revenuesFinancialCharges', 'creditsToShareholders', 'adjustments'];

function barraAzione(gruppo: string, azioni: [string, string, number][]): string {
  const b = azioni
    .map(([k, t, pz], i) => `<button type="button" class="val-btn${i ? ' val-btn--2' : ''}" data-gruppo="${gruppo}" data-azione="${k}" data-prezzo="${pz}" disabled>${t}</button>`)
    .join('');
  return `<div class="azione" data-gruppo="${gruppo}">${b}<span class="costo-sel" data-gruppo="${gruppo}">nessuno selezionato</span></div>`;
}

// --- esiti delle verifiche ----------------------------------------------------
// Arrivano gia' allegati alla scheda (s.verifiche, per codice fiscale) quando sono
// stati pagati in passato, oppure dal polling quando si lanciano adesso.

// Dal 14/10/2026 l'esito dice che cosa c'e' ("protesto: assegno da 10.000 €"),
// non solo "protesti": il dettaglio era gia' pagato e restava nel registro.
const esitoNeg = (d: any) => {
  if (!d) return '<span class="vuoto">nessuna risposta</span>';
  const e = leggiEventiNegativi(d);
  return `<span class="${conEventi(e) ? 'esito-si' : 'esito-no'}">${esc(sintesiEventi(e))}</span>`;
};

const giaVerificata = (avviata?: string) =>
  avviata ? `<span class="gia">già verificata il ${dataIt(avviata) ?? 'n.d.'}</span>` : '';

function esitoReport(d: any, avviata?: string): string {
  const r = leggiReport(d);
  if (!r) return '<span class="vuoto">report senza contenuto leggibile</span>';
  const eventi = r.protesti.length + r.constatazioni.length;
  return `<span class="${eventi ? 'esito-si' : 'esito-no'}">report: ${esc(sintesiReport(r))}</span>${giaVerificata(avviata)}`;
}

const IN_LAVORAZIONE = '<span class="attesa">in lavorazione, riapri la scheda tra qualche minuto</span>';

/** Contenuto della cella esito: negativita' sopra, report sotto. */
function cellaEsito(reg: any): string {
  const n = reg?.negativita, r = reg?.report;
  const neg = n?.pronto ? esitoNeg(n.dati) + giaVerificata(n.avviata)
    : n?.id ? '<span class="attesa">verifica in corso…</span>'
    : '<span class="vuoto">non richiesto</span>';
  const rep = r?.pronto ? esitoReport(r.dati, r.avviata)
    : r?.id ? '<span class="attesa">report in corso…</span>'
    : '';
  return `<div class="e-neg">${neg}</div><div class="e-rep">${rep}</div>`;
}

/** Blocco espandibile con il contenuto del report persona. */
function bloccoReport(d: any, avviata?: string): string {
  const r = leggiReport(d);
  if (!r) return '';
  const tab = (th: string[], righe: string[][]) => righe.length
    ? `<table><thead><tr>${th.map((t) => `<th>${t}</th>`).join('')}</tr></thead><tbody>${
        righe.map((c) => `<tr>${c.map((x) => `<td>${esc(x) || '<span class="vuoto">n.d.</span>'}</td>`).join('')}</tr>`).join('')
      }</tbody></table>`
    : '<p>Nessuna voce.</p>';
  const eventi = [...r.protesti.map((e) => ['Protesto', e]), ...r.constatazioni.map((e) => ['Constatazione', e])] as [string, { campi: [string, string][] }][];

  return `<details class="rep"><summary>Report persona${avviata ? ` del ${dataIt(avviata) ?? ''}` : ''}: ${esc(sintesiReport(r))}</summary>
    <h5>Cariche (${r.cariche.length})</h5>
    ${tab(['Società', 'Ruolo', 'Dal', 'Stato carica'], r.cariche.map((c) => [c.societa, c.ruolo, c.dal, c.stato]))}
    <h5>Partecipazioni (${r.partecipazioni.length})</h5>
    ${tab(['Società', 'Codice fiscale', 'Quota %', 'Valore quota'], r.partecipazioni.map((p) => [p.societa, p.cf, p.percentuale, p.quota]))}
    <h5>Immobili (${r.immobili.length})</h5>
    ${tab(['Comune', 'Tipologia', 'Diritto', 'Classamento'], r.immobili.map((i) => [`${i.comune}${i.provincia ? ` (${i.provincia})` : ''}`, i.tipologia, i.diritto, i.classamento]))}
    <h5>Eventi negativi (${eventi.length})</h5>
    ${eventi.length ? eventi.map(([t, e]) => `<p><strong>${t}</strong>: ${esc(e.campi.map(([k, v]) => `${k} ${v}`).join(' · '))}</p>`).join('') : '<p>Nessun protesto e nessuna constatazione.</p>'}
    <p>Stato carica: codice di Openapi riportato così com'è.</p>
  </details>`;
}

/**
 * Blocco espandibile col dettaglio eventi negativi della persona, se ce n'e'. Se la
 * visura protesti della persona e' gia' in archivio, i protesti si leggono da li'.
 */
function bloccoEventi(d: any, avviata?: string, visura?: { dati: any; data: string } | null): string {
  const e = d ? leggiEventiNegativi(d) : null;
  const v = visura?.dati ?? null;
  if (!conEventi(e) && !conEventi(v)) return '';
  if (v) {
    const altri = senzaProtesti(e);
    const conf = confrontoVerificaVisura(e, v);
    return `<details class="rep" open><summary>Visura protesti del ${esc(visura!.data)}: ${esc(sintesiEventi(v))}</summary>
      ${conEventi(v) ? htmlEventi(v) : ''}${conEventi(altri) ? htmlEventi(altri) : ''}
      ${conf ? `<p>${esc(conf)}</p>` : ''}
    </details>`;
  }
  return `<details class="rep" open><summary>Eventi negativi${avviata ? ` del ${dataIt(avviata) ?? ''}` : ''}: ${esc(sintesiEventi(e))}</summary>
    ${htmlEventi(e)}
    <p>La visura protesti ufficiale di questa persona si ordina dalla scheda Protesti dei documenti ufficiali.</p>
  </details>`;
}

/** Riga sotto la persona con i dettagli gia' pagati: eventi negativi e report. Vuota se non c'e' niente. */
function rigaDettagli(cf: string, colonne: number, reg: any): string {
  const visura = schedaCorrente?.protestiUfficiali?.persone?.[cf] ?? null;
  const neg = reg?.negativita?.pronto || visura
    ? bloccoEventi(reg?.negativita?.pronto ? reg.negativita.dati : null, reg?.negativita?.avviata, visura)
    : '';
  const rep = reg?.report?.pronto ? bloccoReport(reg.report.dati, reg.report.avviata) : '';
  return neg || rep ? `<tr class="rep-riga" data-cf="${esc(cf)}"><td colspan="${colonne}">${neg}${rep}</td></tr>` : '';
}

const rigaSel = (gruppo: string, cf: string, nome: string, celle: string, reg: any, colonne: number, extra = '') =>
  `<tr><td class="ck"><input type="checkbox" class="pick" data-gruppo="${gruppo}" data-cf="${esc(cf)}" data-nome="${esc(nome)}" data-colonne="${colonne}"${extra}></td>${celle}<td class="num esito" data-cf="${esc(cf)}">${cellaEsito(reg)}</td></tr>`
  + rigaDettagli(cf, colonne, reg);

export function rendiScheda(s: any): string {
  const F = s.full ?? {}, A = s.advanced ?? {}, CS = s.score ?? {};
  const det = F.companyDetails ?? {};
  const nome = det.companyName ?? A.companyName ?? '';
  const piva = det.vatCode ?? A.vatCode ?? s.piva;
  const eco = F.ecofin ?? {}, op = F.operatingResults ?? {}, prof = F.profitability ?? {};
  const ann: Record<string, number> = {};
  (F.annualResult ?? []).forEach((x: any) => { if (x?.code) ann[x.code] = x.value; });
  // La struttura cambia da azienda ad azienda: indirizzo a volte annidato sotto
  // registeredOffice, a volte piatto. La forma giuridica in italiano sta in advanced.
  const sede = F.address?.registeredOffice ?? A.address?.registeredOffice ?? F.address ?? {};
  const forma = A.detailedLegalForm?.description ?? F.legalForm?.detailedLegalForm?.description
    ?? F.legalForm?.legalForm?.description ?? F.legalForm?.description ?? '';
  const ate = A.atecoClassification?.ateco ?? {};
  // rating assente (azienda troppo giovane per essere classificata): niente classe finta
  const idx = SCALA.indexOf(CS.rating ?? '') >= 0 ? SCALA.indexOf(CS.rating) : null;
  const V: Record<string, any> = s.verifiche ?? {};
  const reg = (cf: unknown) => V[String(cf ?? '').trim().toUpperCase()];

  let h = `<div class="scheda"><div class="scheda-head">
    <div class="scheda-rs">${esc(nome)}</div>
    <div class="scheda-meta">P.IVA ${esc(piva)} · ${forma ? val(forma) : ''} · attiva dal ${dataIt(String(A.startDate ?? '')) ?? '—'}<br>
    ${esc(sede.streetName ?? '')} — ${esc(sede.town ?? '')} · ATECO ${esc(ate.code ?? '')} ${esc(ate.description ?? '')}</div>
  </div><div class="scheda-body">`;

  // rating
  h += `<div class="blocco"><div class="blocco-tit">Posizionamento del rating</div><div class="testa">
    <div>${tachimetro(idx)}</div>
    <div><div class="rat">${esc(CS.rating ?? 'n.d.')}<small>${esc(CS.risk_score_description ?? '')}${idx != null ? ` · classe ${idx + 1} di 9` : ' · nessuna classe assegnata'}</small></div>
      <div class="riga">
        <div><span>Punteggio di rischio</span><strong>${esc(CS.risk_score ?? '—')}</strong></div>
        <div><span>Linea di credito consigliata</span><strong>${euro(CS.operational_credit_limit)}</strong></div>
      </div>
    </div></div></div>`;

  // riassunto
  h += `<div class="blocco"><div class="blocco-tit">Riassunto</div><div class="tre">
    <div class="voce"><div class="etichetta">Ricavi delle vendite</div><div class="cifra">${euro(eco.turnover)}</div><div class="delta">${val(eco.turnoverTrend)}% sull'anno prima · esercizio ${eco.turnoverYear ?? '—'}</div></div>
    <div class="voce"><div class="etichetta">Utile d'esercizio</div><div class="cifra">${euro(ann.IIC179)}</div><div class="delta">voce 21 del conto economico</div></div>
    <div class="voce"><div class="etichetta">Patrimonio netto</div><div class="cifra">${euro(eco.netWorth)}</div><div class="delta">capitale sociale ${euro(eco.shareCapital)}</div></div>
  </div><div class="riga">
    <div><span>EBITDA</span><strong>${euro(op.ebitda)}</strong></div>
    <div><span>EBIT</span><strong>${euro(op.ebit)}</strong></div>
    <div><span>Flusso di cassa</span><strong>${euro(op.cashFlow)}</strong></div>
    <div><span>ROE</span><strong>${val(prof.roe)}</strong></div>
    <div><span>ROI</span><strong>${val(prof.roi)}</strong></div>
    <div><span>Dipendenti</span><strong>${val(F.employees?.employee)}</strong></div>
  </div></div>`;

  // eventi negativi azienda: dal registro se gia' concluso, altrimenti si riempiono da soli
  const negAz = reg(s.piva)?.negativita;
  // la visura protesti, se in archivio, arriva col pannello dei documenti e va sopra: fa fede lei
  h += `<div class="blocco"><div class="blocco-tit">Eventi negativi sull'azienda</div>
    <div id="visuraAzienda"></div>
    <div id="negAzienda" data-id="${esc(negAz?.pronto ? '' : (negAz?.id ?? s.negativitaId ?? ''))}">${
      negAz?.pronto ? esitoNeg(negAz.dati) + giaVerificata(negAz.avviata) : '<span class="attesa">verifica in corso…</span>'}</div>
    <button type="button" class="doc-link neg-apri" data-apri-protesti>Dettaglio e visura protesti</button></div>`;

  // visura e bilanci depositati: il pannello si riempie da solo, vedi documenti-ufficiali.ts
  h += `<div class="blocco doc-uff"><div class="blocco-tit">Documenti ufficiali</div><div id="docUfficiali"></div></div>`;

  // soci
  const soci = s.soci ?? [];
  h += `<div class="blocco"><div class="blocco-tit">Soci (${soci.length})</div>`;
  if (!soci.length) {
    h += `<p class="val-msg" style="margin:0">Nessun socio in elenco: è il caso delle cooperative, che non hanno una compagine con quote.</p>`;
  } else {
    h += '<table class="sel"><thead><tr><th class="ck"></th><th>Socio</th><th class="num">Quota</th><th class="num">Eventi negativi</th></tr></thead><tbody>';
    soci.forEach((x: any) => {
      const n = x.companyName || `${x.name ?? ''} ${x.surname ?? ''}`.trim();
      h += rigaSel('soci', x.taxCode ?? '', n, `<td><strong>${esc(n)}</strong><br><span class="cf">${esc(x.taxCode ?? '')}</span></td><td class="num">${val(x.percentShare)}%</td>`, reg(x.taxCode), 4);
    });
    h += '</tbody></table>' + barraAzione('soci', [['neg', 'Verifica eventi negativi', PREZZI.neg]]);
  }
  h += '</div>';

  // amministratori
  const mg = F.managers ?? [];
  if (mg.length) {
    h += `<div class="blocco"><div class="blocco-tit">Amministratori (${mg.length})</div>
      <table class="sel"><thead><tr><th class="ck"></th><th>Nome</th><th>Ruolo</th><th class="num">Età</th><th class="num">Nato a</th><th class="num">Eventi negativi</th></tr></thead><tbody>`;
    mg.forEach((m: any) => {
      const n = `${m.name ?? ''} ${m.surname ?? ''}`.trim().replace(/\b\w+/g, (w: string) => w[0] + w.slice(1).toLowerCase());
      const ruoli = (m.roles ?? []).map((r: any) => D.RUOLI[r?.role?.code] ?? val(r?.role?.description)).filter(Boolean);
      let ruolo = ruoli.join(' · ') || '—';
      if (m.isLegalRepresentative) ruolo += ' <strong>(legale rappresentante)</strong>';
      // nome e cognome viaggiano separati: spezzare "Nome Cognome" sbaglia sui nomi composti
      h += rigaSel('amm', m.taxCode ?? '', n,
        `<td><strong>${esc(n)}</strong><br><span class="cf">${esc(m.taxCode ?? '')}</span></td><td>${ruolo}</td><td class="num">${val(m.age)}</td><td class="num">${val(m.birthTown)}</td>`,
        reg(m.taxCode), 6, ` data-n="${esc(m.name ?? '')}" data-c="${esc(m.surname ?? '')}"`);
    });
    h += '</tbody></table>' + barraAzione('amm', [['neg', 'Verifica eventi negativi', PREZZI.neg], ['rep', 'Report completo: cariche, partecipazioni, immobili', PREZZI.rep]]);
    h += '</div>';
  }

  // anagrafica e indici
  // Dove IT-advanced ha la versione italiana dello stesso blocco, si usa quella:
  // le descrizioni di IT-full sono tradotte a macchina e a volte sbagliate
  // (per una S.r.l. la forma giuridica generica usciva "Joint stock business").
  const ITALIANO = ['atecoClassification', 'detailedLegalForm'];
  const fonte = (k: string) => (ITALIANO.includes(k) && A[k] ? A[k] : F[k]);
  const blocco = (tit: string, chiavi: string[]) => {
    let c = '<table><tbody>';
    chiavi.forEach((k) => { const v = fonte(k); if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length) c += `<tr class="sub"><td colspan="2">${umano(k)}</td></tr>${righe(v)}`; });
    if (tit.startsWith('Anagrafica')) {
      if (forma) c += `<tr><td>Forma giuridica</td><td class="num">${val(forma)}</td></tr>`;
      c += `<tr><td>PEC</td><td class="num">${val(F.pec)}</td></tr>`;
    }
    return `<div class="blocco"><div class="blocco-tit">${tit}</div>${c}</tbody></table></div>`;
  };
  h += blocco('Anagrafica e inquadramento', SEZ_ANAG);
  h += blocco('Indici e aggregati economici', SEZ_ECON);

  // bilancio
  let bil = '';
  SEZ_COD.forEach((k) => {
    const v = F[k];
    if (Array.isArray(v) && v.length) bil += `<h4>${umano(k)} <span class="n">${v.length} voci</span></h4><table class="voci"><tbody>${tabVoci(v)}</tbody></table>`;
  });
  if (bil) h += `<div class="blocco"><div class="blocco-tit">Bilancio riclassificato</div>${bil}</div>`;

  return h + '</div></div>';
}

// --- interazione -------------------------------------------------------------
async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { ...init, headers: { Authorization: `Bearer ${chiave}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
  if (r.status === 401) { localStorage.removeItem(CHIAVE_LS); location.reload(); throw new Error('non autorizzato'); }
  return r.json();
}

function aggiornaCosto(gruppo: string) {
  const n = document.querySelectorAll(`.pick[data-gruppo="${gruppo}"]:checked`).length;
  const lab = document.querySelector(`.costo-sel[data-gruppo="${gruppo}"]`) as HTMLElement;
  const btns = document.querySelectorAll<HTMLButtonElement>(`.val-btn[data-gruppo="${gruppo}"]`);
  btns.forEach((b) => (b.disabled = n === 0));
  if (!lab) return;
  lab.textContent = n === 0 ? 'nessuno selezionato'
    : `${n} ${n === 1 ? 'selezionato' : 'selezionati'} · ${[...btns].map((b) => `${nf(n * Number(b.dataset.prezzo), 2)} €`).join(' oppure ')} + IVA`;
}

/**
 * Ripassa a chiedere l'esito ogni 6 secondi. Niente limite di tentativi: dopo
 * quattro minuti si smette e si avvisa. L'id e' gia' salvato nel registro lato
 * server, quindi riaprendo la scheda l'esito arriva da li' senza rispendere.
 */
const ATTESA_MS = 4 * 60 * 1000;
function attendi(id: string, tipo: 'negativita' | 'report', cf: string, mostra: (d: any, avviata?: string) => void, scaduto: () => void) {
  const fine = Date.now() + ATTESA_MS;
  const giro = async () => {
    const r = await api(`/api/verifica?tipo=${tipo}&id=${encodeURIComponent(id)}&cf=${encodeURIComponent(cf)}`).catch(() => null);
    if (r?.pronto) return mostra(r.dati, r.avviata);
    if (Date.now() < fine) setTimeout(giro, 6000);
    else scaduto();
  };
  setTimeout(giro, 6000);
}

/** Tutte le celle della stessa persona: lo stesso CF puo' stare tra i soci e tra gli amministratori. */
const celle = (cf: string, parte: 'e-neg' | 'e-rep') =>
  [...document.querySelectorAll<HTMLElement>(`td.esito[data-cf="${cf}"] .${parte}`)];
const scrivi = (cf: string, parte: 'e-neg' | 'e-rep', html: string) => celle(cf, parte).forEach((c) => (c.innerHTML = html));

/** Tiene allineata la scheda in memoria, che e' quella che finisce nel PDF. */
function registra(cf: string, tipo: 'negativita' | 'report', voce: any) {
  if (!schedaCorrente) return;
  schedaCorrente.verifiche ??= {};
  schedaCorrente.verifiche[cf] = { ...(schedaCorrente.verifiche[cf] ?? { cf }), [tipo]: voce };
}

/** Ridisegna la riga dei dettagli sotto ogni riga della persona, dalla scheda in memoria. */
function aggiornaDettagli(cf: string) {
  const reg = schedaCorrente?.verifiche?.[cf];
  document.querySelectorAll<HTMLInputElement>(`.pick[data-cf="${cf}"]`).forEach((c) => {
    const tr = c.closest('tr')!;
    if (tr.nextElementSibling?.matches(`tr.rep-riga[data-cf="${cf}"]`)) tr.nextElementSibling.remove();
    const html = rigaDettagli(cf, Number(c.dataset.colonne ?? 4), reg);
    if (html) tr.insertAdjacentHTML('afterend', html);
  });
}

/**
 * Le visure protesti gia' in archivio arrivano col pannello dei documenti ufficiali:
 * la scheda le tiene in memoria (servono al PDF), aggiorna la riga dell'azienda e
 * il dettaglio sotto soci e amministratori.
 */
function visureDaArchivio(piva: string, arch: any) {
  if (!schedaCorrente || schedaCorrente.piva !== piva) return;
  const pr = arch?.protesti ?? {};
  const giorno = (o: any) => (o?.concluso || o?.avviato ? new Date(o.concluso ?? o.avviato).toLocaleDateString('it-IT') : '');
  const persone: Record<string, any> = {};
  for (const p of pr.persone ?? []) if (p.visura) persone[p.cf] = { dati: p.visura, data: giorno(p.ordine) };
  const prima = JSON.stringify(schedaCorrente.protestiUfficiali?.persone ?? {});
  schedaCorrente.protestiUfficiali = {
    azienda: pr.visura ? { dati: pr.visura, data: giorno(pr.ordine) } : null,
    persone,
  };

  const box = document.getElementById('visuraAzienda');
  if (box) {
    const v = pr.visura;
    const neg = schedaCorrente.verifiche?.[piva]?.negativita;
    const conf = v ? confrontoVerificaVisura(neg?.pronto ? leggiEventiNegativi(neg.dati) : null, v) : null;
    box.innerHTML = v
      ? `<div><span class="${conEventi(v) ? 'esito-si' : 'esito-no'}">${esc(sintesiEventi(v))}</span><span class="gia">dalla visura protesti del ${esc(giorno(pr.ordine))}</span></div>`
        + (conf ? `<p class="prot-avviso">${esc(conf)}</p>` : '')
      : '';
    document.getElementById('negAzienda')?.classList.toggle('secondaria', !!v);
  }
  // il dettaglio sotto le persone cambia solo se sono cambiate le loro visure
  if (JSON.stringify(persone) !== prima) {
    for (const cf of new Set([...Object.keys(persone), ...Object.keys(JSON.parse(prima))])) aggiornaDettagli(cf);
  }
}

/** La scheda Protesti dei documenti ufficiali rilegge il registro. */
const avvisaDocumenti = () => document.getElementById('docUfficiali')?.dispatchEvent(new CustomEvent('verifiche-aggiornate'));

function mostraNeg(cf: string, id: string, d: any, avviata?: string) {
  scrivi(cf, 'e-neg', esitoNeg(d) + giaVerificata(avviata));
  registra(cf, 'negativita', { id, avviata, pronto: true, dati: d });
  aggiornaDettagli(cf);
  avvisaDocumenti();
}

function mostraReport(cf: string, id: string, d: any, avviata?: string) {
  scrivi(cf, 'e-rep', esitoReport(d, avviata));
  registra(cf, 'report', { id, avviata, pronto: true, dati: d });
  aggiornaDettagli(cf);
}

/** Segue una verifica fino all'esito, o fino al messaggio di attesa. */
function segui(tipo: 'negativita' | 'report', cf: string, id: string) {
  const parte = tipo === 'report' ? 'e-rep' : 'e-neg';
  scrivi(cf, parte, `<span class="attesa">${tipo === 'report' ? 'report in corso…' : 'verifica in corso…'}</span>`);
  attendi(id, tipo, cf,
    (d, avviata) => (tipo === 'report' ? mostraReport : mostraNeg)(cf, id, d, avviata),
    () => scrivi(cf, parte, IN_LAVORAZIONE));
}

function collega() {
  document.querySelectorAll<HTMLInputElement>('.pick').forEach((c) =>
    c.addEventListener('change', () => aggiornaCosto(c.dataset.gruppo!)));

  // dal blocco eventi negativi alla scheda Protesti dei documenti ufficiali
  document.querySelectorAll<HTMLButtonElement>('[data-apri-protesti]').forEach((b) =>
    b.addEventListener('click', () => {
      const du = document.getElementById('docUfficiali');
      if (!du) return;
      du.dispatchEvent(new CustomEvent('apri-scheda', { detail: 'protesti' }));
      du.closest('.blocco')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));

  document.querySelectorAll<HTMLButtonElement>('.val-btn[data-gruppo]').forEach((b) =>
    b.addEventListener('click', async () => {
      const g = b.dataset.gruppo!, azione = b.dataset.azione!;
      const tipo = azione === 'neg' ? 'negativita' : 'report';
      const parte = tipo === 'report' ? 'e-rep' : 'e-neg';
      const scelti = [...document.querySelectorAll<HTMLInputElement>(`.pick[data-gruppo="${g}"]:checked`)];
      document.querySelectorAll<HTMLButtonElement>(`.val-btn[data-gruppo="${g}"]`).forEach((x) => (x.disabled = true));
      try {
        for (const c of scelti) {
          const cf = c.dataset.cf!;
          scrivi(cf, parte, '<span class="attesa">richiesta inviata…</span>');
          const corpo = tipo === 'negativita'
            ? { tipo, cf }
            : { tipo, cf, nome: c.dataset.n || (c.dataset.nome ?? '').split(' ')[0], cognome: c.dataset.c || (c.dataset.nome ?? '').split(' ').slice(1).join(' ') };
          const r = await api('/api/verifica', { method: 'POST', body: JSON.stringify(corpo) }).catch((e) => ({ errore: String(e) }));
          if (!r?.id) { scrivi(cf, parte, `<span class="vuoto">${esc(r?.errore ?? 'non avviata')}</span>`); continue; }
          // gia' pagata e conclusa: il server risponde dal registro, nessuna spesa
          if (r.pronto) (tipo === 'report' ? mostraReport : mostraNeg)(cf, r.id, r.dati, r.avviata);
          else {
            registra(cf, tipo, { id: r.id, avviata: r.avviata, pronto: false });
            segui(tipo, cf, r.id);
          }
        }
      } finally {
        // i bottoni tornano attivi a fine giro, secondo la selezione rimasta
        aggiornaCosto(g);
      }
    }));

  // verifiche lanciate prima di un ricaricamento e non ancora concluse: si riprende l'attesa
  const V = schedaCorrente?.verifiche ?? {};
  for (const [cf, reg] of Object.entries<any>(V)) {
    if (cf === schedaCorrente?.piva) continue;          // la negativita' dell'azienda la segue avvia()
    if (!document.querySelector(`td.esito[data-cf="${cf}"]`)) continue;
    for (const tipo of ['negativita', 'report'] as const) {
      if (reg?.[tipo]?.id && !reg[tipo].pronto) segui(tipo, cf, reg[tipo].id);
    }
  }
}

/**
 * Scheda compatta per una controparte estera.
 *
 * All'estero c'e' molto meno che sull'Italia: nessun punteggio di rischio (la
 * Risk API di Openapi e' tutta italiana), nessun bilancio riclassificato, nessun
 * elenco soci. Quello che c'e' e' l'anagrafica e il bilancio sintetico, e in piu'
 * il patrimonio netto vero, che sull'italiano costa una scheda intera.
 */
function rendiSchedaEstera(d: any): string {
  const e = d.esito ?? {};
  const voce = (etichetta: string, cifra: string, nota = '') =>
    `<div class="voce"><div class="etichetta">${esc(etichetta)}</div><div class="cifra">${cifra}</div>${nota ? `<div class="delta">${esc(nota)}</div>` : ''}</div>`;
  const soldi = (v: number | null) => (v == null ? '<span class="vuoto">&mdash;</span>' : `${nf(v, 0)} &euro;`);

  const storico = (d.storico ?? []).length
    ? `<table><thead><tr><th>Esercizio</th><th class="num">Fatturato</th><th class="num">Utile</th></tr></thead><tbody>${
        (d.storico as any[]).map((r) => `<tr><td>${esc(String(r.anno))}</td><td class="num">${soldi(r.fatturato)}</td><td class="num">${soldi(r.utile)}</td></tr>`).join('')
      }</tbody></table>`
    : '<p class="vuoto">Nessuno storico pubblicato.</p>';

  const avvisi = (e.avvisi ?? []).length
    ? `<ul>${(e.avvisi as string[]).map((a) => `<li>${esc(a)}</li>`).join('')}</ul>`
    : '';

  const etichettaCanale: Record<string, string> = {
    econocom: 'Econocom',
    grenke: 'Grenke &mdash; noleggio operativo',
    sace: 'Percorso assicurato SACE',
    incerto: "Serve l'importo dell'operazione",
  };

  return `<div class="scheda">
    <div class="scheda-head">
      <div class="scheda-rs">${esc(d.ragioneSociale ?? '—')}</div>
      <div class="scheda-meta">${esc(nomePaese(d.paese))} · ${esc(d.identificativoMostrato ?? '')}${d.formaGiuridica ? ' · ' + esc(d.formaGiuridica) : ''}${d.dataCostituzione ? ' · attiva dal ' + (dataIt(String(d.dataCostituzione)) ?? '—') : ''}<br>
        ${esc(d.indirizzo ?? '')}${d.stato ? ' · ' + esc(d.stato) : ''}</div>
    </div>
    <div class="scheda-body">
      <div class="blocco">
        <div class="blocco-tit">Bilancio${d.annoBilancio ? ' ' + esc(String(d.annoBilancio)) : ''}</div>
        <div class="tre">
          ${voce('Fatturato', soldi(d.fatturato))}
          ${voce('Patrimonio netto', soldi(d.patrimonioNetto), d.patrimonioNetto == null ? 'non pubblicato da questo registro' : '')}
          ${voce("Utile d'esercizio", soldi(d.utile))}
        </div>
        <div class="tre" style="margin-top:16px;">
          ${voce('Totale attivo', soldi(d.totaleAttivo))}
          ${voce('Dipendenti', d.dipendenti == null ? '<span class="vuoto">&mdash;</span>' : String(d.dipendenti))}
          ${voce('Solvibilita', d.solvibile == null ? '<span class="vuoto">non rilevata</span>' : (d.solvibile ? 'positiva' : 'negativa'), d.solvibile == null ? 'indicatore non pubblicato' : 'indicatore del registro locale')}
        </div>
      </div>
      <div class="blocco">
        <div class="blocco-tit">Storico</div>
        ${storico}
      </div>
      <div class="blocco">
        <div class="blocco-tit">Canale suggerito</div>
        <h4>${esc(etichettaCanale[e.canale] ?? '—')}</h4>
        <p>${esc(e.motivo ?? '')}</p>
        ${avvisi}
        <p class="vuoto">All'estero Openapi non offre punteggio di rischio: la Risk API e' solo italiana.</p>
      </div>
    </div>
  </div>`;
}

// --- ricerche ultimi 30 giorni -----------------------------------------------
// L'elenco arriva da /api/ricerche-recenti, che legge solo la cache: un clic su
// una riga riapre la scheda senza spendere.

/** Data di un istante (non di una mezzanotte, come dataIt): fuso italiano esplicito. */
const giornoIt = (iso: string) =>
  new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Rome' });

function rendiRecenti(r: any): string {
  if (!r.totale) return '<p class="val-msg" style="margin:0">Nessuna ricerca negli ultimi 30 giorni.</p>';
  const righe = (r.voci as any[]).map((v) => {
    // per difetto: pagata ieri fa 29 giorni, e la data sotto lo conferma
    const giorni = Math.max(0, Math.floor((Date.parse(v.scade) - Date.now()) / 864e5));
    const i = SCALA.indexOf(v.rating ?? '');
    const rating = i >= 0
      ? `<span class="rec-rat"><i style="background:${COLORI[i]}"></i>${esc(v.rating)}</span>`
      : `<span class="vuoto" title="${v.tipo === 'estero' ? "all'estero non c'è punteggio di rischio" : 'nessuna classe assegnata'}">—</span>`;
    const sede = v.tipo === 'estero' ? esc(nomePaese(v.paese)) : (v.sede ? esc(v.sede) : '<span class="vuoto">—</span>');
    const nome = v.ragioneSociale ? esc(v.ragioneSociale) : '<span class="vuoto">scheda senza nome</span>';
    return `<tr data-paese="${esc(v.paese)}" data-id="${esc(v.id)}">
      <td><button type="button" class="rec-apri">${nome}</button><br><span class="cf">${v.tipo === 'estero' ? `${esc(v.paese)} · ` : ''}${esc(v.id)}</span></td>
      <td class="rec-opz">${sede}</td>
      <td>${rating}</td>
      <td class="num rec-opz">${giornoIt(v.analizzata)}</td>
      <td class="num">${giorni === 0 ? 'ultimo giorno' : giorni === 1 ? '1 giorno' : `${giorni} giorni`}<span class="rec-giorni">fino al ${giornoIt(v.scade)}</span></td>
    </tr>`;
  }).join('');
  return `<table class="rec"><thead><tr><th>Azienda</th><th class="rec-opz">Sede</th><th>Rating</th><th class="num rec-opz">Analizzata il</th><th class="num">In cache</th></tr></thead><tbody>${righe}</tbody></table>`;
}

function rendiPaginatore(r: any): string {
  if (!r.totale) return '';
  if (r.pagine <= 1) return `<span>${r.totale} ${r.totale === 1 ? 'ricerca' : 'ricerche'}</span>`;
  const da = (r.pagina - 1) * r.perPagina + 1, a = da + r.voci.length - 1;
  const freccia = (p: number, segno: string, etichetta: string, spenta: boolean) =>
    `<button type="button" class="val-rec__fr" data-pagina="${p}" aria-label="${etichetta}"${spenta ? ' disabled' : ''}>${segno}</button>`;
  return freccia(r.pagina - 1, '‹', 'Pagina precedente', r.pagina <= 1)
    + `<span>${da === a ? da : `${da}–${a}`} di ${r.totale}</span>`
    + freccia(r.pagina + 1, '›', 'Pagina successiva', r.pagina >= r.pagine);
}

// --- spesa Openapi del mese --------------------------------------------------
// Il tool interno non ha tetto, ma la sua spesa si vede: una riga sopra le
// ricerche recenti con quanto ha speso lui e quanto vale il conto del mese.

/** Con i centesimi: la spesa Openapi si muove a 0,11 e 0,45 */
const euroCent = (n: number) => `${nf(n, 2)} €`;

function rigaSpesa(s: RiepilogoSpesa): string {
  const resto = [
    `tool Marotta ${euroCent(s.marotta)}`,
    `portali ${euroCent(s.portali)}`,
    `fiera ${euroCent(s.fiera)}`,
    `simulatore ${euroCent(s.simulatore ?? 0)}`,
    `non attribuiti ${euroCent(s.nonAttribuiti)}`,
  ].join(' · ');
  return `<span>Openapi, ${esc(s.meseLeggibile)}: tool interno <strong>${euroCent(s.valutazione.totale)}</strong> · totale del conto <strong>${euroCent(s.conto)}</strong></span>`
    + `<span class="val-spesa-mese__resto" title="Non attribuiti: voci registrate prima del 20/10/2026, quando tool interno e tool Marotta avevano un registro unico, e differenza fra wallet e registro">Il resto: ${resto}</span>`;
}

async function caricaSpesa() {
  const box = $('spesaMese');
  if (!box) return;
  const r = await api('/api/spesa-openapi').catch(() => null);
  box.innerHTML = r && !r.errore ? rigaSpesa(r) : '';
}

let paginaRecenti = 1;
let giroRecenti = 0;   // due clic veloci sulle frecce: vince l'ultima risposta chiesta, non l'ultima arrivata

async function caricaRecenti(pagina: number) {
  const giro = ++giroRecenti;
  const lista = $('recentiLista');
  if (!lista.innerHTML) lista.innerHTML = '<p class="val-msg" style="margin:0">Carico le ricerche…</p>';
  const r = await api(`/api/ricerche-recenti?pagina=${pagina}`).catch((e) => ({ errore: String(e) }));
  if (giro !== giroRecenti) return;
  if (r?.errore) {
    lista.innerHTML = `<p class="val-msg" style="margin:0">Non riesco a leggere le ricerche recenti: ${esc(r.errore)}</p>`;
    $('recentiPag').innerHTML = '';
    return;
  }
  paginaRecenti = r.pagina;
  lista.innerHTML = rendiRecenti(r);
  $('recentiPag').innerHTML = rendiPaginatore(r);
}

export function montaValutazione() {
  D = (window as any).__VAL__;
  const titoloPagina = document.title;
  const recenti = $('recenti'), tornaRecenti = $('tornaRecenti');
  // l'elenco si ricarica a ogni ritorno: una scheda appena pagata deve comparire in cima
  const mostraRecenti = () => {
    recenti.style.display = 'block';
    tornaRecenti.style.display = 'none';
    caricaRecenti(paginaRecenti);
    caricaSpesa();
  };
  const nascondiRecenti = () => {
    recenti.style.display = 'none';
    tornaRecenti.style.display = 'inline-flex';
  };
  chiave = localStorage.getItem(CHIAVE_LS) ?? '';
  const gate = $('gate'), app = $('app');
  if (chiave) { gate.style.display = 'none'; app.style.display = 'block'; }

  const entra = () => {
    const v = ($('chiave') as HTMLInputElement).value.trim();
    if (!v) return;
    chiave = v;
    localStorage.setItem(CHIAVE_LS, v);
    gate.style.display = 'none';
    app.style.display = 'block';
    mostraRecenti();
  };
  $('entra').addEventListener('click', entra);
  $('chiave').addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') entra(); });
  $('esci').addEventListener('click', () => { localStorage.removeItem(CHIAVE_LS); location.reload(); });
  // Il file scende direttamente: niente dialogo di stampa. Il PDF e' costruito
  // con jsPDF, quindi il testo resta selezionabile e il file pesa poco.
  $('pdf').addEventListener('click', async () => {
    if (!schedaCorrente) return;
    const b = $('pdf') as HTMLButtonElement;
    const testo = b.textContent;
    b.disabled = true; b.textContent = 'Preparo il PDF…';
    try {
      const { creaPdfScheda } = await import('./valutazione-pdf');
      const doc = await creaPdfScheda(schedaCorrente, D);
      const rs = (schedaCorrente.full?.companyDetails?.companyName ?? 'scheda').replace(/[^\w\s-]/g, '').trim();
      doc.save(`Scheda ${rs} - ${schedaCorrente.piva}.pdf`);
    } catch (e) {
      $('msg').textContent = 'Non sono riuscito a creare il PDF: ' + (e as Error).message;
    } finally {
      b.disabled = false; b.textContent = testo;
    }
  });

  const piva = $('piva') as HTMLInputElement, cerca = $('cerca') as HTMLButtonElement;
  const paese = $('paese') as HTMLSelectElement;

  // Menu dei paesi: Italia in cima, poi area Schengen/SEPA e resto del mondo
  const opzioni = (l: [string, string][]) => l.map(([c, n]) => `<option value="${c}">${c} — ${n}</option>`).join('');
  paese.innerHTML =
    '<option value="IT">IT — Italia</option>' +
    `<optgroup label="Area Schengen / SEPA">${opzioni(PAESI_SEPA)}</optgroup>` +
    `<optgroup label="Resto del mondo">${opzioni(PAESI_MONDO)}</optgroup>`;
  paese.value = 'IT';

  const estero = () => paese.value !== 'IT';
  const valido = () => (estero() ? piva.value.trim().length >= 4 : piva.value.length === 11);
  // Una ricerca alla volta: vedi avvia()
  let inCorso = false;

  paese.addEventListener('change', () => {
    piva.value = '';
    cerca.disabled = true;
    piva.maxLength = estero() ? 32 : 11;
    piva.placeholder = estero()
      ? (FORMATO_ID[paese.value] ?? 'Partita IVA o codice del registro imprese')
      : 'Partita IVA (11 cifre)';
    $('msg').textContent = '';
  });

  piva.addEventListener('input', () => {
    if (estero()) {
      // Fuori Italia non c'e' un codice di controllo comune: ogni registro ha il suo formato
      piva.value = piva.value.replace(/[^A-Za-z0-9./\- ]/g, '').slice(0, 32);
    } else {
      piva.value = piva.value.replace(/\D/g, '').slice(0, 11);
    }
    cerca.disabled = inCorso || !valido();
  });

  const avviaEstero = async () => {
    $('msg').textContent = 'Interrogazione in corso…';
    $('scheda').innerHTML = '';
    const id = piva.value.trim();
    // Sui Paesi Bassi il codice si controlla prima: una ricerca malformata si paga
    const norma = normalizzaIdEstero(paese.value, id);
    if (!norma.ok) { $('msg').textContent = norma.errore; return; }
    const r = await api(`/api/azienda-estera?paese=${encodeURIComponent(paese.value)}&id=${encodeURIComponent(norma.id)}`)
      .catch((e) => ({ error: String(e) }));
    if (r?.found === false || r?.error) {
      $('msg').textContent = r?.error ? `Errore: ${r.error}` : 'Controparte non trovata.';
      return;
    }
    $('msg').textContent = r.fonte === 'cache' ? 'Dati da cache, nessun costo.' : '';
    schedaCorrente = null;                        // il PDF sa impaginare la sola scheda italiana
    const btnPdfEstero = $('pdf');
    if (btnPdfEstero) btnPdfEstero.style.display = 'none';
    $('scheda').innerHTML = rendiSchedaEstera({ ...r, identificativoMostrato: id });
    nascondiRecenti();
    document.title = `Scheda ${(r.ragioneSociale ?? 'estera').trim()} - ${id}`;
  };

  // Il pulsante restava attivo per tutti gli otto secondi della scheda: un doppio
  // click, o Invio seguito da click, lanciava due schede complete e le pagava
  // entrambe (16/09, 04154590162). Finche' una ricerca e' in volo non ne parte un'altra.
  const avvia = async () => {
    if (inCorso) return;
    inCorso = true;
    cerca.disabled = true;
    try {
      await (estero() ? avviaEstero() : avviaItalia());
    } finally {
      inCorso = false;
      cerca.disabled = !valido();
    }
  };

  const avviaItalia = async () => {
    $('msg').textContent = 'Interrogazione in corso…';
    $('scheda').innerHTML = '';
    const r = await api(`/api/azienda?piva=${piva.value}`).catch((e) => ({ errore: String(e) }));
    if (r?.errore) { $('msg').textContent = `Errore: ${r.errore}`; return; }
    if (r?.trovata === false) { $('msg').textContent = 'Partita IVA non trovata.'; return; }
    $('msg').textContent = r.daCache ? 'Dati da cache, nessun costo.' : '';
    schedaCorrente = r;
    $('scheda').innerHTML = rendiScheda(r);
    nascondiRecenti();
    collega();
    const du = $('docUfficiali');
    if (du) montaDocumenti(du, r.piva, api, () => chiave, (arch) => visureDaArchivio(r.piva, arch));
    // Il browser propone il titolo del documento come nome del PDF salvato
    const rs = (r.full?.companyDetails?.companyName ?? r.advanced?.companyName ?? 'scheda').trim();
    document.title = `Scheda ${rs} - ${piva.value}`;
    const btnPdf = $('pdf');
    if (btnPdf) btnPdf.style.display = 'inline-flex';
    if (r.spesa) {
      const s = riepilogoSpesa(r.spesa);
      $('spesa').innerHTML = `tool interno, ${esc(s.meseLeggibile)}<strong>${euroCent(s.valutazione.totale)}</strong>conto del mese ${euroCent(s.conto)}`;
    }
    const na = $('negAzienda');
    const negAz = r.verifiche?.[r.piva]?.negativita;
    if (negAz?.pronto) schedaCorrente.negativita = negAz.dati;   // gia' in registro, mostrata da rendiScheda
    else if (na?.dataset.id) attendi(na.dataset.id, 'negativita', r.piva,
      (d, avviata) => {
        na.innerHTML = esitoNeg(d) + giaVerificata(avviata);
        if (schedaCorrente) schedaCorrente.negativita = d;
        registra(r.piva, 'negativita', { id: na.dataset.id, avviata, pronto: true, dati: d });
        avvisaDocumenti();
      },
      () => { na.innerHTML = IN_LAVORAZIONE; });
    else if (na) na.innerHTML = '<span class="vuoto">non avviata</span>';
  };
  cerca.addEventListener('click', avvia);
  piva.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter' && !cerca.disabled) avvia(); });

  // Clic su una ricerca recente: paese e codice tornano nei campi e la scheda
  // arriva dalla cache, come se l'avessi digitata
  $('recentiLista').addEventListener('click', (e) => {
    const tr = (e.target as HTMLElement).closest<HTMLElement>('tr[data-id]');
    if (!tr) return;
    const cod = tr.dataset.paese ?? 'IT';
    if (![...paese.options].some((o) => o.value === cod)) {
      $('msg').textContent = `Il paese ${cod} non è nel menu di questo strumento.`;
      return;
    }
    paese.value = cod;
    paese.dispatchEvent(new Event('change'));   // formato e lunghezza del campo seguono il paese
    piva.value = tr.dataset.id ?? '';
    cerca.disabled = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    avvia();
  });
  $('recentiPag').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-pagina]');
    if (b && !b.disabled) caricaRecenti(Number(b.dataset.pagina));
  });
  tornaRecenti.addEventListener('click', () => {
    schedaCorrente = null;
    $('scheda').innerHTML = '';
    $('msg').textContent = '';
    $('pdf').style.display = 'none';
    document.title = titoloPagina;
    mostraRecenti();
  });

  if (chiave) mostraRecenti();
}
