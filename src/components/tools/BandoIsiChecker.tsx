import { useState, useMemo } from 'preact/hooks';
import './bando-isi-checker.css';

// Tipologie
type Asse = '1.1' | '1.2' | '2' | '3' | '4' | '5.1' | '5.2';
type Dimensione = 'micro' | 'piccola' | 'media' | 'grande';

// Configurazione assi del Bando ISI
interface AsseConfig {
  value: Asse;
  label: string;
  desc: string;
  icon: string;
  percentuale: number;
  richiedeDimensione: boolean;
  soloMicroPiccola: boolean;
  richiedeSettore: boolean;
  richiedeEta: boolean;
  richiedeDipendenti: boolean;
  interventoAggiuntivo: boolean;
}

const ASSI: AsseConfig[] = [
  {
    value: '1.1',
    label: 'Asse 1.1 — Rischi tecnopatologici',
    desc: 'Rumore, vibrazioni, agenti chimici, ergonomia',
    icon: 'hearing',
    percentuale: 65,
    richiedeDimensione: false,
    soloMicroPiccola: false,
    richiedeSettore: false,
    richiedeEta: false,
    richiedeDipendenti: false,
    interventoAggiuntivo: true,
  },
  {
    value: '1.2',
    label: 'Asse 1.2 — Modelli organizzativi',
    desc: 'ISO 45001, SGSL, MOG art. 30 D.Lgs. 81/2008',
    icon: 'verified',
    percentuale: 80,
    richiedeDimensione: false,
    soloMicroPiccola: false,
    richiedeSettore: false,
    richiedeEta: false,
    richiedeDipendenti: true,
    interventoAggiuntivo: false,
  },
  {
    value: '2',
    label: 'Asse 2 — Rischi infortunistici',
    desc: 'Sostituzione macchine, protezioni, anticaduta',
    icon: 'engineering',
    percentuale: 65,
    richiedeDimensione: false,
    soloMicroPiccola: false,
    richiedeSettore: false,
    richiedeEta: false,
    richiedeDipendenti: false,
    interventoAggiuntivo: true,
  },
  {
    value: '3',
    label: 'Asse 3 — Bonifica amianto',
    desc: 'Rimozione e smaltimento materiali con amianto',
    icon: 'delete_sweep',
    percentuale: 65,
    richiedeDimensione: false,
    soloMicroPiccola: false,
    richiedeSettore: false,
    richiedeEta: false,
    richiedeDipendenti: false,
    interventoAggiuntivo: true,
  },
  {
    value: '4',
    label: 'Asse 4 — Micro/piccole imprese',
    desc: 'Settori specifici: ospitalita\', tessile, pesca, manifatturiero',
    icon: 'storefront',
    percentuale: 65,
    richiedeDimensione: true,
    soloMicroPiccola: true,
    richiedeSettore: true,
    richiedeEta: false,
    richiedeDipendenti: false,
    interventoAggiuntivo: true,
  },
  {
    value: '5.1',
    label: 'Asse 5.1 — Imprese agricole',
    desc: 'Trattori e macchine agricole/forestali',
    icon: 'agriculture',
    percentuale: 65,
    richiedeDimensione: true,
    soloMicroPiccola: true,
    richiedeSettore: false,
    richiedeEta: false,
    richiedeDipendenti: false,
    interventoAggiuntivo: false,
  },
  {
    value: '5.2',
    label: 'Asse 5.2 — Giovani agricoltori',
    desc: 'Come Asse 5.1 ma per titolari under 40',
    icon: 'agriculture',
    percentuale: 80,
    richiedeDimensione: true,
    soloMicroPiccola: true,
    richiedeSettore: false,
    richiedeEta: true,
    richiedeDipendenti: false,
    interventoAggiuntivo: false,
  },
];

