import { useEffect, useMemo, useState } from 'preact/hooks';
import listino from '../../data/duplex-listino.json';
import accessoriDB from '../../data/duplex-accessori.json';
import { coefficienteGrace, graceDisponibile } from '../../data/duplex-grace';
import { coefficienteSputnik } from '../../data/duplex-sputnik';
import {
  polizzaAnnua,
  riscatto,
  speseIstruttoria,
  totaleContratto,
} from '../../data/duplex-costi';
import {
  calendarioPagamenti,
  dataEstesa,
  trimestreEsteso,
  type TabellaCanoni,
} from '../../lib/duplex-calendario';
import './duplex-simulator.css';

// Tipi del listino e dei coefficienti
// 'steam' non e' un'alimentazione ma un allestimento (vapore): sta qui perche' nel
// selettore occupa lo stesso posto di cavo e batteria, come terza variante della famiglia.
type Alimentazione = 'cavo' | 'batteria' | 'steam' | null;
interface ModelloListino {
  id: string;
  label: string;
  prezzo: number;
  alimentazione: Alimentazione;
  highlight?: boolean;
}
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

// Ricavo "famiglia" dal label rimuovendo il suffisso di variante (" a cavo", " a batteria", " Steam").
// Serve a presentare un dropdown "Modello" piu' pulito (Duplex 340 invece di tre voci separate).
function familyOf(item: ModelloListino): string {
  return item.label.replace(/ (a (cavo|batteria)|steam)$/i, '');
}

