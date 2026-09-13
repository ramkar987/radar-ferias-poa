function renderDeals() {
  state.scoredDeals = scoreDeals(state.deals);
  const deals = sortDeals(filterDeals());
  $('#resultCount').textContent = `${deals.length} oportunidade${deals.length === 1 ? '' : 's'}`;
  $('#dealsGrid').innerHTML = deals.map(d => dealCard(d)).join('');
  $('#emptyDeals').classList.toggle('hidden', deals.length > 0);
  bindDealCardActions($('#dealsGrid'));
  renderMetrics();
}

function bindDealCardActions(root) {
  root.querySelectorAll('[data-action="favorite"]').forEach(btn => btn.addEventListener('click', () => {
    const id = btn.closest('[data-deal-id]').dataset.dealId;
    const deal = state.scoredDeals.find(d => d.id === id);
    if (deal) toggleFavorite(deal.destination);
  }));
  root.querySelectorAll('[data-action="compare"]').forEach(btn => btn.addEventListener('click', () => {
    const id = btn.closest('[data-deal-id]').dataset.dealId;
    toggleCompare(id);
  }));
}

function renderMetrics() {
  const scored = [...state.scoredDeals].sort((a, b) => b.score - a.score || a.price - b.price);
  const best = scored[0];
  const cheapest = [...state.scoredDeals].sort((a, b) => a.price - b.price)[0];
  const discounts = state.scoredDeals.filter(d => d.history.enough && d.history.discountPct != null).sort((a, b) => b.history.discountPct - a.history.discountPct);
  const topDiscount = discounts[0];

  $('#metricBest').textContent = best ? destinationInfo(best.destination).city : '—';
  $('#metricBestSub').textContent = best ? `Score ${best.score}/100 • ${currency(best.price, best.currency)}` : 'Aguardando dados';
  $('#metricLowest').textContent = cheapest ? currency(cheapest.price, cheapest.currency) : '—';
  $('#metricLowestSub').textContent = cheapest ? destinationLabel(cheapest.destination) : 'Aguardando dados';
  $('#metricDiscount').textContent = topDiscount ? `${topDiscount.history.discountPct.toFixed(0)}%` : '—';
  $('#metricDiscountSub').textContent = topDiscount ? `${destinationLabel(topDiscount.destination)} vs. mediana` : 'Requer histórico comparável';
}

function renderUpdateStatus() {
  const generatedAt = state.dealsPayload?.meta?.generatedAt;
  $('#updateStatus').textContent = generatedAt ? `Última atualização: ${fmtDateTime(generatedAt)}` : 'Última atualização: ainda não executada';
  const staleHours = Number(state.config.staleAfterHours || 36);
  const stale = generatedAt && ageHours(generatedAt) > staleHours;
  $('#staleBanner').classList.toggle('hidden', !stale);
  if (stale) $('#staleBanner').textContent = `⚠️ Dados antigos: a última atualização ocorreu há mais de ${staleHours} horas. Os preços podem estar desatualizados.`;

  const errors = state.dealsPayload?.meta?.errors || [];
  $('#errorBanner').classList.toggle('hidden', errors.length === 0);
  if (errors.length) {
    $('#errorBanner').textContent = `Algumas fontes falharam na última coleta (${errors.length}). O radar continuou com os dados disponíveis. Consulte o workflow do GitHub Actions para detalhes resumidos.`;
  }
}

function populateVacationSelects() {
  const options = [`<option value="">Qualquer período</option>`, ...state.vacations.map(v => `<option value="${escapeHtml(v.id)}">${escapeHtml(v.name)}</option>`)].join('');
  const current = $('#vacationFilter').value;
  $('#vacationFilter').innerHTML = options;
  if (state.vacations.some(v => v.id === current)) $('#vacationFilter').value = current;

  const calCurrent = $('#calendarVacation').value;
  $('#calendarVacation').innerHTML = options;
  if (state.vacations.some(v => v.id === calCurrent)) $('#calendarVacation').value = calCurrent;
}

