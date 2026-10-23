// I mezzi nel browser (settore "mezzi", Bergamelli): le regole pure delle schede
// Simulazione, Proposte e Pratiche. Chi vende i beni di una categoria, la risposta di
// partenza sul targato e sull'usato, i corpi per il server, l'anticipo del leasing, la
// colonna che va nel PDF e che cosa offre la pratica partendo dal preventivo salvato.
// Spec mcf_spec-bergamelli-motore_v2, sezioni 3, 4 e 5.
//
// Niente DOM, niente rete: si testa da solo. Il server ricontrolla tutto. Dai moduli
// del server si importano solo i tipi: config-mezzi porta gli spread dei partner,
// calcolo-mezzi e pratica-mezzi i listini e il database, e nessuno entra nel bundle.
// beni-mezzi e checklist-pratica sono moduli puri, gli stessi del server.

import { buildChecklist } from '../../lib/checklist-pratica';
import { validaBeni } from '../../lib/motore/beni-mezzi';
import type { MezziSchermo } from '../../lib/motore/calcolo-mezzi';
import type { CategoriaMezzo, MezziBrowser } from '../../lib/motore/config-mezzi';
import type { ColonneMezziStorico } from '../../lib/motore/storico-mezzi';

/** Una riga dei beni come sta nelle caselle: quantita' e prezzo come li ha scritti l'agente */
export interface RigaInPagina {
  descrizione: string;
  categoria: string;
  quantita: string;
  prezzo: string;
  /** Null = l'agente non ha risposto: il server usa il default della categoria, se c'e' */
  targato: boolean | null;
  /** Falso = nuovo, la risposta di partenza. Vero toglie il noleggio e aggiunge A-Leasing */
  usato: boolean;
}

export type ColonnaLeasing = MezziSchermo['leasing'][number];

/** Lo stesso tetto del server (ANTICIPO_MAX_MEZZI in config-mezzi.ts): un test li confronta */
const ANTICIPO_MAX = 30;

/** La durata messa in evidenza, come DURATA_EVIDENZA sul server */
const DURATA_EVIDENZA = 60;

/**
 * Il venditore che firma i beni di quella categoria: quello che la elenca, altrimenti
 * il venditore di tutto il resto (categorie vuote). Null se non c'e' nessuno dei due.
 */
export function venditoreSuggerito(cfg: MezziBrowser, categoria: string): string | null {
  const v = cfg.venditori.find((x) => x.categorie.includes(categoria)) ?? cfg.venditori.find((x) => x.categorie.length === 0);
  return v?.codice ?? null;
}

/** La risposta di partenza a "il mezzo e' targato?": il default della categoria, null se non lo porta */
export function targatoIniziale(categorie: CategoriaMezzo[], nome: string): boolean | null {
  return categorie.find((c) => c.nome === nome)?.targato ?? null;
}

/**
 * Il corpo di /api/motore/proposte (e, con leasingPdf, del preventivo). Quantita' e
 * prezzo vanno come li ha scritti l'agente: "48.500,00" lo legge il server, che sa
 * dire quale riga non regge. Il targato va com'e', true, false o null, mai una stringa:
 * per il server un valore presente e non booleano e' una risposta che manca.
 */
export function corpoProposte(
  slug: string,
  ricercaId: string,
  righe: RigaInPagina[],
  venditore: string,
  anticipoPerc: number,
): Record<string, unknown> {
  return {
    f: slug,
    ricercaId,
    beni: righe.map((r) => ({
      descrizione: r.descrizione,
      categoria: r.categoria,
      quantita: r.quantita,
      prezzo: r.prezzo,
      targato: r.targato,
      usato: r.usato,
    })),
    venditore,
    anticipoPerc,
  };
}

/**
 * L'anticipo del leasing scritto nella casella: un intero da 0 a 30, come lo vuole il
 * server. Tutto il resto ("", "20%", "1.000", 45, 20,5) e' null e la pagina lo dice:
 * mai il default al posto di un valore che non si legge.
 */
export function leggiAnticipo(v: string): number | null {
  const s = String(v ?? '').trim();
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return n <= ANTICIPO_MAX ? n : null;
}

/** Una riga appena aggiunta, ancora da scrivere: la quantita' di partenza non conta */
export function rigaVuota(r: RigaInPagina): boolean {
  return !r.descrizione.trim() && !r.categoria && !r.prezzo.trim();
}

/**
 * Una riga aggiunta e mai toccata: niente scritto, la quantita' di partenza (o nessuna),
 * nessuna risposta sul targato e ancora "nuovo". Piu' stretta di rigaVuota: chi ha cambiato la
 * quantita' sta scrivendo quella riga, e deve sapere cosa le manca.
 */
