import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// ── Parse FastAPI errors ───────────────────────────────────────────────
// FastAPI returns two different error shapes:
// 1. Our manual HTTPException:  { detail: "some string" }
// 2. Pydantic validation error: { detail: [ { msg: "...", loc: [...] } ] }
// This function handles both.
function parseError(err) {
  const data = err.response?.data
  if (!data) return 'Network error — is the backend running?'

  const detail = data.detail
  if (!detail) return 'Something went wrong'

  // Pydantic 422 — array of validation errors
  if (Array.isArray(detail)) {
    return detail
      .map(d => {
        // loc looks like ["body", "password"] — take the last part as field name
        const field = d.loc?.slice(-1)[0] || ''
        const msg = d.msg?.replace('Value error, ', '') || ''
        return field ? `${field}: ${msg}` : msg
      })
      .join(' · ')
  }

  // Our manual HTTPException — plain string
  return String(detail)
}

export default function Login() {
  const { login, register } = useAuth()
  const navigate = useNavigate()

  const [tab, setTab] = useState('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [pending, setPending] = useState(false)  // registration submitted, awaiting admin

  const strength = getPasswordStrength(password)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (tab === 'login') {
        await login(email, password)
        navigate('/dashboard')
      } else {
        const result = await register(name, email, password)
        if (result?.status === 'pending') {
          setPending(true)  // show the pending approval screen
        } else {
          navigate('/dashboard')
        }
      }
    } catch (err) {
      setError(parseError(err))
    } finally {
      setLoading(false)
    }
  }

  function switchTab(t) {
    setTab(t)
    setError('')
    setPassword('')
    setPending(false)
  }

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px 16px', fontFamily: 'var(--font)',
    }}>
      <div style={{ width: '100%', maxWidth: 380 }}>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32, justifyContent: 'center' }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--t1)' }}>ObserveML</div>
            <div style={{ fontSize: 10, color: 'var(--t3)' }}>AI Observability</div>
          </div>
        </div>

        {/* Card */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>

          {/* Tab switcher */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
            {[['login', 'Sign In'], ['register', 'Create Account']].map(([t, label]) => (
              <button
                key={t}
                onClick={() => switchTab(t)}
                style={{
                  flex: 1, padding: '13px', background: tab === t ? 'rgba(59,130,246,0.07)' : 'transparent',
                  border: 'none', borderBottom: `2px solid ${tab === t ? '#3b82f6' : 'transparent'}`,
                  color: tab === t ? '#f1f5f9' : '#64748b', fontSize: 13,
                  fontWeight: tab === t ? 500 : 400, cursor: 'pointer',
                  transition: 'all 0.15s', fontFamily: 'var(--font)',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Form */}
          {pending ? (
            <div style={{ padding: '32px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 16 }}>⏳</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--t1)', marginBottom: 8 }}>Registration Submitted!</div>
              <div style={{ fontSize: 13, color: 'var(--t3)', lineHeight: 1.6, marginBottom: 20 }}>
                Your account is <strong style={{ color: '#f59e0b' }}>pending admin approval</strong>.<br />
                You will receive an email once approved.
              </div>
              <button
                onClick={() => switchTab('login')}
                style={{ padding: '9px 20px', background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 7, color: '#3b82f6', fontSize: 13, cursor: 'pointer' }}
              >
                Back to Sign In
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ padding: '24px' }} autoComplete="off">

              {tab === 'register' && (
                <Field label="Full Name" type="text" value={name} onChange={setName}
                  placeholder="Jane Smith" autoFocus autoComplete="off" />
              )}

              <Field label="Email" type="email" value={email} onChange={setEmail}
                placeholder="you@bank.com" autoFocus={tab === 'login'} autoComplete="off" />

              <Field label="Password" type="password" value={password} onChange={setPassword}
                placeholder="••••••••" autoComplete="new-password" />

              {/* Password strength bar — only on register */}
              {tab === 'register' && password.length > 0 && (
                <div style={{ marginTop: -8, marginBottom: 14 }}>
                  <div style={{ display: 'flex', gap: 3, marginBottom: 4 }}>
                    {[0, 1, 2, 3].map(i => (
                      <div key={i} style={{
                        flex: 1, height: 2, borderRadius: 2,
                        background: i < strength.score ? strength.color : 'rgba(255,255,255,0.06)',
                        transition: 'background 0.2s',
                      }} />
                    ))}
                  </div>
                  <div style={{ fontSize: 10, color: strength.color }}>{strength.label}</div>
                </div>
              )}

              {/* Password requirements hint — register only */}
              {tab === 'register' && (
                <div style={{ marginBottom: 14, padding: '10px 12px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 7 }}>
                  <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 6, fontWeight: 500 }}>Password must contain:</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 8px' }}>
                    {[
                      ['uppercase', /[A-Z]/.test(password), 'Uppercase letter'],
                      ['lowercase', /[a-z]/.test(password), 'Lowercase letter'],
                      ['digit', /[0-9]/.test(password), 'Number'],
                      ['special', /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password), 'Special char (!@#...)'],
                      ['length', password.length >= 8, 'Min 8 characters'],
                    ].map(([key, met, label]) => (
                      <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: met ? '#10b981' : 'var(--t3)' }}>
                        <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                          {met
                            ? <polyline points="20 6 9 17 4 12" />
                            : <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>
                          }
                        </svg>
                        {label}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <div style={{ padding: '9px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 7, fontSize: 12, color: '#ef4444', marginBottom: 16 }}>
                  {error}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%', padding: '10px',
                  background: loading ? 'rgba(59,130,246,0.3)' : 'rgba(59,130,246,0.15)',
                  border: '1px solid rgba(59,130,246,0.3)', borderRadius: 7,
                  color: loading ? '#64748b' : '#3b82f6', fontSize: 13, fontWeight: 500,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s', fontFamily: 'var(--font)',
                }}
                onMouseEnter={e => { if (!loading) e.currentTarget.style.background = 'rgba(59,130,246,0.25)' }}
                onMouseLeave={e => { if (!loading) e.currentTarget.style.background = 'rgba(59,130,246,0.15)' }}
              >
                {loading
                  ? 'Please wait...'
                  : tab === 'login' ? 'Sign In' : 'Create Account'
                }
              </button>
            </form>
          )}
        </div>


      </div>
    </div>
  )
}

// ── Reusable input ────────────────────────────────────────────────────
function Field({ label, type, value, onChange, placeholder, autoFocus }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--t2)', marginBottom: 6 }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        required
        style={{
          width: '100%', padding: '9px 11px',
          background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)',
          borderRadius: 7, color: 'var(--t1)', fontSize: 13,
          fontFamily: 'var(--font)', outline: 'none',
          transition: 'border-color 0.15s', boxSizing: 'border-box',
        }}
        onFocus={e => e.target.style.borderColor = 'rgba(59,130,246,0.5)'}
        onBlur={e => e.target.style.borderColor = 'var(--border)'}
      />
    </div>
  )
}

// ── Password strength calculator ──────────────────────────────────────
function getPasswordStrength(password) {
  if (!password) return { score: 0, color: '#475569', label: '' }
  let score = 0
  if (password.length >= 8) score++
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++
  if (/[0-9]/.test(password)) score++
  if (/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password)) score++

  const map = {
    1: { color: '#ef4444', label: 'Weak' },
    2: { color: '#f59e0b', label: 'Fair' },
    3: { color: '#3b82f6', label: 'Good' },
    4: { color: '#10b981', label: 'Strong' },
  }
  return { score, ...(map[score] || map[1]) }
}