# 📚 Minder Examples

Comprehensive, well-explained examples for learning Minder Data Provider.

## 🎯 Purpose

These examples are designed to teach you Minder through practical, real-world scenarios with detailed explanations of **how** to implement features and **why** you should use them.

## 📖 Available Examples

### Beginner Level

#### 1️⃣ Basic Usage (`01-basic-usage.tsx`)
**What you'll learn:**
- How to use the `useMinder` hook
- Loading and error states
- Data fetching fundamentals
- Common mistakes to avoid

**Key concepts:**
- `data`, `loading`, `error` states
- Automatic data fetching
- Component lifecycle with queries

**Why it matters:**
This is the foundation. Understanding basic usage is essential before moving to advanced features.

---

### Intermediate Level

#### 2️⃣ Query Options (`02-query-options.tsx`)
**What you'll learn:**
- Pagination with page/limit parameters
- Filtering and search
- Sorting data
- Cache configuration
- Conditional fetching
- Refetch strategies

**Key concepts:**
- `params` for query strings
- `enabled` for conditional fetching
- `cacheTTL` for cache control
- `refetchOnWindowFocus` for freshness

**Why it matters:**
Real apps need more than basic fetching. Learn to handle pagination, search, and optimize performance.

---

#### 3️⃣ CRUD Operations (`03-crud-operations.tsx`)
**What you'll learn:**
- CREATE: POST requests to add data
- READ: GET requests to fetch data
- UPDATE: PUT/PATCH to modify data
- DELETE: Remove data with confirmation
- Form handling and validation
- Optimistic updates

**Key concepts:**
- Using `mutate()` for modifications
- `refetch()` after mutations
- Form state management
- User confirmation dialogs

**Why it matters:**
Most apps are CRUD applications. Master these operations to build interactive, data-driven UIs.

---

#### 4️⃣ Authentication (`04-authentication.tsx`)
**What you'll learn:**
- Login/logout flow
- Token storage
- Protected routes
- Authenticated requests
- Auth state persistence

**Key concepts:**
- POST for credentials
- `localStorage` for tokens
- `headers` for authorization
- Conditional rendering based on auth state

**Why it matters:**
Security is critical. Learn proper authentication patterns to protect user data.

---

#### 5️⃣ Caching & Performance (`05-caching.tsx`)
**What you'll learn:**
- Cache strategies (cache-first, network-first)
- TTL (Time-To-Live) configuration
- Manual cache invalidation
- Prefetching for better UX
- Background refetching

**Key concepts:**
- `cacheTTL` for freshness control
- `refetch()` for manual updates
- `invalidate()` for cache clearing
- `isStale` for cache status

**Why it matters:**
Performance directly impacts user experience. Proper caching reduces server load and makes your app feel instant.

---

## 🚀 Quick Start

### Running the Examples

1. **Install dependencies:**
   ```bash
   cd demo
   yarn install
   ```

2. **Start the dev server:**
   ```bash
   yarn dev
   ```

3. **Open examples page:**
   ```
   http://localhost:5100/examples
   ```

### Viewing Individual Examples

Each example is a standalone React component that you can:
- View in the browser
- Read the source code
- Copy and modify for your own use

---

## 📚 Learning Path

We recommend following this order:

```
1. Basic Usage         → Understand fundamentals
   ↓
2. Query Options       → Learn advanced configuration
   ↓
3. CRUD Operations     → Build interactive forms
   ↓
4. Authentication      → Secure your app
   ↓
5. Caching             → Optimize performance
```

---

## 💡 How to Use These Examples

### 1. Read the Comments

Each example has extensive comments explaining:
- **WHAT** the code does
- **WHY** it's done that way
- **HOW** it works under the hood
- **WHEN** to use each pattern

### 2. Experiment

Don't just read—modify the code:
- Change parameters
- Break things on purpose
- Fix errors
- Try variations

### 3. Build Something

Use the examples as templates:
- Copy the patterns
- Adapt to your use case
- Combine multiple examples
- Create your own examples

---

## 🔍 Code Structure

Each example follows this structure:

```tsx
/**
 * Title and Description
 * - What you'll learn
 * - Why it matters
 */

import React from 'react';
import { useMinder } from '../../src';

/**
 * CONCEPT: Explanation of key concepts
 */

interface TypeDefinitions {
  // TypeScript types for clarity
}

export function ExampleComponent() {
  /**
   * STEP 1: First concept
   * 
   * WHY: Explanation
   * HOW: Implementation details
   */
  const example1 = useMinder(...);

  /**
   * STEP 2: Second concept
   * 
   * WHY: Explanation
   * HOW: Implementation details
   */
  const example2 = useMinder(...);

  // More examples...

  return (
    <div>
      {/* Interactive demo */}
      {/* Explanation sections */}
      {/* Best practices */}
      {/* Common mistakes */}
    </div>
  );
}
```

