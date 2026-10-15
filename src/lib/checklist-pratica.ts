// Checklist dei documenti di una pratica di noleggio o leasing.
//
// Modulo puro, senza segreti: lo usano il server (mail a MCF, record della
// pratica) e il browser del motore dei portali, cosi' la lista che vede
// l'agente e quella che arriva a MCF sono la stessa.

// Checklist documenti: base sempre richiesta, reddituali sopra 10.000 €
// differenziati per forma giuridica (stessa logica dell'area Edilizia GIERRE).
export function buildChecklist(formaGiuridica: string, importoNum: number, extra: string[] = []): string[] {
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
      'Situazione contabile aggiornata 2025',
    ];
  }

  return [
    ...base,
    'Ultimi 2 bilanci depositati',
    'Bilancio definitivo 2025 (anche pre-deposito)',
  ];
}

