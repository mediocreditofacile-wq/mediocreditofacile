export const prerender = false;

/**
 * Verifica del cliente sul simulatore di noleggio operativo — POST /api/simulatore-verifica
 *
 * Due moduli sotto il simulatore: "il bene e' per la mia azienda" (variante
 * azienda) e "il bene e' per un mio cliente" (variante cliente, compila il
 * fornitore). All'invio: ricerca economica Openapi (IT-advanced) sul cliente
 * finale e, nel secondo modulo, sul fornitore; esito a tre colori calcolato qui
 * (src/lib/esito-simulatore.ts, regola di Alberto del 24/10/2026); mail ad
 * Alberto; sul verde la scheda completa da 0,81 ordinata dopo la risposta.
 *
 * La risposta porta solo cio' che la pagina /grazie mostra. Il browser non
 * manda mai fatturato o utile: il colore non si trucca dal client.
 */

import { waitUntil } from '@vercel/functions';
import { ricercaBase, ricercaSoloCacheLettura, schedaAzienda, fatturatoDaRicerca, type RicercaBase } from '../../lib/openapi';
import { pivaValida, pulisciPiva } from '../../lib/piva';
import { controllaCellulare, controllaEmail } from '../../lib/dati-cliente-pratica';
import {
  aziendaFerma, classeFormaRicerca, documentiSimulatore, leggiImporto, valutaSimulatore, type EsitoSimulatore,
} from '../../lib/esito-simulatore';
import { chiudi, impronta, ipDellaRichiesta, prenota } from '../../lib/guardia-simulatore';
import { corpoMail, oggettoMail, type AziendaLetta, type LeadSimulatore } from '../../lib/mail-simulatore';
import { inviaMail, DESTINATARIO_MCF } from '../../lib/mail-portale';
import { pdfPreventivo, tipologiaValida } from '../../lib/preventivo-simulatore';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
  });
}

const testo = (d: FormData, k: string) => String(d.get(k) ?? '').trim().slice(0, 300);

function letta(r: RicercaBase): AziendaLetta {
  return {
    piva: r.piva,
    trovata: r.trovata,
    ragioneSociale: r.ragioneSociale,
    forma: r.formaGiuridica,
    ateco: r.ateco,
    indirizzo: r.indirizzo,
    stato: r.stato,
    inizioAttivita: r.inizioAttivita ?? r.iscrizioneRegistro,
    annoBilancio: r.annoBilancio,
    fatturato: fatturatoDaRicerca(r),
    utile: r.utile,
  };
}

/**
 * Cerca prima nella cache leggendo per nome (operazione semplice sullo store
 * Blob, mai list()), poi su Openapi solo se la prenotazione ha ancora ricerche.
 */
async function cerca(piva: string, concesse: { n: number }): Promise<{ r: RicercaBase | null; pagata: boolean }> {
  const daCache = await ricercaSoloCacheLettura(piva);
  if (daCache) return { r: daCache, pagata: false };
  if (concesse.n <= 0) return { r: null, pagata: false };
  concesse.n--;
  const r = await ricercaBase(piva, { sorgente: 'simulatore', cacheGiaGuardata: true });
  return { r, pagata: true };
}

