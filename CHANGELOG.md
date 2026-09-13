# Changelog

Todas as mudanças relevantes do Radar de Férias POA serão registradas neste arquivo.

## [1.0.0] - 2026-09-13

### Primeiro MVP funcional

- publicação do Radar no GitHub Pages;
- coleta automática via GitHub Actions duas vezes ao dia;
- integração segura com Travelpayouts / Aviasales Data API via `TRAVELPAYOUTS_TOKEN`;
- coleta de preços saindo de Porto Alegre (POA);
- histórico próprio de evidências de preço;
- Opportunity Score de 0 a 100;
- comparação com mediana histórica quando há observações suficientes;
- níveis de evidência inicial, crescente e consolidada;
- filtros por férias, destino, região, preço, duração, conexões, companhia e score;
- calendário de preços observados;
- favoritos em `localStorage`;
- comparação de até três oportunidades;
- estimativa de custo para múltiplos viajantes;
- nomes amigáveis para Azul (AD), GOL (G3) e LATAM (LA);
- atalhos para pesquisar diretamente nos sites oficiais dessas companhias;
- link para confirmação no Aviasales;
- suporte a tema claro/escuro;
- tratamento de falhas parciais da coleta;
- documentação de segurança, limitações do cache e funcionamento do score.

### Conceito da versão

O Radar não trata o preço coletado como tarifa garantida. Ele o apresenta como **evidência recente de preço**:

> Existe evidência recente de que esta viagem esteve disponível perto deste valor. Use como referência e confirme antes de comprar.
