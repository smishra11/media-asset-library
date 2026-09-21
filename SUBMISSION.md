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
| 1   | Bulk update sends >50 ids in one call                                             | `App.tsx`                     | Fixed                       |
| 2   | Missing request cancellation causes search race conditions and stale UI           | `useAssets.ts`                |                             |
| 3   | Search input fires requests on every keystroke (no debounce), tripping rate limit | `App.tsx`                     |                             |
| 4   | Grid lacks virtualization/pagination; renders all fetched items at once           | `AssetGrid.tsx`               | Fixed                       |
| 5   | Selection state changes re-render the entire grid unnecessarily                   | `App.tsx` / `AssetGrid.tsx`   | Fixed                       |
| 6   | Successful asset edits do not optimistically update the grid                      | `AssetDetail.tsx` / `App.tsx` | Fixed                       |
| 7   | Grid is inaccessible via keyboard (no tabindex, no key handlers)                  | `AssetGrid.tsx`               |                             |
| 8   | Missing thumbnails (`hasThumbnail: false`) cause broken images/layout shifts      | `AssetGrid.tsx`               | Fixed                       |
| 9   | API errors are flattened into strings; no structural error handling or retries    | `api/client.ts`               |                             |
| 10  | Focus is lost/not managed when opening and closing the detail panel               | `App.tsx` / `AssetDetail.tsx` |                             |

---

## Key decisions

For each significant choice: what you did, what you rejected, and why. Three to
six of these is about right.

**Data fetching and caching**

- **Did:** Migrated the custom fetch hook to `@tanstack/react-query`.
- **Rejected:** Building custom `useEffect` logic with our own loading/error states and deduplication.
- **Why:** React Query handles deduplication, caching, and state management out of the box, keeping the component code extremely clean and providing a solid foundation for request cancellation and future retries.

**Stale response handling**

- **Did:** Passed the React Query `AbortSignal` directly into the native `fetch` client.
- **Rejected:** Tracking request IDs or manually ignoring old responses in state.
- **Why:** Aborting the request at the network level is the cleanest and most reliable way to prevent race conditions (like a slow short query overwriting a fast long query), and it saves bandwidth.

**Virtualization approach**

- **Did:** Used `react-virtuoso`'s `<VirtuosoGrid>` to virtualize the CSS grid, paired with `useInfiniteQuery` for cursor pagination.
- **Rejected:** Using `@tanstack/react-virtual` or rolling our own IntersectionObserver math.
- **Why:** Responsive wrapping grids (using `auto-fill`) are notoriously difficult to virtualize because the column count changes on window resize. `react-virtuoso` natively handles responsive grids with zero math required, significantly reducing complexity and potential bugs.

**Optimistic updates and rollback**

- **Did:** Instantly mutated the React Query cache using `setQueriesData` before making network requests, and manually reverted only the failed IDs when a `207 Multi-Status` response occurred.
- **Rejected:** Using React 19's `useOptimistic` hook, or forcing a full cache invalidation/refetch on partial failures.
- **Why:** `useOptimistic` requires local state synchronization which conflicts with React Query's global cache architecture. Directly mutating the cache guarantees that every component (grid, detail panel) instantly reflects the changes. For partial rollbacks, a full refetch would waste bandwidth and cause UI layout shifts, whereas precisely reverting only the failed IDs is highly efficient and seamless.

**409 Version Conflict Handling**

- **Did:** Displayed a user-friendly error with a "Reload Latest Version" button inside the Detail Panel instead of automatically overwriting.
- **Rejected:** Automatically force-overwriting the asset with the user's new status.
- **Why:** If another user archived the asset or changed critical metadata, silently overwriting it with a new status (like "Approved") could violate business rules. Forcing the user to pull the latest state first ensures they make an informed decision based on the newest data.

**Retry and backoff policy**

**State placement and URL sync**

- **Did:** Used native `URLSearchParams` and `history.replaceState` inside a `useEffect` in `App.tsx` to sync the filter state to the URL.
- **Rejected:** Using a heavy routing library like `react-router-dom`.
- **Why:** Since this is a simple single-page application with only a few query parameters, pulling in a large routing dependency would unnecessarily bloat the bundle size. Native browser APIs accomplish the sync perfectly with zero extra bytes.

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
