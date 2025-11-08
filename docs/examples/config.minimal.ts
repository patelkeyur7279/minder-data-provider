// config/minimal.example.ts
// For simple CRUD apps, prototypes, and MVPs
// Bundle size: ~45KB

import { createMinderConfig } from 'minder-data-provider/config';

export const minimalConfig = createMinderConfig({
  preset: 'minimal',
  apiUrl: 'https://api.example.com',
  dynamic: {}, // Required field
  
  routes: {
    users: '/users',
    posts: '/posts',
    comments: '/comments'
  }
});

// Usage:
// const data = useOneTouchCrud('users');
// const { data, loading, error, operations } = data;
// operations.create({ name: 'John' });
// operations.update(1, { name: 'Jane' });
// operations.delete(1);
