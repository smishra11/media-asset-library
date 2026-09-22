# Submission

Keep this tight. Bullet points are fine. We read this before we read your code,
and a clear account of your reasoning carries real weight - including where you
chose not to do something.

## Video walkthrough

https://drive.google.com/file/d/1x7GsjQyMq43c5UEJ4blDuWs5TYfgmbvC/view?usp=sharing

**Link:**

---

## How to run it

Anything we need to know beyond `npm install && npm run dev`.

## Time spent

Roughly 15 hours in total, split across a few days. I wanted to make sure I wasn't just throwing libraries at the problems, but actually understanding the architectural trade-offs.

- **~3 hours:** Initial codebase audit, setting up React Query, fixing the search race conditions and debounce logic.
- **~4 hours:** Implementing `react-virtuoso`, fighting with CSS grid geometry for responsive columns, and strictly memoizing the asset cards to meet the performance budget.
- **~4 hours:** Building the chunked batching system for bulk edits, optimistic rollbacks, the custom exponential backoff wrapper, and offline detection.
- **~2 hours:** Nailing the accessibility. Calculating arrow-key grid navigation without focus traps took some trial and error.
- **~2 hours:** Replacing the wireframe UI with a cohesive native CSS token system and integrating Lucide icons.

---

## Baseline defects found

| #   | Defect                                                                            | Where                         | Fixed / left / out of scope |
| --- | --------------------------------------------------------------------------------- | ----------------------------- | --------------------------- |
| 1   | Bulk update sends >50 ids in one call                                             | `App.tsx`                     | Fixed                       |
| 2   | Missing request cancellation causes search race conditions and stale UI           | `useAssets.ts`                | Fixed                       |
| 3   | Search input fires requests on every keystroke (no debounce), tripping rate limit | `App.tsx`                     | Fixed                       |
| 4   | Grid lacks virtualization/pagination; renders all fetched items at once           | `AssetGrid.tsx`               | Fixed                       |
| 5   | Selection state changes re-render the entire grid unnecessarily                   | `App.tsx` / `AssetGrid.tsx`   | Fixed                       |
| 6   | Successful asset edits do not optimistically update the grid                      | `AssetDetail.tsx` / `App.tsx` | Fixed                       |
| 7   | Grid is inaccessible via keyboard (no tabindex, no key handlers)                  | `AssetGrid.tsx`               | Fixed                       |
| 8   | Missing thumbnails (`hasThumbnail: false`) cause broken images/layout shifts      | `AssetGrid.tsx`               | Fixed                       |
| 9   | API errors are flattened into strings; no structural error handling or retries    | `api/client.ts`               | Fixed                       |
| 10  | Focus is lost/not managed when opening and closing the detail panel               | `App.tsx` / `AssetDetail.tsx` | Fixed                       |

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

- **Did:** Implemented a custom `while` loop in `client.ts` with exponential backoff (`1000ms * 2^attempt`), randomized jitter, and `Retry-After` header extraction.
- **Rejected:** Relying entirely on React Query's default retry behavior.
- **Why:** React Query's built-in retries cannot pause mid-flight to honor a server's exact `Retry-After` header. my custom fetch wrapper strictly segregates permanent data errors (400, 409) from transient network failures (429, 503) and handles rate limits perfectly. I explicitly disabled React Query's duplicate retries (`retry: false`) to prevent exponential loop multiplication.

**State placement and URL sync**

- **Did:** Used native `URLSearchParams` and `history.replaceState` inside a `useEffect` in `App.tsx` to sync the filter state to the URL.
- **Rejected:** Using a heavy routing library like `react-router-dom`.
- **Why:** Since this is a simple single-page application with only a few query parameters, pulling in a large routing dependency would unnecessarily bloat the bundle size. Native browser APIs accomplish the sync perfectly with zero extra bytes.

---

## Performance

I measured this on an MSI Notebook using Chrome.

| Metric                                          | Before  | After | How measured                       |
| ----------------------------------------------- | ------- | ----- | ---------------------------------- |
| Rendered DOM nodes at 5,000 rows loaded         | ~15,200 | ~180  | Chrome DevTools Elements tab       |
| Cards re-rendered when toggling one selection   | All 24  | 2     | React Profiler (Highlight Updates) |
| Longest task during sustained scroll            | >200ms  | <15ms | Chrome Performance Tab             |
| Requests fired while typing a 6-character query | 6       | 1     | Chrome Network Tab                 |
| Production bundle, gzipped                      | N/A     | 83 KB | Vite build output                  |

The real bottleneck was DOM bloat and unnecessary React renders. Toggling a single checkbox forced the entire grid array to reconcile. By pulling the selected state down into a boolean prop via `React.memo` and using `react-virtuoso` to slice the DOM, I flattened the rendering cost entirely.

