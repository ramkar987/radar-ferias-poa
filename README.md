# ✈ Radar de Férias POA

Aplicação web estática para encontrar **passagens aéreas baratas e oportunidades fora do padrão saindo de Porto Alegre (POA)**, com foco especial em férias escolares e períodos flexíveis.

A pergunta principal não é “quanto custa POA → X?”, mas sim:

> **Para onde podemos viajar nas férias gastando pouco?**

E também:

> **Existe alguma passagem excepcionalmente barata saindo de Porto Alegre agora?**

O projeto foi desenhado para rodar gratuitamente no **GitHub Pages**, sem servidor próprio. Um **GitHub Action** consulta a Travelpayouts/Aviasales Data API usando um Secret privado e grava apenas os resultados públicos em arquivos JSON estáticos.

---

## O que este MVP faz

- mostra as melhores oportunidades encontradas saindo de **POA**;
- trabalha inicialmente com **ida e volta** e **BRL**; quando o endpoint permite filtrar classe, usa **econômica** (`trip_class=0`);
- permite cadastrar vários períodos de férias no navegador;
- filtra por destino, região, preço, duração, conexões, companhia e Opportunity Score;
- possui busca do tipo **“não sei para onde ir”**: basta deixar o destino em branco;
- cria um **histórico próprio** de preços a cada execução do GitHub Action;
- calcula mediana, média, mínimo e máximo quando há observações suficientes;
- identifica recordes de menor preço observado;
- possui favoritos em `localStorage`;
- calcula estimativa familiar como `preço por pessoa × viajantes`;
- permite comparar até três oportunidades lado a lado;
- oferece calendário de preços baseado somente nos dados efetivamente coletados;
- suporta tema claro/escuro e salva a preferência localmente;
- mostra claramente quando os dados estão antigos ou quando alguma fonte falhou.

O MVP **não inventa preços, voos, companhias, descontos nem disponibilidade**. Se a API não fornecer alguma informação, a interface mostra “não informado”, “histórico insuficiente” ou “link indisponível”.

---

## Arquitetura

```text
radar-ferias-poa/
├── index.html
├── style.css
├── app.js
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

### Fluxo de dados

```text
Travelpayouts / Aviasales Data API
              │
              │ TRAVELPAYOUTS_TOKEN
              ▼
       GitHub Actions
              │
              ▼
 scripts/fetch-deals.mjs
       │              │
       ▼              ▼
 data/deals.json   data/history.json
       │              │
       └──────┬───────┘
              ▼
        GitHub Pages
              │
              ▼
     index.html + app.js
