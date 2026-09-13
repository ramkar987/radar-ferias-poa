'use strict';

// Sites oficiais usados apenas para conferência direta. Mantemos URLs estáveis
// e não inventamos deep links com rota/data quando a companhia não publica um
// formato estável para isso.
const OFFICIAL_AIRLINES = {
  AD: { name: 'Azul', url: 'https://www.azul.com.br/' },
  G3: { name: 'GOL', url: 'https://www.voegol.com.br/' },
  LA: { name: 'LATAM', url: 'https://www.latamairlines.com/br/pt' }
};

// Estilos pequenos e autocontidos desta camada de evidência.
(() => {
  const style = document.createElement('style');
  style.textContent = `
    .evidence-line {
      display: grid;
      gap: 3px;
      padding: 10px 11px;
      border: 1px solid color-mix(in srgb, var(--primary) 25%, var(--border));
      border-radius: 10px;
      background: color-mix(in srgb, var(--primary) 5%, var(--surface));
      font-size: .78rem;
      line-height: 1.4;
    }
    .evidence-line strong { font-size: .8rem; }
    .evidence-line span { color: var(--text); }
    .evidence-line small { color: var(--muted); }
    .evidence-line.growing { border-color: color-mix(in srgb, var(--good) 32%, var(--border)); }
    .evidence-line.consolidated { border-color: color-mix(in srgb, var(--good) 55%, var(--border)); }
    .airline-direct { text-align: center; }
    .per-person { max-width: 180px; }
  `;
  document.head.appendChild(style);
})();

// Deixa claro, já no topo, que o produto encontra sinais de preço e não vende
// nem garante a tarifa exibida.
(() => {
  const tagline = document.querySelector('.brand-wrap p');
  if (tagline) tagline.textContent = 'Radar de evidências recentes de preço para saber quando vale procurar.';

  const toolbarHint = document.querySelector('.results-toolbar .muted');
  if (toolbarHint) toolbarHint.textContent = '• preço de referência por pessoa • ida e volta • confirme antes de comprar';

  document.querySelectorAll('.metric-label').forEach(label => {
    if (label.textContent.includes('Menor preço encontrado')) label.textContent = '💰 Menor referência encontrada';
  });
})();

function officialAirline(deal) {
  return OFFICIAL_AIRLINES[String(deal?.airline || '').toUpperCase()] || null;
}

function airlineDisplayName(deal) {
  const code = String(deal?.airline || '').toUpperCase();
  if (!code) return 'Não informada';
  const airline = officialAirline(deal);
  return airline ? `${airline.name} (${code})` : code;
}

// Conta quantas coletas independentes contribuíram para a base comparável.
// Observações da mesma execução têm timestamps praticamente iguais; agrupamos
// por minuto para não confundir vários preços da mesma coleta com vários dias
// de acompanhamento.
function comparableCollectionCount(deal) {
  try {
    const observations = comparableHistory(deal)?.observations || [];
    const runs = new Set(
      observations
        .map(item => item.observedAt || item.foundAt)
        .filter(Boolean)
        .map(value => String(value).slice(0, 16))
    );
    return Math.max(1, runs.size);
  } catch {
    return 1;
  }
}

function evidenceMaturity(deal) {
  const collections = comparableCollectionCount(deal);
  const comparableCount = Number(deal?.history?.count || 0);
  const hours = ageHours(deal?.foundAt);

  if (collections >= 5 && comparableCount >= 10 && hours <= 72) {
    return { key: 'consolidated', label: 'Evidência consolidada', collections };
  }
  if (collections >= 2 && comparableCount >= 5 && hours <= 168) {
    return { key: 'growing', label: 'Evidência crescente', collections };
  }
  return { key: 'initial', label: 'Evidência inicial', collections };
}

function evidenceSentence(deal) {
  return `Existe evidência recente de que esta viagem esteve disponível perto de ${currency(deal.price, deal.currency)} por pessoa. Use este valor como referência e confirme antes de comprar.`;
}

// Envolve o card-base para acrescentar a camada de interpretação do Radar:
// preço de referência, maturidade da evidência, nome amigável da companhia e
// atalho para o site oficial quando conhecido.
const baseDealCard = dealCard;
dealCard = function dealCardWithEvidence(deal, options = {}) {
  let html = baseDealCard(deal, options);
  const airline = officialAirline(deal);
  const maturity = evidenceMaturity(deal);
  const rawAirline = escapeHtml(deal.airline || 'Não informada');
  const friendlyAirline = escapeHtml(airlineDisplayName(deal));

  // Companhia amigável: "Azul (AD)" em vez de apenas "AD".
  html = html.replace(
    `<span>Companhia</span><strong>${rawAirline}</strong>`,
    `<span>Companhia</span><strong>${friendlyAirline}</strong>`
  );

  // O valor do cache é referência de busca, não uma tarifa garantida.
  html = html.replace(
    '<div class="per-person">por pessoa</div>',
    '<div class="per-person">preço de referência por pessoa</div>'
  );

  // Linguagem mais precisa enquanto o histórico próprio ainda está crescendo.
  html = html
    .replace('Preço habitual observado:', 'Mediana das evidências comparáveis:')
    .replace('🏆 MENOR PREÇO JÁ OBSERVADO', '🏆 MENOR PREÇO OBSERVADO NO RADAR')
    .replace('Histórico ainda insuficiente', 'Base comparável ainda pequena')
    .replace('VER / CONFIRMAR PREÇO', 'VER NO AVIASALES');

  // Substitui o rodapé genérico por uma explicação explícita do propósito do Radar.
  const oldSource = '<div class="source-line">Preço encontrado em dados recentes em cache. Confirme o valor antes da compra.</div>';
  const collectionText = `${maturity.collections} coleta${maturity.collections === 1 ? '' : 's'} comparável${maturity.collections === 1 ? '' : 'is'}`;
  const newSource = `<div class="evidence-line ${maturity.key}"><strong>🔎 ${escapeHtml(maturity.label)}</strong><span>${escapeHtml(evidenceSentence(deal))}</span><small>${escapeHtml(collectionText)} • preço cacheado, não garantido</small></div>`;
  html = html.replace(oldSource, newSource);

  // Atalho para conferir diretamente na companhia brasileira identificada.
  if (airline) {
    const button = `<a class="button ghost airline-direct" href="${escapeHtml(airline.url)}" target="_blank" rel="noopener noreferrer" title="Pesquisar esta viagem diretamente no site oficial da ${escapeHtml(airline.name)}">✈ Pesquisar na ${escapeHtml(airline.name)}</a>`;
    const marker = '\n      </div>\n      <div class="evidence-line';
    const pos = html.lastIndexOf(marker);
    if (pos >= 0) html = `${html.slice(0, pos)}\n        ${button}${html.slice(pos)}`;
  }

  return html;
};
