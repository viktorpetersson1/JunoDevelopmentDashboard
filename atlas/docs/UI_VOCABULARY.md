# Atlas UI Vocabulary (T103.4)

Primary action labels — always **verb-first imperative** tense.
Every CTA in V5.2 surfaces uses exactly these labels.

| Action          | Canonical label          | NOT                                        |
| --------------- | ------------------------ | ------------------------------------------ |
| Open a project  | **Open project**         | View / Go to project / See project         |
| Lock a snapshot | **Lock snapshot**        | Approve / Snapshot now / Submit            |
| Refresh comps   | **Refresh comps**        | Update market data / Re-run / Refresh data |
| Advance to comm | **Advance to committed** | Move forward / Convert / Mark committed    |
| Navigate to pip | **Open pipeline**        | See pipeline / Go to pipeline              |
| Create snapshot | **Capture draft**        | Create snapshot / Start review             |
| New snapshot    | **New snapshot**         | Create another / New version               |
| Sign in         | **Sign in**              | Login / Log in                             |
| Sign out        | **Sign out**             | Logout / Log out                           |

## Font-weight rule (T103.8)

Only two weights are permitted in component code:

- `font-weight: 400` (`--font-weight-regular`) — ALL body text, table cells, paragraph copy, labels, hints
- `font-weight: 700` (`--font-weight-bold`) — ALL emphasis: KPI values, page headings, section labels, button text

The `--font-weight-medium` (500) and `--font-weight-semibold` (600) tokens are preserved in `tokens.css`
but **forbidden** in component usage. Future exceptions require Viktor sign-off.

## List treatment

| Surface          | Treatment                                                       |
| ---------------- | --------------------------------------------------------------- |
| `/projects`      | Table (project name + stage + tier + NPAT + IRR + last updated) |
| `/pipeline`      | Kanban cards (stage transitions are visual — keep cards)        |
| Distribution log | Table                                                           |
| Notifications    | Soft list items separated by hairlines                          |
| Risks list       | Cards (free-form content)                                       |

Documented here so reviewers can quickly check the chosen treatment vs a proposed change.
