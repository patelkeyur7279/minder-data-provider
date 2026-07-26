// Client data path: UsersList (src/components/UsersList.tsx) renders the
// three states useMinder("users") can produce. useMinder itself is mocked so
// this stays a pure unit test of the rendering logic, not a network test.
import { describe, it, expect, vi } from 'vitest';
import type { ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { useMinderMock } = vi.hoisted(() => ({ useMinderMock: vi.fn() }));

vi.mock('minder-data-provider', () => ({
  useMinder: useMinderMock,
}));

// Imported after the mock so UsersList picks up the mocked useMinder.
const { default: UsersList } = await import('../src/components/UsersList');

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient();
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('UsersList (client data path)', () => {
  it('renders a loading state while useMinder is loading', () => {
    useMinderMock.mockReturnValue({ data: undefined, loading: true, error: null });

    renderWithClient(<UsersList />);

    expect(screen.getByTestId('island-loading')).toBeInTheDocument();
  });

  it('renders the users returned by useMinder', () => {
    useMinderMock.mockReturnValue({
      data: [{ id: 1, name: 'Ada' }],
      loading: false,
      error: null,
    });

    renderWithClient(<UsersList />);

    expect(screen.getByTestId('island-users')).toHaveTextContent('Ada');
  });

  it('renders an error message when useMinder reports a failure', () => {
    useMinderMock.mockReturnValue({
      data: undefined,
      loading: false,
      error: { message: 'network down' },
    });

    renderWithClient(<UsersList />);

    expect(screen.getByTestId('island-error')).toHaveTextContent('network down');
  });
});
