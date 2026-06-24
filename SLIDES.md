# Roteiro de Slides – BoardGame Visual Analytics Project 2

Visual Analytics · Summer Semester 2026 · Universität zu Köln

> Este documento é o roteiro interno. Cada seção corresponde a um slide ou bloco de slides.
> O que está em *itálico* são falas sugeridas para a apresentação oral.

---

## SLIDE 1 — Capa

**Título:** BoardGame Visual Analytics – Project 2
**Subtítulo:** Clustering & Graph Analysis of the BGG Recommendation Network
**Conteúdo:** Nome dos integrantes · Universität zu Köln · Junho 2026

---

## SLIDE 2 — Visão geral do projeto

**Título:** O que o Project 2 adiciona ao Project 1?

**Conteúdo (3 blocos visuais):**
```
[Dataset maior]          [2 novos gráficos]        [Highlight ligado]
 2 CSVs → 1 000 jogos    K-Means (Trend)            5 views coordenadas
 dados sujos tratados     PageRank (Significance)    1 clique propaga
 top-X dinâmico                                      para todas
```

*"No Project 1 usamos um dataset de 100 jogos já pré-processado. No Project 2 partimos de dois CSVs brutos com dados sujos, geramos o dataset de 1 000 jogos, e adicionamos dois novos gráficos analíticos ligados ao dashboard existente."*

---

## SLIDE 3 — Task 1: Dataset e fontes

**Título:** Task 1 – Dataset: duas fontes, um join

**Conteúdo:**

| Arquivo | Tamanho | Conteúdo |
|---------|---------|----------|
| `recommendations-2021-12-31.csv` | 1 000 linhas | Top-1000 BGG: ranking, rating, até 28 recomendações de fãs |
| `bgg_Gameitems.csv` | ~114 000 linhas | Metadados: categorias, mecânicas, jogadores, playtime, designer |

**Diagrama simples:**
```
recommendations CSV  ──┐
                        ├── join por bgg_id ──→ boardgames_1000.json
bgg_Gameitems CSV    ──┘
```

*"Os dois arquivos são joinados pelo ID do BGG. Para cada um dos 1 000 jogos do ranking, buscamos os metadados no arquivo maior. O resultado é o JSON que alimenta todas as visualizações."*

---

## SLIDE 4 — Task 1: Dados sujos e tratamento

**Título:** Task 1 – Qualidade dos dados e estratégia de limpeza

**Tabela:**

| Problema | Casos | Tratamento |
|----------|-------|------------|
| Playtime inválido (0 ou negativo) | 1 | Imputed: 30 min |
| Categorias ausentes | 2 | Lista vazia; primary = "Other" |
| min_players > max_players | variável | Swap automático |
| Recomendações duplicadas | variável | Deduplicação via Set |
| Ano ausente | variável | null (mantido) |
| Rating ausente | variável | Fallback 0 |

**Visual:** mostrar screenshot do painel "Data Quality" + "Cleaning strategy" da sidebar

*"Os dados eram relativamente limpos — apenas 3 problemas estruturais nos 1 000 registros. O painel na sidebar mostra os contadores em tempo real conforme o analista muda o top-X."*

---

## SLIDE 5 — Task 1: Top-X dinâmico

**Título:** Task 1 – Filtragem dinâmica: Top-X games

**Conteúdo:**
- Seletor na sidebar: **100 / 200 / 500 / 1000**
- Mudança dispara `requestData` via WebSocket
- Servidor recomputa k-means + PageRank para o novo subconjunto
- Todas as 5 views atualizam simultaneamente

**Visual:** GIF ou screenshot do seletor com os 4 valores

*"O analista pode alternar entre o top-100 (mais competitivo, mais denso) e o top-1000 (mais variado, grafo muito maior). O k-means e o PageRank são recomputados automaticamente."*

---

## SLIDE 6 — Task 2: A tarefa analítica (5-tuple)

**Título:** Task 2 – K-Means: Tarefa Analítica (Trend)

**5-tuple em destaque:**

| | |
|-|-|
| **Ação** | Identify — Trend |
| **Quem** | Analista de jogos de tabuleiro |
| **Como** | K-Means++ em 14 dimensões |
| **Dados** | Rating, playtime, mecânicas, minage, jogadores, log(reviews) + 8 one-hot categorias |
| **Por quê** | Descobrir se jogos similares em complexidade e tema formam grupos coesos com padrões distintos de rating e duração |

**Pergunta de pesquisa:**
> *"Jogos com mecânicas e categorias similares também se agrupam em faixas distintas de rating e playtime?"*

*"A tarefa é identificar uma tendência. O k-means faz o agrupamento em 14 dimensões, e a gente projeta em 2D para ver se os clusters fazem sentido visualmente."*

