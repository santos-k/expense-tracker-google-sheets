/**
 * Expense Dashboard – Apps Script web app
 * Reads/writes the "Transactions" tab and serves the dashboard (Index.html).
 */
const SHEET_NAME = 'Transactions';
// 👉 STEP: after Deploy → New deployment → Web app, paste your Web app URL between the quotes and Save.
const WEB_APP_URL = 'PASTE_YOUR_WEB_APP_URL_HERE';
function dashboardUrl_() { return /^https:\/\/script\.google\.com\//.test(WEB_APP_URL) ? WEB_APP_URL : ''; }

/** Adds a "📊 Dashboard" menu to the sheet's menu bar every time the sheet is opened. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📊 Dashboard')
    .addItem('Open Expense Dashboard', 'openDashboard')
    .addToUi();
}

/** Opens the dashboard in a new browser tab (with a clickable link as a fallback if pop-ups are blocked). */
function openDashboard() {
  const DASHBOARD_URL = dashboardUrl_();
  if (!DASHBOARD_URL) { SpreadsheetApp.getUi().alert('Paste your Web app URL into WEB_APP_URL at the top of Code.gs (Extensions → Apps Script), then Save.'); return; }
  const html = HtmlService.createHtmlOutput(
    '<div style="font-family:Arial,sans-serif;padding:8px 4px;text-align:center">' +
    '<a href="' + DASHBOARD_URL + '" target="_blank" onclick="google.script.host.close()" ' +
    'style="display:inline-block;background:#4B3BD0;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none;font-weight:bold">' +
    'Open Expense Dashboard ↗</a>' +
    '<p style="color:#666;font-size:12px;margin-top:10px">Opens in a new tab</p></div>' +
    '<script>var w=window.open(' + JSON.stringify(DASHBOARD_URL) + ',"_blank");if(w){google.script.host.close();}</script>'
  ).setWidth(300).setHeight(120);
  SpreadsheetApp.getUi().showModalDialog(html, 'Expense Dashboard');
}

/** Dropdown lists for the iPhone Shortcut (GET requests), all read from the "Lists" tab.
 *  Columns are found by their header text (row 1), so they can be moved:
 *    Category | Sub-Category              one row per sub-category
 *    Payment Mode | Payment Type           type = Bank / Credit Card / Wallet / Cash
 *    Bank / Card | Bank / Card Type        type = Bank / Credit Card / Wallet
 *    Purchase Mode                         Online / Offline
 *    Platform | Platform Type              type = Online / Offline
 *    Merchant                                Merchant / Shop / Store names (new names from the Shortcut or dashboard are added automatically)
 *  Any other header becomes an extra plain list.
 *    ?action=lists                              -> everything in one call (categories, paymentModes, banksFor, purchaseModes, platformsFor, ...)
 *    ?action=categories | all | subcategories&category=X
 *    ?action=paymentmodes | purchasemodes
 *    ?action=banks[&paymentMode=X]              -> only the banks / cards that fit that payment mode
 *    ?action=platforms[&purchaseMode=X]         -> only the Online or Offline platforms
 *    ?action=merchants                         -> Merchant / Shop / Store names  */
const CATEGORY_SHEET = 'Lists';
const LISTS_SHEET = CATEGORY_SHEET;

const norm_ = s => clean_(s).toLowerCase();
/** Loose match: same text ignoring emoji/case, or one contains the other ("UPI Credit Card" ~ "Credit Card"). */
const sameKind_ = (a, b) => { a = norm_(a); b = norm_(b); return !!a && !!b && (a === b || a.indexOf(b) >= 0 || b.indexOf(a) >= 0); };
/** Finds the key in obj that best matches want: exact, then ignoring emoji/case, then loose. */
function findKey_(obj, want) {
  const ks = Object.keys(obj || {}), w = String(want || '').trim();
  if (!w) return null;
  return ks.find(k => k.trim() === w) || ks.find(k => norm_(k) === norm_(w)) || ks.find(k => sameKind_(k, w)) || null;
}

function listsData_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LISTS_SHEET);
  if (!sh || sh.getLastRow() < 2) return null;
  const v = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getDisplayValues();
  const hdr = v[0].map(norm_);
  const col = name => name ? hdr.indexOf(norm_(name)) : -1;
  const pairs = (a, b) => {             // [[value, type], ...] without blanks or duplicates
    const i = col(a), j = col(b), seen = {}, res = [];
    if (i < 0) return res;
    for (let r = 1; r < v.length; r++) {
      const s = String(v[r][i]).trim();
      if (!s || seen[s]) continue;
      seen[s] = 1;
      res.push([s, j >= 0 ? String(v[r][j]).trim() : '']);
    }
    return res;
  };
  const categories = {}, ci = col('Category'), si = col('Sub-Category');
  if (ci >= 0) for (let r = 1; r < v.length; r++) {
    const c = String(v[r][ci]).trim(), s = si >= 0 ? String(v[r][si]).trim() : '';
    if (!c) continue;
    categories[c] = categories[c] || [];
    if (s && categories[c].indexOf(s) < 0) categories[c].push(s);
  }
  const pm = pairs('Payment Mode', 'Payment Type'), bk = pairs('Bank / Card', 'Bank / Card Type');
  const pu = pairs('Purchase Mode', ''), pl = pairs('Platform', 'Platform Type');
  const banksFor = {}, platformsFor = {};
  pm.forEach(([m, t]) => banksFor[m] = bk.filter(b => sameKind_(b[1], t)).map(b => b[0]));
  pu.forEach(([m]) => platformsFor[m] = pl.filter(p => sameKind_(p[1], m)).map(p => p[0]));
  const L = {
    categories: categories,
    paymentModes: pm.map(x => x[0]), banksFor: banksFor, banks: bk.map(x => x[0]),
    purchaseModes: pu.map(x => x[0]), platformsFor: platformsFor, platforms: pl.map(x => x[0]),
    merchants: pairs('Merchant', '').map(x => x[0]),
    _bk: bk, _pl: pl
  };
  const known = ['category', 'sub-category', 'payment mode', 'payment type', 'bank / card', 'bank / card type', 'purchase mode', 'platform', 'platform type', 'merchant'];
  v[0].forEach((h, j) => {               // any extra header -> plain list
    const name = String(h).trim();
    if (!name || known.indexOf(norm_(name)) >= 0 || L[name]) return;
    L[name] = pairs(name, '').map(x => x[0]);
  });
  return L;
}

