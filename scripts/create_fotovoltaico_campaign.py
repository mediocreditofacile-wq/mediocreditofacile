#!/usr/bin/env python3
"""
Crea una Campagna Search "Fotovoltaico" su Google Ads con:
- 1 Ad Group: "Fotovoltaico"
- Keywords relative al fotovoltaico aziendale
- 1 Annuncio Responsive (RSA) per ciascuna landing page fotovoltaico

Uso:
    pip3 install google-ads google-auth-oauthlib
    python3 scripts/create_fotovoltaico_campaign.py

Configurazione: scripts/google-ads.yaml
"""

import sys
import os

try:
    from google.ads.googleads.client import GoogleAdsClient
    from google.ads.googleads.errors import GoogleAdsException
except ImportError:
    print("Installa la libreria:")
    print("  pip3 install google-ads")
    sys.exit(1)

# === CONFIGURAZIONE CAMPAGNA ===

CAMPAIGN_NAME = "Fotovoltaico - Noleggio Operativo"
AD_GROUP_NAME = "Fotovoltaico"
DAILY_BUDGET_EUR = 20.00  # Budget giornaliero in euro

# Landing pages fotovoltaico con i relativi angoli
LANDING_PAGES = [
    {
        "url": "https://www.mediocreditofacile.it/noleggio-fotovoltaico-zero-anticipo",
        "headlines": [
            "Fotovoltaico Zero Anticipo",
            "Impianto Senza Esborso Iniziale",
            "Fotovoltaico a Canone Mensile",
            "Risparmia in Bolletta Subito",
            "Fotovoltaico Aziendale",
            "Zero Anticipo, Canone Fisso",
            "Impianto Fotovoltaico PMI",
            "Noleggio Fotovoltaico",
            "Deducibilità 100%",
            "Manutenzione Inclusa",
            "Consulenza Gratuita",
            "Preventivo in 48 Ore",
            "Mediocredito Facile",
            "Risparmio Energetico Azienda",
            "Fotovoltaico Senza Rischi",
        ],
        "descriptions": [
            "Impianto fotovoltaico per la tua azienda con canone mensile fisso. Zero investimento iniziale.",
            "Il risparmio in bolletta copre il canone dal primo mese. Manutenzione e assicurazione incluse.",
            "Canone 100% deducibile. Nessun anticipo. Richiedi un preventivo gratuito oggi stesso.",
            "Oltre 10 società di noleggio a confronto. Troviamo le condizioni migliori per la tua azienda.",
        ],
    },
    {
        "url": "https://www.mediocreditofacile.it/noleggio-fotovoltaico-no-debito",
        "headlines": [
            "Fotovoltaico Senza Debiti",
            "Non Tocca i Tuoi Fidi",
            "Fuori Bilancio al 100%",
            "Rating Bancario Intatto",
            "Fotovoltaico Aziendale",
            "Nessuna Centrale Rischi",
            "Noleggio Operativo FV",
            "Costo Operativo, Non Debito",
            "Fotovoltaico per PMI",
            "Canone Fisso Deducibile",
            "Bilancio Pulito",
            "Consulenza Gratuita",
            "Mediocredito Facile",
            "Zero Rischio Credito",
            "Linee Credito Libere",
        ],
        "descriptions": [
            "Il noleggio operativo non è un finanziamento. Non appare in centrale rischi, non peggiora il rating.",
            "Il tuo bilancio resta pulito: il canone è un costo operativo (OPEX), non un debito.",
            "Le tue linee di credito bancarie restano libere per il tuo business. Canone fisso e certo.",
            "Confrontiamo oltre 10 società di noleggio. Troviamo la soluzione migliore per te.",
        ],
    },
    {
        "url": "https://www.mediocreditofacile.it/noleggio-fotovoltaico-canone-fisso",
        "headlines": [
            "Fotovoltaico Canone Fisso",
            "Zero Costi Nascosti",
            "Tutto Incluso nel Canone",
            "Manutenzione Inclusa",
            "Fotovoltaico Aziendale",
            "Assicurazione Inclusa",
            "Canone Prevedibile",
            "Da 24 a 60 Mesi",
            "Fotovoltaico PMI",
            "Niente Sorprese",
            "Consulenza Gratuita",
            "Preventivo in 48 Ore",
            "Mediocredito Facile",
            "Costo Certo Ogni Mese",
            "Deducibilità Totale",
        ],
        "descriptions": [
            "Basta costi nascosti. Canone mensile fisso con manutenzione, assicurazione e assistenza incluse.",
            "Contratto da 24 a 60 mesi. A scadenza scegli: riscatto, rinnovo o restituzione.",
            "Niente spese impreviste per inverter o componenti. Il canone copre tutto. 100% deducibile.",
            "Confronta le offerte di oltre 10 società. Richiedi una consulenza gratuita.",
        ],
    },
    {
        "url": "https://www.mediocreditofacile.it/noleggio-fotovoltaico-senza-burocrazia",
        "headlines": [
            "Fotovoltaico Senza Burocrazia",
            "Nessuna Pratica GSE",
            "Canone Fisso Garantito",
            "Compatibile Transizione 5.0",
            "Fotovoltaico Aziendale",
            "Zero Rischio Incentivi",
            "Tutto Gestito da Noi",
            "Un Unico Interlocutore",
            "Fotovoltaico per PMI",
            "Niente Sanzioni GSE",
            "Consulenza Gratuita",
            "Attivazione Veloce",
            "Mediocredito Facile",
            "Dalla Valutazione al Via",
            "Team Agevolazioni Dedicato",
        ],
        "descriptions": [
            "Il 50% degli impianti perde incentivi per errori. Col noleggio operativo il costo è fisso.",
            "Dalla valutazione alla delibera, dalla documentazione all'attivazione. Un unico interlocutore.",
            "Canone fisso indipendente da bandi e incentivi. Compatibile con Transizione 5.0.",
            "Il nostro team agevolazioni ti segue in ogni passaggio. Richiedi consulenza gratuita.",
        ],
    },
    {
        "url": "https://www.mediocreditofacile.it/noleggio-fotovoltaico-breve-termine",
        "headlines": [
            "Fotovoltaico 24-60 Mesi",
            "Non 20 Anni di Vincolo",
            "Durata Flessibile",
            "Riscatto o Restituzione",
            "Fotovoltaico Aziendale",
            "Contratto Breve Termine",
            "Tecnologia Aggiornata",
            "Niente Vincoli Ventennali",
            "Fotovoltaico per PMI",
            "3 Opzioni a Scadenza",
            "Consulenza Gratuita",
            "Preventivo in 48 Ore",
            "Mediocredito Facile",
            "Meglio del PPA",
            "Meglio del Leasing 20 Anni",
        ],
        "descriptions": [
            "PPA e leasing ti vincolano per 10-20 anni. Il noleggio operativo dura da 24 a 60 mesi.",
            "A fine contratto scegli: riscatta, rinnova con tecnologia aggiornata, o restituisci senza costi.",
            "Contratti brevi per aggiornare l'impianto quando escono pannelli più efficienti.",
            "Confrontiamo oltre 10 società di noleggio. Richiedi informazioni gratuite.",
        ],
    },
    {
        "url": "https://www.mediocreditofacile.it/noleggio-fotovoltaico-tetto-affitto",
        "headlines": [
            "Fotovoltaico Tetto in Affitto",
            "Capannone Non Tuo? Si Può",
            "Impianto Senza Proprietà",
            "Serve Solo un Accordo",
            "Fotovoltaico Aziendale",
            "Ti Aiutiamo con la Pratica",
            "Documentazione Gestita",
            "Contratto Trasferibile",
            "Fotovoltaico per PMI",
            "Nessun Vincolo sul Tetto",
            "Consulenza Gratuita",
            "Verifica Fattibilità Gratis",
            "Mediocredito Facile",
            "Diritto di Superficie",
            "Cambio Sede? Nessun Problema",
        ],
        "descriptions": [
            "Il tetto non è tuo? L'impianto resta della società di noleggio. Serve solo un accordo.",
            "Ti aiutiamo con l'accordo col proprietario e il diritto di superficie. Zero complicazioni.",
            "Se cambi sede, il contratto può essere gestito e trasferito. Nessun rischio.",
            "Verifica gratuitamente la fattibilità per il tuo capannone in affitto.",
        ],
    },
]

