#!/usr/bin/env python3
"""
Ristrutturazione campagne Google Ads — budget 35€/giorno.
Esegue:
  1. Fetch budget correnti campagne
  2. Update budget: Diventa Partner → €15/gg, Finanza Veloce → €5/gg
  3. Applica keyword pauses "approved" dai proposals
  4. Crea nuova campagna "Noleggio Operativo Fotovoltaico" a €15/gg (PAUSED)
  5. Crea 6 ad group (1 per angolo), keyword e RSA per la campagna fotovoltaico

Uso:
  python apply_restructuring.py --dry-run   # mostra cosa verrebbe fatto
  python apply_restructuring.py             # applica le modifiche
"""
import argparse
import json
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

sys.path.insert(0, str(Path(__file__).parent))


LANDING_URL = "https://www.mediocreditofacile.it/tools/simulatore-noleggio-fotovoltaico"

FOTOVOLTAICO_AD_GROUPS = [
    # ── ANGOLO 1: Zero Anticipo ──────────────────────────────────────────────
    {
        "name": "FV – Zero Anticipo",
        "keywords": [
            ("fotovoltaico zero anticipo", "PHRASE"),
            ("impianto solare senza anticipo", "PHRASE"),
            ("fotovoltaico senza acconto azienda", "PHRASE"),
            ("pannelli solari zero anticipo", "PHRASE"),
            ("fotovoltaico senza investimento iniziale", "PHRASE"),
        ],
        "headlines": [
            "Zero Anticipo Impianto Solare",
            "Fotovoltaico Senza Versare Nulla",
            "Nessun Anticipo, Canone Fisso",
            "Inizi Subito, Paghi Solo il Canone",
            "Fotovoltaico a Canone Fisso",
            "Nessun Esborso Iniziale",
            "Impianto Attivo Senza Acconto",
            "Fotovoltaico Senza Investire",
            "Risparmio Bolletta dal 1° Mese",
            "Manutenzione Inclusa Gratis",
            "Assicurazione All-Risk Inclusa",
            "100% Deducibile Fiscalmente",
            "Preventivo Gratuito in 24 Ore",
            "Attivazione in 24-48 Ore",
            "Noleggio Fotovoltaico Aziende",
        ],
        "descriptions": [
            "Zero anticipo: fotovoltaico a canone fisso. Inizi subito a risparmiare in bolletta dal primo mese.",
            "Nessun investimento iniziale. Canone mensile fisso, manutenzione e assicurazione incluse.",
            "Da 24 a 84 mesi, canone 100% deducibile. Nessun debito in bilancio e in Centrale Rischi.",
            "Risposta in 24 ore. Confrontiamo 10+ offerte noleggio fotovoltaico per aziende. Gratis.",
        ],
    },
    # ── ANGOLO 2: Risparmio Bolletta ─────────────────────────────────────────
    {
        "name": "FV – Risparmio Bolletta",
        "keywords": [
            ("fotovoltaico risparmio bolletta azienda", "PHRASE"),
            ("impianto solare riduzione costi energia", "PHRASE"),
            ("fotovoltaico aziendale risparmio energetico", "PHRASE"),
            ("pannelli solari risparmio bolletta", "PHRASE"),
            ("fotovoltaico costi energia azienda", "PHRASE"),
        ],
        "headlines": [
            "Il Risparmio Copre il Canone",
            "Risparmio Bolletta dal 1° Mese",
            "Fotovoltaico: Bolletta Più Bassa",
            "Energia Solare, Costi Ridotti",
            "Il Sole Paga il Canone Mensile",
            "Risparmia Subito in Bolletta",
            "Fotovoltaico a Canone Fisso",
            "Zero Anticipo Impianto Solare",
            "Canone Fisso, Bolletta Variabile",
            "Manutenzione Inclusa Gratis",
            "100% Deducibile Fiscalmente",
            "Assicurazione All-Risk Inclusa",
            "Preventivo Gratuito in 24 Ore",
            "Attivazione in 24-48 Ore",
            "Noleggio Fotovoltaico Aziende",
        ],
        "descriptions": [
            "Il risparmio in bolletta copre il canone dal primo mese. Zero anticipo, canone fisso e prevedibile.",
            "Fotovoltaico aziendale a canone: riduci i costi energetici senza immobilizzare capitale.",
            "Anche se il tetto è in affitto. Manutenzione e assicurazione All-Risk incluse nel canone.",
            "Risposta in 24 ore. Confrontiamo 10+ offerte noleggio fotovoltaico per aziende. Gratis.",
        ],
    },
    # ── ANGOLO 3: Canone Fisso ───────────────────────────────────────────────
    {
        "name": "FV – Canone Fisso",
        "keywords": [
            ("fotovoltaico canone mensile fisso", "PHRASE"),
            ("noleggio fotovoltaico canone", "PHRASE"),
            ("impianto fotovoltaico rata fissa", "PHRASE"),
            ("fotovoltaico a canone aziendale", "PHRASE"),
            ("pannelli solari canone mensile", "PHRASE"),
        ],
        "headlines": [
            "Fotovoltaico a Canone Fisso",
            "Canone Fisso per Tutto il Contratto",
            "Sai Sempre Quanto Paghi",
            "Nessuna Sorpresa nel Canone",
            "Canone Fisso, 100% Deducibile",
            "Zero Anticipo, Canone Certo",
            "Impianto Solare a Rata Fissa",
            "Fotovoltaico Senza Sorprese",
            "Risparmio Bolletta dal 1° Mese",
            "Manutenzione Inclusa nel Canone",
            "Assicurazione All-Risk Inclusa",
            "Nessun Debito in Bilancio",
            "Preventivo Gratuito in 24 Ore",
            "Attivazione in 24-48 Ore",
            "Noleggio Fotovoltaico Aziende",
        ],
        "descriptions": [
            "Canone fisso e prevedibile per tutta la durata. Nessuna sorpresa, nessuna variazione.",
            "Zero anticipo. Il risparmio bolletta copre il canone. Manutenzione e assicurazione incluse.",
            "Da 24 a 84 mesi, 100% deducibile. Non appare in bilancio né in Centrale Rischi.",
            "Risposta in 24 ore. Confrontiamo 10+ offerte noleggio fotovoltaico per aziende. Gratis.",
        ],
    },
    # ── ANGOLO 4: No Debito / OPEX ───────────────────────────────────────────
    {
        "name": "FV – No Debito",
        "keywords": [
            ("fotovoltaico senza finanziamento", "PHRASE"),
            ("fotovoltaico fuori bilancio", "PHRASE"),
            ("solare aziendale senza debiti", "PHRASE"),
            ("fotovoltaico opex", "PHRASE"),
            ("impianto fotovoltaico centrale rischi", "PHRASE"),
        ],
        "headlines": [
            "Fotovoltaico Senza Debiti",
            "Nessun Debito in Bilancio",
            "Fotovoltaico Fuori Bilancio",
            "Non Peggiora il Tuo Rating",
            "Senza Centrale Rischi",
            "Fotovoltaico come Costo OPEX",
            "Linee di Credito Libere",
            "Impianto Fotovoltaico OPEX",
            "Canone Fisso, 100% Deducibile",
            "Zero Anticipo Subito Attivo",
            "Risparmio Bolletta dal 1° Mese",
            "Nessuna Burocrazia Bancaria",
            "Manutenzione Inclusa Gratis",
            "Preventivo Gratuito in 24 Ore",
            "Noleggio Fotovoltaico Aziende",
        ],
        "descriptions": [
            "Fotovoltaico OPEX: non appare in bilancio né in Centrale Rischi. Linee di credito libere.",
            "Zero anticipo. Canone fisso e 100% deducibile. Il risparmio bolletta copre il canone.",
            "Anche se il tetto è in affitto. Da 24 a 84 mesi, a fine contratto scegli tu.",
            "Risposta in 24 ore. Confrontiamo 10+ offerte noleggio fotovoltaico. Gratis.",
        ],
    },
    # ── ANGOLO 5: Tetto in Affitto ───────────────────────────────────────────
    {
        "name": "FV – Tetto in Affitto",
        "keywords": [
            ("fotovoltaico tetto in affitto", "PHRASE"),
            ("impianto solare capannone affittato", "PHRASE"),
            ("pannelli solari capannone in affitto", "PHRASE"),
            ("fotovoltaico anche con affitto", "PHRASE"),
            ("solare aziendale immobile in affitto", "PHRASE"),
        ],
        "headlines": [
            "Anche con Tetto in Affitto",
            "Fotovoltaico su Capannone Affittato",
            "Solare anche su Immobile in Affitto",
            "Non Devi Essere Proprietario",
            "Fotovoltaico Senza Vincoli",
            "Zero Anticipo, Tetto in Affitto",
            "Fotovoltaico a Canone Fisso",
            "Risparmio Bolletta dal 1° Mese",
            "Canone Fisso, 100% Deducibile",
            "Manutenzione Inclusa Gratis",
            "Assicurazione All-Risk Inclusa",
            "Nessun Debito in Bilancio",
            "Preventivo Gratuito in 24 Ore",
            "Attivazione in 24-48 Ore",
            "Noleggio Fotovoltaico Aziende",
        ],
        "descriptions": [
            "Fotovoltaico anche se il tetto è in affitto. Zero anticipo, canone fisso dal primo mese.",
            "Non devi essere proprietario dell'immobile. Il noleggio operativo funziona anche in affitto.",
            "Da 24 a 84 mesi. Canone 100% deducibile. Non appare in bilancio né in Centrale Rischi.",
            "Risposta in 24 ore. Confrontiamo 10+ offerte noleggio fotovoltaico per aziende. Gratis.",
        ],
    },
    # ── ANGOLO 6: Breve Termine / Flessibilità ───────────────────────────────
    {
        "name": "FV – Breve Termine",
        "keywords": [
            ("fotovoltaico 24 mesi azienda", "PHRASE"),
            ("noleggio solare breve durata", "PHRASE"),
            ("fotovoltaico senza vincoli 20 anni", "PHRASE"),
            ("impianto fotovoltaico contratto breve", "PHRASE"),
            ("fotovoltaico flessibile azienda", "PHRASE"),
        ],
        "headlines": [
            "Fotovoltaico da 24 a 84 Mesi",
            "Non 20 Anni: Scegli Tu la Durata",
            "Contratto Breve, Rinnovi o Esci",
            "Da 24 Mesi, Scegli Tu",
            "Fine Contratto: Riscatti o Rendi",
            "Fotovoltaico Flessibile per Aziende",
            "Nessun Vincolo a Lungo Termine",
            "Fotovoltaico a Canone Fisso",
            "Zero Anticipo Impianto Solare",
            "Risparmio Bolletta dal 1° Mese",
            "Canone Fisso, 100% Deducibile",
            "Nessun Debito in Bilancio",
            "Manutenzione Inclusa Gratis",
            "Preventivo Gratuito in 24 Ore",
            "Noleggio Fotovoltaico Aziende",
        ],
        "descriptions": [
            "Da 24 a 84 mesi, non 20 anni. A fine contratto scegli: riscatti, rinnovi o restituisci.",
            "Zero anticipo. Canone fisso e 100% deducibile. Risparmio bolletta copre il canone.",
            "Anche se il tetto è in affitto. Non appare in bilancio né in Centrale Rischi.",
            "Risposta in 24 ore. Confrontiamo 10+ offerte noleggio fotovoltaico per aziende. Gratis.",
        ],
    },
]

