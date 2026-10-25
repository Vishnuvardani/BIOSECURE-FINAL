"use strict";

const COMPLAINT_STATUSES = ["SUBMITTED", "UNDER_REVIEW", "ASSIGNED", "IN_PROGRESS", "RESOLVED", "REJECTED"];
const COMPLAINT_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parsePage(query = {}) {
  const page = Number(query.page || 1);
  const pageSize = Number(query.pageSize || 10);
  if (!Number.isInteger(page) || page < 1) return { error: "page must be a positive integer" };
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) return { error: "pageSize must be between 1 and 100" };
  return { page, pageSize };
}

function buildComplaintFilter(query = {}) {
  const filter = {};
  const search = String(query.q || "").trim().slice(0, 120);
  if (search) {
    const regex = { $regex: escapeRegExp(search), $options: "i" };
    filter.$or = [{ complaintId: regex }, { subject: regex }, { citizenReference: regex }];
  }
  for (const key of ["departmentId", "district", "status", "priority"]) {
    if (query[key]) {
      const value = String(query[key]).trim();
      if (key === "status" && !COMPLAINT_STATUSES.includes(value)) return { error: "status is not supported" };
      if (key === "priority" && !COMPLAINT_PRIORITIES.includes(value)) return { error: "priority is not supported" };
      filter[key] = value;
    }
  }
  if (query.from || query.to) {
    const dates = {};
    if (query.from) {
      const from = new Date(query.from);
      if (Number.isNaN(from.getTime())) return { error: "from must be a valid date" };
      dates.$gte = from;
    }
    if (query.to) {
      const to = new Date(query.to);
      if (Number.isNaN(to.getTime())) return { error: "to must be a valid date" };
      to.setHours(23, 59, 59, 999);
      dates.$lte = to;
    }
    if (dates.$gte && dates.$lte && dates.$gte > dates.$lte) return { error: "from must be on or before to" };
    filter.submittedAt = dates;
  }
  return { filter };
}

function complaintSort(query = {}) {
  const allowed = ["submittedAt", "dueAt", "priority", "status", "subject"];
  const sortBy = String(query.sortBy || "submittedAt");
  if (!allowed.includes(sortBy)) return { error: "sortBy is not supported" };
  const sortOrder = String(query.sortOrder || "desc").toLowerCase();
  if (!["asc", "desc"].includes(sortOrder)) return { error: "sortOrder must be asc or desc" };
  return { sort: { [sortBy]: sortOrder === "asc" ? 1 : -1, _id: 1 } };
}

function validateComplaintUpdate(body = {}) {
  const update = {};
  if (body.status !== undefined) {
    if (!COMPLAINT_STATUSES.includes(body.status)) return { error: "status is not supported" };
    update.status = body.status;
  }
  for (const field of ["assignedOfficerId", "assignedOfficerName", "resolutionDetails"]) {
    if (body[field] !== undefined) {
      if (typeof body[field] !== "string" || body[field].length > 2000) return { error: `${field} must be text under 2000 characters` };
      update[field] = body[field].trim();
    }
  }
  if (body.internalNote !== undefined) {
    if (typeof body.internalNote !== "string" || body.internalNote.trim().length < 1 || body.internalNote.length > 2000) {
      return { error: "internalNote must contain 1 to 2000 characters" };
    }
  }
  if (update.status === "REJECTED" && !String(body.rejectionReason || "").trim()) return { error: "A rejection reason is required" };
  if (update.status === "RESOLVED" && !String(body.resolutionDetails || "").trim()) return { error: "Resolution details are required" };
  return { update };
}

module.exports = { COMPLAINT_STATUSES, COMPLAINT_PRIORITIES, parsePage, buildComplaintFilter, complaintSort, validateComplaintUpdate };
