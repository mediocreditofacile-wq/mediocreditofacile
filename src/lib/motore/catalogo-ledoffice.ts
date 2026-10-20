// Catalogo iniziale e configurazione di Led Office (Emme 2 Servizi) sul motore dei
// portali, settore "distinta" (spec mcf_spec-ledoffice-motore_v1, paragrafi 4, 9 e 11).
// Lo usano il seed (scripts/seed-motore-led-office.ts) e i test. Dopo il primo
// caricamento catalogo e configurazione vivono nel database e si cambiano dal
// Pannello MCF.
//
// Da dove vengono i prezzi, letti il 20/10/2026:
//  - il brief di Alberto del 19/10/2026, paragrafo 3 "Catalogo prodotti" (prezzi
//    unitari IVA esclusa visti sulle proposte fra luglio e ottobre 2026);
//  - le proposte di vendita Led Office emesse da Emme 2 Servizi ai clienti finali
//    passati da MCF, datate 27/05, 08/06, 15/06, 30/06, 09/07, 10/07, 28/07, 26/08,
//    05/10, 12/10, 14/10 e 15/10/2026, nelle cartelle clienti di MCF (fuori dal repo:
//    qui non si scrivono nomi, partite IVA o importi dei clienti).
// Dove lo stesso bene compare con prezzi diversi vale la proposta piu' recente, e
// accanto a ogni voce c'e' la data della proposta da cui viene il prezzo. Le
// versioni superate di una proposta contano solo se non ce n'e' una piu' nuova.
// Le righe servizi delle proposte (trasporto, installazione, configurazione) non
// sono beni e non entrano; il LEDwall nemmeno, si fa fuori listino e a progetto.

import type { Voce } from './catalogo-import';
import type { CanaleConfig, Categoria, ChecklistConfig, SocietaFornitrice } from './config-distinta';

/** Validita' del listino iniziale: oltre, la voce resta proponibile con "prezzo da riconfermare" */
export const VALIDO_FINO_LO = '2026-12-31';

// --- categorie (spec paragrafo 11, nell'ordine) ---------------------------------------

/** Settori tipici del digital signage: valgono anche per il LEDwall */
const SETTORI_SIGNAGE = ['45', '46', '47', '55', '56', '59', '68', '73', '77', '79', '82', '85', '86', '90', '93'];

export const CATEGORIE_LO: Categoria[] = [
  // PC desktop, all-in-one, mini PC, notebook, Mac
  { nome: 'Postazioni di lavoro', settoriTipici: [], postazione: true, ledwall: false },
  // PC e notebook con scheda RTX, MacBook Pro Max
  { nome: 'Workstation grafiche', settoriTipici: ['58', '59', '60', '62', '71', '72', '73', '74', '90'], postazione: true, ledwall: false },
  { nome: 'Periferiche e tablet', settoriTipici: [], postazione: false, ledwall: false },
  { nome: 'Server e stampa', settoriTipici: [], postazione: false, ledwall: false },
  { nome: 'Digital signage e display', settoriTipici: SETTORI_SIGNAGE, postazione: false, ledwall: false },
  // Solo righe fuori listino, a progetto
  { nome: 'LEDwall', settoriTipici: SETTORI_SIGNAGE, postazione: false, ledwall: true },
];

// --- checklist della pratica (spec paragrafo 9) ---------------------------------------

export const CHECKLIST_LO: ChecklistConfig = {
  voci: [
    // Nella segnalazione di un cliente rosso non si chiede (Task 12)
    { nome: 'Proposta di vendita firmata e timbrata dal cliente', obbligatoria: true },
    { nome: "Documento d'identità e tessera sanitaria del legale rappresentante, fronte e retro in un unico PDF", obbligatoria: true },
    { nome: 'Visura camerale', obbligatoria: false },
    { nome: 'Ultimi due bilanci depositati con ricevuta di deposito', obbligatoria: false, forme: ['capitali'] },
    { nome: 'Ultime due dichiarazioni dei redditi', obbligatoria: false, forme: ['individuale', 'persone'] },
    { nome: "Situazione contabile dell'anno (bilancio provvisorio)", obbligatoria: false, sopraImporto: 50_000 },
    { nome: 'Centrale Rischi recente', obbligatoria: false },
    { nome: 'Foto della sede', obbligatoria: false },
    { nome: 'Foto del luogo di installazione', obbligatoria: false },
  ],
  formati: ['pdf', 'jpg'],
};

