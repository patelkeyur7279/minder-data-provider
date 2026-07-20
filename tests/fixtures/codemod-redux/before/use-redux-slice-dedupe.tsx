import { useReduxSlice, useMinder } from 'minder-data-provider';

export function TodoList() {
  const { state } = useReduxSlice('todos');
  const { data } = useMinder('users');

  return state ? state.length : data?.length;
}
