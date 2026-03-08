const STATUS_STYLES = {
  healthy: { border: '#22c55e', badge: 'rgba(34, 197, 94, 0.1)', text: '#22c55e', glow: 'rgba(34, 197, 94, 0.4)' },
  warning: { border: '#f59e0b', badge: 'rgba(245, 158, 11, 0.1)', text: '#f59e0b', glow: 'rgba(245, 158, 11, 0.4)' },
  critical: { border: '#ef4444', badge: 'rgba(239, 68, 68, 0.1)', text: '#ef4444', glow: 'rgba(239, 68, 68, 0.4)' },
}

// Fallback style used when status is unknown/missing
const DEFAULT_STYLE = { border: '#475569', badge: 'rgba(71,85,105,0.1)', text: '#94a3b8', glow: 'rgba(71,85,105,0.3)' }

export default function MetricCard({ model, delay }) {
  // Use STATUS_STYLES directly — eliminates the duplicate switch-case
  const style = STATUS_STYLES[(model?.status ?? 'healthy').toLowerCase()] ?? DEFAULT_STYLE
  const statusColor = style.text

  return (
    <div
      className="glass-card animate-fade-in"
      style={{
        padding: '24px',
        animationDelay: delay,
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        border: '1px solid var(--border-subtle)'
      }}
    >
      {/* Card Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h3 style={{
            margin: 0,
            fontSize: '17px',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-heading)',
            fontWeight: 700,
            letterSpacing: '-0.02em'
          }}>
            {model.model_name}
          </h3>
          <p style={{
            margin: '2px 0 0 0',
            fontSize: '11px',
            color: 'var(--text-secondary)',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            ID: <span style={{ fontFamily: 'JetBrains Mono', color: 'rgba(255,255,255,0.4)', fontSize: '10px' }}>{model.model_id.slice(0, 8)}</span>
          </p>
        </div>
        <div style={{
          padding: '4px 10px',
          borderRadius: '20px',
          fontSize: '10px',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          background: `${statusColor}15`,
          color: statusColor,
          border: `1px solid ${statusColor}30`,
          display: 'flex',
          alignItems: 'center',
          gap: '5px'
        }}>
          <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: statusColor }} />
          {model.status}
        </div>
      </div>

      {/* Metrics Row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '12px',
        padding: '16px',
        background: 'rgba(255, 255, 255, 0.02)',
        borderRadius: '12px',
        border: '1px solid var(--border-subtle)'
      }}>
        {[
          { label: 'Accuracy', value: `${(model.current_accuracy * 100).toFixed(1)}%` },
          { label: 'Drift', value: (model.current_drift || 0).toFixed(2) },
          { label: 'Latency', value: `${model.current_latency_ms}ms` }
        ].map((m, idx) => (
          <div key={idx} style={{ textAlign: 'center' }}>
            <p style={{
              fontSize: '9px',
              color: 'var(--text-secondary)',
              margin: '0 0 4px 0',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              fontWeight: 600,
              opacity: 0.6
            }}>{m.label}</p>
            <p style={{
              fontSize: '15px',
              color: 'var(--text-primary)',
              margin: 0,
              fontWeight: 700,
              fontFamily: 'var(--font-heading)'
            }}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
        <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: 0, opacity: 0.5, fontWeight: 500 }}>
          Last Updated: <span style={{ color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>{model.last_updated}</span>
        </p>
        <button style={{
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid var(--border-subtle)',
          color: 'var(--text-primary)',
          padding: '6px 12px',
          borderRadius: '8px',
          fontSize: '11px',
          fontWeight: 600,
          transition: 'all 0.2s ease',
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }} className="btn-hover">
          ANALYSIS <span style={{ fontSize: '12px' }}>→</span>
        </button>
      </div>

      <style>{`
        .btn-hover:hover {
            background: rgba(255, 255, 255, 0.08) !important;
            border-color: var(--accent-blue) !important;
        }
      `}</style>
    </div>
  )
}
