#!/usr/bin/env python3
"""Scheda completa MCF — v2
   - tachimetro verde/rosso convenzionale
   - severità contestualizzata sulla scala 1-990
   - etichette in italiano
   - amministratori con nome e ruolo
   - codici IIC risolti nelle voci di bilancio (legenda ufficiale Openapi)"""
import json, html, re, math

FULL = json.load(open('/tmp/IT-full.json'))['data']
if isinstance(FULL, list): FULL = FULL[0]
ADV = json.load(open('/tmp/IT-advanced.json'))['data']
if isinstance(ADV, list): ADV = ADV[0]
CS = json.load(open('/tmp/cs.json'))['data']
NEG = json.load(open('/tmp/nd.json'))['data']
IIC = json.load(open('/tmp/iic.json'))

SCALA = ['A1','A2','A3','B1','B2','B3','C1','C2','C3']
RATING = CS.get('rating','B2'); IDX = SCALA.index(RATING) if RATING in SCALA else 4
SEV = CS.get('risk_severity') or 0
SEV_MAX = 990

# ---- traduzione valori e date -----------------------------------------------
import datetime
def data_it(v):
    """Le date arrivano come mezzanotte italiana espressa in UTC (22:00 o 23:00
       del giorno prima). Riportiamo al giorno corretto e formattiamo gg/mm/aaaa."""
    if not isinstance(v,str): return None
    m=re.match(r'^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?', v)
    if not m: return None
    a,me,g = int(m.group(1)),int(m.group(2)),int(m.group(3))
    try: d=datetime.date(a,me,g)
    except ValueError: return None
    if m.group(4) and int(m.group(4))>=22: d+=datetime.timedelta(days=1)
    return d.strftime('%d/%m/%Y')

RUOLI={'PCA':'Presidente del consiglio di amministrazione','VPA':'Vicepresidente del consiglio di amministrazione',
 'CON':'Consigliere','AU':'Amministratore unico','AD':'Amministratore delegato','SO':'Socio',
 'LR':'Legale rappresentante','SIN':'Sindaco','REV':'Revisore','PRE':'Presidente','TIT':'Titolare'}

TRAD={'Man':'Uomo','Woman':'Donna','Enable':'Attiva','Active':'Attiva',
 'Out of business (in a positive way)':'Cessata',
 'Administrative headquarter and registered office':'Sede amministrativa e legale',
 'Administrative headquarter':'Sede amministrativa','Registered office':'Sede legale',
 'Chairman of board of directors':'Presidente del consiglio di amministrazione',
 'Vice chairman board of directors':'Vicepresidente del consiglio di amministrazione',
 'Director':'Consigliere','Mutual company limited by shares':'Società cooperativa',
 'C - Manufacturing':'C - Attività manifatturiere','C - Manufacturing products':'C - Prodotti manifatturieri',
 'D - Manufacturing products':'D - Prodotti manifatturieri',
 '10 - Manufacture of food products':'10 - Industrie alimentari',
 'Manufacture of other dairy products':'Produzione di altri derivati del latte',
 'Natural & processed cheese manufacturers':'Produzione di formaggi freschi e trasformati',
 'Operation of dairies and cheese making':'Esercizio di caseifici e caseificazione',
 'Small enterprise':'Piccola impresa','Medium enterprise':'Media impresa','Large enterprise':'Grande impresa',
 'Micro enterprise':'Microimpresa',
 'Joint stock business':'Società cooperativa per azioni','Milk-based products':'Prodotti a base di latte',
 'Joint stock company':'Società per azioni','Limited liability company':'Società a responsabilità limitata',
 'Sole proprietorship':'Ditta individuale','General partnership':'Società in nome collettivo',
 'Limited partnership':'Società in accomandita semplice','Cooperative':'Società cooperativa'}
def trad(v):
    if not isinstance(v,str): return v
    return TRAD.get(v.strip(), v)

