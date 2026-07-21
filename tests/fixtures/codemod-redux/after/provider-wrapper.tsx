import { Provider } from 'react-redux';
import { MinderDataProvider, useMinderContext } from 'minder-data-provider';

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    // TODO(minder-codemod): MinderDataProvider no longer creates a Redux store in v3.0 -- useMinderContext().store is gone; wrap your own <Provider> from react-redux if you still need one (see docs/MIGRATION_GUIDE.md).
    <Provider store={undefined}>
      <MinderDataProvider config={{ apiUrl: 'https://api.example.com' }}>
        {children}
      </MinderDataProvider>
    </Provider>
  );
}

// TODO(minder-codemod): MinderDataProvider no longer creates a Redux store in v3.0 -- useMinderContext().store is gone; wrap your own <Provider> from react-redux if you still need one (see docs/MIGRATION_GUIDE.md).
export function DebugStore() {
  const { store } = useMinderContext();
  return store;
}
