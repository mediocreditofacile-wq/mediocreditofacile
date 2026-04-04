#!/usr/bin/env python3
"""
Aggiornamento campagna "Noleggio Operativo Fotovoltaico".
  1. Aggiorna la final URL di tutti gli ad group → simulatore fotovoltaico
  2. Aggiunge il 7° ad group "FV – Simulatore Calcolo" (keyword transazionali)
  3. Corregge le durate nei copy: da "60 mesi" a "84 mesi"

Uso:
  python update_fotovoltaico.py --dry-run   # mostra cosa verrebbe fatto
  python update_fotovoltaico.py             # applica le modifiche
"""
import argparse
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()
sys.path.insert(0, str(Path(__file__).parent))

# Landing corretta: simulatore fotovoltaico (non la pagina generica noleggio)
LANDING_URL = "https://www.mediocreditofacile.it/tools/simulatore-noleggio-fotovoltaico"
CAMPAIGN_NAME = "Noleggio Operativo Fotovoltaico"

# Nuovo ad group: Simulatore / Calcolo Rata (keyword piu transazionali)
NUOVO_AD_GROUP = {
    "name": "FV – Simulatore Calcolo",
    "keywords": [
        ("simulatore noleggio fotovoltaico", "PHRASE"),
        ("simulatore noleggio operativo fotovoltaico", "PHRASE"),
        ("calcolo rata noleggio fotovoltaico", "PHRASE"),
        ("calcolo canone noleggio fotovoltaico", "PHRASE"),
        ("preventivo noleggio fotovoltaico", "PHRASE"),
        ("simulatore rata fotovoltaico", "EXACT"),
    ],
    "headlines": [
        "Simulatore Noleggio FV",
        "Calcola la Rata in 30 Sec",
        "Confronta Rata e Bolletta",
        "Preventivo PDF Immediato",
        "Simulatore Online Gratis",
        "Calcola il Canone Mensile",
        "Rata vs Bolletta: Confronta",
        "Scarica il Preventivo PDF",
        "10+ Società a Confronto",
        "Zero Anticipo, Fino a 84 Mesi",
        "Canone Fisso 100% Deducibile",
        "Assicurazione All-Risk",
        "Nessun Debito in Bilancio",
        "Risparmio dal 1° Mese",
        "Noleggio FV per Aziende",
    ],
    "descriptions": [
        "Calcola la rata del noleggio fotovoltaico e confrontala con la bolletta. Gratis.",
        "Inserisci costo e potenza, scarica il preventivo PDF personalizzato.",
        "Da 24 a 84 mesi, 100% deducibile. Non appare in bilancio né in Centrale Rischi.",
        "Confrontiamo 10+ società di locazione per la rata migliore. Risposta in 24 ore.",
    ],
}


def load_config():
    import yaml
    with open("config.yaml") as f:
        return yaml.safe_load(f)


def find_campaign_resource_name(customer_id, campaign_name, yaml_path="google-ads.yaml"):
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


def find_existing_ad_groups(customer_id, campaign_rn, yaml_path="google-ads.yaml"):
    """Restituisce la lista degli ad group nella campagna."""
    from google.ads.googleads.client import GoogleAdsClient
    client = GoogleAdsClient.load_from_storage(yaml_path)
    service = client.get_service("GoogleAdsService")
    query = """
SELECT ad_group.resource_name, ad_group.name
FROM ad_group
WHERE campaign.resource_name = '%s'
  AND ad_group.status != 'REMOVED'
""" % campaign_rn
    results = []
    for row in service.search(customer_id=customer_id, query=query):
        results.append({
            "resource_name": row.ad_group.resource_name,
            "name": row.ad_group.name,
        })
    return results


def find_ads_in_ad_group(customer_id, ad_group_rn, yaml_path="google-ads.yaml"):
    """Restituisce gli ad attivi in un ad group."""
    from google.ads.googleads.client import GoogleAdsClient
    client = GoogleAdsClient.load_from_storage(yaml_path)
    service = client.get_service("GoogleAdsService")
    query = """
SELECT ad_group_ad.resource_name, ad_group_ad.ad.final_urls
FROM ad_group_ad
WHERE ad_group.resource_name = '%s'
  AND ad_group_ad.status != 'REMOVED'
""" % ad_group_rn
    results = []
    for row in service.search(customer_id=customer_id, query=query):
        urls = list(row.ad_group_ad.ad.final_urls)
        results.append({
            "resource_name": row.ad_group_ad.resource_name,
            "final_urls": urls,
        })
    return results


def update_ad_final_url(customer_id, ad_resource_name, new_url, yaml_path="google-ads.yaml"):
    """Aggiorna la final URL di un ad."""
    from google.ads.googleads.client import GoogleAdsClient
    from google.protobuf import field_mask_pb2
    client = GoogleAdsClient.load_from_storage(yaml_path)

    operation = client.get_type("AdGroupAdOperation")
    ad_group_ad = operation.update
    ad_group_ad.resource_name = ad_resource_name
    ad_group_ad.ad.final_urls.append(new_url)

    operation.update_mask.CopyFrom(
        field_mask_pb2.FieldMask(paths=["ad.final_urls"])
    )

    response = client.get_service("AdGroupAdService").mutate_ad_group_ads(
        customer_id=customer_id,
        operations=[operation],
    )
    return {"resource_name": response.results[0].resource_name}


