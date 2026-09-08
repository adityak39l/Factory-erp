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
  const [showServerConfig, setShowServerConfig] = useState(false);
  const [apiUrl, setApiUrl] = useState(localStorage.getItem('te_api_url') || '');

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

  const logoUrl = `${import.meta.env.BASE_URL}logo.png`;

  return (
    <div className="auth-screen">
      <div className="auth-hero">
        <div className="auth-hero__logo">
          <img src={logoUrl} alt="Trading Engineers" />
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
          <Card>
            <div style={{ textAlign: 'center', marginBottom: 16, display: 'flex', justifyContent: 'center' }}>
              <img
                src={logoUrl}
                alt="Trading Engineers"
                style={{ height: 42, maxWidth: '100%', objectFit: 'contain' }}
              />
            </div>

            <h2 style={{ fontSize: 20, textAlign: 'center' }}>Sign in</h2>
            <p className="text-muted text-small mt-0" style={{ marginBottom: 20, textAlign: 'center' }}>
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
                {window.location.hostname.includes('github.io') ? (
                  <div style={{ fontSize: 12, color: 'var(--slate-500)', marginTop: 8, lineHeight: 1.45, background: 'var(--slate-050)', padding: 8, borderRadius: 6, border: '1px solid var(--border)' }}>
                    ℹ️ <strong>GitHub Pages Note:</strong> GitHub Pages par sirf Frontend chalta hai (Node/MongoDB nahi). Login karne ke liye backend chalana zaroori hai. Local Wi-Fi par <code>http://10.50.241.47:5173</code> kholein ya niche Backend URL configure karein.
                  </div>
                ) : null}
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

            <div style={{ marginTop: 14, textAlign: 'center', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
              <button
                type="button"
                style={{ fontSize: 11, color: 'var(--slate-500)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                onClick={() => setShowServerConfig(!showServerConfig)}
              >
                {showServerConfig ? '▲ Hide Server Settings' : '⚙️ Backend Server Settings'}
              </button>
            </div>

            {showServerConfig ? (
              <div style={{ marginTop: 10, padding: 10, background: 'var(--slate-050)', borderRadius: 8, border: '1px solid var(--border)', textAlign: 'left' }}>
                <Field label="Backend API URL" hint="Live backend URL (e.g. https://your-app.onrender.com/api)">
                  <Input
                    value={apiUrl}
                    onChange={(e) => setApiUrl(e.target.value)}
                    placeholder="https://your-api.com/api"
                    style={{ fontSize: 12 }}
                  />
                </Field>
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => {
                      if (apiUrl.trim()) {
                        localStorage.setItem('te_api_url', apiUrl.trim());
                      } else {
                        localStorage.removeItem('te_api_url');
                      }
                      window.location.reload();
                    }}
                  >
                    Save &amp; Reload
                  </Button>
                  {localStorage.getItem('te_api_url') ? (
                    <Button
                      size="sm"
                      onClick={() => {
                        localStorage.removeItem('te_api_url');
                        window.location.reload();
                      }}
                    >
                      Reset
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </Card>

          <p className="text-center text-small text-muted mt-3">
            Trading Engineers · Factory Management System · Phase 1
          </p>
        </div>
      </div>
    </div>
  );
}
