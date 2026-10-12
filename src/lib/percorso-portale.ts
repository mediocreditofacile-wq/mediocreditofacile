// Dove sta il portale di un fornitore con accesso nominale.
//
// Green-Go e' nato prima del motore e resta su /tools/green-go. Ogni fornitore
// sul motore dei portali sta su /portale/<slug>. Lo usano i link delle mail
// (invito e reset password): sbagliarlo vuol dire mandare un agente su una
// pagina che non lo riconosce.

const PORTALI_STORICI = new Set(['green-go']);

export function percorsoPortale(slug: string): string {
  return PORTALI_STORICI.has(slug) ? `/tools/${slug}` : `/portale/${slug}`;
}