# frasi intere, poi termini: dal piu' lungo al piu' corto per non spezzare
FRASI = [
 ('PROFIT/LOSS FOR THE YEAR','Utile (perdita) di esercizio'),
 ('Total current, deferred and prepaid income tax','Totale imposte sul reddito correnti, differite e anticipate'),
 ('Difference between value and cost of production','Differenza tra valore e costi della produzione'),
 ('Income (expense) arising from the adoption of the','Proventi (oneri) da adesione al'),
 ('fiscal consolidated system/fiscal transparency','consolidato fiscale o alla trasparenza fiscale'),
 ('Revenues from sales and services','Ricavi delle vendite e delle prestazioni'),
 ('TOTAL REVENUES AND FINANCIAL CHARGES','Totale proventi e oneri finanziari'),
 ('Tax related to previous years','Imposte relative a esercizi precedenti'),
 ('severance indemnity','trattamento di fine rapporto'),
 ('employee severance','trattamento di fine rapporto di lavoro subordinato'),
 ('social security institutions','istituti di previdenza e sicurezza sociale'),
 ('social security agencies','istituti di previdenza e sicurezza sociale'),
 ('social security','previdenza sociale'),
 ('startup/expansions costs','costi di impianto e di ampliamento'),
 ('research and development','ricerca e sviluppo'),
 ('patents and intellectual property rights','diritti di brevetto industriale'),
 ('permits, licenses and similar rights','concessioni, licenze, marchi e diritti simili'),
 ('land and buildings','terreni e fabbricati'),
 ('plants and machinery','impianti e macchinario'),
 ('industrial and commercial equipment','attrezzature industriali e commerciali'),
 ('assets under construction and payments on account','immobilizzazioni in corso e acconti'),
 ('under construction','in corso di costruzione'),
 ('payments on account','acconti'),('account/advances','acconti'),
 ('raw materials','materie prime'),('semi-finished products','semilavorati'),
 ('finished products','prodotti finiti'),('work in progress','lavori in corso'),
 ('goods aimed at selling','merci destinate alla vendita'),
 ('cash and cash equivalents','disponibilità liquide'),
 ('cash equivalents','mezzi equivalenti'),
 ('bank and postal deposits','depositi bancari e postali'),
 ('cash in hand','denaro e valori in cassa'),('cheques','assegni'),
 ('net worth','patrimonio netto'),('share premium reserve','riserva sovrapprezzo azioni'),
 ('revaluation reserve','riserva di rivalutazione'),('legal reserve','riserva legale'),
 ('statutory reserve','riserva statutaria'),
 ('profit/loss carried forward','utili (perdite) portati a nuovo'),
 ('carried forward','portati a nuovo'),
 ('negative reserve for own shares in portfolio','riserva negativa per azioni proprie in portafoglio'),
 ('reserve for expected cash flow hedging operations','riserva per operazioni di copertura dei flussi finanziari attesi'),
 ('reserve for future capital increase','riserva per futuri aumenti di capitale'),
 ('reserve to cover capital reduction','riserva per copertura riduzione di capitale'),
 ('merger surplus reserve','riserva da avanzo di fusione'),
 ('foreign-exchange gains reserve','riserva da utili su cambi'),
 ('exchange gains','utili su cambi'),
 ('miscellaneous reserves','altre riserve'),
 ('convertible bonds','obbligazioni convertibili'),
 ('short term','a breve termine'),('long term','a lungo termine'),
 ('due beyond the next financial year','esigibili oltre l\'esercizio successivo'),
 ('due within the next financial year','esigibili entro l\'esercizio successivo'),
 ('the next financial year','l\'esercizio successivo'),('next financial year','esercizio successivo'),
 ('due beyond','esigibili oltre'),('due within','esigibili entro'),
 ('parent companies','imprese controllanti'),
 ('companies controlled by parent companies','imprese sottoposte al controllo delle controllanti'),
 ('controlled by parent','sottoposte al controllo delle controllanti'),
 ('affiliated companies','imprese collegate'),('controlled companies','imprese controllate'),
 ('subjected companies','imprese sottoposte a controllo'),
 ('participating interests','partecipazioni'),
 ('derivative financial instruments','strumenti finanziari derivati'),
 ('financial instruments','strumenti finanziari'),
 ('other financing providers','altri finanziatori'),('financing providers','finanziatori'),
 ('finance lenders','finanziatori'),('lenders','finanziatori'),
 ('trade payables','debiti verso fornitori'),('trade debts','debiti commerciali'),
 ('trade credits','crediti commerciali'),('trade receivables','crediti verso clienti'),
 ('tax payables','debiti tributari'),('tax credits','crediti tributari'),
 ('accruals and deferrals','ratei e risconti'),('passive deferred','risconti passivi'),
 ('active deferred','risconti attivi'),
 ('memorandum accounts','conti d\'ordine'),('guarantees pledged','garanzie prestate'),
 ('central risk pool','centrale rischi'),
 ('extraordinary income','proventi straordinari'),('extraordinary charges','oneri straordinari'),
 ('extraordinary','straordinari'),('ordinary','ordinari'),
 ('appreciation','rivalutazioni'),('adjustments','rettifiche'),
 ('operating costs','costi operativi'),('operating','operativi'),
 ('wages/salaries','salari e stipendi'),('staff costs','costi del personale'),
 ('goods and services purchase','acquisti di beni e servizi'),
 ('leased assets','beni in godimento di terzi'),
 ('own shares','azioni proprie'),('nominal value','valore nominale'),
 ('as art. civil code exceptions','deroghe ex art. 2423 codice civile'),
 ('civil code','codice civile'),('parent entity','capogruppo'),
 ('investment fund','fondo di investimento'),('pension fund','fondo pensione'),
 ('pensions','fondi pensione'),('risk provisions','fondi per rischi e oneri'),
 ('provisions','accantonamenti'),('funds','fondi'),('fund','fondo'),
 ('fixed assets','immobilizzazioni'),('tangible fixed assets','immobilizzazioni materiali'),
 ('intangible fixed assets','immobilizzazioni immateriali'),
 ('financial fixed assets','immobilizzazioni finanziarie'),
 ('current assets','attivo circolante'),('total assets','totale attivo'),
 ('total liabilities','totale passivo'),('shareholders equity','patrimonio netto'),
 ('aggregate values','valori aggregati'),('production costs','costi della produzione'),
 ('production value','valore della produzione'),('annual result','risultato di esercizio'),
 ('credits to shareholders','crediti verso soci'),('inventory','rimanenze'),
 ('goodwill','avviamento'),('equity','patrimonio'),('discounts','sconti'),
 ('loan','finanziamento'),('loans','finanziamenti'),('deposits','depositi'),
 ('suppliers','fornitori'),('customers','clienti'),('banks','banche'),
 ('bank','banca'),('credit','credito'),('credities','crediti'),
 ('investments','investimenti'),('investment','investimento'),
 ('securities','titoli'),('bonds','obbligazioni'),('convertible','convertibili'),
 ('shares','azioni'),('share','quota'),('premium','sovrapprezzo'),('premiums','sovrapprezzi'),
 ('reserves','riserve'),('reserve','riserva'),('capital','capitale'),('social','sociale'),
 ('legal','legale'),('statutory','statutaria'),('losses','perdite'),('gains','utili'),
 ('profit','utile'),('loss','perdita'),('revaluation','rivalutazione'),
 ('increases','incrementi'),('increase','incremento'),('reduction','riduzione'),
 ('merger','fusione'),('surplus','avanzo'),('exchange','cambi'),('hedging','copertura'),
 ('expected','attesi'),('flow','flusso'),('operations','operazioni'),('minimised','minimizzate'),
 ('portfolio','portafoglio'),('redeemed','rimborsate'),('miscellaneous','altre'),
 ('management','gestione'),('memorandum','ordine'),('accounts','conti'),
 ('guarantees','garanzie'),('pledged','prestate'),('welfare','assistenza'),
 ('institutions','istituti'),('agencies','enti'),('expenses','spese'),
 ('purchase','acquisto'),('services','servizi'),('leased','in godimento'),
 ('staff','personale'),('materials','materie'),('products','prodotti'),
 ('intangibles','immateriali'),('tangibles','materiali'),('intangible','immateriali'),
 ('tangible','materiali'),('construction','costruzione'),('progress','corso'),
 ('research','ricerca'),('development','sviluppo'),('patents','brevetti'),
 ('permits','concessioni'),('licenses','licenze'),('land','terreni'),
 ('buildings','fabbricati'),('plants','impianti'),('machinery','macchinario'),
 ('industrial','industriali'),('equipment','attrezzature'),('goods','merci'),
 ('cash','disponibilità liquide'),('equivalents','equivalenti'),('hand','cassa'),
 ('severance','fine rapporto'),('security','sicurezza'),('subjected','sottoposte'),
 ('controlled','controllate'),('parent','controllanti'),('associated','collegate'),
 ('derivative','derivati'),('financial','finanziari'),('finance','finanziari'),
 ('active','attivi'),('passive','passivi'),('current','correnti'),('net','netto'),
 ('worth','patrimonio'),('nominal','nominale'),('entity','entità'),('future','futuri'),
 ('cover','copertura'),('negative','negativa'),('previous','precedenti'),
 ('partners','soci'),('terms','termini'),('term','termine'),('short','breve'),('long','lungo'),
 ('variation','variazione'),('variations','variazioni'),('disp','disponibilità'),
 ('reported','riportati'),('over','oltre'),('under','in'),('their','loro'),
 ('carried','portati'),('forward','a nuovo'),('aimed','destinate'),('selling','vendita'),
 ('semi-finished','semilavorati'),('finished','finiti'),('work','lavori'),
 ('part','parte'),('central','centrale'),('pool','rischi'),('risk','rischio'),
 ('due','esigibili'),('next','successivo'),('account','conto'),('code','codice'),
 ('art','art.'),('is','è'),('at','a'),('not','non'),('as','come'),('on','su'),
 ('total','totale'),('other','altri'),('others','altre'),('owed','dovuti'),
 ('which','cui'),('year','esercizio'),('from','da'),('and','e'),('for','per'),
 ('the','il'),('taxes','imposte'),('tax','imposte'),('costs','costi'),('value','valore'),
 ('revenues','ricavi'),('charges','oneri'),('assets','attività'),('liabilities','passività'),
 ('credits','crediti'),('debts','debiti'),('receivables','crediti'),('payments','versamenti'),
 ('depreciation','ammortamenti'),('impairment','svalutazioni'),('contributions','contributi'),
 ('shareholders','soci'),('companies','imprese'),('subsidiaries','controllate'),
 ('interests','partecipazioni'),('instruments','strumenti'),('prepaid','anticipate'),
 ('deferred','differite'),('of','di'),('to','verso'),('in','in'),('by','da'),('own','proprie'),
 ('bis','bis'),('ter','ter'),('tot','totale')]