```

O token **nunca é enviado ao navegador**. Ele é usado apenas no runner privado do GitHub Actions, através do cabeçalho `X-Access-Token`.

---

## Fonte dos preços

O projeto usa a **Aviasales Data API da Travelpayouts**.

Documentação oficial:

- https://support.travelpayouts.com/hc/en-us/articles/203956163-Aviasales-Data-API
- https://support.travelpayouts.com/hc/en-us/articles/4402565416594-API-rate-limits
- https://travelpayouts.github.io/slate/

### Endpoints usados pelo coletor

O MVP prioriza os endpoints atuais da API:

1. `aviasales/v3/prices_for_dates`
   - busca ampla mês a mês a partir de POA;
   - ida e volta (`one_way=false`);
   - a documentação oficial atual desse endpoint não expõe filtro de classe; portanto o Radar não inventa nem garante a cabine para esses registros;
   - ordenação por preço;
   - usado como fonte principal do radar.

2. `aviasales/v3/get_special_offers`
   - consulta ofertas anormalmente baixas reportadas pela própria fonte;
   - o Radar **não chama automaticamente esses itens de promoção**;
   - se a resposta não possuir volta, ela não entra no MVP de ida e volta.

3. `aviasales/v3/get_latest_prices`
   - complementa a coleta com preços recentes agrupados por direções;
   - neste endpoint o coletor define `trip_class=0` (econômica).

4. `aviasales/v3/grouped_prices`
   - usado para obter mais detalhe em destinos monitorados durante os meses configurados como férias;
   - é o substituto recomendado pela documentação para métodos antigos de calendário/mensal.

O antigo `week-matrix` continua documentado, mas o MVP prioriza os endpoints v3 atuais quando existe substituto adequado.

---

### Sobre classe econômica

O objetivo do projeto é trabalhar com econômica. Porém, na documentação oficial atual, `prices_for_dates` e `grouped_prices` **não expõem um parâmetro de classe** nem devolvem a classe no exemplo de resposta. Por isso o MVP não rotula esses registros como “econômica” sem confirmação. Em `get_latest_prices`, onde `trip_class` é suportado oficialmente, o coletor usa `trip_class=0`.

Essa é uma limitação explícita da fonte, não um dado a ser preenchido por suposição.

---

## Limitação importante: os dados são cacheados

A Data API da Aviasales/Travelpayouts **não é um motor de disponibilidade em tempo real**. A própria documentação informa que os dados vêm do histórico recente de buscas dos usuários e são servidos a partir de cache.

Por isso:

- um preço no radar pode já ter mudado;
- uma rota pode não aparecer mesmo existindo voos;
- um período pode ter poucos dados se ninguém pesquisou aquela combinação recentemente;
- o botão **VER / CONFIRMAR PREÇO** existe justamente para revalidar antes de comprar;
- quando a API não fornece um link válido, o botão fica indisponível em vez de criar um link fictício.

A tela sempre mostra:

> **Preço encontrado em dados recentes em cache. Confirme o valor antes da compra.**

---

## Opportunity Score

O `Opportunity Score` vai de **0 a 100** e está implementado em `app.js`.

A fórmula atual é uma heurística documentada no próprio código:

| Componente | Peso máximo |
|---|---:|
| Preço atual versus mediana histórica comparável | 50 |
| Percentil dentro do histórico comparável | 15 |
| Preço absoluto perante as ofertas atuais | 5 |
| Voo direto / quantidade de conexões | 10 |
| Adequação às férias selecionadas | 10 |
| Atualidade do preço | 10 |
| **Total** | **100** |

### Histórico comparável

Primeiro o sistema tenta comparar:

1. mesma rota;
2. mesmo mês do ano da viagem;
3. duração aproximada (±3 dias).

Se não houver pelo menos cinco registros, ele tenta usar mesma rota + mesmo mês do ano.

Se ainda não houver **5 observações comparáveis**, o sistema mostra:

> **Histórico ainda insuficiente**

Os 65 pontos ligados ao histórico ficam indisponíveis. Assim, um preço sem histórico **não consegue receber artificialmente um score muito alto apenas porque faltam dados**.

### Classificação visual

A classificação exige evidência histórica:

- 🔥 **Achado excepcional** — score alto e desconto histórico relevante;
- ⭐ **Excelente oportunidade**;
- 👍 **Boa oportunidade**;
- **Normal**;
- **Preço alto** — quando está significativamente acima da mediana observada.

Mesmo que `get_special_offers` retorne um item, ele não recebe automaticamente uma dessas classificações.

---

## Histórico próprio

`data/history.json` cresce gradualmente a cada execução do GitHub Action.

Cada observação pode guardar:

- origem;
- destino;
- ida;
- volta;
- preço;
- moeda;
- companhia;
- conexões;
- data/hora informada pela fonte, quando disponível;
- data/hora em que o Radar observou o registro;
- endpoint de origem;
- link, quando fornecido.

O coletor evita duplicar observações idênticas. Se a fonte não fornecer `found_at`, a mesma combinação estável de rota, datas, preço e endpoint não é adicionada novamente em toda execução.

Por padrão o histórico mantém até **540 dias** e no máximo **50.000 observações**. Esses valores podem ser alterados em `config.json`.

---

## Períodos de férias

Há dois níveis diferentes de configuração.

### 1. Períodos locais da interface

Na aba **Férias**, qualquer pessoa pode criar, editar ou apagar períodos. Eles ficam em `localStorage` e servem imediatamente para filtrar os dados já coletados.

Cada período possui:

- nome;
- data inicial;
- data final;
- duração mínima;
- duração máxima.

### 2. Períodos do coletor em `config.json`

Os períodos dentro de `config.json` também orientam o GitHub Action sobre quais meses merecem coleta detalhada via `grouped_prices` para os destinos monitorados.

Se você criar um período importante apenas pela interface, ele funciona como filtro, mas o Action não passa automaticamente a fazer chamadas extras para ele. Para isso, edite também `config.json` no repositório.

Exemplo:

```json
{
  "id": "julho-2027",
  "name": "Férias de julho 2027",
  "start": "2027-07-05",
  "end": "2027-08-01",
  "minDays": 5,
  "maxDays": 15
}
```

As datas do exemplo **não são tratadas como calendário escolar oficial permanente**; são apenas configuração inicial editável.

---

## Destinos e regiões

`config.json` contém um pequeno `airportCatalog` usado somente para:

- mostrar nome da cidade e país;
- classificar Brasil / América do Sul / Caribe / América do Norte / Europa;
- ajudar na busca e nos favoritos.

O catálogo **não limita a coleta da API**. Um IATA desconhecido ainda pode aparecer; nesse caso a tela usa o código e informa que o país/região não está mapeado.

Você pode ampliar o catálogo livremente.

---

## Estimativa familiar

A configuração padrão usa `defaultTravelers` em `config.json`, e o usuário pode alterar o número na aba **Configurações**.

O cálculo é somente:

```text
preço unitário retornado pela API × número de viajantes
```

O resultado aparece como **Estimativa do total**.

O Radar **não presume tarifa infantil, bagagem, assento, taxas extras ou regras tarifárias** que não estejam presentes na fonte.

---

## Como obter o token Travelpayouts

1. Crie uma conta na Travelpayouts.
2. Solicite/ative acesso à Aviasales Data API conforme as regras atuais da plataforma.
3. Obtenha seu token de API na área de ferramentas/desenvolvedores da Travelpayouts.
4. Não coloque esse token em `app.js`, `config.json`, commits, Issues ou arquivos públicos.

A documentação oficial aponta a área de API da Travelpayouts para obtenção do token:

https://www.travelpayouts.com/programs/100/tools/api

---

## Como criar `TRAVELPAYOUTS_TOKEN` no GitHub

No repositório:

1. abra **Settings**;
2. entre em **Secrets and variables → Actions**;
3. clique em **New repository secret**;
4. nomeie exatamente:

```text
TRAVELPAYOUTS_TOKEN
```

5. cole o token como valor;
6. salve.

O workflow acessa o secret somente assim:

```yaml
env:
  TRAVELPAYOUTS_TOKEN: ${{ secrets.TRAVELPAYOUTS_TOKEN }}
