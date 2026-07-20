import { useMinder } from 'minder-data-provider';

export function TodoList() {
  // TODO(minder-codemod): review this useMinder() call -- useReduxSlice() returned { state, actions, selectors, dispatch }; useMinder() returns { data, loading, error, mutate } (see docs/MIGRATION_GUIDE.md).
  const { state } = useMinder('todos');
  const { data } = useMinder('users');

  return state ? state.length : data?.length;
}
