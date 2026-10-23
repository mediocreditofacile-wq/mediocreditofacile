// Checklist dei documenti di una pratica di noleggio o leasing.
//
// Modulo puro, senza segreti: lo usano il server (mail a MCF, record della
// pratica) e il browser del motore dei portali, cosi' la lista che vede
// l'agente e quella che arriva a MCF sono la stessa.

// L'anno del documento che si chiede oltre ai bilanci o alle dichiarazioni gia'
// depositati. Dal 1° agosto il bilancio dell'anno prima e' depositato e serve la
// situazione dell'anno in corso; prima di agosto serve l'anno appena chiuso.
// E' annoBilancioAtteso di motore/semaforo-locatore.ts piu' uno: non lo importa
// per non portare nel bundle dei portali le regole del semaforo.
export function annoReddituale(oggi: Date = new Date()): number {
  return oggi.getMonth() >= 7 ? oggi.getFullYear() : oggi.getFullYear() - 1;
}

export type FormaReddituale = 'societa' | 'ditta';

// Il nome del documento, calcolato sulla data: le pagine sono statiche e un
// anno scritto a mano invecchia (ottobre 2026 diceva ancora "2025").
export function documentoAnno(forma: FormaReddituale, oggi: Date = new Date()): string {
  const anno = annoReddituale(oggi);
  if (anno === oggi.getFullYear()) return `Situazione contabile provvisoria ${anno}`;
  return forma === 'societa' ? `Bilancio definitivo ${anno} (anche pre-deposito)` : `Situazione contabile aggiornata ${anno}`;
}

// Lo stesso documento dentro una frase, con l'articolo giusto
export function fraseDocumentoAnno(forma: FormaReddituale, oggi: Date = new Date()): string {
  const anno = annoReddituale(oggi);
  if (anno === oggi.getFullYear()) return `la situazione contabile provvisoria ${anno}`;
  return forma === 'societa' ? `il bilancio definitivo ${anno}` : `la situazione contabile ${anno}`;
}

// Checklist documenti: base sempre richiesta, reddituali sopra 10.000 €
// differenziati per forma giuridica (stessa logica dell'area Edilizia GIERRE).
export function buildChecklist(formaGiuridica: string, importoNum: number, extra: string[] = [], oggi: Date = new Date()): string[] {
  const base = [
    'Visura camerale (o visura ditta individuale)',
    "Carta d'identità del legale rappresentante / titolare",
    'Tessera sanitaria / codice fiscale',
    'Coordinate IBAN aziendali',
    'Email aziendale',
    'Cellulare del referente',
    ...extra,
  ];

  if (importoNum <= 10000) return base;

  const fg = formaGiuridica.toLowerCase();
  if (fg.includes('individuale') || fg.includes('autonomo') || fg === 'di') {
    return [
      ...base,
      'Ultime 2 dichiarazioni dei redditi (Modello Unico)',
      documentoAnno('ditta', oggi),
    ];
  }

  return [
    ...base,
    'Ultimi 2 bilanci depositati',
    documentoAnno('societa', oggi),
  ];
}

