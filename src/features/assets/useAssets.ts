import { useQuery } from "@tanstack/react-query";
import { listAssets } from "@/api/client";
import type { AssetQuery } from "@/lib/types";

export function useAssets(query: AssetQuery) {
  const queryResult = useQuery({
    queryKey: ["assets", query],
    queryFn: ({ signal }) => listAssets(query, signal),
    placeholderData: (prev) => prev, // keeps old data visible while fetching
  });

  return {
    items: queryResult.data?.items ?? [],
    total: queryResult.data?.total ?? 0,
    nextCursor: queryResult.data?.nextCursor ?? null,
    loading: queryResult.isFetching,
    error:
      queryResult.error instanceof Error ? queryResult.error.message : null,
  };
}