# Keywords per il gruppo Fotovoltaico
KEYWORDS = [
    # Broad match (senza modificatore = broad match)
    ("noleggio fotovoltaico aziendale", "BROAD"),
    ("fotovoltaico noleggio operativo", "BROAD"),
    ("fotovoltaico aziendale senza anticipo", "BROAD"),
    ("impianto fotovoltaico noleggio", "BROAD"),
    ("fotovoltaico pmi canone", "BROAD"),
    ("fotovoltaico azienda canone mensile", "BROAD"),
    ("fotovoltaico capannone", "BROAD"),
    ("pannelli solari noleggio azienda", "BROAD"),
    ("fotovoltaico senza debiti azienda", "BROAD"),
    ("noleggio pannelli fotovoltaici", "BROAD"),
    # Phrase match
    ('"noleggio fotovoltaico"', "PHRASE"),
    ('"fotovoltaico aziendale"', "PHRASE"),
    ('"fotovoltaico canone fisso"', "PHRASE"),
    ('"fotovoltaico senza anticipo"', "PHRASE"),
    ('"noleggio operativo fotovoltaico"', "PHRASE"),
    ('"fotovoltaico per aziende"', "PHRASE"),
    # Exact match
    ("[noleggio fotovoltaico]", "EXACT"),
    ("[fotovoltaico aziendale noleggio]", "EXACT"),
    ("[noleggio operativo fotovoltaico]", "EXACT"),
    ("[fotovoltaico aziendale senza anticipo]", "EXACT"),
]

