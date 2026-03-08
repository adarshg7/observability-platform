import { useState } from 'react'
import { useAlerts } from '../hooks/useAlerts'

// ── Maps backend `severity` field → visual styles ─────────────────────
// Backend sends: "critical" | "warning" | "info"
const SEV_MAP = {
  critical: { color: '#ef4444', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.2)', label: 'Critical' },
  warning: { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.2)', label: 'Warning' },
  info: { color: '#3b82f6', bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.2)', label: 'Info' },
}

const FILTERS = ['All', 'Critical', 'Warning', 'Info', 'Unread']

// ── Convert ISO timestamp to relative time ────────────────────────────
// Backend sends `time` as ISO string for live alerts, or "X min ago" for initial
function formatTime(time) {
  if (!time || time.includes('ago')) return time
  try {
    const diff = Math.floor((Date.now() - new Date(time).getTime()) / 1000)
    if (diff < 60) return `${diff}s ago`
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    return `${Math.floor(diff / 3600)}h ago`
  } catch {
    return time
  }
}

// ── SVG icon per severity type ────────────────────────────────────────
function SevIcon({ severity, color }) {
  if (severity === 'critical') return (
    <svg width="14" height="14" fill="none" stroke={color} strokeWidth="2" viewBox="0 0 24 24">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
  if (severity === 'warning') return (
    <svg width="14" height="14" fill="none" stroke={color} strokeWidth="2" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  )
  return (
    <svg width="14" height="14" fill="none" stroke={color} strokeWidth="2" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  )
}

// ── Single alert row ──────────────────────────────────────────────────
// Backend fields used: id, severity, model, type, msg, time, ack
function AlertRow({ alert, onAck, isNew }) {
  const s = SEV_MAP[alert.severity] || SEV_MAP.info

  return (
    <div
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 14,
        padding: '14px 20px', borderBottom: '1px solid var(--border)',
        borderLeft: `3px solid ${alert.ack ? 'transparent' : s.color}`,
        opacity: alert.ack ? 0.45 : 1,
        transition: 'all 0.2s',
        animation: isNew ? 'slideIn 0.35s ease' : 'none',
        background: isNew ? s.bg : 'transparent',
      }}
      onMouseEnter={e => { if (!alert.ack) e.currentTarget.style.background = 'var(--hover)' }}
      onMouseLeave={e => { e.currentTarget.style.background = isNew ? s.bg : 'transparent' }}
    >
      {/* Severity icon */}
      <div style={{
        width: 32, height: 32, borderRadius: 8, flexShrink: 0, marginTop: 1,
        background: s.bg, border: `1px solid ${s.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}>
        <SevIcon severity={alert.severity} color={s.color} />
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
          {/* Severity badge */}
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '2px 8px', borderRadius: 99, fontSize: 10,
            fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em',
            color: s.color, background: s.bg, border: `1px solid ${s.border}`,
            whiteSpace: 'nowrap', flexShrink: 0
          }}>
            <span style={{ width: 4, height: 4, borderRadius: '50%', background: s.color }} />
            {s.label}
          </span>

          {/* Backend `type` field: "ML Model" | "LLM Service" */}
          <span style={{
            fontSize: 10, color: 'var(--t3)', background: 'rgba(255,255,255,0.04)',
            border: '1px solid var(--border)', padding: '1px 7px', borderRadius: 99
          }}>
            {alert.type}
          </span>

          {alert.ack && (
            <span style={{ fontSize: 10, color: '#10b981', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
              <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Acknowledged
            </span>
          )}

          {/* Backend `time` field — ISO for live, relative string for initial */}
          <span style={{ fontSize: 11, color: 'var(--t3)', fontFamily: 'var(--mono)', marginLeft: 'auto' }}>
            {formatTime(alert.time)}
          </span>
        </div>

        {/* Backend `model` field */}
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)', marginBottom: 2 }}>
          {alert.model}
        </div>

        {/* Backend `msg` field */}
        <div style={{ fontSize: 12, color: 'var(--t2)', lineHeight: 1.5 }}>
          {alert.msg}
        </div>
      </div>

      {/* Acknowledge button */}
      {!alert.ack && (
        <button
          onClick={() => onAck(alert.id)}
          style={{
            flexShrink: 0, padding: '5px 10px',
            background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)',
            borderRadius: 6, fontSize: 11, fontWeight: 500,
            color: 'var(--t2)', cursor: 'pointer', transition: 'all 0.15s',
            whiteSpace: 'nowrap', fontFamily: 'var(--font)'
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'var(--t1)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = 'var(--t2)' }}
        >
          Acknowledge
        </button>
      )}
    </div>
  )
}

// ── Alerts page ───────────────────────────────────────────────────────
export default function Alerts() {
  const { alerts, connected, error, acknowledge, acknowledgeAll } = useAlerts()
  const [filter, setFilter] = useState('All')
  const [newIds, setNewIds] = useState(new Set())

  // Track newest alert for slide-in animation
  const prevLenRef = useState(0)
  if (alerts.length > prevLenRef[0]) {
    prevLenRef[0] = alerts.length
    const newest = alerts[0]
    if (newest && !newIds.has(newest.id)) {
      setNewIds(prev => new Set([...prev, newest.id]))
      setTimeout(() => setNewIds(new Set()), 2000)
    }
  }

  const unread = alerts.filter(a => !a.ack).length
  const criticals = alerts.filter(a => a.severity === 'critical' && !a.ack).length

  const filtered = alerts.filter(a => {
    if (filter === 'All') return true
    if (filter === 'Unread') return !a.ack
    return a.severity === filter.toLowerCase()
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--t1)', margin: 0 }}>Alerts</h1>
          <p style={{ fontSize: 13, color: 'var(--t3)', marginTop: 3 }}>
            {unread} unread · {alerts.length} total · new every ~10s
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* WebSocket connection status */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '5px 11px',
            background: connected ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
            border: `1px solid ${connected ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
            borderRadius: 99, fontSize: 11, fontWeight: 600,
            color: connected ? '#10b981' : '#ef4444'
          }}>
            <span style={{
              width: 5, height: 5, borderRadius: '50%',
              background: connected ? '#10b981' : '#ef4444',
              animation: connected ? 'pulse 2s infinite' : 'none'
            }} />
            {connected ? 'Live' : 'Reconnecting...'}
          </div>

          {unread > 0 && (
            <button
              onClick={acknowledgeAll}
              style={{
                padding: '6px 14px', background: 'rgba(255,255,255,0.04)',
                border: '1px solid var(--border)', borderRadius: 7,
                fontSize: 12, fontWeight: 500, color: 'var(--t2)',
                cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'var(--font)'
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'var(--t1)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = 'var(--t2)' }}
            >
              Acknowledge all
            </button>
          )}
        </div>
      </div>

      {/* WebSocket error banner */}
      {error && !connected && (
        <div style={{ padding: '8px 14px', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, fontSize: 12, color: '#ef4444' }}>
          {error}
        </div>
      )}

      {/* Critical alert warning banner */}
      {criticals > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, fontSize: 13, color: '#ef4444', fontWeight: 500 }}>
          <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          {criticals} critical alert{criticals > 1 ? 's' : ''} require immediate attention
        </div>
      )}

      {/* Stat cards — NEW addition from second version */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12 }}>
        {[
          { label: 'Total', value: alerts.length, color: '#3b82f6' },
          { label: 'Critical', value: alerts.filter(a => a.severity === 'critical').length, color: '#ef4444' },
          { label: 'Warning', value: alerts.filter(a => a.severity === 'warning').length, color: '#f59e0b' },
          { label: 'Unread', value: unread, color: unread > 0 ? '#ef4444' : '#10b981' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: color, opacity: 0.8 }} />
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color, letterSpacing: '-0.02em', lineHeight: 1 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Alert feed */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>

        {/* Feed header + filter bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '13px 20px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--t1)' }}>
            Live Feed
            {connected && (
              <span style={{ marginLeft: 8, fontSize: 10, color: '#10b981', fontFamily: 'var(--mono)' }}>
                ● streaming
              </span>
            )}
          </span>

          {/* Filter buttons */}
          <div style={{ display: 'flex', gap: 3, background: 'rgba(255,255,255,0.03)', padding: 3, borderRadius: 8, border: '1px solid var(--border)', flexWrap: 'wrap' }}>
            {FILTERS.map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: '4px 11px',
                  border: `1px solid ${filter === f ? 'rgba(255,255,255,0.1)' : 'transparent'}`,
                  background: filter === f ? 'rgba(255,255,255,0.07)' : 'transparent',
                  color: filter === f ? '#f1f5f9' : '#64748b',
                  fontSize: 11, fontWeight: filter === f ? 600 : 400,
                  cursor: 'pointer', transition: 'all 0.15s',
                  borderRadius: 5, whiteSpace: 'nowrap', fontFamily: 'var(--font)'
                }}
              >
                {f}
                {f === 'Unread' && unread > 0 && (
                  <span style={{ marginLeft: 4, background: '#ef4444', color: '#fff', fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 99 }}>
                    {unread}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Empty state */}
        {filtered.length === 0 && (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--t3)', fontSize: 13 }}>
            {connected ? 'No alerts match this filter' : 'Connecting to alert stream...'}
          </div>
        )}

        {/* Alert rows */}
        {filtered.map(alert => (
          <AlertRow
            key={alert.id}
            alert={alert}
            onAck={acknowledge}
            isNew={newIds.has(alert.id)}
          />
        ))}
      </div>
    </div>
  )
}