export function rigaIntatta(r: RigaInPagina): boolean {
  const q = r.quantita.trim();
  return rigaVuota(r) && (q === '' || q === '1') && r.targato === null && !r.usato;
}

/**
 * Le righe che vanno al server: la prima sempre, le altre a meno che non siano ancora
 * intatte. Il bene appena aggiunto non chiede un conto e non si prende un rimprovero
 * prima che l'agente ci scriva. `indici` dice, per ogni riga mandata, il suo posto a
 * schermo: l'errore del server torna sulla riga giusta con rigaASchermo.
 */
export function righeDaMandare(righe: RigaInPagina[]): { righe: RigaInPagina[]; indici: number[] } {
  const indici = righe.flatMap((r, i) => (i === 0 || !rigaIntatta(r) ? [i] : []));
  return { righe: indici.map((i) => righe[i]), indici };
}

/** La riga a schermo di un errore del server sulle righe mandate; null per gli errori di tutto il preventivo */
export function rigaASchermo(indici: number[], riga: number | null | undefined): number | null {
  return riga == null ? null : indici[riga] ?? null;
}

/** La risposta del menu "È targato?": Sì e No, tutto il resto ("Da indicare") e' nessuna risposta */
export const targatoDaMenu = (v: string): boolean | null => (v === 'si' ? true : v === 'no' ? false : null);

/** La risposta del menu "Nuovo o usato?": usato solo se scelto, la partenza e' nuovo */
export const usatoDaMenu = (v: string): boolean => v === 'usato';

const CAMPO_ERRORE: Record<string, keyof RigaInPagina> = {
  descrizione_mancante: 'descrizione',
  categoria_non_valida: 'categoria',
  quantita_non_valida: 'quantita',
  prezzo_non_valido: 'prezzo',
  // Il totale della riga oltre il tetto: si corregge il prezzo (o la quantita')
  importo_non_valido: 'prezzo',
  targato_mancante: 'targato',
  usato_non_valido: 'usato',
};

/** La casella da segnare per un errore di riga; null per gli errori di tutto il preventivo */
export const campoDiErrore = (errore: string): keyof RigaInPagina | null => CAMPO_ERRORE[errore] ?? null;

/** Lo stesso test del server (migliaiaAmbigue in distinta.ts): "61.000" senza virgola */
const SOLO_PUNTO_MIGLIAIA = /^\d{1,3}(\.\d{3})+$/;
const senzaSimboli = (v: string) => v.replace(/[€\s]/g, '');

/**
 * Il messaggio di una riga quando quello generico non aiuta. "61.000" il server non lo
 * legge, perche' non sa se sono migliaia o decimali: la pagina dice come scriverlo.
 * Null per tutti gli altri casi, che hanno il messaggio di sempre.
 */
export function messaggioRiga(errore: string, riga: RigaInPagina | undefined): string | null {
  if (!riga) return null;
  if (errore === 'prezzo_non_valido') {
    const v = senzaSimboli(riga.prezzo);
    if (SOLO_PUNTO_MIGLIAIA.test(v)) {
      return `Scrivi ${v.replace(/\./g, '')} oppure ${v},00: con il solo punto non si capisce se sono migliaia o decimali.`;
    }
  }
  if (errore === 'quantita_non_valida') {
    const v = senzaSimboli(riga.quantita);
    if (SOLO_PUNTO_MIGLIAIA.test(v)) return `Scrivi la quantità senza punti: ${v.replace(/\./g, '')}.`;
  }
  return null;
}

// --- il leasing a schermo ---------------------------------------------------------

/** L'intestazione di una colonna: il nome del partner quando si mostra, altrimenti "Soluzione A" */
export const etichettaColonna = (c: Pick<ColonnaLeasing, 'chiave' | 'nome'>) => c.nome ?? `Soluzione ${c.chiave}`;

/** Le durate di tutte le colonne, una volta sola e in ordine: sono le righe della tabella */
export function durateLeasing(leasing: Pick<ColonnaLeasing, 'righe'>[]): number[] {
  return [...new Set(leasing.flatMap((c) => c.righe.map((r) => r.durata)))].sort((a, b) => a - b);
}

/** Le colonne che quotano: una colonna senza righe ha solo il motivo */
export const colonneConRighe = <T extends Pick<ColonnaLeasing, 'righe'>>(leasing: T[]) => leasing.filter((c) => c.righe.length > 0);