/** Adds a new merchant name to the "Merchant" column of the Lists tab, so it shows up in the dropdowns next time.
 *  Skips blanks and names already listed (ignoring case/emoji). Does nothing if there is no "Merchant" header. */
function rememberMerchant_(name) {
  name = String(name || '').trim();
  if (!name) return;
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LISTS_SHEET);
  if (!sh || sh.getLastColumn() < 1) return;
  const ci = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0].map(norm_).indexOf('merchant');
  if (ci < 0) return;
  const vals = sh.getRange(2, ci + 1, Math.max(sh.getLastRow() - 1, 1), 1).getDisplayValues().map(r => String(r[0]).trim());
  if (vals.some(v => v && norm_(v) === norm_(name))) return;
  let last = -1;
  vals.forEach((v, i) => { if (v) last = i; });
  sh.getRange(last + 3, ci + 1).setValue(name);
}

/** The Drive folder bills are saved in ("Expense Bills" in My Drive; created on first use). */
function billFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('BILL_FOLDER_ID');
  if (id) { try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (err) {} }
  const it = DriveApp.getFoldersByName('Expense Bills');
  const f = it.hasNext() ? it.next() : DriveApp.createFolder('Expense Bills');
  props.setProperty('BILL_FOLDER_ID', f.getId());
  return f;
}

/** Saves bill / invoice files to Drive and returns their links.
 *  files: one item or a list; each item is a base64 string or {name, type, data: base64}. meta names the files: "date Rs amount merchant". */
