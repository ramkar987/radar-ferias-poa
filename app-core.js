'use strict';

const STORAGE = {
  theme: 'radar-ferias-theme',
  vacations: 'radar-ferias-vacations',
  favorites: 'radar-ferias-favorites',
  travelers: 'radar-ferias-travelers'
};

const state = {
  config: null,
  dealsPayload: null,
  historyPayload: null,
  deals: [],
  history: [],
  scoredDeals: [],
  vacations: [],
  favorites: [],
  travelers: 1,
  compare: new Set(),
  calendarSelectedDate: null
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function safeJsonParse(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function localDateOnly(value) {
  if (!value) return null;
  const text = String(value).slice(0, 10);
  const [y, m, d] = text.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d, 12));
}

function daysBetween(a, b) {
  const d1 = localDateOnly(a);
  const d2 = localDateOnly(b);
  if (!d1 || !d2) return null;
  return Math.round((d2 - d1) / 86400000);
}

function monthKey(value) {
  return value ? String(value).slice(0, 7) : '';
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function average(values) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

function percentileRank(values, value) {
  if (!values.length) return null;
  const lower = values.filter(v => v < value).length;
  const equal = values.filter(v => v === value).length;
  return (lower + equal * 0.5) / values.length;
}

function currency(value, code = state.config?.currency || 'BRL') {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: code, maximumFractionDigits: 0 }).format(Number(value));
}

function fmtDate(value, withYear = true) {
  const d = localDateOnly(value);
  if (!d) return '—';
  return new Intl.DateTimeFormat('pt-BR', withYear ? { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' } : { day: '2-digit', month: '2-digit', timeZone: 'UTC' }).format(d);
}

function fmtDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  }).format(d);
}

function ageHours(value) {
  const d = value ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) return Infinity;
  return Math.max(0, (Date.now() - d.getTime()) / 3600000);
}

function destinationInfo(code) {
  const c = String(code || '').toUpperCase();
  return state.config?.airportCatalog?.[c] || { city: c || 'Destino', country: 'País não mapeado', countryCode: '', region: 'Outro' };
}

function destinationLabel(code) {
  const info = destinationInfo(code);
  return info.city && info.city !== code ? `${info.city} (${code})` : code;
}

function tripDays(deal) {
  return daysBetween(deal.departureAt, deal.returnAt);
}

function normalizeClientDeal(raw) {
  if (!raw || raw.origin !== state.config.origin || !raw.destination) return null;
  const price = Number(raw.price);
  if (!Number.isFinite(price) || price <= 0 || !raw.departureAt || !raw.returnAt) return null;
  const durationDays = daysBetween(raw.departureAt, raw.returnAt);
  if (durationDays == null || durationDays < 1) return null;
  return {
    id: raw.id || [raw.origin, raw.destination, String(raw.departureAt).slice(0,10), String(raw.returnAt).slice(0,10), price, raw.airline || '', raw.transfers ?? ''].join('|'),
    origin: raw.origin,
    destination: raw.destination,
    departureAt: raw.departureAt,
    returnAt: raw.returnAt,
    price,
    currency: raw.currency || state.config.currency,
    airline: raw.airline || null,
    transfers: Number.isFinite(Number(raw.transfers)) ? Number(raw.transfers) : null,
    returnTransfers: Number.isFinite(Number(raw.returnTransfers)) ? Number(raw.returnTransfers) : null,
    foundAt: raw.foundAt || state.dealsPayload?.meta?.generatedAt || null,
    source: raw.source || 'Travelpayouts / Aviasales Data API',
    sourceEndpoint: raw.sourceEndpoint || null,
    link: raw.link || null,
    duration: raw.duration || null,
    actual: raw.actual !== false,
    metadata: raw.metadata || {}
  };
}

function normalizeHistoryObservation(raw) {
  if (!raw || raw.origin !== state.config.origin || !raw.destination) return null;
  const price = Number(raw.price);
  if (!Number.isFinite(price) || price <= 0 || !raw.departureAt || !raw.returnAt) return null;
  return {
    id: raw.id || '',
    origin: raw.origin,
    destination: raw.destination,
    departureAt: raw.departureAt,
    returnAt: raw.returnAt,
    price,
    currency: raw.currency || state.config.currency,
    airline: raw.airline || null,
    transfers: Number.isFinite(Number(raw.transfers)) ? Number(raw.transfers) : null,
    foundAt: raw.foundAt || raw.observedAt || null,
    observedAt: raw.observedAt || raw.foundAt || null,
    source: raw.source || 'Travelpayouts / Aviasales Data API',
    sourceEndpoint: raw.sourceEndpoint || null,
    link: raw.link || null
  };
}

