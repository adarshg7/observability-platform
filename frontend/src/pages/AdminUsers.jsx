import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { adminAPI, modelsAPI, auditAPI, apiKeysAPI } from '../api/client'

// ── Reusable tiny components ─────────────────────────────────────────
function RoleBadge({ role }) {
    const c = role === 'admin' ? '#a78bfa' : '#3b82f6'
    return <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: c, background: `${c}18`, border: `1px solid ${c}44` }}>{role}</span>
}
function StatusBadge({ active }) {
    const c = active ? '#10b981' : '#ef4444'
    return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 700, color: c, background: `${c}12`, border: `1px solid ${c}33` }}><span style={{ width: 4, height: 4, borderRadius: '50%', background: c }} />{active ? 'Active' : 'Inactive'}</span>
}
function SeverityDot({ action }) {
    const d = action.startsWith('user') ? '#ef4444' : action.startsWith('model') ? '#3b82f6' : action.startsWith('access') ? '#a78bfa' : action.startsWith('api') ? '#f59e0b' : '#64748b'
    return <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: d, marginRight: 6, flexShrink: 0 }} />
}
function Confirm({ message, onConfirm, onCancel }) {
    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: 28, maxWidth: 360, width: '90%' }}>
                <p style={{ color: 'var(--t1)', fontSize: 14, marginBottom: 20 }}>{message}</p>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button onClick={onCancel} style={{ padding: '7px 16px', background: 'none', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--t2)', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font)' }}>Cancel</button>
                    <button onClick={onConfirm} style={{ padding: '7px 16px', background: '#ef444420', border: '1px solid #ef444466', borderRadius: 7, color: '#ef4444', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font)' }}>Confirm</button>
                </div>
            </div>
        </div>
    )
}
function AddForm({ fields, onSubmit, error, setError }) {
    const [values, setValues] = useState(() => Object.fromEntries(fields.map(f => [f.key, f.default ?? ''])))
    function set(key, val) { setValues(v => ({ ...v, [key]: val })); setError('') }
    async function submit(e) { e.preventDefault(); await onSubmit(values); setValues(Object.fromEntries(fields.map(f => [f.key, f.default ?? '']))) }
    const inputStyle = { padding: '7px 10px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--t1)', fontSize: 12, fontFamily: 'var(--font)', outline: 'none', boxSizing: 'border-box', width: '100%' }
    return (
        <form onSubmit={submit} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            {fields.map(f => (
                <div key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: f.flex ?? '1 1 160px', minWidth: 100 }}>
                    <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{f.label}</label>
                    {f.type === 'select' ? (
                        <select value={values[f.key]} onChange={e => set(f.key, e.target.value)} style={{ ...inputStyle }}>
                            {f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                    ) : f.type === 'select-custom' ? (
                        // Dropdown with a free-text override when 'custom' is selected
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <select
                                value={f.options.some(o => o.value === values[f.key]) ? values[f.key] : 'custom'}
                                onChange={e => set(f.key, e.target.value === 'custom' ? '' : e.target.value)}
                                style={{ ...inputStyle }}
                            >
                                {f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                <option value="custom">Custom...</option>
                            </select>
                            {/* Show text field only when custom is picked */}
                            {!f.options.some(o => o.value === values[f.key]) && (
                                <input
                                    type="text" placeholder="Enter custom type..."
                                    value={values[f.key]}
                                    onChange={e => set(f.key, e.target.value)}
                                    style={{ ...inputStyle }}
                                    onFocus={e => e.target.style.borderColor = 'rgba(59,130,246,0.5)'}
                                    onBlur={e => e.target.style.borderColor = 'var(--border)'}
                                    autoFocus
                                />
                            )}
                        </div>
                    ) : (
                        <input type="text" placeholder={f.placeholder} value={values[f.key]} onChange={e => set(f.key, e.target.value)}
                            style={inputStyle}
                            onFocus={e => e.target.style.borderColor = 'rgba(59,130,246,0.5)'} onBlur={e => e.target.style.borderColor = 'var(--border)'} />
                    )}
                </div>
            ))}
            <button type="submit" style={{ padding: '7px 16px', background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 7, color: '#3b82f6', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', whiteSpace: 'nowrap' }}>Add</button>
            {error && <div style={{ width: '100%', fontSize: 11, color: '#ef4444', marginTop: 2 }}>{error}</div>}
        </form>
    )
}

// ── Main AdminUsers page ─────────────────────────────────────────────
export default function AdminUsers() {
    const { user } = useAuth()
    const navigate = useNavigate()

    const [users, setUsers] = useState([])
    const [domains, setDomains] = useState([])
    const [mlModels, setMLModels] = useState([])
    const [llmModels, setLLMModels] = useState([])
    const [auditLogs, setAuditLogs] = useState([])
    const [apiKeys, setAPIKeys] = useState([])
    const [stats, setStats] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [formErr, setFormErr] = useState('')
    const [confirm, setConfirm] = useState(null)
    const [tab, setTab] = useState('users')
    const [newKey, setNewKey] = useState(null)  // raw key shown once

    // Access modal state
    const [accessUser, setAccessUser] = useState(null)
    const [accessList, setAccessList] = useState([])
    const [accessLoading, setAccessLoading] = useState(false)
    const [accessErr, setAccessErr] = useState('')

    useEffect(() => { if (user && user.role !== 'admin') navigate('/dashboard', { replace: true }) }, [user, navigate])

    const fetchAll = useCallback(async () => {
        try {
            setLoading(true)
            const [uRes, dRes, mlRes, llmRes, auditRes, keysRes, statsRes] = await Promise.all([
                adminAPI.getUsers(), adminAPI.getDomains(),
                modelsAPI.getMLModels(), modelsAPI.getLLMModels(),
                auditAPI.getLogs(), apiKeysAPI.list(), auditAPI.getStats(),
            ])
            setUsers(uRes.data); setDomains(dRes.data)
            setMLModels(mlRes.data); setLLMModels(llmRes.data)
            setAuditLogs(auditRes.data); setAPIKeys(keysRes.data)
            setStats(statsRes.data); setError('')
        } catch (e) { setError(e.response?.data?.detail || 'Failed to load data') }
        finally { setLoading(false) }
    }, [])

    useEffect(() => { fetchAll() }, [fetchAll])

    function confirmAction(message, fn) {
        setConfirm({ message, onConfirm: async () => { setConfirm(null); await fn(); fetchAll() } })
    }

    // User actions
    const toggleUser = u => confirmAction(`${u.is_active ? 'Deactivate' : 'Activate'} ${u.name}?`, () => adminAPI.toggleUser(u.id))
    const removeUser = u => confirmAction(`Permanently delete ${u.name}?`, () => adminAPI.removeUser(u.id))

    // Domain actions
    async function addDomain({ domain }) {
        try { await adminAPI.addDomain(domain); setFormErr(''); fetchAll() }
        catch (e) { setFormErr(e.response?.data?.detail || 'Failed') }
    }
    const removeDomain = d => confirmAction(`Remove "@${d.domain}"?`, () => adminAPI.removeDomain(d.id))

    // ML model actions
    async function addMLModel(body) { try { await modelsAPI.addMLModel(body); fetchAll() } catch (e) { setFormErr(e.response?.data?.detail || 'Failed') } }
    const removeMLModel = m => confirmAction(`Remove ML model "${m.name}"?`, () => modelsAPI.removeMLModel(m.id))

    // LLM model actions
    async function addLLMModel(body) { try { await modelsAPI.addLLMModel(body); fetchAll() } catch (e) { setFormErr(e.response?.data?.detail || 'Failed') } }
    const removeLLMModel = m => confirmAction(`Remove LLM service "${m.name}"?`, () => modelsAPI.removeLLMModel(m.id))

    // API key actions
    async function createAPIKey({ name, description }) {
        try {
            const res = await apiKeysAPI.create({ name, description })
            setNewKey(res.data.raw_key)
            setFormErr(''); fetchAll()
        } catch (e) { setFormErr(e.response?.data?.detail || 'Failed') }
    }
    const revokeAPIKey = k => confirmAction(`Revoke API key "${k.name}"? This cannot be undone.`, () => apiKeysAPI.revoke(k.id))

    // Access modal
    async function openAccess(u) {
        setAccessUser(u); setAccessLoading(true); setAccessErr('')
        try { const res = await modelsAPI.getUserAccess(u.id); setAccessList(res.data) }
        catch { setAccessErr('Failed to load access') }
        finally { setAccessLoading(false) }
    }
    function closeAccess() { setAccessUser(null); setAccessList([]) }
    async function grantAccess(modelId, modelType) {
        try { await modelsAPI.grantAccess({ user_id: accessUser.id, model_id: modelId, model_type: modelType }); const res = await modelsAPI.getUserAccess(accessUser.id); setAccessList(res.data) }
        catch (e) { setAccessErr(e.response?.data?.detail || 'Failed') }
    }
    async function revokeAccess(accessId) {
        try { await modelsAPI.revokeAccess(accessId); setAccessList(prev => prev.filter(r => r.id !== accessId)) }
        catch { setAccessErr('Failed to revoke') }
    }

    if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--t3)' }}>Loading...</div>

    const tabBtn = (t, label) => (
        <button onClick={() => setTab(t)} style={{ padding: '7px 16px', border: 'none', background: 'transparent', borderBottom: `2px solid ${tab === t ? '#3b82f6' : 'transparent'}`, color: tab === t ? '#3b82f6' : 'var(--t3)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', transition: 'all .15s' }}>{label}</button>
    )
    const rowStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderBottom: '1px solid var(--border)' }
    const removeBtn = onClick => <button onClick={onClick} style={{ padding: '4px 10px', background: '#ef444412', border: '1px solid #ef444430', borderRadius: 6, fontSize: 11, fontWeight: 500, color: '#ef4444', cursor: 'pointer', fontFamily: 'var(--font)' }}>Remove</button>

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {confirm && <Confirm message={confirm.message} onConfirm={confirm.onConfirm} onCancel={() => setConfirm(null)} />}

            {/* New API key reveal modal */}
            {newKey && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)', padding: 16 }}>
                    <div style={{ background: 'var(--card)', border: '1px solid #10b98144', borderRadius: 16, padding: 28, maxWidth: 480, width: '100%' }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: '#10b981', marginBottom: 8 }}>✓ API Key Created</div>
                        <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 14 }}>⚠ Copy this key now — it will never be shown again.</div>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: 12, padding: 12, background: 'rgba(16,185,129,0.06)', border: '1px solid #10b98130', borderRadius: 8, wordBreak: 'break-all', color: '#10b981', marginBottom: 16 }}>{newKey}</div>
                        <button onClick={() => { navigator.clipboard.writeText(newKey); setNewKey(null) }} style={{ padding: '8px 18px', background: '#10b98118', border: '1px solid #10b98144', borderRadius: 8, color: '#10b981', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}>Copy & Close</button>
                    </div>
                </div>
            )}

            {/* Access modal */}
            {accessUser && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)', padding: 16 }}>
                    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, width: '100%', maxWidth: 520, maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div><div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}>Access for {accessUser.name}</div><div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>{accessUser.email}</div></div>
                            <button onClick={closeAccess} style={{ background: 'none', border: 'none', color: 'var(--t3)', cursor: 'pointer', fontSize: 18 }}>✕</button>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 22px' }}>
                            {accessErr && <div style={{ fontSize: 12, color: '#ef4444', marginBottom: 10 }}>{accessErr}</div>}
                            {accessLoading ? <div style={{ color: 'var(--t3)', fontSize: 13 }}>Loading...</div> : (
                                <>
                                    {accessList.length === 0 ? <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 14 }}>No models assigned yet.</div> : (
                                        <div style={{ marginBottom: 16 }}>
                                            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--t3)', marginBottom: 8 }}>Current Access</div>
                                            {accessList.map(r => {
                                                const name = r.model_type === 'ml' ? mlModels.find(m => m.id === r.model_id)?.name : llmModels.find(m => m.id === r.model_id)?.name
                                                return (<div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, marginBottom: 6 }}>
                                                    <div><span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t1)' }}>{name || `Model #${r.model_id}`}</span><span style={{ marginLeft: 8, fontSize: 10, color: r.model_type === 'ml' ? '#3b82f6' : '#a78bfa', background: r.model_type === 'ml' ? '#3b82f618' : '#a78bfa18', padding: '1px 6px', borderRadius: 99 }}>{r.model_type.toUpperCase()}</span></div>
                                                    <button onClick={() => revokeAccess(r.id)} style={{ fontSize: 11, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>Revoke</button>
                                                </div>)
                                            })}
                                        </div>
                                    )}
                                    {mlModels.filter(m => !accessList.some(r => r.model_id === m.id && r.model_type === 'ml')).map(m => (
                                        <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: 8, marginBottom: 4 }}>
                                            <span style={{ fontSize: 12, color: 'var(--t2)' }}>{m.name} <span style={{ fontSize: 10, color: '#3b82f6' }}>ML</span></span>
                                            <button onClick={() => grantAccess(m.id, 'ml')} style={{ fontSize: 11, color: '#10b981', background: '#10b98112', border: '1px solid #10b98130', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontFamily: 'var(--font)' }}>Grant</button>
                                        </div>
                                    ))}
                                    {llmModels.filter(m => !accessList.some(r => r.model_id === m.id && r.model_type === 'llm')).map(m => (
                                        <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: 8, marginBottom: 4 }}>
                                            <span style={{ fontSize: 12, color: 'var(--t2)' }}>{m.name} <span style={{ fontSize: 10, color: '#a78bfa' }}>LLM</span></span>
                                            <button onClick={() => grantAccess(m.id, 'llm')} style={{ fontSize: 11, color: '#a78bfa', background: '#a78bfa12', border: '1px solid #a78bfa30', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontFamily: 'var(--font)' }}>Grant</button>
                                        </div>
                                    ))}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Header */}
            <div>
                <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--t1)', margin: 0 }}>Admin Panel</h1>
                <p style={{ fontSize: 13, color: 'var(--t3)', marginTop: 3 }}>Manage users, models, access, and platform security</p>
            </div>

            {error && <div style={{ padding: '8px 14px', background: '#ef444412', border: '1px solid #ef444430', borderRadius: 8, fontSize: 12, color: '#ef4444' }}>{error}</div>}

            {/* Stats from DB */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 12 }}>
                {[
                    { label: 'Users', value: stats?.total_users ?? users.length, color: 'var(--brand)' },
                    { label: 'ML Models', value: stats?.ml_models ?? mlModels.length, color: '#3b82f6' },
                    { label: 'LLM Services', value: stats?.llm_services ?? llmModels.length, color: '#a78bfa' },
                    { label: 'Metric Reads', value: stats?.metric_readings ?? '—', color: '#10b981' },
                    { label: 'Domains', value: domains.length === 0 ? '∞' : domains.length, color: '#f59e0b' },
                    { label: 'API Keys', value: stats?.active_api_keys ?? apiKeys.length, color: '#ec4899' },
                ].map(({ label, value, color }) => (
                    <div key={label} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', position: 'relative', overflow: 'hidden' }}>
                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: color }} />
                        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--t3)', marginBottom: 6 }}>{label}</div>
                        <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
                    </div>
                ))}
            </div>

            {/* Tab bar */}
            <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
                {tabBtn('users', `Users (${users.length})`)}
                {tabBtn('ml', `ML (${mlModels.length})`)}
                {tabBtn('llm', `LLM (${llmModels.length})`)}
                {tabBtn('domains', 'Domains')}
                {tabBtn('apikeys', `API Keys (${apiKeys.length})`)}
                {tabBtn('audit', `Audit Log (${auditLogs.length})`)}
            </div>

            {/* ── USERS TAB ── */}
            {tab === 'users' && (
                <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
                    {users.length === 0 ? <div style={{ padding: 40, textAlign: 'center', color: 'var(--t3)', fontSize: 13 }}>No users</div>
                        : users.map((u, i) => (
                            <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 18px', borderBottom: i < users.length - 1 ? '1px solid var(--border)' : 'none' }}
                                onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                <div style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0, background: 'linear-gradient(135deg,#1e3a8a,#3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff' }}>{u.name.charAt(0).toUpperCase()}</div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{u.name}</span>
                                        <RoleBadge role={u.role} /><StatusBadge active={u.is_active} />
                                        {u.id === user?.id && <span style={{ fontSize: 10, color: 'var(--t3)', fontStyle: 'italic' }}>you</span>}
                                    </div>
                                    <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2, fontFamily: 'var(--mono)' }}>{u.email}</div>
                                </div>
                                {u.id !== user?.id && (
                                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                                        <button onClick={() => openAccess(u)} style={{ padding: '5px 10px', background: '#10b98112', border: '1px solid #10b98130', borderRadius: 6, fontSize: 11, fontWeight: 500, color: '#10b981', cursor: 'pointer', fontFamily: 'var(--font)' }}>Access</button>
                                        <button onClick={() => toggleUser(u)} style={{ padding: '5px 10px', background: u.is_active ? '#f59e0b18' : '#10b98118', border: `1px solid ${u.is_active ? '#f59e0b44' : '#10b98144'}`, borderRadius: 6, fontSize: 11, fontWeight: 500, color: u.is_active ? '#f59e0b' : '#10b981', cursor: 'pointer', fontFamily: 'var(--font)' }}>{u.is_active ? 'Deactivate' : 'Activate'}</button>
                                        <button onClick={() => removeUser(u)} style={{ padding: '5px 10px', background: '#ef444412', border: '1px solid #ef444430', borderRadius: 6, fontSize: 11, fontWeight: 500, color: '#ef4444', cursor: 'pointer', fontFamily: 'var(--font)' }}>Remove</button>
                                    </div>
                                )}
                            </div>
                        ))}
                </div>
            )}

            {/* ── ML MODELS TAB ── */}
            {tab === 'ml' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)', marginBottom: 12 }}>Add ML Model</div>
                        <AddForm error={formErr} setError={setFormErr} onSubmit={addMLModel} fields={[
                            { key: 'name', label: 'Model Name', placeholder: 'AML Fraud Detector', flex: '2 1 200px' },
                            { key: 'description', label: 'Description', placeholder: 'Short description...', flex: '2 1 200px' },
                            {
                                key: 'model_type', label: 'Type', type: 'select-custom', default: 'classification', flex: '1 1 160px', options: [
                                    { value: 'classification', label: 'Classification' },
                                    { value: 'regression', label: 'Regression' },
                                    { value: 'anomaly', label: 'Anomaly Detection' },
                                    { value: 'nlp', label: 'NLP / Text' },
                                    { value: 'timeseries', label: 'Time Series' },
                                    { value: 'clustering', label: 'Clustering' },
                                    { value: 'recommendation', label: 'Recommendation' },
                                    { value: 'vision', label: 'Computer Vision' },
                                ]
                            },
                        ]} />
                    </div>
                    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
                        {mlModels.length === 0 ? <div style={{ padding: 40, textAlign: 'center', color: 'var(--t3)', fontSize: 13 }}>No ML models registered yet</div>
                            : mlModels.map((m, i) => (<div key={m.id} style={{ ...rowStyle, borderBottom: i < mlModels.length - 1 ? '1px solid var(--border)' : 'none' }}>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{m.name}</span>
                                        <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: '#64748b', background: 'rgba(255,255,255,0.05)', padding: '1px 6px', borderRadius: 4, border: '1px solid var(--border)' }}>ID: {m.id}</span>
                                    </div>
                                    <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>{m.model_type} · Added by {m.created_by}</div>
                                    {m.description && <div style={{ fontSize: 11, color: 'var(--t2)', marginTop: 2 }}>{m.description}</div>}
                                </div>
                                {removeBtn(() => removeMLModel(m))}
                            </div>))}
                    </div>
                </div>
            )}

            {/* ── LLM SERVICES TAB ── */}
            {tab === 'llm' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)', marginBottom: 12 }}>Add LLM Service</div>
                        <AddForm error={formErr} setError={setFormErr} onSubmit={addLLMModel} fields={[
                            { key: 'name', label: 'Service Name', placeholder: 'Transaction Explainer', flex: '2 1 200px' },
                            { key: 'description', label: 'Description', placeholder: 'Short description...', flex: '2 1 200px' },
                            {
                                key: 'provider', label: 'Provider / Type', type: 'select-custom', default: 'openai', flex: '1 1 160px', options: [
                                    { value: 'openai', label: 'OpenAI (GPT-4)' },
                                    { value: 'anthropic', label: 'Anthropic (Claude)' },
                                    { value: 'google', label: 'Google (Gemini)' },
                                    { value: 'meta', label: 'Meta (LLaMA)' },
                                    { value: 'mistral', label: 'Mistral' },
                                    { value: 'cohere', label: 'Cohere' },
                                    { value: 'local', label: 'Local / Self-hosted' },
                                ]
                            },
                        ]} />
                    </div>
                    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
                        {llmModels.length === 0 ? <div style={{ padding: 40, textAlign: 'center', color: 'var(--t3)', fontSize: 13 }}>No LLM services registered yet</div>
                            : llmModels.map((m, i) => (<div key={m.id} style={{ ...rowStyle, borderBottom: i < llmModels.length - 1 ? '1px solid var(--border)' : 'none' }}>
                                <div><div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{m.name}</div><div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>{m.provider} · Added by {m.created_by}</div>{m.description && <div style={{ fontSize: 11, color: 'var(--t2)', marginTop: 2 }}>{m.description}</div>}</div>
                                {removeBtn(() => removeLLMModel(m))}
                            </div>))}
                    </div>
                </div>
            )}

            {/* ── DOMAINS TAB ── */}
            {tab === 'domains' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)', marginBottom: 4 }}>Allowed Email Domains</div>
                        <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 14 }}>{domains.length === 0 ? '⚠️  No domains set — registration is open to everyone' : `Only @${domains.map(d => d.domain).join(', @')} can register`}</div>
                        <AddForm error={formErr} setError={setFormErr} onSubmit={addDomain} fields={[{ key: 'domain', label: 'Domain', placeholder: 'bank.com' }]} />
                    </div>
                    {domains.length > 0 && <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
                        {domains.map((d, i) => (<div key={d.id} style={{ ...rowStyle, borderBottom: i < domains.length - 1 ? '1px solid var(--border)' : 'none' }}>
                            <div><div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)', fontFamily: 'var(--mono)' }}>@{d.domain}</div><div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>Added by {d.created_by}</div></div>
                            {removeBtn(() => removeDomain(d))}
                        </div>))}
                    </div>}
                </div>
            )}

            {/* ── API KEYS TAB ── */}
            {tab === 'apikeys' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)', marginBottom: 4 }}>API Keys</div>
                        <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 14 }}>Keys allow external ML pipelines to push metrics via <code style={{ fontFamily: 'var(--mono)', background: 'rgba(255,255,255,0.06)', padding: '1px 5px', borderRadius: 4 }}>POST /api/metrics/ingest</code></div>
                        <AddForm error={formErr} setError={setFormErr} onSubmit={createAPIKey} fields={[
                            { key: 'name', label: 'Key Name', placeholder: 'Fraud Model Pipeline', flex: '2 1 180px' },
                            { key: 'description', label: 'Description', placeholder: 'What this key is for', flex: '2 1 180px' },
                        ]} />
                    </div>
                    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
                        {apiKeys.length === 0 ? <div style={{ padding: 40, textAlign: 'center', color: 'var(--t3)', fontSize: 13 }}>No API keys created yet</div>
                            : apiKeys.map((k, i) => (<div key={k.id} style={{ ...rowStyle, borderBottom: i < apiKeys.length - 1 ? '1px solid var(--border)' : 'none' }}>
                                <div>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{k.name}</div>
                                    <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--t3)', marginTop: 2 }}>{k.key_prefix}••••••••••••••••••••••••••••••</div>
                                    <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>Owner: {k.owner_email}{k.last_used && ` · Last used: ${new Date(k.last_used).toLocaleDateString()}`}</div>
                                    {k.description && <div style={{ fontSize: 11, color: 'var(--t2)', marginTop: 2 }}>{k.description}</div>}
                                </div>
                                {removeBtn(() => revokeAPIKey(k))}
                            </div>))}
                    </div>
                </div>
            )}

            {/* ── AUDIT LOG TAB ── */}
            {tab === 'audit' && (
                <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
                    <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>Audit Log</div>
                        <button onClick={fetchAll} style={{ fontSize: 11, color: 'var(--t3)', background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontFamily: 'var(--font)' }}>↻ Refresh</button>
                    </div>
                    {auditLogs.length === 0 ? (
                        <div style={{ padding: 40, textAlign: 'center', color: 'var(--t3)', fontSize: 13 }}>No audit events recorded yet. Actions like adding models, granting access, or removing users will appear here.</div>
                    ) : auditLogs.map((log, i) => (
                        <div key={log.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 18px', borderBottom: i < auditLogs.length - 1 ? '1px solid var(--border)' : 'none', opacity: 0.9 }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                            <SeverityDot action={log.action} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
                                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t1)', fontFamily: 'var(--mono)' }}>{log.action}</div>
                                    <div style={{ fontSize: 10, color: 'var(--t3)' }}>{new Date(log.created_at).toLocaleString()}</div>
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>by <span style={{ color: 'var(--t2)' }}>{log.actor_email}</span>{log.target && <> → <span style={{ fontFamily: 'var(--mono)', color: 'var(--t2)' }}>{log.target}</span></>}</div>
                                {log.detail && <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2, fontFamily: 'var(--mono)', opacity: 0.7 }}>{log.detail}</div>}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
