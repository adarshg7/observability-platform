import { useState, useEffect, useCallback } from 'react'
import {
    AreaChart, Area, XAxis, YAxis,
    CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { metricsAPI, modelsAPI } from '../api/client'

const ML_TABS = [
    { key: 'accuracy', label: 'Accuracy', color: '#3b82f6', unit: '' },
    { key: 'drift_score', label: 'Drift Score', color: '#f59e0b', unit: '' },
    { key: 'latency_ms', label: 'Latency', color: '#06b6d4', unit: 'ms' },
]
const LLM_TABS = [
    { key: 'quality_score', label: 'Quality', color: '#10b981', unit: '' },
    { key: 'latency_ms', label: 'Latency', color: '#06b6d4', unit: 'ms' },
    { key: 'tokens_per_second', label: 'Tokens/sec', color: '#a78bfa', unit: '' },
]
const HOURS_OPTIONS = [
    { v: 6, label: '6h' },
    { v: 12, label: '12h' },
    { v: 24, label: '24h' },
    { v: 72, label: '3d' },
    { v: 168, label: '7d' },
]
const ALL_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#a78bfa', '#06b6d4', '#ec4899']

// ─── Custom tooltip ─────────────────────────────────────────────────────
function ChartTip({ active, payload, label, unit, hours = 24 }) {
    if (!active || !payload?.length) return null
    const timeLabel = (() => {
        try {
            const d = new Date(label)
            if (isNaN(d)) return label
            if (hours > 24) return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
            return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
        } catch { return label }
    })()
    return (
        <div style={{ background: '#0c1120', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
            <div style={{ color: '#94a3b8', marginBottom: 4 }}>{timeLabel}</div>
            {payload.map(p => (
                <div key={p.dataKey} style={{ color: p.color, fontFamily: 'var(--mono)', fontWeight: 500 }}>
                    {p.name}: {typeof p.value === 'number' ? p.value.toFixed(4) : p.value}{unit}
                </div>
            ))}
        </div>
    )
}

// ─── Tab/Hour button helper ──────────────────────────────────────────────
function PillBtn({ label, active, onClick }) {
    return (
        <button onClick={onClick} style={{
            padding: '3px 10px', borderRadius: 4, fontSize: 11, cursor: 'pointer',
            border: `1px solid ${active ? 'rgba(255,255,255,0.12)' : 'transparent'}`,
            background: active ? 'rgba(255,255,255,0.08)' : 'transparent',
            color: active ? '#f1f5f9' : '#64748b',
            transition: 'all 0.12s',
        }}>
            {label}
        </button>
    )
}

// ─── Single model chart card ──────────────────────────────────────────────
function ModelChartCard({ model, modelType }) {
    const tabs = modelType === 'ml' ? ML_TABS : LLM_TABS
    const [tab, setTab] = useState(tabs[0].key)
    const [hours, setHours] = useState(24)
    const [chart, setChart] = useState([])      // persisted across refreshes
    const [firstLoad, setFirstLoad] = useState(true)   // only true until first successful fetch
    const [points, setPoints] = useState(0)
    const [refreshing, setRefreshing] = useState(false)  // subtle pulse dot
    const activeTab = tabs.find(t => t.key === tab)

    const loadChart = useCallback(async () => {
        setRefreshing(true)
        try {
            const fn = modelType === 'ml' ? metricsAPI.getMLModelChart : metricsAPI.getLLMModelChart
            const res = await fn(model.id, hours)
            const newData = res.data.chart_data || []
            // Update data in place — chart stays visible, no flash
            setChart(newData)
            setPoints(res.data.data_points || 0)
        } catch { /* silently keep existing data on network error */ } finally {
            setRefreshing(false)
            setFirstLoad(false)
        }
    }, [model.id, modelType, hours])

    useEffect(() => {
        setFirstLoad(true)          // reset when hours/model changes
        loadChart()
        const t = setInterval(loadChart, 5000)
        return () => clearInterval(t)
    }, [loadChart])

    const statusColor = model.is_active ? '#10b981' : '#64748b'

    return (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            {/* Header */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 18px', borderBottom: '1px solid var(--border)',
                flexWrap: 'wrap', gap: 10,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {/* Status dot with pulse */}
                    <div style={{
                        width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                        background: statusColor, boxShadow: `0 0 6px ${statusColor}`,
                        animation: model.is_active ? 'pulse 2s infinite' : 'none',
                    }} />
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--t1)' }}>{model.name}</span>
                            {/* Tiny live-refresh indicator — non-blocking */}
                            <span style={{
                                width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
                                background: refreshing ? '#3b82f6' : 'transparent',
                                boxShadow: refreshing ? '0 0 5px #3b82f6' : 'none',
                                transition: 'background 0.4s, box-shadow 0.4s',
                            }} title="Live" />
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 1 }}>
                            {modelType === 'ml' ? model.model_type : model.provider} · {points} readings
                        </div>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    {/* Time range */}
                    <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.04)', padding: 2, borderRadius: 6, border: '1px solid var(--border)' }}>
                        {HOURS_OPTIONS.map(o => <PillBtn key={o.v} label={o.label} active={hours === o.v} onClick={() => setHours(o.v)} />)}
                    </div>
                    {/* Metric selector */}
                    <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.04)', padding: 2, borderRadius: 6, border: '1px solid var(--border)' }}>
                        {tabs.map(t => <PillBtn key={t.key} label={t.label} active={tab === t.key} onClick={() => setTab(t.key)} />)}
                    </div>
                </div>
            </div>

            {/* Chart area — never flashes to "Loading" once initialized */}
            <div style={{ padding: '12px 4px 8px 4px', height: 200, position: 'relative' }}>
                {firstLoad ? (
                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--t3)', fontSize: 13, gap: 8 }}>
                        <span style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid var(--border)', borderTopColor: '#3b82f6', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
                        Loading chart...
                    </div>
                ) : chart.length === 0 ? (
                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--t3)', fontSize: 13 }}>
                        No readings yet — run the simulator to populate this chart
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chart} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
                            <defs>
                                <linearGradient id={`g_${model.id}_${tab}`} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={activeTab.color} stopOpacity={0.25} />
                                    <stop offset="95%" stopColor={activeTab.color} stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                            <XAxis
                                dataKey="timestamp"
                                stroke="rgba(0,0,0,0)"
                                tick={{ fill: '#475569', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
                                tickLine={false} interval="preserveStartEnd"
                                tickFormatter={(val) => {
                                    try {
                                        const d = new Date(val); if (isNaN(d)) return val;
                                        if (hours > 24) return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
                                        return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
                                    } catch { return val }
                                }}
                            />
                            <YAxis
                                stroke="rgba(0,0,0,0)"
                                tick={{ fill: '#475569', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
                                tickLine={false}
                            />
                            <Tooltip content={<ChartTip unit={activeTab.unit} hours={hours} />}
                                cursor={{ stroke: activeTab.color, strokeWidth: 1, strokeDasharray: '4 4' }} />
                            <Area
                                type="monotone" dataKey={tab} name={activeTab.label}
                                stroke={activeTab.color} strokeWidth={2.5}
                                fill={`url(#g_${model.id}_${tab})`} fillOpacity={1}
                                dot={false} activeDot={{ r: 4, fill: activeTab.color, strokeWidth: 0 }}
                                isAnimationActive={false}   // ← no jarring restart every 5s
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                )}
            </div>
        </div>
    )
}

