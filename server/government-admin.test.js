"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { parsePage, buildComplaintFilter, complaintSort, validateComplaintUpdate } = require("./government-admin");

test("complaint filters escape search text and validate status, priority, and dates", () => {
  const result = buildComplaintFilter({ q: "ref.*", status: "SUBMITTED", priority: "HIGH", district: "Kandy", from: "2025-01-01", to: "2025-02-01" });
  assert.equal(result.filter.$or[0].complaintId.$regex, "ref\\.\\*");
  assert.equal(result.filter.status, "SUBMITTED");
  assert.equal(buildComplaintFilter({ status: "OPEN" }).error, "status is not supported");
  assert.equal(buildComplaintFilter({ priority: "CRITICAL" }).error, "priority is not supported");
  assert.equal(buildComplaintFilter({ from: "invalid" }).error, "from must be a valid date");
  assert.equal(buildComplaintFilter({ from: "2025-02-02", to: "2025-02-01" }).error, "from must be on or before to");
});

test("complaint page and sort are bounded and whitelisted", () => {
  assert.deepEqual(parsePage({ page: "2", pageSize: "25" }), { page: 2, pageSize: 25 });
  assert.match(parsePage({ pageSize: "500" }).error, /pageSize/);
  assert.deepEqual(complaintSort({ sortBy: "priority", sortOrder: "asc" }), { sort: { priority: 1, _id: 1 } });
  assert.match(complaintSort({ sortBy: "citizenEmail" }).error, /sortBy/);
  assert.match(complaintSort({ sortOrder: "sideways" }).error, /sortOrder/);
});

test("complaint update requires resolution and rejection details", () => {
  assert.match(validateComplaintUpdate({ status: "RESOLVED" }).error, /Resolution details/);
  assert.match(validateComplaintUpdate({ status: "REJECTED" }).error, /rejection reason/);
  assert.deepEqual(validateComplaintUpdate({ status: "RESOLVED", resolutionDetails: "Road repaired" }).update, {
    status: "RESOLVED", resolutionDetails: "Road repaired",
  });
  assert.match(validateComplaintUpdate({ status: "UNKNOWN" }).error, /status/);
});
