import type { DataEnvelope, TaskData, TaskItem } from '@dashboard/shared';
import { listSources, type Source } from '../accounts/repository';
import { loadCached } from '../cache/provider-cache';
import type { Env } from '../env';
import { fetchTasks } from '../providers/microsoft/todo';
import type { Provider } from '../providers/types';
import { mergedMeta, openSources, sourceInfos } from './source-access';

/** Client polls every 60 s (docs/01-architecture.md §4). */
export const TASKS_TTL_SECONDS = 60;
/** Tasks older than this are not served while Microsoft fails; the tablet keeps its own copy for a day. */
const TASKS_STALE_SECONDS = 6 * 60 * 60;

/** Prefix of the cache keys of one list; a change through the API drops them (tasks/routes.ts). */
export const tasksCachePrefix = (sourceId: string) => `tasks:v1:${sourceId}:`;

export interface TaskQuery {
  /** Source ids in the order the tile lists them. */
  sourceIds: string[];
  includeCompleted: boolean;
}

function taskProvider(
  source: Source,
  accessToken: () => Promise<string>,
): Provider<{ includeCompleted: boolean }, TaskItem[]> {
  return {
    name: 'microsoft-todo',
    ttlSeconds: TASKS_TTL_SECONDS,
    staleSeconds: TASKS_STALE_SECONDS,
    cacheKey: ({ includeCompleted }) => `${tasksCachePrefix(source.id)}${includeCompleted ? 1 : 0}`,
    fetch: async ({ includeCompleted }) =>
      fetchTasks(await accessToken(), source.remoteId, source.id, includeCompleted),
  };
}

/** Due date first (tasks without one last), then the oldest first. */
function byDueThenCreated(a: TaskItem, b: TaskItem): number {
  return (
    (a.due ?? '9999-99-99').localeCompare(b.due ?? '9999-99-99') ||
    a.createdAt.localeCompare(b.createdAt) ||
    a.id.localeCompare(b.id)
  );
}

/**
 * Tasks tile data (docs/03-tiles.md §3): the tasks of the requested lists, merged. Each list has its own
 * sealed cache entry; if one list can neither be fetched nor served from its cache the whole request fails
 * (like the calendar, an incomplete list would mislead).
 */
export async function loadTaskData(
  env: Env,
  query: TaskQuery,
  now: Date = new Date(),
): Promise<DataEnvelope<TaskData>> {
  const found = await listSources(env.DB, { kind: 'task_list', ids: query.sourceIds, enabledOnly: true });
  const sources = query.sourceIds.flatMap((id) => found.find((s) => s.id === id) ?? []);
  if (sources.length === 0) {
    return { updatedAt: now.toISOString(), ttl: TASKS_TTL_SECONDS, data: { sources: [], tasks: [] } };
  }

  const { store, accessToken } = await openSources(env, sources);
  const results = await Promise.all(
    sources.map((source) =>
      loadCached(
        store,
        taskProvider(source, () => accessToken(source)),
        { includeCompleted: query.includeCompleted },
        now,
      ),
    ),
  );
  return {
    ...mergedMeta(results),
    ttl: TASKS_TTL_SECONDS,
    data: { sources: sourceInfos(sources), tasks: results.flatMap((r) => r.data).sort(byDueThenCreated) },
  };
}
