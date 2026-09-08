import axios from 'axios';

const TOKEN_KEY = 'te_dpr_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 30000,
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const url = error.config?.url || '';

    // An expired or revoked session sends the user back to the login screen —
    // but never bounce them out of the login request itself.
    if (status === 401 && !url.includes('/auth/login')) {
      clearToken();
      if (!window.location.pathname.startsWith('/login')) {
        window.location.replace('/login?expired=1');
      }
    }

    const message =
      error.response?.data?.message ||
      (error.code === 'ECONNABORTED'
        ? 'The server took too long to respond'
        : error.message === 'Network Error'
        ? 'Cannot reach the server. Is the backend running?'
        : 'Something went wrong');

    return Promise.reject(
      Object.assign(new Error(message), {
        status,
        details: error.response?.data?.details,
        original: error,
      })
    );
  }
);

/** Downloads a file response (Excel / CSV / PDF) and triggers a browser save. */
export async function downloadFile(url, params, fallbackName) {
  const response = await api.get(url, { params, responseType: 'blob' });
  const disposition = response.headers['content-disposition'] || '';
  const match = /filename="?([^"]+)"?/.exec(disposition);
  const filename = match ? match[1] : fallbackName;

  const blobUrl = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(blobUrl);
  return filename;
}

/* ------------------------------------------------------------------ */
/* Endpoint helpers — one place for every API call the UI makes.       */
/* ------------------------------------------------------------------ */
export const endpoints = {
  auth: {
    login: (payload) => api.post('/auth/login', payload),
    me: () => api.get('/auth/me'),
    changePassword: (payload) => api.post('/auth/change-password', payload),
    forgotPassword: (payload) => api.post('/auth/forgot-password', payload),
    resetPassword: (payload) => api.post('/auth/reset-password', payload),
  },
  employees: {
    list: (params) => api.get('/employees', { params }),
    search: (q) => api.get('/employees/search', { params: { q } }),
    get: (id) => api.get(`/employees/${id}`),
    attendance: (id, params) => api.get(`/employees/${id}/attendance`, { params }),
    create: (payload) => api.post('/employees', payload),
    update: (id, payload) => api.put(`/employees/${id}`, payload),
    setStatus: (id, payload) => api.patch(`/employees/${id}/status`, payload),
    validateImport: (formData) =>
      api.post('/employees/import/validate', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }),
    confirmImport: (rows) => api.post('/employees/import/confirm', { rows }),
  },
  masters: {
    departments: (params) => api.get('/masters/departments', { params }),
    createDepartment: (payload) => api.post('/masters/departments', payload),
    updateDepartment: (id, payload) => api.put(`/masters/departments/${id}`, payload),
    archiveDepartment: (id) => api.delete(`/masters/departments/${id}`),
    teams: (params) => api.get('/masters/teams', { params }),
    createTeam: (payload) => api.post('/masters/teams', payload),
    updateTeam: (id, payload) => api.put(`/masters/teams/${id}`, payload),
    archiveTeam: (id) => api.delete(`/masters/teams/${id}`),
    shifts: () => api.get('/masters/shifts'),
    saveShift: (payload) => api.put('/masters/shifts', payload),
    holidays: (params) => api.get('/masters/holidays', { params }),
    createHoliday: (payload) => api.post('/masters/holidays', payload),
    deleteHoliday: (id) => api.delete(`/masters/holidays/${id}`),
  },
  dpr: {
    controlCenter: (params) => api.get('/dpr/control-center', { params }),
    entry: (params) => api.get('/dpr/entry', { params }),
    save: (payload) => api.post('/dpr', payload),
    bulkSave: (payload) => api.post('/dpr/bulk', payload),
    myWorkspace: (params) => api.get('/dpr/my-workspace', { params }),
    incomplete: (params) => api.get('/dpr/incomplete', { params }),
    remove: (id, reason) => api.delete(`/dpr/${id}`, { data: { reason } }),
  },
  dashboard: {
    overview: (params) => api.get('/dashboard/overview', { params }),
    departments: (params) => api.get('/dashboard/departments', { params }),
    analytics: (params) => api.get('/dashboard/analytics', { params }),
    notifications: () => api.get('/dashboard/notifications'),
    search: (q) => api.get('/dashboard/search', { params: { q } }),
  },
  reports: {
    dpr: (params) => api.get('/reports/dpr', { params }),
    attendance: (params) => api.get('/reports/attendance', { params }),
    production: (params) => api.get('/reports/production', { params }),
  },
  operators: {
    list: () => api.get('/operators'),
    catalogue: () => api.get('/operators/permissions'),
    create: (payload) => api.post('/operators', payload),
    update: (id, payload) => api.put(`/operators/${id}`, payload),
    setPermissions: (id, permissions) => api.put(`/operators/${id}/permissions`, { permissions }),
    resetPassword: (id, newPassword) => api.put(`/operators/${id}/password`, { newPassword }),
    disable: (id) => api.delete(`/operators/${id}`),
  },
  audit: {
    list: (params) => api.get('/audit', { params }),
    filters: () => api.get('/audit/actions'),
  },
  system: {
    settings: () => api.get('/system/settings'),
    saveSettings: (payload) => api.put('/system/settings', payload),
    status: () => api.get('/system/status'),
  },
};

export default api;
