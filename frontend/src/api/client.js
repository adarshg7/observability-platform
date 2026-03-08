import axios from 'axios'

const api = axios.create({
  baseURL: 'http://localhost:8000',
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use(config => {
  // SECURITY: token lives in sessionStorage — cleared on browser/tab close, forcing re-login
  const token = sessionStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      const isLoginRoute = err.config?.url?.includes('/api/auth/login')
      if (!isLoginRoute) {
        sessionStorage.removeItem('token')
        window.location.href = '/login'
      }
    }
    return Promise.reject(err)
  }
)

export const metricsAPI = {
  getMLMetrics: () => api.get('/api/metrics/ml'),
  getLLMMetrics: () => api.get('/api/metrics/llm'),
  getMLModelChart: (id, h) => api.get(`/api/metrics/ml/${id}/chart${h ? `?hours=${h}` : ''}`),
  getLLMModelChart: (id, h) => api.get(`/api/metrics/llm/${id}/chart${h ? `?hours=${h}` : ''}`),
}

export const authAPI = {
  login: (email, password) => api.post('/api/auth/login', { email, password }),
  register: (name, email, password) => api.post('/api/auth/register', { name, email, password }),
  me: () => api.get('/api/auth/me'),
  logoutAll: () => api.post('/api/auth/logout-all'),
}

export const userAPI = {
  getProfile: () => api.get('/api/users/me/profile'),
  updateProfile: (name) => api.put('/api/users/me/profile', { name }),
  changePassword: (current_password, new_password) =>
    api.put('/api/users/me/password', { current_password, new_password }),
  getSettings: () => api.get('/api/users/me/settings'),
  saveSettings: (settings) => api.put('/api/users/me/settings', { settings }),
}

export const adminAPI = {
  // Users
  getUsers: () => api.get('/api/admin/users'),
  removeUser: (id) => api.delete(`/api/admin/users/${id}`),
  toggleUser: (id) => api.put(`/api/admin/users/${id}/toggle`),
  // Pending approval
  getPendingUsers: () => api.get('/api/admin/users/pending'),
  approveUser: (id) => api.post(`/api/admin/users/${id}/approve`),
  rejectUser: (id, reason = '') => api.post(`/api/admin/users/${id}/reject`, { reason }),
  // Invite user
  inviteUser: (body) => api.post('/api/admin/users/invite', body),
  // Domains
  getDomains: () => api.get('/api/admin/domains'),
  addDomain: (domain) => api.post('/api/admin/domains', { domain }),
  removeDomain: (domainId) => api.delete(`/api/admin/domains/${domainId}`),
}

export const modelsAPI = {
  // ML model registry
  getMLModels: () => api.get('/api/admin/models/ml'),
  addMLModel: (body) => api.post('/api/admin/models/ml', body),
  removeMLModel: (id) => api.delete(`/api/admin/models/ml/${id}`),
  // LLM service registry
  getLLMModels: () => api.get('/api/admin/models/llm'),
  addLLMModel: (body) => api.post('/api/admin/models/llm', body),
  removeLLMModel: (id) => api.delete(`/api/admin/models/llm/${id}`),
  // Per-user access
  getUserAccess: (uid) => api.get(`/api/admin/access/${uid}`),
  grantAccess: (body) => api.post('/api/admin/access', body),
  revokeAccess: (id) => api.delete(`/api/admin/access/${id}`),
}

export const auditAPI = {
  getLogs: (limit = 100) => api.get(`/api/admin/audit?limit=${limit}`),
  getStats: () => api.get('/api/admin/stats'),
}

export const apiKeysAPI = {
  list: () => api.get('/api/admin/apikeys'),
  create: (body) => api.post('/api/admin/apikeys', body),
  revoke: (id) => api.delete(`/api/admin/apikeys/${id}`),
}

export default api