---

## 📖 Additional Resources

### Documentation
- [API Reference](../docs/API_REFERENCE.md)
- [Migration Guide](../docs/MIGRATION_GUIDE.md)
- [Performance Guide](../docs/PERFORMANCE_GUIDE.md)

### Panels (Feature Demos)
The `demo/panels/` directory contains feature-specific demos:
- `CrudPanel.tsx` - CRUD operations
- `PlatformPanel.tsx` - Platform detection
- More panels coming soon!

### Configuration Examples
The `demo/config/` directory shows different config approaches:
- `minder.config.ts` - Full configuration
- `minder.environments.ts` - Environment management
- `demo.config.ts` - Demo-specific settings

---

## 🎨 Example Features

Every example includes:

### ✅ Interactive Demo
- Working code you can interact with
- Real data fetching (JSONPlaceholder API)
- Immediate visual feedback

### ✅ Detailed Explanations
- Step-by-step walkthroughs
- "WHY" sections explaining reasoning
- "HOW" sections with implementation details
- "WHEN" sections for use cases

### ✅ Best Practices
- Recommended patterns
- Performance tips
- Security considerations
- Accessibility notes

### ✅ Common Mistakes
- What to avoid
- Why it's wrong
- How to fix it
- Correct alternatives

### ✅ Code Snippets
- Copy-paste ready code
- Syntax highlighting
- Comments and annotations
- Type definitions

---

## 🤝 Contributing Examples

Want to add an example? Great!

### Example Template

```tsx
/**
 * Example N: Your Title
 * 
 * Brief description of what this example teaches.
 * 
 * WHY: Why this topic is important
 */

import React from 'react';
import { useMinder } from '../../src';

export function YourExample() {
  // Your implementation with detailed comments
  
  return (
    <div className="example-card">
      <h2>Your Title</h2>
      <p className="explanation">Description</p>
      
      {/* Interactive demo */}
      
      {/* Explanation sections */}
      <div className="guide">
        <h3>How It Works</h3>
        {/* Details */}
      </div>
      
      {/* Best practices */}
      <div className="best-practices">
        <h3>Best Practices</h3>
        {/* Tips */}
      </div>
      
      {/* Common mistakes */}
      <div className="common-mistakes">
        <h3>Common Mistakes</h3>
        {/* Pitfalls */}
      </div>
    </div>
  );
}
```

### Guidelines
1. **Focus on one concept** - Don't try to teach everything
2. **Explain why** - Not just how, but why it matters
3. **Include examples** - Real-world use cases
4. **Show mistakes** - Help users avoid common pitfalls
5. **Keep it practical** - Use realistic scenarios

---

## 🎓 FAQ

### Q: Do I need to read examples in order?
**A:** Yes, we recommend following the learning path from Basic Usage to Advanced topics. Each example builds on previous concepts.

### Q: Can I use these examples in my project?
**A:** Absolutely! These examples are meant to be copied, modified, and used in your own applications.

### Q: The examples use JSONPlaceholder API. Can I use my own API?
**A:** Yes! Just change the base URL in the configuration and adjust the type definitions to match your API's response structure.

### Q: I found a bug in an example. How do I report it?
**A:** Please open an issue on GitHub with:
- Example name
- What's wrong
- Expected behavior
- Steps to reproduce

### Q: Can I request a new example?
**A:** Yes! Open an issue with:
- Topic you want covered
- Use case or problem to solve
- Any specific features to demonstrate

---

## 📝 Example Checklist

When creating a new example, ensure it has:

- [ ] Clear title and description
- [ ] Difficulty level indicator
- [ ] List of topics covered
- [ ] Step-by-step implementation
- [ ] "WHY" explanations for each concept
- [ ] "HOW" implementation details
- [ ] Real-world use cases
- [ ] Best practices section
- [ ] Common mistakes section
- [ ] Code snippets with comments
- [ ] Interactive demo
- [ ] TypeScript type definitions
- [ ] Error handling
- [ ] Loading states
- [ ] Accessible markup
- [ ] Responsive design

---

## 🌟 Tips for Learning

1. **Start Simple** - Begin with Basic Usage, even if you're experienced
2. **Read Comments** - We put a lot of effort into explaining "why"
3. **Experiment** - Change values, break things, see what happens
4. **Build Projects** - Use examples as starting points for real apps
5. **Ask Questions** - Open issues if something isn't clear
6. **Share Knowledge** - Help others in discussions
7. **Contribute Back** - Add your own examples or improvements

---

## 🔗 Links

- [Main README](../README.md)
- [API Documentation](../docs/API_REFERENCE.md)
- [Live Demo](http://localhost:5100/examples)
- [GitHub Repository](https://github.com/yourusername/minder-data-provider)

---

## 📄 License

MIT License - feel free to use these examples however you like!

---

Made with ❤️ for developers who want to understand, not just copy-paste.
