import { useEffect, useState, useRef } from "react";
import { getAsset, thumbnailUrl, updateAsset } from "@/api/client";
import { useOffline } from "@/features/assets/useOffline";
import {
  formatBytes,
  formatDate,
  formatDuration,
  statusLabel,
  getStatusIcon,
} from "@/lib/format";
import type { Asset, AssetStatus } from "@/lib/types";

const STATUSES: AssetStatus[] = ["draft", "in_review", "approved", "archived"];

interface Props {
  id: string;
  onClose: () => void;
  onSaved: (asset: Asset) => void;
}

/**
 * Baseline detail panel. Loads on open, saves with no optimistic update,
 * surfaces failures as raw strings, and does nothing about focus.
 */
export function AssetDetail({ id, onClose, onSaved }: Props) {
  const [asset, setAsset] = useState<Asset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const isOffline = useOffline();

  const closeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Focus the close button when the panel opens or the ID changes
    closeBtnRef.current?.focus();

    // Listen for Escape key to close the panel
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);

    setAsset(null);
    setError(null);
    setConflict(false);
    getAsset(id)
      .then(setAsset)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Load failed"),
      );

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [id, onClose]);

  function handleReload() {
    setConflict(false);
    setError(null);
    getAsset(id)
      .then(setAsset)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Load failed"),
      );
  }

  async function setStatus(status: AssetStatus) {
    if (!asset) return;
    setSaving(true);
    setError(null);
    setConflict(false);
    try {
      const updated = await updateAsset(asset.id, asset.version, { status });
      setAsset(updated);
      onSaved(updated);
    } catch (err: any) {
      if (err?.status === 409 || err?.code === "version_conflict") {
        setConflict(true);
        setError(
          "This asset was modified by someone else since you opened it.",
        );
      } else {
        setError(err instanceof Error ? err.message : "Save failed");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <aside className="panel">
      <div className="panel__head">
        <h2>Asset detail</h2>
        <button
          ref={closeBtnRef}
          onClick={onClose}
          aria-label="Close detail panel"
        >
          Close
        </button>
      </div>

      {error && (
        <div className="error">
          <p style={{ margin: "0 0 8px" }}>{error}</p>
          {conflict && (
            <button onClick={handleReload}>Reload Latest Version</button>
          )}
        </div>
      )}
      {!asset && !error && (
        <p className="muted" style={{ padding: "0 16px" }}>
          Loading...
        </p>
      )}

      {asset && (
        <div className="panel__body">
          <img className="panel__thumb" src={thumbnailUrl(asset.id)} alt="" />
          <h3>{asset.name}</h3>
          <dl className="facts">
            <dt>Status</dt>
            <dd>
              <span className={`status-badge status-badge--${asset.status}`}>
                {(() => {
                  const Icon = getStatusIcon(asset.status);
                  return <Icon size={14} className="status-icon" />;
                })()}
                <span>{statusLabel(asset.status)}</span>
              </span>
            </dd>
            <dt>Id</dt>
            <dd>{asset.id}</dd>
            <dt>Kind</dt>
            <dd>{asset.kind}</dd>
            <dt>Size</dt>
            <dd>{formatBytes(asset.sizeBytes)}</dd>
            {asset.width && (
              <>
                <dt>Dimensions</dt>
                <dd>
                  {asset.width}×{asset.height}
                </dd>
              </>
            )}
            {asset.durationSec && (
              <>
                <dt>Duration</dt>
                <dd>{formatDuration(asset.durationSec)}</dd>
              </>
            )}
            <dt>Owner</dt>
            <dd>{asset.owner.name}</dd>
            <dt>Updated</dt>
            <dd>{formatDate(asset.updatedAt)}</dd>
            <dt>Version</dt>
            <dd>{asset.version}</dd>
          </dl>

          {asset.tags.length > 0 && (
            <ul className="tags">
              {asset.tags.map((tag) => (
                <li key={tag}>{tag}</li>
              ))}
            </ul>
          )}

          <p className="muted">Status</p>
          <div className="row">
            {STATUSES.map((status) => (
              <button
                key={status}
                disabled={saving || status === asset.status || isOffline}
                onClick={() => setStatus(status)}
              >
                {statusLabel(status)}
              </button>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