function renderVacations() {
  $('#vacationsList').innerHTML = state.vacations.map(v => `
    <article class="card vacation-row" data-vacation-id="${escapeHtml(v.id)}">
      <div>
        <h3>${escapeHtml(v.name)}</h3>
        <div class="vacation-meta">${fmtDate(v.start)} até ${fmtDate(v.end)} • viagem de ${v.minDays} a ${v.maxDays} dias</div>
      </div>
      <div class="vacation-actions">
        <button class="button ghost small-btn" data-action="use-vacation" type="button">Ver achados</button>
        <button class="button ghost small-btn" data-action="edit-vacation" type="button">Editar</button>
        <button class="button ghost small-btn" data-action="delete-vacation" type="button">Excluir</button>
      </div>
    </article>`).join('');

  populateVacationSelects();
  $$('#vacationsList [data-action]').forEach(btn => btn.addEventListener('click', () => {
    const id = btn.closest('[data-vacation-id]').dataset.vacationId;
    if (btn.dataset.action === 'use-vacation') {
      switchTab('achados');
      $('#vacationFilter').value = id;
      renderDeals();
    } else if (btn.dataset.action === 'edit-vacation') {
      openVacationDialog(state.vacations.find(v => v.id === id));
    } else if (btn.dataset.action === 'delete-vacation') {
      state.vacations = state.vacations.filter(v => v.id !== id);
      saveVacations();
      renderVacations();
      renderDeals();
      renderCalendar();
    }
  }));
}

function saveVacations() {
  localStorage.setItem(STORAGE.vacations, JSON.stringify(state.vacations));
}

function openVacationDialog(vacation = null) {
  $('#vacationDialogTitle').textContent = vacation ? 'Editar período' : 'Novo período';
  $('#vacationId').value = vacation?.id || '';
  $('#vacationName').value = vacation?.name || '';
  $('#vacationStart').value = vacation?.start || '';
  $('#vacationEnd').value = vacation?.end || '';
  $('#vacationMin').value = vacation?.minDays || 5;
  $('#vacationMax').value = vacation?.maxDays || 15;
  $('#vacationDialog').showModal();
}

function slugId(text) {
  return `${String(text).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${Date.now().toString(36)}`;
}

function toggleFavorite(code) {
  code = String(code || '').toUpperCase();
  if (!code) return;
  state.favorites = state.favorites.includes(code) ? state.favorites.filter(c => c !== code) : [...state.favorites, code];
  localStorage.setItem(STORAGE.favorites, JSON.stringify(state.favorites));
  renderDeals();
  renderFavorites();
}

function renderFavorites() {
  const chips = state.favorites.map(code => `<span class="chip">${escapeHtml(destinationLabel(code))}<button type="button" data-code="${escapeHtml(code)}" aria-label="Remover ${escapeHtml(code)}">✕</button></span>`).join('');
  $('#favoritesChips').innerHTML = chips;
  $$('#favoritesChips button').forEach(btn => btn.addEventListener('click', () => toggleFavorite(btn.dataset.code)));

  const byDestination = new Map();
  state.scoredDeals.filter(d => state.favorites.includes(d.destination)).forEach(d => {
    const prev = byDestination.get(d.destination);
    if (!prev || d.score > prev.score || (d.score === prev.score && d.price < prev.price)) byDestination.set(d.destination, d);
  });
  const deals = [...byDestination.values()].sort((a, b) => b.score - a.score || a.price - b.price);
  $('#favoritesGrid').innerHTML = deals.map(d => dealCard(d, { compact: true })).join('');
  $('#favoritesEmpty').classList.toggle('hidden', deals.length > 0);
  bindDealCardActions($('#favoritesGrid'));
}

function populateFavoriteOptions() {
  const entries = Object.entries(state.config.airportCatalog || {}).sort((a, b) => a[1].city.localeCompare(b[1].city, 'pt-BR'));
  $('#favoriteOptions').innerHTML = entries.map(([code, info]) => `<option value="${escapeHtml(code)}">${escapeHtml(info.city)} — ${escapeHtml(info.country)}</option>`).join('');
}

function resolveFavoriteInput(value) {
  const term = value.trim().toLowerCase();
  if (!term) return null;
  if (/^[a-z]{3}$/i.test(term)) return term.toUpperCase();
  const match = Object.entries(state.config.airportCatalog || {}).find(([code, info]) => `${code} ${info.city} ${info.country}`.toLowerCase().includes(term));
  return match?.[0] || null;
}

function toggleCompare(id) {
  if (state.compare.has(id)) state.compare.delete(id);
  else if (state.compare.size < 3) state.compare.add(id);
  else return;
  renderCompareBar();
  renderDeals();
  renderFavorites();
}

function renderCompareBar() {
  const count = state.compare.size;
  $('#compareBar').classList.toggle('hidden', count === 0);
  $('#compareCount').textContent = `${count}/3 selecionada${count === 1 ? '' : 's'}`;
  $('#openCompare').disabled = count < 2;
}

