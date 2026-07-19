/**
 * QR-D1 — runtime test: `createTypedMinder(...).minder(...)` DELEGATES to the
 * real `minder()` (never re-implements fetching). We mock `../src/core/minder`
 * the same way `tests/useMinder.test.ts` does and assert the resolved url and
 * merged HTTP method reach the real function untouched.
 */
import { minder } from '../src/core/minder';
import { route, createTypedMinder } from '../src/core/typedRoutes';
import { HttpMethod } from '../src/constants/enums';

// Mock the minder function — mirrors tests/useMinder.test.ts's mocking style.
jest.mock('../src/core/minder', () => ({
  minder: jest.fn(),
}));

const mockedMinder = minder as jest.MockedFunction<typeof minder>;

interface User {
  id: number;
  name: string;
}

describe('createTypedMinder — runtime delegation to the real minder()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedMinder.mockResolvedValue({
      data: { id: 1, name: 'Ada' },
      error: null,
      status: 200,
      success: true,
      metadata: { method: HttpMethod.GET, url: '/users/:id', duration: 0, cached: false },
    });
  });

  it('resolves the route to its url and merges the route method into options', async () => {
    const api = createTypedMinder({
      user: route<User>('/users/:id', { method: HttpMethod.GET }),
    });

    const result = await api.minder('user', undefined, { params: { id: '1' } });

    expect(mockedMinder).toHaveBeenCalledTimes(1);
    const [calledUrl, calledData, calledOptions] = mockedMinder.mock.calls[0];
    expect(calledUrl).toBe('/users/:id');
    expect(calledData).toBeUndefined();
    expect(calledOptions).toMatchObject({ method: HttpMethod.GET, params: { id: '1' } });

    // The real minder() is the one that produced the result — proves no
    // re-implementation of fetching happened in the typed factory.
    expect(result.data).toEqual({ id: 1, name: 'Ada' });
  });

  it('passes request data straight through to the real minder()', async () => {
    const api = createTypedMinder({
      createUser: route<User>('/users', { method: HttpMethod.POST }),
    });

    await api.minder('createUser', { name: 'Grace' });

    expect(mockedMinder).toHaveBeenCalledTimes(1);
    const [calledUrl, calledData, calledOptions] = mockedMinder.mock.calls[0];
    expect(calledUrl).toBe('/users');
    expect(calledData).toEqual({ name: 'Grace' });
    expect(calledOptions).toMatchObject({ method: HttpMethod.POST });
  });

  it('lets an explicit options.method override the route default (matches minder() precedence)', async () => {
    const api = createTypedMinder({
      user: route<User>('/users/:id', { method: HttpMethod.GET }),
    });

    await api.minder('user', undefined, { method: HttpMethod.DELETE });

    const [, , calledOptions] = mockedMinder.mock.calls[0];
    expect(calledOptions).toMatchObject({ method: HttpMethod.DELETE });
  });

  it('works with a route that has no explicit method (left to minder() auto-detection)', async () => {
    const api = createTypedMinder({
      users: route<User[]>('/users'),
    });

    await api.minder('users');

    expect(mockedMinder).toHaveBeenCalledTimes(1);
    const [calledUrl, , calledOptions] = mockedMinder.mock.calls[0];
    expect(calledUrl).toBe('/users');
    expect(calledOptions?.method).toBeUndefined();
  });
});
