import { configureMinder } from 'minder-data-provider';

export const config = configureMinder({
  apiUrl: 'https://api.example.com',
  routes: { users: '/users' },
  redux: {
    devTools: true,
    preloadedState: {},
  },
  auth: true,
});
