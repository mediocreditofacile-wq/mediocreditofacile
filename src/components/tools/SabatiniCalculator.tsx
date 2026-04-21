import { useState, useMemo } from 'preact/hooks';
import './sabatini-calculator.css';

// Tassi convenzionali Nuova Sabatini (DM MISE)
// - Beni ordinari: 2,75% annuo
// - Beni 4.0 (industria 4.0): 3,575% annuo (contributo maggiorato del 30%)
const TASSO_ORDINARIO = 0.0275;
const TASSO_4_0 = 0.03575;

// Durata fissa del finanziamento convenzionale per il calcolo del contributo
const DURATA_ANNI = 5;
const RATE_PER_ANNO = 2; // rate semestrali
const NUM_RATE = DURATA_ANNI * RATE_PER_ANNO;

// Limiti investimento previsti dalla normativa
const INV_MIN = 20000;
const INV_MAX = 4000000;

// Tipologia bene
type TipoBene = 'ordinario' | '4.0';

// Calcolo del contributo MISE
// Si calcola la quota interessi totale di un finanziamento di pari importo
// con piano francese a 5 anni e rate semestrali al tasso convenzionale.
function calcolaContributo(importo: number, tipo: TipoBene): number {
  const tassoAnnuo = tipo === '4.0' ? TASSO_4_0 : TASSO_ORDINARIO;
  const tassoPeriodico = tassoAnnuo / RATE_PER_ANNO;

  // Rata costante (formula francese)
  const rata =
    (importo * tassoPeriodico) / (1 - Math.pow(1 + tassoPeriodico, -NUM_RATE));

  // Somma totale rate - capitale = totale interessi = contributo MISE
  const totaleInteressi = rata * NUM_RATE - importo;

  return totaleInteressi;
}

// Formattazione euro
function eur(n: number): string {
  return n.toLocaleString('it-IT', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  });
}

