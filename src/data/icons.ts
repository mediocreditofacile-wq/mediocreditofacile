// Mapping concetti MCF → icone Lucide.
// Le icone arrivano dal pacchetto lucide-static come SVG raw, inline.
// Per aggiungere una nuova icona: importa l'SVG, mappala con uno slug MCF, esportala.
// Per supportare un nome Material legacy: aggiungilo a `materialAliases`.

// === Icone "settori e prodotti" (set originale) ===
import badgeCheck from 'lucide-static/icons/badge-check.svg?raw';
import barChart3 from 'lucide-static/icons/bar-chart-3.svg?raw';
import chefHat from 'lucide-static/icons/chef-hat.svg?raw';
import gift from 'lucide-static/icons/gift.svg?raw';
import hardHat from 'lucide-static/icons/hard-hat.svg?raw';
import headphones from 'lucide-static/icons/headphones.svg?raw';
import hourglass from 'lucide-static/icons/hourglass.svg?raw';
import landmark from 'lucide-static/icons/landmark.svg?raw';
import leaf from 'lucide-static/icons/leaf.svg?raw';
import monitor from 'lucide-static/icons/monitor.svg?raw';
import network from 'lucide-static/icons/network.svg?raw';
import package2 from 'lucide-static/icons/package-2.svg?raw';
import percent from 'lucide-static/icons/percent.svg?raw';
import pill from 'lucide-static/icons/pill.svg?raw';
import receipt from 'lucide-static/icons/receipt.svg?raw';
import repeat2 from 'lucide-static/icons/repeat-2.svg?raw';
import scale from 'lucide-static/icons/scale.svg?raw';
import searchCheck from 'lucide-static/icons/search-check.svg?raw';
import shieldCheck from 'lucide-static/icons/shield-check.svg?raw';
import sun from 'lucide-static/icons/sun.svg?raw';
import timer from 'lucide-static/icons/timer.svg?raw';
import truck from 'lucide-static/icons/truck.svg?raw';
import wheat from 'lucide-static/icons/wheat.svg?raw';
import wrench from 'lucide-static/icons/wrench.svg?raw';