# Keyword negative per il gruppo
NEGATIVE_KEYWORDS = [
    "residenziale",
    "casa",
    "domestico",
    "privato",
    "fai da te",
    "usato",
    "gratis",
    "incentivi statali",
    "conto energia",
    "superbonus",
    "110",
    "ecobonus",
    "detrazione",
]


def main():
    config_path = os.path.join(os.path.dirname(__file__), "google-ads.yaml")

    if not os.path.exists(config_path):
        print(f"❌ File di configurazione non trovato: {config_path}")
        print("   Copia google-ads.yaml.example e inserisci le tue credenziali.")
        sys.exit(1)

    try:
        client = GoogleAdsClient.load_from_storage(config_path, version="v18")
    except Exception as e:
        print(f"❌ Errore caricamento configurazione: {e}")
        print("   Verifica che google-ads.yaml contenga credenziali valide.")
        sys.exit(1)

    customer_id = client.login_customer_id or read_customer_id(config_path)

    print(f"Account Google Ads: {customer_id}")
    print(f"Campagna: {CAMPAIGN_NAME}")
    print(f"Gruppo annunci: {AD_GROUP_NAME}")
    print(f"Landing pages: {len(LANDING_PAGES)}")
    print(f"Keywords: {len(KEYWORDS)}")
    print()

    confirm = input("Procedere? (s/n): ").strip().lower()
    if confirm != "s":
        print("Annullato.")
        sys.exit(0)

    try:
        # 1. Crea budget
        budget_resource = create_budget(client, customer_id)
        print(f"✅ Budget creato: {DAILY_BUDGET_EUR}€/giorno")

        # 2. Crea campagna
        campaign_resource = create_campaign(client, customer_id, budget_resource)
        print(f"✅ Campagna creata: {CAMPAIGN_NAME}")

        # 3. Crea gruppo annunci
        ad_group_resource = create_ad_group(client, customer_id, campaign_resource)
        print(f"✅ Gruppo annunci creato: {AD_GROUP_NAME}")

        # 4. Aggiungi keywords
        add_keywords(client, customer_id, ad_group_resource)
        print(f"✅ {len(KEYWORDS)} keywords aggiunte")

        # 5. Aggiungi keyword negative
        add_negative_keywords(client, customer_id, campaign_resource)
        print(f"✅ {len(NEGATIVE_KEYWORDS)} keyword negative aggiunte")

        # 6. Crea annunci RSA
        for i, lp in enumerate(LANDING_PAGES):
            create_responsive_search_ad(client, customer_id, ad_group_resource, lp)
            print(f"✅ Annuncio {i+1}/{len(LANDING_PAGES)} creato → {lp['url'].split('/')[-1]}")

        print()
        print("🎉 Tutto creato con successo!")
        print(f"   Campagna: {CAMPAIGN_NAME}")
        print(f"   Gruppo: {AD_GROUP_NAME}")
        print(f"   Annunci: {len(LANDING_PAGES)} RSA")
        print(f"   Keywords: {len(KEYWORDS)} + {len(NEGATIVE_KEYWORDS)} negative")
        print()
        print("⚠  La campagna è stata creata in PAUSA.")
        print("   Attivala da Google Ads quando sei pronto.")

    except GoogleAdsException as ex:
        print(f"\n❌ Errore Google Ads API:")
        for error in ex.failure.errors:
            print(f"   {error.error_code}: {error.message}")
        sys.exit(1)


