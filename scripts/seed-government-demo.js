"use strict";

const { MongoClient } = require("mongodb");

if (!process.argv.includes("--confirm")) {
  console.error("No data changed. Re-run with --confirm to add synthetic records to a local MongoDB database.");
  process.exit(2);
}
if (process.env.NODE_ENV === "production") {
  console.error("Refusing to seed demo records when NODE_ENV=production.");
  process.exit(2);
}

const uri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017";
const dbName = process.env.DB_NAME || "biosecure_db";
let hostname;
try { hostname = new URL(uri).hostname; } catch {
  console.error("MONGO_URI must be a valid local MongoDB URL.");
  process.exit(2);
}
if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname)) {
  console.error("Refusing to seed a non-local MongoDB server.");
  process.exit(2);
}

const departments = [
  ["DEP-DEMO-HEALTH", "Public Health"],
  ["DEP-DEMO-ROADS", "Roads and Transport"],
  ["DEP-DEMO-WELFARE", "Social Welfare"],
  ["DEP-DEMO-WATER", "Water Services"],
];
const schemes = [
  ["SCH-DEMO-01", "Community Health Support", "Support for eligible households seeking access to community health services.", "Public Health"],
  ["SCH-DEMO-02", "Rural Roads Improvement Grant", "Funding support for approved rural access-road maintenance projects.", "Roads and Transport"],
  ["SCH-DEMO-03", "Family Nutrition Assistance", "Nutrition assistance for qualifying families.", "Social Welfare"],
  ["SCH-DEMO-04", "Safe Water Connection", "Assistance for eligible households to connect to a safe water supply.", "Water Services"],
  ["SCH-DEMO-05", "Small Community Facility Grant", "Small grants for verified community facility improvements.", "Social Welfare"],
  ["SCH-DEMO-06", "Rural Clinic Access Support", "Transport assistance for eligible rural clinic visits.", "Public Health"],
];
const complaintSubjects = [
  ["Public lighting outage", "Public Health", "Kandy", "HIGH"],
  ["Road surface repair request", "Roads and Transport", "Matale", "MEDIUM"],
  ["Water supply interruption", "Water Services", "Galle", "URGENT"],
  ["Community clinic accessibility", "Public Health", "Jaffna", "MEDIUM"],
  ["Drain maintenance request", "Water Services", "Kandy", "LOW"],
  ["Public facility repair", "Social Welfare", "Matale", "HIGH"],
];
const statuses = ["SUBMITTED", "UNDER_REVIEW", "ASSIGNED", "IN_PROGRESS", "RESOLVED", "REJECTED"];
const districts = ["Kandy", "Matale", "Galle", "Jaffna", "Kurunegala", "Badulla"];
const now = Date.now();
const dateDaysAgo = (days) => new Date(now - days * 86_400_000);

async function upsertSeed(collection, idField, documents) {
  if (documents.length === 0) return;
  await collection.bulkWrite(documents.map(document => ({
    updateOne: { filter: { [idField]: document[idField] }, update: { $setOnInsert: document }, upsert: true },
  })));
}

