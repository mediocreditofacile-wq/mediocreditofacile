// Il marchio del fornitore per i documenti che gira ai propri installatori.
//
// ATTENZIONE — FILE SERVER-ONLY: legge dallo store Blob privato.
//
// Vale solo sul prospetto di noleggio operativo. Il prospetto di leasing porta
// sempre il marchio Mediocredito Facile e l'iscrizione OAM: e' un prodotto
// finanziario, e l'intermediario deve essere identificabile.

import { get } from '@vercel/blob';
import { env } from './db';

export interface BrandFornitore {
  colore: string;
  nome: string;
  /** Logo in base64: il microservizio PDF lo riceve nel payload */
  logo_b64?: string;
}

/** I loghi restano in memoria: la funzione e' calda e i preventivi sono tanti. */
const cache = new Map<string, string>();

/**
 * Compone il marchio da passare al microservizio. Se il logo non si legge, il
 * prospetto esce comunque con i colori del fornitore e senza marchio: un
 * documento un po' piu' spoglio e' meglio di un documento che non esce.
 */
export async function brandFornitore(opts: {
  logo: string | null;
  colore: string | null;
  nome: string | null;
}): Promise<BrandFornitore | undefined> {
  if (!opts.colore && !opts.logo) return undefined;

  const brand: BrandFornitore = {
    colore: opts.colore ?? '#0F1020',
    nome: opts.nome ?? '',
  };

  if (!opts.logo) return brand;
  const gia = cache.get(opts.logo);
  if (gia) return { ...brand, logo_b64: gia };

  const token = env('BLOB_READ_WRITE_TOKEN');
  if (!token) return brand;
  try {
    const res = await get(opts.logo, { access: 'private', token });
    if (!res || res.statusCode !== 200 || !res.stream) return brand;
    const b64 = Buffer.from(await new Response(res.stream).arrayBuffer()).toString('base64');
    cache.set(opts.logo, b64);
    return { ...brand, logo_b64: b64 };
  } catch (e) {
    console.warn(JSON.stringify({ event: 'brand_logo_non_letto', logo: opts.logo, error: String(e) }));
    return brand;
  }
}
