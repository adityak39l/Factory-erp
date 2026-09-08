import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import { Loading, EmptyState } from './components/ui';

import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import Dashboard from './pages/Dashboard';
import Analytics from './pages/Analytics';
import DepartmentOverview from './pages/DepartmentOverview';
import DprControlCenter from './pages/DprControlCenter';
import DprEntry from './pages/DprEntry';
// import DprBulkEntry from './pages/DprBulkEntry';
import MyWorkspace from './pages/MyWorkspace';
import IncompleteDpr from './pages/IncompleteDpr';
import Employees from './pages/Employees';
import EmployeeProfile from './pages/EmployeeProfile';
import EmployeeImport from './pages/EmployeeImport';
import Departments from './pages/Departments';
import Shifts from './pages/Shifts';
import Holidays from './pages/Holidays';
import Reports from './pages/Reports';
import Operators from './pages/Operators';
import AuditLog from './pages/AuditLog';
import Settings from './pages/Settings';
import SystemHealth from './pages/SystemHealth';
import Account from './pages/Account';
import Payroll from './pages/Payroll';
import Advances from './pages/Advances';

/** Route guard: authentication plus an optional permission requirement. */
function Protected({ children, permission, adminOnly }) {
  const { user, loading, can, isAdmin } = useAuth();
  const location = useLocation();

  if (loading) return <Loading text="Checking your session…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  const hasPermission = typeof permission === 'function' ? permission(can) : (permission ? can(permission) : true);

  if ((adminOnly && !isAdmin) || !hasPermission) {
    return (
      <Layout>
        <EmptyState
          icon="🔒"
          title="You do not have access to this screen"
          text="Your login does not include this permission. Ask the administrator to grant it if you need it."
        />
      </Layout>
    );
  }

  return <Layout>{children}</Layout>;
}

export default function App() {
  const { user, loading } = useAuth();

  return (
    <Routes>
      <Route
        path="/login"
        element={loading ? <Loading /> : user ? <Navigate to="/" replace /> : <Login />}
      />
      <Route path="/forgot-password" element={user ? <Navigate to="/" replace /> : <ForgotPassword />} />

      <Route path="/" element={<Protected><Dashboard /></Protected>} />
      <Route path="/analytics" element={<Protected permission="canViewReports"><Analytics /></Protected>} />
      <Route path="/departments-overview" element={<Protected><DepartmentOverview /></Protected>} />

      <Route path="/dpr/control-center" element={<Protected><DprControlCenter /></Protected>} />
      <Route path="/dpr/entry" element={<Protected permission="canEnterDpr"><DprEntry /></Protected>} />
      {/* <Route path="/dpr/bulk" element={<Protected permission="canEnterDpr"><DprBulkEntry /></Protected>} /> */}
      <Route path="/dpr/workspace" element={<Protected permission="canEnterDpr"><MyWorkspace /></Protected>} />
      <Route path="/dpr/incomplete" element={<Protected><IncompleteDpr /></Protected>} />

      <Route path="/employees" element={<Protected><Employees /></Protected>} />
      <Route
        path="/employees/import"
        element={<Protected permission="canRegisterEmployee"><EmployeeImport /></Protected>}
      />
      <Route path="/employees/:id" element={<Protected><EmployeeProfile /></Protected>} />

      <Route path="/departments" element={<Protected><Departments /></Protected>} />
      <Route path="/shifts" element={<Protected><Shifts /></Protected>} />
      <Route path="/holidays" element={<Protected><Holidays /></Protected>} />

      <Route path="/reports" element={<Protected permission="canViewReports"><Reports /></Protected>} />

      <Route
        path="/payroll"
        element={<Protected permission={(c) => c('canManagePayroll') || c('canViewSalary')}><Payroll /></Protected>}
      />
      <Route
        path="/advances"
        element={<Protected permission={(c) => c('canManageAdvances') || c('canViewSalary')}><Advances /></Protected>}
      />

      <Route path="/operators" element={<Protected adminOnly><Operators /></Protected>} />
      <Route path="/audit" element={<Protected adminOnly><AuditLog /></Protected>} />
      <Route path="/settings" element={<Protected adminOnly><Settings /></Protected>} />
      <Route path="/system" element={<Protected adminOnly><SystemHealth /></Protected>} />
      <Route path="/account" element={<Protected><Account /></Protected>} />

      <Route
        path="*"
        element={
          <Protected>
            <EmptyState icon="🧭" title="Page not found" text="The screen you are looking for does not exist." />
          </Protected>
        }
      />
    </Routes>
  );
}