// --- canali, in ordine di priorita' (spec paragrafo 4) --------------------------------

export const CANALI_LO: CanaleConfig[] = [
  // Tabella Econocom PA a 60 mesi: deroga dichiarata, "da confermare" a video
  { canale: 'econocom', attivo: true, tabella: 'econocom-pa', maggiorazionePerc: 0, fatturatoMin: 5_000_000, importoMin: 150_000 },
  // Spento finche' Alberto non lo riaccende. RS = SRLS, da confermare su una scheda vera
  {
    canale: 'grenke', attivo: false, tabella: 'pioneer', maggiorazionePerc: 0,
    soloCapitali: true, formeEscluse: ['RS'], anniMin: 2, settoriEsclusi: [], sogliaProvvisorio: 50_000,
  },
  // Il canale di chiusura: nessuna condizione, beni piu' 5%
  { canale: 'pagarent', attivo: true, tabella: 'pagarent', maggiorazionePerc: 5 },
];

// --- societa' che firma i documenti verso il cliente ---------------------------------

/** Il logo lo aggiunge il seed: e' un percorso sullo store Blob (brand/emme2-servizi.jpg) */
export const SOCIETA_EMME2: Omit<SocietaFornitrice, 'logo'> = {
  ragioneSociale: 'EMME 2 SERVIZI S.R.L.',
  piva: '07000311212',
  rea: 'CE-274424',
  indirizzo: 'Via Nazionale Appia 17 - 81028 Santa Maria a Vico (CE)',
  telefono: '0823 80 91 64',
  email: 'info@emme2servizi.it',
  pec: 'emme2gas@pec.it',
};

// --- catalogo ------------------------------------------------------------------------
// Codici LO-<CATEGORIA>-<MODELLO>: POST postazioni di lavoro, WS workstation grafiche,
// PER periferiche e tablet, SRV server e stampa, DS digital signage e display.
// Il nome e' la descrizione che finisce nella proposta di vendita, nello stile delle
// proposte Led Office, con i refusi delle proposte corretti.

type Riga = [codice: string, nome: string, prezzo: number, categoria: string];

const POST = 'Postazioni di lavoro';
const WS = 'Workstation grafiche';
const PER = 'Periferiche e tablet';
const SRV = 'Server e stampa';
const DS = 'Digital signage e display';

