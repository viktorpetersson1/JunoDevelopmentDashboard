# Atlas Color Tokens (T103.7 / T103.10)

## State palette (the ONLY colors on data surfaces)

| Token                       | Hex       | Use                                                                            |
| --------------------------- | --------- | ------------------------------------------------------------------------------ |
| `--color-positive`          | `#15803d` | Healthy / committed / current / approved                                       |
| `--color-warning`           | `#a16207` | Warning / pending / approaching threshold / prospect                           |
| `--color-negative`          | `#b91c1c` | Breach / overdue / urgent / error                                              |
| `--color-info`              | `#1e40af` | Link / interactive (use sparingly)                                             |
| `--color-accent-lime`       | `#ddec65` | **Primary CTA only** — one per page maximum                                    |
| `--color-brand-sand`        | `#e8dfcc` | Reserved for V6 hero / distribution-forecast surface (NOT on data UI)          |
| `--color-brand-sand-soft`   | `#f2ecdc` | Reserved (was sign-in bg; sign-in is now pure white per 2 Jun visual feedback) |
| `--color-brand-sand-strong` | `#d4c7ad` | Reserved (was dot-grid peak; dot-grid now uses medium grey `#9a9a96`)          |

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

## Card + Section tokens (T103.5/.9 — added 2 Jun)

Single source of truth for the white-on-grey-on-white container pattern.
Every page that wants the Ramp aesthetic uses these via the `<Section>` and
`<Card>` helpers in `app/_components/section.tsx`.

| Token                  | Value                                    | Use                                                |
| ---------------------- | ---------------------------------------- | -------------------------------------------------- |
| `--ja-card-bg`         | `var(--color-surface-base)` (white)      | Inner card background                              |
| `--ja-card-border`     | `1px solid var(--color-border-hairline)` | Inner card hairline border                         |
| `--ja-card-radius`     | `12px`                                   | Inner card corner radius                           |
| `--ja-card-padding`    | `24px`                                   | Inner card padding                                 |
| `--ja-card-gap`        | `16px`                                   | Gap between cards inside a section                 |
| `--ja-section-bg`      | `var(--color-surface-muted)` (#f4f4f2)   | Soft warm-grey container that groups related cards |
| `--ja-section-border`  | (none — sections have no border)         | —                                                  |
| `--ja-section-radius`  | `16px`                                   | Section corner radius (slightly larger than card)  |
| `--ja-section-padding` | `20px`                                   | Section internal padding                           |
| `--ja-section-gap`     | `24px`                                   | Gap between sections on a page                     |

**Change the look of every surface platform-wide by editing one file (`tokens.css`).**

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
