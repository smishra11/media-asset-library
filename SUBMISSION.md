# Submission

Keep this tight. Bullet points are fine. We read this before we read your code,
and a clear account of your reasoning carries real weight — including where you
chose not to do something.

## Video walkthrough

Paste your Loom (or equivalent) link here. 5–10 minutes.

**Link:**

---

## How to run it

Anything we need to know beyond `npm install && npm run dev`.

## Time spent

Roughly, and how you split it.

---

## Baseline defects found

| #   | Defect                                                                            | Where                         | Fixed / left / out of scope |
| --- | --------------------------------------------------------------------------------- | ----------------------------- | --------------------------- |
| 1   | Bulk update sends >50 ids in one call                                             | `App.tsx`                     |                             |
| 2   | Missing request cancellation causes search race conditions and stale UI           | `useAssets.ts`                |                             |
| 3   | Search input fires requests on every keystroke (no debounce), tripping rate limit | `App.tsx`                     |                             |
| 4   | Grid lacks virtualization/pagination; renders all fetched items at once           | `AssetGrid.tsx`               |                             |
| 5   | Selection state changes re-render the entire grid unnecessarily                   | `App.tsx` / `AssetGrid.tsx`   |                             |
| 6   | Successful asset edits do not optimistically update the grid                      | `AssetDetail.tsx` / `App.tsx` |                             |
| 7   | Grid is inaccessible via keyboard (no tabindex, no key handlers)                  | `AssetGrid.tsx`               |                             |
| 8   | Missing thumbnails (`hasThumbnail: false`) cause broken images/layout shifts      | `AssetGrid.tsx`               |                             |
| 9   | API errors are flattened into strings; no structural error handling or retries    | `api/client.ts`               |                             |
| 10  | Focus is lost/not managed when opening and closing the detail panel               | `App.tsx` / `AssetDetail.tsx` |                             |

---

## Key decisions

For each significant choice: what you did, what you rejected, and why. Three to
six of these is about right.

**Data fetching and caching**

**Stale response handling**

**Virtualization approach**

**Optimistic updates and rollback**

**Retry and backoff policy**

**State placement and URL sync**

---

## Performance

Fill in real measurements, not estimates. Say which machine and browser.

| Metric                                          | Before | After | How measured |
| ----------------------------------------------- | ------ | ----- | ------------ |
| Rendered DOM nodes at 5,000 rows loaded         |        |       |              |
| Cards re-rendered when toggling one selection   |        |       |              |
| Longest task during sustained scroll            |        |       |              |
| Requests fired while typing a 6-character query |        |       |              |
| Production bundle, gzipped                      |        |       |              |

What was the actual bottleneck, and how did you find it?

---

## Accessibility

- Keyboard model you implemented, in one paragraph.
- How you tested it, including any screen reader.
- Known gaps.

---

## Interface decisions

Three or four sentences: what you were optimising for, and the decisions that
follow from it. Then briefly:

- **Visual system.** Your colour, spacing and type decisions, and where they live.
- **Status treatment.** How the four statuses read as a progression, and how they
  stay distinguishable without relying on colour.
- **States.** What you did with loading, empty, error, offline and partial
  failure.
- **Contrast.** What you checked against, and with what.
- **Copy.** Any user-facing message you rewrote and why.

Screenshots in the repo are welcome — link them here.

---

## Trade-offs and cuts

What you deliberately did not do, and what you would do with another day.

## Critique of the API

What you would change about the backend contract, and what it forced you to do in
the client that you would rather not have.

## Anything you would like us to look at

Code you are proud of, or a decision you are unsure about and want to discuss.
