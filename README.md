# BoardGame Visual Analytics – Project 2

Visual Analytics · Summer Semester 2026 · Universität zu Köln

---

## Índice

1. [Estrutura do projeto](#estrutura)
2. [Como instalar e executar](#execucao)
3. [Task 1 – Dataset, dados sujos e pré-processamento](#task1)
4. [Task 2 – K-Means clustering (Trend)](#task2)
5. [Task 3 – PageRank e grafo de recomendação (Graph · Significance)](#task3)
6. [Task 4 – Linked highlighting entre todas as views](#task4)
7. [Decisões de design](#design)
8. [Cobertura dos critérios de avaliação](#criterios)

---

## 1. Estrutura do projeto <a name="estrutura"></a>

```
Template/
├── data/
│   ├── recommendations-2021-12-31.csv   # top-1000 games + até 28 recomendações de fãs
│   ├── bgg_Gameitems.csv                # metadados completos (~114k jogos BGG)
│   └── boardgames_1000.json             # dataset gerado pelo script de pré-processamento
├── src/
│   ├── _server/
│   │   ├── preprocess_data.mjs   # script único de geração do JSON a partir dos CSVs
│   │   ├── preprocessing.js      # limpeza, encoding, k-means, pagerank, builders
│   │   ├── kmeans.js             # K-Means++ com métricas euclidean/manhattan/chebyshev
│   │   ├── pagerank.js           # PageRank com dangling nodes (α=0.85, ε=1e-6)
│   │   └── static/
│   │       └── server.js         # Socket.IO na porta 3231
│   ├── _public/
│   │   ├── index.js              # orquestração frontend, WebSocket, estado de highlight
│   │   ├── parallel_coords.js    # Coordenadas paralelas com brush (Project 1)
│   │   ├── bubble_matrix.js      # Bubble scatter playtime × rating (Project 1)
│   │   ├── chord.js              # Chord category × mechanic (Project 1)
│   │   ├── kmeans_plot.js        # Scatter + convex hulls + centroids (Task 2)
│   │   └── pagerank_graph.js     # Grafo force-directed com PageRank (Task 3)
│   └── html/
│       └── template.html         # layout + controles da sidebar
└── package.json
```

---

## 2. Como instalar e executar <a name="execucao"></a>

```bash
# 1. Instalar dependências
cd Template
npm install

# 2. Gerar o dataset (só precisa rodar uma vez)
node src/_server/preprocess_data.mjs

# 3. Subir servidor de desenvolvimento
npm run dev
```

Acesse em `http://localhost:3000`.

> **Portas:** webpack-dev-server na 3000 (frontend) · Socket.IO na 3231 (dados)

---

## 3. Task 1 – Dataset, dados sujos e pré-processamento <a name="task1"></a>

### Fontes de dados

| Arquivo | Linhas | Conteúdo |
|---------|--------|----------|
| `recommendations-2021-12-31.csv` | 1 000 | Top-1000 do BGG (2021): rank, rating, nº votos, até 28 IDs de recomendação por jogo |
| `bgg_Gameitems.csv` | ~113 904 | Metadados: categorias, mecânicas, nº jogadores, playtime, minage, designer, etc. |

### Join dos CSVs

O script `src/_server/preprocess_data.mjs` é executado uma única vez para gerar `boardgames_1000.json`:

```js
// Lê os dois CSVs em paralelo
const [recRows, itemRows] = await Promise.all([
  parseCSV('recommendations-2021-12-31.csv'),
  parseCSV('bgg_Gameitems.csv'),
]);

// Indexa metadados por bgg_id
const itemMap = new Map();
for (const row of itemRows) {
  const id = Number(row.bgg_id);
  if (isFinite(id)) itemMap.set(id, row);
}

// Para cada jogo do ranking: join + limpeza
for (const rec of recRows) {
  const item = itemMap.get(Number(rec.ID)) || {};
  // ... normalização e validação
  games.push({ id, title, year, rank, minplayers, maxplayers,
               minplaytime, maxplaytime, minage, rating, recommendations,
               types: { categories, mechanics }, credit: { designer } });
}
```

### Problemas de qualidade encontrados

| Problema | Jogos afetados | Estratégia de tratamento |
|----------|---------------|--------------------------|
| Playtime inválido (0 ou negativo) | 1 | Imputed: `minplaytime = 30`, `maxplaytime = minplaytime` |
| Categorias ausentes | 2 | Armazenado como `[]`; `category_primary = "Other"` |
| `min_players > max_players` | variável | Valores trocados (swap) automaticamente |
| Recomendações duplicadas | variável | Deduplicadas com `Set` antes de persistir |
| Ano ausente / não numérico | variável | Armazenado como `null`; flagged no painel |
| Rating ausente | variável | Fallback `0`; flagged no painel |
| Campos numéricos para k-means | todos | Normalizados para `[0, 1]` |
| Categorias para k-means | todos | One-hot encoding (top-8 categorias) |

O painel **Data Quality** na sidebar mostra em tempo real os contadores para o top-X selecionado. Abaixo dos contadores, a seção **Cleaning strategy** lista o tratamento aplicado a cada tipo de problema.

### Suporte ao filtro top-X dinâmico

O JSON contém 1 000 jogos ordenados por rank. A função `loadAndClean` fatia os primeiros `topX` sem recarregar o arquivo:

```js
// preprocessing.js
export function loadAndClean(rawData, topX = 100) {
  const cleaned = rawData.map(cleanGame).filter(Boolean);
  cleaned.sort((a, b) => a.rank - b.rank);
  return { games: cleaned.slice(0, topX), issues };
}
```

O seletor na sidebar dispara um `requestData` via WebSocket; o servidor recomputa k-means e PageRank para o novo subconjunto e emite `freshData`:

```js
// index.js
ctrlTopX.addEventListener('change', requestData);

function requestData() {
  socket.emit('requestData', {
    topX:   Number(ctrlTopX.value),   // 100 | 200 | 500 | 1000
    k:      Number(ctrlK.value),
    metric: ctrlMetric.value,
  });
}
```

---

## 4. Task 2 – K-Means clustering (Trend) <a name="task2"></a>

### 5-tuple de análise

| Componente | Valor |
|------------|-------|
| **Who** | Analista de jogos de tabuleiro |
| **What (Action)** | **Identify** — verificar se existe uma **Trend** |
| **How** | K-Means++ no espaço N-dimensional de features; projetado em Rating × Playtime |
| **With what data** | 6 features numéricas + 8 one-hot de categorias (14 dimensões) |
| **Why** | Descobrir se jogos similares em complexidade, qualidade e tema formam grupos coesos — e se esses grupos se manifestam em faixas distintas de rating e tempo de jogo no ranking top-X |

**Tarefa em linguagem natural:**
> "Existe uma tendência de que jogos com mecânicas e categorias similares (alta complexidade + mesmo tema) também se agrupem em faixas distintas de rating e tempo de jogo? E essa estrutura de clusters se mantém ao variar k ou a métrica de distância?"

### Codificação das features

Campos numéricos são normalizados para `[0, 1]`. Categorias são codificadas como one-hot binário, garantindo peso uniforme em qualquer métrica de distância:

```js
// preprocessing.js – encodeForKMeans()
const featureNames = [
  'Rating',       // normalizado [0,1]
  'Playtime',     // normalizado [0,1]
  '#Mechanics',   // normalizado [0,1]
  'Min Age',      // normalizado [0,1]
  'Players',      // normalizado [0,1]
  'log(Reviews)', // log10(num_reviews + 1), normalizado [0,1]
  ...top8cats.map(c => `cat:${c}`),  // 0 ou 1 (one-hot)
];

const vectors = games.map((g, gi) => [
  norm(g.rating_value,  mins.rating_value,  maxs.rating_value),
  norm(g.playtime_avg,  mins.playtime_avg,  maxs.playtime_avg),
  norm(g.num_mechanics, mins.num_mechanics, maxs.num_mechanics),
  norm(g.minage,        mins.minage,        maxs.minage),
  norm(g.players_avg,   mins.players_avg,   maxs.players_avg),
  norm(logReviews[gi],  minLR,              maxLR),
  ...top8cats.map(c => g.categories.includes(c) ? 1 : 0),
]);
```

### Inicialização K-Means++

```js
// kmeans.js – kmeanspp()
function kmeanspp(points, k, distFn) {
  const centroids = [points[Math.floor(Math.random() * points.length)]];
  for (let c = 1; c < k; c++) {
    const dists = points.map(p =>
      Math.min(...centroids.map(cn => distFn(p, cn))) ** 2
    );
    const total = dists.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < dists.length; i++) {
      r -= dists[i];
      if (r <= 0) { centroids.push(points[i]); break; }
    }
  }
  return centroids;
}
```

A inicialização K-Means++ garante centroides iniciais espaçados, reduzindo iterações e evitando mínimos locais ruins.

### Métricas de distância

```js
// kmeans.js
export function euclidean(a, b) {   // padrão – amplifica grandes desvios (quadrático)
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
  return Math.sqrt(sum);
}

export function manhattan(a, b) {   // robusta com one-hot – soma desvios absolutos
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum;
}

export function chebyshev(a, b) {   // sensível ao maior desvio individual
  let max = 0;
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i] - b[i]);
    if (d > max) max = d;
  }
  return max;
}
```

**Por que Manhattan como ponto de partida:** com dimensões one-hot binárias (0/1) misturadas com contínuas, Manhattan distribui o peso de forma mais uniforme que Euclidiana, que eleva ao quadrado e favorece outliers em dimensões contínuas.

### Visualização

- **Eixos:** Rating (Y) × Avg Playtime (X) — os dois mais interpretáveis; o clustering ocorre nas 14 dimensões
- **Cor:** paleta de clusters fixa (diferente da paleta de categorias usada nas outras views, para não confundir)
- **Convex hull** por cluster: mostra extensão e sobreposição no espaço 2D
- **Centroid (diamante):** posição média de cada cluster nos eixos de exibição
- **Legenda:** cada cluster exibe `C1 n=33`, o perfil gerado automaticamente (ex.: `Short · Complex`) e a categoria dominante

```js
// kmeans_plot.js – perfil descritivo automático
function _clusterProfile(c) {
  const time  = c.avg_playtime  >= 150 ? 'Long'   : c.avg_playtime  >= 75 ? 'Medium' : 'Short';
  const cmplx = c.avg_mechanics >= 6   ? 'Complex' : c.avg_mechanics >= 4 ? 'Standard' : 'Light';
  return `${time} · ${cmplx}`;
}
```

### Interação

| Controle | Ação | Custo |
|----------|------|-------|
| Slider k (2–12) | Recomputa k-means via WebSocket | 1 arraste |
| Dropdown métrica | Recomputa com nova métrica | 1 clique |
| Clique num ponto | Destaca todo o cluster em todas as 5 views | 1 clique |
| Clique de novo | Toggle: limpa o highlight | 1 clique |

---

## 5. Task 3 – PageRank e grafo de recomendação <a name="task3"></a>

### 5-tuple de análise

| Componente | Valor |
|------------|-------|
| **Who** | Analista / recomendador de jogos |
| **What (Action)** | **Describe / Correlate** |
| **How** | Force-directed graph com nó ∝ PageRank; arestas = recomendações; clique revela painel de features compartilhadas |
| **With what data** | Scores de significância (PageRank), arestas `fans_liked`, features dos jogos (categoria, mecânicas, rating) |
| **Why** | Identificar jogos-chave na rede de recomendações e descrever quais características (categoria, mecânica, complexidade) correlacionam com alta significância e com ser frequentemente recomendado a partir dos hubs |

**Tarefa em linguagem natural:**
> "Quais características (categoria, mecânicas, rating, complexidade) têm forte correlação com um jogo ser um hub central na rede de recomendações — e o que um jogo-chave tem em comum com os jogos que ele recomenda?"

### Construção do grafo

```js
// preprocessing.js – buildPageRankGraph()
const graph = {};
for (const g of games) {
  const src = String(g.id);
  graph[src] = [];
  for (const fl of g.fans_liked) {
    const dst = String(fl);
    if (ids.has(dst) && dst !== src)   // apenas arestas dentro do dataset
      graph[src].push(dst);
  }
}
const pr_scores = pagerank(graph);  // α=0.85, ε=1e-6
```

| Top-X | Nós | Arestas |
|-------|-----|---------|
| 100   | 100 | 936     |
| 1000  | 1000 | 16 329 |

### Algoritmo PageRank

```js
// pagerank.js
export function pagerank(graph, alpha = 0.85, eps = 1e-6, iter = 100) {
  // Inicialização uniforme: 1/N
  let scores = new Float64Array(N).fill(1 / N);
  const teleport = (1 - alpha) / N;

  for (let it = 0; it < iter; it++) {
    const next = new Float64Array(N).fill(teleport);

    // Dangling nodes: distribuem rank igualmente para todos
    let dangling = 0;
    for (let i = 0; i < N; i++) if (outDeg[i] === 0) dangling += scores[i];
    const danglingContrib = (alpha * dangling) / N;

    for (let i = 0; i < N; i++) {
      next[i] += danglingContrib;
      for (const src of inEdges[i])
        next[i] += alpha * scores[src] / outDeg[src];
    }

    let delta = 0;
    for (let i = 0; i < N; i++) delta += Math.abs(next[i] - scores[i]);
    scores = next;
    if (delta < eps) break;  // convergência
  }
}
```

### Visualização (Force-directed graph)

- **Raio do nó ∝ PageRank** (escala sqrt para evitar dominância visual de hubs)
- **Anel dourado** nos top-10 nós + label sempre visível → deixa imediatamente claro quais são os jogos mais significativos
- **Arestas direcionadas** com seta: A → B = "fãs de A também gostam de B"
- **Cor por categoria** (paleta consistente com as demais views)
- **Zoom + pan** via `d3.zoom` · **drag** nos nós para reorganizar regiões

### Clique num nó – diferenciação visual e painel de detalhe

```js
// pagerank_graph.js – selectPageRankNode()
export function selectPageRankNode(selectedId, recIds) {
  _selectedId = selectedId != null ? String(selectedId) : null;
  _recIds     = recIds ? new Set([...recIds].map(String)) : new Set();
  _applySelectionStyles();
}

function _applySelectionStyles() {
  _nodeSelection
    .attr('stroke', d => {
      if (_selectedId && d.id === _selectedId) return '#fbbf24'; // amber – jogo selecionado
      if (_selectedId && _recIds.has(d.id))     return '#38bdf8'; // teal  – recomendados diretos
      return _topIds.has(d.id) ? '#f5c518' : '#1a1d27';           // gold top-10 / default
    })
    .attr('stroke-width', d => {
      if (_selectedId && d.id === _selectedId) return 4;
      if (_selectedId && _recIds.has(d.id))     return 2.5;
      return _topIds.has(d.id) ? 2.5 : 0.8;
    });
}
```

Ao clicar num nó, o painel **Selected Game** aparece na sidebar com:
- Título, rank e rating do jogo
- PageRank score
- Lista dos jogos que ele recomenda (presentes no dataset)
- Tags de categorias e mecânicas compartilhadas com os recomendados

---

## 6. Task 4 – Linked highlighting <a name="task4"></a>

### Arquitetura

`index.js` mantém dois estados globais que propagam para todas as 5 views:

```
[K-Means click]   ─┐
[PageRank click]  ─┼──→  highlightIds: Set<id> | null  ──→  applyHighlightToAll()
[Bubble click]    ─┘                                              │
                                                                  ├──→ highlightPC()
[PC brush]  ──────────→  brushFilter:  Set<id> | null  ──→  applyBrushToAll()
                                                                  ├──→ highlightBubble()
                                                                  ├──→ highlightKMeans()
                                                                  ├──→ highlightPageRank()
                                                                  └──→ highlightChord()
```

```js
// index.js
function applyHighlightToAll() {
  highlightPC(highlightIds);
  highlightBubble(highlightIds);
  highlightKMeans(highlightIds);
  highlightPageRank(highlightIds);
  highlightChord(highlightIds);
}
```

### O chord é redesenhado, não apenas faded

```js
// chord.js – highlightChord()
export function highlightChord(ids) {
  if (!ids) { _render(_allEdges); return; }
  const filtered = _allEdges.filter(e => ids.has(e.game_id));
  _render(filtered.length > 0 ? filtered : _allEdges);
}
```

Redesenhar (em vez de fade) muda as proporções dos arcos, revelando quais categorias e mecânicas dominam o subconjunto selecionado — informação que um simples fade não transmite.

### Toggle e limpeza

```js
// Toggle: segundo clique no mesmo conjunto limpa o highlight
function toggleHighlight(ids) {
  highlightIds = (highlightIds && setsEqual(highlightIds, ids)) ? null : ids;
  applyHighlightToAll();
}

// Botão "Clear highlight" reseta tudo (1 clique)
function clearAll() {
  brushFilter = null; highlightIds = null;
  applyHighlightToAll();
  filterBubble(null); highlightChord(null);
  showGameDetail(null); selectPageRankNode(null, null);
}
```

### Exemplo de análise com linked highlighting

1. **No K-Means:** clique num jogo de alta complexidade (longa duração, muitas mecânicas)
   → destaca o cluster inteiro em todas as views
2. **No Parallel Coordinates:** confirme que o cluster tem rating elevado e minage alto
3. **No Chord:** veja que "Worker Placement" e "Hand Management" dominam o chord redesenhado
4. **No PageRank:** identifique quantos desses jogos são hubs de recomendação (anéis grandes)
5. **No Bubble Matrix:** veja a distribuição de playtime vs. rating do cluster

---

## 7. Decisões de design <a name="design"></a>

### Scatter plot para k-means
Rating × Playtime são os dois eixos mais interpretáveis. O clustering ocorre em 14 dimensões, mas projetá-lo em 2D permite comparar a coesão visual dos clusters e detectar overlaps. O convex hull torna explícito o espaço de cada cluster.

### Manhattan como padrão para k-means
Com dimensões one-hot binárias (0/1) misturadas com contínuas, Manhattan distribui o peso de forma mais uniforme que Euclidiana (que eleva ao quadrado e favorece outliers em dimensões contínuas). O analista pode mudar para Euclidiana ou Chebyshev via dropdown.

### Force-directed para pagerank
O grafo de recomendações é não-hierárquico e esparso. O layout por força posiciona naturalmente os hubs mais ao centro, e o drag interativo permite reorganizar regiões de interesse. Matriz de adjacência seria ilegível para top-500/1000.

### Chord redesenhado vs. fade
Um fade não muda as proporções visuais — não há nova informação. Redesenhar o chord com apenas os edges do subconjunto selecionado altera as proporções dos arcos e ribbons, revelando a composição de categorias e mecânicas do grupo.

### Por que manter as views do Project 1
O enunciado do Project 2 exige que o linked highlighting inclua as visualizações do Project 1. As views de PC e Bubble Matrix servem como contexto comparativo: ao selecionar um cluster no k-means, o analista pode imediatamente ver como esses jogos se distribuem nos eixos numéricos do PC e no espaço playtime × rating do Bubble.

---

## 8. Cobertura dos critérios de avaliação <a name="criterios"></a>

| # | Critério | Onde está implementado |
|---|----------|------------------------|
| 1 | Novo dataset incorporado em todas as views | `boardgames_1000.json` usado em todas as 5 views |
| 2 | Problemas de qualidade claros e tratados | Painel "Data Quality" + seção "Cleaning strategy" na sidebar |
| 3 | Pré-processamento claro e argumentado | `preprocess_data.mjs` + `encodeForKMeans()` + seção Task 1 deste README |
| 4 | Top-X dinâmico | Seletor na sidebar: 100 / 200 / 500 / 1000 |
| 5 | 5-tuple Trend para Task 2 | Seção Task 2 deste README; tarefa argumentada |
| 6 | Visualização dos clusters | Scatter + convex hulls + centroids em `kmeans_plot.js` |
| 7 | Visualização adequada para a tarefa | Seção "Decisões de design" + perfis descritivos dos clusters |
| 8 | Interação com k intuitiva | Slider k na sidebar (1 arraste → recomputa) |
| 9 | Métrica de distância adaptável | Dropdown com 3 métricas (1 clique → recomputa) |
| 10 | Visualização usando PageRank | Grafo force-directed em `pagerank_graph.js` |
| 11 | Argumentação da correlação | Seção Task 3 + painel de features compartilhadas |
| 12 | Scores e recomendações como componentes centrais | Node size ∝ PageRank · arestas = `fans_liked` · painel de detalhe |
| 13 | Correlações entre jogo-chave e recomendados | Clique no nó: anel amber (selecionado) + teal (recomendados) + painel shared features |
| 14 | Seleção em Task 2 e Task 3 para highlight | Click em k-means → cluster · click em pagerank → recomendados |
| 15 | Highlight nas views do Project 1 e Project 2 | Todas as 5 views respondem via `applyHighlightToAll()` |
| 16 | Demonstração de como o highlight apoia a análise | Exemplo passo-a-passo na seção Task 4 |
| 17 | Argumentação de elementos incluídos/excluídos | Seção "Decisões de design" |