// Etichetta della variante nel selettore: "a cavo"/"a batteria" reggono la preposizione, "steam" no.
function etichettaVariante(a: Exclude<Alimentazione, null>): string {
  return a === 'steam' ? 'steam (vapore)' : `a ${a}`;
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

// L'italiano di default non separa le migliaia sotto le cinque cifre (1931 invece di
// 1.931): nel preventivo al cliente il separatore ci vuole sempre.
function euroPdf(n: number): string {
  const intero = Math.abs(n % 1) < 0.005;
  return new Intl.NumberFormat('it-IT', {
    useGrouping: 'always',
    minimumFractionDigits: intero ? 0 : 2,
    maximumFractionDigits: intero ? 0 : 2,
  }).format(n);
}

function formatEuroCent(n: number): string {
  return new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

// Data di oggi in formato yyyy-mm-dd per l'input date (fuso locale, non UTC).
function oggiIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daIso(s: string): Date {
  const [y, m, g] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, g || 1);
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
  const accessori = accessoriDB as AccessoriDB;
  const famiglie = useMemo(() => buildFamiglie(items), [items]);

  // Stato simulatore. Default: Ultrax 45.
  const [famigliaNome, setFamigliaNome] = useState<string>('Ultrax 45');
  const [alimentazione, setAlimentazione] = useState<Exclude<Alimentazione, null>>('cavo');
  const [quantita, setQuantita] = useState<Record<string, number>>({});
  const [durata, setDurata] = useState<Durata>(60);
  const [intestatario, setIntestatario] = useState<string>('');
  const [agente, setAgente] = useState<string>('');
  const [pdfInCorso, setPdfInCorso] = useState<boolean>(false);
  const [tabella, setTabella] = useState<TabellaCanoni>('tradizionale');
  const [consegna, setConsegna] = useState<string>(oggiIso());

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
  // Le due tabelle Grenke attive sul fornitore Duplex International: Sputnik (che in
  // pagina si chiama "tradizionale") e Grace Period. Tutte e due vanno a fasce di importo.
  // Il canone e' sempre "nudo": manutenzione e assicurazione non ci stanno dentro.
  // La polizza all risk si fattura a parte (vedi duplex-costi.ts).
  const cSputnik = coefficienteSputnik(prezzoFinale, durata);
  const coeffTradizionale = (cSputnik ?? 0) / 100;
  const cGrace = coefficienteGrace(prezzoFinale, durata);
  const graceApplicabile = cGrace !== null;
  const tabellaEffettiva: TabellaCanoni = tabella === 'grace' && graceApplicabile ? 'grace' : 'tradizionale';
  const coefficiente = tabellaEffettiva === 'grace' ? (cGrace as number) / 100 : coeffTradizionale;
  // Ai centesimi, non all'intero: su certe macchine il coefficiente da 60,37 e
  // arrotondando a 60 il preventivo prometterebbe meno di quanto dira' il contratto.
  const canoneMensile = Math.round(prezzoFinale * coefficiente * 100) / 100;
  const calendario = useMemo(
    () => calendarioPagamenti(daIso(consegna), canoneMensile, durata, tabellaEffettiva),
    [consegna, canoneMensile, durata, tabellaEffettiva],
  );
  // Stessa consegna con l'altra tabella: serve solo la data, il canone non conta.
  const tabellaAlternativa: TabellaCanoni = tabellaEffettiva === 'grace' ? 'tradizionale' : 'grace';
  const alternativa = useMemo(
    () => calendarioPagamenti(daIso(consegna), canoneMensile, durata, tabellaAlternativa),
    [consegna, canoneMensile, durata, tabellaAlternativa],
  );
  const coeffAlternativo = tabellaEffettiva === 'grace' ? coeffTradizionale : (cGrace ?? 0) / 100;
  const canoneAlternativo = Math.round(prezzoFinale * coeffAlternativo * 100) / 100;
  const ultimoGiornoFinestra = new Date(
    calendario.inizioLocazione.getFullYear(),
    calendario.inizioLocazione.getMonth(),
    0,
  );
  const importoTrimestrale = canoneMensile * 3;
  const totaleCorrisposto = canoneMensile * durata;
  const mensileDisponibile = prezzoFinale > 10000;
  const istruttoria = speseIstruttoria(prezzoFinale);
  const polizza = polizzaAnnua(prezzoFinale);
  const riscattoFinale = riscatto(prezzoFinale, durata);
  const totaleTutto = totaleContratto(prezzoFinale, canoneMensile, durata);

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
      tabellaEffettiva === 'grace' ? 'tabella Grace Period' : 'tabella tradizionale',
      `consegna prevista ${dataEstesa(calendario.consegna)}`,
      `canone ${euroPdf(canoneMensile)} euro`,
      dettaglioAccessori ? `accessori: ${dettaglioAccessori}` : null,
    ].filter(Boolean);
    return parts.join(' - ');
  }, [varianteAttiva, durata, canoneMensile, dettaglioAccessori, tabellaEffettiva, calendario]);

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
      tabella: tabellaEffettiva,
      accessori: dettaglioAccessori || 'nessuno',
      canone: canoneMensile,
    });
  }, [varianteAttiva.label, durata, dettaglioAccessori, canoneMensile, tabellaEffettiva]);

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

  // Preventivo PDF in livrea Duplex, da mandare al cliente finale: nessun riferimento
  // alla societa' di locazione, nessun dato interno. Stessi numeri del simulatore.
  async function handleScaricaPdf() {
    setPdfInCorso(true);
    try {
      const html2pdf = (await import('html2pdf.js')).default;
      const BLU = '#1B3A57';
      const ARANCIO = '#E66A2C';
      const GRIGIO = '#F2F0EC';
      const BORDO = '#D9D7D2';

      const graceScelto = tabellaEffettiva === 'grace';
      const canoneStd = graceScelto ? canoneAlternativo : canoneMensile;
      const canoneGrace = graceScelto ? canoneMensile : canoneAlternativo;
      const mostraGrace = graceApplicabile && canoneGrace > 0;
      const calStd = graceScelto ? alternativa : calendario;
      const calGrace = graceScelto ? calendario : alternativa;

      // Colonna: canone, trimestre, quando parte a pagare.
      const colonna = (titolo: string, tag: string, canone: number, cal: typeof calendario, grace: boolean) => `
        <div style="border:1px solid ${grace ? '#f3c9ad' : BORDO};background:${grace ? '#fffaf6' : '#fff'};border-radius:3px;padding:11px 14px;">
          <span style="display:inline-block;font-size:9px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;padding:3px 6px;border-radius:2px;margin-bottom:6px;background:${grace ? '#FCEBDF' : '#e7ecf1'};color:${grace ? '#9a4a1c' : BLU};">${tag}</span>
          <div style="font-size:14px;font-weight:800;margin-bottom:4px;">${titolo}</div>
          <div style="font-size:25px;font-weight:800;color:${BLU};line-height:1.1;">${euroPdf(canone)} euro <span style="font-size:12px;font-weight:600;color:#666;">al mese</span></div>
          <div style="font-size:11.5px;color:#444;line-height:1.5;margin-top:6px;">
            Fattura trimestrale anticipata di <b style="color:${BLU}">${euroPdf(canone * 3)} euro</b>.
            Con consegna il ${dataEstesa(cal.consegna)}, la prima fattura arriva il <b style="color:${BLU}">${dataEstesa(cal.primaFattura)}</b>.
          </div>
        </div>`;

      const riga = (voce: string, nota: string, a: string, b: string, pari: boolean, tot = false) => `
        <tr>
          <td style="padding:4px 9px;border-bottom:1px solid ${BORDO};vertical-align:top;background:${tot ? GRIGIO : pari ? '#faf9f7' : '#fff'};${tot ? `font-weight:800;color:${BLU};border-bottom:0;` : ''}">
            ${voce}${nota ? `<span style="display:block;font-size:9.5px;color:#777;line-height:1.35;margin-top:2px;font-weight:400;">${nota}</span>` : ''}
          </td>
          <td style="padding:4px 9px;border-bottom:1px solid ${BORDO};text-align:right;white-space:nowrap;background:${tot ? GRIGIO : pari ? '#faf9f7' : '#fff'};${tot ? `font-weight:800;color:${BLU};border-bottom:0;` : ''}">${a}</td>
          ${mostraGrace ? `<td style="padding:4px 9px;border-bottom:1px solid ${BORDO};text-align:right;white-space:nowrap;background:${tot ? GRIGIO : pari ? '#faf9f7' : '#fff'};${tot ? `font-weight:800;color:${BLU};border-bottom:0;` : ''}">${b}</td>` : ''}
        </tr>`;

      const eur = (n: number) => `${euroPdf(n)} euro`;
      const totStd = totaleContratto(prezzoFinale, canoneStd, durata);
      const totGrace = totaleContratto(prezzoFinale, canoneGrace, durata);

      const html = `
        <div style="font-family:'Manrope',Helvetica,Arial,sans-serif;color:#1A1A1A;width:700px;">
          <div style="background:${BLU};color:#fff;padding:20px 26px 16px;">
            <div style="font-weight:800;letter-spacing:0.22em;font-size:12px;margin-bottom:14px;">DUPLEX<span style="color:${ARANCIO}"> · </span>NOLEGGIO OPERATIVO</div>
            <div style="font-size:22px;font-weight:800;line-height:1.15;margin-bottom:6px;">${varianteAttiva.label}<br>Cosa paga il cliente, voce per voce</div>
            <div style="font-size:12px;line-height:1.45;color:#d5dde6;">Noleggio operativo a ${durata} mesi. Nessun anticipo, canone interamente deducibile, IVA detraibile sulla singola fattura.</div>
          </div>

          <div style="padding:12px 26px 12px;">
            <div style="background:${GRIGIO};border-left:4px solid ${ARANCIO};padding:9px 14px;margin-bottom:12px;display:flex;justify-content:space-between;gap:16px;">
              <b style="font-size:13px;color:${BLU};">${varianteAttiva.label}${dettaglioAccessori ? ` + ${dettaglioAccessori}` : ''}</b>
              <span style="font-size:11.5px;color:#444;">${euroPdf(prezzoFinale)} euro imponibile · ${euroPdf(prezzoFinale * 1.22)} euro IVA inclusa</span>
            </div>

            ${intestatario.trim() ? `<div style="border:1px solid ${BORDO};border-radius:3px;padding:9px 14px;margin-bottom:12px;">
              <div style="font-size:9.5px;color:#777;text-transform:uppercase;letter-spacing:0.06em;">Preventivo per</div>
              <div style="font-size:13.5px;font-weight:700;color:${BLU};">${intestatario.trim()}</div>
            </div>` : ''}

            <div style="font-size:14px;font-weight:800;color:${BLU};margin-bottom:8px;">${mostraGrace ? 'Due modi di partire' : 'Il canone'}</div>
            <div style="display:grid;grid-template-columns:${mostraGrace ? '1fr 1fr' : '1fr'};gap:12px;margin-bottom:12px;">
              ${colonna('Canone standard', 'Paga da subito', canoneStd, calStd, false)}
              ${mostraGrace ? colonna('Con trimestre di grazia', 'Paga dopo', canoneGrace, calGrace, true) : ''}
            </div>

            <div style="font-size:14px;font-weight:800;color:${BLU};margin-bottom:6px;">Tutte le voci, niente escluso</div>
            <table style="width:100%;border-collapse:collapse;font-size:10.5px;margin-bottom:8px;">
              <thead><tr>
                <th style="text-align:left;font-size:9px;letter-spacing:0.06em;text-transform:uppercase;color:#fff;background:${BLU};padding:6px 9px;">Voce</th>
                <th style="text-align:right;font-size:9px;letter-spacing:0.06em;text-transform:uppercase;color:#fff;background:${BLU};padding:6px 9px;">Canone standard</th>
                ${mostraGrace ? `<th style="text-align:right;font-size:9px;letter-spacing:0.06em;text-transform:uppercase;color:#fff;background:${BLU};padding:6px 9px;">Con trimestre di grazia</th>` : ''}
              </tr></thead>
              <tbody>
                ${riga('Anticipo', 'Non è previsto alcun anticipo.', '0', '0', false)}
                ${riga(
                  'Pro rata alla consegna',
                  `Dalla consegna all'inizio del trimestre: canone diviso 30, per i giorni di utilizzo. Con la grazia si paga in coda al contratto.`,
                  `${euroPdf(canoneStd / 30)} euro al giorno`,
                  `${euroPdf(canoneGrace / 30)} euro al giorno`,
                  true,
                )}
                ${riga('Spese di istruttoria', `Una tantum, all'avvio del contratto.`, eur(istruttoria), eur(istruttoria), false)}
                ${riga(
                  `Canoni, ${durata} mesi`,
                  `Fatturati a trimestre anticipato, ${durata / 3} fatture in tutto. Il canone è interamente deducibile.`,
                  eur(canoneStd * durata),
                  eur(canoneGrace * durata),
                  true,
                )}
                ${riga(
                  `Polizza all risk, ${euroPdf(polizza)} euro all'anno`,
                  `Obbligatoria sul bene: incendio, furto, atti vandalici, danni accidentali ed elettrici. <b>La prima fattura arriva alla decorrenza del contratto</b>, poi una a ogni inizio anno. Costa il 3,55% del valore${polizza === 115 ? `, qui ${euroPdf((prezzoFinale * 3.55) / 100)} euro, ma la quota minima fatturabile è 115 euro l'anno: si paga quella` : ''}.`,
                  `${euroPdf(polizza)} euro all'anno`,
                  `${euroPdf(polizza)} euro all'anno`,
                  false,
                )}
                ${riscattoFinale !== null ? riga('Riscatto a fine contratto', 'Facoltativo: in alternativa si restituisce la macchina o si prosegue il noleggio a canone ridotto.', eur(riscattoFinale), eur(riscattoFinale), true) : ''}
                ${riga(`Totale in ${durata} mesi, riscatto compreso`, 'Polizza esclusa: si paga a parte, una volta l\'anno.', eur(totStd), eur(totGrace), false, true)}
              </tbody>
            </table>

            <div style="background:${GRIGIO};border-radius:3px;padding:8px 12px;font-size:9.5px;line-height:1.4;color:#333;">
              <p style="margin:0 0 6px;"><b style="color:${BLU}">Sulla polizza.</b> Resta fuori dal totale perché si paga a parte ogni anno, e in caso di danno c'è una franchigia: minimo 150 euro più IVA, fino al 15% dell'indennizzo per furto, rapina e caduta, fino al 25% per fenomeno elettrico. Usura e guasti in garanzia del costruttore sono un'altra cosa e non rientrano.</p>
              <p style="margin:0;"><b style="color:${BLU}">Cosa serve per partire:</b> visura camerale, carta d'identità e codice fiscale del titolare, IBAN, email e cellulare. Risposta in 24-48 ore.</p>
            </div>

            <div style="margin-top:11px;padding-top:8px;border-top:1px solid ${BORDO};display:flex;justify-content:space-between;gap:20px;font-size:9px;color:#6a6a6a;line-height:1.4;">
              <span>Tutti gli importi sono IVA esclusa, salvo dove indicato. Preventivo indicativo: canone e condizioni definitive sono quelli del contratto di locazione, soggetto a delibera della società di locazione.</span>
              <span style="text-align:right;white-space:nowrap;">${agente.trim() ? `${agente.trim()}<br>` : ''}Locazione operativa a cura di <b style="color:${BLU}">Mediocredito Facile</b><br>+39 393 995 7840 · mediocreditofacile@gmail.com</span>
            </div>
          </div>
        </div>`;

      const contenitore = document.createElement('div');
      contenitore.innerHTML = html;
      document.body.appendChild(contenitore);

      const slug = intestatario.trim().replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
      await html2pdf()
        .set({
          margin: [8, 8, 8, 8],
          filename: `Preventivo_Duplex_${varianteAttiva.label.replace(/[^a-zA-Z0-9]/g, '_')}${slug ? '_' + slug : ''}.pdf`,
          image: { type: 'jpeg', quality: 0.95 },
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        })
        .from(contenitore.firstElementChild)
        .save();

      document.body.removeChild(contenitore);
      trackEvent('duplex_preventivo_pdf', { modello: varianteAttiva.label, durata, tabella: tabellaEffettiva });
    } finally {
      setPdfInCorso(false);
    }
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
                <label class="dx-sim__label" for="dx-sim-alim">Allestimento</label>
                <select
                  id="dx-sim-alim"
                  class="dx-sim__select"
                  value={alimentazione}
                  onChange={(e) => setAlimentazione((e.target as HTMLSelectElement).value as Exclude<Alimentazione, null>)}
                >
                  {famigliaCorrente.varianti
                    .filter((v) => v.alimentazione !== null)
                    .map((v) => (
                      <option value={v.alimentazione as string}>
                        {etichettaVariante(v.alimentazione as Exclude<Alimentazione, null>)} - {formatEuro(v.prezzo)} euro
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

            <div class="dx-sim__field">
              <label class="dx-sim__label">Tabella</label>
              <div class="dx-sim__tabs" role="tablist" aria-label="Tabella canoni">
                <button
                  type="button"
                  role="tab"
                  aria-selected={tabellaEffettiva === 'tradizionale'}
                  class={`dx-sim__tab ${tabellaEffettiva === 'tradizionale' ? 'dx-sim__tab--active' : ''}`}
                  onClick={() => setTabella('tradizionale')}
                >
                  Tradizionale
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={tabellaEffettiva === 'grace'}
                  class={`dx-sim__tab ${tabellaEffettiva === 'grace' ? 'dx-sim__tab--active' : ''}`}
                  onClick={() => setTabella('grace')}
                  disabled={!graceApplicabile}
                >
                  Grace Period
                </button>
              </div>
              <p class="dx-sim__hint">
                {!graceDisponibile
                  ? 'Tabella Grace Period in aggiornamento.'
                  : !graceApplicabile
                    ? 'Grace Period non disponibile su questo importo e durata.'
                    : tabellaEffettiva === 'grace'
                      ? 'Pro rata e primo trimestre vanno a fine contratto: il cliente paga un trimestre dopo.'
                      : 'Pro rata alla consegna, poi trimestri anticipati.'}{' '}
                <a href="#grace-period" class="dx-sim__hint-link">Come funziona</a>
              </p>
            </div>

            <div class="dx-sim__field">
              <label class="dx-sim__label" for="dx-sim-consegna">Consegna prevista</label>
              <input
                id="dx-sim-consegna"
                type="date"
                class="dx-sim__select dx-sim__date"
                value={consegna}
                onChange={(e) => {
                  const v = (e.target as HTMLInputElement).value;
                  if (v) setConsegna(v);
                }}
              />
            </div>

          </div>

          {/* COLONNA DESTRA: output */}
          <div class="dx-sim__results">
            <div class="dx-sim__hero" aria-live="polite">
              <p class="dx-sim__hero-label">Canone mensile</p>
              <p class="dx-sim__hero-value">{euroPdf(canoneMensile)} euro</p>
              <p class="dx-sim__hero-note">IVA esclusa, deducibile 100%</p>
            </div>

            <div class="dx-sim__paga" aria-live="polite">
              <p class="dx-sim__paga-label">
                {tabellaEffettiva === 'grace' ? 'Grace Period, inizia a pagare il' : 'Inizia a pagare il'}
              </p>
              <p class="dx-sim__paga-value">{dataEstesa(calendario.primaFattura)}</p>
              <p class="dx-sim__paga-note">
                Consegna entro il {dataEstesa(ultimoGiornoFinestra)}.{' '}
                {tabellaEffettiva === 'grace'
                  ? `Con la tabella tradizionale pagherebbe dal ${dataEstesa(alternativa.primaFattura)}.`
                  : graceApplicabile
                    ? `Con la Grace Period pagherebbe dal ${dataEstesa(alternativa.primaFattura)}.`
                    : ''}
              </p>
            </div>

            <div class="dx-sim__detail">
              <h3 class="dx-sim__detail-h">Come funziona il pagamento</h3>
              <p class="dx-sim__detail-row">
                <strong>Pagamento:</strong> trimestrale anticipato ({euroPdf(canoneMensile)} x 3 = {euroPdf(importoTrimestrale)} euro)
              </p>
              <p class="dx-sim__detail-row">
                <strong>Pro rata:</strong> {calendario.giorniProRata} giorni dal {dataEstesa(calendario.consegna)} al{' '}
                {dataEstesa(new Date(calendario.inizioLocazione.getTime() - 86_400_000))}, {formatEuroCent(calendario.costoGiornaliero)} euro
                al giorno = {formatEuroCent(calendario.importoProRata)} euro
                {calendario.grace ? ', spostato a fine contratto.' : ', fatturato alla consegna.'}
              </p>
              {calendario.grace && (
                <p class="dx-sim__detail-row">
                  <strong>Grace Period:</strong> il trimestre {trimestreEsteso(calendario.inizioLocazione)} va a fine contratto insieme al pro rata.
                </p>
              )}
              <p class="dx-sim__detail-row">
                <strong>Fine contratto:</strong> {dataEstesa(calendario.fineContratto)}
              </p>
              <p class="dx-sim__detail-row">
                <strong>Pagamento mensile:</strong> {mensileDisponibile
                  ? 'disponibile su questa configurazione (importo sopra i 10.000 euro), con maggiorazione del 5%.'
                  : 'disponibile per importi sopra i 10.000 euro (+5%).'}
              </p>
              <p class="dx-sim__detail-row">
                <strong>Spese di istruttoria:</strong> {formatEuro(istruttoria)} euro una tantum, all'avvio.
              </p>
              <p class="dx-sim__detail-row">
                <strong>Polizza all risk:</strong> {euroPdf(polizza)} euro all'anno, fuori dal canone e fuori dal totale.
                La prima arriva alla decorrenza, poi una a ogni inizio anno.
              </p>
              {riscattoFinale !== null && (
                <p class="dx-sim__detail-row">
                  <strong>Riscatto finale:</strong> {formatEuroCent(riscattoFinale)} euro, facoltativo.
                </p>
              )}
              <p class="dx-sim__detail-row">
                <strong>Canoni in {durata} mesi:</strong> {euroPdf(totaleCorrisposto)} euro.
                Con istruttoria e riscatto il cliente spende {euroPdf(totaleTutto)} euro, polizza esclusa.
              </p>
            </div>

            <p class="dx-sim__disclaimer">
              Stima indicativa, condizioni finali soggette a delibera della società di locazione.
            </p>

            <div class="dx-sim__pdf">
              <p class="dx-sim__pdf-h">Preventivo da mandare al cliente</p>
              <input
                type="text"
                class="dx-sim__pdf-input"
                placeholder="Intestato a (facoltativo)"
                value={intestatario}
                onInput={(e) => setIntestatario((e.target as HTMLInputElement).value)}
              />
              <input
                type="text"
                class="dx-sim__pdf-input"
                placeholder="Il tuo nome e recapito (facoltativo)"
                value={agente}
                onInput={(e) => setAgente((e.target as HTMLInputElement).value)}
              />
              <button type="button" class="dx-sim__pdf-btn" onClick={handleScaricaPdf} disabled={pdfInCorso}>
                {pdfInCorso ? 'Preparo il PDF...' : 'Scarica il preventivo in PDF'}
              </button>
              <p class="dx-sim__pdf-note">
                Una pagina con canone, spese, polizza e date: è già pulita, si manda al cliente così com'è.
              </p>
            </div>

            <button type="button" class="dx-sim__cta" onClick={handleCtaClick}>
              Richiedi questa configurazione
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
