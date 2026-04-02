import { useState, useMemo } from 'preact/hooks';
import './simulatore-fotovoltaico.css';

// --- Coefficienti GRENKE ESG++++ (fonte: Tabella ESG ++++.pdf) ---
const ESG_COEFFS: Record<number, { da: number; a: number; c: number }[]> = {
  24: [
    { da: 800, a: 4000, c: 4.520 },
    { da: 4001, a: 8000, c: 4.480 },
    { da: 8001, a: 12000, c: 4.440 },
    { da: 12001, a: 20000, c: 4.400 },
    { da: 20001, a: 40000, c: 4.360 },
    { da: 40001, a: 80000, c: 4.320 },
    { da: 80001, a: 160000, c: 4.280 },
    { da: 160001, a: 240000, c: 4.240 },
  ],
  36: [
    { da: 800, a: 4000, c: 3.124 },
    { da: 4001, a: 8000, c: 3.095 },
    { da: 8001, a: 12000, c: 3.066 },
    { da: 12001, a: 20000, c: 3.038 },
    { da: 20001, a: 40000, c: 3.167 },
    { da: 40001, a: 80000, c: 3.140 },
    { da: 80001, a: 160000, c: 3.113 },
    { da: 160001, a: 240000, c: 3.085 },
  ],
  48: [
    { da: 800, a: 4000, c: 2.428 },
    { da: 4001, a: 8000, c: 2.405 },
    { da: 8001, a: 12000, c: 2.382 },
    { da: 12001, a: 20000, c: 2.359 },
    { da: 20001, a: 40000, c: 2.455 },
    { da: 40001, a: 80000, c: 2.433 },
    { da: 80001, a: 160000, c: 2.411 },
    { da: 160001, a: 240000, c: 2.389 },
  ],
  60: [
    { da: 800, a: 4000, c: 2.015 },
    { da: 4001, a: 8000, c: 1.996 },
    { da: 8001, a: 12000, c: 1.977 },
    { da: 12001, a: 20000, c: 1.958 },
    { da: 20001, a: 40000, c: 2.032 },
    { da: 40001, a: 80000, c: 2.014 },
    { da: 80001, a: 160000, c: 1.996 },
    { da: 160001, a: 240000, c: 1.978 },
  ],
  72: [
    { da: 8001, a: 12000, c: 1.710 },
    { da: 12001, a: 20000, c: 1.693 },
    { da: 20001, a: 40000, c: 1.754 },
    { da: 40001, a: 80000, c: 1.737 },
    { da: 80001, a: 160000, c: 1.720 },
    { da: 160001, a: 240000, c: 1.703 },
  ],
  84: [
    { da: 40001, a: 80000, c: 1.535 },
    { da: 80001, a: 160000, c: 1.520 },
    { da: 160001, a: 240000, c: 1.505 },
  ],
};

// Costanti finanziarie
const INSURANCE_RATE = 0.0183; // 1,83% annuo (fotovoltaico)
// Riscatto per durata (fonte: Valori di Ripresa Grenke — "Altri Beni Strumentali" / Fotovoltaico)
const RISCATTO_PV: Record<number, number> = {
  24: 0.10,  // 10%
  36: 0.06,  // 6%
  48: 0.04,  // 4%
  60: 0.03,  // 3%
  72: 0.03,  // 3% (esteso)
  84: 0.03,  // 3% (esteso)
};

function getRiscatto(durata: number): number {
  return RISCATTO_PV[durata] ?? 0.03;
}

// Costanti energetiche
const ENERGY_PRICE = 0.25;    // €/kWh costo medio energia
const FEED_IN_PRICE = 0.05;   // €/kWh ritiro dedicato (stima conservativa)

// Irraggiamento medio per zona (kWh/kWp/anno — fonte PVGIS)
const IRRADIANCE: Record<string, number> = {
  nord: 1100,
  centro: 1275,
  sud: 1425,
  isole: 1525,
};

const ZONE_LABELS: Record<string, string> = {
  nord: 'Nord Italia',
  centro: 'Centro Italia',
  sud: 'Sud Italia',
  isole: 'Sicilia / Sardegna',
};

// Autoconsumo per tipo attivita (senza/con accumulo)
const SELF_CONSUMPTION: Record<string, { senza: number; con: number }> = {
  industriale: { senza: 0.60, con: 0.80 },
  commerciale: { senza: 0.47, con: 0.72 },
  residenziale: { senza: 0.37, con: 0.80 },
};