def run(dry_run, customer_id):
    from writer.google_ads import create_ad_group, add_positive_keyword, create_rsa

    print(f"\n{'[DRY-RUN] ' if dry_run else ''}Aggiornamento campagna fotovoltaico")
    print("=" * 60)

    # --- 1. Trova la campagna ---
    print(f"\n[1] Cerco campagna '{CAMPAIGN_NAME}'...")
    if not dry_run:
        campaign_rn = find_campaign_resource_name(customer_id, CAMPAIGN_NAME)
        if not campaign_rn:
            print(f"    Campagna '{CAMPAIGN_NAME}' non trovata. Eseguire prima apply_restructuring.py.")
            return
        print(f"    Trovata: {campaign_rn}")
    else:
        campaign_rn = "(dry-run)"
        print(f"    (dry-run — skip lookup)")

    # --- 2. Lista ad group esistenti ---
    print(f"\n[2] Ad group esistenti:")
    if not dry_run:
        ad_groups = find_existing_ad_groups(customer_id, campaign_rn)
        for ag in ad_groups:
            print(f"    • {ag['name']}")
    else:
        ad_groups = []
        print("    (dry-run — skip lookup)")

    # --- 3. Aggiorna final URL di tutti gli ad ---
    print(f"\n[3] Aggiornamento final URL → {LANDING_URL}")
    if not dry_run:
        for ag in ad_groups:
            ads = find_ads_in_ad_group(customer_id, ag["resource_name"])
            for ad in ads:
                current_urls = ad["final_urls"]
                if current_urls and current_urls[0] == LANDING_URL:
                    print(f"    {ag['name']}: URL gia corretto — skip")
                    continue
                print(f"    {ag['name']}: {current_urls[0] if current_urls else '(vuoto)'} → {LANDING_URL}")
                try:
                    update_ad_final_url(customer_id, ad["resource_name"], LANDING_URL)
                    print(f"      ✓ Aggiornato")
                except Exception as e:
                    print(f"      ✗ Errore: {e}")
    else:
        print("    Tutti gli ad group verranno aggiornati alla nuova URL")

    # --- 4. Controlla se il 7° ad group esiste già ---
    nuovo_nome = NUOVO_AD_GROUP["name"]
    esiste = any(ag["name"] == nuovo_nome for ag in ad_groups)

    if esiste:
        print(f"\n[4] Ad group '{nuovo_nome}' esiste gia — skip creazione")
    else:
        print(f"\n[4] Creazione nuovo ad group: {nuovo_nome}")
        print(f"    Keyword ({len(NUOVO_AD_GROUP['keywords'])}): {', '.join(k for k, _ in NUOVO_AD_GROUP['keywords'])}")
        print(f"    RSA: {len(NUOVO_AD_GROUP['headlines'])} titoli, {len(NUOVO_AD_GROUP['descriptions'])} descrizioni")
        print(f"    URL: {LANDING_URL}")

        if not dry_run:
            try:
                ag_result = create_ad_group(customer_id, campaign_rn, nuovo_nome)
                ag_rn = ag_result["ad_group_resource_name"]
                print(f"    ✓ Ad group creato: {ag_rn}")

                for kw_text, match_type in NUOVO_AD_GROUP["keywords"]:
                    add_positive_keyword(customer_id, ag_rn, kw_text, match_type)
                    print(f"      ✓ KW: \"{kw_text}\" [{match_type}]")

                rsa_result = create_rsa(
                    customer_id, ag_rn, LANDING_URL,
                    NUOVO_AD_GROUP["headlines"], NUOVO_AD_GROUP["descriptions"],
                )
                print(f"    ✓ RSA creato: {rsa_result['resource_name']}")
            except Exception as e:
                print(f"    ✗ Errore: {e}")

    # --- Riepilogo ---
    print("\n" + ("=" * 60))
    if dry_run:
        print("[DRY-RUN] Nessuna modifica applicata. Riesegui senza --dry-run.")
    else:
        print("Aggiornamento completato.")
        print("\nProssimi step:")
        print("  1. Verificare la campagna in Google Ads UI")
        print("  2. Attivare la campagna (ora e PAUSED)")
        print("  3. Monitorare le keyword del nuovo ad group dopo 48h")


def main():
    parser = argparse.ArgumentParser(description="Aggiornamento campagna fotovoltaico")
    parser.add_argument("--dry-run", action="store_true", help="Mostra le modifiche senza applicarle")
    args = parser.parse_args()

    config = load_config()
    customer_id = config["google_ads"]["customer_id"]

    run(dry_run=args.dry_run, customer_id=customer_id)


if __name__ == "__main__":
    main()