---

## SLIDE 7 — Task 2: Codificação e algoritmo

**Título:** Task 2 – Features e K-Means++

**Bloco esquerdo — 14 dimensões:**
```
Numéricas (norm. [0,1])       One-hot (top-8 categorias)
─────────────────────         ──────────────────────────
rating_value                  Economic    (0 ou 1)
playtime_avg                  Fantasy     (0 ou 1)
num_mechanics                 Sci-Fi      (0 ou 1)
minage                        Adventure   (0 ou 1)
players_avg                   Fighting    (0 ou 1)
log10(reviews + 1)            Exploration (0 ou 1)
                              Civilization(0 ou 1)
                              Card Game   (0 ou 1)
```

**Bloco direito — por que Manhattan:**
- Euclidiana eleva ao quadrado → favorece outliers numéricos
- Manhattan distribui peso igual entre dimensões contínuas e binárias
- Analista pode testar Euclidiana / Chebyshev com 1 clique

*"A escolha da métrica importa aqui porque temos dimensões binárias (0 ou 1) misturadas com contínuas. Manhattan trata ambas de forma mais uniforme."*

---

## SLIDE 8 — Task 2: Visualização

**Título:** Task 2 – K-Means: Visualização

**Visual:** screenshot do gráfico K-Means

**Elementos com legendas anotadas:**
- Pontos coloridos por cluster (paleta independente da paleta de categorias)
- Contorno tracejado = convex hull (extensão do cluster em 2D)
- Diamante = centróide (posição média do cluster nos eixos de exibição)
- Legenda: `C1 n=33 · Short · Complex · Economic`
- Eixos: Rating (Y) × Avg Playtime (X)
- Nota de rodapé: "clustering usa as 14 dimensões; os eixos são apenas a projeção"

*"Os eixos são Rating e Playtime porque são os mais interpretáveis. O convex hull deixa claro onde cada cluster ocupa espaço, e o diamante marca o centro. A legenda mostra o perfil automático de cada cluster."*

---

## SLIDE 9 — Task 3: A tarefa analítica (5-tuple)

**Título:** Task 3 – PageRank: Tarefa Analítica (Graph · Significance)

**5-tuple:**

| | |
|-|-|
| **Ação** | Describe / Correlate |
| **Quem** | Analista / recomendador de jogos |
| **Como** | Force-directed graph com nó ∝ PageRank; clique revela features compartilhadas |
| **Dados** | Scores PageRank, arestas fans_liked, categoria, mecânicas, rating |
| **Por quê** | Identificar os jogos-chave na rede e descrever o que eles têm em comum com os jogos que eles recomendam |

**Pergunta de pesquisa:**
> *"Quais características correlacionam com ser um hub central na rede de recomendações — e o que um jogo-chave tem em comum com seus recomendados?"*

---

## SLIDE 10 — Task 3: Visualização e interação

**Título:** Task 3 – Grafo de Recomendações (PageRank)

**Visual:** screenshot do grafo PageRank com anotações

**Elementos anotados:**
- Nó grande = alto PageRank (significância)
- Anel dourado = top-10 nós mais significativos
- Aresta com seta = A recomenda B (fans_liked)
- Cor = categoria primária do jogo (mesma paleta das outras views)
- Zoom + pan + drag disponíveis

**Ao clicar num nó:**
- Anel **amber espesso** = jogo selecionado
- Anel **teal** = recomendados diretos desse jogo
- Outros nós → faded
- Painel lateral: PageRank score · lista de recomendados · shared features

*"O tamanho do nó é o que mostra a significância. Os anéis dourados são os top-10 sempre visíveis. Ao clicar num jogo, os recomendados ficam em teal, e a sidebar mostra as features em comum — isso responde diretamente a tarefa de correlação."*

---

## SLIDE 11 — Task 4: Linked highlighting

**Título:** Task 4 – Todas as views conectadas

**Diagrama de fluxo:**
```
K-Means click  ──┐
PageRank click ──┼──→  highlightIds (Set<id>)  ──→  highlightPC()
Bubble click   ──┘                                   highlightBubble()
                                                     highlightKMeans()
PC brush  ─────────→  brushFilter  (Set<id>)  ──→  highlightPageRank()
                                                     highlightChord()  ← redesenhado
```

**3 modos de seleção:**
1. **Click em K-Means** → destaca o cluster inteiro
2. **Click em PageRank** → destaca o jogo + seus recomendados
3. **Brush no PC** → filtra um intervalo de qualquer atributo numérico

*"Qualquer seleção em qualquer view propaga para todas as outras. O chord é especial: em vez de só fazer fade, ele é redesenhado com apenas as arestas dos jogos selecionados, revelando as mecânicas e categorias dominantes do subconjunto."*

