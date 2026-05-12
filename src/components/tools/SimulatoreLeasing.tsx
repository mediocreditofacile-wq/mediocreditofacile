import { useState, useMemo } from 'preact/hooks';
import './simulatore-leasing.css';
import {
  PARTNERS_LEASING,
  SELLA,
  ALBA,
  EURIBOR_3M,
  EURIBOR_3M_DATA,
  TIPOLOGIE_BENE,
  getCondizioniPerDurata,
  getCondizioneFornitori,
  calcolaRataLeasingPartner,
  calcolaSabatiniMise,
  calcolaIperammortamentoBene,
  calcolaZES,
  ZES_REGIONI,
  DIMENSIONE_LABELS,
  type PartnerLeasing,
  type TipologiaBene,
  type TipoSabatini,
  type DimensioneImpresa,
} from '../../data/leasing';

interface SimulatoreLeasingProps {
  /**
   * Variante "fornitori": pagina pubblica per rivenditori.
   * - Nasconde la riga "Provvigione caricata sulla rata" anche in pagina
   * - Sostituisce il select condizione con un display read-only "Spread X% (medio commerciale)"
   * - Imposta automaticamente lo spread medio definito su ogni partner (PartnerLeasing.spreadFornitori)
   * - Aggiorna lo spread se cambia partner o durata, scegliendo la condizione giusta
   */
  varianteFornitori?: boolean;
}

