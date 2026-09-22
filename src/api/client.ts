import type { Asset, AssetPage, AssetQuery, BulkResult } from "@/lib/types";

/**
 * Baseline client. It works on a good network and falls apart on a bad one.
 *
 * Known gaps, all of which are yours to close:
 *   - no request cancellation
 *   - no retry, no backoff, no handling of Retry-After
 *   - no de-duplication of concurrent identical requests
 *   - error information is flattened into a string
 *   - callers cannot distinguish "retry this" from "do not retry this"
 */

function toSearchParams(query: AssetQuery): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.status?.length) params.set("status", query.status.join(","));
  if (query.kind?.length) params.set("kind", query.kind.join(","));
  if (query.tag?.length) params.set("tag", query.tag.join(","));
  if (query.collectionId) params.set("collectionId", query.collectionId);
  if (query.owner) params.set("owner", query.owner);
  if (query.sort) params.set("sort", query.sort);
  if (query.limit) params.set("limit", String(query.limit));
  if (query.cursor) params.set("cursor", query.cursor);
  return params.toString();
}

export class APIError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public retryAfter?: number,
  ) {
    super(message);
    this.name = "APIError";
  }
}

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

function sleep(ms: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted)
      return reject(new DOMException("Aborted", "AbortError"));

    let timer: ReturnType<typeof setTimeout>;

    const abortHandler = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };

    timer = setTimeout(() => {
      if (signal) signal.removeEventListener("abort", abortHandler);
      resolve();
    }, ms);

    if (signal) {
      signal.addEventListener("abort", abortHandler);
    }
  });
}

function isRetryable(error: unknown): boolean {
  if (error instanceof APIError) {
    // Structurally deny retries for client errors and conflicts
    if (error.status >= 400 && error.status < 500 && error.status !== 429) {
      return false; // e.g. 400, 401, 403, 404, 409, 422
    }
    // Retry 429 (Too Many Requests) and 5xx (Server Errors)
    return error.status === 429 || error.status >= 500;
  }
  // If fetch throws a TypeError, it means the network request failed entirely (offline, DNS, etc)
  return true;
}

function getUserFriendlyMessage(
  status: number,
  originalMessage: string,
): string {
  if (status === 429)
    return "The server is currently busy. Please try again in a few seconds.";
  if (status === 503)
    return "The service is temporarily down for maintenance. Please check back later.";
  if (status >= 500)
    return "We are experiencing internal server issues. Our team has been notified.";
  if (status === 409)
    return "This asset was modified by someone else. Please reload and try again.";
  if (status === 422)
    return "The requested update was invalid or contained missing data.";
  return originalMessage;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let attempt = 0;

  while (true) {
    try {
      const res = await fetch(path, {
        ...init,
        headers: {
          "content-type": "application/json",
          ...(init?.headers ?? {}),
        },
      });

      if (!res.ok) {
        let detail = res.statusText;
        let code = "unknown";
        try {
          const body = await res.json();
          detail = body?.error?.message ?? detail;
          code = body?.error?.code ?? code;
        } catch {
          /* response was not JSON */
        }
        const retryAfter = res.headers.has("retry-after")
          ? parseInt(res.headers.get("retry-after")!, 10)
          : undefined;

        const actionableMessage = getUserFriendlyMessage(res.status, detail);
        throw new APIError(res.status, code, actionableMessage, retryAfter);
      }
      return res.json() as Promise<T>;
    } catch (err) {
      // Never retry if the request was intentionally aborted by the user/React Query
      if (
        init?.signal?.aborted ||
        (err instanceof DOMException && err.name === "AbortError")
      ) {
        throw err;
      }

      if (attempt >= MAX_RETRIES || !isRetryable(err)) {
        throw err;
      }

      // Exponential backoff: 1s, 2s, 4s...
      let waitTime = BASE_DELAY_MS * Math.pow(2, attempt);

      // Jitter: add up to 500ms of randomness to prevent thundering herd
      waitTime += Math.random() * 500;

      // Honour Retry-After header if the server explicitly provided one
      if (err instanceof APIError && err.retryAfter) {
        // Retry-After is usually in seconds
        waitTime = Math.max(waitTime, err.retryAfter * 1000);
      }

      attempt++;
      await sleep(waitTime, init?.signal);
    }
  }
}

export function listAssets(
  query: AssetQuery,
  signal?: AbortSignal,
): Promise<AssetPage> {
  return request<AssetPage>(`/api/assets?${toSearchParams(query)}`, { signal });
}

export function getAsset(id: string): Promise<Asset> {
  return request<Asset>(`/api/assets/${id}`);
}

export function getAssetsByIds(
  ids: string[],
): Promise<{ items: Asset[]; missing: string[] }> {
  // Note: the endpoint rejects more than 25 ids per call.
  return request(`/api/assets/batch?ids=${ids.join(",")}`);
}

export function updateAsset(
  id: string,
  version: number,
  patch: Partial<Pick<Asset, "name" | "status" | "tags">>,
): Promise<Asset> {
  return request<Asset>(`/api/assets/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ version, patch }),
  });
}

export function bulkSetStatus(
  ids: string[],
  status: Asset["status"],
): Promise<BulkResult> {
  // Note: the endpoint rejects more than 50 ids per call.
  return request<BulkResult>("/api/assets/bulk-status", {
    method: "POST",
    body: JSON.stringify({ ids, status }),
  });
}

export const thumbnailUrl = (id: string) => `/api/thumb/${id}.svg`;