/**
 * La colonna del leasing che va nel PDF. La scelta dell'agente, finche' quella colonna
 * ha righe; altrimenti la regola del server (chiavePerPdf in preventivo-mezzi.ts): la
 * rata piu' bassa a 60 mesi se tutte le colonne li hanno, se no alla durata piu' lunga
 * in comune, se no la prima colonna con righe. A parita' resta la prima. Null se nessuna
 * colonna quota: nel PDF il leasing non c'e'.
 */
export function chiavePdf(leasing: ColonnaLeasing[], scelta: string | null): string | null {
  const colonne = colonneConRighe(leasing);
  if (colonne.length === 0) return null;
  if (scelta && colonne.some((c) => c.chiave === scelta)) return scelta;

  const comuni = colonne[0].righe
    .map((r) => r.durata)
    .filter((d) => colonne.every((c) => c.righe.some((r) => r.durata === d)));
  if (comuni.length === 0) return colonne[0].chiave;
  const durata = comuni.includes(DURATA_EVIDENZA) ? DURATA_EVIDENZA : Math.max(...comuni);

  const rata = (c: ColonnaLeasing) => c.righe.find((r) => r.durata === durata)!.rata;
  let migliore = colonne[0];
  for (const c of colonne.slice(1)) if (rata(c) < rata(migliore)) migliore = c;
  return migliore.chiave;
}

// --- la simulazione -----------------------------------------------------------------

/** La simulazione come sta nelle caselle: un bene solo, l'importo come l'ha scritto l'agente */
export interface SimulazioneInPagina {
  importo: string;
  categoria: string;
  /** Null = nessuna risposta: il server usa il default della categoria, se c'e' */
  targato: boolean | null;
  /** Falso = nuovo, la partenza */
  usato: boolean;
  venditore: string;
}

export type ProvaSimulazione = 'incompleta' | 'pronta' | 'importo_non_valido' | 'categoria_non_valida' | 'targato_mancante';

/**
 * Prima di chiedere il conto: 'incompleta' finche' mancano l'importo o la categoria
 * (niente da dire e niente da rimproverare), poi lo stesso controllo del server sul
 * bene unico (validaBeni), con l'errore del prezzo chiamato col nome del campo che
 * l'agente vede, l'importo. 'pronta' se si puo' mandare.
 */
export function provaSimulazione(categorie: CategoriaMezzo[], s: SimulazioneInPagina): ProvaSimulazione {
  if (!s.importo.trim() || !s.categoria) return 'incompleta';
  const v = validaBeni(categorie, [{ descrizione: 'Simulazione', categoria: s.categoria, quantita: 1, prezzo: s.importo, targato: s.targato, usato: s.usato }]);
  if (v.ok) return 'pronta';
  if (v.error === 'prezzo_non_valido' || v.error === 'importo_non_valido') return 'importo_non_valido';
  return v.error === 'targato_mancante' ? 'targato_mancante' : 'categoria_non_valida';
}

/**
 * Il corpo di /api/motore/simulazione sui mezzi. L'importo va come l'ha scritto l'agente
 * (lo legge il server), il targato true, false o null, mai una stringa, l'usato true o
 * false. Niente anticipo
 * (vale quello del fornitore) e niente documento: la simulazione non salva.
 */
export function corpoSimulazione(slug: string, s: SimulazioneInPagina): Record<string, unknown> {
  return { f: slug, importo: s.importo, categoria: s.categoria, targato: s.targato, usato: s.usato, venditore: s.venditore };
}

const CAMPO_SIMULAZIONE: Record<string, keyof SimulazioneInPagina> = {
  importo_non_valido: 'importo',
  categoria_non_valida: 'categoria',
  targato_mancante: 'targato',
  usato_non_valido: 'usato',
  venditore_non_valido: 'venditore',
};

/** La casella da segnare per un errore della simulazione; null per gli altri */
export const campoSimulazione = (errore: string): keyof SimulazioneInPagina | null => CAMPO_SIMULAZIONE[errore] ?? null;

/** Il messaggio quando quello generico non aiuta: "61.000" si spiega come nelle righe */
export function messaggioSimulazione(errore: string, s: SimulazioneInPagina): string | null {
  if (errore !== 'importo_non_valido') return null;
  return messaggioRiga('prezzo_non_valido', { descrizione: '', categoria: s.categoria, quantita: '1', prezzo: s.importo, targato: s.targato, usato: s.usato });
}

// --- la pratica ---------------------------------------------------------------------

