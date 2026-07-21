// TODO(minder-codemod): useStore() was removed in v3.0 -- use your own react-redux store instead (see docs/MIGRATION_GUIDE.md, "v2.x -> v3.0").
import { useStore } from 'minder-data-provider';

export function DebugPanel() {
  // TODO(minder-codemod): useStore() was removed in v3.0 -- use your own react-redux store instead (see docs/MIGRATION_GUIDE.md, "v2.x -> v3.0").
  const store = useStore();
  return store.getState();
}
