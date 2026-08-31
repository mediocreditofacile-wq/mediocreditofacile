// Client dello strumento di valutazione interno MCF.
// Rende la scheda che arriva da /api/azienda e gestisce le verifiche a richiesta.
// I dizionari (etichette, ruoli, valori, codici di bilancio) arrivano dalla pagina
// su window.__VAL__: sono dati generati, non vanno riscritti a mano.

import { PAESI_SEPA, PAESI_MONDO, FORMATO_ID, nomePaese } from '../data/paesi';

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

const rigaSel = (gruppo: string, cf: string, nome: string, celle: string) =>
  `<tr><td class="ck"><input type="checkbox" class="pick" data-gruppo="${gruppo}" data-cf="${esc(cf)}" data-nome="${esc(nome)}"></td>${celle}<td class="num esito" data-cf="${esc(cf)}"><span class="vuoto">non richiesto</span></td></tr>`;

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
  const sev = Number(CS.risk_severity ?? 0);

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
        <div><span>Severità</span><strong>${sev} su 990</strong></div>
        <div><span>Linea di credito consigliata</span><strong>${euro(CS.operational_credit_limit)}</strong></div>
      </div>
      <div class="sev"><div class="sev-bar"><div class="sev-mark" style="left:${Math.max(0.4, Math.min(100, (sev / 990) * 100)).toFixed(2)}%"></div></div>
      <div class="sev-lab"><span>1 — rischio minimo</span><span>990 — rischio massimo</span></div></div>
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

  // eventi negativi azienda (asincroni: si riempiono da soli)
  h += `<div class="blocco"><div class="blocco-tit">Eventi negativi sull'azienda</div>
    <div id="negAzienda" data-id="${esc(s.negativitaId ?? '')}"><span class="attesa">verifica in corso…</span></div></div>`;

  // soci
  const soci = s.soci ?? [];
  h += `<div class="blocco"><div class="blocco-tit">Soci (${soci.length})</div>`;
  if (!soci.length) {
    h += `<p class="val-msg" style="margin:0">Nessun socio in elenco: è il caso delle cooperative, che non hanno una compagine con quote.</p>`;
  } else {
    h += '<table class="sel"><thead><tr><th class="ck"></th><th>Socio</th><th class="num">Quota</th><th class="num">Eventi negativi</th></tr></thead><tbody>';
    soci.forEach((x: any) => {
      const n = x.companyName || `${x.name ?? ''} ${x.surname ?? ''}`.trim();
      h += rigaSel('soci', x.taxCode ?? '', n, `<td><strong>${esc(n)}</strong><br><span class="cf">${esc(x.taxCode ?? '')}</span></td><td class="num">${val(x.percentShare)}%</td>`);
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
      h += rigaSel('amm', m.taxCode ?? '', n,
        `<td><strong>${esc(n)}</strong><br><span class="cf">${esc(m.taxCode ?? '')}</span></td><td>${ruolo}</td><td class="num">${val(m.age)}</td><td class="num">${val(m.birthTown)}</td>`);
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

/** Ripassa a chiedere l'esito: la negativita' ci mette oltre un minuto. */
function attendi(id: string, tipo: 'negativita' | 'report', mostra: (d: any) => void, tentativi = 40) {
  const giro = async () => {
    const r = await api(`/api/verifica?tipo=${tipo}&id=${encodeURIComponent(id)}`).catch(() => null);
    if (r?.pronto) return mostra(r.dati);
    if (--tentativi > 0) setTimeout(giro, 6000);
    else mostra(null);
  };
  setTimeout(giro, 6000);
}

const esitoNeg = (d: any) => {
  if (!d) return '<span class="vuoto">nessuna risposta</span>';
  const v = [d.presenzaProtesti && 'protesti', d.presenzaPregiudizievoli && 'pregiudizievoli', d.presenzaProcedure && 'procedure'].filter(Boolean);
  return v.length ? `<span class="esito-si">${v.join(', ')}</span>` : '<span class="esito-no">nessun evento</span>';
};

function collega() {
  document.querySelectorAll<HTMLInputElement>('.pick').forEach((c) =>
    c.addEventListener('change', () => aggiornaCosto(c.dataset.gruppo!)));

  document.querySelectorAll<HTMLButtonElement>('.val-btn[data-gruppo]').forEach((b) =>
    b.addEventListener('click', async () => {
      const g = b.dataset.gruppo!, azione = b.dataset.azione!;
      const scelti = [...document.querySelectorAll<HTMLInputElement>(`.pick[data-gruppo="${g}"]:checked`)];
      document.querySelectorAll<HTMLButtonElement>(`.val-btn[data-gruppo="${g}"]`).forEach((x) => (x.disabled = true));
      for (const c of scelti) {
        const cf = c.dataset.cf!, td = document.querySelector(`td.esito[data-cf="${cf}"]`) as HTMLElement;
        if (td) td.innerHTML = '<span class="attesa">richiesta inviata…</span>';
        if (azione === 'neg') {
          const r = await api('/api/verifica', { method: 'POST', body: JSON.stringify({ tipo: 'negativita', cf }) });
          if (r?.id) attendi(r.id, 'negativita', (d) => { if (td) td.innerHTML = esitoNeg(d); });
          else if (td) td.innerHTML = `<span class="vuoto">${esc(r?.errore ?? 'non avviata')}</span>`;
        } else {
          const nome = (c.dataset.nome ?? '').split(' ');
          const r = await api('/api/verifica', { method: 'POST', body: JSON.stringify({ tipo: 'report', nome: nome[0] ?? '', cognome: nome.slice(1).join(' '), cf }) });
          if (r?.id) attendi(r.id, 'report', () => { if (td) td.innerHTML = '<span class="esito-no">report pronto</span>'; });
          else if (td) td.innerHTML = `<span class="vuoto">${esc(r?.errore ?? 'non avviato')}</span>`;
        }
      }
    }));
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

export function montaValutazione() {
  D = (window as any).__VAL__;
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
      cerca.disabled = piva.value.trim().length < 4;
      return;
    }
    piva.value = piva.value.replace(/\D/g, '').slice(0, 11);
    cerca.disabled = piva.value.length !== 11;
  });

  const avviaEstero = async () => {
    $('msg').textContent = 'Interrogazione in corso…';
    $('scheda').innerHTML = '';
    const id = piva.value.trim();
    const r = await api(`/api/azienda-estera?paese=${encodeURIComponent(paese.value)}&id=${encodeURIComponent(id)}`)
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
    document.title = `Scheda ${(r.ragioneSociale ?? 'estera').trim()} - ${id}`;
  };

  const avvia = async () => {
    if (estero()) return avviaEstero();
    $('msg').textContent = 'Interrogazione in corso…';
    $('scheda').innerHTML = '';
    const r = await api(`/api/azienda?piva=${piva.value}`).catch((e) => ({ errore: String(e) }));
    if (r?.errore) { $('msg').textContent = `Errore: ${r.errore}`; return; }
    if (r?.trovata === false) { $('msg').textContent = 'Partita IVA non trovata.'; return; }
    $('msg').textContent = r.daCache ? 'Dati da cache, nessun costo.' : '';
    schedaCorrente = r;
    $('scheda').innerHTML = rendiScheda(r);
    collega();
    // Il browser propone il titolo del documento come nome del PDF salvato
    const rs = (r.full?.companyDetails?.companyName ?? r.advanced?.companyName ?? 'scheda').trim();
    document.title = `Scheda ${rs} - ${piva.value}`;
    const btnPdf = $('pdf');
    if (btnPdf) btnPdf.style.display = 'inline-flex';
    if (r.spesa) $('spesa').innerHTML = `spesa di ${esc(r.spesa.mese)}<strong>${nf(r.spesa.totale, 2)} €</strong>${r.spesa.chiamate} chiamate`;
    const na = $('negAzienda');
    if (na?.dataset.id) attendi(na.dataset.id, 'negativita', (d) => { na.innerHTML = esitoNeg(d); if (schedaCorrente) schedaCorrente.negativita = d; });
    else if (na) na.innerHTML = '<span class="vuoto">non avviata</span>';
  };
  cerca.addEventListener('click', avvia);
  piva.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter' && !cerca.disabled) avvia(); });
}