/**
 * La voce in piu' della checklist sul leasing: la stessa stringa di pratica-mezzi.ts,
 * che e' un modulo del server (legge il database) e qui non si importa. Un test le
 * confronta parola per parola.
 */
export const VOCE_BILANCIO_ANALITICO =
  "Bilancio analitico dell'ultimo esercizio (bilancio di verifica o situazione contabile dettagliata)";

/** La durata di partenza del leasing, come quella in evidenza a schermo */
const DURATA_LEASING_PRATICA = 60;

/** Un preventivo salvato, come lo tiene la pagina o come torna dallo Storico: di quale cliente e con quali numeri */
export interface PreventivoPerPratica {
  id: string;
  /** La ricerca (il cliente) su cui e' stato fatto */
  ricercaId: string;
  schermo: {
    totale: number;
    /** Chi firma l'offerta: serve all'etichetta del menu */
    venditore?: { ragioneSociale: string };
    noleggio: { rate: { durata: number }[]; durataEvidenza: number | null } | null;
    leasing: { chiave: string; nome: string | null; righe: { durata: number }[] }[];
  };
  /** La colonna del leasing messa nel PDF; null se il leasing non quotava o non si sa (Storico) */
  chiaveLeasing: string | null;
}

export interface SceltePratica {
  propostaId: string;
  ricercaId: string;
  /** Il totale dei beni del preventivo: si mostra, non si scrive */
  importo: number;
  /** Null se il preventivo non quotava il noleggio (mezzo targato, nessun canale) */
  noleggio: { durate: number[]; durata: number } | null;
  /** Solo le colonne che quotano, nell'ordine dello schermo */
  leasing: { chiave: string; etichetta: string; durate: number[]; durata: number }[];
  /** La colonna di partenza; null senza leasing */
  colonna: string | null;
  prodotto: 'noleggio' | 'leasing';
}

/**
 * Che cosa offre la pratica: solo quello che il preventivo aveva. Null se il preventivo
 * manca, e' di un altro cliente (la ricerca aperta adesso e' un'altra) o non quotava
 * niente: la pratica parte da un preventivo di questo cliente. Il noleggio parte dalla
 * durata in evidenza, se no dall'ultima; il leasing dalla colonna del PDF se quota, se
 * no dalla prima che quota, a 60 mesi se la colonna li ha, se no all'ultima durata.
 */
export function sceltePratica(p: PreventivoPerPratica | null, ricercaId: string | null | undefined): SceltePratica | null {
  if (!p || !ricercaId || p.ricercaId !== ricercaId) return null;
  return offertaDelPreventivo(p, ricercaId);
}

/** Che cosa offre un preventivo gia' riconosciuto del cliente; la pratica va sulla ricerca `ricercaId` */
function offertaDelPreventivo(p: PreventivoPerPratica, ricercaId: string): SceltePratica | null {
  const rate = p.schermo.noleggio?.rate.map((r) => r.durata) ?? [];
  const evidenza = p.schermo.noleggio?.durataEvidenza ?? null;
  const noleggio = rate.length
    ? { durate: rate, durata: evidenza !== null && rate.includes(evidenza) ? evidenza : rate[rate.length - 1] }
    : null;

  const leasing = p.schermo.leasing
    .filter((c) => c.righe.length > 0)
    .map((c) => {
      const durate = c.righe.map((r) => r.durata);
      return {
        chiave: c.chiave,
        etichetta: etichettaColonna(c),
        durate,
        durata: durate.includes(DURATA_LEASING_PRATICA) ? DURATA_LEASING_PRATICA : durate[durate.length - 1],
      };
    });
  if (!noleggio && leasing.length === 0) return null;

  const colonna = leasing.some((c) => c.chiave === p.chiaveLeasing) ? p.chiaveLeasing : leasing[0]?.chiave ?? null;
  return {
    propostaId: p.id,
    ricercaId,
    importo: p.schermo.totale,
    noleggio,
    leasing,
    colonna,
    prodotto: noleggio ? 'noleggio' : 'leasing',
  };
}

/**
 * Una riga dei preventivi come la manda /api/motore/storico sul settore mezzi: le colonne
 * di sempre piu' quelle che servono alla pratica (storico-mezzi.ts). Niente rate ne' spese.
 */
export interface PreventivoStorico extends Partial<ColonneMezziStorico> {
  id: string;
  ricerca_id: string | null;
  piva: string;
  /** numeric(12,2): arriva come stringa */
  prezzo: number | string;
  creato: string;
  /** La scelta in evidenza salvata col preventivo: la sua durata e' quella di partenza del noleggio */
  scelta?: { durata?: unknown; canone?: unknown; rataLeasing?: unknown } | null;
}

