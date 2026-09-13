import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const configPath = path.join(root, 'config.json');
const dealsPath = path.join(root, 'data', 'deals.json');
const historyPath = path.join(root, 'data', 'history.json');

const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
const token = process.env.TRAVELPAYOUTS_TOKEN;
if (!token) {
  console.error('ERRO: o secret TRAVELPAYOUTS_TOKEN não está disponível.');
  process.exit(1);
}

const API_BASE = 'https://api.travelpayouts.com';
const now = new Date();
const generatedAt = now.toISOString();
const origin = config.origin || 'POA';
const currency = (config.currency || 'BRL').toLowerCase();
const market = config.market || 'br';
const locale = config.locale || 'pt';
const delayMs = Math.max(0, Number(config.collection?.requestDelayMs || 140));
const horizonMonths = Math.max(1, Number(config.collection?.horizonMonths || 18));
const trackedDestinations = [...new Set(config.collection?.trackedDestinations || [])];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const isoDay = value => value ? String(value).slice(0, 10) : null;
const monthKey = value => value ? String(value).slice(0, 7) : null;
const futureOrToday = value => !value || isoDay(value) >= generatedAt.slice(0, 10);

async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch { return fallback; }
}

const previousDealsPayload = await readJson(dealsPath, { meta: {}, deals: [] });
const historyPayload = await readJson(historyPath, { version: 1, updatedAt: null, observations: [] });

const statuses = [];
const errors = [];
let successfulRequests = 0;

function publicParams(params) {
  return Object.fromEntries(Object.entries(params).filter(([,v]) => v !== undefined && v !== null && v !== ''));
}

