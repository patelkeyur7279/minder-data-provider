import { getDynamicLoader } from 'minder-data-provider';

const loader = getDynamicLoader({ preload: ['query', 'redux'] });

export async function warmRedux() {
  await loader.loadRedux({});
  const store = loader.getStore();
  if (loader.isReduxLoaded()) {
    await loader.addReducer('extra', (state) => state);
  }
  return store;
}

export function reduxStillLoading() {
  return loader.getLoadingStatus().redux;
}
