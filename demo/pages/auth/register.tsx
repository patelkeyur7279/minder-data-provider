import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { minder } from 'minder-data-provider';

/**
 * Register Page Component
 * 
 * Features:
 * - User registration form
 * - Form validation
 * - Auto-login after registration
 * - Redirect to dashboard
 */
export default function RegisterPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    username: '',
    password: '',
    confirmPassword: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Validate passwords match
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    // Validate password length
    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters');
      setLoading(false);
      return;
    }

    try {
      // Call DummyJSON add user API
      const { data, error: registerError } = await minder('https://dummyjson.com/users/add', {
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        username: formData.username,
        password: formData.password,
      }, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (registerError) {
        setError(registerError.message || 'Registration failed');
        setLoading(false);
        return;
      }

      if (data) {
        setSuccess(true);
        
        // Create a mock token for demo purposes
        const mockToken = `mock_token_${Date.now()}`;
        localStorage.setItem('accessToken', mockToken);
        localStorage.setItem('user', JSON.stringify({
          id: data.id,
          username: data.username,
          email: data.email,
          firstName: data.firstName,
          lastName: data.lastName,
        }));

        // Redirect to dashboard after 1.5 seconds
        setTimeout(() => {
          router.push('/auth/dashboard');
        }, 1500);
      }
    } catch (err) {
      setError('An unexpected error occurred');
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          <h1 style={styles.title}>📝 Register</h1>
          <p style={styles.subtitle}>Create your account</p>
        </div>

        <form onSubmit={handleRegister} style={styles.form}>
          {error && (
            <div style={styles.errorBox}>
              <p style={styles.errorText}>❌ {error}</p>
            </div>
          )}

          {success && (
            <div style={styles.successBox}>
              <p style={styles.successText}>✅ Registration successful! Redirecting...</p>
            </div>
          )}

          <div style={styles.formRow}>
            <div style={styles.formGroup}>
              <label style={styles.label}>First Name</label>
              <input
                type="text"
                name="firstName"
                value={formData.firstName}
                onChange={handleChange}
                style={styles.input}
                placeholder="John"
                required
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Last Name</label>
              <input
                type="text"
                name="lastName"
                value={formData.lastName}
                onChange={handleChange}
                style={styles.input}
                placeholder="Doe"
                required
              />
            </div>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Email</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              style={styles.input}
              placeholder="john.doe@example.com"
              required
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Username</label>
            <input
              type="text"
              name="username"
              value={formData.username}
              onChange={handleChange}
              style={styles.input}
              placeholder="johndoe"
              required
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Password</label>
            <input
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              style={styles.input}
              placeholder="Min. 6 characters"
              required
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Confirm Password</label>
            <input
              type="password"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              style={styles.input}
              placeholder="Re-enter password"
              required
            />
          </div>

          <button 
            type="submit" 
            style={{
              ...styles.button,
              opacity: loading ? 0.7 : 1,
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
            disabled={loading || success}
          >
            {loading ? '🔄 Registering...' : success ? '✅ Success!' : '📝 Register'}
          </button>
        </form>

        <div style={styles.footer}>
          <p style={styles.footerText}>
            Already have an account?{' '}
            <a href="/auth/login" style={styles.link}>Login here</a>
          </p>
          <p style={styles.footerText}>
            <a href="/" style={styles.link}>← Back to Home</a>
          </p>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    padding: '20px',
  },
  card: {
    background: 'white',
    borderRadius: '16px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
    maxWidth: '540px',
    width: '100%',
    overflow: 'hidden',
  },
  header: {
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white',
    padding: '32px',
    textAlign: 'center',
  },
  title: {
    margin: 0,
    fontSize: '32px',
    fontWeight: 'bold',
  },
  subtitle: {
    margin: '8px 0 0 0',
    fontSize: '16px',
    opacity: 0.9,
  },
  form: {
    padding: '32px',
  },
  formRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
  },
  formGroup: {
    marginBottom: '20px',
  },
  label: {
    display: 'block',
    marginBottom: '8px',
    fontWeight: '600',
    color: '#374151',
    fontSize: '14px',
  },
  input: {
    width: '100%',
    padding: '12px 16px',
    border: '2px solid #e5e7eb',
    borderRadius: '8px',
    fontSize: '16px',
    transition: 'border-color 0.3s',
    boxSizing: 'border-box',
  },
  button: {
    width: '100%',
    padding: '14px',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: 'bold',
    cursor: 'pointer',
    transition: 'transform 0.2s',
    marginTop: '8px',
  },
  errorBox: {
    background: '#fee2e2',
    border: '2px solid #ef4444',
    borderRadius: '8px',
    padding: '12px',
    marginBottom: '20px',
  },
  errorText: {
    margin: 0,
    color: '#dc2626',
    fontSize: '14px',
  },
  successBox: {
    background: '#d1fae5',
    border: '2px solid #10b981',
    borderRadius: '8px',
    padding: '12px',
    marginBottom: '20px',
  },
  successText: {
    margin: 0,
    color: '#047857',
    fontSize: '14px',
    fontWeight: 'bold',
  },
  footer: {
    padding: '24px 32px',
    background: '#f9fafb',
    borderTop: '1px solid #e5e7eb',
    textAlign: 'center',
  },
  footerText: {
    margin: '8px 0',
    color: '#6b7280',
    fontSize: '14px',
  },
  link: {
    color: '#667eea',
    textDecoration: 'none',
    fontWeight: 'bold',
  },
};
