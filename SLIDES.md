# Slide Script – BoardGame Visual Analytics Project 2

Visual Analytics · Summer Semester 2026 · Universität zu Köln

> This document is the internal presentation script. Each section corresponds to one slide or slide block.
> Text in *italics* are suggested talking points for the oral presentation.

---

## SLIDE 1 — Cover

**Title:** BoardGame Visual Analytics – Project 2
**Subtitle:** Clustering & Graph Analysis of the BGG Recommendation Network
**Content:** Group members · Universität zu Köln · July 2026

---

## SLIDE 2 — Project Overview

**Title:** What does Project 2 add to Project 1?

**Content (3 visual blocks):**
```
[Larger dataset]          [2 new charts]              [Linked highlighting]
 2 CSVs → 1,000 games     K-Means (Trend)              5 coordinated views
 dirty data handled        PageRank (Significance)      1 click propagates
 dynamic top-X filter                                   to all views
```

*"In Project 1 we used a pre-processed dataset of 100 games. In Project 2 we start from two raw CSVs with dirty data, generate a 1,000-game dataset, and add two new analytical charts linked to the existing dashboard."*

---

## SLIDE 3 — Task 1: Dataset and Sources

**Title:** Task 1 – Dataset: Two Sources, One Join

**Content:**

| File | Size | Content |
|------|------|---------|
| `recommendations-2021-12-31.csv` | 1,000 rows | BGG Top-1000: ranking, rating, up to 28 fan recommendations per game |
| `bgg_Gameitems.csv` | ~114,000 rows | Full metadata: categories, mechanics, players, playtime, designer |

**Simple diagram:**
```
recommendations CSV  ──┐
                        ├── join by bgg_id ──→ boardgames_1000.json
bgg_Gameitems CSV    ──┘
```

*"The two files are joined by the BGG game ID. For each of the 1,000 ranked games, we look up the full metadata from the larger file. The resulting JSON feeds all the visualizations."*

---

## SLIDE 4 — Task 1: Dirty Data and Handling

**Title:** Task 1 – Data Quality Issues and Cleaning Strategy

**Table:**

| Issue | Cases | Strategy |
|-------|-------|----------|
| Invalid playtime (0 or negative) | 1 | Imputed: 30 min |
| Missing categories | 2 | Empty list; primary = "Other" |
| min_players > max_players | variable | Automatic swap |
| Duplicate recommendations | variable | Deduplication via Set |
| Missing year | variable | null (kept) |
| Missing rating | variable | Fallback 0 |

**Visual:** screenshot of the "Data Quality" + "Cleaning strategy" sidebar panels

*"The data was relatively clean — only 3 structural issues across the 1,000 records. The sidebar panel shows live counters as the analyst changes the top-X filter."*

---

## SLIDE 5 — Task 1: Dynamic Top-X Filter

**Title:** Task 1 – Dynamic Filtering: Top-X Games

**Content:**
- Sidebar selector: **100 / 200 / 500 / 1,000**
- Change triggers `requestData` via WebSocket
- Server recomputes k-means + PageRank for the new subset
- All 5 views update simultaneously

*"The analyst can switch between top-100 (most competitive, denser cluster structure) and top-1000 (more variety, much larger graph). K-Means and PageRank are recomputed automatically."*

---

## SLIDE 6 — Task 2: The Analysis Task (5-tuple)

**Title:** Task 2 – K-Means: Analysis Task (Trend)

**5-tuple highlighted:**

| | |
|-|-|
| **Action** | Identify — Trend |
| **Who** | Board game analyst |
| **How** | K-Means++ in 14 dimensions |
| **Data** | Rating, playtime, mechanics, minage, players, log(reviews) + 8 one-hot categories |
| **Why** | Discover whether games similar in complexity and theme form cohesive groups with distinct rating and duration patterns |

**Research question:**
> *"Do board games with similar mechanics and categories also cluster into distinct rating and playtime bands?"*

*"The task is to identify a trend. K-Means does the grouping in 14 dimensions, and we project it onto 2D to see if the clusters make visual sense."*

---

