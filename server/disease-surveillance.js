"use strict";

const SURVEILLANCE_STATUSES = [
  "REPORTED",
  "UNDER_REVIEW",
  "SUSPECTED",
  "AWAITING_LABORATORY_CONFIRMATION",
  "CONFIRMED",
  "MONITORING",
  "RESOLVED",
  "REJECTED",
];

const STATUS_ALIASES = {
  VETERINARY_INSPECTION: "UNDER_REVIEW",
  RULED_OUT: "REJECTED",
  "AWAITING LABORATORY CONFIRMATION": "AWAITING_LABORATORY_CONFIRMATION",
  "UNDER REVIEW": "UNDER_REVIEW",
};

function normalizeSurveillanceStatus(status) {
  const normalized = String(status || "REPORTED").trim().toUpperCase().replace(/[-\s]+/g, "_");
  return STATUS_ALIASES[normalized] || normalized;
}

function isVerifiedVeterinarian(user) {
  if (!user || user.role !== "Veterinarian") return false;
  return user.isVerified === true || user.verified === true ||
    String(user.verificationStatus || "").toLowerCase() === "verified" ||
    String(user.professionalVerification?.status || "").toLowerCase() === "verified";
}

function isGovernmentOfficer(user) {
  return Boolean(user && user.role === "Government Officer");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseDateRange(query = {}) {
  const start = query.from ? new Date(query.from) : null;
  const end = query.to ? new Date(query.to) : null;
  if (start && Number.isNaN(start.getTime())) return { error: "from must be a valid date" };
  if (end && Number.isNaN(end.getTime())) return { error: "to must be a valid date" };
  if (start && end && start > end) return { error: "from must be on or before to" };
  if (end) end.setHours(23, 59, 59, 999);
  return { start, end };
}

function buildSurveillanceMatch(query = {}) {
  const conditions = [];
  const search = String(query.q || "").trim().slice(0, 120);
  if (search) {
    const expression = { $regex: escapeRegExp(search), $options: "i" };
    conditions.push({ $or: [
      { reportId: expression },
      { farmId: expression },
      { farmName: expression },
      { suspectedDisease: expression },
      { diseaseName: expression },
      { district: expression },
    ] });
  }
  if (query.species) {
    const species = String(query.species).trim();
    if (!["pig", "poultry"].includes(species.toLowerCase())) return { error: "species must be Pig or Poultry" };
    conditions.push({ animalType: { $regex: `^${escapeRegExp(species)}$`, $options: "i" } });
  }
  if (query.disease) {
    const disease = String(query.disease).trim().slice(0, 120);
    conditions.push({ $or: [
      { suspectedDisease: { $regex: escapeRegExp(disease), $options: "i" } },
      { diseaseName: { $regex: escapeRegExp(disease), $options: "i" } },
    ] });
  }
  if (query.district) {
    const district = String(query.district).trim().slice(0, 120);
    conditions.push({ district: { $regex: escapeRegExp(district), $options: "i" } });
  }
  if (query.status) {
    const status = normalizeSurveillanceStatus(query.status);
    if (!SURVEILLANCE_STATUSES.includes(status)) return { error: "status is not a supported surveillance status" };
    conditions.push({ canonicalStatus: status });
  }
  if (query.from || query.to) {
    const range = parseDateRange(query);
    if (range.error) return range;
    const dates = {};
    if (range.start) dates.$gte = range.start;
    if (range.end) dates.$lte = range.end;
    conditions.push({ reportedAt: dates });
  }
  return { match: conditions.length ? { $and: conditions } : {} };
}

function getSurveillancePage(query = {}) {
  const page = Number(query.page || 1);
  const pageSize = Number(query.pageSize || 10);
  if (!Number.isInteger(page) || page < 1) return { error: "page must be a positive integer" };
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) return { error: "pageSize must be between 1 and 100" };
  const sortFields = new Set(["reportedDate", "farmName", "suspectedDisease", "status", "animalType", "district"]);
  const sortBy = query.sortBy || "reportedDate";
  if (!sortFields.has(sortBy)) return { error: "sortBy is not supported" };
  const sortOrder = query.sortOrder === undefined ? -1 : query.sortOrder === "asc" ? 1 : query.sortOrder === "desc" ? -1 : 0;
  if (!sortOrder) return { error: "sortOrder must be asc or desc" };
  return { page, pageSize, sortBy, sortOrder };
}

