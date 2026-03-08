import { useState, useEffect, useCallback, useRef } from 'react'
import {
  AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'
import { metricsAPI, auditAPI } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useAlerts } from '../hooks/useAlerts'
import { useRefreshInterval } from '../hooks/useRefreshInterval'

// ─── Mock data — used when backend is offline ─────────────────────────
const MOCK = {
  total_models: 4, healthy_count: 2, warning_count: 1, critical_count: 1,
  models: [
    { model_id: 'm1', model_name: 'Credit Risk Classifier', model_version: 'v2.3.1', status: 'healthy', current_accuracy: .943, current_drift: .08, current_latency_ms: 42.3, last_updated: '2 min ago' },
    { model_id: 'm2', model_name: 'Fraud Detection', model_version: 'v1.8.0', status: 'warning', current_accuracy: .887, current_drift: .19, current_latency_ms: 67.1, last_updated: '5 min ago' },
    { model_id: 'm3', model_name: 'Loan Default Predictor', model_version: 'v3.0.2', status: 'healthy', current_accuracy: .921, current_drift: .06, current_latency_ms: 38.9, last_updated: '1 min ago' },
    { model_id: 'm4', model_name: 'AML Transaction Scorer', model_version: 'v1.2.0', status: 'critical', current_accuracy: .731, current_drift: .31, current_latency_ms: 112.4, last_updated: '12 min ago' },
  ],
  chart_data: Array.from({ length: 24 }, (_, i) => ({
    timestamp: `${String(i).padStart(2, '0')}:00`,
    accuracy: +(0.92 + Math.sin(i * .4) * .03).toFixed(3),
    drift_score: +(0.09 + Math.sin(i * .3) * .02).toFixed(3),
    latency_ms: +(48 + Math.sin(i * .5) * 12).toFixed(1),
  })),
}

// ─── Constants — hardcoded hex so recharts SVG can read them ──────────
// recharts renders inside SVG — SVG CANNOT resolve CSS variables like
// var(--blue). Always pass literal hex strings to recharts props.
const TABS = [
  { key: 'accuracy', label: 'Accuracy', color: '#3b82f6' },
  { key: 'drift_score', label: 'Drift', color: '#f59e0b' },
  { key: 'latency_ms', label: 'Latency', color: '#06b6d4' },
]

const STATUS_MAP = {
  healthy: { color: '#10b981', bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.2)', label: 'Healthy' },
  warning: { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.2)', label: 'Warning' },
  critical: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.2)', label: 'Critical' },
}

// ─── Shared small components ──────────────────────────────────────────
function Badge({ status }) {
  const s = STATUS_MAP[status] || STATUS_MAP.healthy
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 8px', borderRadius: 99, fontSize: 11, fontWeight: 500,
      color: s.color, background: s.bg, border: `1px solid ${s.border}`,
      whiteSpace: 'nowrap', flexShrink: 0,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: s.color }} />
      {s.label}
    </span>
  )
}

function StatCard({ label, value, accentColor, sub }) {
  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '16px 18px', position: 'relative', overflow: 'hidden',
    }}>
      {/* accent line at top */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: accentColor, opacity: .8 }} />
      <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 600, color: accentColor, letterSpacing: '-0.02em', lineHeight: 1 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 6 }}>{sub}</div>}
    </div>
  )
}

