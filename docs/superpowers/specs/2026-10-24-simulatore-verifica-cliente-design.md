# Verifica del cliente sul simulatore di noleggio operativo

Data: 24/10/2026. Stato: bozza da approvare da Alberto. Worktree `simulatore-verifica-cliente`.

## Perché

`/tools/simulatore-noleggio-operativo` è la pagina più vista del sito. Oggi chi calcola il canone trova sotto un modulo generico "Richiedi una consulenza gratuita", che arriva solo a Zapier: il browser lo manda direttamente al webhook, senza la mail di sicurezza che c'è su `/api/submit`. Zapier e Pipedrive non fanno più parte dello stack, quindi questi lead rischiano di perdersi.

L'idea, nata dal consulente Hormozi il 24/10/2026, è la civetta di $100M Money Models (§3.5) spostata sul sito: chi ha appena calcolato un canone ottiene una risposta alla domanda vera, "questo cliente lo posso chiudere a canone?", in cambio di partita IVA, cellulare ed email. Per MCF ogni invio è un lead qualificato con i numeri del cliente finale già in mano, a pochi centesimi di costo. La prima trattativa è seguita da Alberto: è il "regalo" dell'offerta.

Riguarda solo il noleggio operativo. Niente leasing in questa pagina.

## Obiettivi

1. Due moduli sotto il simulatore, a scelta: "Il bene è per la mia azienda" e "Il bene è per un mio cliente".
2. All'invio, ricerca economica Openapi (IT-advanced) sul cliente finale e, nel secondo modulo, anche sul fornitore.
3. Esito a tre colori calcolato sul server, con un messaggio e la lista dei documenti per procedere.
4. Se l'esito è verde, il server ordina da solo la scheda completa del cliente (0,81 euro), così Alberto ha patrimonio netto e punteggio quando apre la pratica.
5. Una mail ad Alberto per ogni invio, con tutto quello che serve a richiamare.

## Non obiettivi