function saveBills_(files, meta) {
  files = [].concat(files || []).map(f => typeof f === 'string' ? { data: f } : f).filter(f => f && f.data);
  if (!files.length) return [];
  meta = meta || {};
  const base = [meta.date, meta.amount ? 'Rs ' + meta.amount : '', meta.merchant || meta.sub || meta.category]
    .map(x => String(x || '').replace(/[\\/:*?"<>|#\n]+/g, '-').trim()).filter(Boolean).join(' ') || 'Bill';
  const folder = billFolder_();
  return files.map((f, i) => {
    const data = String(f.data).replace(/^data:[^,]*,/, '').replace(/\s+/g, '');
    const type = f.type || (data.indexOf('JVBER') === 0 ? 'application/pdf' : data.indexOf('iVBOR') === 0 ? 'image/png' : 'image/jpeg');
    const ext = { 'application/pdf': '.pdf', 'image/png': '.png', 'image/heic': '.heic', 'image/webp': '.webp' }[type] || '.jpg';
    const name = base + (files.length > 1 ? ' (' + (i + 1) + ')' : '') + ext;
    return folder.createFile(Utilities.newBlob(Utilities.base64Decode(data), type, name)).getUrl();
  });
}

/** Small thumbnails for the dashboard's Bill column. ids: Drive file ids -> {id: {src: data-url or '', type, name}} */
function billThumbs(ids) {
  const out = {};
  [].concat(ids || []).slice(0, 80).forEach(id => {
    try {
      const f = DriveApp.getFileById(String(id));
      const type = f.getMimeType();
      let b = null;
      try { b = f.getThumbnail(); } catch (err) {}
      if (!b && /^image\//.test(type) && f.getSize() < 700000) b = f.getBlob();   // new uploads may not have a Drive thumbnail yet
      out[id] = { type: type, name: f.getName(), src: b ? 'data:' + (b.getContentType() || 'image/png') + ';base64,' + Utilities.base64Encode(b.getBytes()) : '' };
    } catch (err) {
      out[id] = { type: '', name: '', src: '', error: 'Not found or no access' };
    }
  });
  return out;
}

/** Full bill for the dashboard's preview: images come back as base64; PDFs/other files return only type+name (shown via Drive's viewer). */
function billPreview(id) {
  const f = DriveApp.getFileById(String(id));
  const type = f.getMimeType(), name = f.getName();
  if (/^image\//.test(type) && f.getSize() <= 15000000) return { type: type, name: name, data: Utilities.base64Encode(f.getBlob().getBytes()) };
  return { type: type, name: name };
}

/* ===================== Credit card billing cycles & statements =====================
 * "Card Settings" tab:   Card | Statement Day | Due Day        (day of month, 1-31)
 * "Card Statements" tab: Card | Statement Date | Due Date | Bill Amount | Notes
 * Both tabs are created automatically the first time you save from the dashboard. */
const CARD_SETTINGS_SHEET = 'Card Settings', CARD_STMT_SHEET = 'Card Statements';

function cardSheet_(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#4B3BD0').setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
  }
  return sh;
}

function cardsData_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet(), tz = ss.getSpreadsheetTimeZone();
  const ymd = d => d instanceof Date ? Utilities.formatDate(d, tz, 'yyyy-MM-dd') : String(d || '').trim();
  const read = name => { const sh = ss.getSheetByName(name); return sh && sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, Math.max(sh.getLastColumn(), 5)).getValues() : []; };
  let cards = [];
  try { const L = listsData_(); if (L && L._bk) cards = L._bk.filter(b => sameKind_(b[1], 'Credit Card')).map(b => b[0]); } catch (err) {}
  const settings = read(CARD_SETTINGS_SHEET).filter(r => String(r[0]).trim())
    .map(r => ({ card: String(r[0]).trim(), stmtDay: Number(r[1]) || 0, dueDay: Number(r[2]) || 0 }));
  const statements = read(CARD_STMT_SHEET).filter(r => String(r[0]).trim() && r[1])
    .map(r => ({ card: String(r[0]).trim(), date: ymd(r[1]), due: ymd(r[2]), amount: (r[3] === '' || r[3] === null) ? null : Number(r[3]), notes: String(r[4] || '') }));
  return { cards: cards, settings: settings, statements: statements };
}

/** Adds a credit card to the Lists tab (Bank / Card = name, Bank / Card Type = Credit Card) if it isn't there yet. */
function addCardToLists_(name) {
  name = String(name || '').trim();
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LISTS_SHEET);
  if (!name || !sh) return;
  const hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0].map(norm_);
  const ci = hdr.indexOf('bank / card'), ti = hdr.indexOf('bank / card type');
  if (ci < 0) return;
  const vals = sh.getRange(2, ci + 1, Math.max(sh.getLastRow() - 1, 1), 1).getDisplayValues().map(r => String(r[0]).trim());
  if (vals.some(v => v && norm_(v) === norm_(name))) return;
  let last = -1; vals.forEach((v, i) => { if (v) last = i; });
  sh.getRange(last + 3, ci + 1).setValue(name);
  if (ti >= 0) sh.getRange(last + 3, ti + 1).setValue('Credit Card');
}

/** Saves billing-cycle settings. list = [{card, stmtDay, dueDay}] (days of month 1-31). */
function saveCardSettings(list) {
  list = [].concat(list || []);
  list.forEach(x => {
    if (!String(x.card || '').trim()) throw new Error('Card name missing');
    ['stmtDay', 'dueDay'].forEach(k => { const n = Number(x[k]); if (!(n >= 1 && n <= 31 && n === Math.floor(n))) throw new Error(x.card + ': pick a day between 1 and 31'); });
  });
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const sh = cardSheet_(CARD_SETTINGS_SHEET, ['Card', 'Statement Day', 'Due Day']);
    const v = sh.getDataRange().getValues();
    list.forEach(x => {
      const card = String(x.card).trim();
      const i = v.findIndex((r, k) => k > 0 && norm_(r[0]) === norm_(card));
      const vals = [[card, Number(x.stmtDay), Number(x.dueDay)]];
      addCardToLists_(card);   // new cards show up in the Bank / Card dropdowns too
      if (i > 0) sh.getRange(i + 1, 1, 1, 3).setValues(vals);
      else { sh.appendRow(vals[0]); v.push(vals[0]); }
    });
    SpreadsheetApp.flush();
  } finally { lock.releaseLock(); }
  return getData();
}

