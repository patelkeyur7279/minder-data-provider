import React, { useState } from "react";
import { useRouter } from "next/router";
import { minder } from "minder-data-provider";

/**
 * Login Page Component
 *
 * Features:
 * - Login with username/password
 * - Token storage in localStorage
 * - Redirect to dashboard on success
 * - Error handling
 */
export default function LoginPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    username: "emilys",
    password: "emilyspass",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      // Call DummyJSON login API
      const { data, error: loginError } = await minder(
        "https://dummyjson.com/auth/login",
        formData,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (loginError) {
        setError(loginError.message || "Login failed");
        setLoading(false);
        return;
      }

      if (data) {
        // Store auth data in localStorage
        localStorage.setItem("accessToken", data.accessToken);
        localStorage.setItem("refreshToken", data.refreshToken);
        localStorage.setItem(
          "user",
          JSON.stringify({
            id: data.id,
            username: data.username,
            email: data.email,
            firstName: data.firstName,
            lastName: data.lastName,
            gender: data.gender,
            image: data.image,
          })
        );

        // Redirect to dashboard
        router.push("/auth/dashboard");
      }
    } catch (err) {
      setError("An unexpected error occurred");
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          <h1 style={styles.title}>🔐 Login</h1>
          <p style={styles.subtitle}>Access your dashboard</p>
        </div>

        <form onSubmit={handleLogin} style={styles.form}>
          {error && (
            <div style={styles.errorBox}>
              <p style={styles.errorText}>❌ {error}</p>
            </div>
          )}

          <div style={styles.formGroup}>
            <label style={styles.label}>Username</label>
            <input
              type='text'
              name='username'
              value={formData.username}
              onChange={handleChange}
              style={styles.input}
              placeholder='Enter username'
              required
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Password</label>
            <input
              type='password'
              name='password'
              value={formData.password}
              onChange={handleChange}
              style={styles.input}
              placeholder='Enter password'
              required
            />
          </div>

          <button
            type='submit'
            style={{
              ...styles.button,
              opacity: loading ? 0.7 : 1,
              cursor: loading ? "not-allowed" : "pointer",
            }}
            disabled={loading}>
            {loading ? "🔄 Logging in..." : "✅ Login"}
          </button>
        </form>

        <div style={styles.footer}>
          <p style={styles.footerText}>
            Don't have an account?{" "}
            <a href='/auth/register' style={styles.link}>
              Register here
            </a>
          </p>
          <p style={styles.footerText}>
            <a href='/' style={styles.link}>
              ← Back to Home
            </a>
          </p>
        </div>

        <div style={styles.demoInfo}>
          <h3 style={styles.demoTitle}>🎯 Demo Credentials</h3>
          <div style={styles.demoGrid}>
            <div style={styles.demoItem}>
              <strong>Username:</strong> emilys
              <br />
              <strong>Password:</strong> emilyspass
            </div>
            <div style={styles.demoItem}>
              <strong>Username:</strong> michaelw
              <br />
              <strong>Password:</strong> michaelwpass
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    padding: "20px",
  },
  card: {
    background: "white",
    borderRadius: "16px",
    boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
    maxWidth: "480px",
    width: "100%",
    overflow: "hidden",
  },
  header: {
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    color: "white",
    padding: "32px",
    textAlign: "center",
  },
  title: {
    margin: 0,
    fontSize: "32px",
    fontWeight: "bold",
  },
  subtitle: {
    margin: "8px 0 0 0",
    fontSize: "16px",
    opacity: 0.9,
  },
  form: {
    padding: "32px",
  },
  formGroup: {
    marginBottom: "20px",
  },
  label: {
    display: "block",
    marginBottom: "8px",
    fontWeight: "600",
    color: "#374151",
    fontSize: "14px",
  },
  input: {
    width: "100%",
    padding: "12px 16px",
    border: "2px solid #e5e7eb",
    borderRadius: "8px",
    fontSize: "16px",
    transition: "border-color 0.3s",
    boxSizing: "border-box",
  },
  button: {
    width: "100%",
    padding: "14px",
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    color: "white",
    border: "none",
    borderRadius: "8px",
    fontSize: "16px",
    fontWeight: "bold",
    cursor: "pointer",
    transition: "transform 0.2s",
  },
  errorBox: {
    background: "#fee2e2",
    border: "2px solid #ef4444",
    borderRadius: "8px",
    padding: "12px",
    marginBottom: "20px",
  },
  errorText: {
    margin: 0,
    color: "#dc2626",
    fontSize: "14px",
  },
  footer: {
    padding: "24px 32px",
    background: "#f9fafb",
    borderTop: "1px solid #e5e7eb",
    textAlign: "center",
  },
  footerText: {
    margin: "8px 0",
    color: "#6b7280",
    fontSize: "14px",
  },
  link: {
    color: "#667eea",
    textDecoration: "none",
    fontWeight: "bold",
  },
  demoInfo: {
    padding: "24px 32px",
    background: "#fefce8",
    borderTop: "2px solid #fde047",
  },
  demoTitle: {
    margin: "0 0 16px 0",
    color: "#854d0e",
    fontSize: "16px",
  },
  demoGrid: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: "12px",
  },
  demoItem: {
    background: "white",
    padding: "12px",
    borderRadius: "6px",
    fontSize: "13px",
    color: "#374151",
    border: "1px solid #fde047",
  },
};
