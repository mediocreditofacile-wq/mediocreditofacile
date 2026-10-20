// Il marchio del fornitore per i documenti che gira ai propri installatori.
//
// ATTENZIONE — FILE SERVER-ONLY: legge dallo store Blob privato.
//
// Vale solo sul prospetto di noleggio operativo. Il prospetto di leasing porta
// sempre il marchio Mediocredito Facile e l'iscrizione OAM: e' un prodotto
// finanziario, e l'intermediario deve essere identificabile.
//
// logoDaBlob() serve anche ai PDF del motore disegnati con jsPDF (i documenti
// Led Office): un logo letto una volta resta in memoria per tutti.

import { get } from '@vercel/blob';
import { env } from './db';

export interface BrandFornitore {
  /** Banda di testata e intestazioni di tabella: scuro, regge il testo bianco */
  colore: string;
  /** Titoli di sezione e righe evidenziate: piu' chiaro, su fondo bianco */
  accento?: string;
  nome: string;
  /** Logo in base64: il microservizio PDF lo riceve nel payload */
  logo_b64?: string;
}

/** I loghi restano in memoria: la funzione e' calda e i preventivi sono tanti. */
const cache = new Map<string, string>();

/**
 * Un logo dello store privato (brand/...) in base64, oppure null se il percorso manca
 * o il file non si legge. Lo usano i prospetti del microservizio e i PDF del motore
 * disegnati con jsPDF. Chi lo riceve null disegna il documento senza logo: un
 * documento un po' piu' spoglio e' meglio di un documento che non esce.
 */
export async function logoDaBlob(pathname: string | null): Promise<string | null> {
  if (!pathname) return null;
  const gia = cache.get(pathname);
  if (gia) return gia;

  const token = env('BLOB_READ_WRITE_TOKEN');
  if (!token) return null;
  try {
    const res = await get(pathname, { access: 'private', token });
    if (!res || res.statusCode !== 200 || !res.stream) return null;
    const b64 = Buffer.from(await new Response(res.stream).arrayBuffer()).toString('base64');
    cache.set(pathname, b64);
    return b64;
  } catch (e) {
    console.warn(JSON.stringify({ event: 'brand_logo_non_letto', logo: pathname, error: String(e) }));
    return null;
  }
}

/**
 * Compone il marchio da passare al microservizio. Se il logo non si legge, il
 * prospetto esce comunque con i colori del fornitore e senza marchio.
 */
export async function brandFornitore(opts: {
  logo: string | null;
  colore: string | null;
  accento?: string | null;
  nome: string | null;
}): Promise<BrandFornitore | undefined> {
  if (!opts.colore && !opts.logo) return undefined;

  const brand: BrandFornitore = {
    colore: opts.colore ?? '#0F1020',
    // Senza un secondo tono si usa lo stesso: meglio un documento monocromo
    // che un documento con due marchi addosso.
    accento: opts.accento ?? opts.colore ?? undefined,
    nome: opts.nome ?? '',
  };

  const logo = await logoDaBlob(opts.logo);
  return logo ? { ...brand, logo_b64: logo } : brand;
}
