import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Alert, Button, Card, Field, Input } from '../components/ui';

const FEATURES = [
  ['🎛️', 'One screen for the whole day’s DPR'],
  ['🔒', 'Every entry locked and accountable'],
  ['📊', 'Instant history, reports and exports'],
];

export default function Login() {
  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [form, setForm] = useState({ username: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const expired = new URLSearchParams(location.search).get('expired');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await login(form.username.trim(), form.password.trim());
      toast.success(`Welcome back, ${user.name}`);
      navigate(location.state?.from || '/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-hero">
        <div className="auth-hero__logo">
          <img src="/logo.png" alt="Trading Engineers" />
        </div>
        <h1>Factory Employee &amp; DPR Management</h1>
        <p>
          The daily production report, attendance and workforce records for the pole manufacturing
          plant — structured, searchable and accountable, replacing the manual spreadsheet.
        </p>
        <div className="auth-hero__features">
          {FEATURES.map(([icon, text]) => (
            <div className="auth-hero__feature" key={text}>
              <span>{icon}</span>
              <span>{text}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="auth-panel">
        <div className="auth-card">
          <div className="auth-card__mobile-logo">
            <img src="/logo.png" alt="Trading Engineers" />
          </div>

          <Card>
            <h2 style={{ fontSize: 20 }}>Sign in</h2>
            <p className="text-muted text-small mt-0" style={{ marginBottom: 20 }}>
              Use the login ID given to you by the administrator.
            </p>

            {expired ? (
              <div className="mb-2">
                <Alert tone="warning">Your session expired. Please sign in again.</Alert>
              </div>
            ) : null}

            {error ? (
              <div className="mb-2">
                <Alert tone="danger">{error}</Alert>
              </div>
            ) : null}

            <form onSubmit={submit}>
              <Field label="Login ID" required>
                <Input
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  placeholder="e.g. admin"
                  autoFocus
                  autoComplete="username"
                  required
                />
              </Field>

              <Field label="Password" required>
                <Input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                />
              </Field>

              <Button
                type="submit"
                variant="primary"
                className="btn--block mt-1"
                loading={loading}
              >
                Sign in
              </Button>
            </form>

            <div className="text-center mt-2">
              <Link to="/forgot-password" className="text-small">
                Administrator forgot password?
              </Link>
            </div>
          </Card>

          <p className="text-center text-small text-muted mt-3">
            Trading Engineers · Factory Management System · Phase 1
          </p>
        </div>
      </div>
    </div>
  );
}