// ─── All-models combined overlay chart ──────────────────────────────────
function AllModelsChart({ mlModels }) {
    const [combined, setCombined] = useState([])
    const [firstLoad, setFirstLoad] = useState(true)
    const [metric, setMetric] = useState('accuracy')

    const load = useCallback(() => {
        Promise.all(mlModels.map(m => metricsAPI.getMLModelChart(m.id, 24).catch(() => null)))
            .then(results => {
                const tsMap = {}
                results.forEach((res, idx) => {
                    if (!res) return
                    res.data.chart_data.forEach(pt => {
                        if (!tsMap[pt.timestamp]) tsMap[pt.timestamp] = { timestamp: pt.timestamp }
                        tsMap[pt.timestamp][mlModels[idx].name] = pt[metric]
                    })
                })
                setCombined(Object.values(tsMap).sort((a, b) => a.timestamp.localeCompare(b.timestamp)))
                setFirstLoad(false)
            })
    }, [mlModels, metric])

    useEffect(() => {
        load()
        const t = setInterval(load, 5000)
        return () => clearInterval(t)
    }, [load])

    if (mlModels.length < 2) return null

    return (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: 10 }}>
                <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t1)' }}>All ML Models — Combined View</div>
                    <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 1 }}>Overlay all models on one chart</div>
                </div>
                <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.04)', padding: 2, borderRadius: 6, border: '1px solid var(--border)' }}>
                    {ML_TABS.map(t => <PillBtn key={t.key} label={t.label} active={metric === t.key} onClick={() => setMetric(t.key)} />)}
                </div>
            </div>
            <div style={{ padding: '12px 4px 8px 4px', height: 240 }}>
                {firstLoad ? (
                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--t3)', fontSize: 13 }}>Loading...</div>
                ) : (
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={combined} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                            <XAxis dataKey="timestamp" stroke="rgba(0,0,0,0)"
                                tick={{ fill: '#475569', fontSize: 10 }} tickLine={false} interval="preserveStartEnd"
                                tickFormatter={(val) => {
                                    try {
                                        const d = new Date(val); if (isNaN(d)) return val;
                                        return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
                                    } catch { return val }
                                }}
                            />
                            <YAxis stroke="rgba(0,0,0,0)" tick={{ fill: '#475569', fontSize: 10 }} tickLine={false} />
                            <Tooltip contentStyle={{ background: '#0c1120', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
                                labelFormatter={(label) => {
                                    try {
                                        const d = new Date(label); if (isNaN(d)) return label;
                                        return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
                                    } catch { return label }
                                }}
                            />
                            <Legend wrapperStyle={{ paddingTop: 8, fontSize: 11, color: '#94a3b8' }} />
                            {mlModels.map((m, idx) => (
                                <Area key={m.id} type="monotone" dataKey={m.name}
                                    stroke={ALL_COLORS[idx % ALL_COLORS.length]} strokeWidth={2}
                                    fill={ALL_COLORS[idx % ALL_COLORS.length]} fillOpacity={0.05}
                                    dot={false} activeDot={{ r: 3 }}
                                    isAnimationActive={false}
                                />
                            ))}
                        </AreaChart>
                    </ResponsiveContainer>
                )}
            </div>
        </div>
    )
}

