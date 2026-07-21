import { useOneTouchCrud, useCache } from 'minder-data-provider';
import { useStore } from 'zustand';

// `useStore` here comes from zustand, NOT minder-data-provider -- the
// codemod must not touch it (it only acts on names actually bound to a
// minder-data-provider* import in this file).
const useAppStore = useStore(() => ({ count: 0 }));

export function Counter() {
  const { data } = useOneTouchCrud('counters');
  const cache = useCache();
  const count = useAppStore((s) => s.count);
  return { data, cache, count };
}
