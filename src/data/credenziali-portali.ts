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
  password: string;
  tipo: 'partner' | 'interno';
  nota?: string;
}

export const CREDENZIALI: AccessoPortale[] = [
  // --- Portali pratiche: login con email + password ---
  { nome: 'Expo Energia', percorso: '/tools/expo-energia', utente: 'massimopalermo10@gmail.com', password: 'expoenergia', tipo: 'partner',
    nota: 'Come admin: mediocreditofacile@gmail.com + la chiave EXPO_PORTAL_ADMIN_KEY (sta nelle env di Vercel, non qui)' },
  { nome: 'STILO', percorso: '/tools/stilo', utente: 'bonardipaolo@gmail.com', password: 'stilosrl', tipo: 'partner' },
  { nome: 'Full Service', percorso: '/tools/full-service', utente: 'commerciale@fullserviceagency.biz', password: 'fullservice', tipo: 'partner' },
  { nome: 'UNIDIMA', percorso: '/tools/unidima', utente: 'info@unidima.it', password: 'unidima', tipo: 'partner' },
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
  { nome: 'Duplex', percorso: '/tools/duplex', password: 'duplex', tipo: 'partner' },
  { nome: 'Marotta Evolution', percorso: '/tools/marotta/', password: '9999', tipo: 'partner', nota: 'PIN a 4 cifre, lo stesso del tool Joker Store' },

  // --- Strumenti interni MCF ---
  { nome: 'Simulazione leasing', percorso: '/tools/simulazione-leasing', password: 'mcf-leasing', tipo: 'interno' },
  { nome: 'Leasing Lo Martire', percorso: '/tools/simulatore-leasing-lomartire', password: 'lorenzo', tipo: 'interno' },
  { nome: 'Valutazione aziende', percorso: '/tools/valutazione', password: '(la chiave che stai usando adesso)', tipo: 'interno',
    nota: 'Vive nelle env di Vercel come VALUTAZIONE_KEY, non e\' scritta nel codice' },
];
