function attachEvents() {
  $$('.tab').forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
  $('#themeToggle').addEventListener('click', () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
  ['vacationFilter','regionFilter','destinationFilter','maxPriceFilter','stopsFilter','minDaysFilter','maxDaysFilter','airlineFilter','minScoreFilter','sortSelect'].forEach(id => {
    const el = document.getElementById(id);
    el.addEventListener(id === 'destinationFilter' || id === 'airlineFilter' || id.includes('Price') || id.includes('Days') || id.includes('Score') ? 'input' : 'change', renderDeals);
  });
  $('#resetFilters').addEventListener('click', resetFilters);

  $('#addVacationBtn').addEventListener('click', () => openVacationDialog());
  $('#closeVacation').addEventListener('click', () => $('#vacationDialog').close());
  $('#cancelVacation').addEventListener('click', () => $('#vacationDialog').close());
  $('#vacationForm').addEventListener('submit', event => {
    event.preventDefault();
    const start = $('#vacationStart').value;
    const end = $('#vacationEnd').value;
    const minDays = Number($('#vacationMin').value);
    const maxDays = Number($('#vacationMax').value);
    if (!start || !end || start > end || minDays < 1 || maxDays < minDays) {
      alert('Revise as datas e a duração mínima/máxima.');
      return;
    }
    const id = $('#vacationId').value || slugId($('#vacationName').value);
    const item = { id, name: $('#vacationName').value.trim(), start, end, minDays, maxDays };
    const idx = state.vacations.findIndex(v => v.id === id);
    if (idx >= 0) state.vacations[idx] = item; else state.vacations.push(item);
    state.vacations.sort((a,b) => a.start.localeCompare(b.start));
    saveVacations();
    $('#vacationDialog').close();
    renderVacations();
    renderDeals();
  });

  $('#addFavoriteBtn').addEventListener('click', () => {
    const code = resolveFavoriteInput($('#favoriteInput').value);
    if (!code) { alert('Destino não reconhecido. Digite um código IATA de três letras ou uma cidade presente no catálogo.'); return; }
    if (!state.favorites.includes(code)) toggleFavorite(code);
    $('#favoriteInput').value = '';
  });

  $('#clearCompare').addEventListener('click', () => { state.compare.clear(); renderCompareBar(); renderDeals(); renderFavorites(); });
  $('#openCompare').addEventListener('click', openCompareDialog);
  $('#closeCompare').addEventListener('click', () => $('#compareDialog').close());

  $('#calendarDestination').addEventListener('change', () => {
    const months = state.deals.filter(d => d.destination === $('#calendarDestination').value).map(d => monthKey(d.departureAt)).filter(Boolean).sort();
    if (months.length) $('#calendarMonth').value = months[0];
    renderCalendar();
  });
  $('#calendarMonth').addEventListener('change', renderCalendar);
  $('#calendarVacation').addEventListener('change', renderCalendar);

  $('#historyRoute').addEventListener('change', () => { $('#historyMonth').value = ''; renderHistory(); });
  $('#historyMonth').addEventListener('change', renderHistory);

  $('#travelersInput').addEventListener('change', () => {
    state.travelers = clamp(Number($('#travelersInput').value) || 1, 1, 20);
    localStorage.setItem(STORAGE.travelers, String(state.travelers));
    renderDeals(); renderFavorites(); renderSettings();
  });
  $('#reloadDataBtn').addEventListener('click', () => loadData(true));
}

async function fetchJson(path, cacheBust = false) {
  const suffix = cacheBust ? `?v=${Date.now()}` : '';
  const response = await fetch(`${path}${suffix}`, { cache: cacheBust ? 'no-store' : 'default' });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}

async function loadData(cacheBust = false) {
  try {
    const [dealsPayload, historyPayload] = await Promise.all([
      fetchJson('data/deals.json', cacheBust),
      fetchJson('data/history.json', cacheBust)
    ]);
    state.dealsPayload = dealsPayload;
    state.historyPayload = historyPayload;
    state.deals = (dealsPayload.deals || []).map(normalizeClientDeal).filter(Boolean);
    state.history = (historyPayload.observations || []).map(normalizeHistoryObservation).filter(Boolean);
    state.scoredDeals = scoreDeals(state.deals);
    renderUpdateStatus();
    renderDeals();
    renderVacations();
    renderFavorites();
    renderCalendar();
    renderHistory();
    renderSettings();
  } catch (error) {
    console.error(error);
    $('#errorBanner').textContent = `Não foi possível carregar os arquivos JSON do radar: ${error.message}`;
    $('#errorBanner').classList.remove('hidden');
  }
}

async function init() {
  try {
    state.config = await fetchJson('config.json');
    state.vacations = safeJsonParse(localStorage.getItem(STORAGE.vacations), null) || state.config.vacationPeriods || [];
    state.favorites = safeJsonParse(localStorage.getItem(STORAGE.favorites), []);
    state.travelers = clamp(Number(localStorage.getItem(STORAGE.travelers) || state.config.defaultTravelers || 1), 1, 20);

    $('#originLabel').textContent = state.config.origin;
    applyTheme(localStorage.getItem(STORAGE.theme) || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
    populateFavoriteOptions();
    renderVacations();
    attachEvents();
    await loadData();
  } catch (error) {
    console.error(error);
    document.body.innerHTML = `<main class="shell"><div class="banner danger"><strong>Falha ao iniciar o Radar de Férias POA.</strong><br>${escapeHtml(error.message)}</div></main>`;
  }
}

document.addEventListener('DOMContentLoaded', init);
