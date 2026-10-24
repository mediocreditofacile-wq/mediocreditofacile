// Appena generato il preventivo, un PDF si apre da solo: quello da dare al
// cliente, cioe' il noleggio. Gli altri restano a un tocco sotto. Se ne
// aprissimo piu' d'uno insieme, Chrome chiederebbe il permesso per i
// download multipli e sull'iPhone si impilerebbero.

interface Documento {
  nome: string;
  pathname: string;
}

// L'infografico e la proposta di vendita accompagnano il preventivo, non lo sostituiscono
const ACCESSORIO = /infografic|proposta-vendita|proposta-locatore/i;
const NOLEGGIO = /noleggio|canone/i;
const LEASING = /leasing/i;

export function documentoDaAprire<T extends Documento>(docs: T[]): T | null {
  const principali = docs.filter((d) => !ACCESSORIO.test(d.nome));
  return (
    principali.find((d) => NOLEGGIO.test(d.nome) && !LEASING.test(d.nome)) ??
    // Senza noleggio (mezzo usato, solo leasing) si apre quello che c'e'
    principali[0] ??
    docs[0] ??
    null
  );
}
