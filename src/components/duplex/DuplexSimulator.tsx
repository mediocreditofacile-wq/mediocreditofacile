import { useEffect, useMemo, useState } from 'preact/hooks';
import listino from '../../data/duplex-listino.json';
import coefficienti from '../../data/duplex-coefficienti.json';
import accessoriDB from '../../data/duplex-accessori.json';
import './duplex-simulator.css';

// Tipi del listino e dei coefficienti
type Alimentazione = 'cavo' | 'batteria' | null;
interface ModelloListino {
  id: string;
  label: string;
  prezzo: number;
  alimentazione: Alimentazione;
  highlight?: boolean;
}
type Coefficienti = {
  senza_servizi: Record<string, number>;
  con_servizi: Record<string, number>;
};

// Tipi accessori: una voce e' un add-on (spazzola o accessorio).
// step = incremento del counter (es. 2 per "in coppia"), max = limite superiore.
interface Accessorio {
  id: string;
  label: string;
  prezzo: number;
  step: number;
  max: number;
  note?: string;
}
interface AccessoriFamiglia {
  spazzole: Accessorio[];
  extra: Accessorio[];
}
type AccessoriDB = Record<string, AccessoriFamiglia>;

const DURATE = [24, 36, 48, 60] as const;
type Durata = typeof DURATE[number];

// Ricavo "famiglia" dal label rimuovendo " a cavo"/" a batteria".
// Serve a presentare un dropdown "Modello" piu' pulito (Duplex 340 invece di due voci separate).
function familyOf(item: ModelloListino): string {
  return item.label.replace(/ a (cavo|batteria)$/i, '');
}

interface Famiglia {
  nome: string;
  varianti: ModelloListino[];
  hasAlimentazione: boolean;
}

function buildFamiglie(items: ModelloListino[]): Famiglia[] {
  const map = new Map<string, ModelloListino[]>();
  items.forEach((item) => {
    const f = familyOf(item);
    const arr = map.get(f) ?? [];
    arr.push(item);
    map.set(f, arr);
  });
  return Array.from(map.entries()).map(([nome, varianti]) => ({
    nome,
    varianti,
    hasAlimentazione: varianti.some((v) => v.alimentazione !== null),
  }));
}

function formatEuro(n: number): string {
  return new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0 }).format(n);
}

// GTM helper: push event al dataLayer se presente
function trackEvent(name: string, payload: Record<string, unknown> = {}) {
  if (typeof window === 'undefined') return;
  const w = window as unknown as { dataLayer?: unknown[] };
  w.dataLayer = w.dataLayer ?? [];
  w.dataLayer.push({ event: name, ...payload });
}

