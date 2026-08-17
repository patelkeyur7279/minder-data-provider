import { useReduxSlice as useSlice } from 'minder-data-provider';

export function readTodos() {
  const { state } = useSlice('todos');
  return state;
}
