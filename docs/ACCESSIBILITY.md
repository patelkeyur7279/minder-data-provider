# Accessibility Guide

This document outlines the accessibility features in Minder Data Provider and best practices for building accessible applications.

## Overview

Minder Data Provider is built with accessibility (a11y) in mind, following WCAG 2.1 guidelines to ensure all users, including those using assistive technologies, can interact with your applications effectively.

## Built-in Accessibility Features

### 1. Error Boundary Component

The `MinderErrorBoundary` component includes comprehensive accessibility support:

#### ARIA Attributes
- **`role="alert"`** - Identifies the error container as an alert region
- **`aria-live="assertive"`** - Announces errors immediately to screen readers
- **`aria-atomic="true"`** - Reads entire error message as a unit
- **`aria-label`** - Customizable label for the error boundary
- **`aria-describedby`** - Links error details to the error display

#### Keyboard Navigation
- **Tab Navigation** - All interactive elements are keyboard accessible
- **Enter/Space Keys** - Activates retry button and details toggle
- **Auto-focus** - Error container receives focus when error occurs

#### Example Usage

```tsx
import { MinderErrorBoundary } from 'minder-data-provider';

function App() {
  return (
    <MinderErrorBoundary
      ariaLabel="Application error handler"
      onError={(error, errorInfo) => {
        console.error('Error caught:', error);
      }}
      onReset={() => {
        // Custom reset logic
      }}
    >
      <YourApp />
    </MinderErrorBoundary>
  );
}
```

#### Custom Fallback with Accessibility

```tsx
<MinderErrorBoundary
  fallback={(error, errorInfo) => (
    <div role="alert" aria-live="assertive" aria-atomic="true">
      <h1>Custom Error Display</h1>
      <p aria-label={`Error message: ${error.message}`}>
        {error.message}
      </p>
      <button aria-label="Retry after error">
        Retry
      </button>
    </div>
  )}
>
  <YourApp />
</MinderErrorBoundary>
```

### 2. DevTools Component

The `DevTools` component provides an accessible debugging interface:

#### ARIA Attributes
- **`role="complementary"`** - Identifies DevTools as supplementary content
- **`role="dialog"`** - Panel behaves as a modal-like dialog
- **`role="tablist"`/`"tab"`/`"tabpanel"`** - Proper tab navigation structure
- **`aria-label`** - Descriptive labels for all interactive elements
- **`aria-controls`** - Links tabs to their panels
- **`aria-selected`** - Indicates active tab state
- **`aria-expanded`** - Tracks open/closed state
- **`role="list"`/`"listitem"`** - Semantic list structure for data
- **`role="status"`** - Live regions for dynamic content
- **`aria-live="polite"`** - Announces content updates

#### Keyboard Navigation
- **Enter/Space Keys** - Opens/closes panel and activates buttons
- **Escape Key** - Closes DevTools panel
- **Tab Key** - Navigates between tabs and controls
- **Tab Index Management** - Only active tab is in tab order

#### Screen Reader Support
- Clear announcements for network requests count
- Cache entries count updates
- Performance metrics with descriptive labels
- State snapshot updates

#### Example Usage

```tsx
import { DevTools } from 'minder-data-provider/debug';

function App() {
  return (
    <>
      <YourApp />
      <DevTools
        config={{
          enabled: process.env.NODE_ENV === 'development',
          position: 'bottom-right',
          defaultOpen: false,
          showNetworkTab: true,
          showCacheTab: true,
          showPerformanceTab: true,
          showStateTab: true,
        }}
      />
    </>
  );
}
```

## Best Practices

### 1. Use Semantic HTML

Always use appropriate HTML elements:

```tsx
// ✅ Good - Semantic button
<button onClick={handleClick}>Submit</button>

// ❌ Bad - Div as button
<div onClick={handleClick}>Submit</div>
```

### 2. Provide ARIA Labels

Add descriptive labels to interactive elements:

```tsx
// ✅ Good - Clear aria-label
<button
  onClick={handleDelete}
  aria-label="Delete product from cart"
>
  🗑️
</button>

// ❌ Bad - No context for screen readers
<button onClick={handleDelete}>🗑️</button>
```

### 3. Keyboard Navigation

Ensure all interactive elements are keyboard accessible:

```tsx
// ✅ Good - Keyboard support
<div
  role="button"
  tabIndex={0}
  onClick={handleClick}
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  }}
>
  Custom Button
</div>

// ❌ Bad - Only mouse accessible
<div onClick={handleClick}>Custom Button</div>
```

### 4. Focus Management

Manage focus for dynamic content:

```tsx
import { useEffect, useRef } from 'react';

function Modal({ isOpen }) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && modalRef.current) {
      // Auto-focus on open
      modalRef.current.focus();
    }
  }, [isOpen]);

  return (
    <div
      ref={modalRef}
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
    >
      {/* Modal content */}
    </div>
  );
}
```

