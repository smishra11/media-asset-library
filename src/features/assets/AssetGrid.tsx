import { forwardRef, memo } from "react";
import { VirtuosoGrid } from "react-virtuoso";
import { thumbnailUrl } from "@/api/client";
import { formatBytes, formatDate, statusLabel } from "@/lib/format";
import type { Asset } from "@/lib/types";

const GridList = forwardRef<HTMLDivElement, any>(
  ({ style, children, ...props }, ref) => (
    <div
      ref={ref}
      {...props}
      style={{
        ...style,
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
        gap: "12px",
        padding: "16px",
        alignContent: "start",
      }}
    >
      {children}
    </div>
  ),
);

const GridItem = ({ children, ...props }: any) => (
  <div
    {...props}
    style={{
      display: "flex",
      flexDirection: "column",
      margin: 0,
      padding: 0,
      height: "100%",
    }}
  >
    {children}
  </div>
);

interface CardProps {
  asset: Asset;
  isSelected: boolean;
  isActive: boolean;
  onToggleSelect: (id: string, shiftKey: boolean) => void;
  onOpen: (id: string) => void;
}

const MemoizedAssetCard = memo(function AssetCard({
  asset,
  isSelected,
  isActive,
  onToggleSelect,
  onOpen,
}: CardProps) {
  return (
    <div
      className={`card ${isSelected ? "card--selected" : ""} ${isActive ? "card--active" : ""}`}
      onClick={() => onOpen(asset.id)}
      style={{ height: "100%" }}
    >
      {asset.hasThumbnail ? (
        <img
          className="card__thumb"
          src={thumbnailUrl(asset.id)}
          alt=""
          loading="lazy"
        />
      ) : (
        <div
          className="card__thumb"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span className="muted">No Image</span>
        </div>
      )}
      <div className="card__body">
        <p className="card__name">{asset.name}</p>
        <p className="muted">
          {asset.kind} · {formatBytes(asset.sizeBytes)} ·{" "}
          {formatDate(asset.updatedAt)}
        </p>
        <span className={`pill pill--${asset.status}`}>
          {statusLabel(asset.status)}
        </span>
      </div>
      <input
        type="checkbox"
        className="card__check"
        checked={isSelected}
        readOnly
        onClick={(e) => {
          e.stopPropagation();
          onToggleSelect(asset.id, e.shiftKey);
        }}
      />
    </div>
  );
});

interface Props {
  assets: Asset[];
  selectedIds: Set<string>;
  activeId: string | null;
  onToggleSelect: (id: string, shiftKey: boolean) => void;
  onOpen: (id: string) => void;
  hasNextPage?: boolean;
  fetchNextPage?: () => void;
  isFetchingNextPage?: boolean;
}

export function AssetGrid({
  assets,
  selectedIds,
  activeId,
  onToggleSelect,
  onOpen,
  hasNextPage,
  fetchNextPage,
  isFetchingNextPage,
}: Props) {
  if (assets.length === 0) return null;

  return (
    <VirtuosoGrid
      style={{ flex: 1 }}
      components={{
        List: GridList,
        Item: GridItem,
      }}
      data={assets}
      overscan={400}
      computeItemKey={(_index, asset) => asset.id}
      endReached={() => {
        if (hasNextPage && fetchNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      }}
      itemContent={(_index, asset) => (
        <MemoizedAssetCard
          key={asset.id}
          asset={asset}
          isSelected={selectedIds.has(asset.id)}
          isActive={activeId === asset.id}
          onToggleSelect={onToggleSelect}
          onOpen={onOpen}
        />
      )}
    />
  );
}