const DIMENSIONI: { value: Dimensione; label: string; hint: string }[] = [
  { value: 'micro', label: 'Microimpresa', hint: '< 10 dipendenti, fatturato < 2M \u20ac' },
  { value: 'piccola', label: 'Piccola impresa', hint: '< 50 dipendenti, fatturato < 10M \u20ac' },
  { value: 'media', label: 'Media impresa', hint: '< 250 dipendenti, fatturato < 50M \u20ac' },
  { value: 'grande', label: 'Grande impresa', hint: '\u2265 250 dipendenti' },
];

// Contributo minimo e massimo
const CONTRIBUTO_MIN = 5_000;
const CONTRIBUTO_MAX = 130_000;

// Risultato della verifica
interface RisultatoISI {
  eleggibile: boolean;
  motivo?: string;
  suggerimento?: string;
  percentuale: number;
  contributoBase: number;
  costoNetto: number;
  interventoAggiuntivoPossibile: boolean;
}

// Calcolo contributo ISI
function calcolaContributoISI(
  asse: AsseConfig,
  dimensione: Dimensione | null,
  settoreSpecifico: boolean | null,
  etaUnder40: boolean | null,
  dipendendiSotto50: boolean | null,
  importo: number,
): RisultatoISI {
  // Verifica dimensione per assi che la richiedono
  if (asse.soloMicroPiccola && (dimensione === 'media' || dimensione === 'grande')) {
    const nomeAsse = asse.value.startsWith('5') ? 'L\'Asse 5' : 'L\'Asse 4';
    const tipo = asse.value.startsWith('5')
      ? 'micro e piccole imprese agricole'
      : 'micro e piccole imprese in settori specifici';
    return {
      eleggibile: false,
      motivo: `${nomeAsse} e\' riservato a ${tipo}.`,
      suggerimento: 'Le imprese di dimensioni maggiori possono valutare gli Assi 1, 2 o 3.',
      percentuale: asse.percentuale,
      contributoBase: 0,
      costoNetto: importo,
      interventoAggiuntivoPossibile: false,
    };
  }

  // Verifica settore per asse 4
  if (asse.richiedeSettore && settoreSpecifico === false) {
    return {
      eleggibile: false,
      motivo: 'L\'Asse 4 e\' riservato a imprese in settori specifici (ospitalita\', tessile, pesca, manifatturiero).',
      suggerimento: 'Se il tuo investimento riguarda la sicurezza sul lavoro, verifica gli Assi 1, 2 o 3.',
      percentuale: asse.percentuale,
      contributoBase: 0,
      costoNetto: importo,
      interventoAggiuntivoPossibile: false,
    };
  }

  // Verifica eta' per asse 5.2
  if (asse.richiedeEta && etaUnder40 === false) {
    return {
      eleggibile: false,
      motivo: 'L\'Asse 5.2 e\' riservato a giovani agricoltori con titolare under 40.',
      suggerimento: 'Puoi verificare l\'Asse 5.1 che ha gli stessi requisiti senza vincolo di eta\' (contributo al 65%).',
      percentuale: asse.percentuale,
      contributoBase: 0,
      costoNetto: importo,
      interventoAggiuntivoPossibile: false,
    };
  }

  // Calcolo contributo
  const contributoBase = Math.min(importo * (asse.percentuale / 100), CONTRIBUTO_MAX);

  // Verifica contributo minimo (eccezione Asse 1.2 con <50 dipendenti)
  const esenteMinimo = asse.value === '1.2' && dipendendiSotto50 === true;
  if (!esenteMinimo && contributoBase < CONTRIBUTO_MIN) {
    const investimentoMinimo = Math.ceil(CONTRIBUTO_MIN / (asse.percentuale / 100));
    return {
      eleggibile: false,
      motivo: `Investimento troppo basso. Il contributo minimo e\' di ${eur(CONTRIBUTO_MIN)}.`,
      suggerimento: `Per questo asse, l'investimento minimo deve essere di almeno ${eur(investimentoMinimo)} (IVA esclusa).`,
      percentuale: asse.percentuale,
      contributoBase,
      costoNetto: importo,
      interventoAggiuntivoPossibile: false,
    };
  }

  return {
    eleggibile: true,
    percentuale: asse.percentuale,
    contributoBase,
    costoNetto: importo - contributoBase,
    interventoAggiuntivoPossibile: asse.interventoAggiuntivo,
  };
}

