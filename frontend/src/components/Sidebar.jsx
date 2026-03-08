import { NavLink } from 'react-router-dom'

const NAV_ITEMS = [
  { path: '/dashboard', label: 'Dashboard', icon: '📊' },
  { path: '/llm', label: 'LLM Monitor', icon: '🧠' },
  { path: '/alerts', label: 'Alerts', icon: '🔔' },
  { path: '/settings', label: 'Settings', icon: '⚙️' },
]

export default function Sidebar({ onClose }) {
  return (
    <aside style={{
      width: '280px',
      height: '100vh',
      background: 'var(--bg-surface)',
      borderRight: '1px solid var(--border-subtle)',
      display: 'flex',
      flexDirection: 'column',
      padding: '40px 0',
      position: 'fixed',
      top: 0,
      left: 0,
      zIndex: 1100
    }}>

      {/* Logo */}
      <div style={{ padding: '0 32px 48px 32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '40px', height: '40px', borderRadius: '10px',
            background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-purple))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '20px',
            boxShadow: '0 10px 20px -5px rgba(47, 129, 247, 0.4)'
          }}>
            📡
          </div>
          <div>
            <p style={{
              color: 'var(--text-primary)',
              fontWeight: 700,
              fontSize: '20px',
              margin: 0,
              fontFamily: 'var(--font-heading)',
              letterSpacing: '-0.04em',
              lineHeight: 1
            }}>ObserveML</p>
            <p style={{
              color: 'var(--text-secondary)',
              fontSize: '11px',
              margin: '4px 0 0 0',
              fontWeight: 500,
              letterSpacing: '0.02em',
              opacity: 0.5
            }}>v1.0.0 · Enterprise</p>
          </div>
        </div>
      </div>

      {/* Nav links */}
      <nav style={{ padding: '0 16px', flex: 1 }}>
        <p style={{
          color: 'var(--text-secondary)',
          fontSize: '10px',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          padding: '0 16px',
          marginBottom: '16px',
          opacity: 0.4
        }}>
          Principal
        </p>

        {NAV_ITEMS.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            onClick={onClose}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              padding: '12px 18px',
              borderRadius: '12px',
              textDecoration: 'none',
              fontSize: '14px',
              fontWeight: 500,
              fontFamily: 'var(--font-heading)',
              color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
              background: isActive ? 'rgba(255, 255, 255, 0.04)' : 'transparent',
              marginBottom: '4px',
              transition: 'all 0.2s ease',
              border: isActive ? '1px solid var(--border-subtle)' : '1px solid transparent',
              position: 'relative'
            })}
            className={({ isActive }) => isActive ? 'nav-active' : 'nav-hover'}
          >
            {({ isActive }) => (
              <>
                <span style={{
                  fontSize: '18px',
                  opacity: isActive ? 1 : 0.6,
                  marginRight: '2px'
                }}>{item.icon}</span>
                {item.label}
                {isActive && (
                  <div style={{
                    position: 'absolute',
                    right: '12px',
                    width: '4px',
                    height: '4px',
                    borderRadius: '50%',
                    background: 'var(--accent-blue)',
                    boxShadow: '0 0 8px var(--accent-blue)'
                  }} />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User info */}
      <div style={{
        padding: '20px',
        margin: '0 16px',
        background: 'rgba(255, 255, 255, 0.015)',
        borderRadius: '16px',
        border: '1px solid var(--border-subtle)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '36px', height: '36px', borderRadius: '8px',
            background: 'linear-gradient(135deg, var(--accent-purple), var(--accent-blue))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: '14px', fontWeight: 700
          }}>
            GA
          </div>
          <div style={{ overflow: 'hidden' }}>
            <p style={{
              color: 'var(--text-primary)',
              fontSize: '13px',
              fontWeight: 600,
              margin: 0,
              fontFamily: 'var(--font-heading)'
            }}>
              Gopal Admin
            </p>
            <p style={{
              color: 'var(--text-secondary)',
              fontSize: '11px',
              margin: 0,
              opacity: 0.5
            }}>
              master@observe.ml
            </p>
          </div>
        </div>
      </div>

      <style>{`
        .nav-hover:hover {
            color: var(--text-primary) !important;
            background: rgba(255, 255, 255, 0.02) !important;
        }
      `}</style>
    </aside>
  )
}
