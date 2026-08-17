import { Provider } from 'react-redux';
import { MinderDataProvider, useMinderContext } from 'minder-data-provider';

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <Provider store={undefined}>
      <MinderDataProvider config={{ apiUrl: 'https://api.example.com' }}>
        {children}
      </MinderDataProvider>
    </Provider>
  );
}

export function DebugStore() {
  const { store } = useMinderContext();
  return store;
}
