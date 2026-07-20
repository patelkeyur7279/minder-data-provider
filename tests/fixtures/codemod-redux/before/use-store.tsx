import { useStore } from 'minder-data-provider';

export function DebugPanel() {
  const store = useStore();
  return store.getState();
}
