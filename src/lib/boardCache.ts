/**
 * Shared in-memory cache for dispatch board data received from the Chrome extension.
 * Uses globalThis to guarantee a single Map instance across all Next.js route modules
 * (Turbopack/webpack can create separate module instances per route).
 */

export interface CachedBoard {
  data: any;
  timestamp: number;
  terminalId: string;
  terminalName: string;
  date: string;
  commodityId: string;
}

const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

const GLOBAL_KEY = "__dispatch_board_cache__" as const;

/** Get or create the singleton cache Map on globalThis. */
function getCache(): Map<string, CachedBoard> {
  const g = globalThis as any;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = new Map<string, CachedBoard>();
  }
  return g[GLOBAL_KEY];
}

export function setCachedBoard(
  terminalId: string,
  date: string,
  commodityId: string,
  board: CachedBoard
): void {
  const key = `${terminalId}:${date}:${commodityId}`;
  getCache().set(key, board);
}

export function getCachedBoard(
  terminalId: string,
  date: string,
  commodityId: string
): CachedBoard | null {
  const key = `${terminalId}:${date}:${commodityId}`;
  const cached = getCache().get(key);
  if (!cached) return null;
  if (Date.now() - cached.timestamp > CACHE_TTL) {
    getCache().delete(key);
    return null;
  }
  return cached;
}

export function getAllCachedBoards(): CachedBoard[] {
  const now = Date.now();
  const results: CachedBoard[] = [];
  for (const [key, cached] of getCache()) {
    if (now - cached.timestamp > CACHE_TTL) {
      getCache().delete(key);
    } else {
      results.push(cached);
    }
  }
  return results;
}
