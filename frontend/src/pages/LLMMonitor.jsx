import { useState, useEffect, useCallback } from 'react'
import {
  AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell
} from 'recharts'
import { metricsAPI } from '../api/client'
import { useRefreshInterval } from '../hooks/useRefreshInterval'

// ─── Mock data ────────────────────────────────────────────────────────
const MOCK = {
  total_services: 4,
  total_requests_today: 27064,
  total_cost_today_usd: 644.85,
  avg_hallucination_rate: 0.072,
  services: [
    { service_id: 'l1', service_name: 'Customer Support Bot', model_version: 'gpt-4-turbo', status: 'healthy', avg_latency_ms: 923, avg_tokens_per_sec: 47.2, hallucination_rate: 0.034, total_requests_today: 14823, cost_today_usd: 312.40, last_updated: '1 min ago' },
    { service_id: 'l2', service_name: 'Loan Advisor Assistant', model_version: 'gpt-4', status: 'warning', avg_latency_ms: 1842, avg_tokens_per_sec: 31.8, hallucination_rate: 0.089, total_requests_today: 6241, cost_today_usd: 198.75, last_updated: '3 min ago' },
    { service_id: 'l3', service_name: 'Regulatory Doc Summarizer', model_version: 'llama-3-70b', status: 'healthy', avg_latency_ms: 1102, avg_tokens_per_sec: 52.1, hallucination_rate: 0.021, total_requests_today: 3891, cost_today_usd: 44.20, last_updated: '2 min ago' },
    { service_id: 'l4', service_name: 'Transaction Explainer', model_version: 'claude-3-sonnet', status: 'critical', avg_latency_ms: 3210, avg_tokens_per_sec: 18.3, hallucination_rate: 0.142, total_requests_today: 2109, cost_today_usd: 89.50, last_updated: '18 min ago' },
  ],
  chart_data: Array.from({ length: 24 }, (_, i) => ({
    timestamp: `${String(i).padStart(2, '0')}:00`,
    latency_ms: +(900 + Math.sin(i * .4) * 200).toFixed(1),
    tokens_per_second: +(45 + Math.cos(i * .3) * 8).toFixed(1),
    quality_score: +(0.91 + Math.sin(i * .2) * .04).toFixed(3),
  })),
}

// ─── Hardcoded hex (NOT css vars — SVG can't read them) ───────────────
const TABS = [
  { key: 'latency_ms', label: 'Latency', color: '#8b5cf6' },
  { key: 'tokens_per_second', label: 'Throughput', color: '#06b6d4' },
  { key: 'quality_score', label: 'Quality', color: '#10b981' },
]

const hColor = r => r < .05 ? '#10b981' : r < .10 ? '#f59e0b' : '#ef4444'

const STATUS_MAP = {
  healthy: { color: '#10b981', bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.2)', label: 'Healthy' },
  warning: { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.2)', label: 'Warning' },
  critical: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.2)', label: 'Critical' },
}

// ─── Small reusable components ────────────────────────────────────────
function Badge({ status }) {
  const s = STATUS_MAP[status] || STATUS_MAP.healthy
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 99, fontSize: 11, fontWeight: 500, color: s.color, background: s.bg, border: `1px solid ${s.border}`, whiteSpace: 'nowrap', flexShrink: 0 }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: s.color }} />
      {s.label}
    </span>
  )
}

function StatCard({ label, value, accentColor, sub }) {
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: accentColor, opacity: .8 }} />
      <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 600, color: accentColor, letterSpacing: '-0.02em', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 6 }}>{sub}</div>}
    </div>
  )
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#0c1120', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
      <div style={{ color: '#94a3b8', marginBottom: 4 }}>{label}</div>
      <div style={{ color: '#f1f5f9', fontFamily: 'var(--mono)', fontWeight: 500 }}>{payload[0].value}</div>
    </div>
  )
}