function eur(n: number): string {
  return n.toLocaleString('it-IT', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  });
}

export default function BandoIsiChecker() {
  // Stato selezione asse
  const [asseId, setAsseId] = useState<Asse | null>(null);

  // Stato domande di qualificazione
  const [dimensione, setDimensione] = useState<Dimensione | null>(null);
  const [settoreSpecifico, setSettoreSpecifico] = useState<boolean | null>(null);
  const [etaUnder40, setEtaUnder40] = useState<boolean | null>(null);
  const [dipendentiSotto50, setDipendentiSotto50] = useState<boolean | null>(null);

  // Stato importo
  const [importoInput, setImportoInput] = useState('');
  const [importo, setImporto] = useState(0);
  const [calcolato, setCalcolato] = useState(false);

  // Form contatto
  const [formNome, setFormNome] = useState('');
  const [formTelefono, setFormTelefono] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formInvio, setFormInvio] = useState(false);
  const [formInviato, setFormInviato] = useState(false);

  // Configurazione asse selezionato
  const asseConfig = useMemo(
    () => ASSI.find((a) => a.value === asseId) ?? null,
    [asseId],
  );

  // Verifica se le domande di qualificazione sono complete
  const qualificazioneCompleta = useMemo(() => {
    if (!asseConfig) return false;
    if (asseConfig.richiedeDimensione && dimensione === null) return false;
    if (asseConfig.richiedeSettore && settoreSpecifico === null) return false;
    if (asseConfig.richiedeEta && etaUnder40 === null) return false;
    if (asseConfig.richiedeDipendenti && dipendentiSotto50 === null) return false;
    return true;
  }, [asseConfig, dimensione, settoreSpecifico, etaUnder40, dipendentiSotto50]);

  const valido = importo > 0 && qualificazioneCompleta;

  // Calcolo risultato
  const risultato = useMemo(() => {
    if (!asseConfig || !valido) return null;
    return calcolaContributoISI(
      asseConfig,
      dimensione,
      settoreSpecifico,
      etaUnder40,
      dipendentiSotto50,
      importo,
    );
  }, [asseConfig, dimensione, settoreSpecifico, etaUnder40, dipendentiSotto50, importo, valido]);

  // Reset qualificazione quando cambia l'asse
  const handleAsseChange = (value: Asse) => {
    setAsseId(value);
    setDimensione(null);
    setSettoreSpecifico(null);
    setEtaUnder40(null);
    setDipendentiSotto50(null);
    setCalcolato(false);
  };

  const handleImportoChange = (e: Event) => {
    const raw = (e.target as HTMLInputElement).value.replace(/[^\d]/g, '');
    setImportoInput(raw);
    setCalcolato(false);
    const num = parseInt(raw, 10);
    setImporto(isNaN(num) ? 0 : num);
  };

  // GTM tracking
  const pushCheck = () => {
    if (typeof window !== 'undefined' && (window as any).dataLayer) {
      (window as any).dataLayer.push({
        event: 'lp_bando_isi_check',
        landing: 'bando-isi-inail',
        tool: 'bando_isi_checker',
        asse: asseId,
        dimensione_impresa: dimensione,
        importo_investimento: importo,
        percentuale_copertura: risultato?.percentuale,
        contributo_stimato: risultato?.contributoBase,
        eleggibile: risultato?.eleggibile,
      });
    }
  };

  const handleVerifica = () => {
    setCalcolato(true);
    setTimeout(pushCheck, 0);
  };

  const handleFormSubmit = async (e: Event) => {
    e.preventDefault();
    if (formInvio) return;
    setFormInvio(true);

    if (typeof window !== 'undefined' && (window as any).dataLayer) {
      (window as any).dataLayer.push({
        event: 'lp_bando_isi_submit',
        landing: 'bando-isi-inail',
        tool: 'bando_isi_checker',
      });
    }

    const body = new FormData();
    body.append('tool', 'bando_isi_checker');
    body.append('landing', 'bando-isi-inail');
    body.append('fonte', 'bando-isi-inail');
    body.append('nome', formNome);
    body.append('telefono', formTelefono);
    body.append('email', formEmail);
    if (asseId) body.append('asse_isi', asseId);
    if (dimensione) body.append('dimensione_impresa', dimensione);
    body.append('importo_investimento', importo.toString());
    if (risultato) {
      body.append('percentuale_copertura', risultato.percentuale.toString());
      body.append('contributo_stimato', risultato.contributoBase.toFixed(0));
      body.append('costo_netto_stimato', risultato.costoNetto.toFixed(0));
    }

    try {
      await fetch('/api/submit', { method: 'POST', body });
      setFormInviato(true);
      setTimeout(() => {
        window.location.href = '/grazie-fin';
      }, 800);
    } catch (_) {
      setFormInvio(false);
    }
  };

  // Verifica se servono domande di qualificazione per l'asse selezionato
  const servonoDomande = asseConfig && (
    asseConfig.richiedeDimensione ||
    asseConfig.richiedeSettore ||
    asseConfig.richiedeEta ||
    asseConfig.richiedeDipendenti
  );

  return (
    <div class="isi-check">
      {/* === SELEZIONE ASSE === */}
      <div class="isi-check__form">
        <h3 class="isi-check__form-title">Verifica se il tuo progetto rientra nel Bando ISI</h3>
        <p class="isi-check__form-sub">
          Seleziona l'asse di finanziamento, rispondi a poche domande
          e scopri subito se il tuo investimento e' agevolabile.
        </p>

        <div class="isi-check__field">
          <label class="isi-check__label">Su quale asse vuoi investire?</label>
          <div class="isi-check__axis-grid">
            {ASSI.map((a) => (
              <button
                type="button"
                class={`isi-check__axis-card ${asseId === a.value ? 'is-active' : ''}`}
                onClick={() => handleAsseChange(a.value)}
              >
                <span class="isi-check__axis-badge">{a.percentuale}%</span>
                <div class="isi-check__axis-head">
                  <span class="material-icons-outlined">{a.icon}</span>
                  <span class="isi-check__axis-name">{a.label}</span>
                </div>
                <span class="isi-check__axis-desc">{a.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* === DOMANDE DI QUALIFICAZIONE === */}
        {asseConfig && servonoDomande && (
          <div class="isi-check__qualify">
            <p class="isi-check__qualify-title">Qualche dato sulla tua impresa</p>

            {/* Dimensione impresa */}
            {asseConfig.richiedeDimensione && (
              <div class="isi-check__field">
                <label class="isi-check__label">Dimensione impresa</label>
                <div class="isi-check__radio">
                  {DIMENSIONI.map((d) => (
                    <button
                      type="button"
                      class={`isi-check__radio-btn ${dimensione === d.value ? 'is-active' : ''}`}
                      onClick={() => { setDimensione(d.value); setCalcolato(false); }}
                    >
                      <strong>{d.label}</strong>
                      <span>{d.hint}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Settore specifico (Asse 4) */}
            {asseConfig.richiedeSettore && (
              <div class="isi-check__field">
                <label class="isi-check__label">
                  La tua impresa opera in uno dei settori ammessi dall'Asse 4?
                </label>
                <div class="isi-check__radio">
                  <button
                    type="button"
                    class={`isi-check__radio-btn ${settoreSpecifico === true ? 'is-active' : ''}`}
                    onClick={() => { setSettoreSpecifico(true); setCalcolato(false); }}
                  >
                    <strong>Si'</strong>
                    <span>Ospitalita', tessile, pesca, manifatturiero</span>
                  </button>
                  <button
                    type="button"
                    class={`isi-check__radio-btn ${settoreSpecifico === false ? 'is-active' : ''}`}
                    onClick={() => { setSettoreSpecifico(false); setCalcolato(false); }}
                  >
                    <strong>No / Non sono sicuro</strong>
                    <span>Altro settore</span>
                  </button>
                </div>
                <p class="isi-check__ateco-note">
                  Settori ammessi: alloggio e ristorazione, tessile, confezioni, articoli in pelle,
                  legno, carta, stampa, prodotti chimici, farmaceutici, gomma, minerali non metalliferi,
                  metallurgia, pesca e acquacoltura.
                </p>
              </div>
            )}

            {/* Eta' titolare (Asse 5.2) */}
            {asseConfig.richiedeEta && (
              <div class="isi-check__field">
                <label class="isi-check__label">Eta' del titolare dell'impresa</label>
                <div class="isi-check__radio">
                  <button
                    type="button"
                    class={`isi-check__radio-btn ${etaUnder40 === true ? 'is-active' : ''}`}
                    onClick={() => { setEtaUnder40(true); setCalcolato(false); }}
                  >
                    <strong>Under 40</strong>
                    <span>Il titolare ha meno di 40 anni</span>
                  </button>
                  <button
                    type="button"
                    class={`isi-check__radio-btn ${etaUnder40 === false ? 'is-active' : ''}`}
                    onClick={() => { setEtaUnder40(false); setCalcolato(false); }}
                  >
                    <strong>40 anni o piu'</strong>
                    <span>Il titolare ha 40 anni o piu'</span>
                  </button>
                </div>
              </div>
            )}

            {/* Numero dipendenti (Asse 1.2) */}
            {asseConfig.richiedeDipendenti && (
              <div class="isi-check__field">
                <label class="isi-check__label">Numero di dipendenti</label>
                <div class="isi-check__radio">
                  <button
                    type="button"
                    class={`isi-check__radio-btn ${dipendentiSotto50 === true ? 'is-active' : ''}`}
                    onClick={() => { setDipendentiSotto50(true); setCalcolato(false); }}
                  >
                    <strong>Meno di 50</strong>
                    <span>Nessun contributo minimo richiesto</span>
                  </button>
                  <button
                    type="button"
                    class={`isi-check__radio-btn ${dipendentiSotto50 === false ? 'is-active' : ''}`}
                    onClick={() => { setDipendentiSotto50(false); setCalcolato(false); }}
                  >
                    <strong>50 o piu'</strong>
                    <span>Contributo minimo: {eur(CONTRIBUTO_MIN)}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* === IMPORTO INVESTIMENTO === */}
        {asseConfig && (servonoDomande ? qualificazioneCompleta : true) && (
          <>
            <div class="isi-check__field" style={{ marginTop: servonoDomande ? '0' : '0.5rem' }}>
              <label class="isi-check__label" for="isi-importo">
                Importo investimento previsto, IVA esclusa (\u20ac)
              </label>
              <input
                id="isi-importo"
                type="text"
                inputMode="numeric"
                class="isi-check__input"
                value={importoInput}
                placeholder="Es. 80000"
                onInput={handleImportoChange}
              />
              <span class="isi-check__hint">
                Solo beni nuovi. Contributo: da {eur(CONTRIBUTO_MIN)} a {eur(CONTRIBUTO_MAX)}.
              </span>
            </div>

            <button
              type="button"
              class="isi-check__cta"
              onClick={handleVerifica}
              disabled={!valido}
            >
              Verifica agevolazione
            </button>
          </>
        )}
      </div>

      {/* === RISULTATO ELEGGIBILE === */}
      {calcolato && risultato && risultato.eleggibile && (
        <div class="isi-check__result">
          <div class="isi-check__result-header">
            <span class="isi-check__result-eyebrow">Contributo a fondo perduto stimato</span>
            <strong class="isi-check__result-value">{eur(risultato.contributoBase)}</strong>
            <span class="isi-check__result-perc">
              {risultato.percentuale}% dell'investimento di {eur(importo)}
            </span>
          </div>

          <div class="isi-check__result-grid">
            <div class="isi-check__result-item">
              <span class="isi-check__result-label">Investimento</span>
              <strong>{eur(importo)}</strong>
              <small>IVA esclusa</small>
            </div>
            <div class="isi-check__result-item">
              <span class="isi-check__result-label">Contributo ISI</span>
              <strong>{eur(risultato.contributoBase)}</strong>
              <small>a fondo perduto</small>
            </div>
            <div class="isi-check__result-item">
              <span class="isi-check__result-label">A tuo carico</span>
              <strong>{eur(risultato.costoNetto)}</strong>
              <small>quota residua</small>
            </div>
          </div>

          {/* Intervento aggiuntivo */}
          {risultato.interventoAggiuntivoPossibile && (
            <div class="isi-check__extra-box">
              <span class="material-icons-outlined">add_circle_outline</span>
              <p>
                Su questo asse puoi aggiungere un intervento supplementare: fino a 20.000 \u20ac
                aggiuntivi con copertura all'80% (contributo extra fino a 16.000 \u20ac).
              </p>
            </div>
          )}

          <div class="isi-check__hint-box">
            <span class="material-icons-outlined">lightbulb</span>
            <p>
              Il Bando ISI richiede di anticipare il 100% dell'investimento. MCF finanzia
              l'intero importo: quando arriva il contributo Inail ({eur(risultato.contributoBase)}),
              lo usi per abbattere l'esposizione. Resta a tuo carico solo {eur(risultato.costoNetto)}.
            </p>
          </div>

          <p class="isi-check__disclaimer">
            Stima indicativa basata sulle percentuali del Bando ISI 2025-2026.
            Il contributo definitivo dipende dal punteggio del progetto, dall'esito del click day
            e dalla rendicontazione finale. Importi IVA esclusa.
          </p>
        </div>
      )}

      {/* === RISULTATO NON ELEGGIBILE === */}
      {calcolato && risultato && !risultato.eleggibile && (
        <div class="isi-check__ineligible">
          <span class="material-icons-outlined">info</span>
          <h3>Progetto non eleggibile su questo asse</h3>
          <p>{risultato.motivo}</p>
          {risultato.suggerimento && (
            <p class="isi-check__ineligible-hint">{risultato.suggerimento}</p>
          )}
        </div>
      )}

      {/* === FORM CONTATTI === */}
      {calcolato && risultato && risultato.eleggibile && !formInviato && (
        <form class="isi-check__contact" onSubmit={handleFormSubmit}>
          <h3 class="isi-check__contact-title">
            Vuoi finanziare il tuo progetto ISI?
          </h3>
          <p class="isi-check__contact-sub">
            Lascia i tuoi contatti, ti chiamo io entro 24 ore lavorative.
            Verifichiamo i requisiti del tuo progetto e ti propongo la soluzione
            di finanziamento piu' adatta.
          </p>

          <div class="isi-check__contact-fields">
            <input
              type="text"
              name="nome"
              required
              placeholder="Nome e cognome"
              value={formNome}
              onInput={(e) => setFormNome((e.target as HTMLInputElement).value)}
            />
            <input
              type="tel"
              name="telefono"
              required
              placeholder="Telefono"
              value={formTelefono}
              onInput={(e) => setFormTelefono((e.target as HTMLInputElement).value)}
            />
            <input
              type="email"
              name="email"
              required
              placeholder="Email"
              value={formEmail}
              onInput={(e) => setFormEmail((e.target as HTMLInputElement).value)}
            />
          </div>

          <button type="submit" class="isi-check__contact-submit" disabled={formInvio}>
            {formInvio ? 'Invio in corso\u2026' : 'Richiedi consulenza gratuita'}
          </button>

          <p class="isi-check__privacy">
            Inviando il modulo accetti la nostra{' '}
            <a href="/privacy">informativa sulla privacy</a>.
          </p>
        </form>
      )}

      {formInviato && (
        <div class="isi-check__success">
          <span class="material-icons-outlined">check_circle</span>
          <h3>Richiesta ricevuta</h3>
          <p>Ti reindirizzo alla pagina di conferma.</p>
        </div>
      )}
    </div>
  );
}