Niente verifica eventi negativi, niente patrimonio netto nella prima ricerca (IT-advanced non lo dà: il campo che sembra il patrimonio è l'utile). Niente account, niente portale, niente pacchetti a pagamento (il pacchetto da 29 euro e il premium da 199 euro sono un lavoro separato). Niente preventivo PDF automatico: il preventivo vero lo fa Alberto quando richiama.

## Anti-obiettivi

Sarebbe un fallimento anche se funziona tecnicamente:
- una pagina che dice "approvato", "finanziabile" o promette l'esito: mai, in nessun colore;
- una pagina che mostra all'imprenditore un rosso secco che lo fa scappare: anche il rosso rimanda a una persona;
- uno strumento che qualcuno usa per far spendere soldi a MCF a raffica su Openapi;
- una pagina più lenta o che perde posizioni su Google (oggi è statica e veloce).

## Il percorso

Il simulatore resta com'è. Sotto, al posto del modulo attuale "Richiedi una consulenza gratuita" (che sparisce, deciso da Alberto il 24/10/2026), un blocco con due schede.

**Il bene è per la mia azienda** (compila l'imprenditore): partita IVA dell'azienda, nome e cognome, cellulare, email, consenso privacy.

**Il bene è per un mio cliente** (compila il fornitore): partita IVA del cliente, partita IVA della propria azienda, nome e cognome, cellulare, email, consenso privacy.

In tutti e due importo, durata, tipologia del bene e canone calcolato arrivano dal simulatore sopra, in campi nascosti. Se l'importo non è stato calcolato, il modulo lo chiede.

All'invio il pulsante mostra "Verifico nel registro imprese" e, avuta la risposta, la pagina rimanda a `/grazie`, come oggi. La conversione Google Ads scatta sulla visita a `/grazie` (verificato da Alberto in GTM il 24/10/2026), quindi la destinazione resta quella. L'esito viaggia in `sessionStorage` (mai nell'URL: dentro ci sono dati di un'azienda) e `/grazie` lo mostra al posto del messaggio generico. Senza esito in `sessionStorage` (tutti gli altri moduli del sito, o una visita diretta) `/grazie` resta esattamente com'è. L'esito si cancella da `sessionStorage` appena letto.

## La regola dell'esito

Decisa da Alberto il 24/10/2026, sui soli dati della ricerca economica del cliente finale. La regola cambia con la forma giuridica.

**Rosso**, per tutti: attività da meno di 2 anni compiuti.

**Società di capitali** (SRL, SRLS, SPA, SAPA, cooperative e ogni forma che deposita il bilancio):
- **Verde**: almeno 2 anni compiuti, bilancio dell'anno atteso, importo non oltre il 20% del fatturato di quel bilancio, utile positivo. Tutte e quattro.
- **Giallo**: tutto il resto con almeno 2 anni. In particolare: bilancio di un anno precedente a quello atteso (oggi il 2024) o più vecchio, nessun bilancio, rapporto sopra il 20%, perdita o pareggio.

L'anno atteso si calcola con la regola di `annoBilancioAtteso()` (dal 1° agosto è l'anno appena chiuso: oggi il 2025). Mai scritto a mano.

**Ditte individuali e società di persone** (SNC, SAS, società semplici): non depositano il bilancio, quindi **verde** con almeno 2 anni compiuti, senza guardare fatturato e utile. Se però la ricerca restituisce un fatturato e l'importo lo supera del 20%, l'esito resta verde e la mail lo segnala (scelta del builder: la regola di Alberto guarda solo l'anzianità).

Due casi decisi dal builder: anzianità che non si legge (manca la data di inizio e quella di iscrizione) dà giallo, mai verde né rosso; la forma giuridica che non si riconosce si tratta come società di capitali.

Non è `src/lib/credit-policy.ts` (che ha quattro criteri, soglia di 3 anni e il patrimonio netto): è una regola nuova, in un modulo puro e testato, per esempio `src/lib/esito-simulatore.ts`. Il calcolo sta sul server: il browser non manda mai fatturato o utile.

L'anzianità si conta dalla data di inizio attività (o di iscrizione al registro, se manca), in anni compiuti alla data di oggi.

## Cosa vede chi ha compilato

Su `/grazie`: ragione sociale, sede, forma e il colore con la frase; poi i dati pubblici letti dal registro (deciso da Alberto: sono dati pubblici), cioè anno di attività, anno del bilancio, fatturato, utile, e il rapporto fra importo richiesto e fatturato; accanto a ogni criterio un segno passato / non passato / non disponibile, come su `/fiera`. Sotto i numeri, due o tre indicazioni concrete che spiegano cosa guarda una società di noleggio e cosa fare, scelte dal server in base ai criteri non passati (deciso da Alberto: rendono l'esito più credibile e professionale). Esempi, da rifinire nel piano:
- rapporto sopra il 20%: "Le società di noleggio di solito finanziano fino a circa un quinto del fatturato annuo. Un anticipo o una durata più lunga possono riportare la richiesta in linea.";
- bilancio dell'anno precedente: "Il registro ha ancora il bilancio <anno>. Se il <anno atteso> è chiuso, anche non depositato, conviene averlo pronto: è il primo documento che chiederanno.";
- perdita o pareggio: "Un esercizio in perdita non chiude la porta, ma va spiegato: una nota del commercialista sulla causa vale più di qualsiasi altro documento.";
- meno di 2 anni: "Se l'attività viene da un conferimento o da un'azienda precedente dei soci, quella storia conta e va documentata.";
- ditta individuale o società di persone: "Per le ditte e le società di persone conta il Modello Unico: tienilo pronto, è quello che sostituisce il bilancio.".

Testi proposti per la frase dell'esito, nella voce di Alberto:

**Verde.** "I numeri della tua azienda sono in linea con quello che chiedono le società di noleggio. Ti richiamo entro 24 ore lavorative con il preventivo. Per andare avanti mi servono questi documenti:" e la lista.

**Giallo.** "La pratica si può presentare, ma dai numeri pubblici emerge qualche elemento da capire meglio: presentata così com'è rischierebbe un no. Con i documenti in mano la imposto io nel modo giusto e scelgo la società di noleggio più adatta. Ti richiamo entro 24 ore lavorative. Intanto prepara:" e la lista.

**Rosso.** "L'azienda ha meno di due anni di attività, e per le società di noleggio è una pratica fuori standard. Fuori standard non vuol dire impossibile: se c'è stato il conferimento di un'attività precedente, o un socio con una storia alle spalle, si può costruire la richiesta su quello. Va studiata da un professionista. Ti richiamo entro 24 ore lavorative. Intanto prepara:" e la lista.

Sotto, in tutti e tre: "Valutazione indicativa sui dati pubblici del registro imprese, non è una delibera."

Nel modulo del fornitore i testi parlano del "tuo cliente" invece che della "tua azienda".

Partita IVA non trovata, azienda cessata, in liquidazione o inattiva: niente colore e niente scheda automatica. "Non trovo questa partita IVA tra le aziende attive del registro imprese. Ti richiamo io per capire." La mail ad Alberto riporta lo stato letto (scelta del builder).

## La lista dei documenti

Decisa da Alberto il 24/10/2026. Diversa da `buildChecklist()` di `src/lib/checklist-pratica.ts`, che chiede due bilanci e il documento dell'anno: qui ne basta uno.

Fino a 10.000 euro: visura camerale, carta d'identità del legale rappresentante, tessera sanitaria, IBAN aziendale, email, cellulare, preventivo dei beni da acquistare.

Sopra 10.000 euro, in più, la reddituale:
- ditte individuali e società di persone (SNC, SAS): ultimo Modello Unico;
- società di capitali: ultimo bilancio depositato con la ricevuta di deposito.

La forma giuridica si legge dalla ricerca economica, non si chiede. L'anno del bilancio non si scrive a mano: si usa la regola di `annoBilancioAtteso()` di `src/lib/motore/semaforo-locatore.ts` (dal 1° agosto è quello dell'anno appena chiuso), estratta o duplicata in un modulo client-safe, perché "2025" scritto oggi sarà sbagliato tra un anno. Vale la regola del repo: nessun anno scritto a mano in una checklist.

## La scheda completa automatica

Solo sul verde, solo sul cliente finale, solo dopo che cellulare ed email sono passati dai controlli di `src/lib/dati-cliente-pratica.ts`. Si usa `schedaAzienda()` di `src/lib/openapi.ts`, che salva in `openapi/aziende/` (cache 30 giorni): la scheda compare da sola nelle "Ricerche ultimi 30 giorni" di `/tools/valutazione`, e Alberto la apre da lì senza ripagarla. Si esegue dopo la risposta al browser, con `waitUntil` di `@vercel/functions`, come già fa `eventi-merito.ts`: la pagina non aspetta i secondi della scheda.

Se il cliente ha già una scheda in cache, non si ordina niente. Se il tetto della sorgente è raggiunto, non si ordina e la mail lo dice.

## La ricerca sul fornitore

Nel secondo modulo, ricerca economica anche sulla partita IVA del fornitore: ragione sociale, ATECO, fatturato, anzianità. Serve ad Alberto per capire dove indirizzarlo (portale, canale, settore). In questa versione i dati vanno solo nella mail: nessuna regola di instradamento automatica e niente a schermo per il fornitore (scelta del builder; le regole di instradamento si scrivono quando Alberto le avrà definite).

## La mail ad Alberto

Una per invio, da `inviaMail()` di `src/lib/mail-portale.ts`, verso `mediocreditofacile@gmail.com` (destinatario interno: la copia nascosta non serve). Oggetto: "Simulatore: <ragione sociale> · <importo> · <colore>". Dentro: chi ha compilato e in quale modulo, contatti, importo, durata, tipologia, canone; per il cliente finale ragione sociale, partita IVA, forma, ATECO, sede, inizio attività, anno di bilancio, fatturato, utile, esito con i criteri passati e non passati; per il fornitore gli stessi dati essenziali; se la scheda completa è stata ordinata, con il link a `/tools/valutazione`. Il consegnato a Resend decide cosa vede l'utente solo nel senso che, se la mail non parte, la pagina mostra comunque l'esito ma propone anche il WhatsApp precompilato, come fa `/fiera`.

La lead entra anche nel log strutturato (`evento: 'simulatore_verifica'`), come `/api/submit`.

## Protezioni sulla spesa

L'endpoint è pubblico e ogni ricerca fuori cache costa. Si riusano gli anelli di `src/lib/fiera-guardia.ts`, con una sorgente nuova nel registro spesa (`simulatore`, sotto `openapi/costi/<mese>/simulatore/`):
- campo trappola per i robot (risponde ok e non spende);
- frequenza per IP (10 al minuto, impronta con segreto, nessun IP in chiaro);
- tetto giornaliero di ricerche a pagamento;
- tetto mensile di 20 euro della sorgente (deciso da Alberto), calcolato prudente come su `/fiera`, che copre anche le schede da 0,81; massimo 40 ricerche a pagamento al giorno, e le schede contano solo nel tetto mensile (scelte del builder). I due valori stanno in variabili d'ambiente con questi default.

Oggi frequenza, conteggio giornaliero e registro di `fiera-guardia.ts` sono legati alla tabella `app.fiera_ricerca` e alle variabili `FIERA_*`: vanno resi parametrici (per esempio una colonna `sorgente` sulla tabella, o una tabella gemella). Se serve uno SQL, va in produzione prima del push, come gli altri. La sorgente `simulatore` va aggiunta al tipo `Sorgente` di `openapi.ts`, con il suo tetto, altrimenti prende `OPENAPI_TETTO_MESE`.

Niente cookie con registrazione, a differenza di `/fiera`: qui i contatti si lasciano prima della ricerca, non dopo. Se un tetto è raggiunto il modulo funziona lo stesso: niente ricerca, niente colore, messaggio "ti richiamo entro 24 ore lavorative" con la lista base, e la mail ad Alberto dice che la verifica non è partita.

Le due ricerche dello stesso invio contano per due.

### Revisione del 24/10/2026

La revisione del codice ha trovato tre punti, corretti prima della consegna: invii in parallelo che scavalcavano i tetti (ora ogni invio prenota una riga sotto lock prima di spendere), operazioni Blob consumate a ogni invio (la cache si legge con `get()` per nome, i tetti si contano dal database), quota Resend esauribile (tetto di 30 invii al giorno, oltre i quali la mail non parte e la pagina offre WhatsApp). Il tetto delle ricerche scende a 20 al giorno per limitare le scritture sullo store. Due minori: la virgola delle migliaia nell'importo si rifiuta, e senza verifica la lista documenti resta quella base.

### Preventivo e testi, 24/10/2026 (seconda richiesta di Alberto)

Chi lascia i dati scarica subito un preventivo PDF, con qualunque esito: canone su tutte le durate, intestato all'azienda verificata, lo stesso PDF in allegato alla mail ad Alberto. La telefonata entro 24 ore serve per i chiarimenti, i dettagli del caso e del bene e i controlli di congruità, non per avere il preventivo. Nei testi rivolti al cliente non si nomina il "registro imprese": si scrive "interroghiamo le banche dati e ti dico subito come si presenta a una società di noleggio e la fattibilità dell'operazione". Questa parte supera il non obiettivo "niente preventivo PDF automatico" scritto sopra.

## Tracciamento

Il campo `fonte` resta `simulatore-noleggio-operativo`, con `variante` = `azienda` o `cliente`. Eventi GTM: `simulatore_verifica_inviata` (con `variante` ed `esito`) e lo stesso `generate_lead` delle altre pagine.

**Da controllare prima di pubblicare**: oggi la pagina manda `form_inviato` e rimanda a `/grazie`, che manda `generate_lead`. Dal repo non si vede se la conversione Google Ads in GTM scatta sull'evento o sulla visita a `/grazie`. Se scatta sulla visita, togliere il redirect fa sparire le conversioni: in quel caso o si cambia il trigger in GTM, o dopo l'esito la pagina offre comunque un passaggio a `/grazie`. Va guardato nel contenitore GTM prima del push.

## Cosa resta al builder

Nome dei file e dell'endpoint, struttura del componente Preact, stile (design system MCF, `DESIGN-MCF.md`, stessi colori del semaforo di `/fiera`), messaggi di errore dei campi, test. Il modulo puro dell'esito e quello della lista documenti vanno coperti da test con le date fissate. La partita IVA si controlla con `src/lib/piva.ts`, cellulare ed email con `src/lib/dati-cliente-pratica.ts`. Lo schema FAQ e la parte SEO della pagina non si toccano.

## Decisioni

Di Alberto, 24/10/2026: i due moduli; la regola dell'esito per forma giuridica (bilancio dell'anno atteso per il verde delle società di capitali, solo anzianità per ditte e società di persone, rosso sotto i 2 anni compiuti); i testi dell'esito nella sostanza; la lista documenti con un solo bilancio; la scheda da 0,81 solo sul verde; la ricerca economica anche sul fornitore; il vecchio modulo che sparisce; 20 euro al mese di tetto.

Di Alberto, dopo la prima lettura: `/grazie` resta la destinazione e mostra l'esito; i dati di bilancio si mostrano; indicazioni concrete sotto l'esito.

Del builder, da controllare: nome e cognome nel modulo; esito passato a `/grazie` via `sessionStorage`; lista documenti in tutti e tre gli esiti; anzianità illeggibile = giallo; forma sconosciuta = società di capitali; liquidazione e inattive come cessate; fatturato oltre il 20% su ditte e società di persone solo segnalato in mail; 40 ricerche al giorno; nessun instradamento automatico del fornitore; ripiego WhatsApp se la mail non parte.