export default function DuplexSimulator() {
  const items = listino as ModelloListino[];
  const coeff = coefficienti as Coefficienti;
  const accessori = accessoriDB as AccessoriDB;
  const famiglie = useMemo(() => buildFamiglie(items), [items]);

  // Stato simulatore. Default: Ultrax 45.
  const [famigliaNome, setFamigliaNome] = useState<string>('Ultrax 45');
  const [alimentazione, setAlimentazione] = useState<'cavo' | 'batteria'>('cavo');
  const [quantita, setQuantita] = useState<Record<string, number>>({});
  const [durata, setDurata] = useState<Durata>(60);
  const [serviziInclusi, setServiziInclusi] = useState<boolean>(false);

  const famigliaCorrente = famiglie.find((f) => f.nome === famigliaNome) ?? famiglie[0];

  // Variante attiva: se la famiglia ha alimentazione, scelgo la variante con quella alimentazione,
  // altrimenti prendo la prima variante della famiglia.
  const varianteAttiva: ModelloListino = useMemo(() => {
    if (!famigliaCorrente) return items[0];
    if (famigliaCorrente.hasAlimentazione) {
      const found = famigliaCorrente.varianti.find((v) => v.alimentazione === alimentazione);
      return found ?? famigliaCorrente.varianti[0];
    }
    return famigliaCorrente.varianti[0];
  }, [famigliaCorrente, alimentazione, items]);

  // Accessori disponibili per la famiglia corrente.
  // L'ordine in pagina e' spazzole + extra concatenati.
  const accessoriFamiglia: AccessoriFamiglia = accessori[famigliaNome] ?? { spazzole: [], extra: [] };
  const tuttiAccessori: Accessorio[] = useMemo(
    () => [...accessoriFamiglia.spazzole, ...accessoriFamiglia.extra],
    [accessoriFamiglia],
  );

  // Aggregato accessori: somma di (quantita x prezzo) per ogni voce della famiglia corrente.
  const totaleAccessori = useMemo(
    () => tuttiAccessori.reduce((sum, acc) => sum + (quantita[acc.id] ?? 0) * acc.prezzo, 0),
    [tuttiAccessori, quantita],
  );

  // Calcoli
  const prezzoFinale = varianteAttiva.prezzo + totaleAccessori;
  const coefficiente = (serviziInclusi ? coeff.con_servizi : coeff.senza_servizi)[String(durata)] ?? 0;
  const canoneMensile = Math.round(prezzoFinale * coefficiente);
  const importoTrimestrale = canoneMensile * 3;
  const totaleCorrisposto = canoneMensile * durata;
  const mensileDisponibile = prezzoFinale > 10000;

  // Stringa configurazione: viene scritta nell'hidden field del form principale
  // cosi' arriva al webhook insieme al lead. Include il dettaglio accessori scelti.
  const dettaglioAccessori = useMemo(
    () =>
      tuttiAccessori
        .filter((acc) => (quantita[acc.id] ?? 0) > 0)
        .map((acc) => `${quantita[acc.id]}x ${acc.label}`)
        .join(', '),
    [tuttiAccessori, quantita],
  );

  const configurazione = useMemo(() => {
    const parts = [
      varianteAttiva.label,
      `${durata} mesi`,
      serviziInclusi ? 'servizi inclusi' : 'senza servizi',
      `canone ${canoneMensile} euro`,
      dettaglioAccessori ? `accessori: ${dettaglioAccessori}` : null,
    ].filter(Boolean);
    return parts.join(' - ');
  }, [varianteAttiva, durata, serviziInclusi, canoneMensile, dettaglioAccessori]);

  // Sincronizza l'hidden #dx-form-config: il form Astro lo legge al submit.
  useEffect(() => {
    const el = document.getElementById('dx-form-config') as HTMLInputElement | null;
    if (el) el.value = configurazione;
  }, [configurazione]);

  // Tracking: cambio modello/durata/servizi/accessori
  useEffect(() => {
    trackEvent('duplex_simulator_changed', {
      modello: varianteAttiva.label,
      durata,
      servizi: serviziInclusi,
      accessori: dettaglioAccessori || 'nessuno',
      canone: canoneMensile,
    });
  }, [varianteAttiva.label, durata, serviziInclusi, dettaglioAccessori, canoneMensile]);

  // Quando cambia famiglia, normalizzo alimentazione e azzero quantita' accessori
  // (gli accessori sono per-famiglia, non hanno senso da portarsi dietro).
  useEffect(() => {
    if (famigliaCorrente?.hasAlimentazione) {
      const valida = famigliaCorrente.varianti.some((v) => v.alimentazione === alimentazione);
      if (!valida) {
        const primaConAlim = famigliaCorrente.varianti.find((v) => v.alimentazione !== null);
        if (primaConAlim?.alimentazione) setAlimentazione(primaConAlim.alimentazione);
      }
    }
    setQuantita({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [famigliaNome]);

  function changeQuantita(acc: Accessorio, delta: number) {
    setQuantita((prev) => {
      const current = prev[acc.id] ?? 0;
      const next = Math.max(0, Math.min(acc.max, current + delta * acc.step));
      return { ...prev, [acc.id]: next };
    });
  }

  function handleCtaClick() {
    trackEvent('duplex_simulator_cta_clicked', {
      modello: varianteAttiva.label,
      durata,
      canone: canoneMensile,
    });
    const target = document.getElementById('contatti');
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <section class="dx-sim" id="simulatore">
      <div class="dx-sim__inner">
        <h2 class="dx-sim__title">Calcola il tuo canone</h2>
        <p class="dx-sim__sub">Configurazione macchina, durata, servizi inclusi. Il canone aggiorna in tempo reale.</p>

        <div class="dx-sim__grid">
          {/* COLONNA SINISTRA: input */}
          <div class="dx-sim__panel">
            <div class="dx-sim__field">
              <label class="dx-sim__label" for="dx-sim-modello">Modello</label>
              <select
                id="dx-sim-modello"
                class="dx-sim__select"
                value={famigliaNome}
                onChange={(e) => setFamigliaNome((e.target as HTMLSelectElement).value)}
              >
                {famiglie.map((f) => {
                  // Per il prezzo da mostrare in label, prendo la variante "default" della famiglia
                  // (a cavo se c'e', altrimenti la prima).
                  const display = f.varianti.find((v) => v.alimentazione === 'cavo') ?? f.varianti[0];
                  return (
                    <option value={f.nome}>
                      {f.nome} - {formatEuro(display.prezzo)} euro
                    </option>
                  );
                })}
              </select>
            </div>

            {famigliaCorrente?.hasAlimentazione && (
              <div class="dx-sim__field">
                <label class="dx-sim__label" for="dx-sim-alim">Alimentazione</label>
                <select
                  id="dx-sim-alim"
                  class="dx-sim__select"
                  value={alimentazione}
                  onChange={(e) => setAlimentazione((e.target as HTMLSelectElement).value as 'cavo' | 'batteria')}
                >
                  {famigliaCorrente.varianti
                    .filter((v) => v.alimentazione !== null)
                    .map((v) => (
                      <option value={v.alimentazione as string}>
                        a {v.alimentazione} - {formatEuro(v.prezzo)} euro
                      </option>
                    ))}
                </select>
              </div>
            )}

            {tuttiAccessori.length > 0 && (
              <div class="dx-sim__field">
                <label class="dx-sim__label">Accessori opzionali</label>
                <ul class="dx-sim__acc-list">
                  {tuttiAccessori.map((acc) => {
                    const q = quantita[acc.id] ?? 0;
                    return (
                      <li class="dx-sim__acc-row">
                        <div class="dx-sim__acc-info">
                          <span class="dx-sim__acc-label">{acc.label}</span>
                          <span class="dx-sim__acc-meta">
                            {formatEuro(acc.prezzo)} euro
                            {acc.step > 1 ? ` x ${acc.step} (${acc.note ?? 'multipli di ' + acc.step})` : ''}
                          </span>
                        </div>
                        <div class="dx-sim__counter" role="group" aria-label={`Quantita ${acc.label}`}>
                          <button
                            type="button"
                            class="dx-sim__counter-btn"
                            onClick={() => changeQuantita(acc, -1)}
                            disabled={q === 0}
                            aria-label={`Diminuisci ${acc.label}`}
                          >
                            -
                          </button>
                          <span class="dx-sim__counter-val" aria-live="polite">{q}</span>
                          <button
                            type="button"
                            class="dx-sim__counter-btn"
                            onClick={() => changeQuantita(acc, +1)}
                            disabled={q >= acc.max}
                            aria-label={`Aumenta ${acc.label}`}
                          >
                            +
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <div class="dx-sim__field">
              <label class="dx-sim__label">Durata</label>
              <div class="dx-sim__tabs" role="tablist" aria-label="Durata contratto">
                {DURATE.map((d) => (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={durata === d}
                    class={`dx-sim__tab ${durata === d ? 'dx-sim__tab--active' : ''}`}
                    onClick={() => setDurata(d)}
                  >
                    {d} mesi
                  </button>
                ))}
              </div>
            </div>

            <label class="dx-sim__toggle">
              <input
                type="checkbox"
                checked={serviziInclusi}
                onChange={(e) => setServiziInclusi((e.target as HTMLInputElement).checked)}
              />
              <span>Includi manutenzione e assicurazione</span>
            </label>
          </div>

          {/* COLONNA DESTRA: output */}
          <div class="dx-sim__results">
            <div class="dx-sim__hero" aria-live="polite">
              <p class="dx-sim__hero-label">Canone mensile</p>
              <p class="dx-sim__hero-value">{formatEuro(canoneMensile)} euro</p>
              <p class="dx-sim__hero-note">IVA esclusa, deducibile 100%</p>
            </div>

            <div class="dx-sim__detail">
              <h3 class="dx-sim__detail-h">Come funziona il pagamento</h3>
              <p class="dx-sim__detail-row">
                <strong>Pagamento:</strong> trimestrale anticipato ({formatEuro(canoneMensile)} x 3 = {formatEuro(importoTrimestrale)} euro)
              </p>
              <p class="dx-sim__detail-row">
                <strong>Promo lancio:</strong> grace period + pro rata dal giorno di consegna. Inizi a pagare a settembre.
              </p>
              <p class="dx-sim__detail-row">
                <strong>Pagamento mensile:</strong> {mensileDisponibile
                  ? 'disponibile su questa configurazione (importo sopra i 10.000 euro), con maggiorazione del 5%.'
                  : 'disponibile per importi sopra i 10.000 euro (+5%).'}
              </p>
              <p class="dx-sim__detail-row">
                <strong>Totale corrisposto in {durata} mesi:</strong> {formatEuro(totaleCorrisposto)} euro
              </p>
            </div>

            <p class="dx-sim__disclaimer">
              Stima indicativa, condizioni finali soggette a delibera della società di locazione.
            </p>

            <button type="button" class="dx-sim__cta" onClick={handleCtaClick}>
              Richiedi questa configurazione
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
