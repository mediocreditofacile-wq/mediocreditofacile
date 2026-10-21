// Credenziali di accesso ai portali partner — SERVER-ONLY.
//
// Non importare mai questo file da una pagina o da un'isola client: finirebbe
// nel bundle e le password sarebbero leggibili da chiunque apra il sorgente.
// L'unico consumatore e' /api/credenziali, che risponde solo a chi presenta
// la chiave VALUTAZIONE_KEY.
//
// Quando cambia la password di un portale va cambiata in DUE punti: nella
// pagina del portale (const PASSWORD) e qui. Non c'e' una fonte unica perche'
// il gate dei portali e' lato client per scelta, cosi' il bundle di un partner
// non contiene le credenziali degli altri.

export interface AccessoPortale {
  nome: string;
  percorso: string;
  utente?: string;
  /** Assente sui portali ad accesso personale: li' ognuno entra col proprio account */
  password?: string;
  /** personale = utenti nominali (Better Auth): MCF entra con mediocreditofacile@gmail.com */
  tipo: 'partner' | 'interno' | 'personale';
  nota?: string;
}

export const CREDENZIALI: AccessoPortale[] = [
  // --- Portali pratiche: login con email + password ---
  { nome: 'Expo Energia', percorso: '/tools/expo-energia', utente: 'massimopalermo10@gmail.com', password: 'expoenergia', tipo: 'partner',
    nota: 'Come admin: mediocreditofacile@gmail.com + la chiave EXPO_PORTAL_ADMIN_KEY (sta nelle env di Vercel, non qui)' },
  { nome: 'Full Service', percorso: '/tools/full-service', utente: 'commerciale@fullserviceagency.biz', password: 'fullservice', tipo: 'partner' },
  { nome: 'UNIDIMA', percorso: '/tools/unidima', utente: 'info@unidima.it', password: 'unidima', tipo: 'partner' },
  { nome: 'Extreme Computer', percorso: '/tools/extreme-computer', utente: 'direzione@extremecomputer.it', password: 'extremecomputer', tipo: 'partner' },
  { nome: 'InnovaLux', percorso: '/tools/innovalux', utente: 'contratti@innovalux.net', password: 'innovalux', tipo: 'partner',
    nota: 'Portale preventivi fotovoltaico, non pratiche' },

  // --- Aree riservate: solo password ---
  { nome: 'Arca Energia', percorso: '/tools/arca-energia', password: 'arcaenergia', tipo: 'partner' },
  { nome: 'AGE SRL', percorso: '/tools/age-srl', password: 'age-srl', tipo: 'partner' },
  { nome: 'EnergyTeam', percorso: '/tools/energyteam', password: 'energyteam', tipo: 'partner' },
  { nome: 'Econocom PA', percorso: '/tools/econocom-pa', password: 'gianfranco', tipo: 'partner' },
  { nome: 'Edilizia GIERRE', percorso: '/tools/edilizia-gierre', password: 'gierreedilizia', tipo: 'partner' },
  { nome: 'Gruppo Barone', percorso: '/tools/gruppo-barone', password: 'gruppobarone', tipo: 'partner' },
  { nome: 'Datron', percorso: '/tools/datron', password: 'cantinette', tipo: 'partner', nota: 'Stessa password per /tools/datron-ecommerce' },
  { nome: 'Duplex, simulatore con password unica', percorso: '/tools/duplex', password: 'duplex', tipo: 'partner',
    nota: 'Resta in parallelo al portale Duplex ad accesso personale, finche\' la rete non passa li\'' },
  { nome: 'Marotta Evolution', percorso: '/tools/marotta/', password: '9999', tipo: 'partner', nota: 'PIN a 4 cifre, lo stesso del tool Joker Store' },

  // --- Portali ad accesso personale: nessuna password comune ---
  // MCF entra con mediocreditofacile@gmail.com e la propria password; referenti e
  // agenti hanno ognuno il proprio accesso, aperto con un invito da "La tua rete".
  { nome: 'Duplex', percorso: '/portale/duplex', tipo: 'personale',
    nota: 'Sul motore dei portali. Referenti Leo e Rossano, agenti Stefano e Giovanni Stara (da invitare).' },
  { nome: 'Led Office (Emme 2 Servizi)', percorso: '/portale/led-office', tipo: 'personale',
    nota: 'Sul motore dei portali. Referente Luca Maimone, agente Maurizio Palumbo: da invitare quando lo dice Alberto.' },
  { nome: 'Fas Italia (prototipo)', percorso: '/portale/fas-italia-orby1x', tipo: 'personale',
    nota: 'Proposta per Fas Italia, fuori dall\'indice Portali Clienti. L\'account demo dello stand TTG e\' stato cancellato il 16/10/2026.' },
  { nome: 'Portale dimostrativo', percorso: '/portale/demo-fotovoltaico', tipo: 'personale',
    nota: 'Fornitore inventato, catalogo e prezzi di prova.' },
  { nome: 'Green-Go', percorso: '/tools/green-go', tipo: 'personale',
    nota: 'Referente Donato Di Zenzo; ogni agente ha il proprio accesso.' },
  { nome: 'STILO', percorso: '/tools/stilo', tipo: 'personale',
    nota: 'Dal 13/10/2026 ad accessi personali: referente Paolo Bonardi (bonardipaolo@gmail.com). La vecchia password comune non apre piu\' niente.' },

  // --- Strumenti interni MCF ---
  { nome: 'Simulazione leasing', percorso: '/tools/simulazione-leasing', password: 'mcf-leasing', tipo: 'interno' },
  { nome: 'Leasing Lo Martire', percorso: '/tools/simulatore-leasing-lomartire', password: 'lorenzo', tipo: 'interno' },
  { nome: 'Valutazione aziende', percorso: '/tools/valutazione', password: '(la chiave che stai usando adesso)', tipo: 'interno',
    nota: 'Vive nelle env di Vercel come VALUTAZIONE_KEY, non e\' scritta nel codice' },
];