BUDGET_TARGETS = {
    "Diventa Partner — Vendor": 15.0,
    "FInanza Veloce": 5.0,
    # Nomi esatti come appaiono in Google Ads (sensibili a maiuscole e trattini)
}
NEW_CAMPAIGN_NAME = "Noleggio Operativo Fotovoltaico"
NEW_CAMPAIGN_BUDGET = 15.0


def load_config():
    import yaml
    with open("config.yaml") as f:
        return yaml.safe_load(f)


def find_approved_pauses(resource_lookup: dict) -> list:
    """
    Legge i proposals più recenti e restituisce keyword con status='approved'.
    Usa resource_lookup per trovare il resource_name se mancante nel JSON.
    resource_lookup: {(keyword, match_type, campaign, ad_group): resource_name}
    """
    proposals_dir = Path("data/proposals")
    files = sorted(proposals_dir.glob("*.json"), reverse=True)
    if not files:
        return []
    with open(files[0]) as f:
        proposals = json.load(f)
    approved = []
    for kw in proposals.get("to_pause", []):
        if kw.get("status") != "approved":
            continue
        # Prova prima il resource_name già nel JSON
        resource_name = kw.get("resource_name", "")
        if not resource_name:
            # Cerca nel lookup tramite (keyword, match_type, campaign, ad_group)
            key = (kw.get("keyword", ""), kw.get("match_type", ""),
                   kw.get("campaign", ""), kw.get("ad_group", ""))
            resource_name = resource_lookup.get(key, "")
        if resource_name:
            approved.append({**kw, "resource_name": resource_name})
        else:
            print(f"    [WARN] resource_name non trovato per: {kw.get('keyword')} [{kw.get('match_type')}]")
    return approved