## SLIDE 7 — Task 2: Features and Algorithm

**Title:** Task 2 – Feature Encoding and K-Means++

**Left block — 14 dimensions:**
```
Numeric (norm. [0,1])         One-hot (top-8 categories)
─────────────────────         ──────────────────────────
rating_value                  Economic    (0 or 1)
playtime_avg                  Fantasy     (0 or 1)
num_mechanics                 Sci-Fi      (0 or 1)
minage                        Adventure   (0 or 1)
players_avg                   Fighting    (0 or 1)
log10(reviews + 1)            Exploration (0 or 1)
                              Civilization(0 or 1)
                              Card Game   (0 or 1)
```

**Right block — why Manhattan:**
- Euclidean squares differences → over-weights continuous outliers
- Manhattan distributes equal weight between continuous and binary dimensions
- Analyst can test Euclidean / Chebyshev with 1 click

*"The choice of metric matters here because we have binary dimensions (0 or 1) mixed with continuous ones. Manhattan treats both more uniformly."*

---

## SLIDE 8 — Task 2: Visualization

**Title:** Task 2 – K-Means Visualization

**Visual:** screenshot of the K-Means chart

**Elements with annotations:**
- Colored dots by cluster (palette independent from category palette)
- Dashed outline = convex hull (cluster extent in 2D)
- Diamond = centroid (cluster mean position on display axes)
- Legend: `C1 n=33 · Short · Complex · Economic`
- Axes: Rating (Y) × Avg Playtime (X)
- Footer note: "clustering uses all 14 dimensions; axes are display projection only"

*"The axes are Rating and Playtime because they are the most interpretable. The convex hull makes it clear where each cluster occupies space, and the diamond marks the center. The legend shows the auto-generated profile for each cluster."*

---

## SLIDE 9 — Task 3: The Analysis Task (5-tuple)

**Title:** Task 3 – PageRank: Analysis Task (Graph · Significance)

**5-tuple:**

| | |
|-|-|
| **Action** | Describe / Correlate |
| **Who** | Board game analyst / recommender |
| **How** | Force-directed graph with node size ∝ PageRank; click reveals shared features panel |
| **Data** | PageRank scores, fans_liked edges, category, mechanics, rating |
| **Why** | Identify key games in the recommendation network and describe what they share with the games they recommend |

**Research question:**
> *"Which characteristics correlate with being a central hub in the recommendation network — and what does a key game have in common with its recommendees?"*

---

## SLIDE 10 — Task 3: Visualization and Interaction

**Title:** Task 3 – Recommendation Graph (PageRank)

**Visual:** screenshot of the PageRank graph with annotations

**Annotated elements:**
- Large node = high PageRank (significance)
- Gold ring = top-10 most significant games (always labeled)
- Arrow edge = A recommends B (fans_liked)
- Color = primary game category (same palette as other views)
- Zoom + pan + drag available

**On clicking a node:**
- **Thick amber ring** = selected game
- **Teal ring** = direct recommendees of that game
- Other nodes → faded
- Sidebar panel: PageRank score · list of recommendees · shared features tags

*"Node size is what shows significance. The gold rings mark the top-10 that are always visible. When you click a game, its recommendees get a teal ring, and the sidebar shows shared features — this directly answers the correlation task."*

---

## SLIDE 11 — Task 4: Linked Highlighting

**Title:** Task 4 – All Views Connected

**Flow diagram:**
```
K-Means click  ──┐
PageRank click ──┼──→  highlightIds (Set<id>)  ──→  highlightPC()
Bubble click   ──┘                                   highlightBubble()
                                                     highlightKMeans()
PC brush  ─────────→  brushFilter  (Set<id>)  ──→  highlightPageRank()
                                                     highlightChord()  ← redrawn
```

**3 selection modes:**
1. **Click in K-Means** → highlights the entire cluster
2. **Click in PageRank** → highlights the game + its direct recommendees
3. **Brush in Parallel Coordinates** → filters any numeric attribute range

*"Any selection in any view propagates to all others. The chord is special: instead of just fading, it is redrawn with only the selected games' edges, revealing the dominant mechanics and categories of the subset."*