const RIGHE: Riga[] = [
  // Il brief dice 1.800-1.900: 1.800 nella proposta delle 15:36 del 15/10, 1.900 in quella delle 15:49
  ['LO-POST-AM242', 'PC ALL IN ONE MSI PRO AM242 TP 1M 23,8" I5 SSD 512GB W11', 1_900, POST], // 15/10/2026
  ['LO-POST-AIO-I5-256', 'PC ALL IN ONE MSI I5 8GB SSD 256GB W11', 951.23, POST], // 28/07/2026
  ['LO-POST-MINI-DESK-I5', 'PC MSI MINI DESK I5 16GB SSD 256GB W11 PRO', 1_538, POST], // 10/07/2026
  ['LO-POST-AP241-I7', 'PC DESKTOP MSI PRO AP241 I7 32GB SSD 1TB W11 PRO', 3_900, POST], // 09/07/2026
  ['LO-POST-MODERN-15', 'NOTEBOOK MSI MODERN 15,6" I7 16GB SSD 1TB W11 PRO', 1_950, POST], // 28/07/2026
  ['LO-POST-MACBOOK-AIR-15', 'APPLE MACBOOK AIR 15" CHIP M5 10 CORE GPU 10 CORE 24GB 1TB', 1_840, POST], // 10/07/2026
  ['LO-POST-IMAC-24', 'APPLE IMAC 24" 4.5K CHIP M4 10 CORE GPU 10 CORE 24GB 1TB', 2_100, POST], // 10/07/2026

  ['LO-WS-DESK-ULTRA', 'PC MSI DESK ULTRA I7 32GB SSD 1TB RTX 5080 W11', 4_500, WS], // 09/07/2026
  ['LO-WS-VISION-XAI', 'PC MSI VISION XAI 2NVV7 ULTRA 7 32GB SSD 2TB RTX 5080', 5_000, WS], // 28/07/2026
  ['LO-WS-CREATOR-15', 'NOTEBOOK MSI CREATOR 15,6" I7 32GB SSD 1TB RTX 4070', 2_000, WS], // 09/07/2026
  ['LO-WS-MACBOOK-PRO-14', 'APPLE MACBOOK PRO 14" CHIP M5 MAX 18 CORE GPU 32 CORE 36GB 2TB', 3_854, WS], // 10/07/2026

  ['LO-PER-MONITOR-MSI-24', 'MONITOR MSI PRO MP273 23,8" FULL HD', 130, PER], // 10/07/2026
  ['LO-PER-MONITOR-QLED-27', 'MONITOR 27" QLED X50', 800, PER], // 09/07/2026
  ['LO-PER-LOGITECH-H390', 'CUFFIE LOGITECH H390', 50, PER], // 10/07/2026
  ['LO-PER-LOGITECH-Z305', 'CUFFIE LOGITECH Z305', 82, PER], // 28/07/2026
  ['LO-PER-TAB-S10-FE', 'TABLET SAMSUNG GALAXY TAB S10 FE WIFI 128GB', 560, PER], // 15/10/2026
  ['LO-PER-TAB-GSM-11', 'TABLET SAMSUNG GALAXY 10,9" GSM CON SIM', 900, PER], // 15/06/2026

  ['LO-SRV-HP-ML30', 'SERVER HP PROLIANT ML30 TOWER XEON 2436', 6_300, SRV], // 15/10/2026
  ['LO-SRV-DELL-TOWER', 'SERVER DELL TOWER XEON 64GB DDR5 SSD 4TB GPU NVIDIA 48GB WINDOWS SERVER 2025', 14_000, SRV], // 28/07/2026
  ['LO-SRV-RICOH-C6010', 'MULTIFUNZIONE RICOH IM C6010', 6_200, SRV], // 09/07/2026
  ['LO-SRV-RICOH-C6010-KIT', 'MULTIFUNZIONE RICOH IM C6010 COMPLETA DI KIT ACCESSORI', 14_900, SRV], // 15/10/2026

  ['LO-DS-QM85', 'MONITOR PROFESSIONALE SAMSUNG QM85 85" 4K', 5_000, DS], // 15/10/2026
  ['LO-DS-85-OPS', 'MONITOR SAMSUNG 85" 4K CON MODULO OPS', 6_900, DS], // 09/07/2026
  ['LO-DS-75-OPS', 'MONITOR SAMSUNG 75" 4K WIFI CON PC OPS', 4_600, DS], // 27/05/2026
  ['LO-DS-86-8K-OPS', 'MONITOR SAMSUNG 86" 8K WIFI NFC CON PC OPS SSD 1TB', 8_000, DS], // 28/07/2026
  ['LO-DS-QM98', 'MONITOR PROFESSIONALE SAMSUNG QM98 98" 4K', 7_200, DS], // 15/06/2026
  ['LO-DS-THE-WALL-110', 'SAMSUNG THE WALL ALL IN ONE 110" 4K', 14_600, DS], // 08/06/2026
  ['LO-DS-SUPPORTO-SOFFITTO', 'SUPPORTO MOTORIZZATO CON STAFFAGGIO A SOFFITTO', 2_100, DS], // 15/06/2026
];

/**
 * Le voci del catalogo iniziale, gia' nella forma che il seed scrive in
 * app.catalogo_voce: categoria e validita' stanno negli attributi. L'ordine e'
 * quello dell'elenco, che il seed usa come ordinamento.
 */
export function vociLedOffice(): Voce[] {
  return RIGHE.map(([codice, nome, prezzo, categoria]) => ({
    codice,
    nome,
    descrizione: null,
    prezzo,
    attributi: { categoria, valido_fino: VALIDO_FINO_LO },
  }));
}
