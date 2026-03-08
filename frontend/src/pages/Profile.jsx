import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { userAPI, authAPI } from '../api/client'

// ── Reusable section card ─────────────────────────────────────────────
function Card({ title, subtitle, children }) {
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--t1)' }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>{subtitle}</div>}
      </div>
      <div style={{ padding: '20px 18px' }}>{children}</div>
    </div>
  )
}

// ── Input field ───────────────────────────────────────────────────────
function Field({ label, type = 'text', value, onChange, placeholder, disabled, hint }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--t2)', marginBottom: 6 }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange?.(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        style={{
          width: '100%', padding: '9px 11px', boxSizing: 'border-box',
          background: disabled ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.04)',
          border: '1px solid var(--border)', borderRadius: 7,
          color: disabled ? 'var(--t3)' : 'var(--t1)',
          fontSize: 13, fontFamily: 'var(--font)', outline: 'none',
          transition: 'border-color 0.15s',
          cursor: disabled ? 'not-allowed' : 'text',
        }}
        onFocus={e => { if (!disabled) e.target.style.borderColor = 'rgba(59,130,246,0.5)' }}
        onBlur={e => e.target.style.borderColor = 'var(--border)'}
      />
      {hint && <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>{hint}</div>}
    </div>
  )
}

// ── Save button with loading + success states ─────────────────────────
function SaveButton({ loading, saved, label = 'Save changes', onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      style={{
        padding: '8px 16px',
        background: saved ? 'rgba(16,185,129,0.12)' :
          loading ? 'rgba(255,255,255,0.03)' :
            'rgba(59,130,246,0.12)',
        border: `1px solid ${saved ? 'rgba(16,185,129,0.25)' :
          loading ? 'var(--border)' :
            'rgba(59,130,246,0.25)'
          }`,
        borderRadius: 7, fontSize: 12, fontWeight: 500,
        color: saved ? '#10b981' : loading ? 'var(--t3)' : '#3b82f6',
        cursor: loading ? 'not-allowed' : 'pointer',
        transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 6,
        fontFamily: 'var(--font)',
      }}
      onMouseEnter={e => { if (!loading && !saved) e.currentTarget.style.background = 'rgba(59,130,246,0.22)' }}
      onMouseLeave={e => { if (!loading && !saved) e.currentTarget.style.background = 'rgba(59,130,246,0.12)' }}
    >
      {saved ? (
        <>
          <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Saved
        </>
      ) : loading ? 'Saving...' : label}
    </button>
  )
}

// ── Error / success inline message ────────────────────────────────────
function Msg({ text, type }) {
  if (!text) return null
  const isErr = type === 'error'
  return (
    <div style={{
      padding: '8px 12px', borderRadius: 7, fontSize: 12, marginBottom: 16,
      color: isErr ? '#ef4444' : '#10b981',
      background: isErr ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.08)',
      border: `1px solid ${isErr ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)'}`,
    }}>
      {text}
    </div>
  )
}

// ── Password strength ─────────────────────────────────────────────────
function StrengthBar({ password }) {
  if (!password) return null
  let score = 0
  if (password.length >= 8) score++
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++
  if (/[0-9]/.test(password)) score++
  if (/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password)) score++
  const colors = { 1: '#ef4444', 2: '#f59e0b', 3: '#3b82f6', 4: '#10b981' }
  const labels = { 1: 'Weak', 2: 'Fair', 3: 'Good', 4: 'Strong' }
  const color = colors[score] || '#475569'
  return (
    <div style={{ marginTop: -10, marginBottom: 16 }}>
      <div style={{ display: 'flex', gap: 3, marginBottom: 3 }}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} style={{ flex: 1, height: 2, borderRadius: 2, background: i < score ? color : 'rgba(255,255,255,0.06)', transition: 'background 0.2s' }} />
        ))}
      </div>
      <div style={{ fontSize: 10, color }}>{labels[score] || ''}</div>
    </div>
  )
}

// ── Role badge ────────────────────────────────────────────────────────
function RoleBadge({ role }) {
  const map = {
    admin: { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.2)' },
    editor: { color: '#3b82f6', bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.2)' },
    viewer: { color: '#64748b', bg: 'rgba(255,255,255,0.04)', border: 'var(--border)' },
  }
  const s = map[role] || map.viewer
  return (
    <span style={{ padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 500, color: s.color, background: s.bg, border: `1px solid ${s.border}`, textTransform: 'capitalize' }}>
      {role}
    </span>
  )
}

