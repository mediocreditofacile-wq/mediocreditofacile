// Configurazione di Enrico Bergamelli sul motore dei portali, settore "mezzi" (spec
// mcf_spec-bergamelli-motore_v2, decisioni di Alberto del 22 e 23/10/2026). La usano il
// seed (scripts/seed-motore-bergamelli.ts) e i test. Dopo il primo caricamento vive nel
// database: venditori, categorie e leasing si cambiano dal Pannello MCF, i canali (e le
// loro condizioni sul bene) solo da qui o dal database.
//
// Nessun catalogo: i beni si descrivono a mano nel portale, categoria e prezzo.
//
// Da dove vengono i dati dei venditori:
//  - Manc S.r.l.: i dati veri li ha dati Alberto il 23/10/2026 (ragione sociale, partita
//    IVA, sede, PEC); telefono ed email non ci sono e restano vuoti;
//  - Nol System Italia S.r.l.: l'offerta del 26/06/2026 a un cliente di MCF (fuori dal
//    repo: qui non si scrivono nomi o importi dei clienti).
// Un codice di venditore scritto nei canali e uno scritto qui devono coincidere: il Pannello
// non lo controlla (CLAUDE.md, /portale/bergamelli), lo controlla il test di questo file.

import type { CanaleConfig } from './config-distinta';
import type { ConfigMezzi } from './config-mezzi';
import type { RegoleSemaforo, Settore } from './carrozzeria';

// --- venditori e categorie ------------------------------------------------------------

export const CONFIG_MEZZI_BERGAMELLI: ConfigMezzi = {
  venditori: [
    {
      codice: 'manc',
      ragioneSociale: 'MANC SRL',
      piva: '03863700989',
      indirizzo: "Via dell'Industria 81, 25039 Travagliato (BS)",
      telefono: '',
      email: '',
      pec: 'mancsrl@legalmail.it',
      categorie: ['Gru a torre', 'Autogru'],
    },
    // Il venditore di tutto il resto: nessuna categoria elencata
    {
      codice: 'nolsystem',
      ragioneSociale: 'NOL SYSTEM ITALIA SRL',
      piva: '05400750260',
      indirizzo: 'Via Solferino San Martino 3, 31100 Treviso (TV)',
      telefono: '+39 039 64210655',
      email: 'info@nolsystem.com',
      pec: 'nolsystemitalia@pec.it',
      categorie: [],
    },
  ],
  // targato: false/true = il default della categoria; null = la domanda si fa sempre
  // (un escavatore o una piattaforma possono essere targati o no, e non si indovina)
  categorie: [
    { nome: 'Gru a torre', targato: false },
    { nome: 'Autogru', targato: true },
    { nome: 'Movimento terra', targato: null },
    { nome: 'Piattaforme aeree', targato: null },
    { nome: 'Carrelli elevatori', targato: false },
    { nome: 'Autocarri', targato: true },
    { nome: 'Ponteggi', targato: false },
    { nome: 'Attrezzature', targato: false },
  ],
  // Spread del leasing (spec, sezione 5): Alba cambia listino fra 48 e 60 mesi
  leasing: {
    anticipoPerc: 10,
    partner: [
      { partner: 'sella', spreadFinoA48: 2.25, spreadDa60: 2.25 },
      { partner: 'credem', spreadFinoA48: 2.9, spreadDa60: 2.9 },
      { partner: 'alba', spreadFinoA48: 3.1, spreadDa60: 2.5 },
    ],
  },
  // A schermo i nomi dei partner si vedono, nei PDF mai
  mostraNomiPartner: true,
};

// --- canali, in ordine di priorita' (spec, sezione 4) ---------------------------------

export const CANALI_BERGAMELLI: CanaleConfig[] = [
  // Nol System: solo clienti oltre 5 milioni di fatturato e beni da 150.000 euro, mai i mezzi
  // targati (come su Grenke: il noleggio del targato lo valuta MCF su richiesta). La tabella
  // si chiama ancora econocom-pa perche' e' l'id salvato nella configurazione dei canali
  {
    canale: 'econocom', attivo: true, tabella: 'econocom-pa', maggiorazionePerc: 0,
    fatturatoMin: 5_000_000, importoMin: 150_000, venditori: ['nolsystem'], escludiTargati: true,
  },
  // Manc: Sputnik, ma non i mezzi targati e non i ponteggi
  {
    canale: 'grenke', attivo: true, tabella: 'sputnik', maggiorazionePerc: 0,
    venditori: ['manc'], categorieEscluse: ['Ponteggi'], escludiTargati: true,
  },
];

// --- fornitore e carrozzeria ----------------------------------------------------------

/** Quello che il seed scrive in app.fornitore e app.carrozzeria (nomi dei campi in camelCase) */
export const CARROZZERIA_BERGAMELLI: {
  slug: string;
  nome: string;
  citta: string | null;
  prefisso: string;
  tabellaCanoni: string;
  brand: { colore: string | null; accento: string | null };
  settore: Settore;
  etichettaBene: string;
  partnerLeasing: string;
  sogliaLeasing: number;
  tettoMeseEuro: number;
  demo: boolean;
  documentiExtra: string[];
  tabellaAlternativa: string | null;
  regoleSemaforo: RegoleSemaforo;
  leasing: boolean;
  prezzoVerifica: number | null;
} = {
  slug: 'bergamelli',
  nome: 'Enrico Bergamelli · Manc e Nol System',
  citta: null,
  prefisso: 'EB',
  // Il listino del fornitore; i canali sopra decidono quale tabella quota davvero
  tabellaCanoni: 'sputnik',
  // Nessun colore: la testata resta in viola MCF
  brand: { colore: null, accento: null },
  settore: 'mezzi',
  etichettaBene: 'Mezzo',
  // Irrilevante sui mezzi, i partner del leasing stanno nella configurazione
  partnerLeasing: 'alba',
  sogliaLeasing: 0,
  tettoMeseEuro: 30,
  demo: false,
  documentiExtra: ['Offerta del venditore'],
  tabellaAlternativa: null,
  // Un cliente rosso non blocca: la pratica arriva a MCF marcata da rivalutare
  regoleSemaforo: 'locatore',
  leasing: true,
  // Nessun addebito a Enrico per le verifiche (spec, D5)
  prezzoVerifica: null,
};