---

## Accessibility

- **Keyboard Model:** Implemented a standard Roving Tabindex for the grid. Only the active card receives `tabIndex={0}` to prevent trapping users in thousands of tab stops. Arrow keys calculate CSS Grid geometry to move focus seamlessly across columns and rows, scrolling the virtualized container automatically when reaching edges. `Enter` opens the panel, `Space` toggles selection, and `Shift+Arrow` extends the range.
- **Focus Management:** Opening the detail panel explicitly moves focus to its "Close" button. The grid memorizes the `focusedIndex` (even if opened via mouse click), and closing the panel (via button or `Escape`) programmatically returns focus back to the exact originating card. If the card was detached/filtered out, focus safely falls back to the document body.
- **Screen Reader Testing:** Tested using NVDA on Windows and VoiceOver on macOS. Ensured decorative thumbnails have `alt=""` so they are ignored, the grid uses `role="grid"` and `role="gridcell"`, and checkboxes have explicitly readable `aria-label`s.
- **Live Regions:** Created a visually hidden `aria-live="polite"` region. Tied it to the debounced search loading state (announcing "Showing X assets") and the bulk notice banner (announcing "Updated 50 assets"), ensuring users receive crucial context without spamming every keystroke.
- **Known gaps:** Drag-and-drop selection for mouse users is not implemented; selection heavily favors Shift-click and keyboard navigation.

---

## Interface decisions

I wanted the app to feel fast, clean, and completely out of the user's way. I optimized for scanning speed - users shouldn't have to guess what state an asset is in.

- **Visual system.** I set up a simple native CSS variable system in styles.css. Instead of pulling in Tailwind and fighting with build configs, I just mapped out a grayscale palette, semantic colors, and a 4px/8px/16px spacing scale globally.
- **Status treatment.** I ripped out the color-only pills and brought in lucide-react icons. Now, statuses read as a progression (empty dashed circle for draft, hourglass for review, solid check for approved, slashed circle for archived). Colorblind users can actually tell them apart now.
- **States.** I replaced the raw empty divs with centered hero states containing large Lucide icons. I added a bold red offline banner to the top so people know exactly why their buttons are disabled. For the bulk action bar, I anchored it right below the search with primary blue buttons so it feels like a unified toolbar rather than a random floating element.
- **Contrast.** I verified the --ink-soft and --bg-soft tokens hit APCA contrast guidelines. The UI doesn't rely on faint grays for critical information.
- **Copy.** I intercepted HTTP 429 and 500 errors in the fetch wrapper and swapped out the raw string dumps with human-readable copy (like "The server is currently busy" instead of "Too Many Requests").

---

## Trade-offs and cuts

- **Offline Write Queuing:** The task explicitly listed offline queuing as a bonus. Given the strict time limits of this assessment, I chose to disable mutations while offline rather than building an IndexedDB sync queue, ensuring users don't lose data in the ether while maintaining a stable core architecture.

## Critique of the API

- **Cursor Pagination missing total counts:** The API returns `nextCursor` but does not return a `totalCount` of all assets matching the query. Because of this, the UI cannot accurately tell the user "Showing 24 of 12,400 assets." I had to fake this by looking at `Number(nextCursor)` inside `useAssets`, but a robust API should always return `{ items, nextCursor, totalCount }`.
- **Bulk Edit Endpoint Limits:** The `PATCH /api/assets` endpoint forcibly fails if handed >50 IDs, but bulk selection on a virtualized grid implies users can select thousands of items. This forces the client to implement a chunking and concurrency-limiting system (which we built). A better API design would be to accept arbitrary amounts of IDs and process them asynchronously in a background job, returning a `jobId` for the client to poll.
- **Race conditions in short queries:** The mock API explicitly adds an artificial delay to short search queries (`q=tra`), returning them _after_ later queries (`q=train`). In production, the backend should either cancel older queries automatically or provide an explicit `ETag`/Sequence ID so the client doesn't have to rely purely on `AbortController` cleanup logic.

## Anything you would like us to look at

- **The Virtualization + Grid Geometry Logic:** I am very proud of the combination of `react-virtuoso` with my custom keyboard `onKeyDown` math in `AssetGrid.tsx`. Virtualizing a CSS `auto-fill` grid is notoriously difficult, but the solution seamlessly calculates columns and rows on the fly, allowing flawless arrow-key navigation across thousands of items without freezing the browser or trapping focus.
- **The Design System implementation:** For Task 6, rather than installing a massive UI library or Tailwind (which requires build config), I built a fully cohesive native CSS variable system in `styles.css`. I implemented clear tokens for spacing, typography, and semantic colors, paired with `lucide-react` icons. This demonstrates a strong grasp of vanilla CSS architecture and accessibility (such as not relying on color alone for asset status).
