import { useState, useMemo } from 'preact/hooks';
import './fondo-garanzia.css';

// Dimensione PMI (parametri UE)
type Dimensione = 'micro' | 'piccola' | 'media';

// Tipologia operazione
type Operazione = 'investimento' | 'liquidita' | 'capitalizzazione';

// Settore (semplificato)
type Settore = 'manifatturiero' | 'servizi' | 'commercio' | 'turismo' | 'agricoltura' | 'altro';

const DIMENSIONI: { value: Dimensione; label: string; hint: string }[] = [
  { value: 'micro', label: 'Microimpresa', hint: '< 10 dipendenti, fatturato < 2M €' },
  { value: 'piccola', label: 'Piccola', hint: '< 50 dipendenti, fatturato < 10M €' },
  { value: 'media', label: 'Media', hint: '< 250 dipendenti, fatturato < 50M €' },
];

const OPERAZIONI: { value: Operazione; label: string; hint: string }[] = [
  { value: 'investimento', label: 'Investimento produttivo', hint: 'Macchinari, attrezzature, immobili' },
  { value: 'liquidita', label: 'Liquidita\'', hint: 'Capitale circolante, gestione cash flow' },
  { value: 'capitalizzazione', label: 'Capitalizzazione', hint: 'Rafforzamento patrimoniale' },
];

const SETTORI: { value: Settore; label: string }[] = [
  { value: 'manifatturiero', label: 'Manifatturiero / industria' },
  { value: 'servizi', label: 'Servizi professionali' },
  { value: 'commercio', label: 'Commercio' },
  { value: 'turismo', label: 'Turismo / ristorazione' },
  { value: 'agricoltura', label: 'Agricoltura' },
  { value: 'altro', label: 'Altro' },
];

// Calcolo copertura stimata
// Logica semplificata basata sulla matrice operativa del Fondo Garanzia MCC
function calcolaCopertura(
  dimensione: Dimensione,
  operazione: Operazione,
  importo: number,
): { perc: number; importoGarantito: number; massimale: number; eleggibile: boolean } {
  // Massimale per impresa (cumulativo): 5 milioni
  const MASSIMALE_IMPRESA = 5_000_000;

  // Copertura base per dimensione
  let perc = 0;
  if (dimensione === 'micro') {
    perc = operazione === 'investimento' ? 80 : operazione === 'capitalizzazione' ? 80 : 60;
  } else if (dimensione === 'piccola') {
    perc = operazione === 'investimento' ? 70 : operazione === 'capitalizzazione' ? 70 : 55;
  } else {
    // media
    perc = operazione === 'investimento' ? 60 : operazione === 'capitalizzazione' ? 60 : 50;
  }

  const importoGarantito = (importo * perc) / 100;
  const eleggibile = importo > 0 && importo <= MASSIMALE_IMPRESA;

  return {
    perc,
    importoGarantito,
    massimale: MASSIMALE_IMPRESA,
    eleggibile,
  };
}

function eur(n: number): string {
  return n.toLocaleString('it-IT', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  });
}

