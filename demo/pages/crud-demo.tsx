import React, { useState } from "react";
import { minder } from "minder-data-provider";

interface Post {
  id: number;
  title: string;
  body: string;
  userId: number;
  reactions?: number;
  tags?: string[];
}

interface User {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
}

export default function CrudDemo() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  // Form states
  const [newPost, setNewPost] = useState({
    title: "",
    body: "",
    userId: 1,
  });

  const [editPost, setEditPost] = useState({
    id: 0,
    title: "",
    body: "",
    userId: 1,
  });

  const showMessage = (msg: string, type: "success" | "error" = "success") => {
    setMessage(msg);
    setTimeout(() => setMessage(""), 3000);
  };

  // CREATE - Add new post
  const handleCreatePost = async () => {
    if (!newPost.title || !newPost.body) {
      showMessage("Please fill in all fields", "error");
      return;
    }

    setLoading(true);
    try {
      const result = await minder("https://dummyjson.com/posts/add", {
        title: newPost.title,
        body: newPost.body,
        userId: newPost.userId,
        reactions: 0,
      });

      console.log("Created post:", result);

      if (result.error) {
        showMessage("❌ Failed to create post", "error");
      } else {
        // Add to posts list (DummyJSON returns the created post)
        const createdPost = result.data as Post;
        setPosts([createdPost, ...posts]);

        // Reset form
        setNewPost({ title: "", body: "", userId: 1 });
        showMessage(`✅ Post created successfully! ID: ${createdPost.id}`);
      }
    } catch (error) {
      console.error("Create error:", error);
      showMessage("❌ Failed to create post", "error");
    } finally {
      setLoading(false);
    }
  };

  // READ - Get all posts
  const handleGetPosts = async () => {
    setLoading(true);
    try {
      const result = await minder("https://dummyjson.com/posts?limit=10");

      console.log("Fetched posts:", result);

      if (result.error) {
        showMessage("❌ Failed to fetch posts", "error");
      } else {
        const data: any = result.data;
        setPosts(data.posts || []);
        showMessage(`✅ Loaded ${data.posts?.length || 0} posts`);
      }
    } catch (error) {
      console.error("Get error:", error);
      showMessage("❌ Failed to fetch posts", "error");
    } finally {
      setLoading(false);
    }
  };

  // READ - Get single post
  const handleGetSinglePost = async (postId: number) => {
    setLoading(true);
    try {
      const result = await minder(`https://dummyjson.com/posts/${postId}`);

      console.log("Fetched single post:", result);

      if (result.error) {
        showMessage("❌ Failed to fetch post", "error");
      } else {
        setSelectedPost(result.data as Post);
        showMessage(`✅ Loaded post #${postId}`);
      }
    } catch (error) {
      console.error("Get single post error:", error);
      showMessage("❌ Failed to fetch post", "error");
    } finally {
      setLoading(false);
    }
  };

  // UPDATE - Edit post
  const handleUpdatePost = async () => {
    if (!editPost.id || !editPost.title || !editPost.body) {
      showMessage("Please fill in all fields", "error");
      return;
    }

    setLoading(true);
    try {
      const result = await minder(
        `https://dummyjson.com/posts/${editPost.id}`,
        {
          title: editPost.title,
          body: editPost.body,
          userId: editPost.userId,
        },
        {
          method: "PUT",
        }
      );

      console.log("Updated post:", result);

      if (result.error) {
        showMessage("❌ Failed to update post", "error");
      } else {
        // Update in posts list
        setPosts(
          posts.map((p) => (p.id === editPost.id ? (result.data as Post) : p))
        );

        // Reset form
        setEditPost({ id: 0, title: "", body: "", userId: 1 });
        showMessage(`✅ Post #${editPost.id} updated successfully!`);
      }
    } catch (error) {
      console.error("Update error:", error);
      showMessage("❌ Failed to update post", "error");
    } finally {
      setLoading(false);
    }
  };

  // PATCH - Partial update
  const handlePatchPost = async (postId: number, field: string, value: any) => {
    setLoading(true);
    try {
      const result = await minder(
        `https://dummyjson.com/posts/${postId}`,
        {
          [field]: value,
        },
        {
          method: "PATCH",
        }
      );

      console.log("Patched post:", result);

      if (result.error) {
        showMessage("❌ Failed to patch post", "error");
      } else {
        // Update in posts list
        setPosts(
          posts.map((p) => (p.id === postId ? (result.data as Post) : p))
        );
        showMessage(`✅ Post #${postId} ${field} updated!`);
      }
    } catch (error) {
      console.error("Patch error:", error);
      showMessage("❌ Failed to patch post", "error");
    } finally {
      setLoading(false);
    }
  };

  // DELETE - Remove post
  const handleDeletePost = async (postId: number) => {
    if (!confirm(`Are you sure you want to delete post #${postId}?`)) {
      return;
    }

    setLoading(true);
    try {
      const result = await minder(
        `https://dummyjson.com/posts/${postId}`,
        {},
        {
          method: "DELETE",
        }
      );

      console.log("Deleted post:", result);

      if (result.error) {
        showMessage("❌ Failed to delete post", "error");
      } else {
        // Remove from posts list
        setPosts(posts.filter((p) => p.id !== postId));
        showMessage(`✅ Post #${postId} deleted successfully!`);
      }
    } catch (error) {
      console.error("Delete error:", error);
      showMessage("❌ Failed to delete post", "error");
    } finally {
      setLoading(false);
    }
  };

  // SEARCH - Search posts
  const handleSearchPosts = async (query: string) => {
    if (!query.trim()) {
      showMessage("Please enter a search query", "error");
      return;
    }

    setLoading(true);
    try {
      const result = await minder(
        `https://dummyjson.com/posts/search?q=${query}`
      );

      console.log("Search results:", result);

      if (result.error) {
        showMessage("❌ Search failed", "error");
      } else {
        const data: any = result.data;
        setPosts(data.posts || []);
        showMessage(`✅ Found ${data.posts?.length || 0} posts`);
      }
    } catch (error) {
      console.error("Search error:", error);
      showMessage("❌ Search failed", "error");
    } finally {
      setLoading(false);
    }
  };

  // Get users for demo
  const handleGetUsers = async () => {
    setLoading(true);
    try {
      const result = await minder(
        "https://dummyjson.com/users?limit=5&select=firstName,lastName,email"
      );

      console.log("Fetched users:", result);

      if (result.error) {
        showMessage("❌ Failed to fetch users", "error");
      } else {
        const data: any = result.data;
        setUsers(data.users || []);
        showMessage(`✅ Loaded ${data.users?.length || 0} users`);
      }
    } catch (error) {
      console.error("Get users error:", error);
      showMessage("❌ Failed to fetch users", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        padding: "40px",
        maxWidth: "1400px",
        margin: "0 auto",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}>
      <h1 style={{ fontSize: "36px", marginBottom: "10px", color: "#333" }}>
        🚀 Complete CRUD Demo
      </h1>
      <p style={{ color: "#666", marginBottom: "30px", fontSize: "16px" }}>
        Demonstrating all minder() API operations: Create, Read, Update, Patch,
        Delete, Search
      </p>

      {/* Message Banner */}
      {message && (
        <div
          style={{
            padding: "15px 20px",
            marginBottom: "20px",
            borderRadius: "8px",
            backgroundColor: message.includes("❌") ? "#fee" : "#efe",
            border: `1px solid ${message.includes("❌") ? "#fcc" : "#cfc"}`,
            color: message.includes("❌") ? "#c33" : "#363",
          }}>
          {message}
        </div>
      )}

      {/* Loading Indicator */}
      {loading && (
        <div
          style={{
            padding: "15px 20px",
            marginBottom: "20px",
            borderRadius: "8px",
            backgroundColor: "#e3f2fd",
            border: "1px solid #90caf9",
            color: "#1976d2",
          }}>
          ⏳ Loading...
        </div>
      )}

      {/* Grid Layout */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "30px",
          marginBottom: "40px",
        }}>
        {/* CREATE Section */}
        <div
          style={{
            padding: "25px",
            backgroundColor: "#fff",
            borderRadius: "12px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
            border: "1px solid #e0e0e0",
          }}>
          <h2
            style={{
              fontSize: "24px",
              marginBottom: "20px",
              color: "#2196f3",
            }}>
            ➕ CREATE Post
          </h2>

          <div style={{ marginBottom: "15px" }}>
            <label
              style={{
                display: "block",
                marginBottom: "5px",
                fontWeight: "600",
                color: "#555",
              }}>
              Title:
            </label>
            <input
              type='text'
              value={newPost.title}
              onChange={(e) =>
                setNewPost({ ...newPost, title: e.target.value })
              }
              placeholder='Enter post title...'
              style={{
                width: "100%",
                padding: "10px",
                border: "1px solid #ddd",
                borderRadius: "6px",
                fontSize: "14px",
              }}
            />
          </div>

          <div style={{ marginBottom: "15px" }}>
            <label
              style={{
                display: "block",
                marginBottom: "5px",
                fontWeight: "600",
                color: "#555",
              }}>
              Body:
            </label>
            <textarea
              value={newPost.body}
              onChange={(e) => setNewPost({ ...newPost, body: e.target.value })}
              placeholder='Enter post content...'
              rows={4}
              style={{
                width: "100%",
                padding: "10px",
                border: "1px solid #ddd",
                borderRadius: "6px",
                fontSize: "14px",
                resize: "vertical",
              }}
            />
          </div>

          <div style={{ marginBottom: "20px" }}>
            <label
              style={{
                display: "block",
                marginBottom: "5px",
                fontWeight: "600",
                color: "#555",
              }}>
              User ID:
            </label>
            <input
              type='number'
              value={newPost.userId}
              onChange={(e) =>
                setNewPost({
                  ...newPost,
                  userId: parseInt(e.target.value) || 1,
                })
              }
              min='1'
              style={{
                width: "100%",
                padding: "10px",
                border: "1px solid #ddd",
                borderRadius: "6px",
                fontSize: "14px",
              }}
            />
          </div>

          <button
            onClick={handleCreatePost}
            disabled={loading}
            style={{
              width: "100%",
              padding: "12px",
              backgroundColor: "#4caf50",
              color: "white",
              border: "none",
              borderRadius: "6px",
              fontSize: "16px",
              fontWeight: "600",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1,
            }}>
            Create New Post
          </button>
        </div>

        {/* UPDATE Section */}
        <div
          style={{
            padding: "25px",
            backgroundColor: "#fff",
            borderRadius: "12px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
            border: "1px solid #e0e0e0",
          }}>
          <h2
            style={{
              fontSize: "24px",
              marginBottom: "20px",
              color: "#ff9800",
            }}>
            ✏️ UPDATE Post
          </h2>

          <div style={{ marginBottom: "15px" }}>
            <label
              style={{
                display: "block",
                marginBottom: "5px",
                fontWeight: "600",
                color: "#555",
              }}>
              Post ID to Update:
            </label>
            <input
              type='number'
              value={editPost.id || ""}
              onChange={(e) =>
                setEditPost({ ...editPost, id: parseInt(e.target.value) || 0 })
              }
              placeholder='Enter post ID (1-150)'
              min='1'
              style={{
                width: "100%",
                padding: "10px",
                border: "1px solid #ddd",
                borderRadius: "6px",
                fontSize: "14px",
              }}
            />
          </div>

          <div style={{ marginBottom: "15px" }}>
            <label
              style={{
                display: "block",
                marginBottom: "5px",
                fontWeight: "600",
                color: "#555",
              }}>
              New Title:
            </label>
            <input
              type='text'
              value={editPost.title}
              onChange={(e) =>
                setEditPost({ ...editPost, title: e.target.value })
              }
              placeholder='Updated title...'
              style={{
                width: "100%",
                padding: "10px",
                border: "1px solid #ddd",
                borderRadius: "6px",
                fontSize: "14px",
              }}
            />
          </div>

          <div style={{ marginBottom: "20px" }}>
            <label
              style={{
                display: "block",
                marginBottom: "5px",
                fontWeight: "600",
                color: "#555",
              }}>
              New Body:
            </label>
            <textarea
              value={editPost.body}
              onChange={(e) =>
                setEditPost({ ...editPost, body: e.target.value })
              }
              placeholder='Updated content...'
              rows={3}
              style={{
                width: "100%",
                padding: "10px",
                border: "1px solid #ddd",
                borderRadius: "6px",
                fontSize: "14px",
                resize: "vertical",
              }}
            />
          </div>

          <button
            onClick={handleUpdatePost}
            disabled={loading}
            style={{
              width: "100%",
              padding: "12px",
              backgroundColor: "#ff9800",
              color: "white",
              border: "none",
              borderRadius: "6px",
              fontSize: "16px",
              fontWeight: "600",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1,
            }}>
            Update Post (PUT)
          </button>
        </div>
      </div>

      {/* Quick Actions */}
      <div
        style={{
          padding: "25px",
          backgroundColor: "#fff",
          borderRadius: "12px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
          border: "1px solid #e0e0e0",
          marginBottom: "30px",
        }}>
        <h2
          style={{ fontSize: "24px", marginBottom: "20px", color: "#673ab7" }}>
          ⚡ Quick Actions
        </h2>

        <div style={{ display: "flex", gap: "15px", flexWrap: "wrap" }}>
          <button
            onClick={handleGetPosts}
            disabled={loading}
            style={{
              padding: "12px 24px",
              backgroundColor: "#2196f3",
              color: "white",
              border: "none",
              borderRadius: "6px",
              fontSize: "14px",
              fontWeight: "600",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1,
            }}>
            📋 Get All Posts
          </button>

          <button
            onClick={() => handleGetSinglePost(1)}
            disabled={loading}
            style={{
              padding: "12px 24px",
              backgroundColor: "#00bcd4",
              color: "white",
              border: "none",
              borderRadius: "6px",
              fontSize: "14px",
              fontWeight: "600",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1,
            }}>
            🔍 Get Post #1
          </button>

          <button
            onClick={() => handleSearchPosts("love")}
            disabled={loading}
            style={{
              padding: "12px 24px",
              backgroundColor: "#9c27b0",
              color: "white",
              border: "none",
              borderRadius: "6px",
              fontSize: "14px",
              fontWeight: "600",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1,
            }}>
            🔎 Search "love"
          </button>

          <button
            onClick={handleGetUsers}
            disabled={loading}
            style={{
              padding: "12px 24px",
              backgroundColor: "#607d8b",
              color: "white",
              border: "none",
              borderRadius: "6px",
              fontSize: "14px",
              fontWeight: "600",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1,
            }}>
            👥 Get Users
          </button>
        </div>
      </div>

      {/* Selected Post Detail */}
      {selectedPost && (
        <div
          style={{
            padding: "25px",
            backgroundColor: "#e3f2fd",
            borderRadius: "12px",
            border: "2px solid #2196f3",
            marginBottom: "30px",
          }}>
          <h3
            style={{
              fontSize: "20px",
              marginBottom: "15px",
              color: "#1976d2",
            }}>
            📄 Selected Post Details
          </h3>
          <p>
            <strong>ID:</strong> {selectedPost.id}
          </p>
          <p>
            <strong>Title:</strong> {selectedPost.title}
          </p>
          <p>
            <strong>Body:</strong> {selectedPost.body}
          </p>
          <p>
            <strong>User ID:</strong> {selectedPost.userId}
          </p>
          {selectedPost.reactions !== undefined && (
            <p>
              <strong>Reactions:</strong>{" "}
              {typeof selectedPost.reactions === "object"
                ? JSON.stringify(selectedPost.reactions)
                : selectedPost.reactions}
            </p>
          )}
          {selectedPost.tags && (
            <p>
              <strong>Tags:</strong> {selectedPost.tags.join(", ")}
            </p>
          )}
        </div>
      )}

      {/* Users List */}
      {users.length > 0 && (
        <div
          style={{
            padding: "25px",
            backgroundColor: "#fff",
            borderRadius: "12px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
            border: "1px solid #e0e0e0",
            marginBottom: "30px",
          }}>
          <h3 style={{ fontSize: "20px", marginBottom: "15px", color: "#555" }}>
            👥 Users ({users.length})
          </h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: "15px",
            }}>
            {users.map((user) => (
              <div
                key={user.id}
                style={{
                  padding: "15px",
                  backgroundColor: "#f5f5f5",
                  borderRadius: "8px",
                  border: "1px solid #ddd",
                }}>
                <p style={{ fontWeight: "600", marginBottom: "5px" }}>
                  {user.firstName} {user.lastName}
                </p>
                <p style={{ fontSize: "12px", color: "#666" }}>{user.email}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Posts List */}
      {posts.length > 0 && (
        <div
          style={{
            padding: "25px",
            backgroundColor: "#fff",
            borderRadius: "12px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
            border: "1px solid #e0e0e0",
          }}>
          <h3 style={{ fontSize: "20px", marginBottom: "15px", color: "#555" }}>
            📝 Posts ({posts.length})
          </h3>

          <div
            style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
            {posts.map((post) => (
              <div
                key={post.id}
                style={{
                  padding: "20px",
                  backgroundColor: "#fafafa",
                  borderRadius: "8px",
                  border: "1px solid #e0e0e0",
                }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "start",
                    marginBottom: "10px",
                  }}>
                  <div style={{ flex: 1 }}>
                    <h4
                      style={{
                        fontSize: "18px",
                        marginBottom: "8px",
                        color: "#333",
                      }}>
                      #{post.id} - {post.title}
                    </h4>
                    <p
                      style={{
                        color: "#666",
                        fontSize: "14px",
                        marginBottom: "10px",
                      }}>
                      {post.body}
                    </p>
                    <p style={{ fontSize: "12px", color: "#999" }}>
                      User ID: {post.userId} | Reactions:{" "}
                      {typeof post.reactions === "object"
                        ? JSON.stringify(post.reactions)
                        : post.reactions || 0}
                    </p>
                  </div>

                  <div
                    style={{ display: "flex", gap: "8px", marginLeft: "15px" }}>
                    <button
                      onClick={() => {
                        setEditPost({
                          id: post.id,
                          title: post.title,
                          body: post.body,
                          userId: post.userId,
                        });
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      style={{
                        padding: "6px 12px",
                        backgroundColor: "#2196f3",
                        color: "white",
                        border: "none",
                        borderRadius: "4px",
                        fontSize: "12px",
                        cursor: "pointer",
                      }}>
                      Edit
                    </button>

                    <button
                      onClick={() => {
                        const currentReactions =
                          typeof post.reactions === "number"
                            ? post.reactions
                            : 0;
                        handlePatchPost(
                          post.id,
                          "reactions",
                          currentReactions + 1
                        );
                      }}
                      disabled={loading}
                      style={{
                        padding: "6px 12px",
                        backgroundColor: "#ff9800",
                        color: "white",
                        border: "none",
                        borderRadius: "4px",
                        fontSize: "12px",
                        cursor: loading ? "not-allowed" : "pointer",
                        opacity: loading ? 0.6 : 1,
                      }}>
                      👍 +1
                    </button>

                    <button
                      onClick={() => handleDeletePost(post.id)}
                      disabled={loading}
                      style={{
                        padding: "6px 12px",
                        backgroundColor: "#f44336",
                        color: "white",
                        border: "none",
                        borderRadius: "4px",
                        fontSize: "12px",
                        cursor: loading ? "not-allowed" : "pointer",
                        opacity: loading ? 0.6 : 1,
                      }}>
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* API Documentation */}
      <div
        style={{
          marginTop: "40px",
          padding: "25px",
          backgroundColor: "#f9f9f9",
          borderRadius: "12px",
          border: "1px solid #e0e0e0",
        }}>
        <h3 style={{ fontSize: "20px", marginBottom: "15px", color: "#555" }}>
          📚 API Operations Demonstrated
        </h3>

        <ul style={{ lineHeight: "1.8", color: "#666" }}>
          <li>
            <strong>CREATE (POST):</strong> Add new posts to the system
          </li>
          <li>
            <strong>READ (GET):</strong> Fetch all posts or a single post by ID
          </li>
          <li>
            <strong>UPDATE (PUT):</strong> Complete update of a post
          </li>
          <li>
            <strong>PATCH:</strong> Partial update (e.g., increment reactions)
          </li>
          <li>
            <strong>DELETE:</strong> Remove a post from the system
          </li>
          <li>
            <strong>SEARCH:</strong> Query posts by keyword
          </li>
        </ul>

        <p style={{ marginTop: "15px", color: "#999", fontSize: "14px" }}>
          All operations use the DummyJSON API (https://dummyjson.com) for
          demonstration.
        </p>
      </div>

      {/* Back to Home */}
      <div style={{ marginTop: "30px", textAlign: "center" }}>
        <a
          href='/'
          style={{
            display: "inline-block",
            padding: "12px 30px",
            backgroundColor: "#333",
            color: "white",
            textDecoration: "none",
            borderRadius: "6px",
            fontSize: "16px",
            fontWeight: "600",
          }}>
          ← Back to Home
        </a>
      </div>
    </div>
  );
}