def it_voce(d):
    if not d: return d
    for en,it in FRASI:
        def rep(m, it=it):
            orig=m.group(0)
            if not it: return ''
            return it[0].upper()+it[1:] if orig[:1].isupper() else it
        d=re.sub(r'(?<![A-Za-z])'+re.escape(en)+r'(?![A-Za-z])', rep, d, flags=re.I)
    return re.sub(r'\s+',' ',d).strip()

# ---- etichette italiane dei campi -------------------------------------------
LAB = {
 'assetsAggregateValues':'Attivo — valori aggregati','liabilitiesAggregateValues':'Passivo — valori aggregati',
 'incomeStatementAggregateValues':'Conto economico — valori aggregati','annualResult':'Risultato di esercizio',
 'productionValue':'Valore della produzione','productionCosts':'Costi della produzione',
 'netWorth':'Patrimonio netto (dettaglio)','debts':'Debiti','credits':'Crediti','inventory':'Rimanenze',
 'tangibleFixedAssets':'Immobilizzazioni materiali','intangibleFixedAssets':'Immobilizzazioni immateriali',
 'financialFixedAssets':'Immobilizzazioni finanziarie','financialAssets':'Attività finanziarie',
 'cashEquivalents':'Disponibilità liquide','riskProvisions':'Fondi per rischi e oneri',
 'revenuesFinancialCharges':'Proventi e oneri finanziari','creditsToShareholders':'Crediti verso soci',
 'adjustments':'Rettifiche di valore','managers':'Amministratori','allOffices':'Sedi e unità locali',
 'affiliateCompanies':'Partecipazioni','shareHolders':'Soci',
 'ecofin':'Dati economici di sintesi','operatingResults':'Risultati operativi','profitability':'Redditività',
 'indebtedness':'Indebitamento','leverageRatios':'Indici di leva','coverageRatios':'Indici di copertura',
 'liquidityRatios':'Indici di liquidità','structureRatios':'Indici di struttura',
 'financialStatementKpi':'KPI di bilancio','financialStability':'Stabilità finanziaria',
 'financialBurden':'Oneri finanziari','financialCycle':'Ciclo finanziario','efficiency':'Efficienza',
 'employees':'Dipendenti','employeesStatistic':'Composizione del personale','foreignTrade':'Commercio estero',
 'development':'Sviluppo','marketable':'Commerciabilità','companyStatus':'Stato impresa',
 'companyDates':'Date societarie','companyDetails':'Dati societari','contacts':'Contatti','mail':'Email',
 'address':'Sede','atecoClassification':'Classificazione ATECO','internationalClassification':'Classificazione internazionale',
 'legalForm':'Forma giuridica','corporateGroups':'Gruppi societari','branches':'Unità locali',
 'webAndSocial':'Web e social','innovativeSmeAndSu':'PMI innovativa o startup','soaCertification':'Certificazione SOA',
 'artisanBusinessRegistry':'Albo imprese artigiane','rae':'Ramo di attività economica','sae':'Settore di attività economica',
 # campi
 'incorporationDate':'Data di costituzione','registrationDate':'Data di iscrizione al registro',
 'lastUpdateDate':'Ultimo aggiornamento','startDate':'Inizio attività','balanceSheetDate':'Data del bilancio',
 'activityStatus':'Stato attività','turnover':'Ricavi delle vendite','turnoverTrend':'Variazione ricavi',
 'turnoverYear':'Esercizio di riferimento','turnoverRange':'Fascia di fatturato','netWorth':'Patrimonio netto',
 'shareCapital':'Capitale sociale','totalAssets':'Totale attivo','mol':'Margine operativo lordo',
 'ebitda':'EBITDA','ebit':'EBIT','cashFlow':'Flusso di cassa','ebitdaL2Y':'EBITDA anno precedente',
 'ebitL2Y':'EBIT anno precedente','cashFlowL2Y':'Flusso di cassa anno precedente',
 'ebitVariation':'Variazione EBIT','roe':'ROE','roi':'ROI','ros':'ROS','rod':'ROD',
 'rodFinanziario':'ROD finanziario','roaMonetary':'ROA monetario',
 'incidenceOfExtraFeaturesManagement':'Incidenza gestione straordinaria',
 'capitalizationDegree':'Grado di capitalizzazione','leverage':'Leva finanziaria','debtRatio':'Rapporto di indebitamento',
 'bankDebtRatio':'Incidenza debito bancario','bankDebtTotalAssets':'Debito bancario su attivo',
 'grossFinancialDebt':'Debito finanziario lordo','grossFinancialDebtNetWorth':'Debito finanziario lordo su patrimonio',
 'netFinancialDebtEquityNetWorth':'Debito finanziario netto su patrimonio','netDebtTotalSources':'Debito netto su fonti',
 'pfnEbitda':'PFN su EBITDA','pfnNetWorth':'PFN su patrimonio netto','ebitdaMargin':'Margine EBITDA',
 'ebitdaGrossLeverage':'Leva lorda su EBITDA','ebitdaNetLeverage':'Leva netta su EBITDA','ffoNetLeverage':'Leva netta su FFO',
 'ebitdaGrossInterestCoverage':'Copertura interessi lordi con EBITDA',
 'ebitdaNetInterestCoverage':'Copertura interessi netti con EBITDA',
 'ebitGrossInterestCoverage':'Copertura interessi lordi con EBIT',
 'ebitNetInterestCoverage':'Copertura interessi netti con EBIT',
 'ffoNetInterestCoverage':'Copertura interessi netti con FFO',
 'currentRatio':'Indice di liquidità corrente','acidTest':'Indice di liquidità immediata',
 'cashShortTermBankDebt':'Cassa su debito bancario a breve','cashShortTermFinancialDebt':'Cassa su debito finanziario a breve',
 'cashTotalShortTermDebt':'Cassa su debito totale a breve','fcfShortTermFinancialDebt':'Flusso di cassa libero su debito a breve',
 'workingCapitalCoverage':'Copertura del capitale circolante','fixedAssetsCoverageRate':'Copertura delle immobilizzazioni',
 'marginStructure':'Margine di struttura','marginStructureIndex':'Indice del margine di struttura',
 'financialDebtComposition':'Composizione del debito finanziario','burdenIndex':'Indice di onerosità',
 'financialCostsOnEbitda':'Oneri finanziari su EBITDA','addedValue':'Valore aggiunto',
 'accountsReceivableDuration':'Durata media dei crediti','accountsReceivableRotation':'Rotazione dei crediti',
 'debtsToSuppliersDuration':'Durata media dei debiti fornitori','debtsTurnover':'Rotazione dei debiti',
 'inventoryRotation':'Rotazione del magazzino','totalInventoryTurnover':'Rotazione totale del magazzino',
 'stockDuration':'Giacenza media del magazzino','financialCycleDuration':'Durata del ciclo finanziario',
 'turnoverIndex':'Indice di rotazione','netWorthOnAssets':'Patrimonio netto su attivo',
 'employee':'Numero dipendenti','employeeRange':'Fascia dipendenti','employeeTrend':'Variazione dipendenti',
 'totalStaffCost':'Costo del personale','avgGrossSalary':'Retribuzione lorda media',
 'director':'Dirigenti','frameworkContract':'Quadri','whiteCollar':'Impiegati',
 'fullTimeContract':'Tempo pieno','partialTimeContract':'Tempo parziale','permanentContract':'Tempo indeterminato',
 'isExporter':'Esportatore','isImporter':'Importatore','exportPercentShare':'Quota export',
 'exportCountries':'Paesi di export','isMarketable':'Contattabile commercialmente',
 'isInnovativeSme':'PMI innovativa','isInnovativeStartUp':'Startup innovativa',
 'belongsToGroup':'Appartiene a un gruppo','hasForeignParents':'Controllanti estere',
 'hasForeignSubsidiaries':'Controllate estere','nationalParentCompany':'Capogruppo nazionale',
 'totalGroupSubsidiaries':'Società controllate','numberOfBranches':'Numero unità locali',
 'belongsToArtisanBusinessRegistry':'Iscritta albo artigiani','hasSoaCertification':'Certificazione SOA',
 'enterpriseSize':'Dimensione impresa','streetName':'Indirizzo','town':'Comune','province':'Provincia',
 'region':'Regione','zipCode':'CAP','hamlet':'Frazione','country':'Paese','telephoneNumber':'Telefono',
 'fax':'Fax','website':'Sito web','email':'Email','eCommerce':'E-commerce','hasSocial':'Presenza social',
 'taxCode':'Codice fiscale','vatCode':'Partita IVA','companyName':'Ragione sociale','cciaa':'Camera di commercio',
 'reaCode':'Numero REA','leiCode':'Codice LEI','openapiNumber':'Identificativo Openapi',
 'officeType':'Tipo di sede','detailedLegalForm':'Forma giuridica dettagliata','legalForm':'Forma giuridica',
 'code':'Codice','description':'Descrizione','ateco':'ATECO','ateco2022':'ATECO 2022',
 'secondaryAteco':'ATECO secondario','secondaryAteco2022':'ATECO 2022 secondario',
 'nace':'NACE','primarySic':'SIC primario','secondarySic':'SIC secondario','firstLevel':'Primo livello',
 'productionValue':'Valore della produzione','youtube':'YouTube','pec':'PEC','age':'Età',
 'name':'Nome','surname':'Cognome','gender':'Genere','birthDate':'Data di nascita','birthTown':'Luogo di nascita',
 'registrationDate ':'Data iscrizione','secondaryMarginStructure ':'Margine di struttura secondario',
}
def umano(k):
    if k in LAB: return LAB[k]
    k2 = k.strip()
    if k2 in LAB: return LAB[k2]
    s = re.sub(r'(?<!^)(?=[A-Z])',' ',k2).replace('_',' ')
    return s[0].upper()+s[1:]

