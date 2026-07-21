import { useMinder, useOneTouchCrud } from 'minder-data-provider';

export function TodoList() {
  // TODO(minder-codemod): review this useMinder() call -- useReduxSlice() returned { state, actions, selectors, dispatch }; useMinder() returns { data, loading, error, mutate } (see docs/MIGRATION_GUIDE.md).
  const { state, actions, dispatch } = useMinder('todos');
  const { data } = useOneTouchCrud('todos');

  return state ? state.length : data?.length;
}
