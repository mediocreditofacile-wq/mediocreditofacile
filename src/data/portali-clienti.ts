// Elenco dei portali clienti: la fonte unica dell'indice /tools/portali-clienti
// e della plancia /tools/credenziali.
//
// CLIENT-SAFE: niente password e niente note interne, perche' l'indice e' una
// pagina pubblica. Le credenziali stanno in credenziali-portali.ts (server-only)
// e la plancia le aggancia a queste voci per percorso.
//
// REGOLA: ogni portale o area riservata di un cliente o partner si raggiunge da
// Strumenti -> Portali Clienti. Un portale nuovo va in uno dei due array qui
// sotto e in CREDENZIALI: il test della plancia fallisce se manca nella seconda.

export interface PortaleCard {
  nome: string;
  href: string;
  icona: string;
  settore: string;
  descrizione: string;
  /** true per i link fuori dal dominio MCF (oggi nessuno: il tool Marotta e' passato in casa) */
  esterno?: boolean;
}

export const PORTALI_PRATICHE: PortaleCard[] = [
  {
    nome: 'Expo Energia',
    href: '/tools/expo-energia',
    icona: 'solar_power',
    settore: 'Fotovoltaico e hardware',
    descrizione:
      'Simulazione canoni su tabella ESG per il fotovoltaico e Pioneer per hardware e casse, dal prezzo di vendita alla griglia canoni su tutte le durate o dal canone al prezzo.',
  },
  {
    nome: 'STILO',
    href: '/tools/stilo',
    icona: 'phone',
    settore: 'Telefonia e reti',
    descrizione:
      'Quattro prodotti a confronto per centralini e hardware di rete: noleggio Grenke Pioneer, locazione operativa, leasing e finanziamento BCC, più la campagna tasso zero a 10 mesi.',
  },
  {
    nome: 'Full Service',
    href: '/tools/full-service',
    icona: 'ict-digital',
    settore: 'IT e attrezzature',
    descrizione:
      'Tabelle BCC Rent&Lease su PC, server e attrezzature: locazione operativa, leasing, finanziamento finalizzato e campagna tasso zero. Assicurazione all risk già compresa nella rata.',
  },
  {
    nome: 'UNIDIMA',
    href: '/tools/unidima',
    icona: 'ict-digital',
    settore: 'Ledwall e display LED',
    descrizione:
      'Noleggio operativo su ledwall indoor e outdoor, totem e monitor professionali: due tabelle a confronto, PagaRent e Grenke Pioneer, dal prezzo di vendita alla griglia canoni da 24 a 60 mesi o dal canone al prezzo.',
  },
  {
    nome: 'Extreme Computer',
    href: '/tools/extreme-computer',
    icona: 'ict-digital',
    settore: 'Hardware IT e sistemi',
    descrizione:
      'Noleggio operativo su PC e workstation, server e NAS, gruppi di continuità e networking: canoni PagaRent da 24 a 60 mesi, con preventivo scaricabile in PDF da allegare all\'offerta.',
  },
  {
    nome: 'InnovaLux',
    href: '/tools/innovalux',
    icona: 'solar_power',
    settore: 'Fotovoltaico con accumulo',
    descrizione:
      'Genera i due prospetti dell\'impianto: canone su tutte le durate, confronto tra la rata e il risparmio in bolletta, deducibilità e alternativa leasing con Sabatini e iperammortamento. I PDF escono pronti per il cliente finale.',
  },
  {
    nome: 'Green-Go',
    href: '/tools/green-go',
    icona: 'solar_power',
    settore: 'Fotovoltaico, rete agenti',
    descrizione:
      'Ogni agente ha il proprio accesso personale: prepara il prospetto dell\'impianto, scarica i due PDF per il cliente e ritrova i propri nello storico. Il referente apre e chiude gli accessi della rete dal portale stesso.',
  },
  {
    // Motore dei portali (/portale/<slug>): ogni fornitore nuovo sul motore va qui
    nome: 'Portale dimostrativo',
    href: '/portale/demo-fotovoltaico',
    icona: 'solar_power',
    settore: 'Fotovoltaico, demo del motore',
    descrizione:
      'Il cliente si verifica con la partita IVA, poi si sceglie il pacchetto dal catalogo e arrivano le proposte di noleggio e di leasing, il business plan energetico, i prospetti in PDF e il caricamento della pratica. Fornitore e prezzi sono di prova.',
  },
  {
    nome: 'Duplex',
    href: '/portale/duplex',
    icona: 'cleaning_services',
    settore: 'Pulizia professionale, rete distributori',
    descrizione:
      'Ogni agente ha il proprio accesso: sceglie macchina e accessori, vede il canone tradizionale e quello con il trimestre di grazia con le date delle fatture, scarica il preventivo per il cliente e, quando la trattativa si fa seria, verifica la partita IVA e carica la pratica. Il referente vede tutta la rete.',
  },
  {
    // Indice pubblico: mai i nomi dei locatori, mai la maggiorazione del canale
    nome: 'Led Office',
    href: '/portale/led-office',
    icona: 'ict-digital',
    settore: 'Informatica e digital signage',
    descrizione:
      'Ogni commerciale ha il proprio accesso: verifica la partita IVA e vede subito se il cliente è presentabile, compone la fornitura dal listino Led Office con il prezzo trattato riga per riga, scarica il preventivo del canone e la proposta di vendita, poi carica la pratica con i documenti. Il referente vede tutta la rete.',
  },
  {
    // Indice pubblico: mai i nomi dei locatori né dei partner del leasing
    nome: 'Enrico Bergamelli',
    href: '/portale/bergamelli',
    icona: 'precision_manufacturing',
    settore: 'Gru, macchine e mezzi da cantiere',
    descrizione:
      'Ogni agente ha il proprio accesso: verifica la partita IVA del cliente, descrive i mezzi con categoria, prezzo e targa, e vede il noleggio, quando c\'è, accanto al leasing di più società a confronto. Scarica il preventivo di noleggio e il prospetto di leasing da consegnare, poi carica la pratica con i documenti. Il referente vede tutta la rete.',
  },
];