def val(v):
    if v is None or v=='': return '<span class="vuoto">—</span>'
    if isinstance(v,bool): return 'sì' if v else 'no'
    if isinstance(v,str):
        d=data_it(v)
        if d: return d
        v=trad(v)
    if isinstance(v,(int,float)):
        if isinstance(v,float) and not float(v).is_integer():
            return f"{v:,.2f}".replace(',','§').replace('.',',').replace('§','.')
        return f"{v:,.0f}".replace(',','.')
    return html.escape(str(v))
def euro(v):
    try: return f"{float(v):,.0f}".replace(',','.')+" €"
    except Exception: return html.escape(str(v))

def barra_azione(gruppo, azioni):
    """azioni = lista di (chiave, testo, prezzo unitario)"""
    b = ''.join(f'<button type="button" class="btn {"btn-2" if i else ""}" data-gruppo="{gruppo}" '
                f'data-azione="{k}" data-prezzo="{pz}" disabled>{t}</button>'
                for i,(k,t,pz) in enumerate(azioni))
    return (f'<div class="azione" data-gruppo="{gruppo}">{b}'
            f'<span class="costo-sel" data-gruppo="{gruppo}">nessuno selezionato</span></div>')

def sezione_soci(soci):
    if not soci:
        return ('<p class="note" style="margin-top:0">Nessun socio in elenco. È il caso delle cooperative, '
                'che non hanno una compagine con quote. Su una S.r.l. qui compaiono i soci con la percentuale posseduta.</p>')
    c='<table class="sel"><thead><tr><th class="ck"></th><th>Socio</th><th class="num">Quota</th><th class="num">Eventi negativi</th></tr></thead><tbody>'
    for x in soci:
        nome = x.get('companyName') or f"{x.get('name','') or ''} {x.get('surname','') or ''}".strip().title()
        cf = str(x.get('taxCode','') or '')
        q = x.get('percentShare')
        c+=(f'<tr><td class="ck"><input type="checkbox" class="pick" data-gruppo="soci" data-cf="{html.escape(cf)}" data-nome="{html.escape(nome)}"></td>'
            f'<td><strong>{html.escape(nome)}</strong><br><span class="cf">{html.escape(cf)}</span></td>'
            f'<td class="num">{val(q)}%</td>'
            f'<td class="num esito" data-cf="{html.escape(cf)}"><span class="vuoto">non richiesto</span></td></tr>')
    c+='</tbody></table>'
    return c + barra_azione('soci',[('neg','Verifica eventi negativi',0.45)])

