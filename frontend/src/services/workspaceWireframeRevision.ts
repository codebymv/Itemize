const revisions = new Map<number, string>();
const updateQueues = new Map<number, Promise<void>>();

export const rememberWorkspaceWireframeRevision = (
  id: number,
  updatedAt?: string | null,
): void => {
  if (updatedAt) revisions.set(id, updatedAt);
};

export const requireWorkspaceWireframeRevision = (id: number): string => {
  const revision = revisions.get(id);
  if (!revision) {
    throw new Error(
      'Wireframe revision is unavailable; reload the wireframe before updating it',
    );
  }
  return revision;
};

export const forgetWorkspaceWireframeRevision = (id: number): void => {
  revisions.delete(id);
  updateQueues.delete(id);
};

export const enqueueWorkspaceWireframeUpdate = async <T>(
  id: number,
  update: () => Promise<T>,
): Promise<T> => {
  const previous = updateQueues.get(id) ?? Promise.resolve();
  let release: () => void = () => undefined;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.catch(() => undefined).then(() => current);
  updateQueues.set(id, queued);
  await previous.catch(() => undefined);
  try {
    return await update();
  } finally {
    release();
    if (updateQueues.get(id) === queued) {
      updateQueues.delete(id);
    }
  }
};
