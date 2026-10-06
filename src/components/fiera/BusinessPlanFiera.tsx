import { useState, useEffect, useRef } from 'preact/hooks';
import { getEsgCoeff, ESG_DURATE, ESG_MIN, ESG_MAX } from '../../data/esg';
import { eur, RISCATTI } from '../../data/grenke';
import { calcolaBilancioEnergetico, ZONE_LABELS, VITA_UTILE_ANNI } from '../../data/bp-fotovoltaico';
import VerificaCliente from './VerificaCliente';

// Business plan fotovoltaico della pagina /fiera: il canone del noleggio contro
// quello che il cliente spende oggi di energia.
//
// Nessun numero nuovo: canone dalla tabella Grenke ESG++++ (src/data/esg.ts, con
// le durate lunghe solo dove la tabella le prevede: 72 mesi da 8.001 euro, 84 da
// 40.001), bilancio energetico dal modello condiviso di Arca Energia ed Econocom
// PA (src/data/bp-fotovoltaico.ts). Qui c'e' solo il confronto.
//
// Il conto: spesa di domani = bolletta che resta + canone - energia ceduta in rete.
// La deducibilita' del canone non entra nel conto: il confronto regge senza.
//
// E il dopo: finito il noleggio si riscatta l'impianto (riscatti fotovoltaico di
// src/data/grenke.ts) e da li' il risparmio e' tutto del cliente fino a fine vita
// utile (VITA_UTILE_ANNI). Anche quando nei mesi del noleggio si spende un po' di
// piu', il saldo sulla vita dell'impianto e' quello che fa capire l'operazione.
//
// Gli stili stanno nel blocco inline di FieraLayout: nessun CSS in piu' da scaricare.

const PROFILI: Record<string, string> = {
  commerciale: 'Commerciale / uffici',
  industriale: 'Industriale / artigianale',
  ricettivo: 'Hotel / ristorazione',
};

const cifre = (v: string, max = 7) => v.replace(/\D/g, '').slice(0, max);
const migliaia = (n: number) => n.toLocaleString('it-IT', { useGrouping: 'always' } as Intl.NumberFormatOptions);
const tondo = (n: number) => eur(Math.round(n)).replace(/,00\s/, ' ');

function campo(id: string, valore: string) {
  const el = document.getElementById(id) as HTMLInputElement | null;
  if (el) el.value = valore;
}

/** Input numerico con le migliaia separate: lo stato tiene solo cifre */
function Numero(p: { id: string; label: string; unita: string; valore: string; onValore: (v: string) => void; esempio: string }) {
  return (
    <div class="campo">
      <label for={p.id}>{p.label}</label>
      <div class="simf__euro">
        <input
          type="text"
          id={p.id}
          inputmode="numeric"
          autocomplete="off"
          placeholder={p.esempio}
          value={p.valore ? migliaia(Number(p.valore)) : ''}
          onInput={(e: Event) => p.onValore(cifre((e.target as HTMLInputElement).value))}
        />
        <span aria-hidden="true">{p.unita}</span>
      </div>
    </div>
  );
}