async function apiGet(endpoint, params, label) {
  const url = new URL(endpoint, API_BASE);
  Object.entries(publicParams(params)).forEach(([key, value]) => url.searchParams.set(key, String(value)));
  const started = Date.now();
  try {
    const response = await fetch(url, {
      headers: {
        'X-Access-Token': token,
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'User-Agent': 'radar-ferias-poa-github-action/1.0'
      },
      signal: AbortSignal.timeout(30000)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (payload?.success === false) throw new Error(payload?.error || 'API retornou success=false');
    successfulRequests += 1;
    statuses.push({ label, endpoint, ok: true, ms: Date.now() - started });
    return payload;
  } catch (error) {
    const item = { label, endpoint, ok: false, error: String(error.message || error).slice(0, 180) };
    statuses.push(item);
    errors.push(item);
    console.warn(`[aviso] ${label}: ${item.error}`);
    return null;
  } finally {
    if (delayMs) await sleep(delayMs);
  }
}

function monthsFrom(start, count) {
  const out = [];
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  for (let i = 0; i < count; i++) {
    const y = cursor.getUTCFullYear();
    const m = String(cursor.getUTCMonth() + 1).padStart(2, '0');
    out.push(`${y}-${m}`);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return out;
}

function vacationMonths() {
  const months = new Set();
  for (const vacation of config.vacationPeriods || []) {
    if (!vacation.start || !vacation.end) continue;
    const cursor = new Date(`${vacation.start.slice(0,7)}-01T00:00:00Z`);
    const end = new Date(`${vacation.end.slice(0,7)}-01T00:00:00Z`);
    while (cursor <= end && months.size < 36) {
      months.add(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth()+1).padStart(2,'0')}`);
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
  }
  return [...months].filter(m => m >= generatedAt.slice(0,7)).sort();
}

function valueFrom(raw, ...keys) {
  for (const key of keys) {
    if (raw?.[key] !== undefined && raw?.[key] !== null && raw?.[key] !== '') return raw[key];
  }
  return null;
}

function normalize(raw, sourceEndpoint, extra = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const dealOrigin = String(valueFrom(raw, 'origin', 'origin_iata') || origin).toUpperCase();
  const destination = String(valueFrom(raw, 'destination', 'destination_code', 'destination_iata') || '').toUpperCase();
  const price = Number(valueFrom(raw, 'price', 'value'));
  const departureAt = valueFrom(raw, 'departure_at', 'depart_date', 'departureAt');
  const returnAt = valueFrom(raw, 'return_at', 'return_date', 'returnAt');
  if (dealOrigin !== origin || !destination || !Number.isFinite(price) || price <= 0 || !departureAt || !returnAt) return null;
  if (!futureOrToday(departureAt)) return null;

  const transfers = valueFrom(raw, 'transfers', 'number_of_changes');
  const returnTransfers = valueFrom(raw, 'return_transfers');
  const foundAt = valueFrom(raw, 'found_at', 'foundAt') || null;
  const airline = valueFrom(raw, 'airline');
  const link = valueFrom(raw, 'link');
  const stable = [dealOrigin, destination, isoDay(departureAt), isoDay(returnAt), price, airline || '', transfers ?? '', sourceEndpoint].join('|');

  return {
    id: crypto.createHash('sha1').update(stable).digest('hex').slice(0, 20),
    origin: dealOrigin,
    destination,
    departureAt,
    returnAt,
    price,
    currency: (valueFrom(raw, 'currency') || config.currency || 'BRL').toUpperCase(),
    airline: airline ? String(airline).toUpperCase() : null,
    transfers: transfers === null ? null : Number(transfers),
    returnTransfers: returnTransfers === null ? null : Number(returnTransfers),
    foundAt,
    duration: valueFrom(raw, 'duration'),
    actual: raw.actual !== false,
    link: link || null,
    source: 'Travelpayouts / Aviasales Data API',
    sourceEndpoint,
    metadata: {
      originAirport: valueFrom(raw, 'origin_airport'),
      destinationAirport: valueFrom(raw, 'destination_airport'),
      flightNumber: valueFrom(raw, 'flight_number'),
      ...extra
    }
  };
}

function dedupeDeals(deals) {
  const map = new Map();
  for (const deal of deals.filter(Boolean)) {
    const key = [deal.origin, deal.destination, isoDay(deal.departureAt), isoDay(deal.returnAt), deal.price].join('|');
    const previous = map.get(key);
    if (!previous) { map.set(key, deal); continue; }
    const score = d => [d.link, d.airline, d.foundAt, d.returnTransfers !== null].filter(Boolean).length;
    if (score(deal) > score(previous)) map.set(key, { ...previous, ...deal });
  }
  return [...map.values()];
}

const collected = [];
const months = monthsFrom(now, horizonMonths);

for (const month of months) {
  const payload = await apiGet('/aviasales/v3/prices_for_dates', {
    origin,
    departure_at: month,
    one_way: false,
    direct: false,
    currency,
    market,
    sorting: 'price',
    unique: false,
    limit: 1000,
    page: 1
  }, `prices_for_dates ${month}`);
  if (Array.isArray(payload?.data)) {
    for (const raw of payload.data) collected.push(normalize(raw, 'aviasales/v3/prices_for_dates', { requestedMonth: month }));
  }
}

{
  const payload = await apiGet('/aviasales/v3/get_special_offers', {
    origin, locale, currency, market
  }, 'get_special_offers');
  if (Array.isArray(payload?.data)) {
    for (const raw of payload.data) collected.push(normalize(raw, 'aviasales/v3/get_special_offers', { specialOffer: true }));
  }
}

const years = [...new Set(months.map(m => m.slice(0,4)))];
for (const year of years) {
  const payload = await apiGet('/aviasales/v3/get_latest_prices', {
    origin,
    beginning_of_period: year,
    period_type: 'year',
    group_by: 'directions',
    one_way: false,
    page: 1,
    market,
    sorting: 'price',
    trip_class: 0,
    currency
  }, `get_latest_prices ${year}`);
  if (Array.isArray(payload?.data)) {
    for (const raw of payload.data) collected.push(normalize(raw, 'aviasales/v3/get_latest_prices', { requestedYear: year }));
  }
}

const detailedMonths = vacationMonths();
for (const destination of trackedDestinations) {
  for (const month of detailedMonths) {
    const matchingVacations = (config.vacationPeriods || []).filter(v => v.start?.slice(0,7) <= month && v.end?.slice(0,7) >= month);
    const minTrip = matchingVacations.length ? Math.min(...matchingVacations.map(v => Number(v.minDays || 1))) : 1;
    const maxTrip = matchingVacations.length ? Math.max(...matchingVacations.map(v => Number(v.maxDays || 30))) : 30;
    const payload = await apiGet('/aviasales/v3/grouped_prices', {
      origin,
      destination,
      group_by: 'departure_at',
      departure_at: month,
      direct: false,
      min_trip_duration: minTrip,
      max_trip_duration: maxTrip,
      market,
      currency
    }, `grouped_prices ${destination} ${month}`);
    const data = payload?.data;
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      for (const raw of Object.values(data)) collected.push(normalize(raw, 'aviasales/v3/grouped_prices', { requestedMonth: month }));
    }
  }
}

const freshDeals = dedupeDeals(collected)
  .filter(d => d && d.actual !== false)
  .sort((a, b) => a.price - b.price || String(a.departureAt).localeCompare(String(b.departureAt)));

const endpointStatusMap = new Map();
for (const item of statuses) {
  const key = item.endpoint.replace(/^\//, '');
  const agg = endpointStatusMap.get(key) || { ok: 0, failed: 0 };
  item.ok ? agg.ok++ : agg.failed++;
  endpointStatusMap.set(key, agg);
}
const fullyFailedEndpoints = new Set([...endpointStatusMap.entries()].filter(([,v]) => v.failed > 0 && v.ok === 0).map(([k]) => k));
let carriedForward = [];
if (fullyFailedEndpoints.size && Array.isArray(previousDealsPayload.deals)) {
  const prevGenerated = previousDealsPayload.meta?.generatedAt ? new Date(previousDealsPayload.meta.generatedAt) : null;
  const prevAgeDays = prevGenerated && !Number.isNaN(prevGenerated.getTime()) ? (now - prevGenerated) / 86400000 : Infinity;
  if (prevAgeDays <= 7) {
    carriedForward = previousDealsPayload.deals.filter(d => fullyFailedEndpoints.has(String(d.sourceEndpoint || '').replace(/^\//, '')) && futureOrToday(d.departureAt)).map(d => ({ ...d, metadata: { ...(d.metadata || {}), carriedForward: true } }));
  }
}

let finalDeals;
let dataGeneratedAt;
if (successfulRequests === 0) {
  finalDeals = previousDealsPayload.deals || [];
  dataGeneratedAt = previousDealsPayload.meta?.generatedAt || null;
} else {
  finalDeals = dedupeDeals([...freshDeals, ...carriedForward]);
  dataGeneratedAt = generatedAt;
}

const compactErrors = errors.slice(0, 50).map(e => ({ label: e.label, endpoint: e.endpoint, error: e.error }));
const endpoints = statuses.reduce((acc, item) => {
  const key = item.endpoint.replace(/^\//, '');
  const existing = acc.find(x => x.endpoint === key);
  if (!existing) acc.push({ endpoint: key, ok: item.ok ? 1 : 0, failed: item.ok ? 0 : 1 });
  else item.ok ? existing.ok++ : existing.failed++;
  return acc;
}, []);

const newDealsPayload = {
  meta: {
    generatedAt: dataGeneratedAt,
    lastAttemptAt: generatedAt,
    origin,
    currency: config.currency || 'BRL',
    source: 'Travelpayouts / Aviasales Data API',
    partial: errors.length > 0,
    errors: compactErrors,
    endpoints,
    requestWindow: { firstMonth: months[0], lastMonth: months.at(-1) },
    freshDealCount: freshDeals.length,
    carriedForwardCount: carriedForward.length
  },
  deals: finalDeals
};

const existingHistory = Array.isArray(historyPayload.observations) ? historyPayload.observations : [];
const historyMap = new Map();
for (const h of existingHistory) {
  const key = h.id || [h.origin, h.destination, isoDay(h.departureAt), isoDay(h.returnAt), h.price, h.airline || '', h.transfers ?? '', h.foundAt || '', h.sourceEndpoint || ''].join('|');
  historyMap.set(key, h);
}
for (const d of freshDeals) {
  const stable = [d.origin, d.destination, isoDay(d.departureAt), isoDay(d.returnAt), d.price, d.airline || '', d.transfers ?? '', d.foundAt || '', d.sourceEndpoint || ''].join('|');
  const id = crypto.createHash('sha1').update(stable).digest('hex').slice(0, 24);
  if (historyMap.has(id)) continue;
  historyMap.set(id, {
    id,
    origin: d.origin,
    destination: d.destination,
    departureAt: d.departureAt,
    returnAt: d.returnAt,
    price: d.price,
    currency: d.currency,
    airline: d.airline,
    transfers: d.transfers,
    returnTransfers: d.returnTransfers,
    foundAt: d.foundAt,
    observedAt: generatedAt,
    source: d.source,
    sourceEndpoint: d.sourceEndpoint,
    link: d.link
  });
}

const retentionDays = Math.max(30, Number(config.collection?.historyRetentionDays || 540));
const cutoff = new Date(now.getTime() - retentionDays * 86400000);
let observations = [...historyMap.values()].filter(h => {
  const t = new Date(h.observedAt || h.foundAt || 0);
  return !Number.isNaN(t.getTime()) && t >= cutoff;
});
observations.sort((a,b) => new Date(a.observedAt || a.foundAt || 0) - new Date(b.observedAt || b.foundAt || 0));
const maxHistory = Math.max(1000, Number(config.collection?.maxHistoryObservations || 50000));
if (observations.length > maxHistory) observations = observations.slice(-maxHistory);

const newHistoryPayload = {
  version: 1,
  updatedAt: successfulRequests > 0 ? generatedAt : (historyPayload.updatedAt || null),
  observations
};

await fs.mkdir(path.dirname(dealsPath), { recursive: true });
await fs.writeFile(dealsPath, `${JSON.stringify(newDealsPayload, null, 2)}\n`);
await fs.writeFile(historyPath, `${JSON.stringify(newHistoryPayload, null, 2)}\n`);

console.log(`Coleta concluída: ${successfulRequests} requisições com sucesso, ${errors.length} falhas, ${freshDeals.length} ofertas novas/atuais, ${finalDeals.length} ofertas publicadas, ${observations.length} observações no histórico.`);
if (successfulRequests === 0) console.warn('Nenhuma chamada à API teve sucesso; os preços anteriores foram preservados e generatedAt não foi alterado.');