// ─── LLM Monitor page ─────────────────────────────────────────────────
export default function LLMMonitor() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [offline, setOffline] = useState(false)
  const [tab, setTab] = useState('latency_ms')
  const [lastUpdated, setLastUpdated] = useState(null)
  const [secAgo, setSecAgo] = useState(0)

  const refreshMs = useRefreshInterval()  // reads from Settings

  const load = useCallback(async () => {
    try {
      const res = await metricsAPI.getLLMMetrics()
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
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Poll using interval from Settings page
  useEffect(() => {
    load()
    const interval = setInterval(load, refreshMs)
    return () => clearInterval(interval)
  }, [load, refreshMs])

  // "Updated Xs ago" counter
  useEffect(() => {
    const t = setInterval(() => {
      if (lastUpdated) setSecAgo(Math.floor((Date.now() - lastUpdated) / 1000))
    }, 1000)
    return () => clearInterval(t)
  }, [lastUpdated])

  if (loading && !data) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
        {[1, 2, 3, 4].map(i => <div key={i} className="skeleton" style={{ height: 90 }} />)}
      </div>
      <div className="skeleton" style={{ height: 280 }} />
      <div className="skeleton" style={{ height: 360 }} />
    </div>
  )

  const { services, chart_data, total_services, total_requests_today, total_cost_today_usd, avg_hallucination_rate } = data
  const activeTab = TABS.find(t => t.key === tab)
  const avgColor = hColor(avg_hallucination_rate)

  // Bar chart data — hallucination rate per service
  const barData = services.map(s => ({
    name: s.service_name.split(' ').slice(0, 2).join(' '),
    value: parseFloat((s.hallucination_rate * 100).toFixed(1)),
    color: hColor(s.hallucination_rate),
  }))

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
        <h1 style={{ fontSize: 18, fontWeight: 600, color: 'var(--t1)' }}>LLM Monitor</h1>
        <p style={{ fontSize: 13, color: 'var(--t3)', marginTop: 3 }}>Hallucination detection · Cost tracking · Quality</p>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 12 }}>
        <StatCard label="Services" value={total_services} accentColor="#8b5cf6" sub="active" />
        <StatCard label="Requests Today" value={total_requests_today.toLocaleString()} accentColor="#3b82f6" sub="all services" />
        <StatCard label="Cost Today" value={`$${total_cost_today_usd.toFixed(2)}`} accentColor="#f59e0b" sub="API spend" />
        <StatCard
          label="Avg Hallucination"
          value={`${(avg_hallucination_rate * 100).toFixed(1)}%`}
          accentColor={avgColor}
          sub={avg_hallucination_rate < .05 ? 'Safe' : avg_hallucination_rate < .10 ? 'Review needed' : 'Critical'}
        />
      </div>

      {/* Line chart */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--t1)' }}>Performance Trends</div>
            <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>Last 24 hours · hourly</div>
          </div>
          <div style={{ display: 'flex', gap: 3, background: 'rgba(255,255,255,0.04)', padding: 3, borderRadius: 7, border: '1px solid var(--border)' }}>
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{
                  padding: '5px 12px', border: `1px solid ${tab === t.key ? 'rgba(255,255,255,0.1)' : 'transparent'}`,
                  borderRadius: 5, background: tab === t.key ? 'rgba(255,255,255,0.07)' : 'transparent',
                  color: tab === t.key ? '#f1f5f9' : '#64748b', fontSize: 12,
                  fontWeight: tab === t.key ? 500 : 400, transition: 'all 0.15s',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* KEY FIX: stroke and fill use activeTab.color (hex), not CSS vars */}
        <div style={{ height: 240, width: '100%', minWidth: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chart_data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id={`llm_grad_${tab}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={activeTab.color} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={activeTab.color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis dataKey="timestamp" stroke="rgba(0,0,0,0)" tick={{ fill: '#475569', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }} tickLine={false} interval={3} />
              <YAxis stroke="rgba(0,0,0,0)" tick={{ fill: '#475569', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }} tickLine={false} />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: activeTab.color, strokeWidth: 1, strokeDasharray: '4 4' }} />
              <Area type="monotone" dataKey={tab} stroke={activeTab.color} strokeWidth={2} fill={`url(#llm_grad_${tab})`} fillOpacity={1} dot={false} activeDot={{ r: 4, fill: activeTab.color, strokeWidth: 0 }} animationDuration={600} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Hallucination bar chart */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--t1)' }}>Hallucination Rate by Service</div>
            <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ color: '#10b981' }}>● Safe &lt;5%</span>
              <span style={{ color: '#f59e0b' }}>● Warning 5–10%</span>
              <span style={{ color: '#ef4444' }}>● Critical &gt;10%</span>
            </div>
          </div>
          <div style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--t2)', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', padding: '4px 10px', borderRadius: 99 }}>
            avg {(avg_hallucination_rate * 100).toFixed(1)}%
          </div>
        </div>
        <div style={{ height: 180, width: '100%', minWidth: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis dataKey="name" stroke="rgba(0,0,0,0)" tick={{ fill: '#475569', fontSize: 10 }} tickLine={false} />
              <YAxis stroke="rgba(0,0,0,0)" tick={{ fill: '#475569', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }} tickLine={false} unit="%" />
              <Tooltip
                formatter={v => [`${v}%`, 'Hallucination Rate']}
                contentStyle={{ background: '#0c1120', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
                cursor={{ fill: 'rgba(255,255,255,0.03)' }}
              />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={56}>
                {/* Each bar gets its own color — Cell must receive hex, not CSS var */}
                {barData.map((d, i) => <Cell key={i} fill={d.color} fillOpacity={0.85} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Service cards */}
      <div>
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--t1)', marginBottom: 12 }}>Service Details</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 14 }}>
          {services.map(s => <ServiceCard key={s.service_id} service={s} />)}
        </div>
      </div>
    </div>
  )
}

// ─── Service card ─────────────────────────────────────────────────────
function ServiceCard({ service: s }) {
  const hc = hColor(s.hallucination_rate)
  const barW = Math.min((s.hallucination_rate / 0.20) * 100, 100)

  return (
    <div
      style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, display: 'flex', flexDirection: 'column', gap: 12, position: 'relative', overflow: 'hidden', transition: 'border-color 0.15s' }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
    >
      {/* Status stripe */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: hc, opacity: 0.7 }} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--t3)', fontFamily: 'var(--mono)' }}>{s.model_version}</div>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--t1)', marginTop: 2 }}>{s.service_name}</div>
        </div>
        <Badge status={s.status} />
      </div>

      {/* Hallucination block */}
      <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 7, padding: '11px 13px', border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 28, fontWeight: 600, color: hc, letterSpacing: '-0.02em', lineHeight: 1 }}>
          {(s.hallucination_rate * 100).toFixed(1)}%
        </div>
        <div style={{ fontSize: 10, color: 'var(--t3)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 4 }}>
          Hallucination Rate
        </div>
        {/* Progress bar */}
        <div style={{ height: 2, background: 'rgba(255,255,255,0.06)', borderRadius: 2, marginTop: 10 }}>
          <div style={{ width: `${barW}%`, height: '100%', background: hc, borderRadius: 2 }} />
        </div>
      </div>

      {/* Metrics row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 7 }}>
        {[
          ['Latency', `${s.avg_latency_ms}ms`, '#94a3b8'],
          ['Throughput', `${s.avg_tokens_per_sec} t/s`, '#06b6d4'],
          ['Requests', s.total_requests_today.toLocaleString(), '#94a3b8'],
        ].map(([label, value, color]) => (
          <div key={label} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 6, padding: '7px 9px', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 9, color: 'var(--t3)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 500, color, marginTop: 2 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Cost row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 11px', background: 'rgba(255,255,255,0.03)', borderRadius: 7, border: '1px solid var(--border)' }}>
        <div>
          <div style={{ fontSize: 9, color: 'var(--t3)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Cost Today</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 600, color: '#f59e0b' }}>${s.cost_today_usd.toFixed(2)}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 9, color: 'var(--t3)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Updated</div>
          <div style={{ fontSize: 11, color: 'var(--t2)' }}>{s.last_updated}</div>
        </div>
      </div>
    </div>
  )
}