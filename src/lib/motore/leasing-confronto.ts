// Il leasing dei tre partner affiancati, per il settore "mezzi".
//
// ATTENZIONE — FILE SERVER-ONLY: sceglie le condizioni del listino per spread e
// ne calcola le rate. Verso il browser escono solo rate, anticipi e totali per
// durata (LeasingEsterno): mai spread, tasso, provvigione o id di condizione.
//
// Ogni partner ha una condizione fissa per gruppo di durate: lo spread "fino a
// 48 mesi" per 36 e 48, lo spread "da 60" per 60, 72 e 84 (Alba cambia listino
// proprio a quel confine). La rata e' quella del modello vero del partner, la
// stessa di leasingPartner; qui non c'e' markup perche' il settore non lo usa.

import { PARTNERS_LEASING, type PartnerLeasing } from '../../data/leasing';
import type { LeasingEsterno } from '../prospetti-pv';
import { condizioneDaSpread, type ConfigMezzi, type PartnerConfronto } from './config-mezzi';
import { DURATE_LEASING_MOTORE, leasingPartner } from './proposte';

/** Le durate fino a questa usano `spreadFinoA48`, le successive `spreadDa60` */
const ULTIMA_DURATA_FINO_A_48 = 48;
/** Nessuna maggiorazione sulle rate di questo settore */
const MARKUP_MEZZI = 0;

const MOTIVO_FUORI_LIMITI = 'Importo fuori dai limiti di questo partner.';

/** Le rate di un partner; `righe` vuoto = il partner non quota, e `motivo` dice perche' */
export interface LeasingDelPartner {
  partner: PartnerConfronto;
  /** Etichetta del partner ("Sella Leasing"): a schermo solo se la configurazione lo consente */
  nome: string;
  righe: LeasingEsterno[];
  motivo: string | null;
}

/** Il listino del partner: la configurazione e' gia' validata, quindi un partner ignoto e' un errore */
function listinoDi(partner: PartnerConfronto): PartnerLeasing {
  const listino = PARTNERS_LEASING.find((p) => p.key === partner);
  if (!listino) throw new Error(`Partner di leasing sconosciuto: ${partner}`);
  return listino;
}

/**
 * Una colonna per partner, nell'ordine della configurazione. Fuori dai limiti di
 * importo del partner non ci sono righe e c'e' il motivo; gli altri partner non ne
 * risentono. Una durata la cui condizione non esiste nel listino si salta: uno
 * spread non si inventa.
 */
export function leasingConfronto(
  cfg: ConfigMezzi['leasing'],
  importo: number,
  anticipoPerc: number,
): LeasingDelPartner[] {
  return cfg.partner.map((p) => {
    const listino = listinoDi(p.partner);
    const nome = listino.label;
    if (importo < listino.importoMin || importo > listino.importoMax) {
      return { partner: p.partner, nome, righe: [], motivo: MOTIVO_FUORI_LIMITI };
    }
    const righe: LeasingEsterno[] = [];
    for (const durata of DURATE_LEASING_MOTORE) {
      const spread = durata <= ULTIMA_DURATA_FINO_A_48 ? p.spreadFinoA48 : p.spreadDa60;
      const condizione = condizioneDaSpread(listino, durata, spread);
      if (!condizione) continue;
      // Il partner non ammette quella durata: leasingPartner risponde null e la riga manca
      const riga = leasingPartner(listino, importo, durata, anticipoPerc, MARKUP_MEZZI, condizione.id);
      if (riga) righe.push(riga);
    }
    return { partner: p.partner, nome, righe, motivo: null };
  });
}