// ─── Main page ────────────────────────────────────────────────────────────
export default function ModelCharts() {
    const [mlModels, setMLModels] = useState([])
    const [llmModels, setLLMModels] = useState([])
    const [loading, setLoading] = useState(true)
    const [activeTab, setActiveTab] = useState('ml')

    useEffect(() => {
        Promise.all([
            modelsAPI.getMLModels().catch(() => ({ data: [] })),
            modelsAPI.getLLMModels().catch(() => ({ data: [] })),
        ]).then(([ml, llm]) => {
            setMLModels(ml.data || [])
            setLLMModels(llm.data || [])
            setLoading(false)
        })
    }, [])

    const models = activeTab === 'ml' ? mlModels : llmModels

    return (
        <div className="fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <h1 style={{ fontSize: 18, fontWeight: 600, color: 'var(--t1)' }}>Per-Model Charts</h1>
                    <p style={{ fontSize: 13, color: 'var(--t3)', marginTop: 3 }}>
                        Live charts · Auto-refreshes every 5s
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 3, background: 'rgba(255,255,255,0.04)', padding: 3, borderRadius: 7, border: '1px solid var(--border)' }}>
                    {[['ml', 'ML Models'], ['llm', 'LLM Services']].map(([k, label]) => (
                        <button key={k} onClick={() => setActiveTab(k)} style={{
                            padding: '6px 16px', borderRadius: 5, fontSize: 12, fontWeight: 500,
                            border: `1px solid ${activeTab === k ? 'rgba(255,255,255,0.1)' : 'transparent'}`,
                            background: activeTab === k ? 'rgba(255,255,255,0.07)' : 'transparent',
                            color: activeTab === k ? '#f1f5f9' : '#64748b', cursor: 'pointer', transition: 'all 0.15s',
                        }}>
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            {loading && (
                <div style={{ display: 'grid', gap: 16 }}>
                    {[1, 2].map(i => <div key={i} className="skeleton" style={{ height: 240 }} />)}
                </div>
            )}

            {!loading && models.length === 0 && (
                <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '40px 24px', textAlign: 'center' }}>
                    <div style={{ fontSize: 32, marginBottom: 12 }}>📊</div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--t1)', marginBottom: 6 }}>
                        No {activeTab === 'ml' ? 'ML models' : 'LLM services'} registered yet
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--t3)' }}>
                        Admin Panel → {activeTab === 'ml' ? 'ML' : 'LLM'} tab → Add a model
                    </div>
                </div>
            )}

            {!loading && activeTab === 'ml' && mlModels.length > 1 && <AllModelsChart mlModels={mlModels} />}

            {!loading && (
                <div style={{ display: 'grid', gap: 16 }}>
                    {models.map(model => (
                        <ModelChartCard key={model.id} model={model} modelType={activeTab} />
                    ))}
                </div>
            )}
        </div>
    )
}
