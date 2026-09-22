import {
  forwardRef,
  memo,
  useState,
  useRef,
  useEffect,
  useCallback,
} from "react";
import { VirtuosoGrid, VirtuosoGridHandle } from "react-virtuoso";
import { thumbnailUrl } from "@/api/client";
import { formatBytes, formatDate, statusLabel } from "@/lib/format";
import type { Asset } from "@/lib/types";

const GridList = forwardRef<HTMLDivElement, any>(
  ({ style, children, ...props }, ref) => (
    <div
      ref={ref}
      role="grid"
      aria-label="Assets"
      className="virtuoso-grid-list"
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
  isFocused: boolean;
  onToggleSelect: (id: string, shiftKey: boolean) => void;
  onOpen: (id: string) => void;
  onKeyDown: (e: React.KeyboardEvent, index: number) => void;
  index: number;
}

const MemoizedAssetCard = memo(function AssetCard({
  asset,
  isSelected,
  isActive,
  isFocused,
  onToggleSelect,
  onOpen,
  onKeyDown,
  index,
}: CardProps) {
  return (
    <div
      id={`asset-card-${asset.id}`}
      role="gridcell"
      aria-selected={isSelected}
      tabIndex={isFocused ? 0 : -1}
      className={`card ${isSelected ? "card--selected" : ""} ${isActive ? "card--active" : ""}`}
      onClick={() => onOpen(asset.id)}
      onKeyDown={(e) => onKeyDown(e, index)}
      style={{ height: "100%", outlineOffset: "2px" }}
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
          {asset.kind} . {formatBytes(asset.sizeBytes)} .{" "}
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
        tabIndex={-1} // Prevent double tab stops on the checkbox
        aria-label={`Select ${asset.name}`}
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
  const [focusedIndex, setFocusedIndex] = useState(0);
  const virtuosoRef = useRef<VirtuosoGridHandle>(null);

  // Keyboard navigation logic
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, index: number) => {
      const isArrow = [
        "ArrowRight",
        "ArrowLeft",
        "ArrowDown",
        "ArrowUp",
      ].includes(e.key);
      if (!isArrow && e.key !== " " && e.key !== "Enter") return;

      if (isArrow) {
        e.preventDefault();
        let nextIndex = index;

        const listEl = document.querySelector(".virtuoso-grid-list");
        let columns = 1;
        if (listEl) {
          const gridCols = window.getComputedStyle(listEl).gridTemplateColumns;
          columns = gridCols.split(" ").length;
        }

        if (e.key === "ArrowRight")
          nextIndex = Math.min(assets.length - 1, index + 1);
        if (e.key === "ArrowLeft") nextIndex = Math.max(0, index - 1);
        if (e.key === "ArrowDown")
          nextIndex = Math.min(assets.length - 1, index + columns);
        if (e.key === "ArrowUp") nextIndex = Math.max(0, index - columns);

        setFocusedIndex(nextIndex);

        // Auto-focus the new element
        virtuosoRef.current?.scrollToIndex({
          index: nextIndex,
          align: "center",
          behavior: "auto",
        });
        requestAnimationFrame(() => {
          const el = document.getElementById(
            `asset-card-${assets[nextIndex]?.id}`,
          );
          if (el) el.focus();
        });

        if (e.shiftKey) {
          onToggleSelect(assets[nextIndex]!.id, true);
        }
      } else if (e.key === " ") {
        e.preventDefault();
        onToggleSelect(assets[index]!.id, e.shiftKey);
      } else if (e.key === "Enter") {
        e.preventDefault();
        onOpen(assets[index]!.id);
      }
    },
    [assets, onToggleSelect, onOpen],
  );

  // When activeId (detail panel open/close) changes, if it closes, restore focus to the card
  useEffect(() => {
    if (activeId === null && assets.length > 0) {
      const el = document.getElementById(
        `asset-card-${assets[focusedIndex]?.id}`,
      );
      if (el) el.focus();
    }
  }, [activeId, focusedIndex, assets]);

  if (assets.length === 0) return null;

  return (
    <VirtuosoGrid
      ref={virtuosoRef}
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
      itemContent={(index, asset) => (
        <MemoizedAssetCard
          key={asset.id}
          index={index}
          asset={asset}
          isSelected={selectedIds.has(asset.id)}
          isActive={activeId === asset.id}
          isFocused={focusedIndex === index}
          onToggleSelect={onToggleSelect}
          onOpen={onOpen}
          onKeyDown={handleKeyDown}
        />
      )}
    />
  );
}