async function main() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const database = client.db(dbName);
    const departmentDocs = departments.map(([departmentId, name]) => ({
      departmentId, name, active: true, isSynthetic: true, createdAt: dateDaysAgo(90),
    }));
    const schemeDocs = schemes.map(([schemeId, name, description, departmentName], index) => ({
      schemeId, name, description, departmentName,
      eligibility: "Synthetic demo eligibility criteria. Verify against official programme rules.",
      requiredDocuments: ["Proof of residence (demo)", "Eligibility declaration (demo)"],
      openingAt: dateDaysAgo(45), closingAt: new Date(now + (index % 2 ? 60 : 30) * 86_400_000),
      active: index !== 5, isSynthetic: true, createdAt: dateDaysAgo(70), updatedAt: dateDaysAgo(2),
    }));
    const citizenDocs = Array.from({ length: 60 }, (_, index) => ({
      citizenId: `CIT-DEMO-${String(index + 1).padStart(3, "0")}`,
      displayName: `Demo Citizen ${String(index + 1).padStart(3, "0")}`,
      district: districts[index % districts.length],
      isSynthetic: true, createdAt: dateDaysAgo(30 + index * 3),
    }));
    const complaintDocs = Array.from({ length: 42 }, (_, index) => {
      const [subject, departmentName, district, priority] = complaintSubjects[index % complaintSubjects.length];
      const status = statuses[index % statuses.length];
      const submittedAt = dateDaysAgo((index * 3) % 120);
      return {
        complaintId: `CMP-DEMO-${String(index + 1).padStart(4, "0")}`,
        citizenReference: `CIT-DEMO-${String((index % 60) + 1).padStart(3, "0")}`,
        subject: `${subject} · sample ${index + 1}`,
        description: `Synthetic development-only complaint ${index + 1}. This example is fictional and does not represent a real citizen or service request.`,
        departmentId: departments.find(([id, name]) => name === departmentName)?.[0],
        departmentName, district, priority, status,
        submittedAt, dueAt: dateDaysAgo((index * 3) % 120 - 14),
        ...(status === "RESOLVED" ? { resolvedAt: dateDaysAgo(2), resolutionDetails: "Synthetic example resolution for interface testing." } : {}),
        ...(status === "REJECTED" ? { rejectionReason: "Synthetic example rejection reason for workflow testing." } : {}),
        ...(status === "ASSIGNED" || status === "IN_PROGRESS" ? { assignedOfficerId: "OFF-DEMO-01", assignedOfficerName: "Demo Officer 01" } : {}),
        internalNotes: [], auditHistory: [], isSynthetic: true, createdAt: submittedAt, updatedAt: submittedAt,
      };
    });
    const applicationDocs = Array.from({ length: 50 }, (_, index) => ({
      applicationId: `APP-DEMO-${String(index + 1).padStart(4, "0")}`,
      schemeId: schemes[index % schemes.length][0],
      schemeName: schemes[index % schemes.length][1],
      citizenReference: `CIT-DEMO-${String((index % 60) + 1).padStart(3, "0")}`,
      district: districts[index % districts.length],
      status: ["PENDING", "APPROVED", "REJECTED"][index % 3],
      submittedAt: dateDaysAgo((index * 2) % 60),
      isSynthetic: true,
    }));
    const officerDocs = Array.from({ length: 4 }, (_, index) => ({
      userId: `OFF-DEMO-0${index + 1}`,
      name: `Demo Officer 0${index + 1}`,
      role: "Government Officer",
      departmentId: departments[index % departments.length][0],
      departmentName: departments[index % departments.length][1],
      isActive: true, isSynthetic: true,
    }));

    await Promise.all([
      upsertSeed(database.collection("government_departments"), "departmentId", departmentDocs),
      upsertSeed(database.collection("government_schemes"), "schemeId", schemeDocs),
      upsertSeed(database.collection("government_citizens"), "citizenId", citizenDocs),
      upsertSeed(database.collection("government_complaints"), "complaintId", complaintDocs),
      upsertSeed(database.collection("government_scheme_applications"), "applicationId", applicationDocs),
      upsertSeed(database.collection("government_demo_officers"), "userId", officerDocs),
    ]);
    await database.collection("users").deleteMany({
      userId: { $in: officerDocs.map(officer => officer.userId) },
      isSynthetic: true,
      email: { $regex: /^demo-officer-0[1-4]@example\.test$/ },
    });
    console.log(`Added synthetic government demo records to local database "${dbName}".`);
    console.log("Created: 60 citizens, 42 complaints, 6 schemes, 50 applications, 4 departments, and 4 demo-only officer entries.");
    console.log("The dashboard displays these records only when Development demo data is enabled.");
  } finally {
    await client.close();
  }
}

main().catch(error => {
  console.error(`[Seed] ${error.message}`);
  process.exitCode = 1;
});