export default function FondoGaranziaChecker() {
  const [dimensione, setDimensione] = useState<Dimensione>('piccola');
  const [operazione, setOperazione] = useState<Operazione>('investimento');
  const [settore, setSettore] = useState<Settore>('manifatturiero');
  const [importoInput, setImportoInput] = useState('');
  const [importo, setImporto] = useState(0);
  const [calcolato, setCalcolato] = useState(false);

  // Form
  const [formNome, setFormNome] = useState('');
  const [formTelefono, setFormTelefono] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formInvio, setFormInvio] = useState(false);
  const [formInviato, setFormInviato] = useState(false);

  const valido = importo >= 1000 && importo <= 5_000_000;

  const risultato = useMemo(() => {
    if (!valido) return null;
    return calcolaCopertura(dimensione, operazione, importo);
  }, [dimensione, operazione, importo, valido]);

  const handleImportoChange = (e: Event) => {
    const raw = (e.target as HTMLInputElement).value.replace(/[^\d]/g, '');
    setImportoInput(raw);
    setCalcolato(false);
    const num = parseInt(raw, 10);
    setImporto(isNaN(num) ? 0 : num);
  };

  const pushCheck = () => {
    if (typeof window !== 'undefined' && (window as any).dataLayer) {
      (window as any).dataLayer.push({
        event: 'lp_fondo_garanzia_check',
        landing: 'fondo-garanzia-mcc',
        tool: 'fondo_garanzia_checker',
        dimensione,
        operazione,
        settore,
        importo_finanziamento: importo,
        copertura_perc: risultato?.perc,
        importo_garantito: risultato?.importoGarantito,
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
        event: 'lp_fondo_garanzia_submit',
        landing: 'fondo-garanzia-mcc',
        tool: 'fondo_garanzia_checker',
      });
    }

    const body = new FormData();
    body.append('tool', 'fondo_garanzia_checker');
    body.append('landing', 'fondo-garanzia-mcc');
    body.append('fonte', 'agevolazioni-fondo-garanzia-mcc');
    body.append('nome', formNome);
    body.append('telefono', formTelefono);
    body.append('email', formEmail);
    body.append('dimensione_pmi', dimensione);
    body.append('tipo_operazione', operazione);
    body.append('settore', settore);
    body.append('importo_finanziamento', importo.toString());
    if (risultato) {
      body.append('copertura_stimata_perc', risultato.perc.toString());
      body.append('importo_garantito_stimato', risultato.importoGarantito.toFixed(0));
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
    <div class="fdg-check">
      {/* === FORM INPUT === */}
      <div class="fdg-check__form">
        <h3 class="fdg-check__form-title">Verifica la tua eleggibilita'</h3>
        <p class="fdg-check__form-sub">
          Tre informazioni sulla tua impresa e sul finanziamento.
          Ti diciamo subito quanto puo' garantire lo Stato.
        </p>

        <div class="fdg-check__field">
          <label class="fdg-check__label">Dimensione impresa</label>
          <div class="fdg-check__radio">
            {DIMENSIONI.map((d) => (
              <button
                type="button"
                class={`fdg-check__radio-btn ${dimensione === d.value ? 'is-active' : ''}`}
                onClick={() => {
                  setDimensione(d.value);
                  setCalcolato(false);
                }}
              >
                <strong>{d.label}</strong>
                <span>{d.hint}</span>
              </button>
            ))}
          </div>
        </div>

        <div class="fdg-check__field">
          <label class="fdg-check__label">Tipologia operazione</label>
          <div class="fdg-check__radio">
            {OPERAZIONI.map((o) => (
              <button
                type="button"
                class={`fdg-check__radio-btn ${operazione === o.value ? 'is-active' : ''}`}
                onClick={() => {
                  setOperazione(o.value);
                  setCalcolato(false);
                }}
              >
                <strong>{o.label}</strong>
                <span>{o.hint}</span>
              </button>
            ))}
          </div>
        </div>

        <div class="fdg-check__field">
          <label class="fdg-check__label" for="fdg-settore">Settore</label>
          <select
            id="fdg-settore"
            class="fdg-check__select"
            value={settore}
            onChange={(e) => {
              setSettore((e.target as HTMLSelectElement).value as Settore);
              setCalcolato(false);
            }}
          >
            {SETTORI.map((s) => (
              <option value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>

        <div class="fdg-check__field">
          <label class="fdg-check__label" for="fdg-importo">
            Importo finanziamento richiesto (€)
          </label>
          <input
            id="fdg-importo"
            type="text"
            inputMode="numeric"
            class="fdg-check__input"
            value={importoInput}
            placeholder="Es. 100000"
            onInput={handleImportoChange}
          />
          <span class="fdg-check__hint">Min 1.000 € — Max 5.000.000 €</span>
        </div>

        <button
          type="button"
          class="fdg-check__cta"
          onClick={handleVerifica}
          disabled={!valido}
        >
          Verifica copertura
        </button>
      </div>

      {/* === RISULTATO === */}
      {calcolato && risultato && (
        <div class="fdg-check__result">
          <div class="fdg-check__result-header">
            <span class="fdg-check__result-eyebrow">Copertura Fondo di Garanzia stimata</span>
            <strong class="fdg-check__result-value">{risultato.perc}%</strong>
            <span class="fdg-check__result-perc">
              del finanziamento richiesto
            </span>
          </div>

          <div class="fdg-check__result-grid">
            <div class="fdg-check__result-item">
              <span class="fdg-check__result-label">Importo garantito</span>
              <strong>{eur(risultato.importoGarantito)}</strong>
              <small>su {eur(importo)} richiesti</small>
            </div>
            <div class="fdg-check__result-item">
              <span class="fdg-check__result-label">Massimale per impresa</span>
              <strong>{eur(risultato.massimale)}</strong>
              <small>cumulativo</small>
            </div>
          </div>

          <div class="fdg-check__hint-box">
            <span class="material-icons-outlined">lightbulb</span>
            <p>
              Una copertura del <strong>{risultato.perc}%</strong> riduce drasticamente
              il rischio per la banca, migliorando le condizioni del finanziamento
              (tasso, durata, accettazione della pratica).
            </p>
          </div>

          <p class="fdg-check__disclaimer">
            Stima indicativa basata sulle percentuali di copertura tipiche del Fondo MCC
            per dimensione e tipologia di operazione. La copertura definitiva dipende
            anche dal rating dell'impresa e dalla valutazione del Fondo.
          </p>
        </div>
      )}

      {/* === FORM CONTATTI === */}
      {calcolato && risultato && !formInviato && (
        <form class="fdg-check__contact" onSubmit={handleFormSubmit}>
          <h3 class="fdg-check__contact-title">
            Vuoi attivare il Fondo di Garanzia per il tuo finanziamento?
          </h3>
          <p class="fdg-check__contact-sub">
            Lascia i tuoi contatti, ti chiamo io entro 24 ore lavorative.
            Verifichiamo l'idoneita' della tua impresa e ti propongo l'operatore
            convenzionato piu' adatto al tuo caso.
          </p>

          <div class="fdg-check__contact-fields">
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

          <button type="submit" class="fdg-check__contact-submit" disabled={formInvio}>
            {formInvio ? 'Invio in corso…' : 'Richiedi consulenza gratuita'}
          </button>

          <p class="fdg-check__privacy">
            Inviando il modulo accetti la nostra{' '}
            <a href="/privacy">informativa sulla privacy</a>.
          </p>
        </form>
      )}

      {formInviato && (
        <div class="fdg-check__success">
          <span class="material-icons-outlined">check_circle</span>
          <h3>Richiesta ricevuta</h3>
          <p>Ti reindirizzo alla pagina di conferma.</p>
        </div>
      )}
    </div>
  );
}