function comparableHistory(deal) {
  const dMonth = monthKey(deal.departureAt).slice(5, 7);
  const duration = tripDays(deal);
  const route = state.history.filter(h => h.origin === deal.origin && h.destination === deal.destination && monthKey(h.departureAt).slice(5, 7) === dMonth);
  const strict = route.filter(h => {
    const hd = daysBetween(h.departureAt, h.returnAt);
    return hd != null && duration != null && Math.abs(hd - duration) <= 3;
  });
  if (strict.length >= 5) return { observations: strict, level: 'rota + mês + duração aproximada' };
  if (route.length >= 5) return { observations: route, level: 'rota + mês da viagem' };
  return { observations: route, level: null };
}

function vacationMatch(deal, vacation) {
  if (!vacation) return true;
  const dep = String(deal.departureAt).slice(0, 10);
  const ret = String(deal.returnAt).slice(0, 10);
  const days = tripDays(deal);
  return dep >= vacation.start && ret <= vacation.end && days >= Number(vacation.minDays) && days <= Number(vacation.maxDays);
}

function freshnessPoints(foundAt) {
  const hours = ageHours(foundAt);
  if (hours <= 12) return 10;
  if (hours <= 24) return 8;
  if (hours <= 48) return 6;
  if (hours <= 96) return 4;
  if (hours <= 168) return 2;
  return 0;
}

function selectedVacation() {
  const id = $('#vacationFilter')?.value;
  return state.vacations.find(v => v.id === id) || null;
}

function scoreDeals(deals) {
  const prices = deals.map(d => d.price).filter(Number.isFinite);
  return deals.map(deal => {
    const comparable = comparableHistory(deal);
    const values = comparable.observations.map(h => h.price).filter(Number.isFinite);
    const enough = values.length >= 5;
    const med = enough ? median(values) : null;
    const avg = enough ? average(values) : null;
    const min = enough ? Math.min(...values) : null;
    const max = enough ? Math.max(...values) : null;
    const discountPct = enough && med > 0 ? ((med - deal.price) / med) * 100 : null;
    const pctRank = enough ? percentileRank(values, deal.price) : null;

    let score = 0;
    if (enough) {
      const relativeDiscount = (med - deal.price) / med;
      score += clamp(relativeDiscount / 0.40, 0, 1) * 50;
      score += (1 - clamp(pctRank, 0, 1)) * 15;
    }

    const currentRank = percentileRank(prices, deal.price);
    if (currentRank != null) score += (1 - currentRank) * 5;

    if (deal.transfers === 0 && (deal.returnTransfers === 0 || deal.returnTransfers == null)) score += 10;
    else if ((deal.transfers ?? 9) <= 1 && (deal.returnTransfers == null || deal.returnTransfers <= 1)) score += 6;
    else if (deal.transfers != null) score += 2;

    const vac = selectedVacation();
    score += vac ? (vacationMatch(deal, vac) ? 10 : 0) : 5;
    score += freshnessPoints(deal.foundAt);
    score = Math.round(clamp(score, 0, 100));

    const isRecord = enough && deal.price <= min;
    let classification = { key: 'normal', label: 'Normal', icon: '•' };
    if (enough && score >= 85 && discountPct >= 25) classification = { key: 'exceptional', label: 'Achado excepcional', icon: '🔥' };
    else if (enough && score >= 72 && discountPct >= 15) classification = { key: 'excellent', label: 'Excelente oportunidade', icon: '⭐' };
    else if (enough && score >= 58 && discountPct > 5) classification = { key: 'good', label: 'Boa oportunidade', icon: '👍' };
    else if (enough && med && deal.price > med * 1.15) classification = { key: 'high', label: 'Preço alto', icon: '↗' };

    return {
      ...deal,
      score,
      history: {
        enough,
        count: values.length,
        level: comparable.level,
        median: med,
        average: avg,
        min,
        max,
        discountPct,
        percentileRank: pctRank,
        isRecord
      },
      classification
    };
  });
}

function filterDeals() {
  const vacation = selectedVacation();
  const region = $('#regionFilter').value;
  const destinationTerm = $('#destinationFilter').value.trim().toLowerCase();
  const maxPrice = Number($('#maxPriceFilter').value) || Infinity;
  const stops = $('#stopsFilter').value;
  const minDays = Number($('#minDaysFilter').value) || 0;
  const maxDays = Number($('#maxDaysFilter').value) || Infinity;
  const airline = $('#airlineFilter').value.trim().toUpperCase();
  const minScore = Number($('#minScoreFilter').value) || 0;

  return state.scoredDeals.filter(d => {
    const info = destinationInfo(d.destination);
    const duration = tripDays(d);
    if (vacation && !vacationMatch(d, vacation)) return false;
    if (region === 'Internacional' && info.countryCode === 'BR') return false;
    if (region && region !== 'Internacional' && info.region !== region) return false;
    if (destinationTerm) {
      const hay = `${d.destination} ${info.city} ${info.country}`.toLowerCase();
      if (!hay.includes(destinationTerm)) return false;
    }
    if (d.price > maxPrice) return false;
    if (stops === '0' && (d.transfers !== 0 || (d.returnTransfers != null && d.returnTransfers !== 0))) return false;
    if (stops === '1' && ((d.transfers ?? 99) > 1 || (d.returnTransfers != null && d.returnTransfers > 1))) return false;
    if (duration < minDays || duration > maxDays) return false;
    if (airline && d.airline !== airline) return false;
    if (d.score < minScore) return false;
    return true;
  });
}