export default function SabatiniCalculator() {
  // Input
  const [importoInput, setImportoInput] = useState('');
  const [importo, setImporto] = useState(0);
  const [tipoBene, setTipoBene] = useState<TipoBene>('ordinario');
  const [calcolato, setCalcolato] = useState(false);

  // Stato form
  const [formNome, setFormNome] = useState('');
  const [formTelefono, setFormTelefono] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formInvio, setFormInvio] = useState(false);
  const [formInviato, setFormInviato] = useState(false);

  // Validazione
  const importoValido = importo >= INV_MIN && importo <= INV_MAX;

  // Calcolo memoizzato
  const risultato = useMemo(() => {
    if (!importoValido) return null;

    const contributo = calcolaContributo(importo, tipoBene);
    const erogazioneAnnua = contributo / 5; // erogato in 5 quote annuali
    const costoNettoSenza = importo;
    const costoNettoCon = importo - contributo;
    const risparmioPerc = (contributo / importo) * 100;

    return {
      contributo,
      erogazioneAnnua,
      costoNettoSenza,
      costoNettoCon,
      risparmioPerc,
    };
  }, [importo, tipoBene, importoValido]);

  // Handler input importo
  const handleImportoChange = (e: Event) => {
    const raw = (e.target as HTMLInputElement).value.replace(/[^\d]/g, '');
    setImportoInput(raw);
    setCalcolato(false);
    const num = parseInt(raw, 10);
    if (!isNaN(num)) setImporto(num);
    else setImporto(0);
  };

  const handleTipoChange = (tipo: TipoBene) => {
    setTipoBene(tipo);
    setCalcolato(false);
  };

  // GTM tracking calcolo
  const pushCalcolo = () => {
    if (typeof window !== 'undefined' && (window as any).dataLayer) {
      (window as any).dataLayer.push({
        event: 'lp_sabatini_calc',
        landing: 'sabatini',
        tool: 'sabatini_calculator',
        importo_investimento: importo,
        tipo_bene: tipoBene,
        contributo_stimato: risultato?.contributo,
      });
    }
  };

  const handleCalcola = () => {
    if (importo > 0) {
      const clamped = Math.min(INV_MAX, Math.max(INV_MIN, importo));
      setImporto(clamped);
      setImportoInput(clamped.toString());
    }
    setCalcolato(true);
    setTimeout(pushCalcolo, 0);
  };

  // Submit form
  const handleFormSubmit = async (e: Event) => {
    e.preventDefault();
    if (formInvio) return;
    setFormInvio(true);

    // GTM
    if (typeof window !== 'undefined' && (window as any).dataLayer) {
      (window as any).dataLayer.push({
        event: 'lp_sabatini_submit',
        landing: 'sabatini',
        tool: 'sabatini_calculator',
      });
    }

    const body = new FormData();
    body.append('tool', 'sabatini_calculator');
    body.append('landing', 'sabatini');
    body.append('fonte', 'agevolazioni-sabatini-2026');
    body.append('nome', formNome);
    body.append('telefono', formTelefono);
    body.append('email', formEmail);
    body.append('importo_investimento', importo.toString());
    body.append('tipo_bene', tipoBene);
    if (risultato) {
      body.append('contributo_stimato', risultato.contributo.toFixed(0));
      body.append('erogazione_annua', risultato.erogazioneAnnua.toFixed(0));
    }

    try {
      await fetch('/api/submit-agevolazioni', { method: 'POST', body });
      setFormInviato(true);
      setTimeout(() => {
        window.location.href = '/grazie';
      }, 800);
    } catch (_) {
      setFormInvio(false);
    }
  };

  return (
    <div class="sab-calc">
      {/* === FORM INPUT === */}
      <div class="sab-calc__form">
        <h3 class="sab-calc__form-title">Calcola il tuo contributo MISE</h3>
        <p class="sab-calc__form-sub">
          Inserisci l'importo dell'investimento e scegli la tipologia di bene.
          Ti mostriamo subito il contributo statale stimato.
        </p>

        <div class="sab-calc__field">
          <label class="sab-calc__label" for="sab-importo">
            Importo investimento (€)
          </label>
          <input
            id="sab-importo"
            type="text"
            inputMode="numeric"
            class="sab-calc__input"
            value={importoInput}
            placeholder="Es. 80000"
            onInput={handleImportoChange}
          />
          <span class="sab-calc__hint">
            Min {eur(INV_MIN)} — Max {eur(INV_MAX)}
          </span>
        </div>

        <div class="sab-calc__field">
          <label class="sab-calc__label">Tipologia bene</label>
          <div class="sab-calc__toggle">
            <button
              type="button"
              class={`sab-calc__toggle-btn ${tipoBene === 'ordinario' ? 'is-active' : ''}`}
              onClick={() => handleTipoChange('ordinario')}
            >
              Bene ordinario
              <span class="sab-calc__toggle-hint">Tasso 2,75%</span>
            </button>
            <button
              type="button"
              class={`sab-calc__toggle-btn ${tipoBene === '4.0' ? 'is-active' : ''}`}
              onClick={() => handleTipoChange('4.0')}
            >
              Bene 4.0
              <span class="sab-calc__toggle-hint">Tasso 3,575% — contributo +30%</span>
            </button>
          </div>
        </div>

        <button
          type="button"
          class="sab-calc__cta"
          onClick={handleCalcola}
          disabled={!importoValido}
        >
          Calcola contributo
        </button>

        {!importoValido && importo > 0 && (
          <p class="sab-calc__error">
            L'importo deve essere compreso tra {eur(INV_MIN)} e {eur(INV_MAX)}.
          </p>
        )}
      </div>

      {/* === RISULTATO === */}
      {calcolato && risultato && (
        <div class="sab-calc__result">
          <div class="sab-calc__result-header">
            <span class="sab-calc__result-eyebrow">Contributo MISE stimato</span>
            <strong class="sab-calc__result-value">{eur(risultato.contributo)}</strong>
            <span class="sab-calc__result-perc">
              pari al {risultato.risparmioPerc.toFixed(1)}% dell'investimento
            </span>
          </div>

          <div class="sab-calc__result-grid">
            <div class="sab-calc__result-item">
              <span class="sab-calc__result-label">Erogazione annuale</span>
              <strong>{eur(risultato.erogazioneAnnua)}</strong>
              <small>per 5 anni</small>
            </div>
            <div class="sab-calc__result-item">
              <span class="sab-calc__result-label">Costo netto del bene</span>
              <strong>{eur(risultato.costoNettoCon)}</strong>
              <small>al netto del contributo</small>
            </div>
          </div>

          <div class="sab-calc__compare">
            <div class="sab-calc__compare-row">
              <span>Senza Sabatini</span>
              <strong>{eur(risultato.costoNettoSenza)}</strong>
            </div>
            <div class="sab-calc__compare-row sab-calc__compare-row--win">
              <span>Con Sabatini</span>
              <strong>{eur(risultato.costoNettoCon)}</strong>
            </div>
          </div>

          <p class="sab-calc__disclaimer">
            Stima indicativa basata sui parametri normativi vigenti (DM MISE).
            Il contributo definitivo dipende dalle caratteristiche dell'investimento
            e dalla pratica istruita con l'operatore convenzionato.
          </p>
        </div>
      )}

      {/* === FORM CONTATTI (visibile dopo il calcolo) === */}
      {calcolato && risultato && !formInviato && (
        <form class="sab-calc__contact" onSubmit={handleFormSubmit}>
          <h3 class="sab-calc__contact-title">
            Vuoi che ti aiuti a impostare la pratica?
          </h3>
          <p class="sab-calc__contact-sub">
            Lascia i tuoi contatti, ti chiamo io entro 24 ore lavorative
            con una valutazione su misura del tuo caso.
          </p>

          <div class="sab-calc__contact-fields">
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

          <button type="submit" class="sab-calc__contact-submit" disabled={formInvio}>
            {formInvio ? 'Invio in corso…' : 'Richiedi consulenza gratuita'}
          </button>

          <p class="sab-calc__privacy">
            Inviando il modulo accetti la nostra{' '}
            <a href="/privacy">informativa sulla privacy</a>.
          </p>
        </form>
      )}

      {formInviato && (
        <div class="sab-calc__success">
          <span class="material-icons-outlined">check_circle</span>
          <h3>Richiesta ricevuta</h3>
          <p>Ti reindirizzo alla pagina di conferma.</p>
        </div>
      )}
    </div>
  );
}