def piatto_dict(v):
    """I blocchi {code, description} si leggono solo per la descrizione:
       il codice interno non dice niente a chi guarda la scheda."""
    if 'description' in v and v.get('description') not in (None, ''):
        altri = {k: x for k, x in v.items() if k not in ('code', 'description')}
        s = val(v['description'])
        if altri:
            s += ' · ' + ' · '.join(f"{umano(k).lower()}: {val(x)}" for k, x in altri.items())
        return s
    resto = {k: x for k, x in v.items() if x not in (None, '')}
    if not resto: return '<span class="vuoto">—</span>'
    if list(resto) == ['code']: return val(resto['code'])
    return ' · '.join(f"{umano(k).lower()}: {val(x)}" for k, x in resto.items())

def righe(d, liv=0):
    out=[]
    for k,v in d.items():
        if isinstance(v,dict):
            if all(not isinstance(x,(dict,list)) for x in v.values()):
                out.append(f'<tr><td>{umano(k)}</td><td class="num">{piatto_dict(v)}</td></tr>')
            else:
                out.append(f'<tr class="sub"><td colspan="2">{umano(k)}</td></tr>')
                out.append(righe(v,liv+1))
        elif isinstance(v,list):
            out.append(f'<tr><td>{umano(k)}</td><td class="num">{len(v)} voci</td></tr>')
        else:
            out.append(f'<tr><td>{umano(k)}</td><td class="num">{val(v)}</td></tr>')
    return '\n'.join(out)

def tab_voci(lista):
    out=[]
    for it in lista:
        if not isinstance(it,dict): continue
        c=it.get('code',''); v=it.get('value')
        desc=it_voce(IIC.get(c,'')) or f'<span class="vuoto">codice {html.escape(str(c))} non in legenda</span>'
        out.append(f'<tr><td>{desc}</td><td class="num">{val(v)}</td></tr>')
    return '\n'.join(out)

# ---- tachimetro verde -> rosso ----------------------------------------------
COLORI = ['#0F7B34','#2E9E43','#66B72F','#A8C61C','#E3C400','#F0A000','#EE6B1F','#DC3220','#A31515']
def tachimetro(idx):
    seg=[]; n=9
    for i in range(n):
        a0=math.pi+i*math.pi/n; a1=math.pi+(i+1)*math.pi/n
        r0,r1=78,118
        x0,y0=150+r1*math.cos(a0),130+r1*math.sin(a0); x1,y1=150+r1*math.cos(a1),130+r1*math.sin(a1)
        x2,y2=150+r0*math.cos(a1),130+r0*math.sin(a1); x3,y3=150+r0*math.cos(a0),130+r0*math.sin(a0)
        op='1' if i==idx else '0.30'
        seg.append(f'<path d="M{x0:.1f},{y0:.1f} A{r1},{r1} 0 0 1 {x1:.1f},{y1:.1f} L{x2:.1f},{y2:.1f} '
                   f'A{r0},{r0} 0 0 0 {x3:.1f},{y3:.1f} Z" fill="{COLORI[i]}" opacity="{op}"/>')
        am=(a0+a1)/2
        seg.append(f'<text x="{150+136*math.cos(am):.1f}" y="{130+136*math.sin(am)+4:.1f}" text-anchor="middle" '
                   f'class="lbl {"on" if i==idx else ""}">{SCALA[i]}</text>')
    am=math.pi+(idx+0.5)*math.pi/n
    seg.append(f'<line x1="150" y1="130" x2="{150+96*math.cos(am):.1f}" y2="{130+96*math.sin(am):.1f}" '
               f'stroke="#0F1020" stroke-width="3.5" stroke-linecap="round"/>')
    seg.append('<circle cx="150" cy="130" r="7" fill="#0F1020"/>')
    seg.append('<text x="30" y="152" class="cap">rischio minimo</text>')
    seg.append('<text x="270" y="152" text-anchor="end" class="cap">rischio massimo</text>')
    return '<svg viewBox="0 0 300 160" class="gauge">'+''.join(seg)+'</svg>'

