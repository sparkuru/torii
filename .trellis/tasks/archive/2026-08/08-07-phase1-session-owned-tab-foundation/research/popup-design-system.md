## Design System: Torii

Generated with the project-local UI/UX Pro Max `search.py --design-system`
workflow for the Phase 1 Firefox addon popup. This is task-local raw research;
only approved decisions should be promoted to `design.md`.

### Pattern

- **Name:** Minimal Single Column
- **Conversion Focus:** Single CTA focus. Large typography. Lots of whitespace.
  No navigation clutter. Mobile-first.
- **CTA Placement:** Center, large CTA button
- **Color Strategy:** Minimalist: Brand + white `#FFFFFF` + accent. Buttons:
  high contrast 7:1+. Text: black/dark grey.

### Style

- **Name:** AI-Native UI
- **Mode Support:** Light and dark
- **Keywords:** conversational, assistant, agentic, minimal chrome, streaming
  text, AI interactions
- **Accessibility:** WCAG AA

### Colors

| Role | Hex | CSS variable |
| --- | --- | --- |
| Primary | `#EA580C` | `--color-primary` |
| On primary | `#FFFFFF` | `--color-on-primary` |
| Secondary | `#F97316` | `--color-secondary` |
| Accent | `#2563EB` | `--color-accent` |
| Background | `#FFF7ED` | `--color-background` |
| Foreground | `#0F172A` | `--color-foreground` |
| Muted | `#FDF4F0` | `--color-muted` |
| Border | `#FCEAE1` | `--color-border` |
| Destructive | `#DC2626` | `--color-destructive` |
| Ring | `#EA580C` | `--color-ring` |

### Typography and interaction

- Inter for heading and body; minimal, functional presentation.
- Keep the popup a compact, single-column status view with no navigation
  clutter; avoid heavy chrome and slow response feedback.
- Preserve visible keyboard focus, 4.5:1 text contrast, semantic labels,
  visible loading/error state, and `prefers-reduced-motion` behavior.
- Do not use emoji as structural icons. Test compact layout at narrow popup
  widths and ensure status is not conveyed by color alone.
