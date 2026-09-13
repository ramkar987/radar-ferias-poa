'use strict';

// Links oficiais para conferência direta. Mantemos apenas URLs estáveis das
// companhias, sem inventar deep links com rota/data quando não há formato
// público e estável documentado.
const OFFICIAL_AIRLINES = {
  AD: { name: 'Azul', url: 'https://www.azul.com.br/' },
  G3: { name: 'GOL', url: 'https://www.voegol.com.br/' },
  LA: { name: 'LATAM', url: 'https://www.latamairlines.com/br/pt' }
};

function officialAirline(deal) {
  return OFFICIAL_AIRLINES[String(deal?.airline || '').toUpperCase()] || null;
}

// Acrescenta ao card um atalho para pesquisar a mesma viagem diretamente na
// companhia. O botão abre o buscador oficial; o usuário confirma rota, datas e
// passageiros no site da empresa aérea.
const baseDealCard = dealCard;
dealCard = function dealCardWithOfficialAirline(deal, options = {}) {
  let html = baseDealCard(deal, options);
  const airline = officialAirline(deal);
  if (!airline) return html;

  const button = `<a class="button ghost airline-direct" href="${escapeHtml(airline.url)}" target="_blank" rel="noopener noreferrer" title="Pesquisar esta viagem diretamente no site oficial da ${escapeHtml(airline.name)}">✈ Pesquisar na ${escapeHtml(airline.name)}</a>`;
  const marker = '\n      </div>\n      <div class="source-line">';
  const pos = html.lastIndexOf(marker);
  if (pos >= 0) html = `${html.slice(0, pos)}\n        ${button}${html.slice(pos)}`;
  return html;
};
