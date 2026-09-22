import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, AlertCircle, SearchX } from "lucide-react";
import { bulkSetStatus } from "@/api/client";
import { AssetDetail } from "@/features/assets/AssetDetail";
import { AssetGrid } from "@/features/assets/AssetGrid";
import { useAssets } from "@/features/assets/useAssets";
import { useOffline } from "@/features/assets/useOffline";
import { statusLabel } from "@/lib/format";
import type { Asset, AssetStatus, AssetQuery } from "@/lib/types";

const STATUSES: AssetStatus[] = ["draft", "in_review", "approved", "archived"];
const SORTS: Array<{ value: NonNullable<AssetQuery["sort"]>; label: string }> =
  [
    { value: "updatedAt:desc", label: "Recently updated" },
    { value: "name:asc", label: "Name A-Z" },
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
  const [retryStatus, setRetryStatus] = useState<AssetStatus | null>(null);
  const [announcement, setAnnouncement] = useState<string>("");

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
    status: status.length > 0 ? status : undefined,
    sort,
  });

  // Screen reader announcements
  useEffect(() => {
    if (notice) {
      setAnnouncement(notice);
    } else if (error) {
      setAnnouncement(`Error: ${error}`);
    } else if (!loading) {
      setAnnouncement(`Showing ${total} assets.`);
    }
  }, [notice, error, loading, total]);

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

      const arr = Array.from(next);
      setLastSelectedId(arr.length > 0 ? (arr[arr.length - 1] ?? null) : null);

      return next;
    });
  }

  function selectAllLoaded() {
    setSelectedIds(new Set(items.map((i) => i.id)));
  }

  const queryClient = useQueryClient();

  async function applyBulkStatus(next: AssetStatus) {
    const ids = [...selectedIds];
    if (ids.length === 0) return;

    setNotice(null);
    setSelectedIds(new Set()); // Optimistically clear selection

    // 1. Optimistic Update
    const previousState = new Map<string, AssetStatus>();
    queryClient.setQueriesData({ queryKey: ["assets"] }, (oldData: any) => {
      if (!oldData) return oldData;
      return {
        ...oldData,
        pages: oldData.pages.map((page: any) => ({
          ...page,
          items: page.items.map((asset: Asset) => {
            if (ids.includes(asset.id)) {
              previousState.set(asset.id, asset.status);
              return { ...asset, status: next };
            }
            return asset;
          }),
        })),
      };
    });

    try {
      // 2. Chunking & Bounded Concurrency (max 50 per request, max 3 requests at a time)
      const chunks: string[][] = [];
      for (let i = 0; i < ids.length; i += 50)
        chunks.push(ids.slice(i, i + 50));

      let totalApplied = 0;
      const failures: { id: string; code: string }[] = [];

      for (let i = 0; i < chunks.length; i += 3) {
        const batch = chunks.slice(i, i + 3);
        const results = await Promise.all(
          batch.map((chunk) => bulkSetStatus(chunk, next)),
        );
        for (const res of results) {
          totalApplied += res.applied;
          res.results.forEach((r) => {
            if (!r.ok) failures.push({ id: r.id, code: r.code });
          });
        }
      }

      // 3. Partial Failure Revert & Retry Recovery
      if (failures.length > 0) {
        const failedIds = new Set(failures.map((f) => f.id));
        queryClient.setQueriesData({ queryKey: ["assets"] }, (oldData: any) => {
          if (!oldData) return oldData;
          return {
            ...oldData,
            pages: oldData.pages.map((page: any) => ({
              ...page,
              items: page.items.map((asset: Asset) => {
                if (failedIds.has(asset.id)) {
                  return {
                    ...asset,
                    status: previousState.get(asset.id) ?? asset.status,
                  };
                }
                return asset;
              }),
            })),
          };
        });

        // Separate non-recoverable (legal-hold) from transient errors
        const legalHoldCount = failures.filter(
          (f) => f.code === "legal_hold",
        ).length;
        const retryableFailures = failures.filter(
          (f) => f.code !== "legal_hold",
        );

        // Auto-select only the retryable ones for the user to try again
        setSelectedIds(new Set(retryableFailures.map((f) => f.id)));
        setNotice(
          `Updated ${totalApplied}. Failed ${failures.length} (${legalHoldCount} locked by legal-hold, ${retryableFailures.length} transient errors re-selected).`,
        );
        if (retryableFailures.length > 0) {
          setRetryStatus(next);
        } else {
          setRetryStatus(null);
        }
      } else {
        setNotice(`${totalApplied} updated successfully.`);
        setRetryStatus(null);
      }
    } catch (err) {
      // Full network failure: Rollback EVERYTHING
      queryClient.setQueriesData({ queryKey: ["assets"] }, (oldData: any) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          pages: oldData.pages.map((page: any) => ({
            ...page,
            items: page.items.map((asset: Asset) => {
              if (previousState.has(asset.id)) {
                return { ...asset, status: previousState.get(asset.id)! };
              }
              return asset;
            }),
          })),
        };
      });
      setNotice(err instanceof Error ? err.message : "Bulk update failed");
      setRetryStatus(null);
    }
  }

  function handleSaved(asset: Asset) {
    // Instantly update the grid cache with the newly saved asset from the detail panel
    queryClient.setQueriesData({ queryKey: ["assets"] }, (oldData: any) => {
      if (!oldData) return oldData;
      return {
        ...oldData,
        pages: oldData.pages.map((page: any) => ({
          ...page,
          items: page.items.map((i: Asset) => (i.id === asset.id ? asset : i)),
        })),
      };
    });
  }

  const isOffline = useOffline();

  return (
    <div className="app">
      <div aria-live="polite" className="visually-hidden">
        {announcement}
      </div>
      {isOffline && (
        <div
          className="error"
          style={{
            display: "flex",
            justifyContent: "center",
            gap: "8px",
            background: "var(--danger)",
            color: "white",
          }}
        >
          <strong>You are currently offline.</strong> Some actions are disabled
          until your connection is restored.
        </div>
      )}
      <header className="topbar">
        <h1>MediaVault</h1>
        <input
          type="search"
          className="search"
          placeholder="Search by name or tag..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          disabled={isOffline}
        />
      </header>
      <div className="filters">
        <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
          <strong>Status:</strong>
          <div style={{ display: "flex", gap: "16px" }}>
            {STATUSES.map((s) => (
              <label
                key={s}
                style={{
                  display: "flex",
                  gap: "6px",
                  alignItems: "center",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={status.includes(s)}
                  onChange={(e) =>
                    setStatus((prev) =>
                      e.target.checked
                        ? [...prev, s]
                        : prev.filter((x) => x !== s),
                    )
                  }
                  style={{
                    width: "16px",
                    height: "16px",
                    accentColor: "var(--accent)",
                    cursor: "pointer",
                  }}
                />
                <span
                  style={{
                    fontSize: "var(--text-sm)",
                    color: status.includes(s)
                      ? "var(--ink)"
                      : "var(--ink-soft)",
                  }}
                >
                  {statusLabel(s)}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div
          style={{
            flex: 1,
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            gap: "16px",
          }}
        >
          <span className="muted">
            {loading && items.length === 0
              ? "Loading..."
              : `${items.length} of ${total.toLocaleString()} shown`}
          </span>
          <button onClick={selectAllLoaded} disabled={items.length === 0}>
            Select all loaded
          </button>

          <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <strong>Sort by:</strong>
            <select
              value={sort}
              onChange={(e) =>
                setSort(e.target.value as NonNullable<AssetQuery["sort"]>)
              }
              style={{
                padding: "6px 12px",
                borderRadius: "6px",
                border: "1px solid var(--line)",
                background: "var(--bg)",
              }}
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {notice && (
        <div className="notice">
          {notice}
          {retryStatus && (
            <button
              className="primary"
              disabled={isOffline}
              onClick={() => {
                applyBulkStatus(retryStatus);
              }}
            >
              Retry Failed
            </button>
          )}
        </div>
      )}

      {selectedIds.size > 0 && (
        <div className="bulkbar">
          <span style={{ fontWeight: 600, marginRight: "8px" }}>
            {selectedIds.size} selected
          </span>
          {STATUSES.map((s) => (
            <button
              key={s}
              className="primary"
              onClick={() => applyBulkStatus(s)}
              disabled={isOffline}
            >
              Set {statusLabel(s).toLowerCase()}
            </button>
          ))}
          <div style={{ flex: 1 }}></div>
          <button onClick={() => setSelectedIds(new Set())}>
            Clear selection
          </button>
        </div>
      )}

      <main className="content">
        {loading && items.length === 0 ? (
          <div className="empty">
            <Loader2
              size={48}
              className="lucide-loader"
              style={{ marginBottom: "16px", color: "#cbd5e1" }}
            />
            <h2>Loading assets...</h2>
            <p>Fetching the latest media from the server.</p>
          </div>
        ) : error ? (
          <div className="empty">
            <AlertCircle
              size={48}
              style={{ marginBottom: "16px", color: "var(--danger)" }}
            />
            <h2 style={{ color: "var(--danger)" }}>Failed to load assets</h2>
            <p>{error}</p>
          </div>
        ) : items.length === 0 ? (
          <div className="empty">
            <SearchX
              size={48}
              style={{ marginBottom: "16px", color: "#cbd5e1" }}
            />
            <h2>No assets found</h2>
            <p>Try adjusting your search query or filters.</p>
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
