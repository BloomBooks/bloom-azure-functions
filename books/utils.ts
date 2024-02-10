export function getIdAndAction(
  idAndAction: string | undefined
): [string, string] {
  if (!idAndAction) {
    return [null, null];
  }

  // Path is either {id} or {id}:{action}
  const match = idAndAction.match(/([^:]+)(?::([^:]+))?/);
  if (!match) {
    return [null, null];
  }
  const id = match[1];
  const action = match[2] || null;

  return [id, action];
}
