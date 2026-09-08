import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { endpoints } from '../api/client';
import { useToast } from '../context/ToastContext';
import { Alert, Button, Card, Field, Input } from '../components/ui';

/**
 * Administrator lockout recovery.
 * Operators do not use this screen — the administrator resets their password directly.
 */
export default function ForgotPassword() {
  const toast = useToast();
  const navigate = useNavigate();

  const [step, setStep] = useState('request');
  const [identifier, setIdentifier] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [devOtp, setDevOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const requestCode = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await endpoints.auth.forgotPassword({ identifier: identifier.trim() });
      setDevOtp(data.devOtp || '');
      setStep('reset');
      toast.info('Reset code sent', 'Check the registered administrator email address.');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await endpoints.auth.resetPassword({
        identifier: identifier.trim(),
        otp: otp.trim(),
        newPassword,
      });
      toast.success('Password reset', 'You can now sign in with the new password.');
      navigate('/login', { replace: true });
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
        <h1>Account recovery</h1>
        <p>
          There is no login above the administrator, so recovery runs through the email address
          registered on the administrator account. A one-time code is sent there and expires in
          15 minutes.
        </p>
      </div>

      <div className="auth-panel">
        <div className="auth-card">
          <Card>
            <h2 style={{ fontSize: 20 }}>
              {step === 'request' ? 'Reset administrator password' : 'Enter the reset code'}
            </h2>
            <p className="text-muted text-small mt-0" style={{ marginBottom: 20 }}>
              {step === 'request'
                ? 'Enter the administrator login ID or registered email address.'
                : 'Enter the 6-digit code that was emailed, then choose a new password.'}
            </p>

            {error ? (
              <div className="mb-2">
                <Alert tone="danger">{error}</Alert>
              </div>
            ) : null}

            {devOtp ? (
              <div className="mb-2">
                <Alert tone="info" title="Email is not configured on this server">
                  The reset code is <strong className="mono">{devOtp}</strong>. Configure SMTP in the
                  backend .env to have codes emailed instead.
                </Alert>
              </div>
            ) : null}

            {step === 'request' ? (
              <form onSubmit={requestCode}>
                <Field label="Login ID or email" required>
                  <Input
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="admin or admin@tradingengineers.com"
                    autoFocus
                    required
                  />
                </Field>
                <Button type="submit" variant="primary" className="btn--block" loading={loading}>
                  Send reset code
                </Button>
              </form>
            ) : (
              <form onSubmit={resetPassword}>
                <Field label="Reset code" required>
                  <Input
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    placeholder="6-digit code"
                    inputMode="numeric"
                    autoFocus
                    required
                  />
                </Field>
                <Field label="New password" required hint="At least 8 characters and one number.">
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                  />
                </Field>
                <Button type="submit" variant="primary" className="btn--block" loading={loading}>
                  Set new password
                </Button>
                <Button type="button" className="btn--block mt-1" onClick={() => setStep('request')}>
                  Request a new code
                </Button>
              </form>
            )}

            <div className="text-center mt-2">
              <Link to="/login" className="text-small">
                ← Back to sign in
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
