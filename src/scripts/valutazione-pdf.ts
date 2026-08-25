// Costruzione del PDF della scheda di valutazione.
//
// Disegnato con jsPDF invece che con la stampa del browser: il file scende
// direttamente in Download, senza passare dal dialogo di stampa. Il testo resta
// vettoriale e selezionabile, quindi il PDF pesa poche centinaia di kB anche con
// duecento voci di bilancio (una cattura a immagini ne farebbe una decina di MB).
//
// Funzione pura: non tocca il DOM, cosi' la si puo' provare anche fuori dal browser.

const SCALA = ['A1', 'A2', 'A3', 'B1', 'B2', 'B3', 'C1', 'C2', 'C3'];
const COLORI: [number, number, number][] = [
  [15, 123, 52], [46, 158, 67], [102, 183, 47], [168, 198, 28], [227, 196, 0],
  [240, 160, 0], [238, 107, 31], [220, 50, 32], [163, 21, 21],
];
const ARANCIO: [number, number, number] = [254, 111, 58];
const VIOLA: [number, number, number] = [102, 76, 205];
const NERO: [number, number, number] = [15, 16, 32];
const GRIGIO: [number, number, number] = [120, 119, 130];
const RIGA: [number, number, number] = [225, 222, 227];

export interface Dizionari { CODICI: Record<string, string>; ETICHETTE: Record<string, string>; RUOLI: Record<string, string>; VALORI: Record<string, string>; }

const SEZ_ANAG = ['companyDetails', 'address', 'contacts', 'mail', 'companyStatus', 'companyDates', 'detailedLegalForm', 'atecoClassification', 'rae', 'sae', 'branches', 'corporateGroups', 'webAndSocial', 'innovativeSmeAndSu', 'soaCertification', 'artisanBusinessRegistry', 'marketable', 'development'];
const SEZ_ECON = ['ecofin', 'operatingResults', 'profitability', 'financialStatementKpi', 'indebtedness', 'leverageRatios', 'coverageRatios', 'liquidityRatios', 'structureRatios', 'financialStability', 'financialBurden', 'financialCycle', 'efficiency', 'employees', 'employeesStatistic', 'foreignTrade'];
const SEZ_COD = ['assetsAggregateValues', 'liabilitiesAggregateValues', 'incomeStatementAggregateValues', 'annualResult', 'productionValue', 'productionCosts', 'netWorth', 'debts', 'credits', 'inventory', 'tangibleFixedAssets', 'intangibleFixedAssets', 'financialFixedAssets', 'financialAssets', 'cashEquivalents', 'riskProvisions', 'revenuesFinancialCharges', 'creditsToShareholders', 'adjustments'];

