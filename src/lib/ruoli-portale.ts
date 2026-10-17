// Ruoli dei portali con accesso nominale (referente, agente).
//
// Modulo puro, senza database: lo importa auth.ts per configurare Better Auth
// e lo leggono i test senza bisogno di una connessione.
//
// I rapporti con il fornitore (inviti, membri, ruoli) li scrive solo il nostro
// codice: src/lib/inviti.ts, /api/portale-invito, /api/portale-utenti. Per
// questo nessun ruolo ha i permessi di Better Auth su organization, member e
// invitation: con quei permessi il referente poteva nominare altri referenti e
// cancellare membri dalle route /api/auth/organization/*, scavalcando la regola
// per cui i referenti li nomina solo MCF (scansione Claude Security del
// 17/10/2026, F5). Le route stesse sono chiuse in src/lib/rotte-auth.ts.

import { createAccessControl } from 'better-auth/plugins/access';
import { defaultStatements } from 'better-auth/plugins/organization/access';

/**
 * Permessi del portale. Non usiamo i ruoli predefiniti owner/admin/member
 * perche' il loro member e' pensato in sola lettura, mentre il nostro agente
 * deve poter creare preventivi e rileggere i propri.
 */
const statement = {
  ...defaultStatements,
  preventivo: ['crea', 'leggi-propri', 'leggi-org'],
  utente: ['invita', 'disattiva', 'lista'],
  documento: ['leggi-propri', 'leggi-org'],
} as const;

export const ac = createAccessControl(statement);

/** Il referente del fornitore: vede tutta la rete e ne gestisce gli account */
export const referente = ac.newRole({
  preventivo: ['crea', 'leggi-propri', 'leggi-org'],
  utente: ['invita', 'disattiva', 'lista'],
  documento: ['leggi-propri', 'leggi-org'],
});

/** L'agente: genera preventivi e rilegge solo i propri */
export const agente = ac.newRole({
  preventivo: ['crea', 'leggi-propri'],
  documento: ['leggi-propri'],
});

export const RUOLI_ORG = { referente, agente };
export type RuoloOrg = keyof typeof RUOLI_ORG;
