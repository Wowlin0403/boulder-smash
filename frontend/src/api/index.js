import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
      return new Promise(() => {});
    }
    return Promise.reject(err);
  }
);

export default api;

export const authAPI = {
  login: (data) => api.post('/auth/login', data),
};

export const eventsAPI = {
  list: () => api.get('/events'),
  create: (data) => api.post('/events', data),
  get: (id) => api.get(`/events/${id}`),
  update: (id, data) => api.put(`/events/${id}`, data),
  delete: (id) => api.delete(`/events/${id}`),
  getCategories: (id) => api.get(`/events/${id}/categories`),
  createCategory: (id, data) => api.post(`/events/${id}/categories`, data),
  updateCategory: (id, catId, data) => api.put(`/events/${id}/categories/${catId}`, data),
  deleteCategory: (id, catId) => api.delete(`/events/${id}/categories/${catId}`),
  getAthletes: (id, params) => api.get(`/events/${id}/athletes`, { params }),
  createAthlete: (id, data) => api.post(`/events/${id}/athletes`, data),
  updateAthlete: (id, athId, data) => api.put(`/events/${id}/athletes/${athId}`, data),
  deleteAthlete: (id, athId) => api.delete(`/events/${id}/athletes/${athId}`),
  deleteAllAthletes: (id) => api.delete(`/events/${id}/athletes`),
  bulkImportAthletes: (id, athletes) => api.post(`/events/${id}/athletes/bulk`, { athletes }),
  getBoulders: (id, categoryId) => api.get(`/events/${id}/boulders/final`, { params: { category_id: categoryId } }),
  resizeBoulders: (id, count, categoryId) => api.put(`/events/${id}/boulders/final/resize`, { count, category_id: categoryId }),
  updateBoulder: (id, bId, data) => api.put(`/events/${id}/boulders/${bId}`, data),
  getSmashScores: (id, categoryId) => api.get(`/events/${id}/smash-scores`, { params: { category_id: categoryId } }),
  saveSmashScores: (id, data) => api.post(`/events/${id}/smash-scores`, data),
  getFinalScores: (id) => api.get(`/events/${id}/scores/final`),
  saveFinalScores: (id, data) => api.post(`/events/${id}/scores`, data),
  getSmashRanking: (id) => api.get(`/events/${id}/ranking/smash`),
  getFinalRanking: (id) => api.get(`/events/${id}/ranking/final`),
  getStartOrder: (id, catId) => api.get(`/events/${id}/categories/${catId}/startorder/final`),
  lockEvent: (id, locked) => api.put(`/events/${id}/lock`, { locked }),
  getDns: (id, round) => api.get(`/events/${id}/dns`, { params: { round } }),
  markDns: (id, data) => api.post(`/events/${id}/dns`, data),
  cancelDns: (id, data) => api.delete(`/events/${id}/dns`, { data }),
  exportCSV: (id, round, categoryId, type) => api.get(`/events/${id}/export/${round}`, { params: { category_id: categoryId, type }, responseType: 'blob' }),
  getZones: (id) => api.get(`/events/${id}/zones`),
  createZone: (id, data) => api.post(`/events/${id}/zones`, data),
  updateZone: (id, zoneId, data) => api.put(`/events/${id}/zones/${zoneId}`, data),
  deleteZone: (id, zoneId) => api.delete(`/events/${id}/zones/${zoneId}`),
  getRoutes: (id, params) => api.get(`/events/${id}/routes`, { params }),
  createRoute: (id, data) => api.post(`/events/${id}/routes`, data),
  updateRoute: (id, routeId, data) => api.put(`/events/${id}/routes/${routeId}`, data),
  deleteRoute: (id, routeId) => api.delete(`/events/${id}/routes/${routeId}`),
  getCategoryRoutes: (id, catId) => api.get(`/events/${id}/categories/${catId}/routes`),
  saveCategoryRoutes: (id, catId, route_ids) => api.post(`/events/${id}/categories/${catId}/routes`, { route_ids }),
  getJudgeZones: (id) => api.get(`/events/${id}/judge-zones`),
  saveJudgeZones: (id, data) => api.post(`/events/${id}/judge-zones`, data),
  getMyZones: (id) => api.get(`/events/${id}/my-zones`),
  bulkImportRoutes: (id, rows) => api.post(`/events/${id}/routes/bulk`, { rows }),
  clearAllZones: (id) => api.delete(`/events/${id}/zones`),
  toggleGuaranteed: (id, athId) => api.put(`/events/${id}/athletes/${athId}/guaranteed`, {}),
};

const publicApi = axios.create({
  baseURL: '/api/public',
  headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
});

export const publicAPI = {
  getEvent: (id) => publicApi.get(`/events/${id}`),
  getCategories: (id) => publicApi.get(`/events/${id}/categories`),
  getSmashRanking: (id) => publicApi.get(`/events/${id}/ranking/smash`),
  getFinalRanking: (id) => publicApi.get(`/events/${id}/ranking/final`),
  getAthletes: (id) => publicApi.get(`/events/${id}/athletes`),
  getAthleteScores: (id, athleteId) => publicApi.get(`/events/${id}/athlete-scores`, { params: { athlete_id: athleteId } }),
};

export const usersAPI = {
  list: () => api.get('/users'),
  create: (data) => api.post('/users', data),
  delete: (id) => api.delete(`/users/${id}`),
  resetPassword: (id, password) => api.put(`/users/${id}/password`, { password }),
  toggleActive: (id, active) => api.put(`/users/${id}/active`, { active }),
  updateEvents: (id, event_ids) => api.put(`/users/${id}/events`, { event_ids }),
  changeMyPassword: (currentPassword, newPassword) => api.put('/users/self/change-password', { currentPassword, newPassword }),
  listJudges: () => api.get('/users/judges'),
  createJudge: (data) => api.post('/users/judges', data),
  renameJudge: (id, username) => api.put(`/users/judges/${id}/username`, { username }),
  setJudgePassword: (id, password) => api.put(`/users/judges/${id}/password`, { password }),
  toggleJudgeActive: (id, active) => api.put(`/users/judges/${id}/active`, { active }),
  deleteJudge: (id) => api.delete(`/users/judges/${id}`),
};