/** Saves (or clears) the generated bill for one statement. s = {card, date:'yyyy-mm-dd', due:'yyyy-mm-dd', amount, notes}. Empty amount removes it. */
function saveStatement(s) {
  s = s || {};
  const card = String(s.card || '').trim();
  const toDate = x => { const p = String(x || '').split('-').map(Number); return p.length === 3 && p[0] ? new Date(p[0], p[1] - 1, p[2]) : ''; };
  const date = toDate(s.date);
  if (!card || !date) throw new Error('Card and statement date are needed');
  const clear = s.amount === '' || s.amount === null || s.amount === undefined;
  const amount = clear ? '' : Number(String(s.amount).replace(/[^0-9.\-]/g, ''));
  if (!clear && isNaN(amount)) throw new Error('Bill amount must be a number');
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet(), tz = ss.getSpreadsheetTimeZone();
    const sh = cardSheet_(CARD_STMT_SHEET, ['Card', 'Statement Date', 'Due Date', 'Bill Amount', 'Notes']);
    const v = sh.getDataRange().getValues();
    const key = Utilities.formatDate(date, tz, 'yyyy-MM-dd');
    const i = v.findIndex((r, k) => k > 0 && norm_(r[0]) === norm_(card) && r[1] instanceof Date && Utilities.formatDate(r[1], tz, 'yyyy-MM-dd') === key);
    if (clear) { if (i > 0) sh.deleteRow(i + 1); }
    else {
      const row = [card, date, toDate(s.due), amount, String(s.notes || '').trim()];
      const r = i > 0 ? i + 1 : sh.getLastRow() + 1;
      sh.getRange(r, 1, 1, 5).setValues([row]);
      sh.getRange(r, 2, 1, 2).setNumberFormat('dd/MM/yyyy');
    }
    SpreadsheetApp.flush();
  } finally { lock.releaseLock(); }
  return getData();
}

/** Run this once from the editor (select it, click Run) to give the script permission to save bills in Drive. */
function authorizeBills() {
  Logger.log('Bills folder ready: ' + billFolder_().getUrl());
}

function publicLists_(L) {
  if (!L) return null;
  const o = Object.assign({}, L);
  delete o._bk; delete o._pl;
  return o;
}

/** Banks / cards for a payment mode; unknown modes are matched by type words in the name ("... Credit Card" -> credit cards). */
function banksForMode_(L, mode) {
  const k = findKey_(L.banksFor, mode);
  if (k) return L.banksFor[k];
  return L._bk.filter(b => b[1] && norm_(mode).indexOf(norm_(b[1])) >= 0).map(b => b[0]);
}
function platformsForMode_(L, mode) {
  const k = findKey_(L.platformsFor, mode);
  if (k) return L.platformsFor[k];
  return L._pl.filter(p => sameKind_(p[1], mode)).map(p => p[0]);
}

function categoryApi_(p) {
  const out = obj => ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
  const L = listsData_();
  if (!L) return out({ error: 'Lists tab is missing or empty' });
  switch (String(p.action || '').toLowerCase()) {
    case 'lists': return out(publicLists_(L));
    case 'categories': return out(Object.keys(L.categories));
    case 'all': return out(L.categories);
    case 'subcategories': { const k = findKey_(L.categories, p.category); return out(k ? L.categories[k] : []); }
    case 'paymentmodes': return out(L.paymentModes);
    case 'purchasemodes': return out(L.purchaseModes);
    case 'banks': return out(p.paymentMode ? banksForMode_(L, p.paymentMode) : L.banks);
    case 'platforms': return out(p.purchaseMode ? platformsForMode_(L, p.purchaseMode) : L.platforms);
    case 'merchants': return out(L.merchants);
  }
  return out({ error: 'Unknown action. Use lists, categories, all, subcategories&category=X, paymentmodes, purchasemodes, banks[&paymentMode=X], platforms[&purchaseMode=X]' });
}

