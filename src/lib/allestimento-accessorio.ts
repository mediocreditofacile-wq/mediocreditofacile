// Accessori legati a un allestimento della macchina (dal 16/10/2026, nato con le
// batterie di scorta Duplex): un accessorio senza allestimento va con ogni
// versione della sua famiglia, uno con l'allestimento solo con quella versione.
// La batteria di scorta della 340 si offre con la 340 a batteria, non con quella
// a cavo ne' con la Steam. Pura e client-safe: la usano il server del motore, la
// pagina del portale e il simulatore di /tools/duplex.

export function accessorioCompatibile(dellAccessorio: unknown, dellaMacchina: unknown): boolean {
  if (dellAccessorio == null || dellAccessorio === '') return true;
  return dellAccessorio === dellaMacchina;
}