export const AREE_PARTNER: PortaleCard[] = [
  {
    nome: 'Duplex, simulatore con password unica',
    href: '/tools/duplex',
    icona: 'cleaning_services',
    settore: 'Pulizia industriale',
    descrizione:
      'Canone delle macchine Duplex con accessori, scelta tra tabella tradizionale e Grace Period, calendario delle fatture dalla data di consegna e foglio PDF da girare al cliente.',
  },
  {
    nome: 'Marotta Evolution',
    href: '/tools/marotta/',
    icona: 'precision_manufacturing',
    settore: 'Rete commerciale',
    descrizione:
      'Lookup della partita IVA, configuratore offerta, simulatore canone, credit policy a semaforo e preventivo PDF per la rete commerciale Marotta.',
  },
  {
    nome: 'Arca Energia',
    href: '/tools/arca-energia',
    icona: 'solar_power',
    settore: 'Fotovoltaico',
    descrizione:
      'Simulatore fotovoltaico con switch noleggio o leasing, coefficienti Sud Italia, assicurazione opzionale e agevolazioni: iperammortamento 4.0 e Nuova Sabatini.',
  },
  {
    nome: 'AGE SRL',
    href: '/tools/age-srl',
    icona: 'solar_power',
    settore: 'Fotovoltaico',
    descrizione:
      'Stessa impostazione di Arca Energia, noleggio o leasing con agevolazioni, più il download del preventivo PDF brandizzato Mediocredito Facile da mandare al cliente finale.',
  },
  {
    nome: 'EnergyTeam',
    href: '/tools/energyteam',
    icona: 'solar_power',
    settore: 'Fotovoltaico',
    descrizione:
      'Simulatore noleggio fotovoltaico con assicurazione opzionale, coefficiente Sud Italia e invio della richiesta pratica con la checklist dei documenti.',
  },
  {
    nome: 'Econocom — Pubblica Amministrazione',
    href: '/tools/econocom-pa',
    icona: 'account_balance',
    settore: 'Fotovoltaico per enti pubblici',
    descrizione:
      'Noleggio operativo Econocom per comuni, ASL e municipalizzate: parcheggi fotovoltaici, riqualificazione energetica e illuminazione, da 150.000 euro, con business plan che confronta la rata con la bolletta dell’ente.',
  },
];
