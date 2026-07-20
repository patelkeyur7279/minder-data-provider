import { useMinder, configureMinder } from 'minder-data-provider';

export const config = configureMinder({
  apiUrl: 'https://api.example.com',
  routes: { users: '/users' },
  auth: true,
});

export function UsersList() {
  const { data, loading, error, mutate } = useMinder('users');
  if (loading) return null;
  if (error) return null;
  return data;
}
