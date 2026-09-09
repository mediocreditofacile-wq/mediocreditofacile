/**
 * Pagine servizio per territorio: tipi, registro dei servizi e contenuti regionali.
 *
 * Nascono dalla misura di visibilità sugli assistenti AI (settembre 2026): alle
 * domande su chi eroga un servizio in una zona i motori citano operatori con
 * pagine geolocalizzate, non articoli. Tre servizi per regione, quindi ogni
 * regione ha la sua tripletta.
 *
 * REGOLA DI SOSTANZA. Una pagina territoriale esiste solo se ha dentro qualcosa
 * che la pagina nazionale non può dire: partner sul posto, casi veri di quel
 * territorio, il tessuto produttivo che genera quelle pratiche. Ventuno pagine
 * con lo stesso testo e il nome della regione cambiato sono doorway pages, che
 * Google declassa e gli assistenti non citano. Per questo `contenuti` è
 * obbligatorio per ogni servizio esposto: una regione senza testo suo non
 * genera pagine (vedi `regioniPubblicate`), invece di generarne di vuote.
 *
 * I casi citati sono articoli del blog, quindi già pubblici e già anonimizzati.
 * I clienti finali non si nominano mai senza il loro consenso; i partner solo
 * con il loro.
 */

export type ChiaveServizio = 'noleggio-operativo' | 'leasing' | 'finanziamenti';

export interface Servizio {
  chiave: ChiaveServizio;
  /** Prefisso dello slug: <prefisso>-<regione>. */
  prefisso: string;
  /** Nome del servizio dentro una frase. */
  nome: string;
  /** Pagina nazionale di riferimento, a cui la territoriale rimanda. */
  pagineMadre: string;
}

export const SERVIZI: Record<ChiaveServizio, Servizio> = {
  'noleggio-operativo': {
    chiave: 'noleggio-operativo',
    prefisso: 'noleggio-operativo',
    nome: 'noleggio operativo',
    pagineMadre: '/noleggio-operativo',
  },
  leasing: {
    chiave: 'leasing',
    prefisso: 'leasing',
    nome: 'leasing strumentale',
    pagineMadre: '/leasing-strumentale',
  },
  finanziamenti: {
    chiave: 'finanziamenti',
    prefisso: 'finanziamenti',
    nome: 'finanziamenti per imprese',
    pagineMadre: '/finanziamenti/',
  },
};

export interface PartnerTerritorio {
  nome: string;
  citta: string;
  /** Cosa fa, in una riga: serve a spiegare perché è citato qui. */
  attivita: string;
}

export interface CasoTerritorio {
  /** Slug dell'articolo nel blog: il caso è già pubblico e già anonimizzato. */
  slug: string;
  titolo: string;
  /** Il dato che rende il caso riconoscibile, non un riassunto. */
  dettaglio: string;
  /** Su quali pagine servizio ha senso mostrarlo. Un caso di lease back non
   *  va sulla pagina del noleggio solo perché è della stessa regione. */
  servizi: ChiaveServizio[];
}

/**
 * Testi propri di una regione per un singolo servizio.
 *
 * Sono la ragione di esistere della pagina: tutto quello che non sta qui è
 * uguale alle altre due pagine della stessa regione. Misurato sul Veneto, un
 * impianto con il solo `perche` condivideva il 74% delle frasi fra le tre
 * pagine; il territorio va quindi raccontato dentro OGNI servizio, con i suoi
 * esempi, e non in un paragrafo comune stampato tre volte.
 */
export interface ContenutoServizio {
  /** Sottotitolo della pagina: dice cosa si fa qui e per chi. */
  sommario: string;
  /** Il territorio visto da questo servizio. Prosa, non elenco. */
  perche: string;
  /** I beni o le esigenze ricorrenti della regione su questo servizio. */
  ricorrenze: string;
  /** Il vincolo o il criterio che qui conta più degli altri. */
  attenzione: string;
  /** Domande proprie di questo servizio su questo territorio. */
  faq: { q: string; a: string }[];
}

export interface Regione {
  chiave: string;
  nome: string;
  /** "in Veneto", "nel Lazio": la preposizione cambia con il nome. */
  preposizione: string;
  province: string[];
  /**
   * Nota di redazione, NON stampata in pagina: il tessuto produttivo che genera
   * le pratiche. Serve a chi scrive i testi dei servizi per restare aderente
   * alla regione. Stampandola si otterrebbe lo stesso paragrafo su tre pagine.
   */
  tessuto: string;
  partner: PartnerTerritorio[];
  casi: CasoTerritorio[];
  contenuti: Partial<Record<ChiaveServizio, ContenutoServizio>>;
}

