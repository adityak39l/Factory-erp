import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { endpoints } from '../api/client';
import { Avatar } from './ui';

/** Navigation is filtered by the user's permissions — admins see everything. */
const NAV = [
  {
    section: 'Overview',
    items: [
      { to: '/', label: 'Dashboard', icon: '📊', end: true },
      { to: '/analytics', label: 'Analytics', icon: '📈', permission: 'canViewReports' },
      { to: '/departments-overview', label: 'Department View', icon: '🏭' },
    ],
  },
  {
    section: 'Daily Production Report',
    items: [
      { to: '/dpr/control-center', label: 'DPR Control Center', icon: '🎛️' },
      { to: '/dpr/entry', label: 'DPR Entry', icon: '📝', permission: 'canEnterDpr' },
      // { to: '/dpr/bulk', label: 'Bulk DPR Entry', icon: '⚡', permission: 'canEnterDpr' },
      { to: '/dpr/workspace', label: 'My Workspace', icon: '🗂️', permission: 'canEnterDpr' },
      { to: '/dpr/incomplete', label: 'Incomplete DPR', icon: '🟡' },
    ],
  },
  {
    section: 'People',
    items: [
      { to: '/employees', label: 'Employees', icon: '👷' },
      { to: '/employees/import', label: 'Bulk Import', icon: '📥', permission: 'canRegisterEmployee' },
    ],
  },
  {
    section: 'Payroll & Compensation',
    items: [
      { to: '/payroll', label: 'Monthly Payroll', icon: '💰', permission: (c) => c('canManagePayroll') || c('canViewSalary') },
      { to: '/advances', label: 'Salary Advances', icon: '💸', permission: (c) => c('canManageAdvances') || c('canViewSalary') },
    ],
  },
  {
    section: 'Configuration',
    items: [
      { to: '/departments', label: 'Departments & Teams', icon: '🏗️' },
      { to: '/shifts', label: 'Shifts', icon: '🕐' },
      { to: '/holidays', label: 'Holiday Calendar', icon: '📅' },
    ],
  },
  {
    section: 'Reporting',
    items: [{ to: '/reports', label: 'Reports & Export', icon: '📄', permission: 'canViewReports' }],
  },
  {
    section: 'Administration',
    items: [
      { to: '/operators', label: 'Operators & Access', icon: '🔐', adminOnly: true },
      { to: '/audit', label: 'Audit Log', icon: '🧾', adminOnly: true },
      { to: '/settings', label: 'System Settings', icon: '⚙️', adminOnly: true },
      { to: '/system', label: 'System Health', icon: '💚', adminOnly: true },
    ],
  },
];

const TITLES = {
  '/': 'Dashboard',
  '/analytics': 'Monthly Analytics',
  '/departments-overview': 'Department View',
  '/dpr/control-center': 'DPR Control Center',
  '/dpr/entry': 'DPR Entry',
  '/dpr/bulk': 'Bulk DPR Entry',
  '/dpr/workspace': 'My Workspace',
  '/dpr/incomplete': 'Incomplete DPR',
  '/employees': 'Employees',
  '/employees/import': 'Bulk Employee Import',
  '/payroll': 'Monthly Payroll & Salary Register',
  '/advances': 'Salary Advances & EMIs',
  '/departments': 'Departments & Teams',
  '/shifts': 'Shift Settings',
  '/holidays': 'Holiday Calendar',
  '/reports': 'Reports & Export',
  '/operators': 'Operators & Access Control',
  '/audit': 'Audit Log',
  '/settings': 'System Settings',
  '/system': 'System Health',
  '/account': 'My Account',
};

