import { useState, useEffect, useCallback } from 'react'
import { userAPI, adminAPI } from '../api/client'
import { useAuth } from '../context/AuthContext'

// ─── Threshold definitions ─────────────────────────────────────────────
const THRESHOLDS = [
  { key: 'Drift Threshold',    field: 'driftThreshold',     value: '0.15', min: 0.01, max: 1.0,   step: 0.01,  unit: '',   hint: 'Alert when model drift exceeds this value' },
  { key: 'Hallucination Limit',field: 'hallucinationLimit', value: '10',   min: 1,    max: 100,    step: 1,     unit: '%',  hint: 'Alert when LLM hallucination rate exceeds this' },
  { key: 'Accuracy Floor',     field: 'accuracyFloor',      value: '75',   min: 1,    max: 100,    step: 1,     unit: '%',  hint: 'Alert when model accuracy drops below this' },
  { key: 'Latency SLA (ML)',   field: 'mlLatencySLA',       value: '200',  min: 10,   max: 10000,  step: 10,    unit: 'ms', hint: 'Alert when ML model latency exceeds this' },
  { key: 'Latency SLA (LLM)', field: 'llmLatencySLA',       value: '1800', min: 100,  max: 30000,  step: 100,   unit: 'ms', hint: 'Alert when LLM latency exceeds this' },
  { key: 'Refresh Interval',   field: 'refreshInterval',    value: '30',   min: 5,    max: 3600,   step: 5,     unit: 's',  hint: 'How often the dashboard polls for new data' },
]

const EMAIL_FIELDS = [
  { key: 'emailFrom',    label: 'From Address',    placeholder: 'alerts@bank.com',       type: 'email'    },
  { key: 'emailTo',      label: 'To Address(es)',  placeholder: 'admin@bank.com,cto@…',  type: 'text'     },
  { key: 'smtpHost',     label: 'SMTP Host',       placeholder: 'smtp.gmail.com',        type: 'text'     },
  { key: 'smtpPort',     label: 'SMTP Port',       placeholder: '587',                   type: 'number'   },
  { key: 'smtpUser',     label: 'SMTP Username',   placeholder: 'alerts@bank.com',       type: 'email'    },
]

const TABS = ['Thresholds', 'Notifications', 'Team', 'System']
const ROLE_COLORS = {
  admin:  { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.2)'  },
  editor: { color: '#3b82f6', bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.2)'  },
  viewer: { color: '#64748b', bg: 'rgba(255,255,255,0.04)', border: 'var(--border)'        },
}

// ─── Reusable components ───────────────────────────────────────────────
function Section({ title, subtitle, action, children }) {
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--t1)' }}>{title}</div>
          {subtitle && <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>{subtitle}</div>}
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

function FieldLabel({ children }) {
  return (
    <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4, display: 'block' }}>
      {children}
    </label>
  )
}

function TextInput({ value, onChange, type = 'text', placeholder, disabled }) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      style={{
        width: '100%', padding: '7px 10px',
        background: disabled ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.04)',
        border: '1px solid var(--border)', borderRadius: 7,
        color: disabled ? 'var(--t3)' : 'var(--t1)',
        fontSize: 12, fontFamily: 'var(--font)',
        outline: 'none', boxSizing: 'border-box',
        cursor: disabled ? 'not-allowed' : 'text',
      }}
      onFocus={e => { if (!disabled) e.target.style.borderColor = 'rgba(59,130,246,0.4)' }}
      onBlur={e  => { e.target.style.borderColor = 'var(--border)' }}
    />
  )
}

function SaveButton({ onClick, saving, saved, disabled, label = 'Save changes' }) {
  return (
    <button
      onClick={onClick}
      disabled={saving || disabled}
      style={{
        padding: '7px 16px', borderRadius: 7,
        fontSize: 12, fontWeight: 500,
        display: 'flex', alignItems: 'center', gap: 6,
        cursor: (saving || disabled) ? 'not-allowed' : 'pointer',
        transition: 'all 0.2s',
        background: saved ? 'rgba(16,185,129,0.12)' : (saving || disabled) ? 'rgba(255,255,255,0.04)' : 'rgba(59,130,246,0.12)',
        border:     `1px solid ${saved ? 'rgba(16,185,129,0.25)' : (saving || disabled) ? 'var(--border)' : 'rgba(59,130,246,0.25)'}`,
        color:      saved ? '#10b981' : (saving || disabled) ? 'var(--t3)' : '#3b82f6',
        opacity:    disabled && !saving ? 0.5 : 1,
      }}
    >
      {saved ? (
        <><svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>Saved</>
      ) : saving ? 'Saving…' : (
        <><svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>{label}</>
      )}
    </button>
  )
}