def read_customer_id(config_path):
    import yaml
    with open(config_path) as f:
        config = yaml.safe_load(f)
    return config.get("customer_id", "").replace("-", "")


def create_budget(client, customer_id):
    service = client.get_service("CampaignBudgetService")
    operation = client.get_type("CampaignBudgetOperation")
    budget = operation.create

    budget.name = f"{CAMPAIGN_NAME} - Budget"
    budget.amount_micros = int(DAILY_BUDGET_EUR * 1_000_000)
    budget.delivery_method = client.enums.BudgetDeliveryMethodEnum.STANDARD

    response = service.mutate_campaign_budgets(
        customer_id=customer_id, operations=[operation]
    )
    return response.results[0].resource_name


def create_campaign(client, customer_id, budget_resource):
    service = client.get_service("CampaignService")
    operation = client.get_type("CampaignOperation")
    campaign = operation.create

    campaign.name = CAMPAIGN_NAME
    campaign.campaign_budget = budget_resource
    campaign.advertising_channel_type = (
        client.enums.AdvertisingChannelTypeEnum.SEARCH
    )
    campaign.status = client.enums.CampaignStatusEnum.PAUSED

    # Bidding: Maximize Conversions (senza target CPA iniziale)
    campaign.maximize_conversions.target_cpa_micros = 0

    # Network settings: solo rete di ricerca
    campaign.network_settings.target_google_search = True
    campaign.network_settings.target_search_network = False
    campaign.network_settings.target_content_network = False

    # Geo targeting: Italia
    response = service.mutate_campaigns(
        customer_id=customer_id, operations=[operation]
    )
    campaign_resource = response.results[0].resource_name

    # Aggiungi geo target Italia (ID: 2380)
    add_geo_target(client, customer_id, campaign_resource, 2380)

    # Lingua italiana (ID: 1004)
    add_language_target(client, customer_id, campaign_resource, 1004)

    return campaign_resource


def add_geo_target(client, customer_id, campaign_resource, location_id):
    service = client.get_service("CampaignCriterionService")
    geo_service = client.get_service("GeoTargetConstantService")
    operation = client.get_type("CampaignCriterionOperation")
    criterion = operation.create

    criterion.campaign = campaign_resource
    criterion.location.geo_target_constant = (
        geo_service.geo_target_constant_path(location_id)
    )

    service.mutate_campaign_criteria(
        customer_id=customer_id, operations=[operation]
    )