function getSurveillanceStatusTransition(currentStatus, nextStatus, userRole, reason) {
  const current = normalizeSurveillanceStatus(currentStatus);
  const next = normalizeSurveillanceStatus(nextStatus);
  if (!SURVEILLANCE_STATUSES.includes(next)) return { error: "Invalid disease surveillance status" };
  if (next === "CONFIRMED") return { error: "Only a verified veterinarian may confirm a diagnosis" };
  if (next === "REJECTED" && !String(reason || "").trim()) return { error: "A reason is required when rejecting a report" };
  if (!["Government Officer", "Veterinarian"].includes(userRole)) return { error: "This action is not authorized" };
  if (userRole === "Veterinarian" && !["UNDER_REVIEW", "SUSPECTED", "AWAITING_LABORATORY_CONFIRMATION", "MONITORING", "RESOLVED"].includes(next)) {
    return { error: "Veterinarians must use the diagnosis endpoint to confirm a report" };
  }
  const allowed = {
    REPORTED: ["UNDER_REVIEW", "SUSPECTED", "AWAITING_LABORATORY_CONFIRMATION", "REJECTED"],
    UNDER_REVIEW: ["SUSPECTED", "AWAITING_LABORATORY_CONFIRMATION", "MONITORING", "REJECTED"],
    SUSPECTED: ["UNDER_REVIEW", "AWAITING_LABORATORY_CONFIRMATION", "MONITORING", "REJECTED"],
    AWAITING_LABORATORY_CONFIRMATION: ["UNDER_REVIEW", "SUSPECTED", "MONITORING", "REJECTED"],
    CONFIRMED: ["MONITORING", "RESOLVED"],
    MONITORING: ["AWAITING_LABORATORY_CONFIRMATION", "RESOLVED", "REJECTED"],
    RESOLVED: [],
    REJECTED: [],
  };
  if (current !== next && !allowed[current]?.includes(next)) return { error: `Cannot change status from ${current} to ${next}` };
  return { current, next };
}

function hasValidCoordinates(latitude, longitude) {
  if (latitude === undefined || latitude === null || latitude === "" ||
      longitude === undefined || longitude === null || longitude === "") return false;
  const lat = Number(latitude), lon = Number(longitude);
  return Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

function distanceKm(firstLatitude, firstLongitude, secondLatitude, secondLongitude) {
  const toRadians = degrees => degrees * Math.PI / 180;
  const lat1 = toRadians(Number(firstLatitude));
  const lat2 = toRadians(Number(secondLatitude));
  const deltaLat = lat2 - lat1;
  const deltaLon = toRadians(Number(secondLongitude) - Number(firstLongitude));
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function paginateDiseaseReports(reports, query = {}) {
  const q = String(query.q || "").trim().toLowerCase();
  const status = String(query.status || "").trim().toUpperCase();
  const risk = String(query.riskLevel || "").trim().toUpperCase();
  const animalType = String(query.animalType || "").trim().toLowerCase();
  const district = String(query.district || "").trim().toLowerCase();
  const filtered = reports.filter(report => {
    if (status && String(report.status || "").toUpperCase() !== status) return false;
    if (risk && String(report.riskLevel || "").toUpperCase() !== risk) return false;
    if (animalType && !String(report.animalType || "").toLowerCase().includes(animalType)) return false;
    if (district && !String(report.district || "").toLowerCase().includes(district)) return false;
    return !q || [report.reportId, report.suspectedDisease, report.diseaseName, report.farmName, report.district, report.animalType]
      .some(value => String(value || "").toLowerCase().includes(q));
  });
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(query.pageSize, 10) || 10));
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(pages, Math.max(1, Number.parseInt(query.page, 10) || 1));
  return { items: filtered.slice((page - 1) * pageSize, page * pageSize), total: filtered.length, page, pageSize, pages };
}

function buildMonthlyDiseaseTrends(reports) {
  const counts = new Map();
  reports.forEach(report => {
    const value = report.reportedDate || report.createdAt || report.symptomStartDate;
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return;
    const period = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    counts.set(period, (counts.get(period) || 0) + 1);
  });
  return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([period, reports]) => ({ period, reports }));
}

module.exports = {
  SURVEILLANCE_STATUSES,
  normalizeSurveillanceStatus,
  isVerifiedVeterinarian,
  isGovernmentOfficer,
  hasValidCoordinates,
  distanceKm,
  parseDateRange,
  buildSurveillanceMatch,
  getSurveillancePage,
  getSurveillanceStatusTransition,
  paginateDiseaseReports,
  buildMonthlyDiseaseTrends,
};