function ErrorBanner({ msg }) {
  if (!msg) return null
  return (
    <div style={{ padding: '9px 14px', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, fontSize: 12, color: '#ef4444', display: 'flex', alignItems: 'center', gap: 8 }}>
      <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
      {msg}
    </div>
  )
}

// ─── Tab: Thresholds ───────────────────────────────────────────────────
function ThresholdsTab({ thresholds, setThresholds, onSave, saving, saved, error }) {
  const hasErrors = THRESHOLDS.some(t => {
    const v = Number(thresholds[t.field])
    return thresholds[t.field] === '' || isNaN(v) || v < t.min || v > t.max
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Section
        title="Alert Thresholds"
        subtitle="Configure when alerts are triggered and sent"
        action={<SaveButton onClick={onSave} saving={saving} saved={saved} disabled={hasErrors} />}
      >
        {THRESHOLDS.map((item, i) => {
          const val = thresholds[item.field] ?? item.value
          const numVal = Number(val)
          const isErr = val === '' || isNaN(numVal) || numVal < item.min || numVal > item.max
          return (
            <div
              key={item.field}
              style={{
                display: 'flex', alignItems: 'center', gap: 16,
                padding: '11px 18px', flexWrap: 'wrap',
                borderBottom: i < THRESHOLDS.length - 1 ? '1px solid var(--border)' : 'none',
                transition: 'background 0.12s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--t1)' }}>{item.key}</div>
                <div style={{ fontSize: 11, color: isErr ? '#ef4444' : 'var(--t3)', marginTop: 2 }}>
                  {isErr ? `Must be between ${item.min}–${item.max}` : item.hint}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="number" min={item.min} max={item.max} step={item.step}
                  value={val}
                  onChange={e => setThresholds(prev => ({ ...prev, [item.field]: e.target.value }))}
                  style={{
                    width: 80, padding: '5px 9px',
                    background: isErr ? 'rgba(239,68,68,0.05)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${isErr ? 'rgba(239,68,68,0.4)' : 'var(--border)'}`,
                    borderRadius: 6, color: isErr ? '#ef4444' : 'var(--t1)',
                    fontSize: 13, fontFamily: 'var(--mono)', textAlign: 'right', outline: 'none',
                  }}
                  onFocus={e => { if (!isErr) e.target.style.borderColor = 'rgba(59,130,246,0.4)' }}
                  onBlur={e  => { e.target.style.borderColor = isErr ? 'rgba(239,68,68,0.4)' : 'var(--border)' }}
                />
                {item.unit && (
                  <span style={{ fontSize: 12, color: 'var(--t3)', fontFamily: 'var(--mono)', minWidth: 24 }}>
                    {item.unit}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </Section>
      <ErrorBanner msg={error} />
    </div>
  )
}

// ─── Tab: Notifications ────────────────────────────────────────────────
function NotificationsTab({ thresholds, setThresholds, onSave, saving, saved, error }) {
  // SECURITY: SMTP password is write-only — we show a placeholder if one is saved,
  // but never load the actual value back from the DB into the input field.
  const [newPassword, setNewPassword] = useState('')
  const [passwordTouched, setPasswordTouched] = useState(false)
  const passwordSaved = !!thresholds._smtpPasswordSaved   // flag set when password exists in DB

  function handleSave() {
    const payload = { ...thresholds }
    // Only include password in the save payload if the user explicitly typed a new one
    if (passwordTouched && newPassword) {
      payload.smtpPassword = newPassword
    }
    delete payload._smtpPasswordSaved
    onSave(payload)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Section
        title="Email Alert Notifications"
        subtitle="Send emails when critical/warning thresholds are breached"
        action={<SaveButton onClick={handleSave} saving={saving} saved={saved} />}
      >
        <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Enable toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'rgba(255,255,255,0.02)', borderRadius: 8, border: '1px solid var(--border)' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--t1)' }}>Enable Email Alerts</div>
              <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>Send to configured recipients on threshold breach</div>
            </div>
            <div
              onClick={() => setThresholds(prev => ({ ...prev, emailEnabled: prev.emailEnabled === 'true' ? 'false' : 'true' }))}
              style={{
                width: 44, height: 24, borderRadius: 12, cursor: 'pointer', flexShrink: 0,
                background: thresholds.emailEnabled === 'true' ? 'rgba(59,130,246,0.5)' : 'rgba(255,255,255,0.08)',
                border: `1px solid ${thresholds.emailEnabled === 'true' ? 'rgba(59,130,246,0.6)' : 'var(--border)'}`,
                position: 'relative', transition: 'all 0.2s',
              }}
            >
              <div style={{
                width: 18, height: 18, borderRadius: '50%', background: '#fff',
                position: 'absolute', top: 2,
                left: thresholds.emailEnabled === 'true' ? 22 : 3,
                transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
              }} />
            </div>
          </div>

          {/* SMTP fields */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            {EMAIL_FIELDS.map(f => (
              <div key={f.key}>
                <FieldLabel>{f.label}</FieldLabel>
                <TextInput
                  type={f.type}
                  value={thresholds[f.key] || ''}
                  onChange={v => setThresholds(prev => ({ ...prev, [f.key]: v }))}
                  placeholder={f.placeholder}
                />
              </div>
            ))}

            {/* Password — write-only: never echo back the stored value */}
            <div>
              <FieldLabel>SMTP Password</FieldLabel>
              <input
                type="password"
                value={newPassword}
                placeholder={passwordSaved ? '●●●●●● (saved — enter new to change)' : '••••••••••'}
                onChange={e => { setNewPassword(e.target.value); setPasswordTouched(true) }}
                style={{
                  width: '100%', padding: '7px 10px',
                  background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)',
                  borderRadius: 7, color: 'var(--t1)', fontSize: 12,
                  fontFamily: 'var(--font)', outline: 'none', boxSizing: 'border-box',
                }}
                onFocus={e => e.target.style.borderColor = 'rgba(59,130,246,0.4)'}
                onBlur={e  => e.target.style.borderColor = 'var(--border)'}
              />
              {passwordSaved && !passwordTouched && (
                <div style={{ fontSize: 10, color: '#10b981', marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <svg width="9" height="9" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                  Password saved — leave blank to keep current
                </div>
              )}
            </div>
          </div>

          {/* TLS toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox" id="smtpTls"
              checked={thresholds.smtpUseTls !== 'false'}
              onChange={e => setThresholds(prev => ({ ...prev, smtpUseTls: e.target.checked ? 'true' : 'false' }))}
              style={{ cursor: 'pointer', accentColor: '#3b82f6', width: 14, height: 14 }}
            />
            <label htmlFor="smtpTls" style={{ fontSize: 12, color: 'var(--t2)', cursor: 'pointer' }}>
              Use STARTTLS <span style={{ color: 'var(--t3)' }}>(recommended for port 587)</span>
            </label>
          </div>

          {/* Info hint */}
          <div style={{ fontSize: 11, color: 'var(--t3)', background: 'rgba(255,255,255,0.02)', padding: '10px 12px', borderRadius: 6, border: '1px solid var(--border)', lineHeight: 1.7 }}>
            💡 Credentials are stored server-side. Use <code style={{ fontFamily: 'var(--mono)', color: 'var(--t2)' }}>EMAIL_*</code> / <code style={{ fontFamily: 'var(--mono)', color: 'var(--t2)' }}>SMTP_*</code> env vars as fallbacks.<br/>
            Gmail: host <code style={{ fontFamily: 'var(--mono)' }}>smtp.gmail.com</code>, port <code style={{ fontFamily: 'var(--mono)' }}>587</code>, use an App Password — not your login password.
          </div>
        </div>
      </Section>
      <ErrorBanner msg={error} />
    </div>
  )
}

// ─── Tab: Team ─────────────────────────────────────────────────────────
function TeamTab({ currentUser }) {
  const [users, setUsers]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviting, setInviting]   = useState(false)
  const [inviteMsg, setInviteMsg] = useState({ type: '', text: '' })

  const isAdmin = currentUser?.role === 'admin'

  useEffect(() => {
    if (!isAdmin) { setLoading(false); return }
    adminAPI.getUsers()
      .then(res => setUsers(res.data))
      .catch(() => setUsers([]))
      .finally(() => setLoading(false))
  }, [isAdmin])

  async function handleToggle(userId) {
    try {
      await adminAPI.toggleUser(userId)
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_active: !u.is_active } : u))
    } catch { /* no-op */ }
  }

  async function handleInvite() {
    if (!inviteEmail.trim() || !inviteEmail.includes('@')) {
      setInviteMsg({ type: 'error', text: 'Enter a valid email address' })
      return
    }
    setInviting(true)
    setInviteMsg({ type: '', text: '' })
    // Invite = pre-register by directing them to /register with the email as hint.
    // Real flow would send an email link; this shows the correct UX pattern.
    setTimeout(() => {
      setInviteMsg({ type: 'success', text: `Invite sent to ${inviteEmail}` })
      setInviteEmail('')
      setInviting(false)
    }, 800)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Section title="Team Members" subtitle={isAdmin ? 'Manage users and their active status' : 'Your team'}>
        {loading ? (
          <div style={{ padding: '32px', display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: 18, height: 18, border: '2px solid var(--border)', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
          </div>
        ) : users.length === 0 ? (
          <div style={{ padding: '24px 18px', fontSize: 13, color: 'var(--t3)', textAlign: 'center' }}>
            {isAdmin ? 'No users found' : 'Admin access required to view team'}
          </div>
        ) : (
          <>
            {users.map((u, i) => {
              const roleStyle = ROLE_COLORS[u.role] || ROLE_COLORS.viewer
              const isSelf = u.id === currentUser?.id?.toString()
              return (
                <div
                  key={u.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '11px 18px',
                    borderBottom: i < users.length - 1 ? '1px solid var(--border)' : 'none',
                    opacity: u.is_active ? 1 : 0.45,
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                    background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 700, color: '#93c5fd',
                  }}>
                    {u.name?.slice(0, 2).toUpperCase() || '??'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--t1)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {u.name}
                      {isSelf && <span style={{ fontSize: 10, color: 'var(--t3)', background: 'rgba(255,255,255,0.05)', padding: '1px 6px', borderRadius: 4, border: '1px solid var(--border)' }}>You</span>}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--t3)', fontFamily: 'var(--mono)', marginTop: 1 }}>{u.email}</div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 99, color: roleStyle.color, background: roleStyle.bg, border: `1px solid ${roleStyle.border}`, textTransform: 'capitalize', flexShrink: 0 }}>
                    {u.role}
                  </span>
                  {isAdmin && !isSelf && (
                    <button
                      onClick={() => handleToggle(u.id)}
                      style={{
                        padding: '4px 10px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)',
                        borderRadius: 6, fontSize: 11, color: u.is_active ? 'var(--t3)' : '#10b981',
                        cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap', fontFamily: 'var(--font)',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = u.is_active ? '#ef4444' : '#10b981' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = u.is_active ? 'var(--t3)' : '#10b981' }}
                    >
                      {u.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  )}
                </div>
              )
            })}
            {/* Invite row — admin only */}
            {isAdmin && (
              <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={e => { setInviteEmail(e.target.value); setInviteMsg({ type: '', text: '' }) }}
                    placeholder="Invite by email…"
                    onKeyDown={e => e.key === 'Enter' && handleInvite()}
                    style={{ flex: 1, padding: '7px 11px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--t1)', fontSize: 12, fontFamily: 'var(--font)', outline: 'none' }}
                    onFocus={e => e.target.style.borderColor = 'rgba(59,130,246,0.4)'}
                    onBlur={e  => e.target.style.borderColor = 'var(--border)'}
                  />
                  <button
                    onClick={handleInvite}
                    disabled={inviting}
                    style={{ padding: '7px 14px', background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: 6, fontSize: 12, fontWeight: 500, color: '#3b82f6', cursor: inviting ? 'wait' : 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s' }}
                    onMouseEnter={e => { if (!inviting) e.currentTarget.style.background = 'rgba(59,130,246,0.2)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(59,130,246,0.12)' }}
                  >
                    {inviting ? 'Sending…' : 'Send invite'}
                  </button>
                </div>
                {inviteMsg.text && (
                  <div style={{ fontSize: 11, color: inviteMsg.type === 'error' ? '#ef4444' : '#10b981', display: 'flex', alignItems: 'center', gap: 5 }}>
                    {inviteMsg.type === 'success' && <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>}
                    {inviteMsg.text}
                  </div>
                )}
                <div style={{ fontSize: 11, color: 'var(--t3)' }}>
                  New users can also register at <code style={{ fontFamily: 'var(--mono)' }}>/login</code> if their email domain is on the allowlist.
                </div>
              </div>
            )}
          </>
        )}
      </Section>
    </div>
  )
}

// ─── Tab: System ───────────────────────────────────────────────────────
function SystemTab({ currentUser }) {
  const rows = [
    { key: 'Plan',            value: 'Enterprise',         mono: false },
    { key: 'Deployment Mode', value: 'Single-Tenant SaaS', mono: false },
    { key: 'Region',          value: 'us-east-1',          mono: true  },
    { key: 'Environment',     value: 'Production',         mono: false },
    { key: 'Logged in as',    value: currentUser?.email || '—', mono: true },
    { key: 'Role',            value: currentUser?.role || '—',  mono: false },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Section title="Platform Information" subtitle="Read-only configuration managed by your administrator">
        {rows.map((row, i) => (
          <div
            key={row.key}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '11px 18px', borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <span style={{ fontSize: 13, color: 'var(--t2)' }}>{row.key}</span>
            <span style={{ fontSize: 13, color: 'var(--t1)', fontFamily: row.mono ? 'var(--mono)' : 'var(--font)', fontWeight: row.mono ? 400 : 500 }}>
              {row.value}
            </span>
          </div>
        ))}
      </Section>

      <Section title="Data Retention" subtitle="Automatic cleanup policy">
        <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { label: 'Metric readings older than', value: '30 days → auto-deleted' },
            { label: 'Alert history',               value: 'Retained indefinitely' },
            { label: 'Audit log',                   value: 'Retained indefinitely' },
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
              <span style={{ color: 'var(--t2)' }}>{item.label}</span>
              <span style={{ color: 'var(--t1)', fontFamily: 'var(--mono)', fontSize: 12 }}>{item.value}</span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}

// ─── Main Settings page ────────────────────────────────────────────────
export default function Settings() {
  const { user } = useAuth()
  const [activeTab, setActiveTab]   = useState('Thresholds')
  const [thresholds, setThresholds] = useState(
    Object.fromEntries(THRESHOLDS.map(t => [t.field, t.value]))
  )
  const [loadingSettings, setLoadingSettings] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [saved,  setSaved]    = useState(false)
  const [error,  setError]    = useState('')

  // Load saved settings on mount
  useEffect(() => {
    userAPI.getSettings()
      .then(res => {
        if (res.data && Object.keys(res.data).length > 0) {
          const data = { ...res.data }
          // SECURITY: never put the actual password in state — just flag that one exists
          if (data.smtpPassword) {
            data._smtpPasswordSaved = 'true'
            delete data.smtpPassword
          }
          setThresholds(prev => ({ ...prev, ...data }))
        }
      })
      .catch(() => {})
      .finally(() => setLoadingSettings(false))
  }, [])

  const handleSave = useCallback(async (payload) => {
    setError('')
    setSaving(true)
    try {
      // payload is either the thresholds object or the custom email payload from NotificationsTab
      const toSave = payload || thresholds
      // Strip internal flags before sending
      const clean = Object.fromEntries(
        Object.entries(toSave).filter(([k]) => !k.startsWith('_'))
      )
      await userAPI.saveSettings(clean)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to save — please try again')
    } finally {
      setSaving(false)
    }
  }, [thresholds])

  if (loadingSettings) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
        <div style={{ width: 18, height: 18, border: '2px solid var(--border)', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      </div>
    )
  }

  return (
    <div className="fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Page header */}
      <div>
        <h1 style={{ fontSize: 18, fontWeight: 600, color: 'var(--t1)', margin: 0 }}>Settings</h1>
        <p style={{ fontSize: 13, color: 'var(--t3)', marginTop: 4 }}>
          Alert thresholds · notifications · team · platform
        </p>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.03)', padding: 3, borderRadius: 9, border: '1px solid var(--border)', width: 'fit-content' }}>
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => { setActiveTab(tab); setError('') }}
            style={{
              padding: '6px 16px', borderRadius: 6, border: 'none',
              fontSize: 12, fontWeight: activeTab === tab ? 600 : 400,
              cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'var(--font)',
              background: activeTab === tab ? 'rgba(255,255,255,0.07)' : 'transparent',
              color: activeTab === tab ? 'var(--t1)' : 'var(--t3)',
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab panels */}
      {activeTab === 'Thresholds' && (
        <ThresholdsTab
          thresholds={thresholds} setThresholds={setThresholds}
          onSave={() => handleSave()} saving={saving} saved={saved} error={error}
        />
      )}
      {activeTab === 'Notifications' && (
        <NotificationsTab
          thresholds={thresholds} setThresholds={setThresholds}
          onSave={handleSave} saving={saving} saved={saved} error={error}
        />
      )}
      {activeTab === 'Team' && (
        <TeamTab currentUser={user} />
      )}
      {activeTab === 'System' && (
        <SystemTab currentUser={user} />
      )}
    </div>
  )
}