#!/usr/bin/env python3
"""
Migra <span class="material-icons-outlined">NOME</span> al nuovo
<Icon name="NOME" /> nei file .astro del repo MCF.

Pattern supportati:
  <span class="material-icons-outlined">NAME</span>
  <span class="material-icons-outlined" aria-hidden="true">NAME</span>
  <span class="EXTRA material-icons-outlined">NAME</span>
  <span class="material-icons-outlined EXTRA">NAME</span>
  <span class="A material-icons-outlined B" aria-hidden="true">NAME</span>
  <span class="material-icons-outlined">{expr}</span>  (nome dinamico)

Aggiunge `import Icon from '<path>/Icon.astro';` nel frontmatter
se non gia' presente, calcolando il path relativo dal file corrente.
"""

import re
import sys
from pathlib import Path

REPO = Path("/Users/alberto/dev/mediocreditofacile")
ICON_COMPONENT = REPO / "src" / "components" / "Icon.astro"

# Pattern unico che cattura span con material-icons-outlined ovunque tra le classi.
# Tollera attributi extra (es. aria-hidden="true") tra class e >.
SPAN_RE = re.compile(
    r'<span\s+([^>]*?\bmaterial-icons-outlined\b[^>]*?)>([^<]+)</span>',
    re.DOTALL,
)

# Estrae il valore dell'attributo class="..." dal blocco attributi
CLASS_ATTR_RE = re.compile(r'\bclass="([^"]*)"')


def relative_import_path(astro_file: Path) -> str:
    """Restituisce il path relativo da astro_file a Icon.astro per import Astro."""
    import os
    rel = os.path.relpath(ICON_COMPONENT, start=astro_file.parent)
    return rel.replace("\\", "/")


def transform_spans(content: str) -> tuple[str, int]:
    """Applica il replace, ritorna (nuovo_content, count)."""
    count = 0

    def replace(match: re.Match) -> str:
        nonlocal count
        attrs_block = match.group(1)
        inner = match.group(2).strip()

        class_match = CLASS_ATTR_RE.search(attrs_block)
        if not class_match:
            # niente class esplicita -> non tocchiamo
            return match.group(0)

        all_classes = class_match.group(1).split()
        extra_classes = [c for c in all_classes if c != "material-icons-outlined"]

        # Nome icona: se inizia con { è una expression Astro
        if inner.startswith("{") and inner.endswith("}"):
            name_attr = f"name={inner}"
        else:
            name_attr = f'name="{inner}"'

        parts = [name_attr]
        if extra_classes:
            parts.append(f'class="{" ".join(extra_classes)}"')

        count += 1
        return f"<Icon {' '.join(parts)} />"

    new_content = SPAN_RE.sub(replace, content)
    return new_content, count


def ensure_import(content: str, astro_file: Path) -> tuple[str, bool]:
    """
    Inserisce `import Icon from '...'` nel frontmatter se non esiste.
    Ritorna (nuovo_content, added_bool).
    """
    if re.search(r"\bimport\s+Icon\s+from\s+['\"][^'\"]*Icon\.astro['\"]", content):
        return content, False

    # Trova il frontmatter delimitato da ---
    fm_match = re.match(r"^---\s*\n(.*?)\n---\s*\n", content, re.DOTALL)
    if not fm_match:
        # Nessun frontmatter: lo creiamo
        rel = relative_import_path(astro_file)
        new_fm = f"---\nimport Icon from '{rel}';\n---\n"
        return new_fm + content, True

    fm_content = fm_match.group(1)
    rel = relative_import_path(astro_file)
    new_fm_content = f"import Icon from '{rel}';\n{fm_content}"
    new_content = content.replace(fm_match.group(0), f"---\n{new_fm_content}\n---\n", 1)
    return new_content, True


def process_file(astro_file: Path, dry_run: bool = False) -> dict:
    original = astro_file.read_text(encoding="utf-8")
    transformed, replaced = transform_spans(original)
    if replaced == 0:
        return {"file": str(astro_file), "replaced": 0, "import_added": False}

    transformed, added = ensure_import(transformed, astro_file)
    if not dry_run:
        astro_file.write_text(transformed, encoding="utf-8")

    return {
        "file": str(astro_file.relative_to(REPO)),
        "replaced": replaced,
        "import_added": added,
    }


def main():
    args = sys.argv[1:]
    dry_run = "--dry-run" in args
    targets = [a for a in args if a != "--dry-run"]

    if targets:
        files = [Path(t).resolve() for t in targets]
    else:
        files = list((REPO / "src").rglob("*.astro"))

    total_replaced = 0
    files_touched = 0
    for f in sorted(files):
        if not f.exists():
            continue
        # Controllo veloce: se il file non contiene 'material-icons-outlined' lo saltiamo
        try:
            text = f.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        if "material-icons-outlined" not in text:
            continue

        result = process_file(f, dry_run=dry_run)
        if result["replaced"]:
            files_touched += 1
            total_replaced += result["replaced"]
            tag = "(dry-run)" if dry_run else ""
            imp = "[+import]" if result["import_added"] else ""
            print(f"  {result['file']}: {result['replaced']} sostituzioni {imp} {tag}")

    print()
    print(f"File toccati: {files_touched}")
    print(f"Sostituzioni totali: {total_replaced}")
    if dry_run:
        print("(dry-run, niente scritto su disco)")


if __name__ == "__main__":
    main()
