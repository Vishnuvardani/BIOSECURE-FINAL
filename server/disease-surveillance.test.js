"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isVerifiedVeterinarian,
  isGovernmentOfficer,
  hasValidCoordinates,
  distanceKm,
  buildSurveillanceMatch,
  getSurveillancePage,
  getSurveillanceStatusTransition,
  paginateDiseaseReports,
  buildMonthlyDiseaseTrends,
} = require("./disease-surveillance");

test("only veterinarian accounts with an explicit verified marker qualify", () => {
  assert.equal(isVerifiedVeterinarian({ role: "Veterinarian", verificationStatus: "VERIFIED" }), true);
  assert.equal(isVerifiedVeterinarian({ role: "Veterinarian", isVerified: true }), true);
  assert.equal(isVerifiedVeterinarian({ role: "Veterinarian", status: "Active" }), false);
  assert.equal(isVerifiedVeterinarian({ role: "Farmer", isVerified: true }), false);
  assert.equal(isVerifiedVeterinarian(null), false);
});

test("government authorization requires a Government Officer account", () => {
  assert.equal(isGovernmentOfficer({ role: "Government Officer" }), true);
  assert.equal(isGovernmentOfficer({ role: "Admin" }), false);
  assert.equal(isGovernmentOfficer(null), false);
});

test("coordinate checks accept zero but reject missing and out-of-range positions", () => {
  assert.equal(hasValidCoordinates(0, 0), true);
  assert.equal(hasValidCoordinates("-35.2", "149.1"), true);
  assert.equal(hasValidCoordinates(null, 0), false);
  assert.equal(hasValidCoordinates(91, 0), false);
  assert.equal(hasValidCoordinates(0, 181), false);
});

test("nearby farm distance uses recorded coordinates", () => {
  assert.equal(distanceKm(0, 0, 0, 0), 0);
  assert.ok(Math.abs(distanceKm(0, 0, 0, 1) - 111.19) < 0.2);
});

test("surveillance report filters escape user search input and reject invalid dates", () => {
  const filters = buildSurveillanceMatch({ q: "farm.*", species: "Pig", disease: "Flu", status: "UNDER REVIEW" });
  assert.equal(filters.match.$and.length, 4);
  assert.equal(filters.match.$and[0].$or[0].reportId.$regex, "farm\\.\\*");
  assert.equal(buildSurveillanceMatch({ species: "cattle" }).error, "species must be Pig or Poultry");
  assert.equal(buildSurveillanceMatch({ status: "UNKNOWN" }).error, "status is not a supported surveillance status");
  assert.equal(buildSurveillanceMatch({ from: "not-a-date" }).error, "from must be a valid date");
  assert.match(buildSurveillanceMatch({ from: "2025-02-02", to: "2025-02-01" }).error, /on or before/);
});

test("surveillance pagination validates bounds and sort fields", () => {
  assert.deepEqual(getSurveillancePage({ page: "2", pageSize: "25", sortBy: "farmName", sortOrder: "asc" }), {
    page: 2, pageSize: 25, sortBy: "farmName", sortOrder: 1,
  });
  assert.match(getSurveillancePage({ pageSize: "500" }).error, /pageSize/);
  assert.match(getSurveillancePage({ sortBy: "passwordHash" }).error, /sortBy/);
});

test("government case status transitions require valid workflow and rejection reason", () => {
  assert.equal(getSurveillanceStatusTransition("REPORTED", "CONFIRMED", "Government Officer").error, "Only a verified veterinarian may confirm a diagnosis");
  assert.match(getSurveillanceStatusTransition("REPORTED", "REJECTED", "Government Officer").error, /reason is required/);
  assert.deepEqual(getSurveillanceStatusTransition("REPORTED", "UNDER_REVIEW", "Government Officer"), { current: "REPORTED", next: "UNDER_REVIEW" });
  assert.match(getSurveillanceStatusTransition("RESOLVED", "MONITORING", "Government Officer").error, /Cannot change status/);
});

test("report search, filters, and pagination are applied before page slicing", () => {
  const reports = [
    { reportId: "DR-1", suspectedDisease: "Foot and Mouth", district: "North", status: "REPORTED", riskLevel: "HIGH" },
    { reportId: "DR-2", suspectedDisease: "Avian flu", district: "South", status: "CONFIRMED", riskLevel: "MODERATE" },
    { reportId: "DR-3", suspectedDisease: "Avian flu", district: "South", status: "REPORTED", riskLevel: "HIGH" },
  ];
  const result = paginateDiseaseReports(reports, { q: "avian", status: "REPORTED", riskLevel: "HIGH", page: "1", pageSize: "1" });
  assert.deepEqual(result.items.map(report => report.reportId), ["DR-3"]);
  assert.equal(result.total, 1);
  assert.equal(result.pages, 1);
});

test("trends count persisted report dates only and omit undated records", () => {
  const trends = buildMonthlyDiseaseTrends([
    { reportedDate: "2025-02-01T00:00:00.000Z" },
    { createdAt: "2025-02-17T00:00:00.000Z" },
    { symptomStartDate: "2025-01-01" },
    { reportId: "undated" },
  ]);
  assert.deepEqual(trends.map(item => item.reports), [1, 2]);
  assert.deepEqual(trends.map(item => item.period), ["2025-01", "2025-02"]);
});