---

## SLIDE 12 — Demo Script (internal notes)

**Title:** [INTERNAL SLIDE – DO NOT PRESENT] Live Demo Script

**Suggested sequence (5–7 minutes):**

1. **Open the dashboard** at `http://localhost:3000` with Top 100 / k=5 / Euclidean
   - Point out the 4 panels + chord at the bottom
   - Show "Data Quality" in the sidebar

2. **K-Means interaction:**
   - Move the slider from k=5 to k=3 → show clusters changing
   - Switch metric to Manhattan → show difference in clusters
   - Return to k=5 Euclidean
   - **Click a dot from a large cluster** (e.g. the Economic/Short cluster)
   - Show how PC, Bubble, PageRank and Chord all respond

3. **PageRank interaction:**
   - Click one of the gold-ring nodes (e.g. Scythe or Gloomhaven)
   - Show: amber ring on selected node, teal rings on recommendees
   - Open sidebar: PageRank score, list of recommendees, shared features
   - Show PC and Bubble highlighted accordingly

4. **Dynamic top-X:**
   - Switch to Top 1000 → show much denser PageRank graph
   - Show Data Quality counter increasing

5. **Parallel Coordinates brush:**
   - Drag a brush on "Rating" to filter games with rating > 8.5
   - Show which games appear in K-Means and the graph

6. **Clear highlight:** button in sidebar

---

## SLIDE 13 — Design Decisions

**Title:** Design Decisions – Why These Choices?

**4 cards:**

**Scatter for K-Means**
→ Rating × Playtime are the most interpretable axes; convex hull shows cluster extent; clustering happens in 14D, display is a 2D projection

**Manhattan as default**
→ Binary one-hot (0/1) and continuous dimensions get equal weight; Euclidean squares differences and over-weights continuous outliers

**Force-directed for PageRank**
→ Non-hierarchical sparse graph; hubs naturally move to center; interactive drag; scales to 1,000 nodes and 16,000+ edges

**Chord redrawn vs. faded**
→ Fading does not change visual proportions; redrawing reveals the actual category and mechanic composition of the selected subset

---

## SLIDE 14 — Anticipated Questions (internal prep)

**Title:** [INTERNAL SLIDE] Likely Questions and Answers

**Q: Why K-Means and not another algorithm (DBSCAN, hierarchical)?**
A: K-Means is parametric (analyst controls k), fast enough to recompute on-demand via WebSocket, and convex hulls work naturally with K-Means clusters. DBSCAN does not require k but does not produce convex boundaries; hierarchical clustering is slower and requires a dendrogram to visualize.

**Q: Why normalize to [0,1] and not use z-score?**
A: With one-hot dimensions, z-score would produce values outside [0,1] for continuous dimensions, unbalancing the feature space. Min-max normalization ensures all dimensions — continuous and binary — share the same maximum range of contribution.

**Q: Why use fans_liked for PageRank and not the game rating?**
A: fans_liked represents explicit player recommendations — a directed edge "fans of A tend to also like B." Rating is an attribute of a single game, not a relationship between games. PageRank requires a graph, not individual scores.

**Q: What happens if a game has no categories?**
A: The `categories` field is stored as `[]` and `category_primary` becomes `"Other"`. For k-means, the one-hot vector has zeros in all 8 category positions. For the chord, the game contributes no edges. This is flagged in the Data Quality panel.

**Q: How does linked highlighting support the analysis?**
A: Example: selecting a cluster of long, complex games in K-Means highlights those games in the PC (confirming high rating and high minage), in the PageRank graph (seeing which are recommendation hubs), and in the Chord (revealing "Worker Placement" as the dominant mechanic). Three analyses in one interaction.

**Q: What is the computational cost of recomputing k-means + PageRank?**
A: For top-100, k-means converges in under 10 iterations (~5ms); PageRank in under 20 iterations (~2ms). For top-1000, the total is under 500ms — acceptable for an on-demand WebSocket request.

---

## SLIDE 15 — Closing

**Title:** Thank You

**Content:**
- ILIAS submission link / repository
- *"Any questions?"*
