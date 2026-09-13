# ✈️ Radar de Férias POA

[![Atualizar radar de passagens](https://github.com/ramkar987/radar-ferias-poa/actions/workflows/update-deals.yml/badge.svg)](https://github.com/ramkar987/radar-ferias-poa/actions/workflows/update-deals.yml)
[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-online-2ea44f?logo=github)](https://ramkar987.github.io/radar-ferias-poa/)
[![JavaScript](https://img.shields.io/badge/JavaScript-vanilla-F7DF1E?logo=javascript&logoColor=111)](https://github.com/ramkar987/radar-ferias-poa)

**Radar de evidências recentes de preço para descobrir quando vale a pena procurar uma passagem saindo de Porto Alegre.**

> Existe evidência recente de que esta viagem esteve disponível perto deste valor. Use como referência e confirme antes de comprar.

### 👉 [Abrir o Radar de Férias POA](https://ramkar987.github.io/radar-ferias-poa/)

---

## O que é

O Radar não é uma agência de viagens e não promete disponibilidade em tempo real. Ele coleta preços recentes da **Travelpayouts / Aviasales Data API**, guarda um histórico próprio e tenta responder perguntas como:

- **Para onde dá para viajar pagando pouco?**
- **Esse preço está abaixo do que normalmente observamos?**
- **Existe alguma evidência de um preço fora do padrão?**
- **Vale a pena abrir Azul, GOL, LATAM ou Aviasales agora para confirmar?**

A ideia central é simples: o Radar encontra **sinais de oportunidade**. A compra deve ser confirmada no momento da busca.

---

## Principais recursos

- origem padrão: **Porto Alegre (POA)**;
- busca de ida e volta em **BRL**;
- ranking por **Opportunity Score**;
- comparação histórica por rota, mês e duração aproximada;
- indicador de **evidência inicial, crescente ou consolidada**;
- menor preço observado no histórico do Radar;
- filtros por destino, região, preço, duração, conexões, companhia e score;
- períodos de férias editáveis;
- favoritos salvos no navegador;
- comparação de até 3 viagens;
- calendário de preços coletados;
- estimativa familiar por quantidade de viajantes;
- atalhos para pesquisar diretamente em **Azul, GOL e LATAM** quando a companhia é identificada;
- atualização automática via **GitHub Actions**;
- publicação gratuita pelo **GitHub Pages**.

---

## Como usar

1. Abra o [Radar de Férias POA](https://ramkar987.github.io/radar-ferias-poa/).
2. Escolha um período de férias ou deixe **Qualquer período**.
3. Use os filtros ou simplesmente navegue pelos melhores sinais encontrados.
4. Leia o valor como **preço de referência**, não como tarifa garantida.
5. Clique em **VER NO AVIASALES** para conferir o mercado.
6. Quando disponível, use também **Pesquisar na Azul / GOL / LATAM** para comparar com a companhia aérea.

Exemplo de leitura correta:

> **Preço de referência: R$ 847**  
> Existe evidência recente de que esta viagem esteve disponível perto de R$ 847 por pessoa. Confirme antes de comprar.

---

## Atualização automática

O GitHub Action em `.github/workflows/update-deals.yml` executa automaticamente duas vezes por dia:

- **06:17** — horário de Brasília/Porto Alegre;
- **18:17** — horário de Brasília/Porto Alegre.

Também pode ser executado manualmente em:

**Actions → Atualizar radar de passagens → Run workflow**

O fluxo é:

```text
Travelpayouts / Aviasales Data API
              ↓
        GitHub Actions
              ↓
   scripts/fetch-deals.mjs
        ↓            ↓
 data/deals.json  data/history.json
        \            /
         GitHub Pages
```

---

## Opportunity Score

O `Opportunity Score` vai de **0 a 100** e combina:

| Componente | Peso máximo |
|---|---:|
| Preço atual vs. mediana histórica comparável | 50 |
| Percentil dentro do histórico comparável | 15 |
| Preço absoluto perante as ofertas atuais | 5 |
| Voo direto / quantidade de conexões | 10 |
| Adequação ao período de férias | 10 |
| Atualidade do preço | 10 |
| **Total** | **100** |

O histórico só ganha peso completo quando existem observações comparáveis suficientes. Assim, ausência de histórico não vira vantagem artificial.

### Classificação visual

- 🔥 **Achado excepcional**
- ⭐ **Excelente oportunidade**
- 👍 **Boa oportunidade**
- • **Normal**
- ↗ **Preço alto**

O score mede **sinal de oportunidade**. O nível de evidência mede **quanto histórico próprio já acumulamos para sustentar essa leitura**.

---

## Fonte dos dados

O projeto usa a **Aviasales Data API da Travelpayouts**.

Endpoints utilizados pelo coletor:

- `aviasales/v3/prices_for_dates`
- `aviasales/v3/get_special_offers`
- `aviasales/v3/get_latest_prices`
- `aviasales/v3/grouped_prices`

Na interface, a fonte é apresentada de forma amigável como **Travelpayouts / Aviasales**. O nome técnico do endpoint é mantido apenas para rastreabilidade.

Documentação oficial:

- https://support.travelpayouts.com/hc/en-us/articles/203956163-Aviasales-Data-API
- https://support.travelpayouts.com/hc/en-us/articles/4402565416594-API-rate-limits
- https://travelpayouts.github.io/slate/

---

## Limitação importante

Os preços da Data API são baseados em **dados recentes em cache**, e não em uma reserva garantida em tempo real.

Isso significa que:

- um preço pode já ter mudado;
- uma combinação pode desaparecer;
- uma rota pode existir mesmo que não apareça no cache;
- o menor preço encontrado pode estar disponível em uma agência diferente do site oficial da companhia;
- bagagem, assento, regras tarifárias e outras condições precisam ser confirmados antes da compra.

Por isso, o Radar deve ser entendido como:

**detectar evidência → encontrar datas promissoras → confirmar no mercado → comprar onde fizer mais sentido.**

---

## Segurança

O token da Travelpayouts fica somente no GitHub Secret:

```text
TRAVELPAYOUTS_TOKEN
```

Ele não é enviado ao navegador e não é salvo em `config.json`, `data/*.json` ou JavaScript público.

Configuração no GitHub:

**Settings → Secrets and variables → Actions → New repository secret**

---

## Estrutura do projeto

```text
radar-ferias-poa/
├── index.html
├── style.css
├── app.js
├── app-core.js
├── app-ui.js
├── app-airlines.js
├── app-main.js
├── config.json
├── .nojekyll
├── data/
│   ├── deals.json
│   └── history.json
├── scripts/
│   └── fetch-deals.mjs
└── .github/
    └── workflows/
        └── update-deals.yml
```

### Arquivos principais

| Arquivo | Função |
|---|---|
| `index.html` | estrutura da interface |
| `style.css` | visual responsivo e temas |
| `app-core.js` | normalização, score e regras de negócio |
| `app-ui.js` | renderização, filtros, favoritos, calendário e histórico |
| `app-airlines.js` | nomes amigáveis e atalhos para companhias |
| `app-main.js` | inicialização e eventos |
| `config.json` | origem, períodos, destinos e parâmetros |
| `scripts/fetch-deals.mjs` | coleta e normalização da API |
| `data/deals.json` | fotografia mais recente do Radar |
| `data/history.json` | histórico acumulado |

---

## Configurações principais

Em `config.json` é possível alterar, entre outros itens:

```json
{
  "origin": "POA",
  "currency": "BRL",
  "staleAfterHours": 36,
  "defaultTravelers": 3,
  "collection": {
    "horizonMonths": 18,
    "historyRetentionDays": 540,
    "maxHistoryObservations": 50000
  }
}
```

Para mudar a origem, altere `origin` e `originName`; a coleta seguinte passará a usar o novo aeroporto.

---

## Executar localmente

Como a aplicação lê JSON via `fetch()`, rode um servidor HTTP local:

```bash
python3 -m http.server 8000
```

Depois abra:

```text
http://localhost:8000
```

Para executar o coletor localmente com Node.js 20+:

```bash
TRAVELPAYOUTS_TOKEN="seu_token" node scripts/fetch-deals.mjs
```

Nunca faça commit do token.

---

## Status do projeto

**MVP funcional — v1.0.0**

A primeira versão já possui coleta automática, histórico próprio, Opportunity Score, filtros, férias, calendário, favoritos, comparação e conferência em metabuscador/companhias.

Próximas ideias naturais:

- alertas automáticos de novos recordes;
- notificação por Telegram ou e-mail;
- gráfico temporal por rota;
- comparação de aeroportos alternativos;
- segundo provedor de dados;
- alertas personalizados por destino e preço máximo.

---

Feito para responder uma pergunta prática:

> **“Tem evidência de que vale a pena procurar essa viagem agora?”**