function sortDeals(deals) {
  const mode = $('#sortSelect').value;
  const copy = [...deals];
  if (mode === 'price') return copy.sort((a, b) => a.price - b.price || b.score - a.score);
  if (mode === 'discount') return copy.sort((a, b) => (b.history.discountPct ?? -999) - (a.history.discountPct ?? -999) || b.score - a.score);
  if (mode === 'freshness') return copy.sort((a, b) => new Date(b.foundAt || 0) - new Date(a.foundAt || 0));
  return copy.sort((a, b) => b.score - a.score || a.price - b.price);
}

function stopsText(deal) {
  if (deal.transfers == null) return 'Não informado';
  const outbound = deal.transfers === 0 ? 'Direto' : `${deal.transfers} conexão${deal.transfers > 1 ? 'ões' : ''}`;
  if (deal.returnTransfers == null || deal.returnTransfers === deal.transfers) return outbound;
  const inbound = deal.returnTransfers === 0 ? 'direto na volta' : `${deal.returnTransfers} na volta`;
  return `${outbound} / ${inbound}`;
}

function dealLink(deal) {
  if (!deal.link) return null;
  try {
    if (/^https?:\/\//i.test(deal.link)) return deal.link;
    if (deal.link.startsWith('/')) return `https://www.aviasales.com${deal.link}`;
  } catch { }
  return null;
}

function dealCard(deal, { compact = false } = {}) {
  const info = destinationInfo(deal.destination);
  const duration = tripDays(deal);
  const link = dealLink(deal);
  const favorite = state.favorites.includes(deal.destination);
  const selected = state.compare.has(deal.id);
  const hist = deal.history;
  const total = deal.price * state.travelers;
  const discountText = hist.enough
    ? `<strong>Preço habitual observado: ${currency(hist.median, deal.currency)}</strong><span class="${hist.discountPct > 0 ? 'discount' : ''}">${hist.discountPct >= 0 ? 'Economia' : 'Diferença'} observada: ${Math.abs(hist.discountPct).toFixed(0)}%</span>${hist.isRecord ? '<span class="record">🏆 MENOR PREÇO JÁ OBSERVADO</span>' : ''}`
    : `<strong>Histórico ainda insuficiente</strong><span>${hist.count} observação${hist.count === 1 ? '' : 'ões'} comparável${hist.count === 1 ? '' : 'is'}</span>`;

  return `
    <article class="deal-card ${deal.classification.key}" data-deal-id="${escapeHtml(deal.id)}">
      <header>
        <span class="quality-badge">${deal.classification.icon} ${escapeHtml(deal.classification.label)}</span>
        <span class="score-pill">Score <strong>${deal.score}</strong>/100</span>
      </header>
      <div>
        <h3 class="route-title">${escapeHtml(state.config.originName)} → ${escapeHtml(info.city || deal.destination)}</h3>
        <div class="route-sub">${escapeHtml(deal.destination)} • ${escapeHtml(info.country)}</div>
      </div>
      <div class="dates">
        <span>${fmtDate(deal.departureAt)}</span><span>→</span><span>${fmtDate(deal.returnAt)}</span><span class="muted">• ${duration} dias</span>
      </div>
      <div class="price-block">
        <div>
          <div class="price">${currency(deal.price, deal.currency)}</div>
          <div class="per-person">por pessoa</div>
        </div>
        <div class="family-total">Estimativa do total<br><strong>${currency(total, deal.currency)}</strong> (${state.travelers} viajante${state.travelers > 1 ? 's' : ''})</div>
      </div>
      ${compact ? '' : `
      <div class="fact-grid">
        <div class="fact"><span>Conexões</span><strong>${escapeHtml(stopsText(deal))}</strong></div>
        <div class="fact"><span>Companhia</span><strong>${escapeHtml(deal.airline || 'Não informada')}</strong></div>
        <div class="fact"><span>Encontrado em</span><strong>${fmtDateTime(deal.foundAt)}</strong></div>
        <div class="fact"><span>Fonte</span><strong>${escapeHtml((deal.sourceEndpoint || 'Data API').replace('aviasales/v3/', 'v3/'))}</strong></div>
      </div>
      <div class="history-callout">${discountText}</div>`}
      <div class="card-actions">
        <button class="button ghost favorite-btn" type="button" data-action="favorite" title="Favoritar destino">${favorite ? '♥' : '♡'}</button>
        <button class="button ghost" type="button" data-action="compare">${selected ? '✓ Selecionada' : 'Comparar'}</button>
        ${link
          ? `<a class="button primary" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">VER / CONFIRMAR PREÇO</a>`
          : `<button class="button primary" type="button" disabled title="A API não forneceu um link válido">Link indisponível</button>`}
      </div>
      <div class="source-line">Preço encontrado em dados recentes em cache. Confirme o valor antes da compra.</div>
    </article>`;
}