function doGet(e) {
  if (e && e.parameter && e.parameter.action) return categoryApi_(e.parameter);
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Expense Dashboard')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Strip emojis/odd symbols, fix known typos, trim. */
function clean_(s) {
  return String(s || '')
    .replace(/[^\p{L}\p{N} &\-\/]/gu, '')
    .replace(/\bCredt\b/gi, 'Credit')
    .replace(/\s+/g, ' ')
    .trim();
}

function sheet_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sh) throw new Error('Sheet "' + SHEET_NAME + '" not found');
  return sh;
}

function headerIndex_(header) {
  const h = header.map(x => String(x).trim().toLowerCase());
  const col = name => h.indexOf(name);
  return {
    date: col('date'), time: col('time'), category: col('category'),
    sub: col('sub-category'), items: col('items'), amount: col('amount'),
    mode: col('payment mode'), remarks: col('remarks'),
    location: col('location'), purchase: col('purchase mode'), platform: col('platform'),
    bank: ['bank / card', 'bank/card', 'bank card', 'bankcard'].map(col).filter(i => i >= 0)[0] ?? -1,
    merchant: ['merchant', 'merchant / shop / store', 'merchant / shop', 'merchant name', 'shop / store', 'store'].map(col).filter(i => i >= 0)[0] ?? -1,
    bill: ['bill', 'bills', 'invoice', 'invoices', 'bill / invoice', 'invoice / bill', 'receipt', 'receipts'].map(col).filter(i => i >= 0)[0] ?? -1
  };
}

/** Reads "lat,lng" out of any text (e.g. "12.9716, 77.5946" or a Maps link). */
function parseLatLng_(s) {
  const m = String(s || '').match(/(?:^|[^\d.])(-?\d{1,3}\.\d{2,})\s*,\s*(-?\d{1,3}\.\d{2,})/);   // both need decimals, so '12, 34 MG Road' is not read as coordinates
  if (!m) return null;
  let lat = Number(m[1]), lng = Number(m[2]);
  // Accept both "lat,lng" and "lng,lat": swap when the first value can't be a latitude,
  // or when it clearly looks like India's lng,lat (lng 68–98, lat 6–38).
  if (Math.abs(lat) > 90 || (lat >= 68 && lat <= 98 && lng >= 6 && lng <= 38)) { const t = lat; lat = lng; lng = t; }
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return null;
  return { lat: lat, lng: lng };
}

/** Gives every row a map position and a place label from the single Location column:
 *  coordinates ("lat,lng") give an exact pin and a looked-up place name; a place name is looked up (approximate). Lookups are cached in Script Properties
 *  (max 8 new lookups per refresh to stay fast). */
function attachGeo_(rows, values, c) {
  if (c.location < 0) return;
  const props = PropertiesService.getScriptProperties();
  const mem = {};
  let budget = 8;
  const cached = (kind, text, fn) => {
    const id = kind + text;
    if (id in mem) return mem[id];
    const key = kind + ':' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, text));
    let v = props.getProperty(key);
    if (v === null && budget > 0) {
      budget--;
      try { v = fn() || 'x'; } catch (err) { v = null; }
      if (v !== null) props.setProperty(key, v);
    }
    return (mem[id] = v);
  };
  rows.forEach(r => {
    const raw = c.location >= 0 ? String(values[r.row - 2][c.location] || '').split(/\n/).map(x => x.trim()).filter(Boolean).join(', ') : '';
    const ll = parseLatLng_(raw);
    if (ll) {
      r.lat = ll.lat; r.lng = ll.lng; r.exact = true;
      {                                              // coordinates only: find a place name (~110 m grid)
        const k = ll.lat.toFixed(3) + ',' + ll.lng.toFixed(3);
        const name = cached('rgeo', k, () => {
          const res = Maps.newGeocoder().reverseGeocode(ll.lat, ll.lng);
          const comps = (res && res.results && res.results[0] && res.results[0].address_components) || [];
          const pick = t => (comps.find(x => x.types.indexOf(t) >= 0) || {}).long_name;
          return [pick('sublocality') || pick('neighborhood') || pick('locality'), pick('locality') || pick('administrative_area_level_2')]
            .filter((x, i, a) => x && a.indexOf(x) === i).join(', ');
        });
        r.location = name && name !== 'x' ? name : k;
      }
      return;
    }
    if (!raw) return;
    const v = cached('geo', raw, () => {
      const res = Maps.newGeocoder().setRegion('in').geocode(raw);
      const g = res && res.results && res.results[0] && res.results[0].geometry.location;
      return g ? g.lat + ',' + g.lng : 'x';
    });
    if (v && v !== 'x') { const p = v.split(','); r.lat = Number(p[0]); r.lng = Number(p[1]); r.exact = false; }
  });
}