// === Icone atomiche (UI ricorrenti) ===
import airVent from 'lucide-static/icons/air-vent.svg?raw';
import alertTriangle from 'lucide-static/icons/triangle-alert.svg?raw';
import arrowDown from 'lucide-static/icons/arrow-down.svg?raw';
import arrowDownCircle from 'lucide-static/icons/arrow-down-circle.svg?raw';
import arrowRight from 'lucide-static/icons/arrow-right.svg?raw';
import arrowRightLeft from 'lucide-static/icons/arrow-right-left.svg?raw';
import arrowUp from 'lucide-static/icons/arrow-up.svg?raw';
import arrowUpDown from 'lucide-static/icons/arrow-up-down.svg?raw';
import award from 'lucide-static/icons/award.svg?raw';
import badge from 'lucide-static/icons/badge.svg?raw';
import banknote from 'lucide-static/icons/banknote.svg?raw';
import banknoteX from 'lucide-static/icons/banknote-x.svg?raw';
import bookOpen from 'lucide-static/icons/book-open.svg?raw';
import briefcase from 'lucide-static/icons/briefcase.svg?raw';
import calculator from 'lucide-static/icons/calculator.svg?raw';
import calendar from 'lucide-static/icons/calendar.svg?raw';
import calendarClock from 'lucide-static/icons/calendar-clock.svg?raw';
import calendarRange from 'lucide-static/icons/calendar-range.svg?raw';
import checkCircle2 from 'lucide-static/icons/check-circle-2.svg?raw';
import chevronDown from 'lucide-static/icons/chevron-down.svg?raw';
import chevronUp from 'lucide-static/icons/chevron-up.svg?raw';
import circlePlus from 'lucide-static/icons/circle-plus.svg?raw';
import clock from 'lucide-static/icons/clock.svg?raw';
import code from 'lucide-static/icons/code.svg?raw';
import coffee from 'lucide-static/icons/coffee.svg?raw';
import construction from 'lucide-static/icons/construction.svg?raw';
import cpu from 'lucide-static/icons/cpu.svg?raw';
import creditCard from 'lucide-static/icons/credit-card.svg?raw';
import dice1 from 'lucide-static/icons/dice-1.svg?raw';
import dice2 from 'lucide-static/icons/dice-2.svg?raw';
import dice3 from 'lucide-static/icons/dice-3.svg?raw';
import download from 'lucide-static/icons/download.svg?raw';
import ear from 'lucide-static/icons/ear.svg?raw';
import edit3 from 'lucide-static/icons/edit-3.svg?raw';
import eye from 'lucide-static/icons/eye.svg?raw';
import factory from 'lucide-static/icons/factory.svg?raw';
import fileText from 'lucide-static/icons/file-text.svg?raw';
import flame from 'lucide-static/icons/flame.svg?raw';
import flaskConical from 'lucide-static/icons/flask-conical.svg?raw';
import folder from 'lucide-static/icons/folder.svg?raw';
import gauge from 'lucide-static/icons/gauge.svg?raw';
import gavel from 'lucide-static/icons/gavel.svg?raw';
import handshake from 'lucide-static/icons/handshake.svg?raw';
import headset from 'lucide-static/icons/headset.svg?raw';
import home from 'lucide-static/icons/home.svg?raw';
import info from 'lucide-static/icons/info.svg?raw';
import infinityIcon from 'lucide-static/icons/infinity.svg?raw';
import layoutGrid from 'lucide-static/icons/layout-grid.svg?raw';
import lightbulb from 'lucide-static/icons/lightbulb.svg?raw';
import listChecks from 'lucide-static/icons/list-checks.svg?raw';
import lock from 'lucide-static/icons/lock.svg?raw';
import lockOpen from 'lucide-static/icons/lock-open.svg?raw';
import logOut from 'lucide-static/icons/log-out.svg?raw';
import mail from 'lucide-static/icons/mail.svg?raw';
import messageCircle from 'lucide-static/icons/message-circle.svg?raw';
import phone from 'lucide-static/icons/phone.svg?raw';
import refreshCw from 'lucide-static/icons/refresh-cw.svg?raw';
import rocket from 'lucide-static/icons/rocket.svg?raw';
import routeIcon from 'lucide-static/icons/route.svg?raw';
import scrollText from 'lucide-static/icons/scroll-text.svg?raw';
import send from 'lucide-static/icons/send.svg?raw';
import settings from 'lucide-static/icons/settings.svg?raw';
import shield from 'lucide-static/icons/shield.svg?raw';
import shieldPlus from 'lucide-static/icons/shield-plus.svg?raw';
import slidersHorizontal from 'lucide-static/icons/sliders-horizontal.svg?raw';
import sparkles from 'lucide-static/icons/sparkles.svg?raw';
import star from 'lucide-static/icons/star.svg?raw';
import stethoscope from 'lucide-static/icons/stethoscope.svg?raw';
import table from 'lucide-static/icons/table.svg?raw';
import trendingDown from 'lucide-static/icons/trending-down.svg?raw';
import trendingUp from 'lucide-static/icons/trending-up.svg?raw';
import user from 'lucide-static/icons/user.svg?raw';
import userCheck from 'lucide-static/icons/user-check.svg?raw';
import users from 'lucide-static/icons/users.svg?raw';
import utensils from 'lucide-static/icons/utensils.svg?raw';
import utensilsCrossed from 'lucide-static/icons/utensils-crossed.svg?raw';
import wallet from 'lucide-static/icons/wallet.svg?raw';
import piggyBank from 'lucide-static/icons/piggy-bank.svg?raw';

export interface IconEntry {
  slug: string;
  label: string;
  lucideName: string;
  svg: string;
}

// === Set principale icone MCF (mostrate nella pagina design-system) ===
export const icons: IconEntry[] = [
  { slug: 'noleggio-operativo',   label: 'Noleggio operativo',         lucideName: 'wrench',        svg: wrench },
  { slug: 'leasing-strumentale',  label: 'Leasing strumentale',        lucideName: 'package-2',     svg: package2 },
  { slug: 'finanziamenti-pmi',    label: 'Finanziamenti PMI',          lucideName: 'landmark',      svg: landmark },
  { slug: 'agevolazioni',         label: 'Agevolazioni',               lucideName: 'gift',          svg: gift },
  { slug: 'sabatini',             label: 'Nuova Sabatini',             lucideName: 'percent',       svg: percent },
  { slug: 'fondo-garanzia-mcc',   label: 'Fondo Garanzia MCC',         lucideName: 'shield-check',  svg: shieldCheck },
  { slug: 'bando-isi-inail',      label: 'Bando ISI INAIL',            lucideName: 'hard-hat',      svg: hardHat },
  { slug: 'fotovoltaico',         label: 'Fotovoltaico',               lucideName: 'sun',           svg: sun },
  { slug: 'factoring',            label: 'Factoring',                  lucideName: 'receipt',       svg: receipt },
  { slug: 'lease-back',           label: 'Lease back',                 lucideName: 'repeat-2',      svg: repeat2 },
  { slug: 'broker-indipendente',  label: 'Broker indipendente',        lucideName: 'network',       svg: network },
  { slug: 'velocita-24h',         label: 'Velocita di risposta 24h',   lucideName: 'timer',         svg: timer },
  { slug: 'trasparenza',          label: 'Trasparenza',                lucideName: 'search-check',  svg: searchCheck },
  { slug: 'delibera-48h',         label: 'Delibera 48h',               lucideName: 'badge-check',   svg: badgeCheck },
  { slug: 'consulenza',           label: 'Consulenza personale',       lucideName: 'headphones',    svg: headphones },
  { slug: 'ristorazione',         label: 'Ristorazione',               lucideName: 'chef-hat',      svg: chefHat },
  { slug: 'edilizia-mezzi',       label: 'Edilizia e mezzi',           lucideName: 'truck',         svg: truck },
  { slug: 'ict-digital',          label: 'ICT e digital signage',      lucideName: 'monitor',       svg: monitor },
  { slug: 'agriturismo',          label: 'Agriturismo',                lucideName: 'wheat',         svg: wheat },
  { slug: 'farmacia',             label: 'Farmacia',                   lucideName: 'pill',          svg: pill },
  { slug: 'centrale-rischi',      label: 'Centrale Rischi',            lucideName: 'bar-chart-3',   svg: barChart3 },
  { slug: 'patrimonio-negativo',  label: 'Patrimonio negativo',        lucideName: 'scale',         svg: scale },
  { slug: 'grace-period',         label: 'Grace period',               lucideName: 'hourglass',     svg: hourglass },
  { slug: 'transizione-5',        label: 'Transizione 5.0',            lucideName: 'leaf',          svg: leaf },
];