def barra_sev(v):
    pct=max(0.4,min(100,v/SEV_MAX*100))
    return (f'<div class="sev"><div class="sev-bar"><div class="sev-mark" style="left:{pct:.2f}%"></div></div>'
            f'<div class="sev-lab"><span>1 — rischio minimo</span><span>990 — rischio massimo</span></div></div>')

# ---- composizione ------------------------------------------------------------
DET = FULL.get('companyDetails') or {}
NOME = DET.get('companyName') or ADV.get('companyName') or ''
PIVA = DET.get('vatCode') or ADV.get('vatCode') or ''
eco = FULL.get('ecofin',{}) ; op = FULL.get('operatingResults',{}) ; prof = FULL.get('profitability',{})
ann = {i.get('code'):i.get('value') for i in FULL.get('annualResult',[]) if isinstance(i,dict)}
utile = ann.get('IIC179')
sede = (FULL.get('address') or {}).get('registeredOffice') or {}
forma = (FULL.get('legalForm') or {}).get('description','')
ate = (ADV.get('atecoClassification') or {}).get('ateco') or {}
dip = (FULL.get('employees') or {}).get('employee')

sezioni=[]
def sezione(t,c,n=''):
    sezioni.append(f'<div class="blocco"><div class="blocco-tit"><span>{t}</span></div>{c}'+(f'<p class="note">{n}</p>' if n else '')+'</div>')

ANAG=['companyDetails','address','contacts','mail','companyStatus','companyDates','legalForm','detailedLegalForm',
      'atecoClassification','internationalClassification','rae','sae','branches','corporateGroups','webAndSocial',
      'innovativeSmeAndSu','soaCertification','artisanBusinessRegistry','marketable','development']
c='<table><tbody>'
for k in ANAG:
    v=FULL.get(k)
    if isinstance(v,dict) and v: c+=f'<tr class="sub"><td colspan="2">{umano(k)}</td></tr>'+righe(v)
c+=f'<tr><td>PEC</td><td class="num">{val(FULL.get("pec"))}</td></tr></tbody></table>'
sezione('Anagrafica e inquadramento',c)

ECON=['ecofin','operatingResults','profitability','financialStatementKpi','indebtedness','leverageRatios',
      'coverageRatios','liquidityRatios','structureRatios','financialStability','financialBurden',
      'financialCycle','efficiency','employees','employeesStatistic','foreignTrade']
c='<table><tbody>'
for k in ECON:
    v=FULL.get(k)
    if isinstance(v,dict) and v: c+=f'<tr class="sub"><td colspan="2">{umano(k)}</td></tr>'+righe(v)
c+='</tbody></table>'
sezione('Indici e aggregati economici',c,'Calcolati da Openapi dentro la stessa chiamata: non aggiungono costo.')

mg=FULL.get('managers',[])
if mg:
    c='<table class="sel"><thead><tr><th class="ck"></th><th>Nome</th><th>Ruolo</th><th class="num">Età</th><th class="num">Nato a</th><th class="num">Eventi negativi</th></tr></thead><tbody>'
    for m in mg:
        nome=f"{m.get('name','')} {m.get('surname','')}".strip().title()
        ruoli=[]
        for r in (m.get('roles') or []):
            ro=r.get('role') or {}
            rr=RUOLI.get(ro.get('code')) or trad(ro.get('description','') or '')
            if rr: ruoli.append(rr)
        ruolo=' · '.join(ruoli) or ('Legale rappresentante' if m.get('isLegalRepresentative') else '—')
        if m.get('isLegalRepresentative'): ruolo+=' <strong>(legale rappresentante)</strong>'
        cf=str(m.get('taxCode','') or '')
        c+=(f'<tr><td class="ck"><input type="checkbox" class="pick" data-gruppo="amm" data-cf="{html.escape(cf)}" data-nome="{html.escape(nome)}"></td>'
            f'<td><strong>{html.escape(nome)}</strong><br><span class="cf">{html.escape(cf)}</span></td>'
            f'<td>{ruolo}</td><td class="num">{val(m.get("age"))}</td><td class="num">{val(m.get("birthTown"))}</td>'
            f'<td class="num esito" data-cf="{html.escape(cf)}"><span class="vuoto">non richiesto</span></td></tr>')
    c+='</tbody></table>'
    c+=barra_azione('amm',[('neg','Verifica eventi negativi',0.45),
                           ('rep','Report completo: cariche, partecipazioni, immobili',3.60)])
    sezione(f'Amministratori ({len(mg)})',c,'Da qui si prendono i dati per la fideiussione e per far girare gli eventi negativi sulla persona fisica.')

SOCI = FULL.get('shareHolders') or ADV.get('shareHolders') or []
sezione(f'Soci ({len(SOCI)})', sezione_soci(SOCI),
        'Elenco con le quote da <em>IT-shareholders</em>: 30 chiamate al mese gratuite. '
        'Se il socio è una società, la verifica parte sulla sua partita IVA; se è una persona, sul codice fiscale.')

COD=['assetsAggregateValues','liabilitiesAggregateValues','incomeStatementAggregateValues','annualResult',
     'productionValue','productionCosts','netWorth','debts','credits','inventory','tangibleFixedAssets',
     'intangibleFixedAssets','financialFixedAssets','financialAssets','cashEquivalents','riskProvisions',
     'revenuesFinancialCharges','creditsToShareholders','adjustments']
c=''; tot=0; noleg=0
for k in COD:
    v=FULL.get(k)
    if isinstance(v,list) and v:
        tot+=len(v); noleg+=sum(1 for i in v if isinstance(i,dict) and i.get('code') not in IIC)
        c+=f'<h4>{umano(k)} <span class="n">{len(v)} voci</span></h4><table class="voci"><tbody>'+tab_voci(v)+'</tbody></table>'
sezione('Bilancio riclassificato',c,
        f'{tot} voci, risolte con la legenda ufficiale Openapi (275 codici). '
        + (f'{noleg} non hanno corrispondenza in legenda e restano segnalate.' if noleg else 'Tutte trovate.'))

