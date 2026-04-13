import { useState, useMemo } from 'preact/hooks';
import './bando-isi-checker.css';

// === TIPI ===

type Dimensione = 'micro' | 'piccola' | 'media' | 'grande';

// Le tipologie di progetto in linguaggio imprenditore
type ProgettoId =
  | 'macchinari'       // Sostituire macchinari/attrezzature obsolete
  | 'protezioni'       // Installare protezioni, anticaduta, barriere
  | 'salute'           // Ridurre rischi salute (rumore, vibrazioni, chimici, ergonomia)
  | 'amianto'          // Rimuovere amianto
  | 'certificazione'   // Certificazione sicurezza (ISO 45001, MOG)
  | 'agricoltura';     // Macchine agricole/forestali

// Assi del bando (lato tecnico, nascosti all'utente)
interface AsseConfig {
  id: string;
  label: string;
  percentuale: number;
  interventoAggiuntivo: boolean;
  minContributoZero: boolean; // Asse 1.2 <50 dip: nessun minimo
}

const ASSI: Record<string, AsseConfig> = {
  '1.1': { id: '1.1', label: 'Asse 1.1', percentuale: 65, interventoAggiuntivo: true, minContributoZero: false },
  '1.2': { id: '1.2', label: 'Asse 1.2', percentuale: 80, interventoAggiuntivo: false, minContributoZero: false },
  '2':   { id: '2',   label: 'Asse 2',   percentuale: 65, interventoAggiuntivo: true, minContributoZero: false },
  '3':   { id: '3',   label: 'Asse 3',   percentuale: 65, interventoAggiuntivo: true, minContributoZero: false },
  '4':   { id: '4',   label: 'Asse 4',   percentuale: 65, interventoAggiuntivo: true, minContributoZero: false },
  '5.1': { id: '5.1', label: 'Asse 5.1', percentuale: 65, interventoAggiuntivo: false, minContributoZero: false },
  '5.2': { id: '5.2', label: 'Asse 5.2', percentuale: 80, interventoAggiuntivo: false, minContributoZero: false },
};

// Le card che l'utente vede: linguaggio concreto, non burocratico
interface ProgettoOption {
  id: ProgettoId;
  label: string;
  desc: string;
  icon: string;
}

const PROGETTI: ProgettoOption[] = [
  {
    id: 'macchinari',
    label: 'Sostituire macchinari o attrezzature',
    desc: 'Macchine obsolete, impianti vecchi, attrezzature non a norma',
    icon: 'precision_manufacturing',
  },
  {
    id: 'protezioni',
    label: 'Installare protezioni e sistemi anticaduta',
    desc: 'Barriere fotoelettriche, parapetti, linee vita, protezioni fisse e mobili',
    icon: 'health_and_safety',
  },
  {
    id: 'salute',
    label: 'Ridurre rischi per la salute dei lavoratori',
    desc: 'Rumore, vibrazioni, sostanze chimiche, ergonomia, movimentazione carichi',
    icon: 'hearing',
  },
  {
    id: 'amianto',
    label: 'Rimuovere amianto',
    desc: 'Rimozione, smaltimento e sostituzione di coperture e materiali con amianto',
    icon: 'delete_sweep',
  },
  {
    id: 'certificazione',
    label: 'Certificare la sicurezza aziendale',
    desc: 'ISO 45001, sistema gestione SGSL, modello organizzativo (MOG art. 30)',
    icon: 'verified',
  },
  {
    id: 'agricoltura',
    label: 'Acquistare macchine agricole o forestali',
    desc: 'Trattori, macchine agricole e forestali piu\' sicure',
    icon: 'agriculture',
  },
];

const DIMENSIONI: { value: Dimensione; label: string; hint: string }[] = [
  { value: 'micro', label: 'Microimpresa', hint: '< 10 dipendenti, fatturato < 2M \u20ac' },
  { value: 'piccola', label: 'Piccola impresa', hint: '< 50 dip., fatturato < 10M \u20ac' },
  { value: 'media', label: 'Media impresa', hint: '< 250 dip., fatturato < 50M \u20ac' },
  { value: 'grande', label: 'Grande impresa', hint: '\u2265 250 dipendenti' },
];