def find_campaign_resource_name(customer_id: str, campaign_name: str,
                                yaml_path: str = "google-ads.yaml") -> str:
    """Restituisce il resource_name della campagna o '' se non trovata."""
    from google.ads.googleads.client import GoogleAdsClient
    client = GoogleAdsClient.load_from_storage(yaml_path)
    service = client.get_service("GoogleAdsService")
    query = """
SELECT campaign.resource_name, campaign.name
FROM campaign
WHERE campaign.name = '%s'
  AND campaign.status != 'REMOVED'
""" % campaign_name
    for row in service.search(customer_id=customer_id, query=query):
        return row.campaign.resource_name
    return ""


def run(dry_run: bool, customer_id: str):
    from collector.google_ads import fetch_campaign_budgets, fetch_keyword_performance
    from writer.google_ads import (
        update_campaign_budget, pause_keyword, create_campaign,
        create_ad_group, add_positive_keyword, create_rsa,
    )

    print(f"\n{'[DRY-RUN] ' if dry_run else ''}Ristrutturazione campagne — budget 35€/giorno")
    print("=" * 60)

    # --- 0. Fetch keyword per lookup resource_name ---
    print("\n[0] Fetch keyword per resource_name lookup...")
    kws = fetch_keyword_performance(customer_id)
    resource_lookup = {
        (kw["keyword"], kw["match_type"], kw["campaign"], kw["ad_group"]): kw["resource_name"]
        for kw in kws if kw.get("resource_name")
    }
    print(f"    {len(resource_lookup)} keyword indicizzate")

    # --- 1. Fetch budget correnti ---
    print("\n[1] Fetch campagne attive...")
    campaigns = fetch_campaign_budgets(customer_id)
    print(f"    Trovate {len(campaigns)} campagne:")
    for c in campaigns:
        marker = " ← target" if c["campaign"] in BUDGET_TARGETS else ""
        print(f"    • {c['campaign']}: €{c['daily_budget_euros']:.2f}/gg{marker}")

    # --- 2. Update budget ---
    print("\n[2] Aggiornamento budget campagne:")
    for c in campaigns:
        campaign_name = c["campaign"]
        if campaign_name not in BUDGET_TARGETS:
            continue
        target_budget = BUDGET_TARGETS[campaign_name]
        current = c["daily_budget_euros"]
        if abs(current - target_budget) < 0.01:
            print(f"    {campaign_name}: già a €{current:.2f} — skip")
            continue
        print(f"    {campaign_name}: €{current:.2f} → €{target_budget:.2f}")
        if not dry_run:
            result = update_campaign_budget(
                customer_id,
                c["campaign_budget_resource_name"],
                target_budget,
            )
            print(f"      ✓ Applicato: {result['resource_name']}")

    # --- 3. Applica keyword pauses ---
    print("\n[3] Keyword da pausare (status='approved' nei proposals):")
    approved_pauses = find_approved_pauses(resource_lookup)
    if not approved_pauses:
        print("    Nessuna keyword approved trovata.")
    for kw in approved_pauses:
        label = "%s [%s] — %s" % (kw.get("keyword", "?"), kw.get("match_type", "?"), kw.get("campaign", "?"))
        print(f"    • {label}")
        if not dry_run:
            try:
                result = pause_keyword(customer_id, kw["resource_name"])
                print(f"      ✓ Pausata")
            except Exception as e:
                print(f"      ✗ Errore: {e}")

    # --- 4. Crea nuova campagna fotovoltaico ---
    print("\n[4] Nuova campagna:")
    print(f"    '{NEW_CAMPAIGN_NAME}' — €{NEW_CAMPAIGN_BUDGET:.2f}/gg (PAUSED)")
    if not dry_run:
        try:
            result = create_campaign(
                customer_id,
                NEW_CAMPAIGN_NAME,
                NEW_CAMPAIGN_BUDGET,
            )
            print(f"    ✓ Creata: {result['campaign_resource_name']}")
            print(f"    ✓ Budget: {result['campaign_budget_resource_name']}")
            print("    NOTA: campagna creata in stato PAUSED — attivare manualmente dopo aver aggiunto ad group e keyword.")
        except Exception as e:
            print(f"    ✗ Errore: {e}")

    # --- 5. Crea ad group, keyword e RSA fotovoltaico ---
    print("\n[5] Ad group, keyword e RSA campagna fotovoltaico:")
    campaign_rn = find_campaign_resource_name(customer_id, NEW_CAMPAIGN_NAME) if not dry_run else ""
    if not dry_run and not campaign_rn:
        print(f"    [WARN] Campagna '{NEW_CAMPAIGN_NAME}' non trovata — skip step 5.")
        print("           Crea la campagna manualmente in Google Ads, poi riesegui.")
    else:
        for ag_def in FOTOVOLTAICO_AD_GROUPS:
            ag_name = ag_def["name"]
            print(f"\n    Ad Group: {ag_name}")
            print(f"      Keyword ({len(ag_def['keywords'])}): {', '.join(k for k, _ in ag_def['keywords'])}")
            print(f"      RSA: {len(ag_def['headlines'])} titoli, {len(ag_def['descriptions'])} descrizioni")
            print(f"      URL: {LANDING_URL}")
            if not dry_run:
                try:
                    ag_result = create_ad_group(customer_id, campaign_rn, ag_name)
                    ag_rn = ag_result["ad_group_resource_name"]
                    print(f"      ✓ Ad group creato: {ag_rn}")
                    for kw_text, match_type in ag_def["keywords"]:
                        kw_result = add_positive_keyword(customer_id, ag_rn, kw_text, match_type)
                        print(f"        ✓ KW: \"{kw_text}\" [{match_type}]")
                    rsa_result = create_rsa(
                        customer_id, ag_rn, LANDING_URL,
                        ag_def["headlines"], ag_def["descriptions"],
                    )
                    print(f"      ✓ RSA creato: {rsa_result['resource_name']}")
                except Exception as e:
                    print(f"      ✗ Errore: {e}")

    print("\n" + ("=" * 60))
    if dry_run:
        print("[DRY-RUN] Nessuna modifica applicata. Riesegui senza --dry-run per applicare.")
    else:
        print("Ristrutturazione completata.")
        print("\nProssimi step:")
        print("  1. Verificare la campagna fotovoltaico in Google Ads UI")
        print("  2. Attivare la campagna quando pronta (ora è PAUSED)")
        print("  3. Eseguire: python main.py --weekly  (search term analysis)")


def main():
    parser = argparse.ArgumentParser(description="Ristrutturazione campagne Google Ads")
    parser.add_argument("--dry-run", action="store_true", help="Mostra le modifiche senza applicarle")
    args = parser.parse_args()

    config = load_config()
    customer_id = config["google_ads"]["customer_id"]

    run(dry_run=args.dry_run, customer_id=customer_id)


if __name__ == "__main__":
    main()
