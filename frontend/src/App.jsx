import { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Dashboard from './pages/Dashboard'
import LLMMonitor from './pages/LLMMonitor'
import ModelCharts from './pages/ModelCharts'
import Alerts from './pages/Alerts'
import Settings from './pages/Settings'
import Profile from './pages/Profile'
import Login from './pages/Login'
import AdminUsers from './pages/AdminUsers'
import './index.css'

const NAV = [
  {
    to: '/dashboard', label: 'ML Models',
    icon: (
      <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </svg>
    ),
  },
  {
    to: '/charts', label: 'Model Charts',
    icon: (
      <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
  },
  {
    to: '/llm', label: 'LLM Monitor',
    icon: (
      <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    to: '/alerts', label: 'Alerts', badge: true,
    icon: (
      <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
    ),
  },
  {
    to: '/settings', label: 'Settings',
    icon: (
      <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
]

// Admin-only nav items — shown only when user.role === 'admin'
const ADMIN_NAV = [
  {
    to: '/admin/users', label: 'Users & Access',
    icon: (
      <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
]

function Protected({ children }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 20, height: 20, border: '2px solid var(--border)', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
    </div>
  )
  if (!user) return <Navigate to="/login" replace />
  return children
}

function SidebarLink({ item, onClose }) {
  return (
    <NavLink
      to={item.to} onClick={onClose}
      style={({ isActive }) => ({
        display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px',
        borderRadius: 7, textDecoration: 'none', fontSize: 13,
        fontWeight: isActive ? 500 : 400,
        color: isActive ? '#f1f5f9' : '#64748b',
        background: isActive ? 'rgba(59,130,246,0.1)' : 'transparent',
        border: `1px solid ${isActive ? 'rgba(59,130,246,0.18)' : 'transparent'}`,
        transition: 'all 0.15s', marginBottom: 2,
      })}
    >
      <span style={{ opacity: 0.7, display: 'flex', flexShrink: 0 }}>{item.icon}</span>
      <span style={{ flex: 1 }}>{item.label}</span>
      {item.badge && (
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444', flexShrink: 0, boxShadow: '0 0 6px rgba(239,68,68,0.6)' }} />
      )}
    </NavLink>
  )
}

function Sidebar({ open, onClose }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  return (
    <>
      <div onClick={onClose} className={`sidebar-backdrop ${open ? 'sidebar-backdrop--visible' : ''}`} />
      <aside className={`sidebar ${open ? 'sidebar--open' : ''}`}>

        {/* Logo */}
        <div style={{ padding: '18px 16px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 30, height: 30, borderRadius: 7, background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>ObserveML</div>
            <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 1 }}>AI Observability</div>
          </div>
          <button onClick={onClose} className="mobile-only" style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--t3)', padding: 4, display: 'flex', cursor: 'pointer' }}>
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '10px 8px', overflowY: 'auto' }}>
          <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '0 10px 8px', marginTop: 4 }}>
            Monitoring
          </div>
          {NAV.slice(0, 3).map(item => <SidebarLink key={item.to} item={item} onClose={onClose} />)}

          <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '0 10px 8px', marginTop: 16 }}>
            Management
          </div>
          {NAV.slice(3).map(item => <SidebarLink key={item.to} item={item} onClose={onClose} />)}

          {/* Admin section — only visible to admins */}
          {user?.role === 'admin' && (
            <>
              <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '0 10px 8px', marginTop: 16 }}>
                Admin
              </div>
              {ADMIN_NAV.map(item => <SidebarLink key={item.to} item={item} onClose={onClose} />)}
            </>
          )}
        </nav>

        {/* User section — clicking avatar goes to profile */}
        <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border)' }}>
          <button
            onClick={() => { navigate('/profile'); onClose() }}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid transparent', borderRadius: 8, padding: '8px 10px', cursor: 'pointer', transition: 'all 0.15s', marginBottom: 8, textAlign: 'left' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.borderColor = 'var(--border)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; e.currentTarget.style.borderColor = 'transparent' }}
          >
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(59,130,246,0.18)', border: '1px solid rgba(59,130,246,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 600, color: '#93c5fd', flexShrink: 0 }}>
              {user?.name?.slice(0, 2).toUpperCase() || 'BA'}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--t1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.name || 'Bank Admin'}
              </div>
              <div style={{ fontSize: 10, color: 'var(--t3)', textTransform: 'capitalize' }}>{user?.role}</div>
            </div>
            <svg width="12" height="12" fill="none" stroke="var(--t3)" strokeWidth="2" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>

          <button
            onClick={logout}
            style={{ width: '100%', padding: '6px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11, color: 'var(--t3)', cursor: 'pointer', fontFamily: 'var(--font)', transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(239,68,68,0.3)'; e.currentTarget.style.color = '#ef4444' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--t3)' }}
          >
            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Sign out
          </button>
        </div>
      </aside>
    </>
  )
}

const PAGE_TITLES = {
  '/dashboard': 'ML Models',
  '/charts': 'Model Charts',
  '/llm': 'LLM Monitor',
  '/alerts': 'Alerts',
  '/settings': 'Settings',
  '/profile': 'My Profile',
}

function Topbar({ onMenuClick }) {
  const location = useLocation()
  const title = PAGE_TITLES[location.pathname] || 'ObserveML'
  return (
    <header style={{ height: 52, display: 'flex', alignItems: 'center', gap: 12, padding: '0 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', position: 'sticky', top: 0, zIndex: 100, flexShrink: 0 }}>
      <button onClick={onMenuClick} className="mobile-only" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, background: 'none', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--t2)', flexShrink: 0, cursor: 'pointer' }}>
        <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>
      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--t1)' }}>{title}</span>
      <div style={{ flex: 1 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.18)', borderRadius: 99, fontSize: 11, fontWeight: 500, color: '#10b981' }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#10b981', animation: 'pulse 2s infinite' }} />
        Live
      </div>
    </header>
  )
}

function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="main-content">
        <Topbar onMenuClick={() => setSidebarOpen(true)} />
        <main style={{ flex: 1, padding: '24px 20px', width: '100%' }}>
          <Routes>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/charts" element={<ModelCharts />} />
            <Route path="/llm" element={<LLMMonitor />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/admin/users" element={<AdminUsers />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/*" element={<Protected><Layout /></Protected>} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}