---

## SLIDE 12 — Demo script (anotações internas)

**Título:** [SLIDE INTERNO – NÃO APRESENTAR] Roteiro da demo ao vivo

**Sequência sugerida (5–7 minutos):**

1. **Abrir o dashboard** em `http://localhost:3000` com Top 100 / k=5 / Euclidean
   - Apontar os 4 painéis + chord em baixo
   - Mostrar "Data Quality" na sidebar

2. **Interação com K-Means:**
   - Mover o slider de k=5 para k=3 → mostrar clusters mudando
   - Trocar métrica para Manhattan → mostrar diferença nos clusters
   - Voltar para k=5 Euclidean
   - **Clicar num ponto de cluster grande** (ex.: cluster Economic/Short)
   - Mostrar como PC, Bubble, PageRank e Chord respondem

3. **Interação com PageRank:**
   - Clicar num dos nós com anel dourado (ex.: Scythe ou Gloomhaven)
   - Mostrar: amber no nó selecionado, teal nos recomendados
   - Abrir sidebar: PageRank score, lista de recomendados, shared features
   - Mostrar PC e Bubble destacados

4. **Top-X dinâmico:**
   - Trocar para Top 1000 → mostrar grafo PageRank muito mais denso
   - Mostrar Data Quality aumentando

5. **Brush no Parallel Coordinates:**
   - Arrastar um brush em "Rating" para filtrar jogos com rating > 8.5
   - Mostrar quais jogos aparecem no K-Means e no grafo

6. **Clear highlight:** botão na sidebar

---

## SLIDE 13 — Decisões de design

**Título:** Decisões de Design – Por que essas escolhas?

**4 cards:**

**Scatter para K-Means**
→ Rating × Playtime são os eixos mais interpretáveis; convex hull mostra extensão do cluster; clustering ocorre em 14D, exibição em 2D é uma projeção

**Manhattan como padrão**
→ Dimensões one-hot (0/1) e contínuas têm pesos uniformes; Euclidiana favorece outliers numéricos ao elevar ao quadrado

**Force-directed para PageRank**
→ Grafo não-hierárquico e esparso; hubs vão naturalmente ao centro; drag interativo; escala para 1 000 nós e 16 000+ arestas

**Chord redesenhado vs. fade**
→ Fade não muda proporções visuais; redesenho revela composição real de categorias e mecânicas do subconjunto selecionado

---

## SLIDE 14 — Perguntas frequentes (prep interna)

**Título:** [SLIDE INTERNO] Perguntas prováveis e respostas

**P: Por que K-Means e não outro algoritmo de clustering (DBSCAN, hierárquico)?**
R: K-Means é paramétrico (k controlável pelo analista), rápido para recalcular on-the-fly via WebSocket, e a visualização de clusters convexos é diretamente compatível com convex hull. DBSCAN não requer k mas não produz fronteiras convexas; hierárquico é mais lento e requer um dendrograma para visualizar.

**P: Por que normalizar para [0,1] e não usar z-score?**
R: Com one-hot, z-score produziria valores fora de [0,1] nas dimensões numéricas, desequilibrando o espaço. A normalização min-max garante que todas as dimensões (contínuas e binárias) têm o mesmo intervalo máximo de contribuição.

**P: Por que usar o fans_liked para PageRank e não o rating?**
R: fans_liked representa recomendações explícitas de outros jogadores — uma aresta direcional de "quem gosta de A tende a recomendar B". O rating é um atributo do jogo, não uma relação entre jogos. PageRank precisa de um grafo, não de scores individuais.

**P: O que acontece se um jogo não tiver categorias?**
R: O campo `categories` fica `[]` e `category_primary` vira `"Other"`. Para o k-means, o vetor one-hot tem zeros em todas as 8 posições de categoria. Para o chord, o jogo não contribui com arestas. Isso é flagged no painel Data Quality.

**P: Como o linked highlight suporta a análise?**
R: Exemplo: selecionar um cluster de jogos longos e complexos no K-Means destaca esses jogos no PC (confirmando rating alto e minage elevado), no PageRank (vendo quais são hubs) e no Chord (revelando "Worker Placement" como mecânica dominante). Isso cruza 3 análises em 1 interação.

**P: Qual o custo computacional de recomputar k-means + PageRank?**
R: Para top-100, k-means converge em <10 iterações (~5ms); PageRank em <20 iterações (~2ms). Para top-1000, o tempo sobe mas ainda é <500ms total, aceitável para uma operação on-demand via WebSocket.

---

## SLIDE 15 — Encerramento

**Título:** Obrigado

**Conteúdo:**
- Link do repositório / entrega ILIAS
- *"Alguma pergunta?"*