const eur = (n: number) =>
  n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const eurDec = (n: number) =>
  n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n: number) => `${n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

export default function SimulatoreLeasing({ varianteFornitori = false }: SimulatoreLeasingProps) {
  // --- Stato simulazione ---
  const [partnerKey, setPartnerKey] = useState<'sella' | 'alba' | 'credem'>('sella');
  const [tipologia, setTipologia] = useState<TipologiaBene>('strumentale-generico');
  const [importo, setImporto] = useState<number>(50_000);
  const [durata, setDurata] = useState<number>(60);
  const [anticipoPerc, setAnticipoPerc] = useState<number>(10);
  const [riscattoPerc, setRiscattoPerc] = useState<number>(1);
  const initialCondizione = varianteFornitori
    ? getCondizioneFornitori(SELLA, 60).id
    : SELLA.condizioniPerDurata.default[0].id;
  const [condizioneId, setCondizioneId] = useState<number>(initialCondizione);

  // --- Agevolazioni ---
  const [sabatiniAttiva, setSabatiniAttiva] = useState<boolean>(false);
  const [sabatiniTipo, setSabatiniTipo] = useState<TipoSabatini>('ordinaria');
  const [iperAttivo, setIperAttivo] = useState<boolean>(false);
  const [zesAttiva, setZesAttiva] = useState<boolean>(false);
  const [zesRegione, setZesRegione] = useState<string>('campania');
  const [zesDimensione, setZesDimensione] = useState<DimensioneImpresa>('piccola');

  // --- Stato PDF ---
  const [pdfClienteRs, setPdfClienteRs] = useState<string>('');
  const [pdfClientePiva, setPdfClientePiva] = useState<string>('');
  const [pdfReferente, setPdfReferente] = useState<string>('');
  const [pdfMostraTasso, setPdfMostraTasso] = useState<boolean>(true);
  const [generandoPdf, setGenerandoPdf] = useState<boolean>(false);

  const partner = useMemo<PartnerLeasing>(
    () => PARTNERS_LEASING.find((p) => p.key === partnerKey) ?? SELLA,
    [partnerKey],
  );

  const condizioniDisponibili = useMemo(
    () => getCondizioniPerDurata(partner, durata),
    [partner, durata],
  );

  // Quando cambia partner o durata, scegli la condizione giusta:
  // - Variante fornitori: spread medio commerciale fisso (PartnerLeasing.spreadFornitori)
  // - Variante interna: se la condizione corrente non è più valida, fallback al primo della lista
  const condizioneEffettiva = useMemo(() => {
    if (varianteFornitori) {
      const target = getCondizioneFornitori(partner, durata);
      if (target.id !== condizioneId) setCondizioneId(target.id);
      return target;
    }
    const found = condizioniDisponibili.find((c) => c.id === condizioneId);
    if (found) return found;
    const fallback = condizioniDisponibili[0];
    if (fallback && fallback.id !== condizioneId) {
      setCondizioneId(fallback.id);
    }
    return fallback;
  }, [condizioniDisponibili, condizioneId, varianteFornitori, partner, durata]);

  // Riscatto max per durata corrente
  const riscattoMax = partner.riscattoMaxPerDurata[durata] ?? 20;

  // Validazione importo
  const importoValido = importo >= partner.importoMin && importo <= partner.importoMax;

  // --- Calcolo rata ---
  const risultato = useMemo(() => {
    if (!importoValido || !condizioneEffettiva) return null;
    const riscattoSafe = Math.min(riscattoPerc, riscattoMax);
    return calcolaRataLeasingPartner(
      partner,
      importo,
      durata,
      anticipoPerc,
      riscattoSafe,
      condizioneEffettiva.id,
    );
  }, [partner, importo, durata, anticipoPerc, riscattoPerc, riscattoMax, condizioneEffettiva, importoValido]);

  // --- Calcolo agevolazioni ---
  // Regole di esclusione:
  // - Sabatini ordinaria e Sabatini 4.0 sono la stessa misura → un solo toggle, scelta tipo dentro
  // - ZES non cumulabile con Sabatini 4.0 (D.L. 124/2023): se entrambi attivi, ZES "vince" e disattiva il toggle Sabatini visivamente
  // - Iperammortamento cumulabile con tutto
  const zesIncompatibileSabatini40 = zesAttiva && sabatiniAttiva && sabatiniTipo === '4-0';

  const sabatiniRis = useMemo(() => {
    if (!sabatiniAttiva || !risultato) return null;
    if (zesIncompatibileSabatini40) return null; // disattivata per cumulabilità
    return calcolaSabatiniMise(importo, sabatiniTipo);
  }, [sabatiniAttiva, sabatiniTipo, importo, risultato, zesIncompatibileSabatini40]);

  const iperRis = useMemo(() => {
    if (!iperAttivo || !risultato) return null;
    return calcolaIperammortamentoBene(importo, tipologia);
  }, [iperAttivo, importo, tipologia, risultato]);

  const zesRis = useMemo(() => {
    if (!zesAttiva || !risultato) return null;
    return calcolaZES(importo, zesRegione, zesDimensione);
  }, [zesAttiva, importo, zesRegione, zesDimensione, risultato]);

  // Beneficio mensile equivalente (somma agevolazioni distribuite mensilmente sulla durata leasing)
  const beneficioMensileTotale = useMemo(() => {
    let totale = 0;
    if (sabatiniRis) totale += sabatiniRis.contributoMensile;
    if (iperRis) totale += iperRis.beneficioMensile;
    if (zesRis) totale += zesRis.creditoMensile;
    return totale;
  }, [sabatiniRis, iperRis, zesRis]);

  const rataNettaAgevolazioni = risultato ? Math.max(0, risultato.rataMensile - beneficioMensileTotale) : 0;

  // --- Generazione PDF ---
  const generaPDF = async () => {
    if (!risultato) return;
    setGenerandoPdf(true);
    try {
      const html2pdf = (await import('html2pdf.js')).default;
      const oggi = new Date().toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' });

      const sezioneCliente = pdfClienteRs.trim()
        ? `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px 18px;margin-bottom:20px;">
             <div style="font-size:10px;color:#787782;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px;">Intestato a</div>
             <div style="font-size:14px;font-weight:700;color:#293C5B;">${escapeHtml(pdfClienteRs)}</div>
             ${pdfReferente ? `<div style="font-size:11px;color:#475569;margin-top:2px;">Rif. ${escapeHtml(pdfReferente)}</div>` : ''}
             ${pdfClientePiva ? `<div style="font-size:11px;color:#787782;margin-top:2px;">P.IVA ${escapeHtml(pdfClientePiva)}</div>` : ''}
           </div>`
        : '';

      const righeAgevolazioni: string[] = [];
      if (sabatiniRis) {
        const tipoLabel = sabatiniRis.tipo === '4-0' ? 'Sabatini 4.0' : 'Sabatini ordinaria';
        righeAgevolazioni.push(
          `<tr style="background:#f5f3ff"><td>${tipoLabel} (su 6 anni, ${pct(sabatiniRis.tassoAgevolato)})</td><td style="text-align:right;color:#664CCD;font-weight:700">−${eurDec(sabatiniRis.contributoMensile)}/mese</td></tr>`,
        );
      }
      if (iperRis) {
        righeAgevolazioni.push(
          `<tr style="background:#f5f3ff"><td>Iperammortamento (${iperRis.costoAmmortizzabilePerc}% su ${iperRis.anniAmmortamento} anni)</td><td style="text-align:right;color:#664CCD;font-weight:700">−${eurDec(iperRis.beneficioMensile)}/mese</td></tr>`,
        );
      }
      if (zesRis) {
        righeAgevolazioni.push(
          `<tr style="background:#f5f3ff"><td>ZES Unica — credito d'imposta (${pct(zesRis.aliquotaPerc)}, su 5 anni)</td><td style="text-align:right;color:#664CCD;font-weight:700">−${eurDec(zesRis.creditoMensile)}/mese</td></tr>`,
        );
      }

      const sezioneAgevolazioni = righeAgevolazioni.length
        ? `<h3 style="margin:24px 0 12px;font-size:14px;color:#293C5B;font-weight:700;">Agevolazioni applicate</h3>
           <table style="width:100%;border-collapse:collapse;font-size:12px;">
             <tr><td>Rata leasing mensile</td><td style="text-align:right">+${eurDec(risultato.rataMensile)}/mese</td></tr>
             ${righeAgevolazioni.join('')}
             <tr style="border-top:2px solid #293C5B;font-weight:700;font-size:13px">
               <td style="padding-top:8px">Costo netto mensile</td>
               <td style="text-align:right;padding-top:8px">${eurDec(rataNettaAgevolazioni)}/mese</td>
             </tr>
           </table>`
        : '';

      // PDF lato cliente: provvigione MAI mostrata.
      // Tasso del piano: opzionale via toggle (default mostrato).
      const tassoRow = pdfMostraTasso
        ? `<tr><td>Tasso del piano (Spread + Euribor 3M)</td><td style="text-align:right">${pct(risultato.tassoEffettivo)}</td></tr>`
        : '';

      const html = `
        <div style="font-family:'Manrope',Helvetica,Arial,sans-serif;color:#293C5B;padding:32px;max-width:600px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #664CCD;">
            <div>
              <div style="font-size:18px;font-weight:800;letter-spacing:-0.02em;">
                <span style="color:#664CCD">Medio</span><span style="color:#293C5B">credito</span>
                <span style="color:#FE6F3A;margin-left:4px">Facile</span>
              </div>
              <div style="font-size:8px;font-weight:400;letter-spacing:3.5px;color:#664CCD;text-transform:uppercase;margin-top:2px;">L'OFFICINA DEL CREDITO</div>
            </div>
            <div style="text-align:right;font-size:10px;color:#787782;">Preventivo generato il ${oggi}</div>
          </div>

          <h2 style="font-size:16px;font-weight:800;color:#664CCD;margin:0 0 4px;">Preventivo Leasing Strumentale</h2>
          <p style="font-size:11px;color:#787782;margin:0 0 20px;">Durata ${durata} mesi — Importo ${eur(importo)}</p>

          ${sezioneCliente}

          <div style="background:#f5f3ff;border-left:4px solid #664CCD;border-radius:8px;padding:16px 20px;margin-bottom:20px;">
            <div style="font-size:10px;color:#787782;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:4px;">Rata mensile</div>
            <div style="font-size:28px;font-weight:800;color:#664CCD;letter-spacing:-0.02em;">${eurDec(risultato.rataMensile)}</div>
            <div style="font-size:11px;color:#787782;margin-top:4px;">${risultato.numRate} rate dopo l'anticipo</div>
          </div>

          <table style="width:100%;border-collapse:collapse;font-size:12px;">
            <tr><td>Anticipo / maxicanone (${anticipoPerc}%)</td><td style="text-align:right">${eur(risultato.anticipo)}</td></tr>
            <tr><td>Riscatto finale (${riscattoPerc}%)</td><td style="text-align:right">${eur(risultato.riscatto)}</td></tr>
            <tr><td>Spese istruttoria</td><td style="text-align:right">${eur(risultato.speseIstruttoria)}</td></tr>
            <tr><td>Spese incasso rata</td><td style="text-align:right">${eur(risultato.speseIncassoRata)} × ${risultato.numRate}</td></tr>
            ${tassoRow}
            <tr style="border-top:1px solid #E1DEE3;font-weight:700"><td style="padding-top:8px">Totale dovuto</td><td style="text-align:right;padding-top:8px">${eur(risultato.totaleCanoni)}</td></tr>
          </table>

          ${sezioneAgevolazioni}

          <div style="margin-top:32px;padding-top:16px;border-top:1px solid #E1DEE3;font-size:9px;color:#787782;line-height:1.5;">
            <p>Coefficienti indicativi. Il preventivo definitivo dipende dalla societa' di leasing e dalle condizioni al momento della delibera. Euribor 3M ${pct(EURIBOR_3M)} (rilevazione ${EURIBOR_3M_DATA}). Le agevolazioni richiedono verifica dei requisiti soggettivi e oggettivi: il calcolo qui mostrato e' una stima del beneficio teorico.</p>
            <p style="margin-top:8px;"><strong style="color:#664CCD">Mediocredito Facile</strong> — mediocreditofacile.it — +39 393 995 7840</p>
          </div>
        </div>
      `;

      const container = document.createElement('div');
      container.innerHTML = html;
      document.body.appendChild(container);

      const clienteSlug = pdfClienteRs.trim()
        ? '_' + pdfClienteRs.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30)
        : '';
      const nomeFile = `Preventivo_MCF_Leasing_${partner.shortLabel}${clienteSlug}_${durata}mesi.pdf`;

      await html2pdf()
        .set({
          margin: [10, 10, 10, 10],
          filename: nomeFile,
          image: { type: 'jpeg', quality: 0.95 },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
          html2canvas: { scale: 2, useCORS: true },
        })
        .from(container)
        .save();

      document.body.removeChild(container);
    } finally {
      setGenerandoPdf(false);
    }
  };

  return (
    <div class="simlea">
      {/* === Selettore partner === */}
      <div class="simlea__partners">
        {PARTNERS_LEASING.map((p) => (
          <button
            key={p.key}
            type="button"
            class={`simlea__partner ${partnerKey === p.key ? 'simlea__partner--active' : ''}`}
            style={{ '--partner-color': p.badgeColor } as any}
            onClick={() => setPartnerKey(p.key)}
          >
            <span class="simlea__partner-label">{p.label}</span>
            <span class="simlea__partner-meta">
              Da {eur(p.importoMin)} • Istruttoria {eur(p.speseIstruttoria)}
            </span>
          </button>
        ))}
      </div>

      <div class="simlea__grid">
        {/* === Pannello input === */}
        <div class="simlea__panel">
          <h3 class="simlea__panel-title">Parametri operazione</h3>

          <label class="simlea__field">
            <span class="simlea__field-label">Tipologia bene</span>
            <select
              value={tipologia}
              onChange={(e) => setTipologia((e.currentTarget as HTMLSelectElement).value as TipologiaBene)}
            >
              {TIPOLOGIE_BENE.map((t) => (
                <option key={t.key} value={t.key}>{t.label}</option>
              ))}
            </select>
          </label>

          <label class="simlea__field">
            <span class="simlea__field-label">
              Importo bene <span class="simlea__field-hint">(€{partner.importoMin.toLocaleString('it-IT')} - €{(partner.importoMax / 1_000_000).toFixed(0)}M)</span>
            </span>
            <input
              type="number"
              value={importo}
              min={partner.importoMin}
              max={partner.importoMax}
              step={1000}
              onInput={(e) => setImporto(Number((e.currentTarget as HTMLInputElement).value) || 0)}
            />
            {!importoValido && (
              <span class="simlea__field-error">
                Importo fuori range per {partner.label}: min {eur(partner.importoMin)}.
              </span>
            )}
          </label>

          <div class="simlea__row">
            <label class="simlea__field">
              <span class="simlea__field-label">Durata (mesi)</span>
              <select
                value={durata}
                onChange={(e) => setDurata(Number((e.currentTarget as HTMLSelectElement).value))}
              >
                {partner.durateAmmesse.map((d) => (
                  <option key={d} value={d}>{d} mesi</option>
                ))}
              </select>
            </label>

            <label class="simlea__field">
              <span class="simlea__field-label">Anticipo</span>
              <select
                value={anticipoPerc}
                onChange={(e) => setAnticipoPerc(Number((e.currentTarget as HTMLSelectElement).value))}
              >
                {[5, 10, 15, 20, 25, 30].map((a) => (
                  <option key={a} value={a}>{a}%</option>
                ))}
              </select>
            </label>

            <label class="simlea__field">
              <span class="simlea__field-label">
                Riscatto <span class="simlea__field-hint">(max {riscattoMax}%)</span>
              </span>
              <input
                type="number"
                value={riscattoPerc}
                min={1}
                max={riscattoMax}
                step={1}
                onInput={(e) => setRiscattoPerc(Number((e.currentTarget as HTMLInputElement).value) || 1)}
              />
            </label>
          </div>

          {varianteFornitori ? (
            <div class="simlea__field">
              <span class="simlea__field-label">Spread applicato</span>
              <div class="simlea__spread-fixed">
                <strong>{pct(partner.spreadFornitori)}</strong>
                <span class="simlea__spread-fixed-meta">spread medio commerciale</span>
              </div>
            </div>
          ) : (
            <label class="simlea__field">
              <span class="simlea__field-label">
                Condizione (spread)
                <span class="simlea__field-hint">— scegli il livello in base al merito creditizio</span>
              </span>
              <select
                value={condizioneId}
                onChange={(e) => setCondizioneId(Number((e.currentTarget as HTMLSelectElement).value))}
              >
                {condizioniDisponibili.map((c) => {
                  const provLabel = c.provvigionePerc !== undefined
                    ? `prov. ${c.provvigionePerc}% (${eur(importo * c.provvigionePerc / 100)})`
                    : `prov. ${c.provvigionePercSuSpread}% su spread (${eur(importo * c.spread / 100 * (c.provvigionePercSuSpread ?? 0) / 100)})`;
                  return (
                    <option key={c.id} value={c.id}>
                      Spread {pct(c.spread)} — {provLabel}
                    </option>
                  );
                })}
              </select>
            </label>
          )}

          <div class="simlea__euribor">
            Tasso piano = Spread + Euribor 3M ({pct(EURIBOR_3M)} • {EURIBOR_3M_DATA})
          </div>
        </div>

        {/* === Pannello agevolazioni === */}
        <div class="simlea__panel simlea__panel--agev">
          <h3 class="simlea__panel-title">Agevolazioni cumulabili</h3>

          {/* Sabatini */}
          <div class="simlea__agev">
            <label class="simlea__agev-toggle">
              <input
                type="checkbox"
                checked={sabatiniAttiva}
                onChange={(e) => setSabatiniAttiva((e.currentTarget as HTMLInputElement).checked)}
              />
              <span>Nuova Sabatini (contributo MISE in conto interessi)</span>
            </label>
            {sabatiniAttiva && (
              <div class="simlea__agev-detail">
                <div class="simlea__radios">
                  <label>
                    <input
                      type="radio"
                      name="sabatini-tipo"
                      checked={sabatiniTipo === 'ordinaria'}
                      onChange={() => setSabatiniTipo('ordinaria')}
                    />
                    Ordinaria <span class="simlea__radio-meta">tasso 2,75%</span>
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="sabatini-tipo"
                      checked={sabatiniTipo === '4-0'}
                      onChange={() => setSabatiniTipo('4-0')}
                    />
                    4.0 (beni Industria 4.0) <span class="simlea__radio-meta">tasso 3,575%</span>
                  </label>
                </div>
                {zesIncompatibileSabatini40 && (
                  <div class="simlea__warning">
                    ZES Unica e Sabatini 4.0 non sono cumulabili: il contributo Sabatini è disattivato finché ZES è attivo.
                  </div>
                )}
                {sabatiniRis && (
                  <div class="simlea__agev-result">
                    Contributo totale stimato: <strong>{eur(sabatiniRis.contributoTotale)}</strong>
                    <span class="simlea__agev-meta"> in 6 quote da {eur(sabatiniRis.contributoAnnuo)}/anno</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Iperammortamento */}
          <div class="simlea__agev">
            <label class="simlea__agev-toggle">
              <input
                type="checkbox"
                checked={iperAttivo}
                onChange={(e) => setIperAttivo((e.currentTarget as HTMLInputElement).checked)}
              />
              <span>Iperammortamento 4.0 (L. 199/2025, beni 4.0 con perizia)</span>
            </label>
            {iperRis && (
              <div class="simlea__agev-detail">
                <div class="simlea__agev-result">
                  Beneficio fiscale totale: <strong>{eur(iperRis.beneficioFiscaleTotale)}</strong>
                  <span class="simlea__agev-meta"> distribuito su {iperRis.anniAmmortamento} anni di ammortamento</span>
                </div>
                <div class="simlea__agev-meta">
                  Costo ammortizzabile: {iperRis.costoAmmortizzabilePerc}% del bene • IRES+IRAP eff. 27,8%
                </div>
              </div>
            )}
          </div>

          {/* ZES Unica */}
          <div class="simlea__agev">
            <label class="simlea__agev-toggle">
              <input
                type="checkbox"
                checked={zesAttiva}
                onChange={(e) => setZesAttiva((e.currentTarget as HTMLInputElement).checked)}
              />
              <span>ZES Unica (credito d'imposta Mezzogiorno, soglia €200k)</span>
            </label>
            {zesAttiva && (
              <div class="simlea__agev-detail">
                <div class="simlea__row">
                  <label class="simlea__field">
                    <span class="simlea__field-label">Regione</span>
                    <select value={zesRegione} onChange={(e) => setZesRegione((e.currentTarget as HTMLSelectElement).value)}>
                      {ZES_REGIONI.map((r) => (
                        <option key={r.key} value={r.key}>{r.label}</option>
                      ))}
                    </select>
                  </label>
                  <label class="simlea__field">
                    <span class="simlea__field-label">Dimensione impresa</span>
                    <select
                      value={zesDimensione}
                      onChange={(e) => setZesDimensione((e.currentTarget as HTMLSelectElement).value as DimensioneImpresa)}
                    >
                      {Object.entries(DIMENSIONE_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </label>
                </div>
                {zesRis && zesRis.aliquotaPerc > 0 && (
                  <div class="simlea__agev-result">
                    Credito d'imposta: <strong>{eur(zesRis.creditoImposta)}</strong>
                    <span class="simlea__agev-meta"> ({pct(zesRis.aliquotaPerc)} sull'investimento)</span>
                  </div>
                )}
                {importo < 200_000 && (
                  <div class="simlea__warning">
                    Investimento sotto la soglia ZES di €200.000 per progetto. Il credito non sarà riconosciuto se l'importo resta sotto soglia.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* === Riepilogo risultati === */}
      {risultato && (
        <div class="simlea__results">
          <div class="simlea__result-main">
            <div class="simlea__result-rata">
              <span class="simlea__result-label">Rata mensile {partner.label}</span>
              <span class="simlea__result-value">{eurDec(risultato.rataMensile)}</span>
              <span class="simlea__result-sub">{risultato.numRate} rate dopo l'anticipo</span>
            </div>
            {beneficioMensileTotale > 0 && (
              <div class="simlea__result-netto">
                <span class="simlea__result-label">Costo netto mensile (con agevolazioni)</span>
                <span class="simlea__result-value simlea__result-value--netto">{eurDec(rataNettaAgevolazioni)}</span>
                <span class="simlea__result-sub">Beneficio agevolazioni: {eurDec(beneficioMensileTotale)}/mese</span>
              </div>
            )}
          </div>

          <div class="simlea__breakdown">
            <h4>Dettaglio piano</h4>
            <table>
              <tbody>
                <tr><td>Anticipo ({anticipoPerc}%)</td><td>{eur(risultato.anticipo)}</td></tr>
                <tr><td>Riscatto finale ({riscattoPerc}%)</td><td>{eur(risultato.riscatto)}</td></tr>
                <tr><td>Spese istruttoria</td><td>{eur(risultato.speseIstruttoria)}</td></tr>
                <tr><td>Spese incasso rata</td><td>{eur(risultato.speseIncassoRata)} × {risultato.numRate}</td></tr>
                <tr><td>Tasso del piano</td><td>{pct(risultato.tassoEffettivo)}</td></tr>
                {partner.modello === 'capitale-gonfiato' && !varianteFornitori && (
                  <tr class="simlea__breakdown-prov">
                    <td>Provvigione caricata sulla rata</td>
                    <td>{eur(risultato.provvigione)}</td>
                  </tr>
                )}
                <tr class="simlea__breakdown-total">
                  <td>Totale dovuto sul contratto</td>
                  <td>{eur(risultato.totaleCanoni)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* === PDF brandizzato cliente === */}
      {risultato && (
        <div class="simlea__pdf">
          <h3 class="simlea__panel-title">Preventivo PDF per il cliente</h3>
          <p class="simlea__pdf-hint">
            Brandizzato MCF, senza il nome del partner finanziario e senza la provvigione. Compila i dati cliente per intestarlo.
          </p>
          <div class="simlea__row">
            <label class="simlea__field">
              <span class="simlea__field-label">Ragione sociale cliente</span>
              <input
                type="text"
                value={pdfClienteRs}
                onInput={(e) => setPdfClienteRs((e.currentTarget as HTMLInputElement).value)}
                placeholder="Es. Costruzioni Rossi SRL"
              />
            </label>
            <label class="simlea__field">
              <span class="simlea__field-label">Referente</span>
              <input
                type="text"
                value={pdfReferente}
                onInput={(e) => setPdfReferente((e.currentTarget as HTMLInputElement).value)}
                placeholder="Nome e cognome"
              />
            </label>
            <label class="simlea__field">
              <span class="simlea__field-label">Partita IVA</span>
              <input
                type="text"
                value={pdfClientePiva}
                onInput={(e) => setPdfClientePiva((e.currentTarget as HTMLInputElement).value)}
                placeholder="11 cifre"
              />
            </label>
          </div>
          <label class="simlea__pdf-toggle">
            <input
              type="checkbox"
              checked={pdfMostraTasso}
              onChange={(e) => setPdfMostraTasso((e.currentTarget as HTMLInputElement).checked)}
            />
            <span>Mostra il tasso del piano nel PDF ({pct(risultato.tassoEffettivo)})</span>
          </label>
          <button
            type="button"
            class="simlea__pdf-btn"
            disabled={generandoPdf}
            onClick={generaPDF}
          >
            {generandoPdf ? 'Generazione in corso…' : 'Scarica preventivo PDF'}
          </button>
        </div>
      )}
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