// === Icone atomiche (non mostrate nella demo, ma disponibili al componente Icon) ===
const atomicIcons: Record<string, string> = {
  'air-vent': airVent,
  'arrow-down': arrowDown,
  'arrow-down-circle': arrowDownCircle,
  'arrow-right': arrowRight,
  'arrow-right-left': arrowRightLeft,
  'arrow-up': arrowUp,
  'arrow-up-down': arrowUpDown,
  'award': award,
  'badge': badge,
  'banknote': banknote,
  'banknote-x': banknoteX,
  'bar-chart-3': barChart3,
  'book-open': bookOpen,
  'briefcase': briefcase,
  'calculator': calculator,
  'calendar': calendar,
  'calendar-clock': calendarClock,
  'calendar-range': calendarRange,
  'check-circle': checkCircle2,
  'chevron-down': chevronDown,
  'chevron-up': chevronUp,
  'circle-plus': circlePlus,
  'clock': clock,
  'code': code,
  'coffee': coffee,
  'construction': construction,
  'cpu': cpu,
  'credit-card': creditCard,
  'dice-1': dice1,
  'dice-2': dice2,
  'dice-3': dice3,
  'download': download,
  'ear': ear,
  'edit': edit3,
  'eye': eye,
  'factory': factory,
  'file-text': fileText,
  'flame': flame,
  'flask-conical': flaskConical,
  'folder': folder,
  'gauge': gauge,
  'gavel': gavel,
  'handshake': handshake,
  'headset': headset,
  'home': home,
  'info': info,
  'infinity': infinityIcon,
  'layout-grid': layoutGrid,
  'lightbulb': lightbulb,
  'list-checks': listChecks,
  'lock': lock,
  'lock-open': lockOpen,
  'log-out': logOut,
  'mail': mail,
  'message-circle': messageCircle,
  'phone': phone,
  'piggy-bank': piggyBank,
  'refresh-cw': refreshCw,
  'rocket': rocket,
  'route': routeIcon,
  'scroll-text': scrollText,
  'send': send,
  'settings': settings,
  'shield': shield,
  'shield-check': shieldCheck,
  'shield-plus': shieldPlus,
  'sliders-horizontal': slidersHorizontal,
  'sparkles': sparkles,
  'star': star,
  'stethoscope': stethoscope,
  'table': table,
  'trending-down': trendingDown,
  'trending-up': trendingUp,
  'triangle-alert': alertTriangle,
  'user': user,
  'user-check': userCheck,
  'users': users,
  'utensils': utensils,
  'utensils-crossed': utensilsCrossed,
  'wallet': wallet,
};