SCRIPT = r"""<script>
// Ogni bottone porta il proprio prezzo unitario: 0,45 € la verifica negativita',
// 3,60 € il report persona completo. Il totale si aggiorna sulla selezione.
function aggiorna(gruppo){
  const n = document.querySelectorAll('.pick[data-gruppo="'+gruppo+'"]:checked').length;
  const lab = document.querySelector('.costo-sel[data-gruppo="'+gruppo+'"]');
  const btns = document.querySelectorAll('.btn[data-gruppo="'+gruppo+'"]');
  btns.forEach(b => b.disabled = n === 0);
  if(!n){ lab.textContent = 'nessuno selezionato'; return; }
  const costi = [...btns].map(b => (n*parseFloat(b.dataset.prezzo)).toFixed(2).replace('.',',')+' €');
  lab.textContent = n + (n===1?' selezionato · ':' selezionati · ') + costi.join(' oppure ') + ' + IVA';
}
document.querySelectorAll('.pick').forEach(c => c.addEventListener('change', () => aggiorna(c.dataset.gruppo)));
document.querySelectorAll('.btn[data-gruppo]').forEach(b => b.addEventListener('click', () => {
  const g = b.dataset.gruppo;
  const testo = b.dataset.azione === 'rep' ? 'report in preparazione…' : 'richiesta inviata…';
  document.querySelectorAll('.pick[data-gruppo="'+g+'"]:checked').forEach(c => {
    const td = document.querySelector('td.esito[data-cf="'+c.dataset.cf+'"]');
    if(td) td.innerHTML = '<span class="attesa">'+testo+'</span>';
  });
  document.querySelectorAll('.btn[data-gruppo="'+g+'"]').forEach(x => x.disabled = true);
  document.querySelector('.costo-sel[data-gruppo="'+g+'"]').textContent =
    'anteprima: nello strumento parte la chiamata e l\'esito compare qui appena pronto';
}));
</script>"""