def add_language_target(client, customer_id, campaign_resource, language_id):
    service = client.get_service("CampaignCriterionService")
    operation = client.get_type("CampaignCriterionOperation")
    criterion = operation.create

    criterion.campaign = campaign_resource
    criterion.language.language_constant = (
        client.get_service("GoogleAdsService").language_constant_path(language_id)
    )

    service.mutate_campaign_criteria(
        customer_id=customer_id, operations=[operation]
    )


def create_ad_group(client, customer_id, campaign_resource):
    service = client.get_service("AdGroupService")
    operation = client.get_type("AdGroupOperation")
    ad_group = operation.create

    ad_group.name = AD_GROUP_NAME
    ad_group.campaign = campaign_resource
    ad_group.type_ = client.enums.AdGroupTypeEnum.SEARCH_STANDARD
    ad_group.status = client.enums.AdGroupStatusEnum.ENABLED

    response = service.mutate_ad_groups(
        customer_id=customer_id, operations=[operation]
    )
    return response.results[0].resource_name


def add_keywords(client, customer_id, ad_group_resource):
    service = client.get_service("AdGroupCriterionService")
    operations = []

    for keyword_text, match_type in KEYWORDS:
        operation = client.get_type("AdGroupCriterionOperation")
        criterion = operation.create
        criterion.ad_group = ad_group_resource
        criterion.status = client.enums.AdGroupCriterionStatusEnum.ENABLED

        # Pulisci il testo dalle virgolette/parentesi (il match type è impostato via enum)
        clean_text = keyword_text.strip('"[]')
        criterion.keyword.text = clean_text

        if match_type == "EXACT":
            criterion.keyword.match_type = client.enums.KeywordMatchTypeEnum.EXACT
        elif match_type == "PHRASE":
            criterion.keyword.match_type = client.enums.KeywordMatchTypeEnum.PHRASE
        else:
            criterion.keyword.match_type = client.enums.KeywordMatchTypeEnum.BROAD

        operations.append(operation)

    service.mutate_ad_group_criteria(
        customer_id=customer_id, operations=operations
    )


def add_negative_keywords(client, customer_id, campaign_resource):
    service = client.get_service("CampaignCriterionService")
    operations = []

    for keyword_text in NEGATIVE_KEYWORDS:
        operation = client.get_type("CampaignCriterionOperation")
        criterion = operation.create
        criterion.campaign = campaign_resource
        criterion.negative = True
        criterion.keyword.text = keyword_text
        criterion.keyword.match_type = client.enums.KeywordMatchTypeEnum.BROAD

        operations.append(operation)

    service.mutate_campaign_criteria(
        customer_id=customer_id, operations=operations
    )


def create_responsive_search_ad(client, customer_id, ad_group_resource, landing_page):
    service = client.get_service("AdGroupAdService")
    operation = client.get_type("AdGroupAdOperation")
    ad_group_ad = operation.create

    ad_group_ad.ad_group = ad_group_resource
    ad_group_ad.status = client.enums.AdGroupAdStatusEnum.ENABLED

    ad = ad_group_ad.ad
    ad.final_urls.append(landing_page["url"])

    # Titoli (max 15, max 30 caratteri ciascuno)
    for headline_text in landing_page["headlines"][:15]:
        headline = client.get_type("AdTextAsset")
        headline.text = headline_text[:30]
        ad.responsive_search_ad.headlines.append(headline)

    # Descrizioni (max 4, max 90 caratteri ciascuna)
    for desc_text in landing_page["descriptions"][:4]:
        description = client.get_type("AdTextAsset")
        description.text = desc_text[:90]
        ad.responsive_search_ad.descriptions.append(description)

    # Path display
    ad.responsive_search_ad.path1 = "fotovoltaico"
    ad.responsive_search_ad.path2 = "noleggio"

    service.mutate_ad_group_ads(
        customer_id=customer_id, operations=[operation]
    )


if __name__ == "__main__":
    main()
