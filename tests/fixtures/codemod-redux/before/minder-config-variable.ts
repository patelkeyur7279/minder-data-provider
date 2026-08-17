import type { MinderConfig } from 'minder-data-provider';

const config: MinderConfig = {
  apiUrl: 'https://api.example.com',
  redux: { devTools: false },
  routes: { users: '/users' },
};

export default config;
