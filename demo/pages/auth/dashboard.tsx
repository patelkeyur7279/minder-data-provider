import React, { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { minder } from "minder-data-provider";

interface User {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  username: string;
  image?: string;
  phone?: string;
  age?: number;
  gender?: string;
}

interface UsersResponse {
  users: User[];
  total: number;
  skip: number;
  limit: number;
}

/**
 * Dashboard Page Component
 *
 * Features:
 * - Protected route (requires authentication)
 * - Display current user profile
 * - Load and display list of users
 * - Search users
 * - Pagination
 * - Logout functionality
 */
export default function DashboardPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const usersPerPage = 10;

  // Check authentication on mount
  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    const userStr = localStorage.getItem("user");

    if (!token || !userStr) {
      // Not authenticated, redirect to login
      router.push("/auth/login");
      return;
    }

    try {
      const user = JSON.parse(userStr);
      setCurrentUser(user);
      loadUsers();
    } catch (err) {
      console.error("Error parsing user data:", err);
      handleLogout();
    }
  }, []);

  // Load users from API
  const loadUsers = async (page = 1) => {
    setLoading(true);
    const skip = (page - 1) * usersPerPage;

    const { data, error } = await minder<UsersResponse>(
      `https://dummyjson.com/users?limit=${usersPerPage}&skip=${skip}`
    );

    if (error) {
      console.error("Error loading users:", error);
      setLoading(false);
      return;
    }

    if (data) {
      setUsers(data.users);
      setTotalUsers(data.total);
      setCurrentPage(page);
    }

    setLoading(false);
  };

  // Search users
  const searchUsers = async (query: string) => {
    if (!query.trim()) {
      loadUsers();
      return;
    }

    setLoading(true);
    const { data, error } = await minder<UsersResponse>(
      `https://dummyjson.com/users/search?q=${encodeURIComponent(query)}`
    );

    if (error) {
      console.error("Error searching users:", error);
      setLoading(false);
      return;
    }

    if (data) {
      setUsers(data.users);
      setTotalUsers(data.total);
    }

    setLoading(false);
  };

  // Handle logout
  const handleLogout = () => {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("user");
    router.push("/auth/login");
  };

  // Handle search
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    searchUsers(searchQuery);
  };

  if (!currentUser) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner}>🔄</div>
        <p>Loading...</p>
      </div>
    );
  }

  const totalPages = Math.ceil(totalUsers / usersPerPage);

  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerContent}>
          <h1 style={styles.headerTitle}>📊 Dashboard</h1>
          <button onClick={handleLogout} style={styles.logoutButton}>
            🚪 Logout
          </button>
        </div>
      </header>

      <div style={styles.content}>
        {/* User Profile Card */}
        <div style={styles.profileCard}>
          <div style={styles.profileHeader}>
            <div style={styles.avatarContainer}>
              {currentUser.image ? (
                <img
                  src={currentUser.image}
                  alt={currentUser.username}
                  style={styles.avatar}
                />
              ) : (
                <div style={styles.avatarPlaceholder}>
                  {currentUser.firstName?.[0]}
                  {currentUser.lastName?.[0]}
                </div>
              )}
            </div>
            <div style={styles.profileInfo}>
              <h2 style={styles.profileName}>
                {currentUser.firstName} {currentUser.lastName}
              </h2>
              <p style={styles.profileUsername}>@{currentUser.username}</p>
              <p style={styles.profileEmail}>📧 {currentUser.email}</p>
            </div>
          </div>
        </div>

        {/* Users Section */}
        <div style={styles.usersSection}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>👥 Users ({totalUsers})</h2>

            {/* Search Form */}
            <form onSubmit={handleSearch} style={styles.searchForm}>
              <input
                type='text'
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder='Search users...'
                style={styles.searchInput}
              />
              <button type='submit' style={styles.searchButton}>
                🔍
              </button>
              {searchQuery && (
                <button
                  type='button'
                  onClick={() => {
                    setSearchQuery("");
                    loadUsers();
                  }}
                  style={styles.clearButton}>
                  ✖️
                </button>
              )}
            </form>
          </div>

          {/* Users Grid */}
          {loading ? (
            <div style={styles.loadingState}>
              <div style={styles.spinner}>🔄</div>
              <p>Loading users...</p>
            </div>
          ) : users.length === 0 ? (
            <div style={styles.emptyState}>
              <p style={styles.emptyText}>No users found</p>
            </div>
          ) : (
            <>
              <div style={styles.usersGrid}>
                {users.map((user) => (
                  <div key={user.id} style={styles.userCard}>
                    <div style={styles.userCardHeader}>
                      {user.image ? (
                        <img
                          src={user.image}
                          alt={user.username}
                          style={styles.userAvatar}
                        />
                      ) : (
                        <div style={styles.userAvatarPlaceholder}>
                          {user.firstName[0]}
                          {user.lastName[0]}
                        </div>
                      )}
                      <div style={styles.userInfo}>
                        <h3 style={styles.userName}>
                          {user.firstName} {user.lastName}
                        </h3>
                        <p style={styles.userUsername}>@{user.username}</p>
                      </div>
                    </div>
                    <div style={styles.userDetails}>
                      <p style={styles.userDetail}>📧 {user.email}</p>
                      {user.phone && (
                        <p style={styles.userDetail}>📱 {user.phone}</p>
                      )}
                      {user.age && (
                        <p style={styles.userDetail}>🎂 {user.age} years</p>
                      )}
                      {user.gender && (
                        <p style={styles.userDetail}>
                          {user.gender === "male" ? "👨" : "👩"} {user.gender}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {!searchQuery && totalPages > 1 && (
                <div style={styles.pagination}>
                  <button
                    onClick={() => loadUsers(currentPage - 1)}
                    disabled={currentPage === 1}
                    style={{
                      ...styles.pageButton,
                      opacity: currentPage === 1 ? 0.5 : 1,
                      cursor: currentPage === 1 ? "not-allowed" : "pointer",
                    }}>
                    ← Previous
                  </button>

                  <span style={styles.pageInfo}>
                    Page {currentPage} of {totalPages}
                  </span>

                  <button
                    onClick={() => loadUsers(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    style={{
                      ...styles.pageButton,
                      opacity: currentPage === totalPages ? 0.5 : 1,
                      cursor:
                        currentPage === totalPages ? "not-allowed" : "pointer",
                    }}>
                    Next →
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    background: "#f3f4f6",
  },
  header: {
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    color: "white",
    boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
  },
  headerContent: {
    maxWidth: "1200px",
    margin: "0 auto",
    padding: "20px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerTitle: {
    margin: 0,
    fontSize: "28px",
  },
  logoutButton: {
    padding: "10px 20px",
    background: "rgba(255,255,255,0.2)",
    border: "2px solid white",
    borderRadius: "8px",
    color: "white",
    fontWeight: "bold",
    cursor: "pointer",
    transition: "background 0.3s",
  },
  content: {
    maxWidth: "1200px",
    margin: "0 auto",
    padding: "20px",
  },
  profileCard: {
    background: "white",
    borderRadius: "12px",
    padding: "24px",
    marginBottom: "24px",
    boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
  },
  profileHeader: {
    display: "flex",
    alignItems: "center",
    gap: "20px",
  },
  avatarContainer: {
    flexShrink: 0,
  },
  avatar: {
    width: "80px",
    height: "80px",
    borderRadius: "50%",
    objectFit: "cover",
    border: "3px solid #667eea",
  },
  avatarPlaceholder: {
    width: "80px",
    height: "80px",
    borderRadius: "50%",
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    color: "white",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "32px",
    fontWeight: "bold",
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    margin: "0 0 4px 0",
    fontSize: "24px",
    color: "#111827",
  },
  profileUsername: {
    margin: "0 0 8px 0",
    color: "#6b7280",
    fontSize: "16px",
  },
  profileEmail: {
    margin: 0,
    color: "#374151",
    fontSize: "14px",
  },
  usersSection: {
    background: "white",
    borderRadius: "12px",
    padding: "24px",
    boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
  },
  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "24px",
    flexWrap: "wrap",
    gap: "16px",
  },
  sectionTitle: {
    margin: 0,
    fontSize: "20px",
    color: "#111827",
  },
  searchForm: {
    display: "flex",
    gap: "8px",
  },
  searchInput: {
    padding: "8px 12px",
    border: "2px solid #e5e7eb",
    borderRadius: "8px",
    fontSize: "14px",
    width: "240px",
  },
  searchButton: {
    padding: "8px 16px",
    background: "#667eea",
    color: "white",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    fontWeight: "bold",
  },
  clearButton: {
    padding: "8px 12px",
    background: "#ef4444",
    color: "white",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
  },
  usersGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
    gap: "16px",
  },
  userCard: {
    border: "1px solid #e5e7eb",
    borderRadius: "8px",
    padding: "16px",
    transition: "box-shadow 0.3s",
    cursor: "pointer",
  },
  userCardHeader: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    marginBottom: "12px",
  },
  userAvatar: {
    width: "48px",
    height: "48px",
    borderRadius: "50%",
    objectFit: "cover",
  },
  userAvatarPlaceholder: {
    width: "48px",
    height: "48px",
    borderRadius: "50%",
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    color: "white",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "16px",
    fontWeight: "bold",
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    margin: "0 0 4px 0",
    fontSize: "16px",
    color: "#111827",
  },
  userUsername: {
    margin: 0,
    fontSize: "13px",
    color: "#6b7280",
  },
  userDetails: {
    borderTop: "1px solid #f3f4f6",
    paddingTop: "12px",
  },
  userDetail: {
    margin: "4px 0",
    fontSize: "13px",
    color: "#374151",
  },
  loadingContainer: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    background: "#f3f4f6",
  },
  loadingState: {
    textAlign: "center",
    padding: "40px",
    color: "#6b7280",
  },
  emptyState: {
    textAlign: "center",
    padding: "40px",
  },
  emptyText: {
    color: "#6b7280",
    fontSize: "16px",
  },
  spinner: {
    fontSize: "48px",
    animation: "spin 1s linear infinite",
  },
  pagination: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: "16px",
    marginTop: "24px",
    paddingTop: "24px",
    borderTop: "1px solid #e5e7eb",
  },
  pageButton: {
    padding: "8px 16px",
    background: "#667eea",
    color: "white",
    border: "none",
    borderRadius: "8px",
    fontWeight: "bold",
    cursor: "pointer",
    transition: "opacity 0.3s",
  },
  pageInfo: {
    color: "#374151",
    fontWeight: "bold",
  },
};
