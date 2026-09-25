import { Hono } from 'hono';
import { z } from 'zod';
import { getSource } from '../accounts/repository';
import { requireAuth } from '../auth/middleware';
import { dropSealed } from '../cache/sealed-store';
import { openSources } from '../data/source-access';
import { tasksCachePrefix } from '../data/tasks';
import type { AppEnv } from '../env';
import { ApiError } from '../errors';
import { limitBody, readJson } from '../http/json-body';
import { providerFailure } from '../providers/failure';
import { setTaskCompleted } from '../providers/microsoft/todo';
import { ProviderError } from '../providers/types';

const SOURCE_ID_PATTERN = /^src_[a-z2-7]{16}$/;
/** Graph task ids are base64-like (letters, digits, `-`, `_`, `=`, `+`). */
const TASK_ID_PATTERN = /^[A-Za-z0-9_+=-]{1,200}$/;

/** The only change the tablet may make: complete or reopen a task (doc 06 §2). Nothing else is accepted. */
const bodySchema = z.strictObject({ completed: z.boolean() });

/** `PATCH /api/v1/tasks/:sourceId/:taskId` (docs/07-api.md §3), device and admin. */
export const taskRoutes = new Hono<AppEnv>();

taskRoutes.use(requireAuth('device', 'admin'));

taskRoutes.patch('/:sourceId/:taskId', limitBody(1024), async (c) => {
  const sourceId = c.req.param('sourceId');
  const taskId = c.req.param('taskId');
  if (!SOURCE_ID_PATTERN.test(sourceId) || !TASK_ID_PATTERN.test(taskId)) {
    throw new ApiError(404, 'not_found', 'Task not found');
  }
  const { completed } = await readJson(c, bodySchema);

  // Only lists the owner picked for the dashboard can be changed; anything else looks like it does not exist.
  const source = await getSource(c.env.DB, sourceId);
  if (source.kind !== 'task_list' || !source.enabled) {
    throw new ApiError(404, 'not_found', 'Task not found');
  }

  try {
    const { accessToken } = await openSources(c.env, [source]);
    const task = await setTaskCompleted(
      await accessToken(source),
      source.remoteId,
      taskId,
      source.id,
      completed,
    );
    // The next read must see the change instead of the cached list.
    await dropSealed(c.env.DB, tasksCachePrefix(source.id));
    return c.json(task);
  } catch (err) {
    if (err instanceof ProviderError && err.status === 404) {
      throw new ApiError(404, 'not_found', 'Task not found');
    }
    throw providerFailure(err);
  }
});