export default function BusinessPlanFiera() {
  const [pronto, setPronto] = useState(false);
  const [importoT, setImportoT] = useState('');
  const [kwpT, setKwpT] = useState('');
  const [bollettaT, setBollettaT] = useState('');
  const [accumuloT, setAccumuloT] = useState('');
  const [zona, setZona] = useState('nord');
  const [profilo, setProfilo] = useState('commerciale');
  const [durata, setDurata] = useState<number | null>(null);
  const tracciato = useRef(false);

  useEffect(() => setPronto(true), []);

  // La lettura della bolletta (quando c'e') riempie questo campo: resta modificabile
  useEffect(() => {
    const da = (e: Event) => {
      const v = (e as CustomEvent).detail?.bollettaMese;
      if (Number.isFinite(v) && v > 0) setBollettaT(String(Math.round(v)));
    };
    window.addEventListener('fiera:bolletta', da);
    return () => window.removeEventListener('fiera:bolletta', da);
  }, []);

  const importo = Number(importoT) || 0;
  const kwp = Number(kwpT) || 0;
  const bolletta = Number(bollettaT) || 0;
  const accumulo = Number(accumuloT) || 0;

  const disponibili = ESG_DURATE.filter((d) => importo && getEsgCoeff(importo, d) != null);
  const bilancio = kwp && bolletta ? calcolaBilancioEnergetico(kwp, accumulo, zona, profilo, bolletta) : null;

  // Il conto per ogni durata disponibile
  const conti = disponibili.map((d) => {
    const canone = (importo * (getEsgCoeff(importo, d) ?? 0)) / 100;
    if (!bilancio) return { durata: d, canone, residua: null, domani: null, differenza: null };
    const residua = Math.max(0, bolletta - bilancio.risparmioAutoconsumoMensile);
    const domani = residua + canone - bilancio.valoreImmissioneMensile;
    return { durata: d, canone, residua, domani, differenza: bolletta - domani };
  });

  // Durata consigliata: la piu' corta in cui si spende gia' meno di oggi,
  // altrimenti la piu' lunga disponibile
  const consigliata =
    conti.find((c) => c.differenza != null && c.differenza >= 0)?.durata ?? disponibili[disponibili.length - 1] ?? null;
  const scelta = durata != null && disponibili.includes(durata) ? durata : consigliata;
  const conto = conti.find((c) => c.durata === scelta) ?? null;

  let avviso = '';
  if (importo && importo < ESG_MIN) avviso = `Il noleggio parte da ${eur(ESG_MIN)}.`;
  else if (importo > ESG_MAX) avviso = `Oltre ${eur(ESG_MAX)} si quota su misura: scrivimi qui sotto.`;

  // Dopo il noleggio: riscatto, poi il risparmio resta tutto al cliente
  const dopo =
    conto && conto.differenza != null && bilancio
      ? (() => {
          const riscattoPct = RISCATTI.Fotovoltaico[conto.durata] ?? 0;
          const riscatto = (importo * riscattoPct) / 100;
          const beneficioAnno = bilancio.risparmioMensileTotale * 12;
          const anniDopo = Math.max(0, VITA_UTILE_ANNI - conto.durata / 12);
          const noleggio = conto.differenza * conto.durata;
          const saldo = noleggio - riscatto + beneficioAnno * anniDopo;
          return { riscattoPct, riscatto, beneficioAnno, anniDopo, saldo };
        })()
      : null;

  useEffect(() => {
    if (!conto) return;
    campo('sim_importo', String(importo));
    campo('sim_durata', String(conto.durata));
    campo(
      'simulazione',
      [
        `impianto ${migliaia(importo)} €`,
        kwp ? `${kwp} kWp` : '',
        accumulo ? `accumulo ${accumulo} kWh` : '',
        `canone ${eur(conto.canone)} a ${conto.durata} mesi`,
        bolletta ? `bolletta ${migliaia(bolletta)} €/mese` : '',
        conto.domani != null ? `dopo ${tondo(conto.domani)}/mese` : '',
        dopo ? `saldo ${VITA_UTILE_ANNI} anni ${dopo.saldo >= 0 ? '+' : '-'}${tondo(Math.abs(dopo.saldo))}` : '',
        `${ZONE_LABELS[zona]}, ${PROFILI[profilo]}`,
      ].filter(Boolean).join(' · '),
    );
    if (!tracciato.current) {
      tracciato.current = true;
      const dl = (window as any).dataLayer;
      if (dl && typeof dl.push === 'function') {
        try { dl.push({ event: 'fiera_simulazione', importo, durata: conto.durata }); } catch { /* mai bloccare */ }
      }
    }
  }, [conto?.canone, conto?.domani, dopo?.saldo, zona, profilo, accumulo, kwp]);

  // Le barre misurano le cifre scritte accanto: la seconda e' bolletta che resta
  // piu' canone al netto dell'energia ceduta, cioe' esattamente la spesa di domani
  const canoneNetto = conto && bilancio ? Math.max(0, conto.canone - bilancio.valoreImmissioneMensile) : 0;
  const scala = conto?.domani != null ? Math.max(bolletta, conto.domani, 1) : 1;
  const w = (n: number) => `${Math.max(0, (n / scala) * 100)}%`;

  return (
    <section class="simf card" data-pronto={pronto ? '1' : undefined} aria-labelledby="bpf-titolo">
      <h2 id="bpf-titolo">Canone contro bolletta</h2>
      <div class="simf__area">
        <p class="simf__ripiego">Il business plan si sta caricando. Se non compare, scrivimi i dati dell'impianto nel modulo qui sotto.</p>

        <div class="simf__corpo">
          <Numero id="bpf-importo" label="Prezzo dell'impianto, IVA esclusa" unita="€" esempio="es. 45.000" valore={importoT} onValore={setImportoT} />
          <Numero id="bpf-kwp" label="Potenza dell'impianto" unita="kWp" esempio="es. 50" valore={kwpT} onValore={(v) => setKwpT(cifre(v, 4))} />
          <Numero id="bpf-bolletta" label="Spesa per l'energia oggi, al mese" unita="€" esempio="es. 1.500" valore={bollettaT} onValore={(v) => setBollettaT(cifre(v, 6))} />

          <details class="simf__dettagli">
            <summary>Accumulo, zona e tipo di consumo</summary>
            <div class="simf__griglia">
              <div class="campo">
                <label for="bpf-zona">Zona</label>
                <select id="bpf-zona" value={zona} onChange={(e: Event) => setZona((e.target as HTMLSelectElement).value)}>
                  {Object.entries(ZONE_LABELS).map(([k, v]) => <option value={k}>{v}</option>)}
                </select>
              </div>
              <div class="campo">
                <label for="bpf-profilo">Consumi</label>
                <select id="bpf-profilo" value={profilo} onChange={(e: Event) => setProfilo((e.target as HTMLSelectElement).value)}>
                  {Object.entries(PROFILI).map(([k, v]) => <option value={k}>{v}</option>)}
                </select>
              </div>
            </div>
            <Numero id="bpf-accumulo" label="Accumulo (se c'è)" unita="kWh" esempio="0" valore={accumuloT} onValore={(v) => setAccumuloT(cifre(v, 4))} />
          </details>

          {disponibili.length > 0 && (
            <div class="campo">
              <span class="simf__etichetta" id="bpf-durata">Durata</span>
              <div class="simf__durate sei" role="radiogroup" aria-labelledby="bpf-durata">
                {ESG_DURATE.map((d) => (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={d === scelta}
                    class={d === scelta ? 'on' : ''}
                    disabled={!disponibili.includes(d)}
                    onClick={() => setDurata(d)}
                  >
                    {d} mesi
                  </button>
                ))}
              </div>
            </div>
          )}

          {conto && conto.domani == null && (
            <div class="simf__esito" aria-live="polite">
              <span class="simf__cifra">{eur(conto.canone)}</span>
              <span class="simf__unita">di canone al mese + IVA, per {conto.durata} mesi. Aggiungi potenza e bolletta per il confronto.</span>
            </div>
          )}

          {conto && conto.domani != null && bilancio && (
            <div class="bpf__confronto" aria-live="polite">
              <p class="bpf__titolo">Al mese, IVA esclusa, con {conto.durata} mesi di noleggio</p>

              <div class="bpf__barra">
                <div class="bpf__barra-testa"><span>Oggi, solo energia</span><b>{tondo(bolletta)}</b></div>
                <div class="bpf__traccia"><span class="bpf__oggi" style={{ width: w(bolletta) }} /></div>
              </div>
              <div class="bpf__barra">
                <div class="bpf__barra-testa"><span>Con l'impianto</span><b>{tondo(conto.domani)}</b></div>
                <div class="bpf__traccia">
                  <span class="bpf__residua" style={{ width: w(conto.residua ?? 0) }} />
                  <span class="bpf__canone" style={{ width: w(canoneNetto) }} />
                </div>
                <p class="bpf__legenda">
                  <span><i class="bpf__residua" />bolletta che resta {tondo(conto.residua ?? 0)}</span>
                  <span><i class="bpf__canone" />canone {eur(conto.canone)}</span>
                  <span>meno {tondo(bilancio.valoreImmissioneMensile)} di energia ceduta</span>
                </p>
              </div>

              <div class="bpf__esito">
                <span class={`bpf__cifra ${conto.differenza! >= 0 ? 'pos' : 'neg'}`}>
                  {conto.differenza! >= 0 ? `${tondo(conto.differenza!)} in meno` : `${tondo(-conto.differenza!)} in più`}
                </span>
                <span class="bpf__frase">
                  {conto.differenza! >= 0
                    ? `al mese rispetto a oggi, dal primo canone.`
                    : `al mese per ${conto.durata} mesi: è lo sforzo del noleggio. Poi l'impianto diventa tuo, e da quel momento in poi è tutto guadagno.`}
                </span>
              </div>

              {dopo && (
                <div class="bpf__dopo">
                  <p class="bpf__dopo-testa">Finito il noleggio</p>
                  <p class="bpf__dopo-riga">
                    Riscatti l'impianto con {dopo.riscattoPct}% del prezzo, {tondo(dopo.riscatto)}, e il canone sparisce.
                    Quello che l'impianto ti fa risparmiare resta tutto tuo: {tondo(bilancio.risparmioMensileTotale)} al mese,{' '}
                    {tondo(dopo.beneficioAnno)} l'anno.
                  </p>
                  <span class={`bpf__cifra ${dopo.saldo >= 0 ? 'pos' : 'neg'}`}>
                    {dopo.saldo >= 0 ? `+${tondo(dopo.saldo)}` : `−${tondo(-dopo.saldo)}`}
                  </span>
                  <span class="bpf__frase">
                    in {VITA_UTILE_ANNI} anni rispetto a restare in bolletta, riscatto compreso.
                  </span>
                </div>
              )}
            </div>
          )}

          {conto && bilancio && (
            <dl class="bpf__numeri">
              <div><dt>Produzione in un anno</dt><dd>{migliaia(Math.round(bilancio.produzioneAnnua))} kWh</dd></div>
              <div><dt>Consumi coperti dall'impianto</dt><dd>{Math.round(bilancio.autosufficienzaPerc * 100)}%</dd></div>
              <div><dt>Risparmio in bolletta</dt><dd>{tondo(bilancio.risparmioAutoconsumoMensile)}/mese</dd></div>
              <div><dt>Canone</dt><dd>{eur(conto.canone)}/mese</dd></div>
            </dl>
          )}

          {avviso && <p class="simf__avviso">{avviso}</p>}
          <p class="simf__nota">
            Stima indicativa, non è un'offerta. Canone da tabella di noleggio operativo, energia a {migliaia(Math.round((bilancio?.prezzoKwh ?? 0.28) * 100))} centesimi al kWh, irraggiamento {ZONE_LABELS[zona]}, {VITA_UTILE_ANNI} anni di vita utile. La deducibilità del canone non è nel conto.
          </p>
        </div>
      </div>

      {pronto && <VerificaCliente importo={importo || null} />}
    </section>
  );
}