// ─── Custom tooltip for the chart ─────────────────────────────────────
function ChartTooltip({ active, payload, label, unit }) {
  if (!active || !payload?.length) return null
  const timeLabel = (() => {
    try {
      const d = new Date(label)
      if (isNaN(d)) return label
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
    } catch { return label }
  })()
  return (
    <div style={{ background: '#0c1120', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
      <div style={{ color: '#94a3b8', marginBottom: 4 }}>{timeLabel}</div>
      <div style={{ color: '#f1f5f9', fontFamily: 'var(--mono)', fontWeight: 500 }}>
        {payload[0].value}{unit}
      </div>
    </div>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────
export default function Dashboard() {
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [offline, setOffline] = useState(false)
  const [tab, setTab] = useState('accuracy')
  const [dbStats, setDbStats] = useState(null)

  const [lastUpdated, setLastUpdated] = useState(null)   // tracks when data was last fetched
  const [secAgo, setSecAgo] = useState(0)       // "Updated Xs ago" counter

  const isAdmin = user?.role === 'admin' || String(user?.role).includes('admin')

  const load = useCallback(async () => {
    try {
      const res = await metricsAPI.getMLMetrics()
      setData(res.data)
      setOffline(false)
      setLastUpdated(Date.now())
      setSecAgo(0)
    } catch {
      if (!data) setData(MOCK)
      setOffline(true)
    } finally {
      setLoading(false)
    }
    if (isAdmin) {
      try {
        const statsRes = await auditAPI.getStats()
        setDbStats(statsRes.data)
      } catch { }
    }
  }, [isAdmin]) // eslint-disable-line react-hooks/exhaustive-deps

  // WS metric_updated → re-fetch immediately (primary trigger)
  useAlerts({
    onMetricUpdate: useCallback((modelId, modelType) => {
      if (modelType === 'ml') load()
    }, [load])
  })

  const refreshMs = useRefreshInterval()   // reads from user_settings (Settings page)

  // Fallback poll — uses interval from Settings (default 30s)
  useEffect(() => {
    load()
    const interval = setInterval(load, refreshMs)
    return () => clearInterval(interval)
  }, [load, refreshMs])

  // "Updated Xs ago" counter — ticks every second
  useEffect(() => {
    const t = setInterval(() => {
      if (lastUpdated) setSecAgo(Math.floor((Date.now() - lastUpdated) / 1000))
    }, 1000)
    return () => clearInterval(t)
  }, [lastUpdated])

  // Loading skeleton
  if (loading && !data) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
        {[1, 2, 3, 4].map(i => <div key={i} className="skeleton" style={{ height: 90 }} />)}
      </div>
      <div className="skeleton" style={{ height: 280 }} />
      <div className="skeleton" style={{ height: 260 }} />
    </div>
  )

  const { models, chart_data, total_models, healthy_count, warning_count, critical_count } = data
  const activeTab = TABS.find(t => t.key === tab)

  return (
    <div className="fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Offline notice */}
      {offline && (
        <div style={{ padding: '8px 14px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, fontSize: 12, color: '#f59e0b' }}>
          Backend offline — showing demo data. Start FastAPI on port 8000.
        </div>
      )}

      {/* Page header */}
      <div>
        <h1 style={{ fontSize: 18, fontWeight: 600, color: 'var(--t1)' }}>ML Models</h1>
        <p style={{ fontSize: 13, color: 'var(--t3)', marginTop: 3 }}>{total_models} models monitored · refreshes every 30s</p>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 12 }}>
        <StatCard label="Total" value={total_models} accentColor="#3b82f6" sub="models" />
        <StatCard label="Healthy" value={healthy_count} accentColor="#10b981" sub="operating normally" />
        <StatCard label="Warning" value={warning_count} accentColor="#f59e0b" sub="needs attention" />
        <StatCard label="Critical" value={critical_count} accentColor="#ef4444" sub="immediate action" />
      </div>

      {/* Admin-only: real DB platform stats */}
      {isAdmin && dbStats && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 18px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 12 }}>
            Platform Stats · Live DB
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(110px,1fr))', gap: 10 }}>
            {[
              { label: 'Total Users', value: dbStats.total_users, color: '#a78bfa' },
              { label: 'ML Models', value: dbStats.ml_models, color: '#3b82f6' },
              { label: 'LLM Services', value: dbStats.llm_services, color: '#06b6d4' },
              { label: 'Metric Reads', value: dbStats.metric_readings, color: '#10b981' },
              { label: 'Access Grants', value: dbStats.access_grants, color: '#f59e0b' },
              { label: 'Active API Keys', value: dbStats.active_api_keys, color: '#ec4899' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ textAlign: 'center', padding: '10px 8px', background: 'rgba(255,255,255,0.02)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color, marginBottom: 4 }}>{value}</div>
                <div style={{ fontSize: 10, color: 'var(--t3)', fontWeight: 500 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Chart */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: 18 }}>
        {/* Chart header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--t1)' }}>Performance Trends</div>
            <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>Last 24 hours · hourly</div>
          </div>

          {/* Tab switcher */}
          <div style={{ display: 'flex', gap: 3, background: 'rgba(255,255,255,0.04)', padding: 3, borderRadius: 7, border: '1px solid var(--border)' }}>
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{
                  padding: '5px 12px',
                  border: `1px solid ${tab === t.key ? 'rgba(255,255,255,0.1)' : 'transparent'}`,
                  borderRadius: 5,
                  background: tab === t.key ? 'rgba(255,255,255,0.07)' : 'transparent',
                  color: tab === t.key ? '#f1f5f9' : '#64748b',
                  fontSize: 12,
                  fontWeight: tab === t.key ? 500 : 400,
                  transition: 'all 0.15s',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Recharts AreaChart
            KEY FIX: stroke/fill must be hardcoded hex, NOT CSS variables.
            recharts renders inside SVG context where CSS vars don't resolve. */}
        <div style={{ height: 240, width: '100%', minWidth: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chart_data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id={`grad_${tab}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={activeTab.color} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={activeTab.color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.04)"
                vertical={false}
              />
              <XAxis
                dataKey="timestamp"
                stroke="rgba(255,255,255,0)"
                tick={{ fill: '#475569', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
                tickLine={false}
                interval={3}
                tickFormatter={(val) => {
                  try {
                    const d = new Date(val)
                    if (isNaN(d)) return val
                    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
                  } catch { return val }
                }}
              />
              <YAxis
                stroke="rgba(255,255,255,0)"
                tick={{ fill: '#475569', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
                tickLine={false}
              />
              <Tooltip
                content={<ChartTooltip unit="" />}
                cursor={{ stroke: activeTab.color, strokeWidth: 1, strokeDasharray: '4 4' }}
              />
              <Area
                type="monotone"
                dataKey={tab}
                stroke={activeTab.color}       /* hex, not CSS var */
                strokeWidth={2}
                fill={`url(#grad_${tab})`}
                fillOpacity={1}
                dot={false}
                activeDot={{ r: 4, fill: activeTab.color, strokeWidth: 0 }}
                animationDuration={600}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Model table — desktop */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--t1)' }}>Model Registry</span>
          <span style={{ fontSize: 11, color: 'var(--t3)', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', padding: '2px 8px', borderRadius: 99 }}>
            {models.length} models
          </span>
        </div>

        {/* Desktop table */}
        <div className="desktop-only" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Model', 'Status', 'Accuracy', 'Drift', 'Latency', 'Updated'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '9px 18px', fontSize: 11, fontWeight: 500, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {models.map(m => {
                const accColor = m.current_accuracy >= .90 ? '#10b981' : m.current_accuracy >= .80 ? '#f59e0b' : '#ef4444'
                const driftColor = m.current_drift > .15 ? '#ef4444' : '#10b981'
                return (
                  <tr
                    key={m.model_id}
                    style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.1s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '12px 18px' }}>
                      <div style={{ fontWeight: 500, color: 'var(--t1)' }}>{m.model_name}</div>
                      <div style={{ fontSize: 11, color: 'var(--t3)', fontFamily: 'var(--mono)', marginTop: 2 }}>{m.model_version}</div>
                    </td>
                    <td style={{ padding: '12px 18px' }}><Badge status={m.status} /></td>
                    <td style={{ padding: '12px 18px' }}>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 500, color: accColor }}>{(m.current_accuracy * 100).toFixed(1)}%</div>
                      <div style={{ height: 3, width: 56, background: 'rgba(255,255,255,0.06)', borderRadius: 2, marginTop: 5 }}>
                        <div style={{ height: '100%', width: `${m.current_accuracy * 100}%`, background: accColor, borderRadius: 2 }} />
                      </div>
                    </td>
                    <td style={{ padding: '12px 18px' }}>
                      <span style={{ fontFamily: 'var(--mono)', color: driftColor }}>
                        {m.current_drift.toFixed(3)}{m.current_drift > .15 ? ' ⚠' : ''}
                      </span>
                    </td>
                    <td style={{ padding: '12px 18px' }}>
                      <span style={{ fontFamily: 'var(--mono)', color: 'var(--t2)' }}>{m.current_latency_ms}ms</span>
                    </td>
                    <td style={{ padding: '12px 18px', color: 'var(--t3)', fontSize: 12 }}>{m.last_updated}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="mobile-only" style={{ flexDirection: 'column' }}>
          {models.map(m => (
            <div key={m.model_id} style={{ padding: '13px 16px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 11 }}>
                <div>
                  <div style={{ fontWeight: 500, color: 'var(--t1)', fontSize: 13 }}>{m.model_name}</div>
                  <div style={{ fontSize: 10, color: 'var(--t3)', fontFamily: 'var(--mono)', marginTop: 2 }}>{m.model_version}</div>
                </div>
                <Badge status={m.status} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 7 }}>
                {[
                  ['Accuracy', `${(m.current_accuracy * 100).toFixed(1)}%`],
                  ['Drift', m.current_drift.toFixed(3)],
                  ['Latency', `${m.current_latency_ms}ms`],
                ].map(([label, value]) => (
                  <div key={label} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 6, padding: '7px 9px', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 9, color: 'var(--t3)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 500, color: 'var(--t1)', marginTop: 2 }}>{value}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}