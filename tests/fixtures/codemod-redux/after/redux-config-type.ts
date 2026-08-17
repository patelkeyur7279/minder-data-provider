// TODO(minder-codemod): ReduxConfig was removed in v3.0 -- remove this type usage (see docs/MIGRATION_GUIDE.md).
import { ReduxConfig } from 'minder-data-provider';

// TODO(minder-codemod): ReduxConfig was removed in v3.0 -- remove this type usage (see docs/MIGRATION_GUIDE.md).
export function buildReduxOptions(): ReduxConfig {
  return { devTools: true };
}