export async function creaPdfScheda(s: any, D: Dizionari) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const L = 14, R = 196, FONDO = 280;
  let y = 0;

  // --- helper di formattazione (versione testo, senza HTML) ---
  const nf = (n: number, dec = 0) => n.toLocaleString('it-IT', { minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: 'always' });
  const euro = (v: unknown) => (v == null || v === '' ? '—' : `${nf(Number(v))} €`);
  const dataIt = (v: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}))?/.exec(v);
    if (!m) return null;
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    if (m[4] && +m[4] >= 22) d.setUTCDate(d.getUTCDate() + 1);
    return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
  };
  const val = (v: unknown): string => {
    if (v == null || v === '') return '—';
    if (typeof v === 'boolean') return v ? 'sì' : 'no';
    if (typeof v === 'number') return Number.isInteger(v) ? nf(v) : nf(v, 2);
    const t = String(v);
    return dataIt(t) ?? (D.VALORI[t.trim()] ?? t);
  };
  const umano = (k: string) => D.ETICHETTE[k] ?? D.ETICHETTE[k.trim()] ??
    k.replace(/(?!^)([A-Z])/g, ' $1').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

  const piatto = (v: Record<string, any>): string => {
    if (v.description != null && v.description !== '') {
      const altri = Object.entries(v).filter(([k]) => k !== 'code' && k !== 'description');
      return val(v.description) + (altri.length ? ' · ' + altri.map(([k, x]) => `${umano(k).toLowerCase()}: ${val(x)}`).join(' · ') : '');
    }
    const resto = Object.entries(v).filter(([, x]) => x != null && x !== '');
    if (!resto.length) return '—';
    if (resto.length === 1 && resto[0][0] === 'code') return val(resto[0][1]);
    return resto.map(([k, x]) => `${umano(k).toLowerCase()}: ${val(x)}`).join(' · ');
  };

  // --- impaginazione ---
  const pagina = (h = 8) => { if (y + h > FONDO) { doc.addPage(); y = 18; } };
  const setCol = (c: [number, number, number]) => doc.setTextColor(c[0], c[1], c[2]);

  function titolo(t: string) {
    pagina(16); y += 4;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); setCol(VIOLA);
    doc.text(t.toUpperCase(), L, y); y += 2;
    doc.setDrawColor(VIOLA[0], VIOLA[1], VIOLA[2]); doc.setLineWidth(0.4); doc.line(L, y, R, y);
    y += 5;
  }
  function sottotitolo(t: string) {
    pagina(10); y += 2;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); setCol(NERO);
    doc.text(t, L, y); y += 4;
  }
  /** Tabella a due colonne con a capo automatico e taglio pagina per riga */
  function coppie(righe: [string, string][]) {
    doc.setFontSize(8);
    for (const [k, v] of righe) {
      const testo = doc.splitTextToSize(String(v ?? '—'), 108) as string[];
      const h = Math.max(4.6, testo.length * 3.6 + 1);
      pagina(h);
      doc.setFillColor(250, 249, 251);
      doc.setDrawColor(RIGA[0], RIGA[1], RIGA[2]); doc.setLineWidth(0.1);
      doc.line(L, y + h - 1.2, R, y + h - 1.2);
      doc.setFont('helvetica', 'normal'); setCol(GRIGIO);
      doc.text(doc.splitTextToSize(k, 68) as string[], L, y + 2.6);
      doc.setFont('helvetica', 'normal'); setCol(NERO);
      doc.text(testo, R, y + 2.6, { align: 'right' });
      y += h;
    }
    y += 2;
  }
  function intestazioneTabella(cols: string[], x: number[]) {
    pagina(8);
    doc.setFillColor(ARANCIO[0], ARANCIO[1], ARANCIO[2]);
    doc.rect(L, y, R - L, 5.6, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(255, 255, 255);
    cols.forEach((c, i) => doc.text(c.toUpperCase(), x[i], y + 3.8, i === cols.length - 1 ? { align: 'right' } : {}));
    y += 7;
  }

  // ---------- intestazione ----------
  const F = s.full ?? {}, A = s.advanced ?? {}, CS = s.score ?? {};
  const det = F.companyDetails ?? {};
  const nome = det.companyName ?? A.companyName ?? '';
  const piva = det.vatCode ?? A.vatCode ?? s.piva ?? '';
  const sede = F.address?.registeredOffice ?? A.address?.registeredOffice ?? F.address ?? {};
  const forma = A.detailedLegalForm?.description ?? F.legalForm?.detailedLegalForm?.description ?? '';
  const ate = A.atecoClassification?.ateco ?? {};

  y = 20;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); setCol(NERO);
  doc.text(doc.splitTextToSize(nome, R - L) as string[], L, y); y += 7;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); setCol(GRIGIO);
  const riga1 = [`P.IVA ${piva}`, forma, A.startDate ? `attiva dal ${dataIt(String(A.startDate))}` : ''].filter(Boolean).join(' · ');
  doc.text(doc.splitTextToSize(riga1, R - L) as string[], L, y); y += 4.5;
  const riga2 = [[sede.streetName, sede.town].filter(Boolean).join(' — '), ate.code ? `ATECO ${ate.code} ${ate.description ?? ''}` : ''].filter(Boolean).join(' · ');
  doc.text(doc.splitTextToSize(riga2, R - L) as string[], L, y);
  y += (doc.splitTextToSize(riga2, R - L) as string[]).length * 4 + 4;

  // ---------- tachimetro + rating ----------
  titolo('Posizionamento del rating');
  const idx = SCALA.indexOf(CS.rating ?? '');
  const cx = L + 32, cy = y + 30, r0 = 16, r1 = 26;
  for (let i = 0; i < 9; i++) {
    const a0 = Math.PI + (i * Math.PI) / 9, a1 = Math.PI + ((i + 1) * Math.PI) / 9;
    const c = COLORI[i];
    // spicchio approssimato con un ventaglio di triangoli: jsPDF non ha archi pieni
    doc.setFillColor(c[0], c[1], c[2]);
    const passi = 6;
    for (let t = 0; t < passi; t++) {
      const b0 = a0 + ((a1 - a0) * t) / passi, b1 = a0 + ((a1 - a0) * (t + 1)) / passi;
      doc.triangle(cx + r1 * Math.cos(b0), cy + r1 * Math.sin(b0), cx + r1 * Math.cos(b1), cy + r1 * Math.sin(b1), cx + r0 * Math.cos(b0), cy + r0 * Math.sin(b0), 'F');
      doc.triangle(cx + r1 * Math.cos(b1), cy + r1 * Math.sin(b1), cx + r0 * Math.cos(b1), cy + r0 * Math.sin(b1), cx + r0 * Math.cos(b0), cy + r0 * Math.sin(b0), 'F');
    }
    const am = (a0 + a1) / 2;
    doc.setFont('helvetica', i === idx ? 'bold' : 'normal'); doc.setFontSize(i === idx ? 7.5 : 6);
    setCol(i === idx ? NERO : GRIGIO);
    doc.text(SCALA[i], cx + 30 * Math.cos(am) - 1.6, cy + 30 * Math.sin(am) + 1);
  }
  if (idx >= 0) {
    const am = Math.PI + ((idx + 0.5) * Math.PI) / 9;
    doc.setDrawColor(NERO[0], NERO[1], NERO[2]); doc.setLineWidth(0.9);
    doc.line(cx, cy, cx + 21 * Math.cos(am), cy + 21 * Math.sin(am));
    doc.setFillColor(NERO[0], NERO[1], NERO[2]); doc.circle(cx, cy, 1.4, 'F');
  }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5); setCol(GRIGIO);
  doc.text('rischio minimo', cx - 30, cy + 4); doc.text('rischio massimo', cx + 20, cy + 4);

  const xd = L + 74;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(22); setCol(NERO);
  doc.text(CS.rating ?? 'n.d.', xd, y + 12);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); setCol(GRIGIO);
  doc.text(`${CS.risk_score_description ?? ''}${idx >= 0 ? ` · classe ${idx + 1} di 9` : ' · nessuna classe assegnata'}`, xd, y + 17);
  const sev = Number(CS.risk_severity ?? 0);
  const dati: [string, string][] = [
    ['Punteggio di rischio', String(CS.risk_score ?? '—')],
    ['Severità', `${sev} su 990`],
    ['Linea di credito consigliata', euro(CS.operational_credit_limit)],
  ];
  let yy = y + 24;
  doc.setFontSize(8);
  dati.forEach(([k, v]) => {
    setCol(GRIGIO); doc.text(k, xd, yy);
    doc.setFont('helvetica', 'bold'); setCol(NERO); doc.text(v, R, yy, { align: 'right' });
    doc.setFont('helvetica', 'normal'); yy += 5;
  });
  y = Math.max(cy + 10, yy + 2);

  // ---------- riassunto ----------
  const eco = F.ecofin ?? {}, op = F.operatingResults ?? {}, prof = F.profitability ?? {};
  const ann: Record<string, number> = {};
  (F.annualResult ?? []).forEach((x: any) => { if (x?.code) ann[x.code] = x.value; });
  titolo('Riassunto');
  const box: [string, string, string][] = [
    ['Ricavi delle vendite', euro(eco.turnover), `${val(eco.turnoverTrend)}% sull'anno prima · esercizio ${eco.turnoverYear ?? '—'}`],
    ["Utile d'esercizio", euro(ann.IIC179), 'voce 21 del conto economico'],
    ['Patrimonio netto', euro(eco.netWorth), `capitale sociale ${euro(eco.shareCapital)}`],
  ];
  const w = (R - L - 8) / 3;
  pagina(24);
  box.forEach(([k, v, n], i) => {
    const x = L + i * (w + 4);
    doc.setDrawColor(ARANCIO[0], ARANCIO[1], ARANCIO[2]); doc.setLineWidth(0.4);
    doc.roundedRect(x, y, w, 20, 2, 2, 'S');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); setCol(GRIGIO); doc.text(k, x + 3, y + 5);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); setCol(NERO); doc.text(v, x + 3, y + 12);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6); setCol(GRIGIO);
    doc.text(doc.splitTextToSize(n, w - 6) as string[], x + 3, y + 16.5);
  });
  y += 25;
  coppie([
    ['EBITDA', euro(op.ebitda)], ['EBIT', euro(op.ebit)], ['Flusso di cassa', euro(op.cashFlow)],
    ['ROE', val(prof.roe)], ['ROI', val(prof.roi)], ['Dipendenti', val(F.employees?.employee)],
  ]);

  // ---------- eventi negativi ----------
  titolo("Eventi negativi sull'azienda");
  const n = s.negativita ?? null;
  const esito = n
    ? [n.presenzaProtesti && 'protesti', n.presenzaPregiudizievoli && 'pregiudizievoli', n.presenzaProcedure && 'procedure concorsuali'].filter(Boolean).join(', ') || 'nessun evento rilevato'
    : 'verifica non conclusa al momento della stampa';
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); setCol(NERO);
  pagina(8); doc.text(esito, L, y); y += 8;

  // ---------- soci ----------
  const soci = s.soci ?? [];
  titolo(`Soci (${soci.length})`);
  if (!soci.length) {
    doc.setFontSize(8); setCol(GRIGIO); pagina(6);
    doc.text('Nessun socio in elenco: è il caso delle cooperative, che non hanno una compagine con quote.', L, y); y += 7;
  } else {
    intestazioneTabella(['Socio', 'Codice fiscale', 'Quota'], [L + 1, L + 95, R - 1]);
    doc.setFontSize(8);
    soci.forEach((x: any) => {
      pagina(5.2);
      const nm = x.companyName || `${x.name ?? ''} ${x.surname ?? ''}`.trim();
      setCol(NERO); doc.setFont('helvetica', 'normal');
      doc.text(doc.splitTextToSize(nm, 78)[0] as string, L + 1, y + 2.4);
      setCol(GRIGIO); doc.text(String(x.taxCode ?? '—'), L + 95, y + 2.4);
      setCol(NERO); doc.text(`${val(x.percentShare)}%`, R - 1, y + 2.4, { align: 'right' });
      doc.setDrawColor(RIGA[0], RIGA[1], RIGA[2]); doc.setLineWidth(0.1); doc.line(L, y + 3.8, R, y + 3.8);
      y += 5.2;
    });
    y += 2;
  }

  // ---------- amministratori ----------
  const mg = F.managers ?? [];
  if (mg.length) {
    titolo(`Amministratori (${mg.length})`);
    intestazioneTabella(['Nome', 'Ruolo', 'Età'], [L + 1, L + 80, R - 1]);
    doc.setFontSize(8);
    mg.forEach((m: any) => {
      pagina(5.2);
      const nm = `${m.name ?? ''} ${m.surname ?? ''}`.trim();
      const ruoli = (m.roles ?? []).map((r: any) => D.RUOLI[r?.role?.code] ?? val(r?.role?.description)).filter(Boolean).join(' · ');
      setCol(NERO); doc.setFont('helvetica', m.isLegalRepresentative ? 'bold' : 'normal');
      doc.text(doc.splitTextToSize(nm, 64)[0] as string, L + 1, y + 2.4);
      doc.setFont('helvetica', 'normal'); setCol(GRIGIO);
      doc.text(doc.splitTextToSize(ruoli || '—', 100)[0] as string, L + 80, y + 2.4);
      setCol(NERO); doc.text(String(m.age ?? '—'), R - 1, y + 2.4, { align: 'right' });
      doc.setDrawColor(RIGA[0], RIGA[1], RIGA[2]); doc.setLineWidth(0.1); doc.line(L, y + 3.8, R, y + 3.8);
      y += 5.2;
    });
    y += 2;
  }

  // ---------- anagrafica e indici ----------
  const ITALIANO = ['atecoClassification', 'detailedLegalForm'];
  const fonte = (k: string) => (ITALIANO.includes(k) && A[k] ? A[k] : F[k]);
  const blocco = (tit: string, chiavi: string[]) => {
    titolo(tit);
    chiavi.forEach((k) => {
      const v = fonte(k);
      if (!v || typeof v !== 'object' || Array.isArray(v) || !Object.keys(v).length) return;
      sottotitolo(umano(k));
      const righe: [string, string][] = [];
      Object.entries(v).forEach(([kk, vv]: [string, any]) => {
        if (vv && typeof vv === 'object' && !Array.isArray(vv)) righe.push([umano(kk), piatto(vv)]);
        else if (Array.isArray(vv)) righe.push([umano(kk), `${vv.length} voci`]);
        else righe.push([umano(kk), /year|anno/i.test(kk) && typeof vv === 'number' ? String(vv) : val(vv)]);
      });
      coppie(righe);
    });
  };
  blocco('Anagrafica e inquadramento', SEZ_ANAG);
  if (F.pec) coppie([['PEC', String(F.pec)]]);
  blocco('Indici e aggregati economici', SEZ_ECON);

  // ---------- bilancio riclassificato ----------
  const conVoci = SEZ_COD.filter((k) => Array.isArray(F[k]) && F[k].length);
  if (conVoci.length) {
    titolo('Bilancio riclassificato');
    conVoci.forEach((k) => {
      sottotitolo(`${umano(k)} (${F[k].length} voci)`);
      coppie(F[k].filter((x: any) => x && typeof x === 'object')
        .map((x: any) => [D.CODICI[x.code] || `codice ${x.code} non in legenda`, val(x.value)] as [string, string]));
    });
  }

  // ---------- piè di pagina ----------
  const tot = doc.getNumberOfPages();
  for (let p = 1; p <= tot; p++) {
    doc.setPage(p);
    doc.setDrawColor(VIOLA[0], VIOLA[1], VIOLA[2]); doc.setLineWidth(0.4);
    doc.line(L, 287, R, 287);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); setCol(GRIGIO);
    doc.text('Mediocredito Facile · mediocreditofacile.it · Collaboratore del Mediatore Affida — Iscrizione OAM M325', L, 291);
    doc.text(`${p} / ${tot}`, R, 291, { align: 'right' });
  }
  return doc;
}
