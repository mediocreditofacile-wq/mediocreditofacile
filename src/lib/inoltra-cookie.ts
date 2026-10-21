// Passa al browser i cookie di una risposta di Better Auth, uno per riga.
//
// Trappola gia' pagata (21/10/2026, primo accesso di Maurizio Palumbo su Led Office):
// Better Auth mette due cookie, la sessione (30 giorni) e la sua copia in cache
// (5 minuti). `headers.get('set-cookie')` li restituisce incollati con una virgola, e
// il browser legge quella riga come un cookie solo: gli attributi del secondo finiscono
// sul primo, e vale l'ultimo Max-Age. La sessione durava cosi' 5 minuti, mentre nel
// database restava valida un mese. Ogni cookie va in un'intestazione Set-Cookie sua.

/** Copia in `verso` ogni Set-Cookie di `da`, ciascuno in un'intestazione separata */
export function copiaSetCookie(da: Headers, verso: Headers): Headers {
  for (const cookie of da.getSetCookie()) verso.append('set-cookie', cookie);
  return verso;
}