```

O script manda o token no cabeçalho HTTP. O token não é colocado na URL e não aparece nos JSON gerados.

---

## Ativar GitHub Actions

O arquivo já está pronto em:

```text
.github/workflows/update-deals.yml
```

Ele roda aproximadamente duas vezes por dia:

```yaml
cron: '17 9,21 * * *'
```

O cron do GitHub usa UTC.

Também existe execução manual por `workflow_dispatch`:

1. abra a aba **Actions**;
2. escolha **Atualizar radar de passagens**;
3. clique em **Run workflow**.

O workflow precisa de permissão para escrever no repositório porque atualiza `data/deals.json` e `data/history.json`.

Se a branch principal tiver proteção que impeça pushes do `github-actions[bot]`, será necessário ajustar a regra de proteção ou adotar outro fluxo de publicação.

---

## Tolerância a falhas

O coletor não aborta só porque um endpoint falhou.

Para cada chamada ele:

- registra apenas um erro resumido;
- **nunca imprime o token**;
- segue consultando as demais fontes;
- respeita pequeno intervalo entre requisições;
- grava em `deals.json` quais endpoints tiveram sucesso ou falha.

Se **todas** as chamadas falharem:

- os preços anteriores são preservados;
- `generatedAt` não é atualizado falsamente;
- `lastAttemptAt` registra a tentativa;
- a interface pode continuar identificando os dados antigos como antigos.

Se apenas uma fonte falhar, registros anteriores daquela fonte podem ser mantidos por até sete dias e marcados internamente como carregados da coleta anterior.

---

## Rate limits

A Travelpayouts publica limites diferentes por endpoint. O workflow usa chamadas sequenciais e um intervalo configurável (`requestDelayMs`) para evitar rajadas desnecessárias.

Referência atual:

https://support.travelpayouts.com/hc/en-us/articles/4402565416594-API-rate-limits

Se você aumentar muito o horizonte, quantidade de destinos monitorados ou períodos de férias, revise os limites antes.

---

## Publicar no GitHub Pages

1. Crie um repositório no GitHub.
2. Coloque todos os arquivos deste projeto na raiz.
3. Faça o primeiro commit/push.
4. Abra **Settings → Pages**.
5. Em **Build and deployment**, escolha **Deploy from a branch**.
6. Selecione a branch principal (`main`, por exemplo) e a pasta `/ (root)`.
7. Salve.

Depois de alguns minutos, o GitHub mostrará a URL pública.

A presença de `.nojekyll` evita processamento desnecessário pelo Jekyll.

---

## Alterar POA para outro aeroporto

Edite em `config.json`:

```json
{
  "origin": "POA",
  "originName": "Porto Alegre"
}
```

Por exemplo, para Florianópolis:

```json
{
  "origin": "FLN",
  "originName": "Florianópolis"
}
```

Depois faça commit. Na execução seguinte o Action passa a consultar a nova origem.

Também revise os destinos monitorados em:

```json
"collection": {
  "trackedDestinations": []
}
```

---

## Configurações principais

Em `config.json`:

```json
{
  "currency": "BRL",
  "market": "br",
  "locale": "pt",
  "staleAfterHours": 36,
  "defaultTravelers": 3,
  "collection": {
    "horizonMonths": 18,
    "historyRetentionDays": 540,
    "maxHistoryObservations": 50000,
    "requestDelayMs": 140
  }
}
```

### `horizonMonths`

Quantos meses futuros o Action consulta usando `prices_for_dates`.

Aumentar esse número gera mais cobertura, mas também mais requisições e potencialmente arquivos maiores.

### `staleAfterHours`

Depois desse tempo sem uma coleta bem-sucedida, a interface mostra alerta de dados antigos.

---

## Executar localmente

Como a página usa `fetch()` para ler JSON, não abra `index.html` diretamente via `file://`.

