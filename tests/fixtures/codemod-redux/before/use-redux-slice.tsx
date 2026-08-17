import { useReduxSlice, useOneTouchCrud } from 'minder-data-provider';

export function TodoList() {
  const { state, actions, dispatch } = useReduxSlice('todos');
  const { data } = useOneTouchCrud('todos');

  return state ? state.length : data?.length;
}
