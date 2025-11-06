const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Mock data
const users = [
  { id: 1, name: 'John Doe', email: 'john@example.com', username: 'johndoe', phone: '555-0001' },
  { id: 2, name: 'Jane Smith', email: 'jane@example.com', username: 'janesmith', phone: '555-0002' },
  { id: 3, name: 'Bob Johnson', email: 'bob@example.com', username: 'bobjohnson', phone: '555-0003' },
];

const posts = [
  { id: 1, userId: 1, title: 'First Post', body: 'This is the first post' },
  { id: 2, userId: 1, title: 'Second Post', body: 'This is the second post' },
  { id: 3, userId: 2, title: 'Third Post', body: 'This is the third post' },
];

const products = [
  {
    id: 1,
    title: 'Wireless Headphones',
    price: 99.99,
    description: 'High-quality wireless headphones',
    category: 'electronics',
    image: 'https://picsum.photos/200/200?random=1',
    rating: { rate: 4.5, count: 120 },
  },
  {
    id: 2,
    title: 'Smart Watch',
    price: 199.99,
    description: 'Feature-rich smartwatch',
    category: 'electronics',
    image: 'https://picsum.photos/200/200?random=2',
    rating: { rate: 4.8, count: 95 },
  },
  {
    id: 3,
    title: 'Running Shoes',
    price: 79.99,
    description: 'Comfortable running shoes',
    category: 'sports',
    image: 'https://picsum.photos/200/200?random=3',
    rating: { rate: 4.3, count: 200 },
  },
];

const todos = [
  { id: 1, userId: 1, title: 'Buy groceries', completed: false },
  { id: 2, userId: 1, title: 'Walk the dog', completed: true },
  { id: 3, userId: 2, title: 'Finish project', completed: false },
];

// Routes

// Health check
app.get('/', (req, res) => {
  res.json({ 
    status: 'healthy',
    message: 'Minder Mock API Server',
    timestamp: new Date().toISOString(),
    endpoints: ['/health', '/users', '/posts', '/products', '/todos']
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Users
app.get('/users', (req, res) => {
  res.json(users);
});

app.get('/users/:id', (req, res) => {
  const user = users.find(u => u.id === parseInt(req.params.id));
  if (user) {
    res.json(user);
  } else {
    res.status(404).json({ error: 'User not found' });
  }
});

app.post('/users', (req, res) => {
  const newUser = {
    id: users.length + 1,
    ...req.body,
  };
  users.push(newUser);
  res.status(201).json(newUser);
});

app.put('/users/:id', (req, res) => {
  const index = users.findIndex(u => u.id === parseInt(req.params.id));
  if (index !== -1) {
    users[index] = { ...users[index], ...req.body };
    res.json(users[index]);
  } else {
    res.status(404).json({ error: 'User not found' });
  }
});

app.delete('/users/:id', (req, res) => {
  const index = users.findIndex(u => u.id === parseInt(req.params.id));
  if (index !== -1) {
    users.splice(index, 1);
    res.status(204).send();
  } else {
    res.status(404).json({ error: 'User not found' });
  }
});

// Posts
app.get('/posts', (req, res) => {
  const { userId } = req.query;
  if (userId) {
    const filtered = posts.filter(p => p.userId === parseInt(userId));
    res.json(filtered);
  } else {
    res.json(posts);
  }
});

app.get('/posts/:id', (req, res) => {
  const post = posts.find(p => p.id === parseInt(req.params.id));
  if (post) {
    res.json(post);
  } else {
    res.status(404).json({ error: 'Post not found' });
  }
});

app.post('/posts', (req, res) => {
  const newPost = {
    id: posts.length + 1,
    ...req.body,
  };
  posts.push(newPost);
  res.status(201).json(newPost);
});

app.put('/posts/:id', (req, res) => {
  const index = posts.findIndex(p => p.id === parseInt(req.params.id));
  if (index !== -1) {
    posts[index] = { ...posts[index], ...req.body };
    res.json(posts[index]);
  } else {
    res.status(404).json({ error: 'Post not found' });
  }
});

app.delete('/posts/:id', (req, res) => {
  const index = posts.findIndex(p => p.id === parseInt(req.params.id));
  if (index !== -1) {
    posts.splice(index, 1);
    res.status(204).send();
  } else {
    res.status(404).json({ error: 'Post not found' });
  }
});

// Products
app.get('/products', (req, res) => {
  const { category, limit } = req.query;
  let filtered = products;
  
  if (category) {
    filtered = filtered.filter(p => p.category === category);
  }
  
  if (limit) {
    filtered = filtered.slice(0, parseInt(limit));
  }
  
  res.json(filtered);
});

app.get('/products/:id', (req, res) => {
  const product = products.find(p => p.id === parseInt(req.params.id));
  if (product) {
    res.json(product);
  } else {
    res.status(404).json({ error: 'Product not found' });
  }
});

app.get('/products/categories', (req, res) => {
  const categories = [...new Set(products.map(p => p.category))];
  res.json(categories);
});

// Todos
app.get('/todos', (req, res) => {
  const { userId } = req.query;
  if (userId) {
    const filtered = todos.filter(t => t.userId === parseInt(userId));
    res.json(filtered);
  } else {
    res.json(todos);
  }
});

app.get('/todos/:id', (req, res) => {
  const todo = todos.find(t => t.id === parseInt(req.params.id));
  if (todo) {
    res.json(todo);
  } else {
    res.status(404).json({ error: 'Todo not found' });
  }
});

app.post('/todos', (req, res) => {
  const newTodo = {
    id: todos.length + 1,
    ...req.body,
  };
  todos.push(newTodo);
  res.status(201).json(newTodo);
});

app.put('/todos/:id', (req, res) => {
  const index = todos.findIndex(t => t.id === parseInt(req.params.id));
  if (index !== -1) {
    todos[index] = { ...todos[index], ...req.body };
    res.json(todos[index]);
  } else {
    res.status(404).json({ error: 'Todo not found' });
  }
});

app.delete('/todos/:id', (req, res) => {
  const index = todos.findIndex(t => t.id === parseInt(req.params.id));
  if (index !== -1) {
    todos.splice(index, 1);
    res.status(204).send();
  } else {
    res.status(404).json({ error: 'Todo not found' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════╗
║  Minder Mock API Server              ║
║                                      ║
║  Status: Running ✓                   ║
║  Port: ${PORT}                        ║
║  Environment: ${process.env.NODE_ENV || 'development'}
║                                      ║
║  Endpoints:                          ║
║  GET    /health                      ║
║  GET    /users                       ║
║  GET    /posts                       ║
║  GET    /products                    ║
║  GET    /todos                       ║
╚══════════════════════════════════════╝
  `);
});