function openCompareDialog() {
  const deals = [...state.compare].map(id => state.scoredDeals.find(d => d.id === id)).filter(Boolean);
  $('#compareContent').innerHTML = deals.map(d => {
    const info = destinationInfo(d.destination);
    return `<article class="compare-column">
      <h3>${escapeHtml(info.city)} <span class="muted">(${escapeHtml(d.destination)})</span></h3>
      ${compareRow('Datas', `${fmtDate(d.departureAt)} → ${fmtDate(d.returnAt)}`)}
      ${compareRow('Duração', `${tripDays(d)} dias`)}
      ${compareRow('Preço por pessoa', currency(d.price, d.currency))}
      ${compareRow('Estimativa total', `${currency(d.price * state.travelers, d.currency)} para ${state.travelers}`)}
      ${compareRow('Conexões', stopsText(d))}
      ${compareRow('Preço histórico', d.history.enough ? currency(d.history.median, d.currency) : 'Histórico insuficiente')}
      ${compareRow('Economia observada', d.history.enough ? `${d.history.discountPct.toFixed(0)}%` : '—')}
      ${compareRow('Opportunity Score', `${d.score}/100`)}
    </article>`;
  }).join('');
  $('#compareDialog').showModal();
}

function compareRow(label, value) {
  return `<div class="compare-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function calendarDeals() {
  const dest = $('#calendarDestination').value;
  const month = $('#calendarMonth').value;
  const vacId = $('#calendarVacation').value;
  const vac = state.vacations.find(v => v.id === vacId) || null;
  return state.scoredDeals.filter(d => d.destination === dest && monthKey(d.departureAt) === month && (!vac || vacationMatch(d, vac)));
}

function populateCalendarControls() {
  const destinations = [...new Set(state.deals.map(d => d.destination))].sort((a, b) => destinationLabel(a).localeCompare(destinationLabel(b), 'pt-BR'));
  const currentDest = $('#calendarDestination').value;
  $('#calendarDestination').innerHTML = destinations.map(code => `<option value="${escapeHtml(code)}">${escapeHtml(destinationLabel(code))}</option>`).join('');
  if (destinations.includes(currentDest)) $('#calendarDestination').value = currentDest;
  else if (destinations.length) $('#calendarDestination').value = destinations[0];

  if (!$('#calendarMonth').value) {
    const months = state.deals.filter(d => d.destination === $('#calendarDestination').value).map(d => monthKey(d.departureAt)).filter(Boolean).sort();
    $('#calendarMonth').value = months[0] || new Date().toISOString().slice(0, 7);
  }
}

function renderCalendar() {
  populateCalendarControls();
  const deals = calendarDeals();
  const month = $('#calendarMonth').value;
  $('#calendarGrid').innerHTML = '';
  $('#calendarDetails').classList.add('hidden');
  $('#calendarEmpty').classList.toggle('hidden', deals.length > 0);
  if (!month || !deals.length) return;

  const [year, mon] = month.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  const firstDow = new Date(Date.UTC(year, mon - 1, 1)).getUTCDay();
  const week = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const byDay = new Map();
  deals.forEach(d => {
    const day = Number(String(d.departureAt).slice(8,10));
    const arr = byDay.get(day) || [];
    arr.push(d);
    byDay.set(day, arr);
  });

  let html = week.map(w => `<div class="calendar-head">${w}</div>`).join('');
  for (let i = 0; i < firstDow; i++) html += `<button class="calendar-day empty" type="button" disabled></button>`;
  for (let day = 1; day <= daysInMonth; day++) {
    const dayDeals = (byDay.get(day) || []).sort((a, b) => a.price - b.price);
    const best = dayDeals[0];
    html += `<button class="calendar-day ${best ? 'has-price' : 'empty'}" type="button" ${best ? `data-day="${day}"` : 'disabled'}>
      <span class="day-num">${day}</span>
      ${best ? `<span class="day-price">${currency(best.price, best.currency)}</span><span class="day-count">${dayDeals.length} opção${dayDeals.length === 1 ? '' : 'ões'}</span>` : ''}
    </button>`;
  }
  $('#calendarGrid').innerHTML = html;
  $$('#calendarGrid [data-day]').forEach(btn => btn.addEventListener('click', () => renderCalendarDetails(Number(btn.dataset.day), byDay.get(Number(btn.dataset.day)) || [])));
}

function renderCalendarDetails(day, deals) {
  const sorted = [...deals].sort((a,b) => a.price - b.price).slice(0, 12);
  const box = $('#calendarDetails');
  box.innerHTML = `<h3>Saída em ${String(day).padStart(2,'0')}/${$('#calendarMonth').value.split('-')[1]}</h3>
    <p class="muted">Boas opções de volta entre os preços coletados:</p>
    <div class="return-options">${sorted.map(d => `<div class="return-option"><span>Volta ${fmtDate(d.returnAt)} • ${tripDays(d)} dias • ${escapeHtml(stopsText(d))}</span><strong>${currency(d.price, d.currency)}</strong></div>`).join('')}</div>`;
  box.classList.remove('hidden');
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function populateHistoryControls() {
  const routes = [...new Set(state.history.map(h => `${h.origin}-${h.destination}`))].sort();
  const current = $('#historyRoute').value;
  $('#historyRoute').innerHTML = routes.map(route => {
    const dest = route.split('-')[1];
    return `<option value="${escapeHtml(route)}">${escapeHtml(state.config.origin)} → ${escapeHtml(destinationLabel(dest))}</option>`;
  }).join('');
  if (routes.includes(current)) $('#historyRoute').value = current;

  const route = $('#historyRoute').value;
  const months = [...new Set(state.history.filter(h => `${h.origin}-${h.destination}` === route).map(h => monthKey(h.departureAt).slice(5,7)).filter(Boolean))].sort();
  const monthNames = ['','Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const monthCurrent = $('#historyMonth').value;
  $('#historyMonth').innerHTML = `<option value="">Todos</option>${months.map(m => `<option value="${m}">${monthNames[Number(m)]}</option>`).join('')}`;
  if (months.includes(monthCurrent)) $('#historyMonth').value = monthCurrent;
}

function renderHistory() {
  populateHistoryControls();
  const route = $('#historyRoute').value;
  const month = $('#historyMonth').value;
  let observations = state.history.filter(h => `${h.origin}-${h.destination}` === route);
  if (month) observations = observations.filter(h => monthKey(h.departureAt).slice(5,7) === month);
  observations.sort((a,b) => new Date(b.foundAt || b.observedAt || 0) - new Date(a.foundAt || a.observedAt || 0));

  const values = observations.map(o => o.price);
  const stats = values.length ? [
    ['Menor preço', currency(Math.min(...values))],
    ['Mediana', currency(median(values))],
    ['Média', currency(average(values))]
  ] : [];
  $('#historyStats').innerHTML = stats.map(([label, value]) => `<article class="metric-card"><span class="metric-label">${label}</span><strong>${value}</strong><small>${observations.length} observação${observations.length === 1 ? '' : 'ões'}</small></article>`).join('');
  $('#historyTable').innerHTML = observations.slice(0, 500).map(o => `<tr>
    <td>${fmtDateTime(o.foundAt || o.observedAt)}</td>
    <td>${fmtDate(o.departureAt)}</td>
    <td>${fmtDate(o.returnAt)}</td>
    <td><strong>${currency(o.price, o.currency)}</strong></td>
    <td>${escapeHtml(o.airline || '—')}</td>
    <td>${o.transfers == null ? '—' : o.transfers}</td>
    <td>${escapeHtml((o.sourceEndpoint || o.source || 'Data API').replace('aviasales/v3/', 'v3/'))}</td>
  </tr>`).join('');
  $('#historyEmpty').classList.toggle('hidden', observations.length > 0);
  $('.table-wrap').classList.toggle('hidden', observations.length === 0);
}

function renderSettings() {
  $('#travelersInput').value = state.travelers;
  $('#settingsOrigin').textContent = `${state.config.origin} — ${state.config.originName}`;
  $('#dataSummary').innerHTML = `${state.deals.length} ofertas atuais<br>${state.history.length} observações históricas<br>Moeda: ${escapeHtml(state.config.currency)}`;
}

function applyTheme(theme) {
  const finalTheme = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = finalTheme;
  $('#themeToggle').textContent = finalTheme === 'dark' ? '☀️' : '🌙';
  localStorage.setItem(STORAGE.theme, finalTheme);
}

function switchTab(name) {
  $$('.tab').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === name));
  $$('.tab-panel').forEach(panel => panel.classList.toggle('active', panel.id === `tab-${name}`));
  if (name === 'calendario') renderCalendar();
  if (name === 'favoritos') renderFavorites();
  if (name === 'historico') renderHistory();
  if (name === 'configuracoes') renderSettings();
}

function resetFilters() {
  $('#vacationFilter').value = '';
  $('#regionFilter').value = '';
  $('#destinationFilter').value = '';
  $('#maxPriceFilter').value = '';
  $('#stopsFilter').value = '';
  $('#minDaysFilter').value = '';
  $('#maxDaysFilter').value = '';
  $('#airlineFilter').value = '';
  $('#minScoreFilter').value = '0';
  $('#sortSelect').value = 'score';
  renderDeals();
}
