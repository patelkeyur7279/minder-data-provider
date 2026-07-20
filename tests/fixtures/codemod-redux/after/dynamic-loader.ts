import { getDynamicLoader } from 'minder-data-provider';

// TODO(minder-codemod): DynamicLoader's Redux members (loadRedux/getStore/isReduxLoaded/addReducer, the 'redux' preload option) were removed in v3.0 (see docs/MIGRATION_GUIDE.md).
const loader = getDynamicLoader({ preload: ['query', 'redux'] });

export async function warmRedux() {
  // TODO(minder-codemod): DynamicLoader's Redux members (loadRedux/getStore/isReduxLoaded/addReducer, the 'redux' preload option) were removed in v3.0 (see docs/MIGRATION_GUIDE.md).
  await loader.loadRedux({});
  // TODO(minder-codemod): DynamicLoader's Redux members (loadRedux/getStore/isReduxLoaded/addReducer, the 'redux' preload option) were removed in v3.0 (see docs/MIGRATION_GUIDE.md).
  const store = loader.getStore();
  // TODO(minder-codemod): DynamicLoader's Redux members (loadRedux/getStore/isReduxLoaded/addReducer, the 'redux' preload option) were removed in v3.0 (see docs/MIGRATION_GUIDE.md).
  if (loader.isReduxLoaded()) {
    // TODO(minder-codemod): DynamicLoader's Redux members (loadRedux/getStore/isReduxLoaded/addReducer, the 'redux' preload option) were removed in v3.0 (see docs/MIGRATION_GUIDE.md).
    await loader.addReducer('extra', (state) => state);
  }
  return store;
}

export function reduxStillLoading() {
  // TODO(minder-codemod): DynamicLoader's Redux members (loadRedux/getStore/isReduxLoaded/addReducer, the 'redux' preload option) were removed in v3.0 (see docs/MIGRATION_GUIDE.md).
  return loader.getLoadingStatus().redux;
}
