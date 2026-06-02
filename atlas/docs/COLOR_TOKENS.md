# Atlas Color Tokens (T103.7 / T103.10)

## State palette (the ONLY colors on data surfaces)

| Token                       | Hex       | Use                                                  |
| --------------------------- | --------- | ---------------------------------------------------- |
| `--color-positive`          | `#15803d` | Healthy / committed / current / approved             |
| `--color-warning`           | `#a16207` | Warning / pending / approaching threshold / prospect |
| `--color-negative`          | `#b91c1c` | Breach / overdue / urgent / error                    |
| `--color-info`              | `#1e40af` | Link / interactive (use sparingly)                   |
| `--color-accent-lime`       | `#ddec65` | **Primary CTA only** — one per page maximum          |
| `--color-brand-sand`        | `#e8dfcc` | Hero / sign-in containers (NOT on data surfaces)     |
| `--color-brand-sand-soft`   | `#f2ecdc` | Sign-in page background / hero bg                    |
| `--color-brand-sand-strong` | `#d4c7ad` | Dot-grid hover peak / sand accent                    |

## Monochrome chart palette (T103.10)

Default for all charts — use color only for the exceptions below.

| Token               | Hex       | Series                      |
| ------------------- | --------- | --------------------------- |
| `--chart-default-1` | `#0D0D0D` | Primary series — near-black |
| `--chart-default-2` | `#4B4B48` | Secondary — 70%             |
| `--chart-default-3` | `#8A8780` | Tertiary — 50%              |
| `--chart-default-4` | `#C4C0B5` | Quaternary — 30%            |
| `--chart-axis`      | `#B0B5BC` | Axis lines                  |
| `--chart-gridline`  | `#EFEFEC` | Gridlines                   |

## Multi-color exceptions

| Surface                                      | Palette                                                                                                                           | Rationale                                |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Owner Distribution Timeline (/earnings)      | Muted multi-hue (desaturated, equal lightness)                                                                                    | Per-project differentiation is essential |
| Pipeline stage columns                       | Tonal hue per stage (desaturated)                                                                                                 | Visual stage separation                  |
| State badges (committed / prospect / breach) | State colors above                                                                                                                | These are signals, not decoration        |
| Project cash-flow chart (flows)              | Functional colors: teal (debt draws), green (sale), amber (construction), red (financing), grey (soft/repaid), black (cumulative) | Each bar type needs distinct identity    |

## Lime discipline (T103.10)

Lime (`#DDEC65`) is reserved for exactly **one primary CTA per page**:

| Route           | Lime CTA                             |
| --------------- | ------------------------------------ |
| `/sign-in`      | Sign in button                       |
| `/projects/new` | Create project (submit)              |
| `/pricing`      | Refresh comps                        |
| `/pipeline`     | Advance to committed                 |
| `/settings`     | Save changes                         |
| `/dashboard`    | (none currently)                     |
| `/earnings`     | (none — admin distribution UI is V7) |

**Forbidden**: lime in chart series, lime in hover states, lime in icons, lime on more than one button per page.