### 5. Live Regions

Use live regions for dynamic updates:

```tsx
// ✅ Good - Announces updates
<div
  role="status"
  aria-live="polite"
  aria-atomic="true"
>
  {`${items.length} items in cart`}
</div>

// For urgent updates
<div
  role="alert"
  aria-live="assertive"
  aria-atomic="true"
>
  Error: Payment failed
</div>
```

### 6. Color Contrast

Ensure sufficient color contrast (WCAG AA: 4.5:1 for normal text):

```tsx
// ✅ Good - High contrast
<button style={{ 
  backgroundColor: '#1890ff',
  color: '#ffffff'
}}>
  Submit
</button>

// ❌ Bad - Low contrast
<button style={{ 
  backgroundColor: '#cccccc',
  color: '#dddddd'
}}>
  Submit
</button>
```

### 7. Form Accessibility

Make forms accessible:

```tsx
// ✅ Good - Proper labels and error handling
<div>
  <label htmlFor="email">Email Address</label>
  <input
    id="email"
    type="email"
    aria-required="true"
    aria-invalid={hasError}
    aria-describedby={hasError ? 'email-error' : undefined}
  />
  {hasError && (
    <span id="email-error" role="alert">
      Please enter a valid email
    </span>
  )}
</div>

// ❌ Bad - No labels or error context
<input type="email" placeholder="Email" />
{hasError && <span>Invalid</span>}
```

## Testing Accessibility

### 1. Keyboard Testing

Test your app using only keyboard:
- **Tab** - Navigate forward
- **Shift+Tab** - Navigate backward
- **Enter/Space** - Activate buttons/links
- **Escape** - Close modals/dialogs
- **Arrow Keys** - Navigate within components

### 2. Screen Reader Testing

Test with screen readers:
- **macOS**: VoiceOver (Cmd+F5)
- **Windows**: NVDA (free) or JAWS
- **iOS**: VoiceOver (Settings > Accessibility)
- **Android**: TalkBack (Settings > Accessibility)

### 3. Browser DevTools

Use browser accessibility tools:

**Chrome DevTools**:
1. Open DevTools (F12)
2. Go to Lighthouse tab
3. Run Accessibility audit

**React DevTools**:
1. Install React DevTools extension
2. Check component tree for ARIA attributes

### 4. Automated Testing

Add accessibility tests:

```typescript
import { render } from '@testing-library/react';
import { axe } from 'jest-axe';

test('Component has no accessibility violations', async () => {
  const { container } = render(<YourComponent />);
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});
```

## Common Accessibility Patterns

### Modal Dialog

```tsx
function Modal({ isOpen, onClose, title, children }) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && modalRef.current) {
      modalRef.current.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      ref={modalRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          onClose();
        }
      }}
    >
      <h2 id="modal-title">{title}</h2>
      {children}
      <button
        onClick={onClose}
        aria-label="Close modal"
      >
        ✕
      </button>
    </div>
  );
}
```

### Loading State

```tsx
function LoadingButton({ isLoading, onClick, children }) {
  return (
    <button
      onClick={onClick}
      disabled={isLoading}
      aria-busy={isLoading}
      aria-live="polite"
    >
      {isLoading ? (
        <>
          <span aria-hidden="true">⏳</span>
          <span className="sr-only">Loading...</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
```

### Pagination

```tsx
function Pagination({ currentPage, totalPages, onPageChange }) {
  return (
    <nav aria-label="Pagination navigation">
      <ul role="list">
        <li>
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            aria-label="Go to previous page"
          >
            Previous
          </button>
        </li>
        <li>
          <span aria-current="page" aria-label={`Page ${currentPage} of ${totalPages}`}>
            {currentPage} / {totalPages}
          </span>
        </li>
        <li>
          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            aria-label="Go to next page"
          >
            Next
          </button>
        </li>
      </ul>
    </nav>
  );
}
```

## Resources

### WCAG Guidelines
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [WebAIM WCAG Checklist](https://webaim.org/standards/wcag/checklist)

### ARIA
- [ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/)
- [MDN ARIA Guide](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA)

### Testing Tools
- [axe DevTools](https://www.deque.com/axe/devtools/)
- [WAVE Browser Extension](https://wave.webaim.org/extension/)
- [Lighthouse](https://developers.google.com/web/tools/lighthouse)

### React-Specific
- [React Accessibility Docs](https://react.dev/learn/accessibility)
- [react-aria](https://react-spectrum.adobe.com/react-aria/)
- [Reach UI](https://reach.tech/)

## Support

If you encounter accessibility issues or have suggestions:
1. Open an issue on GitHub
2. Include screen reader/browser details
3. Describe the expected vs actual behavior
4. Provide code examples if applicable

---

**Remember**: Accessibility is not optional—it's a fundamental requirement for building inclusive web applications that work for everyone.
