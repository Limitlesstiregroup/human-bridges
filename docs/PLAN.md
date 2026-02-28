# Human Bridges — Plan

## Purpose
Create an interactive experience that visualizes how people are split into identity bubbles (religion, city, politics, sports, language, class, etc.), and then helps users explore pathways toward common ground.

## Core Experiences
1. **Division Heatmap**
   - Matrix of identity dimensions vs dimensions.
   - Darker cells = higher polarization pressure.
   - Hover reveals why this division tends to intensify conflict.

2. **Identity Bubble Map**
   - Bubble field where each bubble is a group identity.
   - Bubble size = group attachment intensity.
   - Distance = perceived social distance.
   - Sliders let users increase/decrease media outrage, scarcity fear, algorithmic sorting, and propaganda intensity.

3. **Manipulation Levers Panel**
   - Toggle systems that increase division:
     - outrage ranking algorithms
     - fear-based messaging
     - us-vs-them narratives
     - economic stress
   - Real-time recalculation of fragmentation score.

4. **Bridge Builder Mode**
   - Users turn on interventions:
     - shared goals
     - mixed-group collaboration
     - empathy stories
     - local trust projects
   - Fragmentation score drops; connection graph strengthens.

5. **Reflection Prompt**
   - “Which 2 identities do you assume the most about?”
   - “What common need exists across all bubbles?”

## Metrics shown in UI
- Fragmentation Score (0-100)
- Social Trust Index (0-100)
- Cross-Bubble Contact Rate (%)
- Manipulation Pressure (0-100)

## Build Steps
1. Define model + default datasets.
2. Build static web app (single-page) with:
   - heatmap canvas
   - bubble simulation panel
   - controls + metrics
3. Implement live recalculation engine.
4. Add preset scenarios:
   - “Calm society”
   - “High outrage media”
   - “Election season”
   - “Bridge-building coalition”
5. Add explanatory copy and accessibility labels.

## Technical Stack
- Plain HTML/CSS/JS (no backend required for v1 interactive visualization).
- Optional later: save/share scenarios via backend.

## Ethical Guardrails
- Avoid targeting real protected groups with harmful framing.
- Keep visualization educational, not accusatory.
- Focus on systems and incentives, not demonizing populations.
