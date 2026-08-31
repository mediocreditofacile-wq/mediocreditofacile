// Paesi per la ricerca estera, divisi come li divide il tool Marotta: dentro o
// fuori l'area Schengen/SEPA. La lista serve solo a popolare i menu a tendina;
// chi decide se un paese e' in area e' `inAreaSchengen()` in export-estero.ts.
//
// Il tool Marotta tiene una copia sua di queste liste perche' e' un file statico
// servito da public/ e non puo' importare moduli del sito.

export const PAESI_SEPA: [string, string][] = [
  ['DE', 'Germania'], ['FR', 'Francia'], ['ES', 'Spagna'], ['PT', 'Portogallo'],
  ['AT', 'Austria'], ['BE', 'Belgio'], ['NL', 'Paesi Bassi'], ['IE', 'Irlanda'],
  ['GR', 'Grecia'], ['HR', 'Croazia'], ['SI', 'Slovenia'], ['SK', 'Slovacchia'],
  ['CZ', 'Cechia'], ['HU', 'Ungheria'], ['PL', 'Polonia'], ['RO', 'Romania'],
  ['BG', 'Bulgaria'], ['SE', 'Svezia'], ['DK', 'Danimarca'], ['FI', 'Finlandia'],
  ['NO', 'Norvegia'], ['CH', 'Svizzera'],
];

export const PAESI_MONDO: [string, string][] = [
  ['GB', 'Regno Unito'], ['US', 'Stati Uniti'], ['CA', 'Canada'], ['BR', 'Brasile'],
  ['MX', 'Messico'], ['AR', 'Argentina'], ['TR', 'Turchia'], ['AE', 'Emirati Arabi Uniti'],
  ['SA', 'Arabia Saudita'], ['MA', 'Marocco'], ['TN', 'Tunisia'], ['EG', 'Egitto'],
  ['ZA', 'Sudafrica'], ['IN', 'India'], ['CN', 'Cina'], ['JP', 'Giappone'], ['AU', 'Australia'],
];

/** Cosa si digita nel campo: gli identificativi esteri non si somigliano fra loro */
export const FORMATO_ID: Record<string, string> = {
  DE: 'Partita IVA, es. DE129274202',
  FR: 'SIREN o SIRET, es. 552032534',
  ES: 'CIF, es. A15075062',
  BR: 'CNPJ, es. 33.592.510/0001-54',
  GB: 'Company number',
  PT: 'NIPC',
  AT: 'Firmenbuchnummer o partita IVA',
  CH: 'IDE/UID',
};

export function nomePaese(iso: string): string {
  const t = [...PAESI_SEPA, ...PAESI_MONDO].find((x) => x[0] === iso.toUpperCase());
  return t ? t[1] : iso.toUpperCase();
}