export async function POST({ request }: { request: Request }) {
  let data: FormData;
  try {
    data = await request.formData();
  } catch {
    return json({ ok: false, errore: 'formato' }, 400);
  }

  // Campo trappola: un robot lo compila. Si risponde ok senza spendere niente.
  if (testo(data, 'website')) {
    console.warn(JSON.stringify({ evento: 'simulatore_verifica_trappola' }));
    return json({ ok: true, consegnato: false, risultato: null });
  }

  const variante = testo(data, 'variante') === 'cliente' ? 'cliente' : 'azienda';
  const clientePiva = pulisciPiva(testo(data, 'cliente_piva'));
  const fornitorePiva = variante === 'cliente' ? pulisciPiva(testo(data, 'fornitore_piva')) : '';
  const nome = testo(data, 'nome');
  const telefono = testo(data, 'telefono');
  const email = testo(data, 'email');
  const importo = leggiImporto(testo(data, 'importo'));

  if (!testo(data, 'privacy')) return json({ ok: false, errore: 'privacy', messaggio: 'Serve il consenso all\'informativa privacy.' }, 400);
  if (!pivaValida(clientePiva)) {
    return json({ ok: false, errore: 'piva_cliente', messaggio: variante === 'cliente' ? 'La partita IVA del cliente non torna: controlla le cifre.' : 'La partita IVA non torna: controlla le cifre.' }, 400);
  }
  if (variante === 'cliente' && !pivaValida(fornitorePiva)) {
    return json({ ok: false, errore: 'piva_fornitore', messaggio: 'La partita IVA della tua azienda non torna: controlla le cifre.' }, 400);
  }
  if (!nome) return json({ ok: false, errore: 'nome', messaggio: 'Scrivi nome e cognome.' }, 400);
  const contatto = controllaCellulare(telefono) ?? controllaEmail(email);
  if (contatto) {
    const messaggio = contatto.errore.startsWith('cellulare') ? 'Il cellulare non sembra un numero: controlla le cifre.' : 'L\'email non sembra valida: controlla chiocciola e dominio.';
    return json({ ok: false, errore: contatto.errore, messaggio }, 400);
  }
  if (!importo) return json({ ok: false, errore: 'importo_mancante', messaggio: 'Scrivi l\'importo del bene in cifre, IVA esclusa: per esempio 25000.' }, 400);

  const ipHash = impronta(ipDellaRichiesta(request));
  const avvisi: string[] = [];
  let ricerchePagate = 0;
  let cliente: RicercaBase | null = null;
  let fornitore: RicercaBase | null = null;
  const stessa = variante === 'cliente' && fornitorePiva === clientePiva;
  const volute = variante === 'cliente' && !stessa ? 2 : 1;

  // Prima si prenota, poi si spende: nessun accesso a Openapi, Blob o Resend
  // prima di sapere che i tetti lo permettono
  const pren = await prenota(ipHash, volute);
  if (pren.frequenza) {
    return json({ ok: false, errore: 'frequenza', messaggio: 'Troppi invii da questa rete in un minuto. Aspetta qualche secondo e riprova.' }, 429);
  }
  if (pren.motivo === 'tetto_giorno' || pren.motivo === 'tetto_spesa') {
    avvisi.push(`Verifica ${pren.ricerche ? 'parziale' : 'non eseguita'}: ${pren.motivo === 'tetto_giorno' ? 'tetto giornaliero delle ricerche' : 'tetto di spesa del mese'} del simulatore raggiunto.`);
  }
  if (pren.id == null) avvisi.push('Database delle protezioni non raggiungibile: verifica non eseguita.');

  if (pren.invio) {
    const concesse = { n: pren.ricerche };
    try {
      const c = await cerca(clientePiva, concesse);
      cliente = c.r;
      if (c.pagata) ricerchePagate++;
      if (variante === 'cliente') {
        if (stessa) {
          avvisi.push('Il fornitore ha scritto la propria partita IVA anche come cliente.');
          fornitore = cliente;
        } else {
          const f = await cerca(fornitorePiva, concesse);
          fornitore = f.r;
          if (f.pagata) ricerchePagate++;
        }
      }
    } catch (err) {
      avvisi.push('Il registro imprese non ha risposto: verifica da fare a mano.');
      console.error(JSON.stringify({ evento: 'simulatore_verifica_errore', msg: err instanceof Error ? err.message : String(err) }));
    }
  }

  // Esito: solo su un'azienda trovata e attiva
  let esito: EsitoSimulatore | null = null;
  let motivo: 'non_trovata' | 'ferma' | 'non_verificata' | null = null;
  const classe = classeFormaRicerca(cliente?.formaCodice, cliente?.formaGiuridica);
  if (!cliente) motivo = 'non_verificata';
  else if (!cliente.trovata) motivo = 'non_trovata';
  else if (aziendaFerma(cliente.stato)) motivo = 'ferma';
  else {
    esito = valutaSimulatore({
      importo,
      classe,
      inizioAttivita: cliente.inizioAttivita ?? cliente.iscrizioneRegistro,
      annoBilancio: cliente.annoBilancio,
      fatturato: fatturatoDaRicerca(cliente),
      utile: cliente.utile,
    });
  }

  // Scheda completa: solo sul verde, sul cliente finale, se non c'e' gia' e se il tetto la regge
  let scheda: LeadSimulatore['scheda'] = 'no';
  if (esito?.colore === 'verde') {
    if (cliente?.fonte === 'scheda') scheda = 'in-cache';
    else if (pren.scheda) {
      scheda = 'ordinata';
      waitUntil(
        schedaAzienda(clientePiva, { sorgente: 'simulatore' }).catch((err) =>
          console.error(JSON.stringify({ evento: 'simulatore_scheda_errore', msg: err instanceof Error ? err.message : String(err) })),
        ),
      );
    } else scheda = 'tetto';
  }

  const lead: LeadSimulatore = {
    variante,
    nome,
    telefono,
    email,
    importo,
    durata: testo(data, 'durata'),
    tipologia: tipologiaValida(testo(data, 'tipologia')),
    canone: testo(data, 'canone'),
    clientePiva,
    cliente: cliente ? letta(cliente) : null,
    fornitore: variante === 'cliente' ? { piva: fornitorePiva, letta: fornitore ? letta(fornitore) : null } : undefined,
    esito,
    scheda,
    avvisi,
  };

  // Oltre il tetto degli invii del giorno la mail non parte: la quota Resend e'
  // la stessa di inviti e reset password. La lead resta nel log.
  // Il preventivo lo scarica chi ha compilato, con qualunque esito, e lo stesso
  // PDF va in allegato ad Alberto (decisione del 24/10/2026)
  const documenti = cliente?.trovata ? documentiSimulatore(classe, importo) : documentiSimulatore(classe, Math.min(importo, 10_000));
  let preventivo: { filename: string; base64: string } | null = null;
  try {
    const durata = parseInt(lead.durata, 10);
    preventivo = pdfPreventivo({
      intestatario: cliente?.trovata ? cliente.ragioneSociale : null,
      piva: clientePiva,
      tipologia: lead.tipologia,
      importo,
      durataScelta: Number.isFinite(durata) ? durata : null,
      documenti,
    });
  } catch (err) {
    console.error(JSON.stringify({ evento: 'simulatore_pdf_errore', msg: err instanceof Error ? err.message : String(err) }));
  }

  const mail = pren.invio
    ? await inviaMail({
        to: DESTINATARIO_MCF,
        subject: oggettoMail(lead),
        html: corpoMail(lead),
        replyTo: email,
        allegati: preventivo ? [{ filename: preventivo.filename, content: preventivo.base64 }] : undefined,
      })
    : { ok: false, err: 'tetto_invii' };

  const esitoRiga = !pren.invio ? 'tetto_invii' : esito?.colore ?? motivo ?? 'errore';
  await chiudi(pren.id, { esito: esitoRiga, ricerche: ricerchePagate, schede: scheda === 'ordinata' ? 1 : 0 });
  console.log(JSON.stringify({
    evento: 'simulatore_verifica', variante, esito: esitoRiga, scheda, ricerche: ricerchePagate, consegnato: mail.ok,
  }));
  if (!mail.ok) console.error(JSON.stringify({ evento: 'lead_lost_simulatore', lead, err: mail.err }));

  return json({
    ok: true,
    consegnato: mail.ok,
    risultato: {
      variante,
      colore: esito?.colore ?? null,
      motivo,
      ragioneSociale: cliente?.trovata ? cliente.ragioneSociale : null,
      indirizzo: cliente?.trovata ? cliente.indirizzo : null,
      forma: cliente?.trovata ? cliente.formaGiuridica : null,
      criteri: esito?.criteri ?? [],
      indicazioni: esito?.indicazioni ?? [],
      // Senza verifica la forma non si conosce: lista base, la reddituale la chiedo io
      documenti,
      importo,
    },
    preventivo,
  });
}
