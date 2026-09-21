import { useInfiniteQuery } from "@tanstack/react-query";
import { listAssets } from "@/api/client";
import type { AssetQuery } from "@/lib/types";

export function useAssets(query: AssetQuery) {
  const queryResult = useInfiniteQuery({
    queryKey: ["assets", query],
    queryFn: ({ pageParam, signal }) =>
      listAssets({ ...query, cursor: pageParam as string | undefined }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
  });

  // Flatten the pages array into a single array of items
  const items = queryResult.data?.pages.flatMap((page) => page.items) ?? [];
  const total = queryResult.data?.pages[0]?.total ?? 0;

  return {
    items,
    total,
    loading: queryResult.isFetching,
    error:
      queryResult.error instanceof Error ? queryResult.error.message : null,
    hasNextPage: !!queryResult.hasNextPage,
    fetchNextPage: queryResult.fetchNextPage,
    isFetchingNextPage: queryResult.isFetchingNextPage,
  };
}
