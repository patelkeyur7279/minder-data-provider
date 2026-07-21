import { useMinder as useSlice } from 'minder-data-provider';

export function readTodos() {
  // TODO(minder-codemod): review this useMinder() call -- useReduxSlice() returned { state, actions, selectors, dispatch }; useMinder() returns { data, loading, error, mutate } (see docs/MIGRATION_GUIDE.md).
  const { state } = useSlice('todos');
  return state;
}
