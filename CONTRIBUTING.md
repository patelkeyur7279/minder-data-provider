# Contributing to Minder Data Provider

Thank you for your interest in contributing to Minder Data Provider! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Development Workflow](#development-workflow)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Testing Guidelines](#testing-guidelines)
- [Documentation](#documentation)
- [Commit Messages](#commit-messages)

---

## Code of Conduct

### Our Pledge

We are committed to providing a welcoming and inspiring community for all. Please be respectful and constructive in your interactions.

### Our Standards

**Positive behavior includes:**
- Using welcoming and inclusive language
- Being respectful of differing viewpoints
- Gracefully accepting constructive criticism
- Focusing on what is best for the community

**Unacceptable behavior includes:**
- Harassment, trolling, or insulting comments
- Public or private harassment
- Publishing others' private information
- Other conduct which could reasonably be considered inappropriate

---

## Getting Started

### Prerequisites

- Node.js 18+ and npm/yarn/pnpm
- Git
- Code editor (VS Code recommended)
- Basic knowledge of TypeScript and React

### Finding Ways to Contribute

- **Bug Reports**: Found a bug? Open an issue!
- **Feature Requests**: Have an idea? Share it in discussions!
- **Documentation**: Help improve our docs
- **Code**: Fix bugs or implement features
- **Tests**: Add test coverage
- **Examples**: Create real-world examples

### Good First Issues

Look for issues tagged with:
- `good first issue` - Perfect for newcomers
- `help wanted` - We need community help
- `documentation` - Documentation improvements

---

## Development Setup

### 1. Fork and Clone

```bash
# Fork the repository on GitHub, then:
git clone https://github.com/YOUR_USERNAME/minder-data-provider.git
cd minder-data-provider
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Run Tests

```bash
npm test
```

### 4. Start Demo

```bash
cd demo
npm install
npm run dev
```

### 5. Build Package

```bash
npm run build
```

---

## Development Workflow

### Branch Strategy

```
main
  ├─ feature/your-feature-name
  ├─ fix/bug-description
  └─ docs/documentation-update
```

### Creating a Branch

```bash
# For new features
git checkout -b feature/add-graphql-support

# For bug fixes
git checkout -b fix/cache-invalidation-bug

# For documentation
git checkout -b docs/improve-api-reference
```

### Making Changes

1. **Write Code**: Implement your changes
2. **Write Tests**: Add tests for new functionality
3. **Update Docs**: Update relevant documentation
4. **Run Tests**: Ensure all tests pass
5. **Build**: Verify the build succeeds

```bash
# Run tests
npm test

# Build package
npm run build

# Test in demo
cd demo && npm run build
```

---

## Pull Request Process

### Before Submitting

- [ ] All tests pass (`npm test`)
- [ ] Build succeeds (`npm run build`)
- [ ] Code follows style guidelines
- [ ] Documentation is updated
- [ ] Commit messages follow conventions
- [ ] No breaking changes (or properly documented)

### Creating a PR

1. **Push your branch**
   ```bash
   git push origin feature/your-feature-name
   ```

2. **Open Pull Request on GitHub**
   - Use a clear, descriptive title
   - Fill out the PR template completely
   - Link related issues
   - Add screenshots/videos if applicable

3. **PR Template**
   ```markdown
   ## Description
   Brief description of changes
   
   ## Type of Change
   - [ ] Bug fix
   - [ ] New feature
   - [ ] Breaking change
   - [ ] Documentation update
   
   ## Testing
   - [ ] Tests added/updated
   - [ ] All tests passing
   - [ ] Tested in demo app
   
   ## Checklist
   - [ ] Code follows style guidelines
   - [ ] Self-reviewed code
   - [ ] Commented complex code
   - [ ] Updated documentation
   - [ ] No new warnings
   ```

### Review Process

1. Automated checks run (tests, build, lint)
2. Maintainer reviews code
3. Address feedback if requested
4. Maintainer approves and merges

---

## Coding Standards

### TypeScript

```typescript
// ✅ Good: Explicit types, clear naming
interface UserData {
  id: string;
  name: string;
  email: string;
}

function fetchUser(userId: string): Promise<UserData> {
  // Implementation
}

// ❌ Bad: Implicit any, unclear naming
function fetchUser(id) {
  // Implementation
}
```

### React Components

```typescript
// ✅ Good: Functional components, TypeScript, proper naming
interface UserCardProps {
  user: User;
  onEdit: (id: string) => void;
}

export function UserCard({ user, onEdit }: UserCardProps) {
  return (
    <div>
      <h3>{user.name}</h3>
      <button onClick={() => onEdit(user.id)}>Edit</button>
    </div>
  );
}

// ❌ Bad: No types, unclear props
export function Card({ data, onClick }) {
  return <div onClick={onClick}>{data}</div>;
}
```

### File Organization

```
src/
  ├─ feature/           # Feature folders
  │   ├─ index.ts       # Public API
  │   ├─ Feature.ts     # Main implementation
  │   └─ types.ts       # Type definitions
  ├─ utils/             # Utility functions
  └─ index.ts           # Package exports
```

### Naming Conventions

- **Files**: PascalCase for components, camelCase for utilities
- **Functions**: camelCase
- **Classes**: PascalCase
- **Constants**: UPPER_SNAKE_CASE
- **Interfaces/Types**: PascalCase with descriptive names

### Code Style

- Use 2 spaces for indentation
- Use single quotes for strings
- Add trailing commas in objects/arrays
- Maximum line length: 100 characters
- No semicolons (let Prettier handle it)

---

## Testing Guidelines

### Test Structure

```typescript
describe('Feature Name', () => {
  describe('method/function name', () => {
    it('should do something specific', () => {
      // Arrange
      const input = createTestData();
      
      // Act
      const result = functionUnderTest(input);
      
      // Assert
      expect(result).toBe(expectedOutput);
    });
  });
});
```

### Testing Best Practices

1. **Test Behavior, Not Implementation**
   ```typescript
   // ✅ Good: Tests user-facing behavior
   it('should display error message when login fails', async () => {
     render(<LoginForm />);
     fireEvent.click(screen.getByText('Login'));
     expect(await screen.findByText('Invalid credentials')).toBeInTheDocument();
   });
   
   // ❌ Bad: Tests implementation details
   it('should set error state to true', () => {
     const component = new LoginForm();
     component.login();
     expect(component.state.error).toBe(true);
   });
   ```

2. **Write Isolated Tests**
   - Each test should be independent
   - Use `beforeEach` for common setup
   - Clean up after tests

3. **Test Edge Cases**
   ```typescript
   it('should handle empty input', () => {});
   it('should handle null values', () => {});
   it('should handle very large arrays', () => {});
   ```

### Test Coverage

Aim for:
- **80%+ code coverage** minimum
- **100% for critical paths** (auth, security, data operations)
- All edge cases covered

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- path/to/test.ts

# Run with coverage
npm run test:coverage

# Run in watch mode
npm run test:watch
```

---

## Documentation

### Code Comments

```typescript
/**
 * Fetches user data from the API
 * 
 * @param userId - Unique identifier for the user
 * @param options - Optional configuration
 * @returns Promise resolving to user data
 * @throws {NotFoundError} When user doesn't exist
 * 
 * @example
 * ```typescript
 * const user = await fetchUser('123', { cache: true });
 * ```
 */
async function fetchUser(
  userId: string, 
  options?: FetchOptions
): Promise<User> {
  // Implementation
}
```

### Documentation Files

When adding features, update:
- `docs/API_REFERENCE.md` - API documentation
- `docs/EXAMPLES.md` - Code examples
- `README.md` - If it's a major feature
- `CHANGELOG.md` - Document the change

### Writing Good Examples

```typescript
// ✅ Good: Complete, runnable example
import { useOneTouchCrud } from 'minder-data-provider/crud';

function UsersList() {
  const { data: users, operations } = useOneTouchCrud('users');
  
  return (
    <div>
      {users.map(user => (
        <div key={user.id}>{user.name}</div>
      ))}
    </div>
  );
}

// ❌ Bad: Incomplete, unclear
const { data } = useOneTouchCrud('users');
return <div>{data.map(...)}</div>;
```

---

## Commit Messages

### Format

```
type(scope): subject

body (optional)

footer (optional)
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

### Examples

```bash
# Feature
feat(crud): add pagination support to useOneTouchCrud

# Bug fix
fix(cache): resolve race condition in cache invalidation

# Documentation
docs(api): add examples for WebSocket hooks

# Multiple lines
feat(auth): implement OAuth2 support

Add support for OAuth2 authentication with Google and GitHub providers.
Includes automatic token refresh and scope management.

Closes #123
```

### Best Practices

- Use present tense ("add" not "added")
- Keep subject line under 50 characters
- Capitalize subject line
- Don't end subject with period
- Use body to explain *what* and *why*, not *how*

---

## Project Structure

```
minder-data-provider/
├─ src/                   # Source code
│   ├─ auth/              # Authentication module
│   ├─ cache/             # Caching module
│   ├─ core/              # Core functionality
│   ├─ crud/              # CRUD operations
│   ├─ debug/             # Debug tools
│   ├─ hooks/             # React hooks
│   ├─ utils/             # Utilities
│   └─ index.ts           # Main entry point
├─ tests/                 # Test files
├─ docs/                  # Documentation
├─ demo/                  # Demo application
├─ package.json           # Package configuration
├─ tsconfig.json          # TypeScript config
└─ README.md              # Main documentation
```

---

## Release Process

(For maintainers only)

1. Update version in `package.json`
2. Update `CHANGELOG.md`
3. Create git tag
4. Push to GitHub
5. Publish to npm
6. Create GitHub release

---

## Getting Help

- **Questions**: Open a [GitHub Discussion](https://github.com/minder-data-provider/discussions)
- **Bugs**: Open an [Issue](https://github.com/minder-data-provider/issues)
- **Chat**: Join our [Discord](https://discord.gg/minder-data-provider)

---

## Recognition

Contributors will be:
- Listed in `CONTRIBUTORS.md`
- Mentioned in release notes
- Featured on our website (for major contributions)

---

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

**Thank you for contributing to Minder Data Provider!** 🎉