export const REGIONI: Regione[] = [
  {
    chiave: 'veneto',
    nome: 'Veneto',
    preposizione: 'in',
    province: ['Verona', 'Vicenza', 'Padova', 'Treviso', 'Venezia', 'Rovigo', 'Belluno'],
    tessuto:
      "Nota interna. Manifattura piccola e piccolissima, molta lavorazione conto terzi, distretti stretti dove il macchinario è il mestiere. Delta del Po con pesca e lavorazione del pescato, Polesine agricolo, mobilieri e tappezzieri fra trevigiano e padovano, meccanica vicentina, ricettivo del litorale con stagionalità pesante. Aziende che comprano beni strumentali spesso, per importi medi, con il rapporto bancario già impegnato dal circolante. Qui c'è la sede di Mediocredito Facile.",
    partner: [],
    casi: [
      {
        slug: 'fotovoltaico-noleggio-lavorazione-pesce-porto-tolle',
        titolo: 'Lavorazione del pesce a Sottomarina, nel Delta del Po',
        dettaglio:
          'impianto fotovoltaico da 50 kWp con accumulo sul capannone di lavorazione, costo netto 460 euro al mese',
        servizi: ['noleggio-operativo'],
      },
      {
        slug: 'lease-back-tappezzeria-veneta',
        titolo: 'Tappezzeria artigiana veneta',
        dettaglio:
          'un milione di fatturato e il fotovoltaico pagato per cassa: la liquidità è tornata con un lease back sui macchinari, invece di continuare a cedere le fatture al 5%',
        servizi: ['finanziamenti'],
      },
      {
        slug: 'leasing-bene-difettoso-vizi-fornitore',
        titolo: 'Carpenteria meccanica del veneziano',
        dettaglio:
          'curvatubi a controllo numerico consegnata con cinque mesi di ritardo e con vizi: chi paga i canoni, contro chi si agisce e perché il verbale di consegna va firmato solo a macchina provata',
        servizi: ['leasing'],
      },
    ],
    contenuti: {
      'noleggio-operativo': {
        sommario:
          'Beni strumentali a canone mensile per le imprese venete, senza anticipo e senza intaccare gli affidamenti in banca.',
        perche:
          "Nella manifattura veneta che lavora conto terzi il macchinario non è un investimento occasionale, è manutenzione della capacità produttiva: si sostituisce quando la commessa lo impone, non quando la banca dice di sì. Nei distretti stretti fra vicentino e trevigiano questo ritmo è la norma, e il noleggio operativo ci si adatta meglio del debito: la spesa resta un costo, non entra in Centrale Rischi e lascia le linee di credito dove servono, cioè sul circolante, che nel conto terzi è quasi sempre tirato.",
        ricorrenze:
          "Dal Veneto arrivano soprattutto macchine utensili e attrezzature di officina, celle frigorifere e attrezzature per la lavorazione alimentare lungo la costa e nel Delta, arredi e cucine per il ricettivo del litorale, hardware e server per gli studi professionali, impianti fotovoltaici su capannoni di proprietà o in affitto.",
        attenzione:
          "Sul fotovoltaico veneto il conto non si fa da solo come al Sud: l'irraggiamento della Pianura Padana è di circa un quarto più basso di quello pugliese, quindi la copertura del canone con il risparmio in bolletta va calcolata sui consumi reali e sugli orari in cui l'azienda lavora. Su un capannone che gira solo di giorno il conto torna, su una stagionalità estiva molto marcata va guardato con attenzione.",
        faq: [
          {
            q: 'Posso noleggiare un macchinario usato?',
            a: "Di norma no: il noleggio operativo si costruisce su beni nuovi acquistati dal fornitore. Sull'usato, quando ha un valore riconoscibile, la strada è un'altra, tipicamente il lease back se il bene è già di proprietà dell'azienda.",
          },
          {
            q: 'Il canone di noleggio incide sul mio fido in banca?',
            a: "No. Il contratto di noleggio operativo non viene segnalato in Centrale Rischi, quindi non compare fra le esposizioni quando la banca rivede gli affidamenti. È il motivo principale per cui molte imprese venete lo scelgono anche quando potrebbero permettersi l'acquisto.",
          },
          {
            q: 'Quanto ci vuole dalla richiesta alla consegna del bene?',
            a: "Con la documentazione completa, pre-delibera indicativa in 24 ore e delibera entro 48 ore lavorative. Da lì i tempi li fa il fornitore del bene: il contratto decorre dalla consegna e dal collaudo, non dalla firma.",
          },
        ],
      },
      leasing: {
        sommario:
          'Leasing strumentale per le imprese venete, con il confronto fra più società di leasing e le agevolazioni che solo il leasing apre.',
        perche:
          "In una regione dove si compra un macchinario 4.0 da qualche centinaio di migliaia di euro il leasing non è l'alternativa povera al noleggio: è la formula che dà accesso alla Nuova Sabatini e all'iperammortamento, che sul noleggio operativo non si applicano. Su investimenti di quella taglia il contributo e la maggiorazione fiscale valgono più della flessibilità, e la scelta fra le due formule va fatta sull'operazione, non per abitudine.",
        ricorrenze:
          "Le pratiche venete di leasing riguardano soprattutto macchinari di produzione e linee complete, mezzi d'opera e veicoli commerciali, impianti industriali. Su questi beni mettiamo a confronto le condizioni di più società di leasing: sullo stesso investimento gli spread cambiano parecchio da un istituto all'altro, e la prima proposta che arriva raramente è la migliore.",
        attenzione:
          "La cumulabilità va guardata prima di firmare, non dopo. Sabatini ordinaria e Sabatini 4.0 sono la stessa misura e si escludono a vicenda; l'iperammortamento si cumula. Se nell'operazione c'è una permuta dell'usato, quella parte non entra nell'agevolazione e va tenuta separata: è l'errore che costa il contributo.",
        faq: [
          {
            q: 'Con quali società di leasing lavorate?',
            a: "Con più istituti, e non con uno solo: è il senso del nostro mestiere. Sulla singola pratica proponiamo il canale più adatto per bene, importo e merito creditizio, spiegando perché; la scelta finale resta dell'imprenditore.",
          },
          {
            q: 'Quanto anticipo serve su un leasing strumentale?',
            a: "Dipende dall'istituto e dalla pratica: si va da operazioni senza anticipo a richieste intorno al 20%. Quando c'è un usato da permutare, il suo valore può coprire in tutto o in parte l'anticipo, e la cassa resta in azienda.",
          },
          {
            q: 'Posso accedere alla Nuova Sabatini con il leasing?',
            a: "Sì, ed è uno dei motivi per cui si sceglie il leasing invece del noleggio. Il contributo si calcola sugli interessi di un finanziamento quinquennale a tasso convenzionale, più alto per i beni 4.0. Vale solo su beni strumentali nuovi di fabbrica.",
          },
        ],
      },
      finanziamenti: {
        sommario:
          'Liquidità e finanziamenti per le PMI venete, con accesso a più istituti invece che alla sola banca di riferimento.',
        perche:
          "Nelle filiere venete il problema ricorrente non è il fatturato, è il ciclo finanziario: il conto terzi allunga i tempi, si paga il fornitore prima di incassare dal committente, e l'azienda cresce mentre la cassa si stringe. Quando la banca storica ha già assorbito il fido, insistere lì raramente porta da qualche parte: la strada è aprire un secondo canale, perché istituti diversi leggono lo stesso bilancio con criteri diversi.",
        ricorrenze:
          "Le richieste che arrivano dal Veneto sono liquidità per il circolante, chirografari per investimenti che non passano dal leasing, factoring sulle forniture verso committenti grandi e puntuali nei tempi ma lenti nei pagamenti, e lease back su macchinari già di proprietà per liberare cassa senza aggiungere debito nuovo.",
        attenzione:
          "Sui finanziamenti nessuno può promettere l'esito né il tasso, e chi lo fa va evitato: il merito creditizio lo valuta l'istituto che delibera, sul bilancio e sulla centrale rischi. Quello che possiamo fare è scegliere il canale giusto e presentare la pratica in modo che chi la legge capisca l'azienda, che su una PMI manifatturiera non è scontato.",
        faq: [
          {
            q: 'La mia banca mi ha detto no. Cambia qualcosa rivolgersi a voi?',
            a: "Può cambiare, perché il no di un istituto è il giudizio di quel modello di valutazione, non una condanna. La stessa pratica presentata a un istituto con criteri diversi, o accompagnata da una garanzia pubblica come il Fondo MCC, può avere esito diverso. Se però il problema è strutturale te lo diciamo subito, invece di farti perdere settimane.",
          },
          {
            q: 'Che differenza c\'è fra lease back e finanziamento?',
            a: "Nel lease back vendi un bene che possiedi già a una società di leasing e continui a usarlo pagando un canone: incassi subito il valore del bene senza accendere un debito nuovo. Nel finanziamento ricevi denaro e restituisci capitale e interessi. Sul primo pesa il valore del macchinario, sul secondo il tuo bilancio.",
          },
          {
            q: 'Il factoring mi rovina il rapporto con il cliente?',
            a: "Dipende dalla forma. Il factoring pro soluto notificato prevede che il committente sappia e paghi al factor, ed è prassi normale nelle filiere con grandi committenti. Le formule non notificate esistono ma costano di più. La scelta si fa sul rapporto commerciale che hai, non solo sul prezzo.",
          },
        ],
      },
    },
  },
];

/** Solo le regioni che hanno testi propri per quel servizio generano una pagina. */
export function regioniPubblicate(servizio: ChiaveServizio): Regione[] {
  return REGIONI.filter((r) => r.contenuti[servizio]);
}

export function slugTerritoriale(servizio: ChiaveServizio, regione: Regione): string {
  return `/${SERVIZI[servizio].prefisso}-${regione.chiave}`;
}