Use qualquer servidor HTTP simples.

Com Python:

```bash
python3 -m http.server 8000
```

Depois abra:

```text
http://localhost:8000
```

### Rodar o coletor localmente

Linux/macOS:

```bash
TRAVELPAYOUTS_TOKEN="seu_token" node scripts/fetch-deals.mjs
```

PowerShell:

```powershell
$env:TRAVELPAYOUTS_TOKEN="seu_token"
node scripts/fetch-deals.mjs
```

Node.js 20+ é recomendado porque o script usa `fetch` e `AbortSignal.timeout` nativos.

---

## Adicionar novas APIs no futuro

O navegador não deve receber tokens privados.

O padrão recomendado é:

1. adicionar a nova integração em `scripts/fetch-deals.mjs` ou em outro script executado pelo Action;
2. guardar credenciais em **GitHub Secrets**;
3. normalizar o resultado para o mesmo formato de `deals.json`;
4. gravar `source` e `sourceEndpoint` reais;
5. nunca preencher campos ausentes com dados inventados;
6. atualizar o histórico somente com observações reais;
7. manter o frontend consumindo JSON estático.

Formato simplificado de uma oportunidade normalizada:

```json
{
  "origin": "POA",
  "destination": "SCL",
  "departureAt": "2027-07-10T00:00:00Z",
  "returnAt": "2027-07-18T00:00:00Z",
  "price": 1234,
  "currency": "BRL",
  "airline": "XX",
  "transfers": 0,
  "foundAt": "2026-09-13T12:00:00Z",
  "source": "Nome real da fonte",
  "sourceEndpoint": "endpoint-real",
  "link": null
}
```

Esse trecho é apenas um **exemplo de schema** para desenvolvimento; não representa uma tarifa real.

---

## Segurança

Nunca faça isto em código público:

```js
const token = "MEU_TOKEN_REAL";
```

Nem isto:

```text
data/deals.json → "token": "..."
```

O projeto já foi estruturado para evitar esse problema.

Também evite colocar o token em parâmetros de linha de comando de workflows, URLs impressas ou mensagens de log.

---

## O que o MVP deliberadamente não finge fazer

Este projeto não promete:

- disponibilidade em tempo real;
- preço garantido até o checkout;
- tarifa infantil;
- preço com bagagem incluída;
- regras tarifárias completas;
- cobertura de todas as companhias e agências;
- calendário completo quando o cache não possui buscas suficientes;
- “promoção” sem histórico comparável.

Quando um recurso depende de dados ausentes, a interface informa a limitação em vez de fabricar uma resposta.

---

## Próximas evoluções possíveis

Sem alterar a arquitetura de segurança, dá para adicionar futuramente:

- notificações de recorde histórico;
- exportação CSV;
- gráfico temporal por rota;
- comparação de aeroportos alternativos;
- feriados configuráveis;
- segundo provedor de dados;
- geração de um feed RSS/JSON de achados;
- publicação de alertas em Telegram/Discord via GitHub Actions;
- coleta detalhada adaptativa apenas para destinos que estão perto de virar “achado excepcional”.

A prioridade deve continuar sendo: **dados reais, rastreáveis e comparáveis, sem inventar disponibilidade ou promoção**.
