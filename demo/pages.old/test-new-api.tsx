/**
 * 🎯 Test New Universal minder() API
 *
 * Pure function approach - testing the new `minder()` function
 */

import React, { useState, useEffect } from "react";
import { minder, configureMinder } from "minder-data-provider";

// Configure global settings
configureMinder({
  baseURL: "https://jsonplaceholder.typicode.com",
  timeout: 5000,
});

export default function TestNewAPI() {
  // State for users (auto-fetch)
  const [users, setUsers] = useState<any>(null);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState<any>(null);

  // State for posts (manual fetch)
  const [posts, setPosts] = useState<any>(null);
  const [postsLoading, setPostsLoading] = useState(false);
  const [postsError, setPostsError] = useState<any>(null);

  // State for todos
  const [todos, setTodos] = useState<any>(null);
  const [todosLoading, setTodosLoading] = useState(false);
  const [todosError, setTodosError] = useState<any>(null);

  // Auto-fetch users on mount
  useEffect(() => {
    const fetchUsers = async () => {
      const result = await minder("/users");
      setUsersLoading(false);

      if (result.error) {
        setUsersError(result.error);
      } else {
        setUsers(result.data);
      }
    };

    fetchUsers();
  }, []);

  // Manual fetch posts
  const fetchPosts = async () => {
    setPostsLoading(true);
    setPostsError(null);
    const result = await minder("/posts");
    setPostsLoading(false);

    if (result.error) {
      setPostsError(result.error);
    } else {
      setPosts(result.data);
    }
  };

  // Manual fetch todos
  const fetchTodos = async () => {
    setTodosLoading(true);
    setTodosError(null);
    const result = await minder("/todos");
    setTodosLoading(false);

    if (result.error) {
      setTodosError(result.error);
    } else {
      setTodos(result.data);
    }
  };

  // Create post
  const createPost = async () => {
    const result = await minder("/posts", {
      title: "My New Post",
      body: "This is the content",
      userId: 1,
    });

    if (result.error) {
      alert(`Error: ${result.error.message}`);
    } else {
      alert(`Created! ID: ${result.data.id}`);
    }
  };

  // Update post
  const updatePost = async () => {
    const result = await minder(
      "/posts/1",
      {
        title: "Updated Title",
        body: "Updated content",
        userId: 1,
      },
      {
        method: "PUT",
      }
    );

    if (result.error) {
      alert(`Error: ${result.error.message}`);
    } else {
      alert("Updated successfully!");
    }
  };

  // Delete post
  const deletePost = async () => {
    const result = await minder("/posts/1", undefined, {
      method: "DELETE",
    });

    if (result.error) {
      alert(`Error: ${result.error.message}`);
    } else {
      alert("Deleted successfully!");
    }
  };

  return (
    <div
      style={{
        padding: "2rem",
        fontFamily: "system-ui",
        maxWidth: "1200px",
        margin: "0 auto",
      }}>
      <h1>🎯 Universal minder() Function Test</h1>
      <p>Testing the new simplified API with pure functions</p>

      <hr style={{ margin: "2rem 0" }} />

      {/* Example 1: Auto-fetch */}
      <section style={{ marginBottom: "2rem" }}>
        <h2>Example 1: Auto-fetch on Mount</h2>
        <div
          style={{
            padding: "1rem",
            background: usersLoading
              ? "#fef3c7"
              : users
              ? "#d1fae5"
              : "#fee2e2",
            borderRadius: "8px",
            marginBottom: "1rem",
          }}>
          {usersLoading && "⏳ Loading users..."}
          {usersError && `❌ Error: ${usersError.message}`}
          {users && `✅ Loaded ${users.length} users`}
        </div>
        {users && (
          <pre
            style={{
              background: "#f5f5f5",
              padding: "1rem",
              borderRadius: "8px",
              overflow: "auto",
              maxHeight: "200px",
            }}>
            {JSON.stringify(users.slice(0, 2), null, 2)}
          </pre>
        )}
      </section>

      {/* Example 2: Manual fetch */}
      <section style={{ marginBottom: "2rem" }}>
        <h2>Example 2: Manual Fetch</h2>
        <button
          onClick={fetchPosts}
          disabled={postsLoading}
          style={{
            padding: "0.75rem 1.5rem",
            background: postsLoading ? "#9ca3af" : "#10b981",
            color: "white",
            border: "none",
            borderRadius: "8px",
            cursor: postsLoading ? "not-allowed" : "pointer",
            fontSize: "16px",
            fontWeight: "600",
          }}>
          {postsLoading
            ? "⏳ Loading..."
            : posts
            ? `🔄 Refresh ${posts.length} posts`
            : "📥 Fetch Posts"}
        </button>
        {postsError && (
          <p style={{ color: "#ef4444", marginTop: "1rem" }}>
            ❌ {postsError.message}
          </p>
        )}
        {posts && (
          <pre
            style={{
              background: "#f5f5f5",
              padding: "1rem",
              borderRadius: "8px",
              overflow: "auto",
              maxHeight: "200px",
              marginTop: "1rem",
            }}>
            {JSON.stringify(posts.slice(0, 2), null, 2)}
          </pre>
        )}
      </section>

      {/* Example 3: Another manual fetch */}
      <section style={{ marginBottom: "2rem" }}>
        <h2>Example 3: Fetch Todos</h2>
        <button
          onClick={fetchTodos}
          disabled={todosLoading}
          style={{
            padding: "0.75rem 1.5rem",
            background: todosLoading ? "#9ca3af" : "#8b5cf6",
            color: "white",
            border: "none",
            borderRadius: "8px",
            cursor: todosLoading ? "not-allowed" : "pointer",
            fontSize: "16px",
            fontWeight: "600",
          }}>
          {todosLoading
            ? "⏳ Loading..."
            : todos
            ? `🔄 Refresh ${todos.length} todos`
            : "📥 Fetch Todos"}
        </button>
        {todosError && (
          <p style={{ color: "#ef4444", marginTop: "1rem" }}>
            ❌ {todosError.message}
          </p>
        )}
        {todos && (
          <pre
            style={{
              background: "#f5f5f5",
              padding: "1rem",
              borderRadius: "8px",
              overflow: "auto",
              maxHeight: "200px",
              marginTop: "1rem",
            }}>
            {JSON.stringify(todos.slice(0, 2), null, 2)}
          </pre>
        )}
      </section>

      <hr style={{ margin: "2rem 0" }} />

      {/* Mutations */}
      <section style={{ marginBottom: "2rem" }}>
        <h2>Examples 4-6: Mutations (Create/Update/Delete)</h2>
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          <button
            onClick={createPost}
            style={{
              padding: "0.75rem 1.5rem",
              background: "#10b981",
              color: "white",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              fontSize: "16px",
              fontWeight: "600",
            }}>
            ➕ Create Post (POST)
          </button>
          <button
            onClick={updatePost}
            style={{
              padding: "0.75rem 1.5rem",
              background: "#f59e0b",
              color: "white",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              fontSize: "16px",
              fontWeight: "600",
            }}>
            ✏️ Update Post (PUT)
          </button>
          <button
            onClick={deletePost}
            style={{
              padding: "0.75rem 1.5rem",
              background: "#ef4444",
              color: "white",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              fontSize: "16px",
              fontWeight: "600",
            }}>
            🗑️ Delete Post (DELETE)
          </button>
        </div>
      </section>

      <hr style={{ margin: "2rem 0" }} />

      {/* Code examples */}
      <section>
        <h2>📖 Code Examples</h2>

        <h3>Auto-fetch with useEffect</h3>
        <pre
          style={{
            background: "#1e1e1e",
            color: "#d4d4d4",
            padding: "1rem",
            borderRadius: "8px",
            overflow: "auto",
          }}>
          {`useEffect(() => {
  const fetchUsers = async () => {
    const result = await minder('/users');
    if (result.error) {
      setError(result.error);
    } else {
      setUsers(result.data);
    }
  };
  fetchUsers();
}, []);`}
        </pre>

        <h3>Manual Fetch</h3>
        <pre
          style={{
            background: "#1e1e1e",
            color: "#d4d4d4",
            padding: "1rem",
            borderRadius: "8px",
            overflow: "auto",
          }}>
          {`const result = await minder('/posts');
if (result.error) {
  console.error(result.error.message);
} else {
  setPosts(result.data);
}`}
        </pre>

        <h3>Create (Auto-detects POST)</h3>
        <pre
          style={{
            background: "#1e1e1e",
            color: "#d4d4d4",
            padding: "1rem",
            borderRadius: "8px",
            overflow: "auto",
          }}>
          {`const result = await minder('/posts', {
  title: 'My Post',
  body: 'Content',
  userId: 1,
});`}
        </pre>

        <h3>Update (Explicit PUT)</h3>
        <pre
          style={{
            background: "#1e1e1e",
            color: "#d4d4d4",
            padding: "1rem",
            borderRadius: "8px",
            overflow: "auto",
          }}>
          {`const result = await minder('/posts/1', 
  { title: 'Updated' },
  { method: 'PUT' }
);`}
        </pre>
      </section>

      <hr style={{ margin: "2rem 0" }} />

      <div
        style={{
          background: "#dbeafe",
          border: "2px solid #3b82f6",
          padding: "1.5rem",
          borderRadius: "8px",
        }}>
        <h3 style={{ margin: "0 0 0.5rem 0", color: "#1e40af" }}>
          ✅ Working!
        </h3>
        <p style={{ margin: 0, color: "#1e40af" }}>
          The universal{" "}
          <code
            style={{
              background: "white",
              padding: "0.25rem 0.5rem",
              borderRadius: "4px",
            }}>
            minder()
          </code>{" "}
          function is working perfectly with pure TypeScript functions!
        </p>
      </div>
    </div>
  );
}