// ── Profile page ──────────────────────────────────────────────────────
export default function Profile() {
  const { user, login } = useAuth()

  // Profile section state
  const [name, setName] = useState('')
  const [nameLoading, setNameLoading] = useState(false)
  const [nameSaved, setNameSaved] = useState(false)
  const [nameError, setNameError] = useState('')

  // Password section state
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwLoading, setPwLoading] = useState(false)
  const [pwSaved, setPwSaved] = useState(false)
  const [pwError, setPwError] = useState('')
  const [pwSuccess, setPwSuccess] = useState('')

  const [logoutAllLoading, setLogoutAllLoading] = useState(false)

  // Profile data
  const [profile, setProfile] = useState(null)

  useEffect(() => {
    userAPI.getProfile()
      .then(res => {
        setProfile(res.data)
        setName(res.data.name)
      })
      .catch(() => {
        // Fallback to auth context
        if (user) setName(user.name)
      })
  }, [user])

  // ── Save name ────────────────────────────────────────────────────
  async function handleSaveName() {
    setNameError('')
    if (!name.trim() || name.trim() === profile?.name) return
    setNameLoading(true)
    try {
      const res = await userAPI.updateProfile(name.trim())
      setProfile(res.data)
      setNameSaved(true)
      setTimeout(() => setNameSaved(false), 2500)
    } catch (err) {
      const detail = err.response?.data?.detail
      setNameError(Array.isArray(detail) ? detail[0]?.msg : (detail || 'Failed to update name'))
    } finally {
      setNameLoading(false)
    }
  }

  // ── Change password ───────────────────────────────────────────────
  async function handleChangePassword() {
    setPwError('')
    setPwSuccess('')

    if (!currentPw || !newPw || !confirmPw) {
      setPwError('All password fields are required')
      return
    }
    if (newPw !== confirmPw) {
      setPwError('New passwords do not match')
      return
    }

    setPwLoading(true)
    try {
      await userAPI.changePassword(currentPw, newPw)
      setPwSaved(true)
      setPwSuccess('Password changed successfully. Use your new password next time you log in.')
      setCurrentPw('')
      setNewPw('')
      setConfirmPw('')
      setTimeout(() => setPwSaved(false), 3000)
    } catch (err) {
      const detail = err.response?.data?.detail
      setPwError(Array.isArray(detail) ? detail[0]?.msg?.replace('Value error, ', '') : (detail || 'Failed to change password'))
    } finally {
      setPwLoading(false)
    }
  }

  async function handleLogoutAll() {
    if (!window.confirm("This will log you out of all devices immediately. Continue?")) return
    setLogoutAllLoading(true)
    try {
      await authAPI.logoutAll()
      localStorage.removeItem('token')
      window.location.href = '/login'
    } catch (err) {
      alert("Failed to logout everywhere")
    } finally {
      setLogoutAllLoading(false)
    }
  }

  const joinDate = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : '—'

  return (
    <div className="fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 560 }}>

      {/* Page header */}
      <div>
        <h1 style={{ fontSize: 18, fontWeight: 600, color: 'var(--t1)' }}>Profile</h1>
        <p style={{ fontSize: 13, color: 'var(--t3)', marginTop: 3 }}>Manage your account details and password</p>
      </div>

      {/* Avatar + info card */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '20px 18px', display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(59,130,246,0.15)', border: '2px solid rgba(59,130,246,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 600, color: '#93c5fd', flexShrink: 0 }}>
          {name?.slice(0, 2).toUpperCase() || 'BA'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--t1)', marginBottom: 3 }}>{name || '—'}</div>
          <div style={{ fontSize: 12, color: 'var(--t3)', fontFamily: 'var(--mono)', marginBottom: 6 }}>{user?.email}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <RoleBadge role={user?.role || 'viewer'} />
            <span style={{ fontSize: 11, color: 'var(--t3)' }}>Joined {joinDate}</span>
          </div>
        </div>
      </div>

      {/* Edit name */}
      <Card title="Display Name" subtitle="This name appears in the sidebar and across the app">
        <Msg text={nameError} type="error" />
        <Field
          label="Full Name"
          value={name}
          onChange={setName}
          placeholder="Your full name"
        />
        <SaveButton loading={nameLoading} saved={nameSaved} onClick={handleSaveName} />
      </Card>

      {/* Read-only info */}
      <Card title="Account Info" subtitle="These fields are managed by your administrator">
        <Field label="Email address" value={user?.email || ''} disabled />
        <Field label="Role" value={user?.role || ''} disabled hint="Contact your admin to change your role" />
      </Card>

      {/* Change password */}
      <Card title="Change Password" subtitle="Must contain uppercase, lowercase, number and special character">
        <Msg text={pwError} type="error" />
        <Msg text={pwSuccess} type="success" />

        <Field
          label="Current Password"
          type="password"
          value={currentPw}
          onChange={setCurrentPw}
          placeholder="••••••••"
        />
        <Field
          label="New Password"
          type="password"
          value={newPw}
          onChange={setNewPw}
          placeholder="••••••••"
        />
        <StrengthBar password={newPw} />
        <Field
          label="Confirm New Password"
          type="password"
          value={confirmPw}
          onChange={setConfirmPw}
          placeholder="••••••••"
          hint={confirmPw && newPw !== confirmPw ? '⚠ Passwords do not match' : ''}
        />
        <SaveButton
          loading={pwLoading}
          saved={pwSaved}
          label="Change password"
          onClick={handleChangePassword}
        />
      </Card>

      {/* Danger zone */}
      <div style={{ background: 'var(--card)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(239,68,68,0.15)' }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: '#ef4444' }}>Danger Zone</div>
          <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>Irreversible actions</div>
        </div>
        <div style={{ padding: '16px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', borderBottom: '1px solid rgba(239,68,68,0.15)' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--t1)', marginBottom: 2 }}>Logout from all devices</div>
            <div style={{ fontSize: 12, color: 'var(--t3)' }}>Invalidate all active sessions across all devices immediately</div>
          </div>
          <button
            style={{ padding: '7px 14px', background: 'transparent', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 7, fontSize: 12, fontWeight: 500, color: '#ef4444', cursor: logoutAllLoading ? 'wait' : 'pointer', transition: 'all 0.15s', fontFamily: 'var(--font)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.08)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            onClick={handleLogoutAll}
            disabled={logoutAllLoading}
          >
            {logoutAllLoading ? 'Logging out...' : 'Logout everywhere'}
          </button>
        </div>
        <div style={{ padding: '16px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--t1)', marginBottom: 2 }}>Delete account</div>
            <div style={{ fontSize: 12, color: 'var(--t3)' }}>Permanently remove your account and all data</div>
          </div>
          <button
            style={{ padding: '7px 14px', background: 'transparent', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 7, fontSize: 12, fontWeight: 500, color: '#ef4444', cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'var(--font)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.08)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            onClick={() => alert('Contact your administrator to delete your account')}
          >
            Delete account
          </button>
        </div>
      </div>

    </div>
  )
}