/** Called from the page on every refresh. */
function getData() {
  const sh = sheet_();
  const values = sh.getDataRange().getDisplayValues();
  const c = headerIndex_(values.shift());

  const rows = [];
  values.forEach((r, i) => {
    const amount = parseFloat(String(r[c.amount]).replace(/[^0-9.\-]/g, ''));
    if (isNaN(amount) || !String(r[c.category]).trim()) return;
    rows.push({
      row: i + 2,
      date: r[c.date], time: r[c.time],
      category: clean_(r[c.category]) || 'Other',
      sub: clean_(r[c.sub]) || '—',
      items: c.items >= 0 ? r[c.items] : '',
      amount: amount,
      mode: clean_(r[c.mode]) || 'Unknown',
      remarks: String(r[c.remarks] || '').trim(),
      location: c.location >= 0 ? String(r[c.location] || '').split(/\n/).map(x => x.trim()).filter(Boolean).slice(0, 2).join(', ') : '',
      purchase: c.purchase >= 0 ? clean_(r[c.purchase]) : '',
      rawPurchase: c.purchase >= 0 ? String(r[c.purchase] || '') : '',
      rawLocation: c.location >= 0 ? String(r[c.location] || '') : '',
      bank: c.bank >= 0 ? String(r[c.bank] || '').trim() : '',
      platform: c.platform >= 0 ? String(r[c.platform] || '').trim() : '',
      merchant: c.merchant >= 0 ? String(r[c.merchant] || '').trim() : '',
      bills: c.bill >= 0 ? String(r[c.bill] || '').split(/\s+/).filter(x => /^https?:\/\//.test(x)) : [],
      // raw values keep the sheet's exact dropdown spelling for new entries
      rawCategory: String(r[c.category]),
      rawSub: String(r[c.sub] || ''),
      fp: fp_(r, c),
      rawMode: String(r[c.mode])
    });
  });

  attachGeo_(rows, values, c);

  return {
    rows: rows,
    lists: (function () { try { return publicLists_(listsData_()); } catch (err) { return null; } })(),
    cards: (function () { try { return cardsData_(); } catch (err) { return { error: err.message }; } })(),
    updated: new Date().toISOString(),
    sheetUrl: SpreadsheetApp.getActiveSpreadsheet().getUrl() + '#gid=' + sh.getSheetId()
  };
}

/** Appends one expense row from the dashboard's Add Expense form, using the same columns as the Shortcut:
 *  Date, Category, Sub-Category, Amount, Payment Mode, Remarks, Location, Purchase Mode (all required except Remarks). */
function addExpense(e) {
  e = e || {};
  const amount = Number(e.amount);
  const need = { category: 'Category', sub: 'Sub-Category', mode: 'Payment Mode', date: 'Date', location: 'Location', purchase: 'Purchase Mode' };
  const missing = Object.keys(need).filter(k => !String(e[k] || '').trim()).map(k => need[k]);
  if (!(amount > 0)) missing.unshift('Amount');
  if (missing.length) throw new Error('Please fill: ' + missing.join(', '));

  const dp = String(e.date).split('-').map(Number);                  // yyyy-mm-dd from the form
  const date = new Date(dp[0], dp[1] - 1, dp[2]);

  const billUrls = saveBills_(e.bills, { date: e.date, amount: amount, merchant: e.merchant, sub: e.sub, category: e.category });  // optional bills -> Drive
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = sheet_();
    const header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    const c = headerIndex_(header);
    const out = header.map(() => '');
    const put = (k, v) => { if (c[k] >= 0) out[c[k]] = v; };
    put('date', date);
    put('category', e.category);
    put('sub', String(e.sub).trim());
    put('amount', amount);
    put('mode', e.mode);
    put('remarks', String(e.remarks || '').trim());
    put('location', String(e.location).trim());      // place name or "lat,lng"
    put('purchase', e.purchase);
    put('bank', String(e.bank || '').trim());          // optional
    put('platform', String(e.platform || '').trim());  // optional
    put('merchant', String(e.merchant || '').trim());  // optional: Merchant / Shop / Store name
    rememberMerchant_(e.merchant);
    if (billUrls.length) { if (c.bill < 0) throw new Error('Add a "Bill" column to the Transactions sheet to save bills'); put('bill', billUrls.join('\n')); }

    const row = sh.getLastRow() + 1;
    sh.getRange(row, 1, 1, out.length).setValues([out]);
    if (c.date >= 0) sh.getRange(row, c.date + 1).setNumberFormat('dd/MM/yyyy');
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  return getData();
}

/** Fingerprint of a sheet row (as displayed) so a stale dashboard can never edit or delete the wrong row. */
function fp_(r, c) {
  return [c.date, c.category, c.sub, c.amount].map(i => i >= 0 ? String(r[i] || '').trim() : '').join('|');
}

function txRow_(sh, c, row, fp) {
  row = Number(row);
  if (!(row >= 2 && row <= sh.getLastRow())) throw new Error('That row no longer exists. Refresh and try again.');
  const v = sh.getRange(row, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
  if (!fp || fp !== fp_(v, c)) throw new Error('This transaction was changed in the sheet since the dashboard loaded. Refresh and try again.');
  return row;
}

/** Edits one transaction from the dashboard. e = {row, fp, changes:{date:'yyyy-mm-dd', category, sub, amount, mode, remarks, location, purchase, platform, bank}}
 *  Only the fields in "changes" are written; everything else in the row is left untouched. */
function updateExpense(e) {
  e = e || {};
  const ch = e.changes || {};
  const keys = ['date', 'category', 'sub', 'amount', 'mode', 'remarks', 'location', 'purchase', 'platform', 'bank', 'merchant', 'bill'];
  const addBills = Array.isArray(ch.addBills) ? ch.addBills : [];   // new bill files to attach
  const need = { amount: 'Amount', date: 'Date', category: 'Category', sub: 'Sub-Category', mode: 'Payment Mode' };
  Object.keys(ch).forEach(k => { if (keys.indexOf(k) < 0) delete ch[k]; });
  Object.keys(need).forEach(k => { if (k in ch && !String(ch[k]).trim()) throw new Error(need[k] + ' cannot be empty'); });
  if ('amount' in ch) { ch.amount = Number(ch.amount); if (!(ch.amount > 0)) throw new Error('Amount must be greater than 0'); }
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = sheet_();
    const c = headerIndex_(sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]);
    const row = txRow_(sh, c, e.row, e.fp);
    if (ch.merchant) rememberMerchant_(ch.merchant);
    if (addBills.length) {
      if (!(c.bill >= 0)) throw new Error('Add a "Bill" column to the Transactions sheet to save bills');
      const cur = sh.getRange(row, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
      const at = k => c[k] >= 0 ? cur[c[k]] : '';
      const urls = saveBills_(addBills, { date: ch.date || at('date'), amount: ch.amount || at('amount'), merchant: ch.merchant || at('merchant'), sub: ch.sub || at('sub'), category: ch.category || at('category') });
      const kept = 'bill' in ch ? String(ch.bill || '') : String(cur[c.bill] || '');
      ch.bill = kept.split(/\s+/).filter(Boolean).concat(urls).join('\n');
    }
    Object.keys(ch).forEach(k => {
      if (!(c[k] >= 0)) return;
      const cell = sh.getRange(row, c[k] + 1);
      if (k === 'date') {
        const d = String(ch.date).split('-').map(Number);
        cell.setValue(new Date(d[0], d[1] - 1, d[2])).setNumberFormat('dd/MM/yyyy');
      } else {
        cell.setValue(k === 'amount' ? ch.amount : String(ch[k]).trim());
      }
    });
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  return getData();
}

/** Deletes one transaction row from the dashboard (after the same fingerprint check). */
function deleteExpense(e) {
  e = e || {};
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = sheet_();
    const c = headerIndex_(sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]);
    const row = txRow_(sh, c, e.row, e.fp);
    sh.deleteRow(row);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  return getData();
}

/** Deletes several transactions at once from the dashboard. list = [{row, fp}, ...]
 *  Every row is checked first; if any of them changed in the sheet, nothing is deleted. */
function deleteExpenses(list) {
  list = (list || []).filter(x => x && Number(x.row) >= 2);
  if (!list.length) throw new Error('Nothing selected.');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = sheet_();
    const last = sh.getLastRow();
    const vals = sh.getRange(1, 1, last, sh.getLastColumn()).getDisplayValues();
    const c = headerIndex_(vals[0]);
    const rows = [];
    list.forEach(x => {
      const r = Number(x.row);
      if (r > last || !x.fp || fp_(vals[r - 1], c) !== x.fp) {
        throw new Error('Some of the selected transactions changed in the sheet since the dashboard loaded. Refresh and try again (nothing was deleted).');
      }
      if (rows.indexOf(r) < 0) rows.push(r);
    });
    rows.sort((a, b) => b - a);                 // bottom-up so row numbers stay valid
    for (let i = 0; i < rows.length;) {
      const end = rows[i];
      let start = end, j = i + 1;
      while (j < rows.length && rows[j] === start - 1) { start = rows[j]; j++; }
      sh.deleteRows(start, end - start + 1);    // one call per block of neighbouring rows
      i = j;
    }
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  return getData();
}

/* ------------------------------------------------------------------
 * ORIGINAL expense logger (restored from Version 3).
 * Receives entries via POST and appends them to the Transactions tab.
 * ------------------------------------------------------------------ */
function doPost(e) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);

    // ---- DEBUG: see Executions (left menu) > click a doPost run to view these logs ----
    console.log('[doPost] raw body (first 500 chars): ' + (e && e.postData ? String(e.postData.contents).slice(0, 500) : '(no body)'));
    console.log('[doPost] content type: ' + (e && e.postData ? e.postData.type : '-'));
    console.log('[doPost] query params: ' + JSON.stringify(e && e.parameter));

    const data = JSON.parse(e.postData.contents);
    console.log('[doPost] parsed: ' + JSON.stringify(data, (k, v) => (typeof v === 'string' && v.length > 200) ? v.slice(0, 40) + '…(' + v.length + ' chars)' : v, 2));
    console.log('[doPost] row to append: ' + JSON.stringify([data.date, data.category, data.subCategory, data.amount, data.paymentMode, data.remarks, data.location, data.purchaseMode, data.platform, data.bankCard]));

    // ---- Validation: every field is required except Remarks and Bank / Card ----
    const val = k => (data[k] === undefined || data[k] === null) ? '' : String(data[k]).trim();
    const REQUIRED = {
      date: 'Date', category: 'Category', subCategory: 'Sub-Category', amount: 'Amount',
      paymentMode: 'Payment Mode', location: 'Location (place name or "lat,lng")', purchaseMode: 'Purchase Mode'
    };
    const missing = Object.keys(REQUIRED).filter(k => val(k) === '').map(k => REQUIRED[k]);
    if (missing.length) {
      console.warn('[doPost] REJECTED, missing: ' + missing.join(', '));
      return ContentService.createTextOutput('Error: missing ' + missing.join(', '));
    }
    const amount = Number(val('amount').replace(/[^0-9.\-]/g, ''));
    if (!(amount > 0)) {
      console.warn('[doPost] REJECTED, bad amount: ' + val('amount'));
      return ContentService.createTextOutput('Error: Amount must be a number greater than 0');
    }

    // Each value goes to the column with the matching header, so adding/moving columns never shifts data.
    const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const c = headerIndex_(header);
    const row = header.map(() => '');
    const put = (k, v) => { if (c[k] >= 0) row[c[k]] = v; };
    put('date', val('date'));                // Date
    put('category', val('category'));        // Category
    put('sub', val('subCategory'));          // Sub-Category
    put('amount', amount);                   // Amount
    put('mode', val('paymentMode'));         // Payment Mode
    put('remarks', val('remarks'));          // Remarks (optional, may be empty)
    put('location', val('location'));        // Location: place name OR coordinates "lat,lng"
    put('purchase', val('purchaseMode'));    // Purchase Mode
    put('platform', val('platform'));        // Platform (optional): Amazon, Flipkart, Local Shop...
    put('bank', val('bankCard'));            // Bank / Card name (optional)
    put('merchant', val('merchant') || val('merchantName') || val('shop') || val('store')); // Merchant / Shop / Store name (optional)
    // Bills / invoices (optional): "bill" = one base64 string or a list of them (from the Shortcut), or "bills" = [{name, type, data}]
    let billNote = '';
    const billFiles = [].concat(data.bills || [], data.bill || []).filter(Boolean)
      // a Shortcut list of several photos arrives as one text with one base64 per line -> split it
      .reduce((a, b) => a.concat(typeof b === 'string' ? b.split(/\s+/).filter(Boolean).map(s => ({ data: s, type: data.billType || '', name: data.billName || '' })) : [b]), []);
    if (billFiles.length) {
      try {
        if (c.bill < 0) throw new Error('no "Bill" column in Transactions');
        put('bill', saveBills_(billFiles, { date: val('date'), amount: amount, merchant: val('merchant'), sub: val('subCategory'), category: val('category') }).join('\n'));
      } catch (err) {
        console.error('[doPost] bill not saved: ' + err.message);
        billNote = ' (expense saved, but bill not saved: ' + err.message + ')';
      }
    }
    sheet.appendRow(row);
    rememberMerchant_(val('merchant') || val('merchantName') || val('shop') || val('store')); // new names get added to Lists > Merchant

    // Remarks is always stored as plain text (so "500" or "01" stay as typed)
    // Remarks column is typed as "Text" in the sheet's table, so it already keeps values as typed
    // (setting a number format on a typed column is not allowed).

    return ContentService.createTextOutput("Success" + billNote);
  } catch (err) {
    console.error('[doPost] ERROR: ' + err.message + '\n' + err.stack);
    return ContentService.createTextOutput("Error: " + err.message);
  }
}