const CONTRIBUTO_MIN = 5_000;
const CONTRIBUTO_MAX = 130_000;

// === LOGICA DI MAPPATURA progetto → asse ===
// Determina l'asse corretto in base al progetto + risposte di qualificazione

function determinaAsse(
  progetto: ProgettoId,
  dimensione: Dimensione | null,
  settoreSpecifico: boolean | null,
  etaUnder40: boolean | null,
  dipendentiSotto50: boolean | null,
): { asse: AsseConfig; minContributoZero: boolean } | { errore: string; suggerimento?: string } {

  switch (progetto) {
    case 'salute':
      // Sempre Asse 1.1 — aperto a tutti
      return { asse: ASSI['1.1'], minContributoZero: false };

    case 'certificazione':
      // Sempre Asse 1.2 — aperto a tutti, ma min. contributo dipende dai dipendenti
      return {
        asse: ASSI['1.2'],
        minContributoZero: dipendentiSotto50 === true,
      };

    case 'amianto':
      // Sempre Asse 3 — aperto a tutti
      return { asse: ASSI['3'], minContributoZero: false };

    case 'macchinari':
    case 'protezioni':
      // Default Asse 2 — ma micro/piccola in settori specifici possono andare su Asse 4
      if (
        (dimensione === 'micro' || dimensione === 'piccola') &&
        settoreSpecifico === true
      ) {
        return { asse: ASSI['4'], minContributoZero: false };
      }
      // Asse 2 aperto a tutti
      return { asse: ASSI['2'], minContributoZero: false };

    case 'agricoltura':
      // Solo micro/piccole
      if (dimensione === 'media' || dimensione === 'grande') {
        return {
          errore: 'Il contributo per macchine agricole e\' riservato a micro e piccole imprese.',
          suggerimento: 'Se sei un\'impresa agricola di dimensioni maggiori, puoi valutare interventi su sicurezza e salute (Assi 1-3).',
        };
      }
      // Under 40 → Asse 5.2 (80%), altrimenti 5.1 (65%)
      if (etaUnder40 === true) {
        return { asse: ASSI['5.2'], minContributoZero: false };
      }
      return { asse: ASSI['5.1'], minContributoZero: false };

    default:
      return { errore: 'Seleziona il tipo di progetto.' };
  }
}

// === RISULTATO ===

interface RisultatoISI {
  eleggibile: boolean;
  motivo?: string;
  suggerimento?: string;
  asseLabel: string;
  percentuale: number;
  contributoBase: number;
  costoNetto: number;
  interventoAggiuntivoPossibile: boolean;
}