const ATTIVITA_LABELS: Record<string, string> = {
  industriale: 'Industriale / Artigianale',
  commerciale: 'Commerciale / Ufficio',
  residenziale: 'Residenziale',
};

const DURATE = [24, 36, 48, 60, 72, 84];

// Trova il coefficiente ESG per un importo e una durata
function getCoeff(importo: number, durata: number): number | null {
  const fasce = ESG_COEFFS[durata];
  if (!fasce) return null;
  const fascia = fasce.find((f) => importo >= f.da && importo <= f.a);
  return fascia ? fascia.c : null;
}

// Formatta in euro
function eur(n: number): string {
  return n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 });
}

// Interfaccia risultati per singola durata
interface RisultatoDurata {
  durata: number;
  coeff: number;
  canoneMensile: number;
  assicurazioneMensile: number;
  rataTotale: number;
  riscatto: number;
  riscattoPerc: number;
  // Solo modalita BP
  risparmioMensile?: number;
  differenza?: number;
}

export default function SimulatoreFotovoltaico() {
  // Modalita base vs business plan
  const [modalitaBP, setModalitaBP] = useState(false);

  // Campi sempre visibili
  const [costo, setCosto] = useState(0);
  const [costoInput, setCostoInput] = useState('');
  const [durata, setDurata] = useState(60);
  const [calcolato, setCalcolato] = useState(false);

  // Campi business plan (visibili solo con modalitaBP)
  const [potenza, setPotenza] = useState(6);
  const [potenzaInput, setPotenzaInput] = useState('6');
  const [accumulo, setAccumulo] = useState(0);
  const [accumuloInput, setAccumuloInput] = useState('');
  const [bolletta, setBolletta] = useState(250);
  const [bollettaInput, setBollettaInput] = useState('250');
  const [zona, setZona] = useState('nord');
  const [tipoAttivita, setTipoAttivita] = useState('commerciale');

  // Durate disponibili per l'importo corrente
  const durateDisponibili = useMemo(() => {
    return DURATE.filter((d) => getCoeff(Math.max(costo, 800), d) !== null);
  }, [costo]);

  // Se la durata selezionata non e' disponibile, resetta a 60
  useMemo(() => {
    if (durateDisponibili.length > 0 && !durateDisponibili.includes(durata)) {
      setDurata(durateDisponibili[durateDisponibili.length - 1]);
    }
  }, [durateDisponibili]);

  // Calcolo produzione e risparmio energetico (solo modalita BP)
  const energetica = useMemo(() => {
    if (!modalitaBP || potenza <= 0) return null;
    const produzioneAnnua = potenza * (IRRADIANCE[zona] ?? 1100);
    const autoconsumoPct = SELF_CONSUMPTION[tipoAttivita]?.[accumulo > 0 ? 'con' : 'senza'] ?? 0.47;
    const kwhAutoconsumo = produzioneAnnua * autoconsumoPct;
    const kwhImmissione = produzioneAnnua * (1 - autoconsumoPct);
    const risparmioAutoconsumo = kwhAutoconsumo * ENERGY_PRICE / 12;
    const valoreImmissione = kwhImmissione * FEED_IN_PRICE / 12;
    const risparmioMensile = risparmioAutoconsumo + valoreImmissione;

    return {
      produzioneAnnua,
      autoconsumoPct,
      kwhAutoconsumo,
      kwhImmissione,
      risparmioMensile,
    };
  }, [modalitaBP, potenza, accumulo, zona, tipoAttivita]);

  // Calcolo risultati per la durata selezionata
  const risultato = useMemo((): RisultatoDurata | null => {
    if (!calcolato || costo < 800 || costo > 240000) return null;
    const coeff = getCoeff(costo, durata);
    if (!coeff) return null;

    const canoneMensile = (costo * coeff) / 100;
    const assicurazioneMensile = (costo * INSURANCE_RATE) / 12;
    const rataTotale = canoneMensile + assicurazioneMensile;
    const riscattoPerc = getRiscatto(durata);
    const riscatto = costo * riscattoPerc;

    const res: RisultatoDurata = { durata, coeff, canoneMensile, assicurazioneMensile, rataTotale, riscatto, riscattoPerc };

    if (modalitaBP && energetica) {
      res.risparmioMensile = energetica.risparmioMensile;
      res.differenza = energetica.risparmioMensile - rataTotale;
    }
    return res;
  }, [calcolato, costo, durata, modalitaBP, energetica]);

  // Tabella comparativa per tutte le durate
  const tabelladurate = useMemo((): RisultatoDurata[] => {
    if (!calcolato || costo < 800 || costo > 240000) return [];
    return DURATE.map((d) => {
      const coeff = getCoeff(costo, d);
      if (!coeff) return null;
      const canoneMensile = (costo * coeff) / 100;
      const assicurazioneMensile = (costo * INSURANCE_RATE) / 12;
      const rataTotale = canoneMensile + assicurazioneMensile;
      const riscattoPerc = getRiscatto(d);
      const riscatto = costo * riscattoPerc;
      const res: RisultatoDurata = { durata: d, coeff, canoneMensile, assicurazioneMensile, rataTotale, riscatto, riscattoPerc };
      if (modalitaBP && energetica) {
        res.risparmioMensile = energetica.risparmioMensile;
        res.differenza = energetica.risparmioMensile - rataTotale;
      }
      return res;
    }).filter((r): r is RisultatoDurata => r !== null);
  }, [calcolato, costo, modalitaBP, energetica]);

  // Gestione input numerico generico
  const handleNumericInput = (
    setter: (v: number) => void,
    inputSetter: (v: string) => void,
    max: number,
  ) => (e: Event) => {
    const raw = (e.target as HTMLInputElement).value.replace(/[^\d]/g, '');
    inputSetter(raw);
    setCalcolato(false);
    const num = parseInt(raw, 10);
    if (!isNaN(num)) setter(Math.min(max, Math.max(0, num)));
  };

  const handleCostoBlur = () => {
    if (costo > 0) {
      const clamped = Math.min(240000, Math.max(800, costo));
      setCosto(clamped);
      setCostoInput(clamped.toString());
    }
  };

  // Gestione input potenza (ammette decimali)
  const handlePotenzaInput = (e: Event) => {
    const raw = (e.target as HTMLInputElement).value.replace(/[^\d.,]/g, '').replace(',', '.');
    setPotenzaInput(raw);
    setCalcolato(false);
    const num = parseFloat(raw);
    if (!isNaN(num)) setPotenza(Math.min(500, Math.max(0, num)));
  };

  // GTM tracking
  const pushCalcolo = () => {
    if (typeof window !== 'undefined' && (window as any).dataLayer) {
      (window as any).dataLayer.push({
        event: 'calcolo_eseguito',
        tool: 'simulatore_fotovoltaico',
        costo_impianto: costo,
        durata,
        modalita: modalitaBP ? 'business_plan' : 'base',
        rata_totale: risultato?.rataTotale,
        ...(modalitaBP ? { potenza_kwp: potenza, zona, tipo_attivita: tipoAttivita } : {}),
      });
    }
  };

  // Click "Calcola"
  const handleCalcola = () => {
    if (costo > 0) {
      const clamped = Math.min(240000, Math.max(800, costo));
      setCosto(clamped);
      setCostoInput(clamped.toString());
    }
    setCalcolato(true);
    pushCalcolo();
  };

  // State per il form contatti
  const [formNome, setFormNome] = useState('');
  const [formAzienda, setFormAzienda] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formTelefono, setFormTelefono] = useState('');
  const [formPrivacy, setFormPrivacy] = useState(false);
  const [formInvio, setFormInvio] = useState(false);

  // Invio form a Zapier
  const handleFormSubmit = async (e: Event) => {
    e.preventDefault();
    setFormInvio(true);

    // GTM
    if (typeof window !== 'undefined' && (window as any).dataLayer) {
      (window as any).dataLayer.push({
        event: 'form_inviato',
        tool: 'simulatore_fotovoltaico',
      });
    }

    const body = new FormData();
    body.append('tool', 'simulatore_fotovoltaico');
    body.append('nome', formNome);
    body.append('azienda', formAzienda);
    body.append('email', formEmail);
    body.append('telefono', formTelefono);
    body.append('valore_bene', costo.toString());
    body.append('durata_preferita', durata.toString());
    if (modalitaBP) {
      body.append('potenza_kwp', potenza.toString());
      body.append('accumulo_kwh', accumulo.toString());
      body.append('zona', zona);
      body.append('tipo_attivita', tipoAttivita);
      body.append('bolletta_mensile', bolletta.toString());
    }
    if (risultato) {
      body.append('rata_calcolata', risultato.rataTotale.toFixed(2));
      body.append('riscatto_perc', (risultato.riscattoPerc * 100).toFixed(0) + '%');
      body.append('riscatto_euro', risultato.riscatto.toFixed(2));
      if (risultato.risparmioMensile !== undefined) {
        body.append('risparmio_stimato', risultato.risparmioMensile.toFixed(2));
      }
      if (risultato.differenza !== undefined) {
        body.append('differenza_netta', risultato.differenza.toFixed(2));
      }
    }

    try {
      await fetch('https://hooks.zapier.com/hooks/catch/26268853/ul50ccv/', {
        method: 'POST',
        body,
      });
    } catch (_) {}
    window.location.href = '/grazie';
  };

  const costoValido = costo >= 800 && costo <= 240000;
  const formValido = formNome.trim() && formAzienda.trim() && formEmail.trim() && formTelefono.trim() && formPrivacy;

  return (
    <div class="simpv">
      {/* --- FORM --- */}
      <div class="simpv__form">
        {/* Costo impianto */}
        <div class="simpv__field">
          <label class="simpv__label" for="pv-costo">Costo impianto (€, netto IVA)</label>
          <input
            id="pv-costo"
            type="text"
            inputMode="numeric"
            class="simpv__input"
            value={costoInput}
            onInput={handleNumericInput(setCosto, setCostoInput, 240000)}
            onBlur={handleCostoBlur}
            placeholder="15000"
          />
          <span class="simpv__hint">Min €800 — Max €240.000</span>
        </div>

        {/* Durata — bottoni per selezione diretta */}
        <div class="simpv__field">
          <label class="simpv__label">Durata contratto</label>
          <div class="simpv__durate">
            {DURATE.map((d) => {
              const disponibile = durateDisponibili.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  class={`simpv__durata ${d === durata ? 'simpv__durata--active' : ''} ${!disponibile ? 'simpv__durata--disabled' : ''}`}
                  onClick={() => { if (disponibile) setDurata(d); }}
                  disabled={!disponibile}
                >
                  {d} mesi
                </button>
              );
            })}
          </div>
        </div>

        {/* Toggle business plan — card visibile */}
        <div class="simpv__toggle">
          <label class={`simpv__toggle-card ${modalitaBP ? 'simpv__toggle-card--active' : ''}`}>
            <span class="material-icons-outlined simpv__toggle-icon" aria-hidden="true">
              {modalitaBP ? 'check_circle' : 'bolt'}
            </span>
            <div class="simpv__toggle-content">
              <div class="simpv__toggle-title">Confronta con il risparmio in bolletta</div>
              <div class="simpv__toggle-desc">
                {modalitaBP ? 'Business plan attivo — compila i dati energetici qui sotto' : 'Attiva per calcolare produzione e risparmio'}
              </div>
            </div>
            <input
              type="checkbox"
              checked={modalitaBP}
              onChange={() => { setModalitaBP(!modalitaBP); setCalcolato(false); }}
            />
            <span class="simpv__toggle-switch" />
          </label>
        </div>

        {/* Campi business plan */}
        <div class={`simpv__bp-fields ${modalitaBP ? 'simpv__bp-fields--open' : ''}`}>
          <div class="simpv__field">
            <label class="simpv__label" for="pv-potenza">Potenza impianto (kWp)</label>
            <input
              id="pv-potenza"
              type="text"
              inputMode="decimal"
              class="simpv__input"
              value={potenzaInput}
              onInput={handlePotenzaInput}
              placeholder="6"
            />
          </div>

          <div class="simpv__field">
            <label class="simpv__label" for="pv-accumulo">Accumulo / Batteria (kWh)</label>
            <input
              id="pv-accumulo"
              type="text"
              inputMode="numeric"
              class="simpv__input"
              value={accumuloInput}
              onInput={handleNumericInput(setAccumulo, setAccumuloInput, 200)}
              placeholder="0 = senza batteria"
            />
          </div>

          <div class="simpv__field">
            <label class="simpv__label" for="pv-bolletta">Bolletta elettrica attuale (€/mese)</label>
            <input
              id="pv-bolletta"
              type="text"
              inputMode="numeric"
              class="simpv__input"
              value={bollettaInput}
              onInput={handleNumericInput(setBolletta, setBollettaInput, 50000)}
              placeholder="250"
            />
          </div>

          <div class="simpv__field">
            <label class="simpv__label" for="pv-zona">Zona geografica</label>
            <select
              id="pv-zona"
              class="simpv__select"
              value={zona}
              onChange={(e) => { setZona((e.target as HTMLSelectElement).value); setCalcolato(false); }}
            >
              {Object.entries(ZONE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          <div class="simpv__field">
            <label class="simpv__label" for="pv-attivita">Tipo di attività</label>
            <select
              id="pv-attivita"
              class="simpv__select"
              value={tipoAttivita}
              onChange={(e) => { setTipoAttivita((e.target as HTMLSelectElement).value); setCalcolato(false); }}
            >
              {Object.entries(ATTIVITA_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Bottone calcola */}
        <button
          type="button"
          class="simpv__button"
          onClick={handleCalcola}
          disabled={costo < 1}
        >
          Calcola preventivo
        </button>
      </div>

      {/* --- RISULTATI + FORM --- */}
      <div class="simpv__results">
        {risultato ? (
          <>
            <h3 class="simpv__results-title">Il tuo preventivo</h3>

            {/* Card rata principale */}
            <div class="simpv__card simpv__card--main">
              <span class="simpv__card-label">Rata mensile totale</span>
              <span class="simpv__card-value">{eur(risultato.rataTotale)}</span>
              <span class="simpv__card-detail">
                Canone {eur(risultato.canoneMensile)} + Assicurazione {eur(risultato.assicurazioneMensile)}
              </span>
            </div>

            {/* Card dettaglio */}
            <div class="simpv__card">
              <div class="simpv__card-row">
                <span>Riscatto finale ({Math.round(risultato.riscattoPerc * 100)}%)</span>
                <span>{eur(risultato.riscatto)}</span>
              </div>
            </div>

            {/* Card confronto bolletta (solo BP) */}
            {modalitaBP && energetica && risultato.differenza !== undefined && (
              <div class={`simpv__card simpv__card--confronto ${risultato.differenza >= 0 ? 'simpv__card--green' : 'simpv__card--red'}`}>
                <h4 class="simpv__card-heading">Confronto con la bolletta</h4>
                <div class="simpv__card-row">
                  <span>Bolletta attuale</span>
                  <span>{eur(bolletta)}/mese</span>
                </div>
                <div class="simpv__card-row">
                  <span>Risparmio energetico stimato</span>
                  <span>{eur(energetica.risparmioMensile)}/mese</span>
                </div>
                <div class="simpv__card-row">
                  <span>Rata noleggio</span>
                  <span>−{eur(risultato.rataTotale)}/mese</span>
                </div>
                <div class="simpv__card-row simpv__card-row--total">
                  <span>{risultato.differenza >= 0 ? 'Risparmio netto' : 'Costo netto'}</span>
                  <span class={risultato.differenza >= 0 ? 'simpv__green' : 'simpv__red'}>
                    {risultato.differenza >= 0 ? '+' : ''}{eur(risultato.differenza)}/mese
                  </span>
                </div>
              </div>
            )}

            {/* Card produzione (solo BP) */}
            {modalitaBP && energetica && (
              <div class="simpv__card simpv__card--produzione">
                <h4 class="simpv__card-heading">
                  <span class="material-icons-outlined simpv__icon-sun">wb_sunny</span>
                  Stima produzione
                </h4>
                <div class="simpv__card-row">
                  <span>Produzione annua</span>
                  <span>{Math.round(energetica.produzioneAnnua).toLocaleString('it-IT')} kWh</span>
                </div>
                <div class="simpv__card-row">
                  <span>Autoconsumo ({Math.round(energetica.autoconsumoPct * 100)}%)</span>
                  <span>{Math.round(energetica.kwhAutoconsumo).toLocaleString('it-IT')} kWh</span>
                </div>
                <div class="simpv__card-row">
                  <span>Immissione in rete</span>
                  <span>{Math.round(energetica.kwhImmissione).toLocaleString('it-IT')} kWh</span>
                </div>
              </div>
            )}

            {/* Tabella comparativa durate */}
            {tabelladurate.length > 1 && (
              <div class="simpv__table-wrap">
                <h4 class="simpv__card-heading">Confronto durate</h4>
                <div class="simpv__table-scroll">
                  <table class="simpv__table">
                    <thead>
                      <tr>
                        <th>Durata</th>
                        <th>Rata mensile</th>
                        <th>Riscatto</th>
                        {modalitaBP && <th>Risparmio</th>}
                        {modalitaBP && <th>Differenza</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {tabelladurate.map((r) => (
                        <tr
                          key={r.durata}
                          class={`simpv__table-row ${r.durata === durata ? 'simpv__table-active' : ''}`}
                          onClick={() => setDurata(r.durata)}
                        >
                          <td>{r.durata} mesi</td>
                          <td>{eur(r.rataTotale)}</td>
                          <td>{Math.round(r.riscattoPerc * 100)}%</td>
                          {modalitaBP && r.risparmioMensile !== undefined && (
                            <td>{eur(r.risparmioMensile)}</td>
                          )}
                          {modalitaBP && r.differenza !== undefined && (
                            <td class={r.differenza >= 0 ? 'simpv__green' : 'simpv__red'}>
                              {r.differenza >= 0 ? '+' : ''}{eur(r.differenza)}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Note */}
            <div class="simpv__note">
              <p>* Coefficienti indicativi per noleggio operativo fotovoltaico. Il preventivo definitivo dipende dalla società di locazione selezionata.</p>
              <p>* Assicurazione all-risk obbligatoria inclusa nel calcolo (1,83% annuo).</p>
              <p>* Riscatto finale variabile per durata: dal 3% (60+ mesi) al 10% (24 mesi).</p>
              {modalitaBP && (
                <p>* La produzione e il risparmio sono stime basate su dati medi PVGIS. I valori reali dipendono da orientamento, inclinazione, ombreggiamenti e consumi effettivi.</p>
              )}
            </div>
          </>
        ) : calcolato && !costoValido ? (
          <div class="simpv__message">
            <span class="material-icons-outlined simpv__message-icon">warning</span>
            <p>Il costo dell'impianto deve essere compreso tra <strong>€800</strong> e <strong>€240.000</strong>.</p>
          </div>
        ) : calcolato && !risultato ? (
          <div class="simpv__message">
            <span class="material-icons-outlined simpv__message-icon">info</span>
            <p>Per l'importo e la durata selezionati non è disponibile un coefficiente. Prova con una durata diversa.</p>
          </div>
        ) : (
          <div class="simpv__message">
            <span class="material-icons-outlined simpv__message-icon">edit</span>
            <p>Compila i campi e premi <strong>Calcola preventivo</strong> per vedere il risultato.</p>
          </div>
        )}

      </div>

      {/* --- FORM SCARICA PDF — fascia a larghezza piena sotto la griglia --- */}
      <div class="simpv__lead-bar" id="contatti">
        <div class="simpv__lead-bar-info">
          <span class="material-icons-outlined simpv__lead-icon" aria-hidden="true">picture_as_pdf</span>
          <div>
            <h4 class="simpv__lead-title">Scarica il Preventivo PDF</h4>
            <p class="simpv__lead-sub">
              PDF personalizzato con il nome della tua azienda, pronto da inviare al cliente.
            </p>
          </div>
        </div>
        <form class="simpv__lead-bar-form" onSubmit={handleFormSubmit}>
          <div class="simpv__lead-bar-fields">
            <input
              type="text"
              class="simpv__input"
              placeholder="Nome e Cognome"
              value={formNome}
              onInput={(e) => setFormNome((e.target as HTMLInputElement).value)}
              required
            />
            <input
              type="text"
              class="simpv__input"
              placeholder="Nome Azienda"
              value={formAzienda}
              onInput={(e) => setFormAzienda((e.target as HTMLInputElement).value)}
              required
            />
            <input
              type="email"
              class="simpv__input"
              placeholder="Email"
              value={formEmail}
              onInput={(e) => setFormEmail((e.target as HTMLInputElement).value)}
              required
            />
            <input
              type="tel"
              class="simpv__input"
              placeholder="Cellulare"
              value={formTelefono}
              onInput={(e) => setFormTelefono((e.target as HTMLInputElement).value)}
              required
            />
          </div>
          <div class="simpv__lead-bar-actions">
            <label class="simpv__privacy">
              <input
                type="checkbox"
                checked={formPrivacy}
                onChange={() => setFormPrivacy(!formPrivacy)}
              />
              <span>Ho letto e accetto l'<a href="/privacy" target="_blank">informativa privacy</a></span>
            </label>
            <button
              type="submit"
              class="simpv__button simpv__button--cta"
              disabled={!formValido || formInvio}
            >
              {formInvio ? 'Invio in corso…' : 'Scarica Preventivo PDF'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