// === Alias retrocompatibili dai nomi Material Icons usati nel codice legacy ===
// Permette di passare al componente Icon il vecchio nome Material e ottenere
// l'icona Lucide piu' vicina, senza dover toccare il JSON delle landing.
export const materialAliases: Record<string, string> = {
  // Atomiche UI
  'phone': 'phone',
  'mail': 'mail',
  'expand_more': 'chevron-down',
  'expand_less': 'chevron-up',
  'arrow_forward': 'arrow-right',
  'arrow_back': 'arrow-right',
  'arrow_downward': 'arrow-down',
  'arrow_upward': 'arrow-up',
  'check_circle': 'check-circle',
  'check': 'check-circle',
  'task_alt': 'check-circle',
  'verified': 'delibera-48h',
  'add_circle_outline': 'circle-plus',
  'add': 'circle-plus',
  'info': 'info',
  'warning': 'triangle-alert',
  'error': 'triangle-alert',
  'lightbulb': 'lightbulb',
  'edit': 'edit',
  'send': 'send',
  'star': 'star',
  'rocket_launch': 'rocket',
  'savings': 'piggy-bank',
  'description': 'file-text',
  'picture_as_pdf': 'file-text',
  'chat_bubble_outline': 'message-circle',
  'chat_bubble': 'message-circle',
  'compare_arrows': 'arrow-right-left',
  'swap_horiz': 'arrow-right-left',
  'swap_vert': 'arrow-up-down',
  'health_and_safety': 'shield-plus',
  'visibility': 'eye',
  'wb_sunny': 'fotovoltaico',
  // Concetti/settori (puntano agli slug MCF)
  'account_balance': 'finanziamenti-pmi',
  'account_balance_wallet': 'wallet',
  'all_inclusive': 'infinity',
  'build': 'noleggio-operativo',
  'calculate': 'calculator',
  'card_giftcard': 'agevolazioni',
  'checklist': 'list-checks',
  'date_range': 'calendar-range',
  'eco': 'transizione-5',
  'event': 'calendar',
  'folder': 'folder',
  'handshake': 'handshake',
  'home_work': 'home',
  'hub': 'broker-indipendente',
  'lock': 'lock',
  'payments': 'banknote',
  'person': 'user',
  'receipt': 'factoring',
  'schedule': 'clock',
  'settings': 'settings',
  'shield': 'shield',
  'speed': 'gauge',
  'support_agent': 'headset',
  'trending_up': 'trending-up',
  'update': 'refresh-cw',
  'solar_power': 'fotovoltaico',
  'restaurant': 'ristorazione',
  'bolt': 'transizione-5',
  // Aggiunti durante la migrazione full-site Material -> Icon
  'analytics': 'bar-chart-3',
  'autorenew': 'refresh-cw',
  'chat': 'message-circle',
  'construction': 'construction',
  'download': 'download',
  'gavel': 'gavel',
  'groups': 'users',
  'hearing': 'ear',
  'integration_instructions': 'code',
  'lock_open': 'lock-open',
  'logout': 'log-out',
  'looks_one': 'dice-1',
  'looks_two': 'dice-2',
  'looks_3': 'dice-3',
  'medical_services': 'stethoscope',
  'memory': 'cpu',
  'money_off': 'banknote-x',
  'new_releases': 'badge',
  'precision_manufacturing': 'factory',
  'receipt_long': 'scroll-text',
  'science': 'flask-conical',
  'security': 'shield-check',
  'settings_input_component': 'sliders-horizontal',
  'south': 'arrow-down-circle',
  'table_chart': 'table',
  'trending_down': 'trending-down',
  'verified_user': 'user-check',
  'workspace_premium': 'award',
  'apps': 'layout-grid',
  'cases': 'briefcase',
  'menu_book': 'book-open',
  // Material standard aggiuntivi (categorie blog + casi studio)
  'ac_unit': 'air-vent',
  'cleaning_services': 'sparkles',
  'computer': 'ict-digital',
  'countertops': 'utensils',
  'healthcare': 'stethoscope',
  'local_cafe': 'coffee',
  'local_pharmacy': 'farmacia',
  'outdoor_grill': 'flame',
  'route': 'route',
  'soup_kitchen': 'utensils-crossed',
  // Slug semantici italiani usati nei dati delle categorie blog/casi-studio
  'automazione': 'settings',
  'burrata': 'ristorazione',
  'caseificio': 'ristorazione',
  'confronto': 'arrow-right-left',
  'cucina': 'ristorazione',
  'edilizia': 'construction',
  'energia': 'fotovoltaico',
  'farmacie': 'farmacia',
  'fiscalita': 'factoring',
  'guida': 'book-open',
  'medicali': 'stethoscope',
  'mezzi': 'edilizia-mezzi',
  'tecnologia': 'ict-digital',
  'tutti': 'layout-grid',
};

// Mappa slug → SVG, accesso rapido per il componente Icon.
// Include set principale, atomiche, e alias material risolti.
export const iconsMap: Record<string, string> = {
  ...Object.fromEntries(icons.map((i) => [i.slug, i.svg])),
  ...atomicIcons,
};

// Risolutore alias material → slug Lucide finale.
// Il componente Icon prima passa qui, poi cerca il risultato in iconsMap.
export function resolveIconName(name: string): string {
  if (iconsMap[name]) return name;
  if (materialAliases[name]) return materialAliases[name];
  return name; // ritorna nome originale; il componente Icon stamperà errore se mancante
}

export type IconSlug = string;