function calcolaContributoISI(
  asse: AsseConfig,
  minContributoZero: boolean,
  importo: number,
): RisultatoISI {
  const contributoBase = Math.min(importo * (asse.percentuale / 100), CONTRIBUTO_MAX);

  // Verifica contributo minimo
  if (!minContributoZero && contributoBase < CONTRIBUTO_MIN) {
    const investimentoMinimo = Math.ceil(CONTRIBUTO_MIN / (asse.percentuale / 100));
    return {
      eleggibile: false,
      motivo: `Investimento troppo basso. Il contributo minimo e\' di ${eur(CONTRIBUTO_MIN)}.`,
      suggerimento: `L'investimento deve essere di almeno ${eur(investimentoMinimo)} (IVA esclusa).`,
      asseLabel: asse.label,
      percentuale: asse.percentuale,
      contributoBase,
      costoNetto: importo,
      interventoAggiuntivoPossibile: false,
    };
  }

  return {
    eleggibile: true,
    asseLabel: asse.label,
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


// === COMPONENTE ===

export default function BandoIsiChecker() {
  // Step 1: cosa devi fare
  const [progetto, setProgetto] = useState<ProgettoId | null>(null);

  // Step 2: qualificazione (condizionale)
  const [dimensione, setDimensione] = useState<Dimensione | null>(null);
  const [settoreSpecifico, setSettoreSpecifico] = useState<boolean | null>(null);
  const [etaUnder40, setEtaUnder40] = useState<boolean | null>(null);
  const [dipendentiSotto50, setDipendentiSotto50] = useState<boolean | null>(null);

  // Step 3: importo
  const [importoInput, setImportoInput] = useState('');
  const [importo, setImporto] = useState(0);
  const [calcolato, setCalcolato] = useState(false);

  // Form contatto
  const [formNome, setFormNome] = useState('');
  const [formTelefono, setFormTelefono] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formInvio, setFormInvio] = useState(false);
  const [formInviato, setFormInviato] = useState(false);

  // Quali domande servono in base al progetto scelto
  const serveDimensione = progetto === 'macchinari' || progetto === 'protezioni' || progetto === 'agricoltura';
  const serveSettore = (progetto === 'macchinari' || progetto === 'protezioni') &&
    (dimensione === 'micro' || dimensione === 'piccola');
  const serveEta = progetto === 'agricoltura' &&
    (dimensione === 'micro' || dimensione === 'piccola');
  const serveDipendenti = progetto === 'certificazione';

  const servonoDomande = serveDimensione || serveSettore || serveEta || serveDipendenti;

  // Qualificazione completa?
  const qualificazioneCompleta = useMemo(() => {
    if (!progetto) return false;
    if (serveDimensione && dimensione === null) return false;
    if (serveSettore && settoreSpecifico === null) return false;
    if (serveEta && etaUnder40 === null) return false;
    if (serveDipendenti && dipendentiSotto50 === null) return false;
    return true;
  }, [progetto, serveDimensione, dimensione, serveSettore, settoreSpecifico, serveEta, etaUnder40, serveDipendenti, dipendentiSotto50]);

  const valido = importo > 0 && qualificazioneCompleta;

  // Risultato del calcolo
  const risultato = useMemo(() => {
    if (!progetto || !valido) return null;
    const mapping = determinaAsse(progetto, dimensione, settoreSpecifico, etaUnder40, dipendentiSotto50);
    if ('errore' in mapping) {
      return {
        eleggibile: false,
        motivo: mapping.errore,
        suggerimento: mapping.suggerimento,
        asseLabel: '',
        percentuale: 0,
        contributoBase: 0,
        costoNetto: importo,
        interventoAggiuntivoPossibile: false,
      } as RisultatoISI;
    }
    return calcolaContributoISI(mapping.asse, mapping.minContributoZero, importo);
  }, [progetto, dimensione, settoreSpecifico, etaUnder40, dipendentiSotto50, importo, valido]);

  // Asse risolto (per tracking)
  const asseRisolto = useMemo(() => {
    if (!progetto || !qualificazioneCompleta) return null;
    const mapping = determinaAsse(progetto, dimensione, settoreSpecifico, etaUnder40, dipendentiSotto50);
    if ('errore' in mapping) return null;
    return mapping.asse.id;
  }, [progetto, dimensione, settoreSpecifico, etaUnder40, dipendentiSotto50, qualificazioneCompleta]);

  // Reset qualificazione quando cambia il progetto
  const handleProgettoChange = (value: ProgettoId) => {
    setProgetto(value);
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
        tipo_progetto: progetto,
        asse: asseRisolto,
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
    if (progetto) body.append('tipo_progetto', progetto);
    if (asseRisolto) body.append('asse_isi', asseRisolto);
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

  return (
    <div class="isi-check">
      <div class="isi-check__form">
        <h3 class="isi-check__form-title">Verifica se il tuo progetto rientra nel Bando ISI</h3>
        <p class="isi-check__form-sub">
          Dicci cosa devi fare, rispondi a poche domande e scopri
          subito quanto puoi ottenere a fondo perduto.
        </p>

        {/* === STEP 1: COSA DEVI FARE === */}
        <div class="isi-check__field">
          <label class="isi-check__label">Cosa deve fare la tua azienda?</label>
          <div class="isi-check__axis-grid">
            {PROGETTI.map((p) => (
              <button
                type="button"
                class={`isi-check__axis-card ${progetto === p.id ? 'is-active' : ''}`}
                onClick={() => handleProgettoChange(p.id)}
              >
                <div class="isi-check__axis-head">
                  <span class="material-icons-outlined">{p.icon}</span>
                  <span class="isi-check__axis-name">{p.label}</span>
                </div>
                <span class="isi-check__axis-desc">{p.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* === STEP 2: QUALIFICAZIONE === */}
        {progetto && servonoDomande && (
          <div class="isi-check__qualify">
            <p class="isi-check__qualify-title">Qualche dato sulla tua impresa</p>

            {/* Dimensione impresa */}
            {serveDimensione && (
              <div class="isi-check__field">
                <label class="isi-check__label">Dimensione impresa</label>
                <div class="isi-check__radio">
                  {DIMENSIONI.map((d) => (
                    <button
                      type="button"
                      class={`isi-check__radio-btn ${dimensione === d.value ? 'is-active' : ''}`}
                      onClick={() => {
                        setDimensione(d.value);
                        setSettoreSpecifico(null);
                        setEtaUnder40(null);
                        setCalcolato(false);
                      }}
                    >
                      <strong>{d.label}</strong>
                      <span>{d.hint}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Settore specifico — solo per macchinari/protezioni se micro o piccola */}
            {serveSettore && (
              <div class="isi-check__field">
                <label class="isi-check__label">
                  La tua impresa opera in uno di questi settori?
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
                  Settori ammessi per micro/piccole imprese: alloggio e ristorazione, tessile, confezioni,
                  articoli in pelle, legno, carta, stampa, chimica, farmaceutica, gomma, minerali non metalliferi,
                  metallurgia, pesca e acquacoltura.
                </p>
              </div>
            )}

            {/* Eta' titolare — solo per agricoltura se micro/piccola */}
            {serveEta && (
              <div class="isi-check__field">
                <label class="isi-check__label">Eta' del titolare dell'impresa</label>
                <div class="isi-check__radio">
                  <button
                    type="button"
                    class={`isi-check__radio-btn ${etaUnder40 === true ? 'is-active' : ''}`}
                    onClick={() => { setEtaUnder40(true); setCalcolato(false); }}
                  >
                    <strong>Under 40</strong>
                    <span>Contributo maggiorato all'80%</span>
                  </button>
                  <button
                    type="button"
                    class={`isi-check__radio-btn ${etaUnder40 === false ? 'is-active' : ''}`}
                    onClick={() => { setEtaUnder40(false); setCalcolato(false); }}
                  >
                    <strong>40 anni o piu'</strong>
                    <span>Contributo standard al 65%</span>
                  </button>
                </div>
              </div>
            )}

            {/* Numero dipendenti — solo per certificazione */}
            {serveDipendenti && (
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

        {/* === STEP 3: IMPORTO === */}
        {progetto && (servonoDomande ? qualificazioneCompleta : true) && (
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

          {risultato.interventoAggiuntivoPossibile && (
            <div class="isi-check__extra-box">
              <span class="material-icons-outlined">add_circle_outline</span>
              <p>
                Per questo tipo di progetto puoi aggiungere un intervento supplementare:
                fino a 20.000 \u20ac aggiuntivi con copertura all'80%
                (contributo extra fino a 16.000 \u20ac).
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
            Stima indicativa basata sulle percentuali del Bando ISI 2025-2026 ({risultato.asseLabel}).
            Il contributo definitivo dipende dal punteggio del progetto, dall'esito del click day
            e dalla rendicontazione finale. Importi IVA esclusa.
          </p>
        </div>
      )}

      {/* === RISULTATO NON ELEGGIBILE === */}
      {calcolato && risultato && !risultato.eleggibile && (
        <div class="isi-check__ineligible">
          <span class="material-icons-outlined">info</span>
          <h3>Progetto non eleggibile con questi parametri</h3>
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
