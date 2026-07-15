export const projectWorkbenchPath = (projectId?: number | string | null, tab?: "projects" | "tasks" | "today") => {
  const params = new URLSearchParams();
  if (projectId !== undefined && projectId !== null && String(projectId).trim()) {
    params.set("project_id", String(projectId));
  }
  if (tab) {
    params.set("tab", tab);
  }
  const query = params.toString();
  return query ? `/projects?${query}` : "/projects";
};

export const legacyProjectPathPattern = /^\/projects\/(\d+)(?:\/)?$/;

export const normalizeProjectWorkbenchPath = (path: string) =>
  path.replace(legacyProjectPathPattern, (_match, projectId) => projectWorkbenchPath(projectId));
