/**
 * BioSecure Farm - API Service
 * Fetches data from the configured Express API -> MongoDB.
 */
const localApiBase = typeof window === "undefined" ? "http://localhost:5000/api" : "/api";
export const API_BASE = (import.meta.env.VITE_API_BASE_URL || localApiBase).replace(/\/+$/, "");
const BASE = API_BASE;

async function get(path) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return res.json();
}

function authenticatedHeaders() {
  const token = typeof window !== "undefined" ? window.localStorage.getItem("biosecure-access-token") : "";
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function getAuthenticated(path) {
  const res = await fetch(`${BASE}${path}`, { headers: authenticatedHeaders(), cache: "no-store" });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.error || `API error ${res.status}: ${path}`);
  }
  return res.json();
}

async function mutateAuthenticated(path, method, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...authenticatedHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.error || `API error ${res.status}: ${path}`);
  }
  return res.json();
}

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return res.json();
}

async function del(path) {
  const res = await fetch(`${BASE}${path}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return res.json();
}

// ── Auth ──────────────────────────────────────────────────────────────────
export const loginUser = (role) => post("/users/login", { role });

// ── Users ─────────────────────────────────────────────────────────────────
export const getUsers       = ()     => get("/users");
export const getUsersByRole = (role) => get(`/users?role=${encodeURIComponent(role)}`);
export const getUserById    = (id)   => get(`/users/${id}`);

// ── Farms ─────────────────────────────────────────────────────────────────
export const getFarms           = ()         => get("/farms");
export const getFarmById        = (id)       => get(`/farms/${id}`);
export const getFarmsByOwner    = (ownerId)  => get(`/farms?ownerId=${ownerId}`);
export const getFarmsByState    = (state)    => get(`/farms?state=${encodeURIComponent(state)}`);
export const getFarmsByDistrict = (district) => get(`/farms?district=${encodeURIComponent(district)}`);
export const createFarm          = (data) => post("/farms/create", data);
export const updateFarm          = (id, data) => put(`/farms/${id}`, data);
export const deleteFarm          = (id) => del(`/farms/${id}`);
export const getFarmSummary      = (id) => get(`/farms/${id}/summary`);
export const getFarmActivity     = (id) => get(`/farms/${id}/activity`);
export const addFarmZone          = (farmId, data) => post(`/farms/${encodeURIComponent(farmId)}/zones`, data);

// ── Veterinary appointment booking ────────────────────────────────────────
export const getAvailableVeterinarians = (farmId) => get(`/veterinarians/available?farmId=${encodeURIComponent(farmId)}`);
export const createAppointment = (data) => post("/appointments", data);
export const getAppointments = (params = {}) => {
  const query = new URLSearchParams(params).toString();
  return get(`/appointments${query ? `?${query}` : ""}`);
};
export const updateAppointmentStatus = (appointmentId, data) => put(`/appointments/${appointmentId}/status`, data);

// ── Livestock ─────────────────────────────────────────────────────────────
export const getLivestock         = ()       => get("/livestock");
export const getLivestockByFarm   = (farmId) => get(`/livestock?farmId=${farmId}`);
export const getLivestockByHealth = (status) => get(`/livestock?healthStatus=${encodeURIComponent(status)}`);
export const createLivestock      = (data) => post("/livestock", data);
export const updateLivestock      = (id, data) => put(`/livestock/${id}`, data);
export const deleteLivestock      = (id) => del(`/livestock/${id}`);

// ── Vaccinations ──────────────────────────────────────────────────────────
export const getVaccinations        = ()       => get("/vaccinations");
export const getVaccinationsByFarm  = (farmId) => get(`/vaccinations?farmId=${farmId}`);
export const getVaccinationsByStatus= (status) => get(`/vaccinations?status=${encodeURIComponent(status)}`);
export const createVaccination      = (data) => post("/vaccinations", data);
export const updateVaccination      = (id, data) => put(`/vaccinations/${id}`, data);
export const deleteVaccination      = (id) => del(`/vaccinations/${id}`);

// ── Farm operations ──────────────────────────────────────────────────────
export const getHealthRecordsByFarm = (farmId) => get(`/health-records?farmId=${encodeURIComponent(farmId)}`);
export const createHealthRecord = (data) => post("/health-records", data);
export const updateHealthRecord = (id, data) => put(`/health-records/${id}`, data);
export const getInventoryByFarm = (farmId) => get(`/inventory?farmId=${encodeURIComponent(farmId)}`);
export const createInventoryItem = (data) => post("/inventory", data);
export const updateInventoryItem = (id, data) => put(`/inventory/${id}`, data);
export const getFarmActivitiesByFarm = (farmId) => get(`/farm-activities?farmId=${encodeURIComponent(farmId)}`);
export const createFarmActivity = (data) => post("/farm-activities", data);

// ── Diseases ──────────────────────────────────────────────────────────────
export const getDiseases           = ()         => get("/diseases");
export const getDiseasesByDistrict = (district) => get(`/diseases?district=${encodeURIComponent(district)}`);
export const getDiseasesBySeverity = (severity) => get(`/diseases?severity=${encodeURIComponent(severity)}`);

// ── Biosecurity ───────────────────────────────────────────────────────────
export const getBiosecurity       = ()       => get("/biosecurity");
export const getBiosecurityByFarm = (farmId) => get(`/biosecurity?farmId=${farmId}`);
export const getBiosecurityByRisk = (risk)   => get(`/biosecurity?riskLevel=${encodeURIComponent(risk)}`);

// ── Vet Reports ───────────────────────────────────────────────────────────
export const getVetReports      = ()       => get("/veterinarian_reports");
export const getVetReportsByFarm= (farmId) => get(`/veterinarian_reports?farmId=${farmId}`);

// ── Government Alerts ─────────────────────────────────────────────────────
export const getAlerts           = ()         => get("/government_alerts");
export const getAlertsByDistrict = (district) => get(`/government_alerts?district=${encodeURIComponent(district)}`);
export const getAlertsByState    = (state)    => get(`/government_alerts?state=${encodeURIComponent(state)}`);

// ── GIS Locations ─────────────────────────────────────────────────────────
export const getGISLocations = ()       => get("/gis_locations");
export const getGISByFarm    = (farmId) => get(`/gis_locations?farmId=${farmId}`);
export const getGISHotspots  = ()       => get("/gis_locations?hotspotStatus=Active");

// ── Notifications ─────────────────────────────────────────────────────────
export const getNotifications       = ()       => get("/notifications");
export const getNotificationsByUser = (userId) => get(`/notifications?userId=${userId}`);
export const getUnreadNotifications = (userId) => get(`/notifications?userId=${userId}&isRead=false`);

// ── Analytics ─────────────────────────────────────────────────────────────
export const getAnalytics        = ()  => get("/analytics");
export const getAnalyticsSummary = ()  => get("/analytics/summary");

// ── Biosecurity Assessments ───────────────────────────────────────────────
export const submitBiosecurityAssessment = (data) => post("/biosecurity/assessment", data);
export const getBiosecurityByFarmId      = (farmId) => get(`/biosecurity/farm/${farmId}`);
export const getBiosecurityHistory       = (farmId) => get(`/biosecurity/history/${farmId}`);

// ── Disease Reports ───────────────────────────────────────────────────────
export const submitDiseaseReport    = (data)     => post("/disease/report", data);
export const getDiseaseReports      = ()         => get("/disease/reports");
export const getDiseaseReportById   = (id)       => get(`/disease/${id}`);
export const updateDiseaseStatus    = (id, data) => put(`/disease/${id}/status`, data);
export const updateDiseaseInspection= (id, data) => put(`/disease/${id}/inspection`, data);
export const confirmDiseaseDiagnosis = (id, data) => put(`/disease/${id}/diagnosis`, data);

// ── GIS Outbreak ──────────────────────────────────────────────────────────
export const getGISFarms     = ()   => get("/gis/farms");
export const getGISOutbreaks = ()   => get("/gis/outbreaks");
export const getNearbyFarms  = (id) => get(`/gis/nearby-farms/${id}`);

// ── Notifications (new) ───────────────────────────────────────────────────
export const getMyNotifications  = ()   => get("/notifications");
export const markNotificationRead= (id) => put(`/notifications/${id}/read`, {});
export const sendNotification    = (data) => post("/notifications/send", data);

// ── Government ────────────────────────────────────────────────────────────
export const getGovDashboard = ()     => getAuthenticated("/government/dashboard");
export const getGovOutbreaks = ()     => getAuthenticated("/government/outbreaks");
const governmentAdminQuery = (params = {}) => new URLSearchParams(params).toString();
export const getGovernmentAdminDashboard = params => getAuthenticated(`/government/admin/dashboard?${governmentAdminQuery(params)}`);
export const getGovernmentComplaints = params => getAuthenticated(`/government/admin/complaints?${governmentAdminQuery(params)}`);
export const getGovernmentComplaint = (id, params) => getAuthenticated(`/government/admin/complaints/${encodeURIComponent(id)}?${governmentAdminQuery(params)}`);
export const updateGovernmentComplaint = (id, body, params) => mutateAuthenticated(`/government/admin/complaints/${encodeURIComponent(id)}?${governmentAdminQuery(params)}`, "PATCH", body);
export const getGovernmentSchemes = params => getAuthenticated(`/government/admin/schemes?${governmentAdminQuery(params)}`);
export const createGovernmentScheme = (body, params) => mutateAuthenticated(`/government/admin/schemes?${governmentAdminQuery(params)}`, "POST", body);
export const updateGovernmentScheme = (id, body, params) => mutateAuthenticated(`/government/admin/schemes/${encodeURIComponent(id)}?${governmentAdminQuery(params)}`, "PATCH", body);
export const getGovernmentApplications = params => getAuthenticated(`/government/admin/applications?${governmentAdminQuery(params)}`);
export const reviewGovernmentApplication = (id, body, params) => mutateAuthenticated(`/government/admin/applications/${encodeURIComponent(id)}?${governmentAdminQuery(params)}`, "PATCH", body);
export const getGovernmentDepartments = params => getAuthenticated(`/government/admin/departments?${governmentAdminQuery(params)}`);
export const createGovernmentDepartment = (body, params) => mutateAuthenticated(`/government/admin/departments?${governmentAdminQuery(params)}`, "POST", body);
export const updateGovernmentDepartment = (id, body, params) => mutateAuthenticated(`/government/admin/departments/${encodeURIComponent(id)}?${governmentAdminQuery(params)}`, "PATCH", body);
export const getGovernmentOfficers = params => getAuthenticated(`/government/admin/officers?${governmentAdminQuery(params)}`);
export const updateGovernmentOfficer = (id, body) => mutateAuthenticated(`/government/admin/officers/${encodeURIComponent(id)}`, "PATCH", body);
export const createGovernmentOfficer = body => mutateAuthenticated("/government/admin/officers", "POST", body);
export const getGovernmentAlerts = params => getAuthenticated(`/government/admin/alerts?${governmentAdminQuery(params)}`);
export const issueAdvisory   = (data) => post("/government/advisory", data);

async function put(path, body) {
  const token = typeof window !== "undefined" ? window.localStorage.getItem("biosecure-access-token") : "";
  const res = await fetch(`${BASE}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return res.json();
}
