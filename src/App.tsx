import { useState, useEffect } from "react";
import { bulkSetStatus } from "@/api/client";
import { AssetDetail } from "@/features/assets/AssetDetail";
import { AssetGrid } from "@/features/assets/AssetGrid";
import { useAssets } from "@/features/assets/useAssets";
import { statusLabel } from "@/lib/format";
import type { Asset, AssetStatus, AssetQuery } from "@/lib/types";

const STATUSES: AssetStatus[] = ["draft", "in_review", "approved", "archived"];
const SORTS: Array<{ value: NonNullable<AssetQuery["sort"]>; label: string }> =
  [
    { value: "updatedAt:desc", label: "Recently updated" },
    { value: "name:asc", label: "Name A–Z" },
    { value: "sizeBytes:desc", label: "Largest first" },
    { value: "createdAt:desc", label: "Newest" },
  ];

function getInitialState() {
  const params = new URLSearchParams(window.location.search);
  const statusParam = params.get("status");
  return {
    q: params.get("q") || "",
    status: statusParam ? (statusParam.split(",") as AssetStatus[]) : [],
    sort:
      (params.get("sort") as NonNullable<AssetQuery["sort"]>) ||
      "updatedAt:desc",
  };
}

export function App() {
  const initial = getInitialState();
  const [q, setQ] = useState(initial.q);
  const [debouncedQ, setDebouncedQ] = useState(initial.q);
  const [status, setStatus] = useState<AssetStatus[]>(initial.status);
  const [sort, setSort] = useState<NonNullable<AssetQuery["sort"]>>(
    initial.sort,
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Debounce search input to avoid hitting rate limit
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(timer);
  }, [q]);

  // Sync state to URL without reloading
  useEffect(() => {
    const params = new URLSearchParams();
    if (debouncedQ) params.set("q", debouncedQ);
    if (status.length) params.set("status", status.join(","));
    if (sort !== "updatedAt:desc") params.set("sort", sort);

    const newUrl = params.toString()
      ? `?${params.toString()}`
      : window.location.pathname;
    window.history.replaceState(null, "", newUrl);
  }, [debouncedQ, status, sort]);

  // Pass debouncedQ instead of q to prevent excessive API calls
  const {
    items,
    total,
    loading,
    error,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useAssets({
    q: debouncedQ,
    status,
    sort,
    limit: 24,
  });

  function toggleSelect(id: string, shiftKey: boolean = false) {
    if (shiftKey && lastSelectedId) {
      const startIdx = items.findIndex((i) => i.id === lastSelectedId);
      const endIdx = items.findIndex((i) => i.id === id);
      if (startIdx !== -1 && endIdx !== -1) {
        const min = Math.min(startIdx, endIdx);
        const max = Math.max(startIdx, endIdx);
        const rangeIds = items.slice(min, max + 1).map((i) => i.id);

        setSelectedIds((prev) => {
          const next = new Set(prev);
          rangeIds.forEach((rId) => next.add(rId));

          // Update anchor to the newly clicked item
          setLastSelectedId(id);
          return next;
        });
        return;
      }
    }

    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);

      // RCA FIX: If we just deselected an item, the anchor should fall back
      // to the most recently selected item that is still active in our Set.
      // JS Sets maintain insertion order, so we can just grab the last item!
      const arr = Array.from(next);
      setLastSelectedId(arr.length > 0 ? arr[arr.length - 1] : null);

      return next;
    });
  }

  function selectAllLoaded() {
    setSelectedIds(new Set(items.map((i) => i.id)));
  }

  async function applyBulkStatus(next: AssetStatus) {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setNotice(null);
    try {
      // Sends every selected id in one call, which the API refuses above 50.
      const result = await bulkSetStatus(ids, next);
      setNotice(`${result.applied} updated, ${result.failed} failed.`);
      setSelectedIds(new Set());
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Bulk update failed");
    }
  }

  function handleSaved(_asset: Asset) {
    // The list is not told that anything changed, so it shows stale rows.
  }

  return (
    <div className="app">
      <header className="topbar">
        <h1>MediaVault</h1>
        <input
          className="search"
          type="search"
          placeholder="Search assets"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
        >
          {SORTS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </header>

      <div className="filters">
        {STATUSES.map((s) => (
          <label key={s}>
            <input
              type="checkbox"
              checked={status.includes(s)}
              onChange={(e) =>
                setStatus((prev) =>
                  e.target.checked ? [...prev, s] : prev.filter((x) => x !== s),
                )
              }
            />
            {statusLabel(s)}
          </label>
        ))}
        <span className="muted">
          {loading && items.length === 0
            ? "Loading…"
            : `${items.length} of ${total.toLocaleString()} shown`}
        </span>
        <button
          onClick={selectAllLoaded}
          style={{ marginLeft: "auto" }}
          disabled={items.length === 0}
        >
          Select all loaded
        </button>
      </div>

      {selectedIds.size > 0 && (
        <div className="bulkbar">
          <span>{selectedIds.size} selected</span>
          {STATUSES.map((s) => (
            <button key={s} onClick={() => applyBulkStatus(s)}>
              Set {statusLabel(s).toLowerCase()}
            </button>
          ))}
          <button onClick={() => setSelectedIds(new Set())}>
            Clear selection
          </button>
        </div>
      )}

      {notice && <p className="notice">{notice}</p>}

      <main className="content">
        {error ? (
          <div className="error-state">
            <p>Failed to load assets.</p>
            <p className="muted">{error}</p>
          </div>
        ) : loading && items.length === 0 ? (
          <div className="loading-state">
            <p>Loading assets...</p>
          </div>
        ) : (
          <AssetGrid
            assets={items}
            selectedIds={selectedIds}
            activeId={activeId}
            onToggleSelect={toggleSelect}
            onOpen={setActiveId}
            hasNextPage={hasNextPage}
            fetchNextPage={fetchNextPage}
            isFetchingNextPage={isFetchingNextPage}
          />
        )}
        {activeId && (
          <AssetDetail
            id={activeId}
            onClose={() => setActiveId(null)}
            onSaved={handleSaved}
          />
        )}
      </main>
    </div>
  );
}