export default function Layout({ children }) {
  const { user, logout, can, isAdmin } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const pageTitle =
    TITLES[location.pathname] ||
    (location.pathname.startsWith('/employees/') ? 'Employee Profile' : 'Trading Engineers');

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const searchRef = useRef(null);

  useEffect(() => {
    setSidebarOpen(false);
    setMenuOpen(false);
    setBellOpen(false);
  }, [location.pathname]);

  // Poll the derived notification feed so the bell stays current through the day.
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const { data } = await endpoints.dashboard.notifications();
        if (active) setNotifications(data.items || []);
      } catch {
        /* the bell is non-critical — stay quiet on failure */
      }
    };
    load();
    const timer = setInterval(load, 120000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  // Debounced global search.
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults(null);
      return undefined;
    }
    const timer = setTimeout(async () => {
      try {
        const { data } = await endpoints.dashboard.search(query.trim());
        setResults(data.results);
      } catch {
        setResults(null);
      }
    }, 260);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const onClickOutside = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) setResults(null);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const isVisible = useCallback(
    (item) => {
      if (item.adminOnly) return isAdmin;
      if (typeof item.permission === 'function') return item.permission(can);
      if (item.permission) return can(item.permission);
      return true;
    },
    [can, isAdmin]
  );

  const goto = (path) => {
    setQuery('');
    setResults(null);
    navigate(path);
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? 'sidebar--open' : ''}`}>
        <div className="sidebar__brand">
          <div className="sidebar__logo">
            <img src="/logo.png" alt="Trading Engineers" />
          </div>
          <div className="sidebar__brand-text">
            <span className="sidebar__brand-name">Trading Engineers</span>
            <span className="sidebar__brand-sub">Factory Management</span>
          </div>
        </div>

        <nav className="sidebar__nav">
          {NAV.map((group) => {
            const items = group.items.filter(isVisible);
            if (!items.length) return null;
            return (
              <div key={group.section}>
                <div className="nav-section">{group.section}</div>
                {items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) => `nav-item ${isActive ? 'nav-item--active' : ''}`}
                  >
                    <span className="nav-item__icon">{item.icon}</span>
                    <span>{item.label}</span>
                    {item.to === '/dpr/incomplete' && notifications.some((n) => n.id === 'incomplete-today') ? (
                      <span className="nav-item__badge">!</span>
                    ) : null}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>

        <div className="sidebar__footer">
          Phase 1 · Employee &amp; DPR
          <br />
          v1.0.0
        </div>
      </aside>

      {sidebarOpen ? <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} /> : null}

      <div className="main-area">
        <header className="header">
          <button className="header__menu" onClick={() => setSidebarOpen((v) => !v)} aria-label="Toggle menu">
            ☰
          </button>
          <div className="header__title">{pageTitle}</div>
          <div className="header__spacer" />

          <div className="search-box" ref={searchRef}>
            <span className="search-box__icon">🔍</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search employee, ID, mobile, department…"
              aria-label="Global search"
            />
            {results ? (
              <div className="search-results">
                {results.employees?.length ? (
                  <>
                    <div className="search-results__group">Employees</div>
                    {results.employees.map((e) => (
                      <div
                        key={e.id}
                        className="search-results__item"
                        onClick={() => goto(`/employees/${e.id}`)}
                      >
                        <Avatar name={e.name} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600 }}>{e.name}</div>
                          <div className="text-small text-muted">
                            {e.employeeId} · {e.department || 'No department'}
                          </div>
                        </div>
                        <span className="search-results__meta">{e.status}</span>
                      </div>
                    ))}
                  </>
                ) : null}

                {results.departments?.length ? (
                  <>
                    <div className="search-results__group">Departments</div>
                    {results.departments.map((d) => (
                      <div key={d.id} className="search-results__item" onClick={() => goto('/departments')}>
                        <span style={{ fontSize: 16 }}>🏗️</span>
                        <div style={{ fontWeight: 600 }}>{d.name}</div>
                      </div>
                    ))}
                  </>
                ) : null}

                {results.dprDates?.length ? (
                  <>
                    <div className="search-results__group">DPR</div>
                    {results.dprDates.map((d) => (
                      <div
                        key={d.date}
                        className="search-results__item"
                        onClick={() => goto(`/dpr/control-center?date=${d.date}`)}
                      >
                        <span style={{ fontSize: 16 }}>🎛️</span>
                        <div style={{ fontWeight: 600 }}>DPR for {d.date}</div>
                        <span className="search-results__meta">{d.entries} entries</span>
                      </div>
                    ))}
                  </>
                ) : null}

                {!results.employees?.length && !results.departments?.length && !results.dprDates?.length ? (
                  <div className="search-results__item text-muted">No matches found</div>
                ) : null}
              </div>
            ) : null}
          </div>

          <button
            className="icon-button"
            onClick={() => {
              setBellOpen((v) => !v);
              setMenuOpen(false);
            }}
            aria-label="Notifications"
          >
            🔔
            {notifications.length ? <span className="icon-button__dot">{notifications.length}</span> : null}
          </button>

          <div
            className="user-chip"
            onClick={() => {
              setMenuOpen((v) => !v);
              setBellOpen(false);
            }}
          >
            <Avatar name={user?.name} orange={user?.role === 'admin'} />
            <div>
              <div className="user-chip__name">{user?.name}</div>
              <div className="user-chip__role">{user?.role}</div>
            </div>
          </div>

          {bellOpen ? (
            <div className="dropdown" style={{ right: 92, minWidth: 330 }}>
              <div className="dropdown__header flex-between">
                <strong>Notifications</strong>
                <span className="badge badge--navy">{notifications.length}</span>
              </div>
              {notifications.length ? (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    className="notification-item"
                    onClick={() => n.link && goto(n.link)}
                    style={n.link ? { cursor: 'pointer' } : undefined}
                  >
                    <span
                      className="notification-item__icon"
                      style={
                        n.type === 'warning'
                          ? { background: 'var(--amber-100)', color: 'var(--amber-600)' }
                          : { background: 'var(--blue-100)', color: 'var(--blue-600)' }
                      }
                    >
                      {n.type === 'warning' ? '⚠️' : 'ℹ️'}
                    </span>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{n.title}</div>
                      <div className="text-small text-muted">{n.message}</div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="notification-item text-muted">Nothing needs attention right now.</div>
              )}
            </div>
          ) : null}

          {menuOpen ? (
            <div className="dropdown">
              <div className="dropdown__header">
                <div style={{ fontWeight: 650 }}>{user?.name}</div>
                <div className="text-small text-muted">
                  {user?.username} · {user?.role}
                </div>
              </div>
              <Link to="/account" className="dropdown__item">
                👤 My account
              </Link>
              {isAdmin ? (
                <Link to="/settings" className="dropdown__item">
                  ⚙️ System settings
                </Link>
              ) : null}
              <button className="dropdown__item dropdown__item--danger" onClick={logout}>
                ⏻ Sign out
              </button>
            </div>
          ) : null}
        </header>

        <main className="page">{children}</main>
      </div>
    </div>
  );
}