/**
 * Il preventivo dello Storico nella forma da cui parte la pratica. Null se la riga non e'
 * di un preventivo di mezzi (mancano le colonne) o il prezzo non si legge. La colonna
 * messa nel PDF non si sa: sta solo in `dati`, che lo Storico non legge, quindi il
 * leasing parte dalla prima colonna che quota.
 */
export function preventivoDaStorico(r: PreventivoStorico): PreventivoPerPratica | null {
  const totale = Number(r.prezzo);
  if (!r.ricerca_id || !Number.isFinite(totale) || totale <= 0 || r.noleggio === undefined || !Array.isArray(r.leasing)) return null;
  const evidenza = r.scelta?.durata;
  return {
    id: r.id,
    ricercaId: r.ricerca_id,
    chiaveLeasing: null,
    schermo: {
      totale,
      ...(r.venditore ? { venditore: { ragioneSociale: r.venditore } } : {}),
      noleggio: r.noleggio
        ? { rate: r.noleggio.durate.map((durata) => ({ durata })), durataEvidenza: typeof evidenza === 'number' ? evidenza : null }
        : null,
      leasing: r.leasing.map((c) => ({ chiave: c.chiave, nome: c.nome, righe: c.durate.map((durata) => ({ durata })) })),
    },
  };
}

/** Un preventivo nel menu della pratica */
export interface PreventivoInMenu {
  scelte: SceltePratica;
  /** La ragione sociale del venditore; null se non si sa */
  venditore: string | null;
  /** Quando e' stato salvato; null per quello appena scaricato in questa pagina */
  creato: string | null;
}

const soloPiva = (v: unknown) => String(v ?? '').trim();

/**
 * I preventivi da cui puo' partire la pratica del cliente aperto, nell'ordine del menu:
 * prima quello appena scaricato in questa pagina, se e' di questa verifica (tiene la
 * colonna messa nel PDF), poi quelli dello Storico con la stessa partita IVA, dal piu'
 * recente, senza ripetere quello appena scaricato. Fuori quelli che non quotano niente.
 * La pratica va sempre sulla verifica aperta: il server accetta un preventivo dello
 * stesso cliente (partita IVA) e rilegge gli eventi negativi da quella verifica.
 */
export function preventiviPerPratica(
  cliente: { ricercaId: string; piva: string } | null,
  inPagina: PreventivoPerPratica | null,
  storico: PreventivoStorico[],
): PreventivoInMenu[] {
  if (!cliente) return [];
  const menu: PreventivoInMenu[] = [];
  const appena = sceltePratica(inPagina, cliente.ricercaId);
  if (appena && inPagina) menu.push({ scelte: appena, venditore: inPagina.schermo.venditore?.ragioneSociale ?? null, creato: null });

  for (const r of storico) {
    if (soloPiva(r.piva) !== soloPiva(cliente.piva) || menu.some((m) => m.scelte.propostaId === r.id)) continue;
    const p = preventivoDaStorico(r);
    const scelte = p ? offertaDelPreventivo(p, cliente.ricercaId) : null;
    if (scelte) menu.push({ scelte, venditore: r.venditore ?? null, creato: r.creato });
  }
  return menu;
}

/** La checklist a schermo: quella di forma e importo e, sul leasing, il bilancio analitico in coda, come sul server */
export function checklistPraticaMezzi(forma: string, importo: number, documentiExtra: string[], prodotto: string): string[] {
  return [...buildChecklist(forma, importo, documentiExtra), ...(prodotto === 'leasing' ? [VOCE_BILANCIO_ANALITICO] : [])];
}

/** I campi della pratica comuni a ogni settore, gia' controllati */
export interface CampiPratica {
  f: string;
  ricercaId: string;
  bozza: string;
  formaGiuridica: string;
  referente: { nome: string; telefono: string; email: string };
  iban: string;
  note: string;
  documenti: { nome: string; pathname: string; size: number }[];
}

/**
 * Il corpo di /api/motore/pratica sui mezzi: i campi di sempre, il preventivo e, sul
 * leasing, la colonna scelta. Nessun importo: il server lo rilegge dal preventivo.
 */
export function corpoPraticaMezzi(
  campi: CampiPratica,
  propostaId: string,
  prodotto: string,
  durata: number,
  leasingChiave: string | null,
): Record<string, unknown> {
  return {
    ...campi,
    propostaId,
    prodotto,
    durata,
    ...(prodotto === 'leasing' && leasingChiave ? { leasingChiave } : {}),
  };
}