HTML=f"""<!DOCTYPE html>
<html lang="it"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Scheda completa — {html.escape(NOME)}</title>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
:root{{--mcf-primary:#FE6F3A;--mcf-accent:#664CCD;--mcf-platinum:#E1DEE3;--mcf-black:#0F1020;--mcf-charcoal:#444451;--mcf-taupe:#787782}}
*,*::before,*::after{{box-sizing:border-box;margin:0;padding:0}}
body{{font-family:'Manrope',system-ui,sans-serif;color:var(--mcf-charcoal);background:#fff;line-height:1.6;-webkit-font-smoothing:antialiased}}
.container{{max-width:1200px;margin:0 auto;padding:0 24px}}
header.doc{{padding:64px 0 32px}}
.eyebrow{{font-size:.75rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--mcf-accent);margin-bottom:12px}}
h1{{font-size:2rem;font-weight:800;line-height:1.15;letter-spacing:-.02em;color:var(--mcf-primary)}}
h4{{font-size:.9375rem;font-weight:600;color:var(--mcf-black);margin:28px 0 8px}}
h4 .n{{font-weight:400;color:var(--mcf-taupe);font-size:.8125rem}}
p{{margin-bottom:16px}}.note{{font-size:.875rem;color:var(--mcf-taupe);margin-top:12px}}
.vuoto{{color:var(--mcf-taupe)}}.cf{{font-family:ui-monospace,monospace;font-size:.75rem;color:var(--mcf-taupe)}}
.scheda{{border:1px solid var(--mcf-platinum);border-radius:16px;overflow:hidden;margin:24px 0}}
.scheda-head{{padding:24px;border-bottom:1px solid var(--mcf-platinum)}}
.scheda-rs{{font-size:1.5rem;font-weight:700;color:var(--mcf-black);letter-spacing:-.01em}}
.scheda-meta{{font-size:.875rem;color:var(--mcf-taupe);margin-top:8px}}
.scheda-body{{padding:24px}}
.blocco{{padding:24px 0;border-top:1px solid var(--mcf-platinum)}}.blocco:first-child{{border-top:none;padding-top:0}}
.blocco-tit{{font-size:.75rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--mcf-accent);margin-bottom:16px}}
table{{width:100%;border-collapse:collapse;font-size:.9375rem}}
thead th{{background:var(--mcf-primary);color:#fff;font-weight:600;font-size:.75rem;text-transform:uppercase;letter-spacing:.06em;text-align:left;padding:12px 16px}}
th.num,td.num{{text-align:right;font-variant-numeric:tabular-nums}}
tbody td{{padding:10px 16px;border-bottom:1px solid var(--mcf-platinum);vertical-align:top}}
tbody tr:nth-child(even) td{{background:var(--mcf-platinum)}}
tr.sub td{{background:#fff!important;font-weight:600;color:var(--mcf-black);padding-top:22px;border-bottom:1.5px solid var(--mcf-accent)}}
table.voci td{{padding:7px 16px}}
.testa{{display:grid;grid-template-columns:340px 1fr;gap:32px;align-items:center}}
@media(max-width:760px){{.testa{{grid-template-columns:1fr}}}}
.gauge{{width:100%;max-width:340px;display:block}}
.gauge .lbl{{font:600 11px Manrope,sans-serif;fill:var(--mcf-taupe)}}
.gauge .lbl.on{{fill:var(--mcf-black);font-size:13.5px}}
.gauge .cap{{font:500 9.5px Manrope,sans-serif;fill:var(--mcf-taupe)}}
.rat{{font-size:3rem;font-weight:800;color:var(--mcf-black);line-height:1;font-variant-numeric:tabular-nums}}
.rat small{{font-size:1rem;font-weight:600;color:var(--mcf-taupe);display:block;margin-top:4px}}
.sev{{margin-top:18px;max-width:460px}}
.sev-bar{{position:relative;height:9px;border-radius:999px;background:linear-gradient(90deg,#0F7B34,#A8C61C,#E3C400,#EE6B1F,#A31515)}}
.sev-mark{{position:absolute;top:-5px;width:3px;height:19px;background:#0F1020;border-radius:2px;transform:translateX(-50%)}}
.sev-lab{{display:flex;justify-content:space-between;font-size:.75rem;color:var(--mcf-taupe);margin-top:6px}}
.tre{{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:24px}}
.tre .voce{{border:1.5px solid var(--mcf-primary);border-radius:10px;padding:16px 24px}}
.tre .etichetta{{font-size:.8125rem;color:var(--mcf-taupe)}}
.tre .cifra{{font-size:1.75rem;font-weight:800;color:var(--mcf-black);font-variant-numeric:tabular-nums;line-height:1.2;margin:8px 0}}
.tre .delta{{font-size:.8125rem;font-weight:600;color:var(--mcf-accent)}}
.riga{{display:flex;gap:32px;flex-wrap:wrap;margin-top:20px}}
.riga div span{{display:block;font-size:.8125rem;color:var(--mcf-taupe)}}
.riga div strong{{font-size:1.125rem;color:var(--mcf-black);font-variant-numeric:tabular-nums}}

table.sel td.ck,table.sel th.ck{{width:34px;padding-left:16px}}
table.sel input[type=checkbox]{{width:16px;height:16px;accent-color:var(--mcf-primary);cursor:pointer}}
td.esito{{font-size:.875rem}}
.azione{{display:flex;align-items:center;gap:16px;margin-top:16px;flex-wrap:wrap}}
.btn{{font-family:inherit;font-size:.9375rem;font-weight:600;color:#fff;background:var(--mcf-primary);
border:none;border-radius:10px;padding:12px 24px;cursor:pointer}}
.btn:disabled{{background:var(--mcf-platinum);color:var(--mcf-taupe);cursor:not-allowed}}
.btn-2{{background:transparent;color:var(--mcf-primary);border:1.5px solid var(--mcf-primary)}}
.btn-2:disabled{{background:transparent;border-color:var(--mcf-platinum);color:var(--mcf-taupe)}}
.costo-sel{{font-size:.875rem;color:var(--mcf-taupe)}}
.attesa{{color:var(--mcf-accent);font-weight:600}}
footer.doc{{border-top:2px solid var(--mcf-accent);margin-top:64px;padding:24px 0 48px}}
footer.doc p{{font-size:.875rem;color:var(--mcf-taupe);margin-bottom:8px}}
</style></head><body><div class="container">
<header class="doc">
<div class="eyebrow">Anteprima scheda interna · dati reali · 7 agosto 2026</div>
<h1>Scheda completa</h1>
<p style="max-width:68ch;font-size:1.125rem;font-weight:500">Tutti i campi arrivati con la chiamata, con le voci di bilancio risolte dalla legenda ufficiale.</p>
</header>
<div class="scheda">
<div class="scheda-head">
  <div class="scheda-rs">{html.escape(NOME)}</div>
  <div class="scheda-meta">P.IVA {html.escape(str(PIVA))} · {html.escape(str(forma))} · attiva dal {html.escape(data_it(str(ADV.get('startDate','') or '')) or '—')}<br>
  {html.escape(str(sede.get('streetName','')))} — {html.escape(str(sede.get('town','')))} · ATECO {html.escape(str(ate.get('code','')))} {html.escape(str(ate.get('description','')))}</div>
</div>
<div class="scheda-body">
<div class="blocco">
  <div class="blocco-tit"><span>Posizionamento del rating</span></div>
  <div class="testa">
    <div>{tachimetro(IDX)}</div>
    <div>
      <div class="rat">{RATING}<small>{html.escape(str(CS.get('risk_score_description','')))} · classe {IDX+1} di 9</small></div>
      <div class="riga">
        <div><span>Risk score</span><strong>{html.escape(str(CS.get('risk_score','')))}</strong></div>
        <div><span>Severità</span><strong>{val(SEV)} su 990</strong></div>
        <div><span>Linea di credito consigliata</span><strong>{euro(CS.get('operational_credit_limit'))}</strong></div>
      </div>
      {barra_sev(SEV)}
      <p class="note">Punteggio Openapi, non è il CGS Cerved. Il CGS si inserisce a mano quando la pratica è confermata.</p>
    </div>
  </div>
</div>
<div class="blocco">
  <div class="blocco-tit"><span>Riassunto</span></div>
  <div class="tre">
    <div class="voce"><div class="etichetta">Ricavi delle vendite</div><div class="cifra">{euro(eco.get('turnover'))}</div><div class="delta">{val(eco.get('turnoverTrend'))}% sull'anno prima · esercizio {val(eco.get('turnoverYear'))}</div></div>
    <div class="voce"><div class="etichetta">Utile d'esercizio</div><div class="cifra">{euro(utile)}</div><div class="delta">voce 21 del conto economico</div></div>
    <div class="voce"><div class="etichetta">Patrimonio netto</div><div class="cifra">{euro(eco.get('netWorth'))}</div><div class="delta">capitale sociale {euro(eco.get('shareCapital'))}</div></div>
  </div>
  <div class="riga">
    <div><span>EBITDA</span><strong>{euro(op.get('ebitda'))}</strong></div>
    <div><span>EBIT</span><strong>{euro(op.get('ebit'))}</strong></div>
    <div><span>Flusso di cassa</span><strong>{euro(op.get('cashFlow'))}</strong></div>
    <div><span>ROE</span><strong>{val(prof.get('roe'))}</strong></div>
    <div><span>ROI</span><strong>{val(prof.get('roi'))}</strong></div>
    <div><span>Dipendenti</span><strong>{val(dip)}</strong></div>
  </div>
</div>
<div class="blocco">
  <div class="blocco-tit"><span>Eventi negativi</span></div>
  <table><tbody>
   <tr><td>Protesti</td><td class="num">{'presenti' if NEG.get('presenzaProtesti') else 'nessuno'}</td></tr>
   <tr><td>Pregiudizievoli di conservatoria</td><td class="num">{'presenti' if NEG.get('presenzaPregiudizievoli') else 'nessuna'}</td></tr>
   <tr><td>Procedure concorsuali</td><td class="num">{'presenti' if NEG.get('presenzaProcedure') else 'nessuna'}</td></tr>
  </tbody></table>
</div>
{''.join(sezioni)}
</div></div>
<footer class="doc">
<p>Mediocredito Facile | mediocreditofacile.it | +39 393 995 7840 | mediocreditofacile@gmail.com</p>
<p>Collaboratore del Mediatore Affida — Iscrizione OAM M325</p>
</footer>
{SCRIPT}</div></body></html>"""
out='/Users/alberto/Desktop/_AI/output/report/2026-08-07_scheda-completa-soligo.html'
open(out,'w').write(HTML)
print("scritto:",out,"| voci bilancio:",tot,"| senza legenda:",noleg)
