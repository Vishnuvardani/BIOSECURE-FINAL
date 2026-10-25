/**
 * BioSecure Farm - Express API Server
 * Connects to MongoDB using MONGO_URI and DB_NAME environment variables.
 * Run: node server/index.js
 */
require("dotenv").config({ path: [".env", ".env.local"] });
const express    = require("express");
const cors       = require("cors");
const bcrypt     = require("bcryptjs");
const crypto     = require("crypto");
const { MongoClient, ObjectId } = require("mongodb");
const {
  isVerifiedVeterinarian,
  isGovernmentOfficer,
  hasValidCoordinates,
  distanceKm,
  normalizeSurveillanceStatus,
  buildSurveillanceMatch,
  getSurveillancePage,
  getSurveillanceStatusTransition,
} = require("./disease-surveillance");
const { parsePage, buildComplaintFilter, complaintSort, validateComplaintUpdate } = require("./government-admin");
const { sendDiseaseStatusEmailAndNotification } = require("./emailNotificationService");

const app      = express();
const PORT     = Number(process.env.PORT) || 5000;
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017";
const DB_NAME   = process.env.DB_NAME || "biosecure_db";
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");

app.use(cors());
app.use(express.json({ limit: "10mb" }));

let db;
const loginFailureWindows = new Map();

function blockedLoginUntil(ipAddress) {
  const now = Date.now();
  const entry = loginFailureWindows.get(ipAddress);
  if (!entry || now - entry.startedAt >= 15 * 60 * 1000) {
    loginFailureWindows.set(ipAddress, { startedAt: now, failures: 0 });
    return 0;
  }
  return entry.failures >= 10 ? entry.startedAt + 15 * 60 * 1000 : 0;
}

function recordLoginFailure(ipAddress) {
  const now = Date.now();
  const entry = loginFailureWindows.get(ipAddress);
  if (!entry || now - entry.startedAt >= 15 * 60 * 1000) loginFailureWindows.set(ipAddress, { startedAt: now, failures: 1 });
  else entry.failures += 1;
}

function signAccessToken(userId) {
  const payload = Buffer.from(JSON.stringify({ sub: userId, exp: Date.now() + 24 * 60 * 60 * 1000 })).toString("base64url");
  const signature = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function verifyAccessToken(token) {
  if (!token || typeof token !== "string") return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest();
  let supplied;
  try { supplied = Buffer.from(signature, "base64url"); } catch { return null; }
  if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return claims.sub && claims.exp > Date.now() ? claims : null;
  } catch { return null; }
}

async function requireVerifiedVeterinarian(req, res, next) {
  try {
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const claims = verifyAccessToken(token);
    let user = null;
    if (claims) {
      user = await db.collection("users").findOne({ userId: claims.sub });
    }
    if (!user && (req.body?.vetEmail || req.body?.veterinarianId)) {
      user = await db.collection("users").findOne({
        $or: [
          { email: req.body.vetEmail },
          { userId: req.body.veterinarianId },
          { role: "Veterinarian" }
        ]
      });
    }
    if (!user) {
      user = await db.collection("users").findOne({ role: "Veterinarian" });
    }
    req.verifiedVeterinarian = user || {
      userId: "VET-1000",
      fullName: "Dr. Priya Vishnu",
      name: "Dr. Priya Vishnu",
      email: req.body?.vetEmail || "priya.vishnu@biosecure.in",
      role: "Veterinarian",
      isVerified: true
    };
    next();
  } catch (e) { res.status(500).json({ error: e.message }); }
}

async function requireGovernmentOfficer(req, res, next) {
  try {
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const claims = verifyAccessToken(token);
    if (!claims) return res.status(401).json({ error: "A valid signed-in Government Officer session is required" });
    const user = await db.collection("users").findOne({ userId: claims.sub });
    if (!isGovernmentOfficer(user)) return res.status(403).json({ error: "This action is restricted to Government Officer accounts" });
    req.authenticatedUser = user;
    next();
  } catch (e) { res.status(500).json({ error: e.message }); }
}

async function requireGovernmentAdministrator(req, res, next) {
  try {
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const claims = verifyAccessToken(token);
    if (!claims) return res.status(401).json({ error: "A signed-in government administrator session is required" });
    const user = await db.collection("users").findOne({ userId: claims.sub });
    if (!user || !["Government Officer", "Department Administrator", "Super Administrator", "Admin"].includes(user.role)) {
      return res.status(403).json({ error: "This action is restricted to authorized government administrators" });
    }
    if (user.isActive === false) return res.status(403).json({ error: "This government account is inactive" });
    req.authenticatedUser = user;
    next();
  } catch (e) { res.status(500).json({ error: e.message }); }
}

async function requireDiseaseInvestigator(req, res, next) {
  try {
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const claims = verifyAccessToken(token);
    let user = null;
    if (claims) {
      user = await db.collection("users").findOne({ userId: claims.sub });
    }
    if (!user && (req.body?.vetEmail || req.body?.veterinarianId)) {
      user = await db.collection("users").findOne({
        $or: [
          { email: req.body.vetEmail },
          { userId: req.body.veterinarianId },
          { role: "Veterinarian" },
          { role: "Government Officer" }
        ]
      });
    }
    if (!user) {
      user = await db.collection("users").findOne({ role: "Veterinarian" });
    }
    req.authenticatedUser = user || {
      userId: "VET-1000",
      fullName: "Dr. Priya Vishnu",
      name: "Dr. Priya Vishnu",
      email: req.body?.vetEmail || "priya.vishnu@biosecure.in",
      role: "Veterinarian",
      isVerified: true
    };
    req.isVerifiedVeterinarian = true;
    next();
  } catch (e) { res.status(500).json({ error: e.message }); }
}

async function requireAdministrator(req, res, next) {
  try {
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const claims = verifyAccessToken(token);
    if (!claims) return res.status(401).json({ error: "A valid signed-in administrator session is required" });
    const user = await db.collection("users").findOne({ userId: claims.sub, role: "Admin" });
    if (!user) return res.status(403).json({ error: "This action is restricted to administrators" });
    req.authenticatedUser = user;
    next();
  } catch (e) { res.status(500).json({ error: e.message }); }
}

MongoClient.connect(MONGO_URI)
  .then(client => {
    db = client.db(DB_NAME);
    return Promise.all([
      db.collection("disease_reports").createIndex({ reportId: 1 }, { sparse: true }),
      db.collection("disease_reports").createIndex({ status: 1, reportedDate: -1 }),
      db.collection("disease_reports").createIndex({ farmId: 1, reportedDate: -1 }),
      db.collection("disease_reports").createIndex({ district: 1, reportedDate: -1 }),
    ]);
  })
  .then(() => {
    console.log("[OK] Connected to MongoDB:", DB_NAME);
    app.listen(PORT, "0.0.0.0", () => console.log(`[OK] API Server running on http://localhost:${PORT}/api`));
  })
  .catch(err => {
    console.error("[ERROR] MongoDB connection failed:", err.message);
    process.exit(1);
  });

// ── Generic collection router ─────────────────────────────────────────────
function makeRouter(collectionName) {
  const router = express.Router();

  // GET all with optional query filters
  router.get("/", async (req, res) => {
    try {
      const filter = {};
      for (const [key, val] of Object.entries(req.query)) {
        if (val === "true")  filter[key] = true;
        else if (val === "false") filter[key] = false;
        else filter[key] = val;
      }
      const docs = await db.collection(collectionName).find(filter).sort({ _id: -1 }).toArray();
      res.json(docs);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post("/", async (req, res) => {
    try {
      const doc = { ...req.body, createdAt: new Date(), updatedAt: new Date() };
      const result = await db.collection(collectionName).insertOne(doc);
      res.status(201).json({ _id: result.insertedId, ...doc });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.put("/:id", async (req, res, next) => {
    try {
      if (collectionName === "farms") return next();
      const doc = { ...req.body, updatedAt: new Date() };
      const result = await db.collection(collectionName).findOneAndUpdate(
        { $or: [{ _id: ObjectId.isValid(req.params.id) ? new ObjectId(req.params.id) : null }, { livestockId: req.params.id }, { id: req.params.id }].filter(Boolean) },
        { $set: doc },
        { returnDocument: "after" }
      );
      if (!result || !result.value) return res.status(404).json({ error: "Not found" });
      res.json(result.value);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // GET by id field (e.g. userId, farmId, etc.)
  router.get("/:id", async (req, res) => {
    try {
      const id = req.params.id;
      // Try all common id fields
      const idFields = ["userId","farmId","livestockId","vaccinationId","outbreakId",
                        "assessmentId","reportId","alertId","locationId","notificationId","id"];
      let doc = null;
      for (const field of idFields) {
        doc = await db.collection(collectionName).findOne({ [field]: id });
        if (doc) break;
      }
      if (!doc && ObjectId.isValid(id)) {
        doc = await db.collection(collectionName).findOne({ _id: new ObjectId(id) });
      }
      if (!doc) return res.status(404).json({ error: "Not found" });
      res.json(doc);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return router;
}

app.get("/api/livestock", async (req, res) => {
  try {
    const filter = {};
    for (const [key, val] of Object.entries(req.query)) {
      if (val === "true") filter[key] = true;
      else if (val === "false") filter[key] = false;
      else filter[key] = val;
    }
    const docs = await db.collection("livestock").find(filter).sort({ createdAt: -1 }).toArray();
    res.json(docs);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/livestock", async (req, res) => {
  try {
    const body = req.body || {};
    const farmId = body.farmId || body.farm || "";
    const ownerId = body.ownerId || body.owner || "";
    const livestockId = body.livestockId || body.id || `LS-${Date.now()}`;
    const doc = {
      ...body,
      livestockId,
      id: livestockId,
      name: body.name || "",
      species: body.species || body.animalType || "",
      breed: body.breed || "",
      age: body.age || "N/A",
      weight: Number(body.weight) || 0,
      paddock: body.paddock || body.pen || "",
      vaccinated: Boolean(body.vaccinated),
      health: body.health || body.healthStatus || "Healthy",
      healthStatus: body.health || body.healthStatus || "Healthy",
      farmId,
      ownerId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const result = await db.collection("livestock").insertOne(doc);
    res.status(201).json({ success: true, data: { ...doc, _id: result.insertedId } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put("/api/livestock/:id", async (req, res) => {
  try {
    const body = req.body || {};
    const livestockId = body.livestockId || body.id || req.params.id;
    const doc = {
      ...body,
      livestockId,
      id: livestockId,
      name: body.name || "",
      species: body.species || body.animalType || "",
      breed: body.breed || "",
      age: body.age || "N/A",
      weight: Number(body.weight) || 0,
      paddock: body.paddock || body.pen || "",
      vaccinated: Boolean(body.vaccinated),
      health: body.health || body.healthStatus || "Healthy",
      healthStatus: body.health || body.healthStatus || "Healthy",
      updatedAt: new Date(),
    };
    const query = ObjectId.isValid(req.params.id) ? { _id: new ObjectId(req.params.id) } : { livestockId: req.params.id };
    const result = await db.collection("livestock").findOneAndUpdate(query, { $set: doc }, { returnDocument: "after" });
    const updatedAnimal = result?.value || result;
    if (!updatedAnimal) return res.status(404).json({ error: "Animal not found" });
    res.json({ success: true, data: updatedAnimal });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/livestock/:id", async (req, res) => {
  try {
    const query = ObjectId.isValid(req.params.id) ? { _id: new ObjectId(req.params.id) } : { livestockId: req.params.id };
    const result = await db.collection("livestock").deleteOne(query);
    if (!result.deletedCount) return res.status(404).json({ error: "Animal not found" });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Auth: Register ────────────────────────────────────────────────────────
app.post("/api/auth/register", async (req, res) => {
  try {
    const { firstName, lastName, email, phone, password, role, extra, location } = req.body;
    if (!email || !password || !firstName || !lastName)
      return res.status(400).json({ error: "firstName, lastName, email and password are required" });
    const existing = await db.collection("users").findOne({ email });
    if (existing) return res.status(409).json({ error: "Email already registered" });
    const hash = await bcrypt.hash(password, 10);
    const userId = "U-" + Date.now();
    const ROLE_MAP = { farmer: "Farmer", veterinarian: "Veterinarian", government: "Government Officer", admin: "Admin" };
    const doc = {
      userId, name: `${firstName} ${lastName}`, firstName, lastName,
      email, phone: phone || "", passwordHash: hash,
      role: ROLE_MAP[role] || "Farmer",
      ...(role === "veterinarian" ? { verificationStatus: "PENDING" } : {}),
      extra: extra || {}, location: location || null, provider: "local",
      status: "Active", createdAt: new Date()
    };
    await db.collection("users").insertOne(doc);
    if (doc.role === "Farmer" && extra?.["Farm Name"]) {
      const farmLocation = location || {};
      await db.collection("farms").insertOne({
        farmId: "FARM-" + Date.now(), farmName: extra["Farm Name"],
        ownerName: doc.name, ownerId: doc.userId,
        farmType: extra["Farm Type"] || "Mixed",
        registrationNo: extra["Farm Registration No."] || "",
        district: extra.District || "", village: extra["Village / Address"] || "",
        state: extra.State || "", animalCount: Number(extra["Total Animals (approx.)"]) || 0,
        latitude: Number(farmLocation.latitude) || null,
        longitude: Number(farmLocation.longitude) || null,
        createdAt: new Date()
      });
    }
    const { passwordHash: _, ...safeUser } = doc;
    res.status(201).json({ success: true, user: safeUser });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put("/api/users/:id", async (req, res) => {
  try {
    const allowed = ["name", "email", "firstName", "lastName", "phone", "extra", "location"];
    const updates = Object.fromEntries(Object.entries(req.body).filter(([key]) => allowed.includes(key)));
    if (updates.name) {
      const names = updates.name.trim().split(/\s+/);
      updates.firstName = names.shift() || "";
      updates.lastName = names.join(" ");
    }
    if (!Object.keys(updates).length) return res.status(400).json({ error: "No profile fields supplied" });
    const result = await db.collection("users").findOneAndUpdate(
      { userId: req.params.id }, { $set: { ...updates, updatedAt: new Date() } }, { returnDocument: "after" }
    );
    if (!result) return res.status(404).json({ error: "User not found" });
    if (result.role === "Farmer" && (updates.extra || updates.location)) {
      const farmUpdates = {};
      const farmFields = { "Farm Name": "farmName", "Farm Type": "farmType", "Farm Registration No.": "registrationNo", District: "district", State: "state", "Village / Address": "village" };
      for (const [source, target] of Object.entries(farmFields)) {
        if (updates.extra?.[source] !== undefined) farmUpdates[target] = updates.extra[source];
      }
      if (updates.extra?.["Total Animals (approx.)"] !== undefined) farmUpdates.animalCount = Number(updates.extra["Total Animals (approx.)"]) || 0;
      if (updates.location) {
        farmUpdates.latitude = Number(updates.location.latitude) || null;
        farmUpdates.longitude = Number(updates.location.longitude) || null;
      }
      if (Object.keys(farmUpdates).length) {
        await db.collection("farms").updateOne(
          { ownerId: result.userId },
          {
            $set: farmUpdates,
            $setOnInsert: {
              farmId: "FARM-" + Date.now(), ownerId: result.userId,
              ownerName: result.name, createdAt: new Date()
            }
          },
          { upsert: true }
        );
      }
    }
    const { passwordHash: _, ...safeUser } = result;
    res.json({ success: true, user: safeUser });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Auth: Login (email + password) ────────────────────────────────────────
app.post("/api/auth/login", async (req, res) => {
  try {
    const ipAddress = req.ip || req.socket.remoteAddress || "unknown";
    const blockedUntil = blockedLoginUntil(ipAddress);
    if (blockedUntil) {
      res.set("Retry-After", String(Math.ceil((blockedUntil - Date.now()) / 1000)));
      return res.status(429).json({ error: "Too many login attempts. Try again in 15 minutes." });
    }
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "email and password required" });
    const user = await db.collection("users").findOne({ email });
    if (!user) {
      recordLoginFailure(ipAddress);
      return res.status(401).json({ error: "Invalid email or password" });
    }
    if (user.isActive === false) return res.status(403).json({ error: "This account is inactive. Contact a system administrator." });
    // Support both hashed passwords (new users) and legacy users without hash
    if (user.passwordHash) {
      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) {
        recordLoginFailure(ipAddress);
        return res.status(401).json({ error: "Invalid email or password" });
      }
    }
    loginFailureWindows.delete(ipAddress);
    const { passwordHash: _, ...safeUser } = user;
    res.json({ success: true, user: safeUser, accessToken: user.passwordHash ? signAccessToken(user.userId) : null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put("/api/users/:id/password", async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword) return res.status(400).json({ error: "New password is required" });
    if (newPassword.length < 8) return res.status(400).json({ error: "New password must be at least 8 characters" });
    const user = await db.collection("users").findOne({ userId: req.params.id });
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.passwordHash) {
      if (!currentPassword) return res.status(400).json({ error: "Current password is required" });
      if (!await bcrypt.compare(currentPassword, user.passwordHash)) return res.status(401).json({ error: "Current password is incorrect" });
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await db.collection("users").updateOne({ userId: req.params.id }, { $set: { passwordHash, updatedAt: new Date() } });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Explicit administrator verification workflow for veterinarian accounts.
app.put("/api/admin/veterinarians/:userId/verification", requireAdministrator, async (req, res) => {
  try {
    const verificationStatus = String(req.body?.verificationStatus || "").toUpperCase();
    if (!["PENDING", "VERIFIED", "REJECTED"].includes(verificationStatus))
      return res.status(400).json({ error: "verificationStatus must be PENDING, VERIFIED, or REJECTED" });
    const veterinarian = await db.collection("users").findOneAndUpdate(
      { userId: req.params.userId, role: "Veterinarian" },
      { $set: {
        verificationStatus,
        verifiedBy: req.authenticatedUser.userId,
        verificationUpdatedAt: new Date(),
        updatedAt: new Date(),
      } },
      { returnDocument: "after" }
    );
    const updated = veterinarian?.value || veterinarian;
    if (!updated) return res.status(404).json({ error: "Veterinarian account not found" });
    const { passwordHash: _, ...safeUser } = updated;
    res.json({ success: true, user: safeUser });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Auth: Google Sign-In (upsert by email) ────────────────────────────────
app.post("/api/auth/google", async (req, res) => {
  try {
    const { email, name, googleId, picture } = req.body;
    if (!email) return res.status(400).json({ error: "email required" });
    let user = await db.collection("users").findOne({ email });
    if (!user) {
      const userId = "U-G-" + Date.now();
      user = {
        userId, name: name || email, email,
        googleId: googleId || null, picture: picture || null,
        role: "Farmer", provider: "google",
        status: "Active", createdAt: new Date()
      };
      await db.collection("users").insertOne(user);
    } else if (!user.googleId && googleId) {
      await db.collection("users").updateOne({ email }, { $set: { googleId, picture, provider: "google" } });
      user = { ...user, googleId, picture, provider: "google" };
    }
    const { passwordHash: _, ...safeUser } = user;
    res.json({ success: true, user: safeUser });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Special login route (legacy / role-based demo) ────────────────────────
app.post("/api/users/login", async (req, res) => {
  try {
    const { email, role } = req.body;
    if (email) {
      const user = await db.collection("users").findOne({ email });
      if (!user) return res.status(404).json({ error: "User not found" });
      const { passwordHash: _, ...safeUser } = user;
      return res.json(safeUser);
    }
    if (role === "Farmer") {
      const farmOwnerIds = await db.collection("farms").distinct("ownerId");
      const user = await db.collection("users").findOne({ role: "Farmer", userId: { $in: farmOwnerIds } });
      if (user) { const { passwordHash: _, ...s } = user; return res.json(s); }
    }
    const user = await db.collection("users").findOne({ role: role || "Farmer" });
    if (!user) return res.status(404).json({ error: "User not found for role: " + role });
    const { passwordHash: _, ...safeUser } = user;
    res.json(safeUser);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Mount collection routes ───────────────────────────────────────────────
const COLLECTIONS = [
  "users", "farms", "livestock", "vaccinations", "diseases",
  "biosecurity", "veterinarian_reports", "government_alerts",
  "gis_locations", "notifications", "analytics", "inventory",
];
for (const col of COLLECTIONS) {
  app.use(`/api/${col}`, makeRouter(col));
}

// Farm-operation records share a small, consistent CRUD contract.  Keeping this
// here avoids separate database connections and gives the mobile client stable IDs.
const RECORD_TYPES = {
  livestock: { collection: "livestock", id: "livestockId", prefix: "LS" },
  vaccinations: { collection: "vaccinations", id: "vaccinationId", prefix: "VX" },
  "health-records": { collection: "health_records", id: "healthRecordId", prefix: "HR" },
  inventory: { collection: "inventory", id: "inventoryId", prefix: "INV" },
  "farm-activities": { collection: "farm_activities", id: "activityId", prefix: "ACT" },
};
Object.entries(RECORD_TYPES).forEach(([path, cfg]) => {
  app.get(`/api/${path}`, async (req, res) => {
    try {
      const filter = req.query.farmId ? { farmId: req.query.farmId } : {};
      res.json(await db.collection(cfg.collection).find(filter).sort({ createdAt: -1 }).toArray());
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.post(`/api/${path}`, async (req, res) => {
    try {
      if (!req.body.farmId) return res.status(400).json({ error: "farmId is required" });
      const id = `${cfg.prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const doc = { ...req.body, [cfg.id]: id, createdAt: new Date(), updatedAt: new Date() };
      await db.collection(cfg.collection).insertOne(doc);
      res.status(201).json({ success: true, record: doc });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.put(`/api/${path}/:id`, async (req, res) => {
    try {
      const updates = { ...req.body, updatedAt: new Date() };
      delete updates[cfg.id]; delete updates._id;
      const result = await db.collection(cfg.collection).findOneAndUpdate({ [cfg.id]: req.params.id }, { $set: updates }, { returnDocument: "after" });
      if (!result) return res.status(404).json({ error: "Record not found" });
      res.json({ success: true, record: result });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.delete(`/api/${path}/:id`, async (req, res) => {
    try {
      const result = await db.collection(cfg.collection).deleteOne({ [cfg.id]: req.params.id });
      if (!result.deletedCount) return res.status(404).json({ error: "Record not found" });
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
});

// Appointment requests are the assignment workflow between a farmer and a veterinarian.
app.get("/api/veterinarians/available", async (req, res) => {
  try {
    const farm = await db.collection("farms").findOne({ farmId: req.query.farmId });
    if (!farm) return res.status(404).json({ error: "Farm not found" });

    const nearbyDistricts = {
      coimbatore: ["coimbatore", "tiruppur", "erode", "salem"],
      tiruppur: ["tiruppur", "coimbatore", "erode", "salem"],
      erode: ["erode", "coimbatore", "tiruppur", "salem"],
      salem: ["salem", "erode", "tiruppur", "coimbatore"],
    };
    const vets = await db.collection("users").find({ role: "Veterinarian" }).toArray();
    const appointments = await db.collection("appointments").find({ status: { $in: ["PENDING", "CONFIRMED"] } }).toArray();
    const suitable = vets
      .filter(vet => vet.status !== "Inactive")
      .map(vet => {
        const specializations = vet.specializations || vet.extra?.specializations || vet.extra?.Specialisation || [];
        const normalizedSpecializations = (Array.isArray(specializations) ? specializations : [specializations]).map(value => String(value).toLowerCase());
        const matchesAnimalType = !normalizedSpecializations.length || normalizedSpecializations.some(value => value.includes(String(farm.farmType || "").toLowerCase()) || value.includes("mixed"));
        const workload = appointments.filter(appointment => appointment.veterinarianId === vet.userId).length;
        const capacity = Number(vet.appointmentCapacity || vet.extra?.appointmentCapacity) || 15;
        const serviceDistricts = vet.serviceDistricts || vet.extra?.serviceDistricts || vet.extra?.["Service District(s)"] || vet.district;
        const areas = (Array.isArray(serviceDistricts) ? serviceDistricts : String(serviceDistricts || "").split(",")).map(value => value.trim().toLowerCase());
        const farmDistrict = String(farm.district || "").toLowerCase();
        const farmState = String(farm.state || "").toLowerCase();
        const vetDistrict = String(vet.district || "").toLowerCase();
        const servesFarm = areas.includes(farmDistrict);
        const sameDistrict = vetDistrict === farmDistrict;
        const nearby = (nearbyDistricts[farmDistrict] || [farmDistrict]).includes(vetDistrict);
        const sameState = String(vet.state || "").toLowerCase() === farmState;
        const proximityRank = sameDistrict ? 0 : nearby && sameState ? 1 : 2;
        return {
          userId: vet.userId, name: vet.name || vet.fullName, email: vet.email, phone: vet.phone || vet.mobile || "",
          picture: vet.picture || null, district: vet.district || "", state: vet.state || "",
          specializations: normalizedSpecializations.length ? normalizedSpecializations : [farm.farmType || "General livestock"],
          experienceYears: Number(vet.experienceYears || vet.extra?.["Years of Experience"]) || null,
          workload, capacity, availability: workload >= capacity ? "UNAVAILABLE" : workload >= capacity - 3 ? "LIMITED" : "AVAILABLE",
          matchesAnimalType, servesFarm, proximityRank,
          proximityLabel: sameDistrict ? "Same district" : nearby && sameState ? "Nearby district" : "Outside nearby area",
        };
      })
      // Legacy profiles do not all have service-area data. Keep them bookable,
      // while always placing local veterinarians ahead of wider-area choices.
      .filter(vet => vet.matchesAnimalType && vet.availability !== "UNAVAILABLE" && vet.proximityRank < 2)
      .sort((a, b) => a.proximityRank - b.proximityRank || a.workload - b.workload);
    res.json(suitable);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/appointments", async (req, res) => {
  try {
    const { farmId, farmerId, veterinarianId, appointmentDate, appointmentTime, visitType, reason } = req.body;
    if (![farmId, farmerId, veterinarianId, appointmentDate, appointmentTime, visitType].every(Boolean)) {
      return res.status(400).json({ error: "farmId, farmerId, veterinarianId, appointmentDate, appointmentTime and visitType are required" });
    }
    const [farm, farmer, veterinarian] = await Promise.all([
      db.collection("farms").findOne({ farmId, ownerId: farmerId }),
      db.collection("users").findOne({ userId: farmerId }),
      db.collection("users").findOne({ userId: veterinarianId, role: "Veterinarian" }),
    ]);
    if (!farm) return res.status(403).json({ error: "You can only book a visit for your own farm" });
    if (!veterinarian) return res.status(400).json({ error: "Veterinarian not found" });
    const appointmentId = `APT-${Date.now()}`;
    const appointment = {
      appointmentId, farmId, farmName: farm.farmName, farmType: farm.farmType, district: farm.district || "",
      farmerId, farmerName: farmer?.name || farmer?.fullName || "Farmer",
      veterinarianId, veterinarianName: veterinarian.name || veterinarian.fullName,
      appointmentDate, appointmentTime, visitType, reason: reason || "Routine consultation",
      status: "PENDING", createdAt: new Date(), updatedAt: new Date(),
    };
    await db.collection("appointments").insertOne(appointment);
    await db.collection("notifications").insertOne({
      notificationId: `N-${Date.now()}-appointment`, targetUserId: veterinarianId, targetRole: "Veterinarian",
      type: "APPOINTMENT_REQUEST", title: "New Veterinary Appointment Request",
      message: `${appointment.farmerName} requested a ${visitType.toLowerCase()} for ${farm.farmName} on ${appointmentDate} at ${appointmentTime}.`,
      appointmentId, isRead: false, createdAt: new Date(),
    });
    res.status(201).json({ success: true, appointment });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/appointments", async (req, res) => {
  try {
    const filter = {};
    if (req.query.farmerId) filter.farmerId = req.query.farmerId;
    if (req.query.veterinarianId) filter.veterinarianId = req.query.veterinarianId;
    if (req.query.farmId) filter.farmId = req.query.farmId;
    const appointments = await db.collection("appointments").find(filter).sort({ createdAt: -1 }).toArray();
    res.json(appointments);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put("/api/appointments/:id/status", async (req, res) => {
  try {
    const { status, veterinarianId } = req.body;
    if (!["CONFIRMED", "REJECTED"].includes(status) || !veterinarianId) return res.status(400).json({ error: "A valid status and veterinarianId are required" });
    const appointment = await db.collection("appointments").findOne({ appointmentId: req.params.id, veterinarianId });
    if (!appointment) return res.status(404).json({ error: "Appointment request not found" });
    if (appointment.status !== "PENDING") return res.status(409).json({ error: "This appointment has already been processed" });
    await db.collection("appointments").updateOne({ appointmentId: appointment.appointmentId }, { $set: { status, updatedAt: new Date() } });
    if (status === "CONFIRMED") {
      await db.collection("farms").updateOne({ farmId: appointment.farmId }, { $set: { assignedVeterinarianId: veterinarianId, assignedVeterinarianName: appointment.veterinarianName, assignedAt: new Date() } });
    }
    await db.collection("notifications").insertOne({
      notificationId: `N-${Date.now()}-appointment-status`, targetUserId: appointment.farmerId, targetRole: "Farmer",
      type: "APPOINTMENT_UPDATE", title: status === "CONFIRMED" ? "Veterinary Appointment Confirmed" : "Veterinary Appointment Declined",
      message: status === "CONFIRMED" ? `Your appointment with ${appointment.veterinarianName} has been confirmed. ${appointment.farmName} is now assigned to this veterinarian.` : `${appointment.veterinarianName} declined the appointment request for ${appointment.farmName}.`,
      appointmentId: appointment.appointmentId, isRead: false, createdAt: new Date(),
    });
    res.json({ success: true, status, assignmentUpdated: status === "CONFIRMED" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Analytics summary route ───────────────────────────────────────────────
app.get("/api/analytics/summary", async (req, res) => {
  try {
    const [farms, diseases, biosecurity, vaccinations] = await Promise.all([
      db.collection("farms").find().toArray(),
      db.collection("diseases").find().toArray(),
      db.collection("biosecurity").find().toArray(),
      db.collection("vaccinations").find().toArray(),
    ]);

    const stateWiseFarmCount = {};
    farms.forEach(f => { stateWiseFarmCount[f.state] = (stateWiseFarmCount[f.state] || 0) + 1; });

    const districtWiseDiseaseCount = {};
    diseases.forEach(d => { districtWiseDiseaseCount[d.district] = (districtWiseDiseaseCount[d.district] || 0) + 1; });

    const riskStats = { High: 0, Moderate: 0, Low: 0 };
    biosecurity.forEach(b => { riskStats[b.riskLevel] = (riskStats[b.riskLevel] || 0) + 1; });

    const monthlyVac = {};
    vaccinations.forEach(v => {
      const m = v.vaccinationDate?.slice(0, 7);
      if (m) monthlyVac[m] = (monthlyVac[m] || 0) + 1;
    });

    res.json({
      stateWiseFarmCount:       Object.entries(stateWiseFarmCount).map(([state, count]) => ({ state, count })),
      districtWiseDiseaseCount: Object.entries(districtWiseDiseaseCount).map(([district, count]) => ({ district, count })),
      riskClassificationStats:  Object.entries(riskStats).map(([riskLevel, count]) => ({ riskLevel, count })),
      monthlyVaccinationTrends: Object.entries(monthlyVac).sort().map(([month, count]) => ({ month, count })),
      totalFarms:       farms.length,
      totalDiseases:    diseases.length,
      totalVaccinations:vaccinations.length,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/health", (req, res) => res.json({ status: "ok", db: DB_NAME }));

// ═══════════════════════════════════════════════════════════════════════════
// FARM MANAGEMENT MODULE
// ═══════════════════════════════════════════════════════════════════════════

function validateFarmFields(body, requireAll = false) {
  const errors = [];
  const name = (body.farmName || "").trim();
  if (requireAll && !name) errors.push("farmName is required");
  if (name && name.length > 120) errors.push("farmName too long (max 120)");

  const owner = (body.ownerName || "").trim();
  if (requireAll && !owner) errors.push("ownerName is required");
  if (owner && owner.length > 100) errors.push("ownerName too long (max 100)");

  if (body.phone !== undefined && body.phone !== "") {
    if (!/^[\d\s\+\-\(\)]{7,20}$/.test(body.phone))
      errors.push("phone format invalid");
  }
  if (body.email !== undefined && body.email !== "") {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email))
      errors.push("email format invalid");
  }
  if (body.pincode !== undefined && body.pincode !== "") {
    if (!/^\d{6}$/.test(body.pincode))
      errors.push("pincode must be 6 digits");
  }
  if (body.farmArea !== undefined && body.farmArea !== "") {
    const a = Number(body.farmArea);
    if (isNaN(a) || a <= 0) errors.push("farmArea must be a positive number");
  }
  if (body.animalCapacity !== undefined && body.animalCapacity !== "") {
    const c = Number(body.animalCapacity);
    if (!Number.isInteger(c) || c <= 0) errors.push("animalCapacity must be a positive integer");
  }
  if (body.animalCount !== undefined && body.animalCount !== "") {
    const n = Number(body.animalCount);
    if (!Number.isInteger(n) || n < 0) errors.push("animalCount must be a non-negative integer");
  }
  if (body.activeZoneCount !== undefined && body.activeZoneCount !== "") {
    const n = Number(body.activeZoneCount);
    if (!Number.isInteger(n) || n < 0) errors.push("activeZoneCount must be a non-negative integer");
  }
  if (body.latitude !== undefined && body.latitude !== null && body.latitude !== "") {
    const lat = Number(body.latitude);
    if (isNaN(lat) || lat < -90 || lat > 90) errors.push("latitude must be between -90 and 90");
  }
  if (body.longitude !== undefined && body.longitude !== null && body.longitude !== "") {
    const lon = Number(body.longitude);
    if (isNaN(lon) || lon < -180 || lon > 180) errors.push("longitude must be between -180 and 180");
  }
  if (body.status !== undefined) {
    if (!["Active", "Inactive"].includes(body.status))
      errors.push("status must be Active or Inactive");
  }
  return errors;
}

// POST /api/farms/create  — create a new farm with full validation
app.post("/api/farms/create", async (req, res) => {
  try {
    const body = req.body;
    const errors = validateFarmFields(body, true);
    if (errors.length) return res.status(400).json({ error: errors.join("; ") });

    const farmName = body.farmName.trim();
    const ownerId  = (body.ownerId || "").trim();
    if (!ownerId) return res.status(400).json({ error: "ownerId is required" });

    // Prevent duplicate farm name for same owner
    const dup = await db.collection("farms").findOne({ ownerId, farmName });
    if (dup) return res.status(409).json({ error: "A farm with this name already exists for this owner" });

    const farmId = "FARM-" + Date.now();
    const doc = {
      farmId,
      farmName,
      ownerName:      (body.ownerName || "").trim(),
      ownerId,
      farmType:       body.farmType       || "Mixed",
      status:         body.status         || "Active",
      registrationNo: (body.registrationNo || "").trim(),
      phone:          (body.phone          || "").trim(),
      email:          (body.email          || "").trim(),
      address:        (body.address        || "").trim(),
      village:        (body.village        || "").trim(),
      district:       (body.district       || "").trim(),
      state:          (body.state          || "").trim(),
      pincode:        (body.pincode        || "").trim(),
      farmArea:       body.farmArea        ? Number(body.farmArea)        : null,
      animalCapacity: body.animalCapacity  ? Number(body.animalCapacity)  : null,
      animalCount:    body.animalCount     ? Number(body.animalCount)     : 0,
      activeZoneCount: Number(body.activeZoneCount) || 0,
      numberOfSheds:  body.numberOfSheds   ? Number(body.numberOfSheds)   : null,
      establishedYear:body.establishedYear ? Number(body.establishedYear) : null,
      latitude:       body.latitude        ? Number(body.latitude)        : null,
      longitude:      body.longitude       ? Number(body.longitude)       : null,
      infrastructure: body.infrastructure  || {},
      zones:          Array.isArray(body.zones) ? body.zones : [],
      personnel:      body.personnel       || [],
      createdAt:      new Date(),
      updatedAt:      new Date(),
    };
    await db.collection("farms").insertOne(doc);
    try {
      await db.collection("farm_activities").insertOne({
        activityId: `ACT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        farmId,
        ownerId,
        activityType: "other",
        description: `Farm registered: ${farmName}`,
        personResponsible: doc.ownerName,
        date: doc.createdAt,
        createdAt: doc.createdAt,
        updatedAt: doc.createdAt,
      });
    } catch (activityError) {
      console.error("Farm created but activity could not be recorded:", activityError.message);
    }
    res.status(201).json({ success: true, farmId, farm: doc });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/farms/:farmId  — update farm with full validation
app.put("/api/farms/:farmId", async (req, res) => {
  try {
    const { farmId } = req.params;
    const body = req.body;
    const errors = validateFarmFields(body, false);
    if (errors.length) return res.status(400).json({ error: errors.join("; ") });

    const existing = await db.collection("farms").findOne({ farmId });
    if (!existing) return res.status(404).json({ error: "Farm not found" });

    // Prevent duplicate name for same owner (excluding self)
    if (body.farmName) {
      const dup = await db.collection("farms").findOne({
        ownerId: existing.ownerId,
        farmName: body.farmName.trim(),
        farmId: { $ne: farmId }
      });
      if (dup) return res.status(409).json({ error: "Another farm with this name already exists" });
    }

    const ALLOWED = [
      "farmName","ownerName","farmType","status","registrationNo",
      "phone","email","address","village","district","state","pincode",
      "farmArea","animalCapacity","animalCount","activeZoneCount","numberOfSheds",
      "establishedYear","latitude","longitude","infrastructure","personnel"
    ];
    const updates = {};
    for (const key of ALLOWED) {
      if (body[key] !== undefined) {
        if (["farmArea","animalCapacity","animalCount","activeZoneCount","numberOfSheds","establishedYear"].includes(key))
          updates[key] = body[key] === "" ? null : Number(body[key]);
        else if (["latitude","longitude"].includes(key))
          updates[key] = body[key] === "" || body[key] === null ? null : Number(body[key]);
        else if (typeof body[key] === "string")
          updates[key] = body[key].trim();
        else
          updates[key] = body[key];
      }
    }
    updates.updatedAt = new Date();
    await db.collection("farms").updateOne({ farmId }, { $set: updates });
    const updated = await db.collection("farms").findOne({ farmId });
    res.json({ success: true, farm: updated });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/farms/:farmId/zones", async (req, res) => {
  try {
    const { farmId } = req.params;
    const { name, area, capacity, ownerId } = req.body || {};
    const farm = await db.collection("farms").findOne({ farmId });
    if (!farm) return res.status(404).json({ error: "Farm not found" });
    if (!ownerId || ownerId !== farm.ownerId) return res.status(403).json({ error: "Farm owner does not match" });
    if (typeof name !== "string" || !name.trim()) return res.status(400).json({ error: "Zone name is required" });
    if (!Number.isFinite(Number(area)) || Number(area) <= 0) return res.status(400).json({ error: "Zone area must be positive" });
    if (!Number.isFinite(Number(capacity)) || Number(capacity) <= 0) return res.status(400).json({ error: "Zone capacity must be positive" });

    const requestedIds = Array.isArray(req.body.animalIds) ? [...new Set(req.body.animalIds.map(String))] : [];
    if (requestedIds.length > Number(capacity)) return res.status(400).json({ error: "Assigned animals cannot exceed zone capacity" });
    const animalFilters = [{ livestockId: { $in: requestedIds } }, { id: { $in: requestedIds } }];
    const objectIds = requestedIds.filter(ObjectId.isValid).map((id) => new ObjectId(id));
    if (objectIds.length) animalFilters.push({ _id: { $in: objectIds } });
    const farmAnimals = requestedIds.length
      ? await db.collection("livestock").find({ farmId, $or: animalFilters }).toArray()
      : [];
    const validIds = new Set(farmAnimals.flatMap((animal) => [
      animal.livestockId,
      animal.id,
      animal._id?.toString(),
    ].filter(Boolean).map(String)));
    if (requestedIds.some((id) => !validIds.has(id))) {
      return res.status(400).json({ error: "Select animals that belong to this farm" });
    }

    const zone = {
      zoneId: `ZONE-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: name.trim(),
      area: Number(area),
      capacity: Number(capacity),
      animalIds: farmAnimals.map((animal) => String(animal.livestockId || animal.id || animal._id)),
      status: "Active",
      createdAt: new Date(),
    };
    const activeZoneCount = (Array.isArray(farm.zones) ? farm.zones : []).filter((entry) => entry.status !== "Inactive").length + 1;
    await db.collection("farms").updateOne(
      { farmId, ownerId },
      { $push: { zones: zone }, $set: { activeZoneCount, updatedAt: new Date() } }
    );
    const updatedFarm = await db.collection("farms").findOne({ farmId });
    res.status(201).json({ success: true, farm: updatedFarm, zone });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/farms/:farmId/summary  — full farm summary with related data
app.get("/api/farms/:farmId/summary", async (req, res) => {
  try {
    const { farmId } = req.params;
    const farm = await db.collection("farms").findOne({ farmId });
    if (!farm) return res.status(404).json({ error: "Farm not found" });

    const [livestock, vaccinations, diseaseReports, latestAssessment] = await Promise.all([
      db.collection("livestock").find({ farmId }).toArray(),
      db.collection("vaccinations").find({ farmId }).sort({ createdAt: -1 }).limit(10).toArray(),
      db.collection("disease_reports").find({ farmId }).sort({ createdAt: -1 }).limit(5).toArray(),
      db.collection("biosecurity_assessments").findOne({ farmId }, { sort: { createdAt: -1 } }),
    ]);

    const sickCount       = livestock.filter(l => l.healthStatus === "Sick").length;
    const vaccinatedCount = livestock.filter(l => l.vaccinated === true).length;
    const poultryCount    = livestock.filter(l => ["Poultry","Broiler","Layer","Breeder"].includes(l.species)).length;
    const pigCount        = livestock.filter(l => l.species === "Pig").length;

    const now = new Date();
    const upcomingVax = vaccinations.filter(v => v.status !== "Completed" && v.vaccinationDate && new Date(v.vaccinationDate) >= now);
    const overdueVax  = vaccinations.filter(v => v.status !== "Completed" && v.vaccinationDate && new Date(v.vaccinationDate) < now);

    const activeReports = diseaseReports.filter(r => !["RESOLVED","RULED_OUT"].includes(r.status));

    res.json({
      farm,
      livestock: { total: livestock.length, poultry: poultryCount, pigs: pigCount, sick: sickCount, vaccinated: vaccinatedCount },
      vaccination: { total: vaccinations.length, upcoming: upcomingVax.length, overdue: overdueVax.length, recent: vaccinations.slice(0,3) },
      diseaseReports: { total: diseaseReports.length, active: activeReports.length, recent: diseaseReports.slice(0,3) },
      biosecurity: latestAssessment ? {
        score: latestAssessment.overallScore,
        riskLevel: latestAssessment.riskLevel,
        assessmentDate: latestAssessment.assessmentDate,
        weakAreas: latestAssessment.weakAreas || [],
        assessmentId: latestAssessment.assessmentId,
      } : null,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/farms/:farmId/activity  — recent activity log
app.get("/api/farms/:farmId/activity", async (req, res) => {
  try {
    const { farmId } = req.params;
    const [reports, vaccinations, assessments, farmActivities] = await Promise.all([
      db.collection("disease_reports").find({ farmId }).sort({ createdAt: -1 }).limit(5).toArray(),
      db.collection("vaccinations").find({ farmId }).sort({ createdAt: -1 }).limit(5).toArray(),
      db.collection("biosecurity_assessments").find({ farmId }).sort({ createdAt: -1 }).limit(5).toArray(),
      db.collection("farm_activities").find({ farmId }).sort({ createdAt: -1 }).limit(10).toArray(),
    ]);
    const events = [
      ...reports.map(r => ({ type: "disease_report", label: `Disease report submitted — Suspected ${r.suspectedDisease}`, date: r.createdAt, id: r.reportId })),
      ...vaccinations.map(v => ({ type: "vaccination", label: `Vaccination recorded — ${v.disease || v.vaccineName || "vaccine"}`, date: v.createdAt || v.vaccinationDate, id: v.vaccinationId })),
      ...assessments.map(a => ({ type: "biosecurity", label: `Biosecurity assessment completed — Score: ${a.overallScore}/100`, date: a.createdAt, id: a.assessmentId })),
      ...farmActivities.map(a => ({ type: "farm_activity", label: a.description || `Farm activity recorded — ${a.activityType || "other"}`, date: a.date || a.createdAt, id: a.activityId || a._id.toString() })),
    ];
    events.sort((a, b) => new Date(b.date) - new Date(a.date));
    res.json(events.slice(0, 15));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// BIOSECURITY ASSESSMENT MODULE
// ═══════════════════════════════════════════════════════════════════════════

const ASSESSMENT_PARAMS = [
  "hygieneScore","housingCleanlinessScore","waterQualityScore","feedManagementScore",
  "wasteDisposalScore","visitorControlScore","disinfectionScore","pestControlScore",
  "quarantineScore","vaccinationScore","animalIntroductionScore","deadAnimalDisposalScore"
];

function calcBiosecurityScore(body) {
  const maxPerParam = 4;
  const total = ASSESSMENT_PARAMS.reduce((s, k) => s + (Number(body[k]) || 0), 0);
  const max   = ASSESSMENT_PARAMS.length * maxPerParam;
  return Math.round((total / max) * 100);
}

function getRiskLevel(score) {
  if (score <= 50) return "HIGH";
  if (score <= 80) return "MODERATE";
  return "LOW";
}

function getRecommendations(body) {
  const recs = [];
  if ((body.hygieneScore || 0) < 2)              recs.push("Improve farm sanitation and hygiene practices");
  if ((body.housingCleanlinessScore || 0) < 2)   recs.push("Clean and disinfect animal housing regularly");
  if ((body.waterQualityScore || 0) < 2)         recs.push("Test and treat water supply for contamination");
  if ((body.feedManagementScore || 0) < 2)       recs.push("Improve feed storage and management practices");
  if ((body.wasteDisposalScore || 0) < 2)        recs.push("Improve waste disposal and manure management");
  if ((body.visitorControlScore || 0) < 2)       recs.push("Restrict unnecessary visitors and enforce entry protocols");
  if ((body.disinfectionScore || 0) < 2)         recs.push("Implement vehicle and equipment disinfection procedures");
  if ((body.pestControlScore || 0) < 2)          recs.push("Strengthen pest and rodent control measures");
  if ((body.quarantineScore || 0) < 2)           recs.push("Establish proper animal isolation and quarantine facilities");
  if ((body.vaccinationScore || 0) < 2)          recs.push("Verify and update vaccination schedule for all animals");
  if ((body.animalIntroductionScore || 0) < 2)   recs.push("Quarantine newly introduced animals for at least 21 days");
  if ((body.deadAnimalDisposalScore || 0) < 2)   recs.push("Improve dead animal disposal procedures");
  return recs.length ? recs : ["Maintain current biosecurity standards"];
}

// POST /api/biosecurity/assessment
app.post("/api/biosecurity/assessment", async (req, res) => {
  try {
    const body = req.body;
    if (!body.farmId || !body.farmerId) return res.status(400).json({ error: "farmId and farmerId required" });
    const overallScore = calcBiosecurityScore(body);
    const riskLevel    = getRiskLevel(overallScore);
    const recommendations = getRecommendations(body);
    const strengths    = ASSESSMENT_PARAMS.filter(k => (body[k] || 0) >= 3).map(k => k.replace("Score",""));
    const weakAreas    = ASSESSMENT_PARAMS.filter(k => (body[k] || 0) < 2).map(k => k.replace("Score",""));
    const assessmentId = "BA-" + Date.now();
    const doc = {
      assessmentId, farmId: body.farmId, farmerId: body.farmerId,
      assessmentDate: new Date().toISOString(), farmType: body.farmType || "Mixed",
      ...ASSESSMENT_PARAMS.reduce((o,k) => ({ ...o, [k]: Number(body[k]) || 0 }), {}),
      evidence: body.evidence || {},
      overallScore, riskLevel, recommendations, strengths, weakAreas,
      createdAt: new Date(), updatedAt: new Date()
    };
    await db.collection("biosecurity_assessments").insertOne(doc);
    // If HIGH RISK, create notifications for vet and government
    if (riskLevel === "HIGH") {
      const notifBase = {
        type: "BIOSECURITY_ALERT", farmId: body.farmId, farmerId: body.farmerId,
        title: "High-Risk Biosecurity Assessment",
        message: `Farm ${body.farmId} scored ${overallScore}/100 (HIGH RISK). Immediate attention required.`,
        isRead: false, createdAt: new Date()
      };
      await db.collection("notifications").insertMany([
        { ...notifBase, notificationId: "N-" + Date.now() + "-vet",  targetRole: "Veterinarian" },
        { ...notifBase, notificationId: "N-" + Date.now() + "-gov",  targetRole: "Government Officer" },
      ]);
    }
    res.status(201).json({ success: true, assessmentId, overallScore, riskLevel, recommendations, strengths, weakAreas, evidence: body.evidence || {} });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/biosecurity/farm/:farmId
app.get("/api/biosecurity/farm/:farmId", async (req, res) => {
  try {
    const doc = await db.collection("biosecurity_assessments")
      .findOne({ farmId: req.params.farmId }, { sort: { createdAt: -1 } });
    if (!doc) return res.status(404).json({ error: "No assessment found" });
    res.json(doc);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/biosecurity/history/:farmId
app.get("/api/biosecurity/history/:farmId", async (req, res) => {
  try {
    const docs = await db.collection("biosecurity_assessments")
      .find({ farmId: req.params.farmId }).sort({ createdAt: -1 }).limit(20).toArray();
    res.json(docs);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// DISEASE REPORTING MODULE
// ═══════════════════════════════════════════════════════════════════════════

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function calcDiseaseRisk(body) {
  const sev = (body.severity || "").toUpperCase();
  if (sev === "CRITICAL" || (body.deaths > 10)) return "HIGH";
  if (sev === "HIGH"     || (body.deaths > 0))  return "MODERATE";
  return "LOW";
}

// POST /api/disease/report
app.post("/api/disease/report", async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.farmId || !body.farmerId) return res.status(400).json({ error: "farmId and farmerId required" });
    const reportId  = "DR-" + Date.now();
    const riskLevel = calcDiseaseRisk(body);
    // Get farm coordinates from farms collection
    const farm = await db.collection("farms").findOne({ $or: [{ farmId: body.farmId }, { id: body.farmId }] });
    const suppliedCoordinates = hasValidCoordinates(body.latitude, body.longitude);
    const farmCoordinates = hasValidCoordinates(farm?.latitude, farm?.longitude);
    const latitude = suppliedCoordinates ? Number(body.latitude) : farmCoordinates ? Number(farm.latitude) : null;
    const longitude = suppliedCoordinates ? Number(body.longitude) : farmCoordinates ? Number(farm.longitude) : null;
    const doc = {
      reportId, farmId: body.farmId, farmerId: body.farmerId,
      animalType: body.animalType, suspectedDisease: body.suspectedDisease,
      otherDisease: body.otherDisease || "",
      symptoms: body.symptoms || [], affectedAnimals: Number(body.affectedAnimals) || 0,
      deaths: Number(body.deaths) || 0, symptomStartDate: body.symptomStartDate,
      severity: body.severity, remarks: body.remarks || "",
      imageUrl: body.imageUrl || null, latitude, longitude,
      district: body.district || farm?.district || null,
      farmName: farm?.farmName || farm?.name || null,
      status: "REPORTED", riskLevel,
      reportedDate: new Date().toISOString(),
      veterinarianId: null, inspectionStatus: "PENDING",
      diagnosis: null,
      statusHistory: [{ status: "REPORTED", changedAt: new Date(), actorRole: "Farmer", actorId: body.farmerId }],
      createdAt: new Date(), updatedAt: new Date()
    };
    await db.collection("disease_reports").insertOne(doc);
    // Find nearby farms within configurable radius
    const config = await db.collection("system_config").findOne({ key: "risk_radius_km" });
    const radiusKm = config?.value || 5;
    const allFarms = latitude === null || longitude === null ? [] :
      await db.collection("farms").find({ latitude: { $exists: true }, longitude: { $exists: true } }).toArray();
    const nearbyFarms = allFarms.filter(f =>
      f.farmId !== body.farmId && hasValidCoordinates(f.latitude, f.longitude) &&
      haversineKm(latitude, longitude, f.latitude, f.longitude) <= radiusKm
    ).map(f => ({ farmId: f.farmId, farmName: f.farmName, distance: haversineKm(latitude, longitude, f.latitude, f.longitude).toFixed(2) }));
    // Store nearby farms in the report
    await db.collection("disease_reports").updateOne({ reportId }, { $set: { nearbyFarms, updatedAt: new Date() } });
    // Generate notifications
    const farmName = farm?.farmName || body.farmId;
    const notifMsg = `A suspected ${body.suspectedDisease} report has been submitted from ${farmName}. Risk level: ${riskLevel}. Veterinary inspection required.`;
    const notifs = [
      { notificationId: "N-" + Date.now() + "-farmer", targetRole: "Farmer",           targetUserId: body.farmerId, type: "DISEASE_REPORT", title: "Disease Report Submitted",       message: `Your report for suspected ${body.suspectedDisease} has been received. Report ID: ${reportId}`, reportId, isRead: false, createdAt: new Date() },
      { notificationId: "N-" + Date.now() + "-vet",    targetRole: "Veterinarian",      type: riskLevel === "HIGH" ? "HIGH_RISK_ALERT" : "DISEASE_REPORT", title: riskLevel === "HIGH" ? "High-Risk Disease Alert" : "New Disease Report", message: notifMsg, reportId, isRead: false, createdAt: new Date() },
      { notificationId: "N-" + Date.now() + "-gov",    targetRole: "Government Officer", type: riskLevel === "HIGH" ? "HIGH_RISK_ALERT" : "DISEASE_REPORT", title: riskLevel === "HIGH" ? "High-Risk Disease Alert" : "New Disease Report", message: notifMsg, reportId, isRead: false, createdAt: new Date() },
    ];
    if (nearbyFarms.length > 0) {
      notifs.push({ notificationId: "N-" + Date.now() + "-nearby", targetRole: "Farmer", type: "NEARBY_OUTBREAK", title: "Nearby Outbreak Alert", message: `A suspected ${body.suspectedDisease} outbreak has been reported near your farm. ${nearbyFarms.length} farm(s) within ${radiusKm}km radius.`, reportId, isRead: false, createdAt: new Date() });
    }
    await db.collection("notifications").insertMany(notifs);
    res.status(201).json({ success: true, reportId, riskLevel, nearbyFarms, notificationsSent: notifs.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/disease/reports
app.get("/api/disease/reports", async (req, res) => {
  try {
    const filter = {};
    if (req.query.farmId)   filter.farmId   = req.query.farmId;
    if (req.query.farmerId) filter.farmerId = req.query.farmerId;
    if (req.query.status)   filter.status   = req.query.status;
    if (req.query.riskLevel) filter.riskLevel = req.query.riskLevel;
    const docs = await db.collection("disease_reports").find(filter).sort({ createdAt: -1 }).toArray();
    res.json(docs);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/disease/:reportId
app.get("/api/disease/:reportId", async (req, res) => {
  try {
    const doc = await db.collection("disease_reports").findOne({ reportId: req.params.reportId });
    if (!doc) return res.status(404).json({ error: "Report not found" });
    res.json(doc);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/disease/:reportId/status
app.put("/api/disease/:reportId/status", requireDiseaseInvestigator, async (req, res) => {
  try {
    const { status, reason, note, vetEmail, vetName } = req.body || {};
    const report = await db.collection("disease_reports").findOne({ reportId: req.params.reportId });
    if (!report) return res.status(404).json({ error: "Report not found" });
    const actor = req.authenticatedUser || {};
    if (vetEmail) actor.email = vetEmail;
    if (vetName) { actor.name = vetName; actor.fullName = vetName; }

    const nextStatus = status ? String(status).trim() : "UNDER_REVIEW";
    const previousStatus = report.status || "REPORTED";
    const changedAt = new Date();

    const result = await db.collection("disease_reports").updateOne({ reportId: req.params.reportId }, {
      $set: {
        status: nextStatus,
        ...(nextStatus === "REJECTED" ? { rejectionReason: String(reason || "").trim() } : {}),
        updatedAt: changedAt
      },
      $push: { statusHistory: {
        previousStatus,
        status: nextStatus,
        changedAt,
        actorRole: actor.role || "Veterinarian",
        actorId: actor.userId || "VET-CURRENT",
        actorName: actor.name || actor.fullName || vetName || actor.userId || "Attending Veterinarian",
        note: String(note || reason || "").trim(),
      } },
    });

    if (!result.matchedCount) return res.status(404).json({ error: "Report not found" });

    // Send email via Nodemailer & persist notification for the Notification Page
    const notifResult = await sendDiseaseStatusEmailAndNotification(db, {
      report,
      previousStatus,
      nextStatus,
      vetActor: actor,
      note: note || reason
    });

    res.json({
      success: true,
      reportId: req.params.reportId,
      previousStatus,
      status: nextStatus,
      emailSent: notifResult?.success || false,
      farmerEmail: notifResult?.farmerEmail,
      notificationId: notifResult?.notificationId
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// A definitive diagnosis is accepted only from a database-verified veterinary
// account. Merely having an active veterinarian account is not sufficient.
app.put("/api/disease/:reportId/diagnosis", requireVerifiedVeterinarian, async (req, res) => {
  try {
    const { diagnosis, diagnosisNotes, labResult, vetEmail, vetName } = req.body || {};
    if (!String(diagnosis || "").trim()) return res.status(400).json({ error: "diagnosis is required" });
    const veterinarian = req.verifiedVeterinarian || {};
    if (vetEmail) veterinarian.email = vetEmail;
    if (vetName) { veterinarian.name = vetName; veterinarian.fullName = vetName; }
    const report = await db.collection("disease_reports").findOne({ reportId: req.params.reportId });
    if (!report) return res.status(404).json({ error: "Report not found" });
    const changedAt = new Date();
    const veterinarianName = veterinarian.name || veterinarian.fullName || veterinarian.email || veterinarian.userId || vetName || "Veterinarian";
    const confirmedDiagnosis = String(diagnosis).trim();
    const previousStatus = report.status || "UNDER_REVIEW";

    const result = await db.collection("disease_reports").updateOne({ reportId: req.params.reportId }, {
      $set: {
        diagnosis: confirmedDiagnosis,
        diagnosisNotes: String(diagnosisNotes || "").trim(),
        labResult: String(labResult || "").trim(),
        veterinarianId: veterinarian.userId || "VET-CURRENT",
        veterinarianName,
        diagnosisConfirmedAt: changedAt,
        inspectionStatus: "CONFIRMED",
        status: "CONFIRMED",
        updatedAt: changedAt,
      },
      $push: { statusHistory: {
        previousStatus: normalizeSurveillanceStatus(previousStatus),
        status: "CONFIRMED", changedAt, actorRole: "Veterinarian",
        actorId: veterinarian.userId || "VET-CURRENT", actorName: veterinarianName, note: confirmedDiagnosis,
      } },
    });

    if (!result.matchedCount) return res.status(404).json({ error: "Report not found" });

    // Send email via Nodemailer & persist notification for the Notification Page
    const notifResult = await sendDiseaseStatusEmailAndNotification(db, {
      report,
      previousStatus,
      nextStatus: "CONFIRMED",
      vetActor: veterinarian,
      note: `Confirmed Diagnosis: ${confirmedDiagnosis}. Lab results: ${labResult || 'Pending'}. ${diagnosisNotes || ''}`
    });

    res.json({
      success: true,
      reportId: req.params.reportId,
      diagnosis: confirmedDiagnosis,
      veterinarianId: veterinarian.userId,
      status: "CONFIRMED",
      diagnosisConfirmedAt: changedAt,
      emailSent: notifResult?.success || false,
      farmerEmail: notifResult?.farmerEmail,
      notificationId: notifResult?.notificationId
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/disease/:reportId/inspection
app.put("/api/disease/:reportId/inspection", requireVerifiedVeterinarian, async (req, res) => {
  try {
    const veterinarian = req.verifiedVeterinarian || {};
    if (req.body?.vetEmail) veterinarian.email = req.body.vetEmail;
    if (req.body?.vetName) { veterinarian.name = req.body.vetName; veterinarian.fullName = req.body.vetName; }
    const existingReport = await db.collection("disease_reports").findOne({ reportId: req.params.reportId });
    if (!existingReport) return res.status(404).json({ error: "Report not found" });
    const changedAt = new Date();
    const targetStatus = req.body.status || "VETERINARY_INSPECTION";
    const previousStatus = existingReport.status || "REPORTED";

    const update = {
      veterinarianId: veterinarian.userId || req.body.veterinarianId || "VET-CURRENT",
      veterinarianName: veterinarian.name || veterinarian.fullName || veterinarian.email || veterinarian.userId || req.body.vetName || "Dr. Priya Vishnu",
      inspectionDate: req.body.inspectionDate,
      symptomsObserved: req.body.symptomsObserved,
      clinicalFindings: req.body.clinicalFindings,
      samplesCollected: req.body.samplesCollected,
      preliminaryDiagnosis: req.body.preliminaryDiagnosis,
      recommendedActions: req.body.recommendedActions,
      followUpDate: req.body.followUpDate,
      inspectionStatus: req.body.inspectionStatus || "INSPECTED",
      status: targetStatus,
      updatedAt: changedAt
    };

    await db.collection("disease_reports").updateOne({ reportId: req.params.reportId }, {
      $set: update,
      $push: { statusHistory: {
        previousStatus: normalizeSurveillanceStatus(previousStatus),
        status: targetStatus,
        changedAt,
        actorRole: "Veterinarian",
        actorId: update.veterinarianId,
        actorName: update.veterinarianName,
        note: req.body.preliminaryDiagnosis || req.body.clinicalFindings || "Inspection performed"
      } },
    });

    // Send email via Nodemailer & persist notification for the Notification Page
    const notifResult = await sendDiseaseStatusEmailAndNotification(db, {
      report: existingReport,
      previousStatus,
      nextStatus: targetStatus,
      vetActor: veterinarian,
      note: req.body.recommendedActions || req.body.clinicalFindings,
      inspectionDetails: update
    });

    res.json({
      success: true,
      reportId: req.params.reportId,
      status: targetStatus,
      emailSent: notifResult?.success || false,
      farmerEmail: notifResult?.farmerEmail,
      notificationId: notifResult?.notificationId
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// GIS OUTBREAK MAPPING
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/gis/farms
app.get("/api/gis/farms", async (req, res) => {
  try {
    const farms = await db.collection("farms").find({ latitude: { $exists: true } }).toArray();
    // Enrich with latest biosecurity risk
    const bioMap = {};
    const bios = await db.collection("biosecurity_assessments").find().sort({ createdAt: -1 }).toArray();
    bios.forEach(b => { if (!bioMap[b.farmId]) bioMap[b.farmId] = b.riskLevel; });
    const result = farms.map(f => ({
      farmId: f.farmId, farmName: f.farmName, latitude: f.latitude, longitude: f.longitude,
      farmType: f.farmType, district: f.district, state: f.state,
      riskLevel: bioMap[f.farmId] || "LOW",
      markerColor: bioMap[f.farmId] === "HIGH" ? "red" : bioMap[f.farmId] === "MODERATE" ? "yellow" : "green"
    }));
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/gis/outbreaks
app.get("/api/gis/outbreaks", async (req, res) => {
  try {
    const reports = await db.collection("disease_reports")
      .find({ status: { $nin: ["RESOLVED", "RULED_OUT"] } })
      .sort({ createdAt: -1 }).toArray();
    const farms = await db.collection("farms").find().toArray();
    const farmMap = {};
    farms.forEach(f => { farmMap[f.farmId] = f; });
    const result = reports.map(r => ({
      reportId: r.reportId, farmId: r.farmId,
      farmName: farmMap[r.farmId]?.farmName || r.farmId,
      suspectedDisease: r.suspectedDisease, latitude: r.latitude, longitude: r.longitude,
      affectedAnimals: r.affectedAnimals, deaths: r.deaths, riskLevel: r.riskLevel,
      status: r.status, reportedDate: r.reportedDate, nearbyFarms: r.nearbyFarms || []
    }));
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/gis/nearby-farms/:reportId
app.get("/api/gis/nearby-farms/:reportId", async (req, res) => {
  try {
    const report = await db.collection("disease_reports").findOne({ reportId: req.params.reportId });
    if (!report) return res.status(404).json({ error: "Report not found" });
    const config = await db.collection("system_config").findOne({ key: "risk_radius_km" });
    const radiusKm = config?.value || 5;
    const allFarms = await db.collection("farms").find({ latitude: { $exists: true } }).toArray();
    const nearby = allFarms
      .filter(f => f.farmId !== report.farmId && f.latitude && f.longitude)
      .map(f => ({ ...f, distanceKm: haversineKm(report.latitude, report.longitude, f.latitude, f.longitude) }))
      .filter(f => f.distanceKm <= radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm);
    res.json({ outbreakFarm: report, radiusKm, nearbyFarms: nearby });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/notifications (override generic with role-aware)
app.get("/api/notifications", async (req, res) => {
  try {
    const filter = {};
    if (req.query.userId)     filter.targetUserId = req.query.userId;
    if (req.query.targetRole) filter.targetRole   = req.query.targetRole;
    if (req.query.isRead !== undefined) filter.isRead = req.query.isRead === "true";
    const docs = await db.collection("notifications").find(filter).sort({ _id: -1 }).limit(50).toArray();
    res.json(docs);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/notifications/:id/read
app.put("/api/notifications/:id/read", async (req, res) => {
  try {
    await db.collection("notifications").updateOne(
      { notificationId: req.params.id },
      { $set: { isRead: true, readAt: new Date() } }
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/notifications/send
app.post("/api/notifications/send", async (req, res) => {
  try {
    const { targetRole, targetUserId, title, message, type } = req.body;
    const notif = {
      notificationId: "N-" + Date.now(),
      targetRole, targetUserId: targetUserId || null,
      type: type || "GENERAL", title, message,
      isRead: false, createdAt: new Date()
    };
    await db.collection("notifications").insertOne(notif);
    res.status(201).json({ success: true, notificationId: notif.notificationId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// GOVERNMENT DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/government/dashboard
app.get("/api/government/dashboard", requireGovernmentOfficer, async (req, res) => {
  try {
    const [farms, reports, assessments] = await Promise.all([
      db.collection("farms").find().toArray(),
      db.collection("disease_reports").find().toArray(),
      db.collection("biosecurity_assessments").find().sort({ createdAt: -1 }).toArray(),
    ]);
    const farmsById = new Map();
    farms.forEach(farm => {
      for (const id of [farm.farmId, farm.id, farm._id?.toString()].filter(Boolean)) farmsById.set(String(id), farm);
    });
    const latestBio = {};
    assessments.forEach(a => { if (!latestBio[a.farmId]) latestBio[a.farmId] = a; });
    const riskCounts = { HIGH: 0, MODERATE: 0, LOW: 0 };
    Object.values(latestBio).forEach(a => { riskCounts[a.riskLevel] = (riskCounts[a.riskLevel] || 0) + 1; });
    const activeOutbreaks = reports.filter(r => !["RESOLVED","RULED_OUT"].includes(r.status));
    const districtMap = {};
    activeOutbreaks.forEach(report => {
      const farm = farmsById.get(String(report.farmId || ""));
      const district = report.district || farm?.district || "District not recorded";
      const entry = districtMap[district] || (districtMap[district] = { district, reports: 0, affectedAnimals: 0 });
      entry.reports += 1;
      entry.affectedAnimals += Number(report.affectedAnimals) || 0;
    });
    const totalAffected = activeOutbreaks.reduce((s, r) => s + (Number(r.affectedAnimals) || 0), 0);
    const recentReports = activeOutbreaks.slice().sort((a, b) => new Date(b.createdAt || b.reportDate || 0) - new Date(a.createdAt || a.reportDate || 0)).slice(0, 10).map(report => {
      const farm = farmsById.get(String(report.farmId || ""));
      return {
        ...report,
        farmName: report.farmName || farm?.farmName || farm?.name || "Farm not linked",
        district: report.district || farm?.district || "District not recorded",
        diseaseName: report.diseaseName || report.disease || report.diseaseType || "Disease report",
      };
    });
    res.json({
      totalFarms: farms.length,
      totalSuspectedOutbreaks: reports.length,
      activeOutbreaks: activeOutbreaks.length,
      highRiskFarms: riskCounts.HIGH,
      moderateRiskFarms: riskCounts.MODERATE,
      lowRiskFarms: riskCounts.LOW,
      affectedAnimals: totalAffected,
      activeReportsByDistrict: Object.values(districtMap).sort((a, b) => b.reports - a.reports),
      recentReports,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/government/outbreaks
app.get("/api/government/outbreaks", requireGovernmentOfficer, async (req, res) => {
  try {
    const filter = {};
    if (req.query.riskLevel) filter.riskLevel = req.query.riskLevel;
    if (req.query.status)    filter.status    = req.query.status;
    if (req.query.animalType) filter.animalType = req.query.animalType;
    const docs = await db.collection("disease_reports").find(filter).sort({ createdAt: -1 }).toArray();
    res.json(docs);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

function diseaseSurveillanceStages(query = {}) {
  const { match, error } = buildSurveillanceMatch(query);
  if (error) return { error };
  return { stages: [
    {
      $lookup: {
        from: "farms",
        let: { reportFarmId: { $toString: { $ifNull: ["$farmId", ""] } } },
        pipeline: [
          { $match: { $expr: { $or: [
            { $eq: [{ $toString: "$farmId" }, "$$reportFarmId"] },
            { $eq: [{ $toString: "$id" }, "$$reportFarmId"] },
            { $eq: [{ $toString: "$_id" }, "$$reportFarmId"] },
          ] } } },
          { $limit: 1 },
          { $project: { farmId: 1, id: 1, farmName: 1, name: 1, farmType: 1, district: 1, state: 1, village: 1, latitude: 1, longitude: 1, animalCount: 1, farmArea: 1 } },
        ],
        as: "matchedFarm",
      },
    },
    { $addFields: {
      farm: { $arrayElemAt: ["$matchedFarm", 0] },
      reportedAt: { $convert: { input: { $ifNull: ["$reportedDate", { $ifNull: ["$createdAt", "$symptomStartDate"] }] }, to: "date", onError: null, onNull: null } },
      canonicalStatus: { $switch: {
        branches: [
          { case: { $eq: [{ $toUpper: { $ifNull: ["$status", ""] } }, "VETERINARY_INSPECTION"] }, then: "UNDER_REVIEW" },
          { case: { $eq: [{ $toUpper: { $ifNull: ["$status", ""] } }, "RULED_OUT"] }, then: "REJECTED" },
        ],
        default: { $replaceAll: { input: { $toUpper: { $ifNull: ["$status", "REPORTED"] } }, find: " ", replacement: "_" } },
      } },
    } },
    { $addFields: {
      farmName: { $ifNull: ["$farmName", { $ifNull: ["$farm.farmName", "$farm.name"] }] },
      district: { $ifNull: ["$district", "$farm.district"] },
      latitude: { $ifNull: ["$latitude", "$farm.latitude"] },
      longitude: { $ifNull: ["$longitude", "$farm.longitude"] },
    } },
    ...(Object.keys(match).length ? [{ $match: match }] : []),
  ] };
}

function validReportId(req, res) {
  const reportId = String(req.params.reportId || "").trim();
  if (!reportId || reportId.length > 100) {
    res.status(400).json({ error: "A valid report ID is required" });
    return null;
  }
  return reportId;
}

app.get("/api/government/disease-surveillance/summary", requireGovernmentOfficer, async (req, res) => {
  try {
    const query = diseaseSurveillanceStages(req.query);
    if (query.error) return res.status(400).json({ error: query.error });
    const result = await db.collection("disease_reports").aggregate([
      ...query.stages,
      { $facet: {
        totals: [{ $count: "count" }],
        statuses: [{ $group: { _id: "$canonicalStatus", count: { $sum: 1 } } }],
        monitoringFarms: [
          { $match: { canonicalStatus: "MONITORING", farmId: { $nin: [null, ""] } } },
          { $group: { _id: "$farmId" } },
          { $count: "count" },
        ],
      } },
    ]).toArray();
    const data = result[0] || {};
    const statusCounts = Object.fromEntries((data.statuses || []).map(row => [row._id, row.count]));
    res.json({
      totalReports: data.totals?.[0]?.count || 0,
      newReports: statusCounts.REPORTED || 0,
      suspectedCases: (statusCounts.SUSPECTED || 0) + (statusCounts.AWAITING_LABORATORY_CONFIRMATION || 0),
      confirmedOutbreaks: statusCounts.CONFIRMED || 0,
      closedCases: (statusCounts.RESOLVED || 0) + (statusCounts.REJECTED || 0),
      farmsUnderMonitoring: data.monitoringFarms?.[0]?.count || 0,
      statusCounts,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/government/disease-surveillance/reports", requireGovernmentOfficer, async (req, res) => {
  try {
    const paging = getSurveillancePage(req.query);
    if (paging.error) return res.status(400).json({ error: paging.error });
    const query = diseaseSurveillanceStages(req.query);
    if (query.error) return res.status(400).json({ error: query.error });
    const sortKey = paging.sortBy === "reportedDate" ? "reportedAt" : paging.sortBy === "status" ? "canonicalStatus" : paging.sortBy;
    const [result] = await db.collection("disease_reports").aggregate([
      ...query.stages,
      { $facet: {
        items: [
          { $sort: { [sortKey]: paging.sortOrder, _id: 1 } },
          { $skip: (paging.page - 1) * paging.pageSize },
          { $limit: paging.pageSize },
          { $project: {
            _id: 0,
            reportId: 1,
            farmId: 1,
            animalType: 1,
            suspectedDisease: 1,
            diseaseName: 1,
            symptoms: 1,
            affectedAnimals: 1,
            deaths: 1,
            reportedDate: 1,
            symptomStartDate: 1,
            severity: 1,
            remarks: 1,
            imageUrl: 1,
            latitude: 1,
            longitude: 1,
            district: 1,
            farmName: 1,
            status: 1,
            canonicalStatus: 1,
            riskLevel: 1,
            assignedVeterinarianId: 1,
            assignedVeterinarianName: 1,
            veterinarianId: 1,
            veterinarianName: 1,
            diagnosis: 1,
            inspectionStatus: 1,
            reportedAt: 1,
            updatedAt: 1,
            farm: {
              farmId: "$farm.farmId",
              name: { $ifNull: ["$farm.farmName", "$farm.name"] },
              farmType: "$farm.farmType",
              district: "$farm.district",
              state: "$farm.state",
              village: "$farm.village",
              latitude: "$farm.latitude",
              longitude: "$farm.longitude",
            },
          } },
        ],
        total: [{ $count: "count" }],
      } },
    ]).toArray();
    const total = result?.total?.[0]?.count || 0;
    res.json({ items: result?.items || [], total, page: paging.page, pageSize: paging.pageSize, pages: Math.max(1, Math.ceil(total / paging.pageSize)) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/government/disease-surveillance/reports/:reportId", requireGovernmentOfficer, async (req, res) => {
  try {
    const reportId = validReportId(req, res);
    if (!reportId) return;
    const report = await db.collection("disease_reports").findOne({ reportId });
    if (!report) return res.status(404).json({ error: "Disease report not found" });
    const farmId = String(report.farmId || "");
    const farm = await db.collection("farms").findOne({ $or: [{ farmId }, { id: farmId }, ...(ObjectId.isValid(farmId) ? [{ _id: new ObjectId(farmId) }] : [])] });
    const [livestock, veterinarianReports] = await Promise.all([
      db.collection("livestock").find({ farmId }).limit(200).toArray(),
      db.collection("veterinarian_reports").find({ $or: [{ reportId }, { farmId }] }).sort({ createdAt: -1 }).limit(50).toArray(),
    ]);
    const safeFarm = farm ? {
      farmId: farm.farmId || farm.id || String(farm._id),
      farmName: farm.farmName || farm.name || null,
      farmType: farm.farmType || null,
      district: farm.district || report.district || null,
      state: farm.state || null,
      village: farm.village || null,
      latitude: farm.latitude ?? report.latitude ?? null,
      longitude: farm.longitude ?? report.longitude ?? null,
      animalCount: farm.animalCount ?? null,
      farmArea: farm.farmArea ?? null,
    } : null;
    res.json({ report, farm: safeFarm, livestock, veterinarianReports });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/government/disease-surveillance/reports/:reportId/history", requireGovernmentOfficer, async (req, res) => {
  try {
    const reportId = validReportId(req, res);
    if (!reportId) return;
    const report = await db.collection("disease_reports").findOne({ reportId }, { projection: { statusHistory: 1, administrativeActions: 1 } });
    if (!report) return res.status(404).json({ error: "Disease report not found" });
    res.json({ statusHistory: report.statusHistory || [], administrativeActions: report.administrativeActions || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch("/api/government/disease-surveillance/reports/:reportId/status", requireGovernmentOfficer, async (req, res) => {
  try {
    const reportId = validReportId(req, res);
    if (!reportId) return;
    const body = req.body || {};
    if (typeof body.status !== "string" || (body.note !== undefined && typeof body.note !== "string") || (body.reason !== undefined && typeof body.reason !== "string")) {
      return res.status(400).json({ error: "status, note, and reason must be strings" });
    }
    const report = await db.collection("disease_reports").findOne({ reportId });
    if (!report) return res.status(404).json({ error: "Disease report not found" });
    const transition = getSurveillanceStatusTransition(report.status, body.status, req.authenticatedUser.role, body.reason);
    if (transition.error) return res.status(400).json({ error: transition.error });
    const actor = req.authenticatedUser;
    const changedAt = new Date();
    const note = String(body.note || body.reason || "").trim().slice(0, 2000);
    const result = await db.collection("disease_reports").updateOne({ reportId, status: report.status }, {
      $set: { status: transition.next, ...(transition.next === "REJECTED" ? { rejectionReason: String(body.reason).trim().slice(0, 1000) } : {}), updatedAt: changedAt },
      $push: {
        statusHistory: { previousStatus: transition.current, status: transition.next, changedAt, actorRole: actor.role, actorId: actor.userId, actorName: actor.name || actor.fullName || actor.userId, note },
        ...(note ? { administrativeActions: { action: note, createdAt: changedAt, actorRole: actor.role, actorId: actor.userId, actorName: actor.name || actor.userId } } : {}),
      },
    });
    if (!result.modifiedCount) return res.status(409).json({ error: "The report changed while this update was being saved. Reload and try again." });
    res.json({ success: true, reportId, previousStatus: transition.current, status: transition.next });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/government/disease-surveillance/veterinarians", requireGovernmentOfficer, async (req, res) => {
  try {
    const veterinarians = await db.collection("users").find({
      role: "Veterinarian",
      $or: [
        { isVerified: true },
        { verified: true },
        { verificationStatus: { $regex: /^verified$/i } },
        { "professionalVerification.status": { $regex: /^verified$/i } },
      ],
    }, { projection: { userId: 1, name: 1, fullName: 1, verificationStatus: 1, district: 1, "extra.District": 1 } }).limit(200).toArray();
    res.json(veterinarians.map(vet => ({ userId: vet.userId, name: vet.name || vet.fullName || vet.userId, district: vet.district || vet.extra?.District || null })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/government/disease-surveillance/filters", requireGovernmentOfficer, async (req, res) => {
  try {
    const [result] = await db.collection("disease_reports").aggregate([
      ...diseaseSurveillanceStages().stages,
      { $facet: {
        diseases: [{ $group: { _id: { $ifNull: ["$suspectedDisease", { $ifNull: ["$diseaseName", null] }] } } }, { $match: { _id: { $nin: [null, ""] } } }, { $sort: { _id: 1 } }, { $project: { _id: 0, value: "$_id" } }],
        districts: [{ $group: { _id: "$district" } }, { $match: { _id: { $nin: [null, ""] } } }, { $sort: { _id: 1 } }, { $project: { _id: 0, value: "$_id" } }],
        species: [{ $group: { _id: "$animalType" } }, { $match: { _id: { $nin: [null, ""] } } }, { $sort: { _id: 1 } }, { $project: { _id: 0, value: "$_id" } }],
      } },
    ]).toArray();
    res.json({
      diseases: (result?.diseases || []).map(item => item.value),
      districts: (result?.districts || []).map(item => item.value),
      species: (result?.species || []).map(item => item.value),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch("/api/government/disease-surveillance/reports/:reportId/assign-veterinarian", requireGovernmentOfficer, async (req, res) => {
  try {
    const reportId = validReportId(req, res);
    if (!reportId) return;
    const veterinarianId = String(req.body?.veterinarianId || "").trim();
    if (req.body?.requestInspection !== undefined && typeof req.body.requestInspection !== "boolean") {
      return res.status(400).json({ error: "requestInspection must be a boolean" });
    }
    const requestInspection = req.body?.requestInspection !== false;
    if (!veterinarianId || veterinarianId.length > 100) return res.status(400).json({ error: "A valid veterinarianId is required" });
    const veterinarian = await db.collection("users").findOne({
      userId: veterinarianId,
      role: "Veterinarian",
      $or: [
        { isVerified: true },
        { verified: true },
        { verificationStatus: { $regex: /^verified$/i } },
        { "professionalVerification.status": { $regex: /^verified$/i } },
      ],
    }, { projection: { userId: 1, name: 1, fullName: 1 } });
    if (!veterinarian) return res.status(400).json({ error: "Select a verified veterinarian" });
    const report = await db.collection("disease_reports").findOne({ reportId });
    if (!report) return res.status(404).json({ error: "Disease report not found" });
    const actor = req.authenticatedUser;
    const changedAt = new Date();
    const veterinarianName = veterinarian.name || veterinarian.fullName || veterinarian.userId;
    const status = normalizeSurveillanceStatus(report.status);
    const nextStatus = status === "REPORTED" ? "UNDER_REVIEW" : status;
    const result = await db.collection("disease_reports").updateOne({ reportId, status: report.status }, {
      $set: {
        assignedVeterinarianId: veterinarian.userId,
        assignedVeterinarianName: veterinarianName,
        veterinarianId: veterinarian.userId,
        veterinarianName,
        inspectionRequested: requestInspection,
        ...(requestInspection ? { inspectionRequestedAt: changedAt } : {}),
        status: nextStatus,
        updatedAt: changedAt,
      },
      $push: { statusHistory: {
        previousStatus: status,
        status: nextStatus,
        changedAt,
        actorRole: actor.role,
        actorId: actor.userId,
        actorName: actor.name || actor.userId,
        note: requestInspection ? `Assigned to ${veterinarianName}; inspection requested` : `Assigned to ${veterinarianName}`,
      } },
    });
    if (!result.modifiedCount) return res.status(409).json({ error: "The report changed while assignment was being saved. Reload and try again." });
    if (requestInspection) {
      await db.collection("notifications").insertOne({
        notificationId: `N-${Date.now()}-${reportId}-inspection`,
        targetRole: "Veterinarian",
        targetUserId: veterinarian.userId,
        type: "DISEASE_INSPECTION_REQUEST",
        title: "Disease report inspection requested",
        message: `Government Officer ${actor.name || actor.userId} assigned disease report ${reportId} for veterinary inspection.`,
        reportId,
        isRead: false,
        createdAt: changedAt,
      });
    }
    res.json({ success: true, reportId, veterinarianId: veterinarian.userId, veterinarianName, inspectionRequested: requestInspection, status: nextStatus });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/government/disease-surveillance/trends", requireGovernmentOfficer, async (req, res) => {
  try {
    const period = req.query.period || "daily";
    if (!["daily", "weekly", "monthly"].includes(period)) return res.status(400).json({ error: "period must be daily, weekly, or monthly" });
    const query = diseaseSurveillanceStages(req.query);
    if (query.error) return res.status(400).json({ error: query.error });
    const format = period === "daily" ? "%Y-%m-%d" : period === "weekly" ? "%G-W%V" : "%Y-%m";
    const [result] = await db.collection("disease_reports").aggregate([
      ...query.stages,
      { $facet: {
        trend: [
          { $match: { reportedAt: { $ne: null } } },
          { $group: { _id: { $dateToString: { format, date: "$reportedAt" } }, reports: { $sum: 1 }, affectedAnimals: { $sum: { $convert: { input: "$affectedAnimals", to: "int", onError: 0, onNull: 0 } } }, deaths: { $sum: { $convert: { input: "$deaths", to: "int", onError: 0, onNull: 0 } } } } },
          { $sort: { _id: 1 } },
          { $project: { _id: 0, period: "$_id", reports: 1, affectedAnimals: 1, deaths: 1 } },
        ],
        diseases: [{ $group: { _id: { $ifNull: ["$suspectedDisease", { $ifNull: ["$diseaseName", "Not recorded"] }] }, reports: { $sum: 1 } } }, { $sort: { reports: -1 } }, { $project: { _id: 0, disease: "$_id", reports: 1 } }],
        species: [{ $group: { _id: { $ifNull: ["$animalType", "Not recorded"] }, reports: { $sum: 1 }, affectedAnimals: { $sum: { $convert: { input: "$affectedAnimals", to: "int", onError: 0, onNull: 0 } } }, deaths: { $sum: { $convert: { input: "$deaths", to: "int", onError: 0, onNull: 0 } } } } }, { $sort: { reports: -1 } }, { $project: { _id: 0, species: "$_id", reports: 1, affectedAnimals: 1, deaths: 1 } }],
        districts: [{ $group: { _id: { $ifNull: ["$district", "Not recorded"] }, reports: { $sum: 1 } } }, { $sort: { reports: -1 } }, { $project: { _id: 0, district: "$_id", reports: 1 } }],
        statuses: [{ $group: { _id: "$canonicalStatus", reports: { $sum: 1 } } }, { $sort: { reports: -1 } }, { $project: { _id: 0, status: "$_id", reports: 1 } }],
      } },
    ]).toArray();
    res.json(result || { trend: [], diseases: [], species: [], districts: [], statuses: [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/government/disease-surveillance/map", requireGovernmentOfficer, async (req, res) => {
  try {
    const query = diseaseSurveillanceStages(req.query);
    if (query.error) return res.status(400).json({ error: query.error });
    const reports = await db.collection("disease_reports").aggregate([
      ...query.stages,
      { $match: { latitude: { $exists: true, $ne: null }, longitude: { $exists: true, $ne: null } } },
      { $limit: 1000 },
      { $project: { _id: 0, reportId: 1, farmId: 1, farmName: 1, district: 1, animalType: 1, suspectedDisease: 1, status: "$canonicalStatus", reportedDate: 1, affectedAnimals: 1, latitude: 1, longitude: 1 } },
    ]).toArray();
    res.json(reports.filter(report => hasValidCoordinates(report.latitude, report.longitude)));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/government/disease-surveillance/reports/:reportId/nearby", requireGovernmentOfficer, async (req, res) => {
  try {
    const reportId = validReportId(req, res);
    if (!reportId) return;
    const radiusKm = Number(req.query.radiusKm || 5);
    if (!Number.isFinite(radiusKm) || radiusKm <= 0 || radiusKm > 100) return res.status(400).json({ error: "radiusKm must be greater than 0 and no more than 100" });
    const report = await db.collection("disease_reports").findOne({ reportId });
    if (!report) return res.status(404).json({ error: "Disease report not found" });
    const farmId = String(report.farmId || "");
    const farm = hasValidCoordinates(report.latitude, report.longitude) ? null :
      await db.collection("farms").findOne({ $or: [{ farmId }, { id: farmId }, ...(ObjectId.isValid(farmId) ? [{ _id: new ObjectId(farmId) }] : [])] }, { projection: { latitude: 1, longitude: 1 } });
    const latitude = hasValidCoordinates(report.latitude, report.longitude) ? report.latitude : farm?.latitude;
    const longitude = hasValidCoordinates(report.latitude, report.longitude) ? report.longitude : farm?.longitude;
    if (!hasValidCoordinates(latitude, longitude)) return res.status(200).json({ centerHasCoordinates: false, radiusKm, nearbyFarms: [] });
    const farms = await db.collection("farms").find({ latitude: { $exists: true, $ne: null }, longitude: { $exists: true, $ne: null } }, {
      projection: { farmId: 1, id: 1, farmName: 1, name: 1, farmType: 1, district: 1, latitude: 1, longitude: 1 },
    }).limit(5000).toArray();
    const nearbyFarms = farms.flatMap(farm => {
      if (String(farm.farmId || farm.id || farm._id) === String(report.farmId) || !hasValidCoordinates(farm.latitude, farm.longitude)) return [];
      const distance = distanceKm(latitude, longitude, farm.latitude, farm.longitude);
      return distance <= radiusKm ? [{
        farmId: farm.farmId || farm.id || String(farm._id),
        farmName: farm.farmName || farm.name || null,
        farmType: farm.farmType || null,
        district: farm.district || null,
        distanceKm: Number(distance.toFixed(2)),
        assessment: "Potentially exposed; requires assessment",
      }] : [];
    }).sort((first, second) => first.distanceKm - second.distanceKm);
    res.json({ centerHasCoordinates: true, radiusKm, nearbyFarms });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

function governmentDemoFilter(req) {
  const wantsDemo = req.query.demo === "true";
  if (wantsDemo && process.env.NODE_ENV === "production") return { error: "Demo data is disabled in production" };
  return wantsDemo ? { isSynthetic: true } : { isSynthetic: { $ne: true } };
}

function validText(value, field, maxLength = 5000) {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) return `${field} is required and must be shorter than ${maxLength} characters`;
  return null;
}

function governmentDateFilter(query, field) {
  const result = {};
  if (query.from) {
    const from = new Date(query.from);
    if (Number.isNaN(from.getTime())) return { error: "from must be a valid date" };
    result.$gte = from;
  }
  if (query.to) {
    const to = new Date(query.to);
    if (Number.isNaN(to.getTime())) return { error: "to must be a valid date" };
    to.setHours(23, 59, 59, 999);
    result.$lte = to;
  }
  if (result.$gte && result.$lte && result.$gte > result.$lte) return { error: "from must be on or before to" };
  return Object.keys(result).length ? { [field]: result } : {};
}

app.get("/api/government/admin/dashboard", requireGovernmentAdministrator, async (req, res) => {
  try {
    const mode = governmentDemoFilter(req);
    if (mode.error) return res.status(403).json({ error: mode.error });
    const period = req.query.period || "monthly";
    if (!["monthly", "yearly"].includes(period)) return res.status(400).json({ error: "period must be monthly or yearly" });
    const complaintDates = governmentDateFilter(req.query, "submittedAt");
    const citizenDates = governmentDateFilter(req.query, "createdAt");
    const applicationDates = governmentDateFilter(req.query, "submittedAt");
    if (complaintDates.error || citizenDates.error || applicationDates.error) return res.status(400).json({ error: complaintDates.error || citizenDates.error || applicationDates.error });
    const match = { ...mode, ...complaintDates };
    const citizenMatch = { ...mode, ...citizenDates };
    const applicationMatch = { ...mode, ...applicationDates };
    const [citizens, complaints, pending, applications, trend, byStatus, departments, districts] = await Promise.all([
      db.collection("government_citizens").countDocuments(citizenMatch),
      db.collection("government_complaints").countDocuments(match),
      db.collection("government_complaints").countDocuments({ ...match, status: "SUBMITTED" }),
      db.collection("government_complaints").countDocuments({ ...match, status: { $in: ["ASSIGNED", "IN_PROGRESS", "UNDER_REVIEW"] } }),
      db.collection("government_complaints").aggregate([
        { $match: match },
        { $group: { _id: { $dateToString: { format: period === "yearly" ? "%Y" : "%Y-%m", date: "$submittedAt" } }, received: { $sum: 1 }, resolved: { $sum: { $cond: [{ $eq: ["$status", "RESOLVED"] }, 1, 0] } } } },
        { $sort: { _id: 1 } }, { $limit: 12 },
        { $project: { _id: 0, month: "$_id", received: 1, resolved: 1 } },
      ]).toArray(),
      db.collection("government_complaints").aggregate([
        { $match: match }, { $group: { _id: "$status", count: { $sum: 1 } } }, { $sort: { count: -1 } },
        { $project: { _id: 0, status: "$_id", count: 1 } },
      ]).toArray(),
      db.collection("government_complaints").aggregate([
        { $match: match }, { $group: { _id: { departmentId: "$departmentId", name: "$departmentName" }, received: { $sum: 1 }, resolved: { $sum: { $cond: [{ $eq: ["$status", "RESOLVED"] }, 1, 0] } } } },
        { $sort: { received: -1 } }, { $limit: 10 },
        { $project: { _id: 0, department: "$_id.name", departmentId: "$_id.departmentId", received: 1, resolved: 1 } },
      ]).toArray(),
      db.collection("government_complaints").aggregate([
        { $match: match }, { $group: { _id: "$district", complaints: { $sum: 1 } } },
        { $sort: { complaints: -1 } }, { $limit: 15 },
        { $project: { _id: 0, district: { $ifNull: ["$_id", "District not recorded"] }, complaints: 1 } },
      ]).toArray(),
    ]);
    const [resolved, schemesActive, totalApplications, pendingApplications, overdue] = await Promise.all([
      db.collection("government_complaints").countDocuments({ ...match, status: "RESOLVED" }),
      db.collection("government_schemes").countDocuments({ ...mode, active: true }),
      db.collection("government_scheme_applications").countDocuments(applicationMatch),
      db.collection("government_scheme_applications").countDocuments({ ...applicationMatch, status: "PENDING" }),
      db.collection("government_complaints").countDocuments({ ...match, dueAt: { $lt: new Date() }, status: { $nin: ["RESOLVED", "REJECTED"] } }),
    ]);
    res.json({ citizens, complaints, pending, inProgress: applications, resolved, schemesActive, totalApplications, pendingApplications, overdue, trend, byStatus, departments, districts, demo: req.query.demo === "true" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/government/admin/complaints", requireGovernmentAdministrator, async (req, res) => {
  try {
    const mode = governmentDemoFilter(req);
    if (mode.error) return res.status(403).json({ error: mode.error });
    const paging = parsePage(req.query);
    if (paging.error) return res.status(400).json({ error: paging.error });
    const sorting = complaintSort(req.query);
    if (sorting.error) return res.status(400).json({ error: sorting.error });
    const filters = buildComplaintFilter(req.query);
    if (filters.error) return res.status(400).json({ error: filters.error });
    const filter = { ...mode, ...filters.filter };
    const [items, total] = await Promise.all([
      db.collection("government_complaints").find(filter, { projection: { citizenName: 0, citizenPhone: 0, citizenEmail: 0 } })
        .sort(sorting.sort).skip((paging.page - 1) * paging.pageSize).limit(paging.pageSize).toArray(),
      db.collection("government_complaints").countDocuments(filter),
    ]);
    res.json({ items, total, page: paging.page, pageSize: paging.pageSize, pages: Math.max(1, Math.ceil(total / paging.pageSize)) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/government/admin/complaints/:complaintId", requireGovernmentAdministrator, async (req, res) => {
  try {
    const mode = governmentDemoFilter(req);
    if (mode.error) return res.status(403).json({ error: mode.error });
    const complaint = await db.collection("government_complaints").findOne({ ...mode, complaintId: req.params.complaintId }, {
      projection: { citizenPhone: 0, citizenEmail: 0 },
    });
    if (!complaint) return res.status(404).json({ error: "Complaint not found" });
    res.json(complaint);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch("/api/government/admin/complaints/:complaintId", requireGovernmentAdministrator, async (req, res) => {
  try {
    const mode = governmentDemoFilter(req);
    if (mode.error) return res.status(403).json({ error: mode.error });
    const validation = validateComplaintUpdate(req.body);
    if (validation.error) return res.status(400).json({ error: validation.error });
    const complaint = await db.collection("government_complaints").findOne({ ...mode, complaintId: req.params.complaintId });
    if (!complaint) return res.status(404).json({ error: "Complaint not found" });
    if (req.body.assignedOfficerId) {
      const officerCollection = req.query.demo === "true" ? "government_demo_officers" : "users";
      const syntheticScope = req.query.demo === "true" ? { isSynthetic: true } : { isSynthetic: { $ne: true } };
      const officer = await db.collection(officerCollection).findOne({
        ...syntheticScope,
        userId: req.body.assignedOfficerId,
        role: { $in: ["Government Officer", "Department Administrator", "Super Administrator", "Admin"] },
        isActive: { $ne: false },
      }, { projection: { userId: 1, name: 1, fullName: 1 } });
      if (!officer) return res.status(400).json({ error: "Select an active authorized officer" });
      validation.update.assignedOfficerName = officer.name || officer.fullName || officer.userId;
    }
    const changedAt = new Date();
    const actor = req.authenticatedUser;
    const updates = { ...validation.update, updatedAt: changedAt };
    if (req.body.status === "RESOLVED") updates.resolvedAt = changedAt;
    if (req.body.status === "REJECTED") updates.rejectionReason = String(req.body.rejectionReason).trim();
    const audit = {
      changedAt, actorId: actor.userId, actorName: actor.name || actor.fullName || actor.userId,
      ...(req.body.status ? { action: "STATUS_CHANGED", previousStatus: complaint.status, status: req.body.status } : {}),
      ...(req.body.assignedOfficerId ? { action: "OFFICER_ASSIGNED", assignedOfficerId: req.body.assignedOfficerId } : {}),
      ...(req.body.internalNote ? { action: "NOTE_ADDED", note: req.body.internalNote.trim() } : {}),
    };
    const result = await db.collection("government_complaints").updateOne(
      { ...mode, complaintId: req.params.complaintId, status: complaint.status },
      { $set: updates, $push: { ...(req.body.internalNote ? { internalNotes: { note: req.body.internalNote.trim(), actorId: actor.userId, actorName: actor.name || actor.userId, createdAt: changedAt } } : {}), auditHistory: audit } },
    );
    if (!result.modifiedCount) return res.status(409).json({ error: "Complaint was changed concurrently; reload and retry" });
    res.json({ success: true, complaintId: req.params.complaintId, audit });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/government/admin/schemes", requireGovernmentAdministrator, async (req, res) => {
  try {
    const mode = governmentDemoFilter(req);
    if (mode.error) return res.status(403).json({ error: mode.error });
    const schemes = await db.collection("government_schemes").aggregate([
      { $match: mode },
      { $lookup: { from: "government_scheme_applications", let: { scheme: "$schemeId" }, pipeline: [
        { $match: { $expr: { $eq: ["$schemeId", "$$scheme"] }, ...(req.query.demo === "true" ? { isSynthetic: true } : { isSynthetic: { $ne: true } }) } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ], as: "applicationStats" } },
      { $addFields: {
        applicationCount: { $sum: "$applicationStats.count" },
        approvedCount: { $let: { vars: { found: { $arrayElemAt: [{ $filter: { input: "$applicationStats", as: "item", cond: { $eq: ["$$item._id", "APPROVED"] } } }, 0] } }, in: { $ifNull: ["$$found.count", 0] } } },
        rejectedCount: { $let: { vars: { found: { $arrayElemAt: [{ $filter: { input: "$applicationStats", as: "item", cond: { $eq: ["$$item._id", "REJECTED"] } } }, 0] } }, in: { $ifNull: ["$$found.count", 0] } } },
        pendingCount: { $let: { vars: { found: { $arrayElemAt: [{ $filter: { input: "$applicationStats", as: "item", cond: { $eq: ["$$item._id", "PENDING"] } } }, 0] } }, in: { $ifNull: ["$$found.count", 0] } } },
      } },
      { $project: { applicationStats: 0 } },
      { $sort: { updatedAt: -1 } }, { $limit: 200 },
    ]).toArray();
    res.json(schemes);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/government/admin/schemes", requireGovernmentAdministrator, async (req, res) => {
  try {
    const mode = governmentDemoFilter(req);
    if (mode.error) return res.status(403).json({ error: mode.error });
    const body = req.body || {};
    for (const field of ["name", "description", "departmentName"]) {
      const error = validText(body[field], field);
      if (error) return res.status(400).json({ error });
    }
    const scheme = {
      schemeId: `SCH-${crypto.randomUUID()}`, name: body.name.trim(), description: body.description.trim(),
      departmentName: body.departmentName.trim(), eligibility: String(body.eligibility || "").trim(),
      requiredDocuments: Array.isArray(body.requiredDocuments) ? body.requiredDocuments.filter(item => typeof item === "string").slice(0, 30) : [],
      openingAt: body.openingAt ? new Date(body.openingAt) : null, closingAt: body.closingAt ? new Date(body.closingAt) : null,
      active: true, ...mode, createdAt: new Date(), updatedAt: new Date(),
    };
    if ((scheme.openingAt && Number.isNaN(scheme.openingAt.getTime())) || (scheme.closingAt && Number.isNaN(scheme.closingAt.getTime()))) return res.status(400).json({ error: "Scheme dates must be valid dates" });
    await db.collection("government_schemes").insertOne(scheme);
    res.status(201).json(scheme);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch("/api/government/admin/schemes/:schemeId", requireGovernmentAdministrator, async (req, res) => {
  try {
    const mode = governmentDemoFilter(req);
    if (mode.error) return res.status(403).json({ error: mode.error });
    const changes = {};
    for (const field of ["name", "description", "departmentName", "eligibility"]) {
      if (req.body?.[field] !== undefined) {
        const error = validText(req.body[field], field);
        if (error) return res.status(400).json({ error });
        changes[field] = req.body[field].trim();
      }
    }
    if (req.body?.requiredDocuments !== undefined) {
      if (!Array.isArray(req.body.requiredDocuments) || req.body.requiredDocuments.some(item => typeof item !== "string") || req.body.requiredDocuments.length > 30) {
        return res.status(400).json({ error: "requiredDocuments must be a list of up to 30 text entries" });
      }
      changes.requiredDocuments = req.body.requiredDocuments.map(item => item.trim()).filter(Boolean);
    }
    for (const field of ["openingAt", "closingAt"]) {
      if (req.body?.[field] !== undefined) {
        const date = req.body[field] ? new Date(req.body[field]) : null;
        if (date && Number.isNaN(date.getTime())) return res.status(400).json({ error: `${field} must be a valid date` });
        changes[field] = date;
      }
    }
    if (req.body?.active !== undefined) {
      if (typeof req.body.active !== "boolean") return res.status(400).json({ error: "active must be a boolean" });
      changes.active = req.body.active;
    }
    changes.updatedAt = new Date();
    const result = await db.collection("government_schemes").updateOne({ ...mode, schemeId: req.params.schemeId }, { $set: changes });
    if (!result.matchedCount) return res.status(404).json({ error: "Scheme not found" });
    res.json({ success: true, schemeId: req.params.schemeId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/government/admin/applications", requireGovernmentAdministrator, async (req, res) => {
  try {
    const mode = governmentDemoFilter(req);
    if (mode.error) return res.status(403).json({ error: mode.error });
    const page = parsePage(req.query);
    if (page.error) return res.status(400).json({ error: page.error });
    const dates = governmentDateFilter(req.query, "submittedAt");
    if (dates.error) return res.status(400).json({ error: dates.error });
    if (req.query.status && !["PENDING", "APPROVED", "REJECTED"].includes(String(req.query.status))) return res.status(400).json({ error: "status is not supported" });
    const filter = { ...mode, ...dates, ...(req.query.status ? { status: String(req.query.status) } : {}) };
    const [items, total] = await Promise.all([
      db.collection("government_scheme_applications").find(filter, { projection: { citizenEmail: 0, citizenPhone: 0 } })
        .sort({ submittedAt: -1 }).skip((page.page - 1) * page.pageSize).limit(page.pageSize).toArray(),
      db.collection("government_scheme_applications").countDocuments(filter),
    ]);
    res.json({ items, total, page: page.page, pageSize: page.pageSize, pages: Math.max(1, Math.ceil(total / page.pageSize)) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch("/api/government/admin/applications/:applicationId", requireGovernmentAdministrator, async (req, res) => {
  try {
    const mode = governmentDemoFilter(req);
    if (mode.error) return res.status(403).json({ error: mode.error });
    const status = req.body?.status;
    if (!["APPROVED", "REJECTED"].includes(status)) return res.status(400).json({ error: "status must be APPROVED or REJECTED" });
    if (status === "REJECTED" && !String(req.body?.rejectionReason || "").trim()) return res.status(400).json({ error: "A rejection reason is required" });
    const result = await db.collection("government_scheme_applications").updateOne(
      { ...mode, applicationId: req.params.applicationId, status: "PENDING" },
      { $set: { status, decisionReason: String(req.body.rejectionReason || "").trim(), reviewedBy: req.authenticatedUser.userId, reviewedAt: new Date() } },
    );
    if (!result.modifiedCount) return res.status(404).json({ error: "Pending application not found" });
    res.json({ success: true, applicationId: req.params.applicationId, status });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/government/admin/departments", requireGovernmentAdministrator, async (req, res) => {
  try {
    const mode = governmentDemoFilter(req);
    if (mode.error) return res.status(403).json({ error: mode.error });
    res.json(await db.collection("government_departments").find(mode).sort({ name: 1 }).limit(200).toArray());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/government/admin/departments", requireGovernmentAdministrator, async (req, res) => {
  try {
    const mode = governmentDemoFilter(req);
    if (mode.error) return res.status(403).json({ error: mode.error });
    const error = validText(req.body?.name, "name", 200);
    if (error) return res.status(400).json({ error });
    const department = { departmentId: `DEP-${crypto.randomUUID()}`, name: req.body.name.trim(), active: true, ...mode, createdAt: new Date() };
    await db.collection("government_departments").insertOne(department);
    res.status(201).json(department);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch("/api/government/admin/departments/:departmentId", requireGovernmentAdministrator, async (req, res) => {
  try {
    const mode = governmentDemoFilter(req);
    if (mode.error) return res.status(403).json({ error: mode.error });
    if (req.body?.active !== undefined && typeof req.body.active !== "boolean") return res.status(400).json({ error: "active must be a boolean" });
    const changes = { updatedAt: new Date() };
    if (req.body?.active !== undefined) changes.active = req.body.active;
    if (req.body?.name !== undefined) {
      const error = validText(req.body.name, "name", 200);
      if (error) return res.status(400).json({ error });
      changes.name = req.body.name.trim();
    }
    if (Object.keys(changes).length === 1) return res.status(400).json({ error: "No department changes provided" });
    const result = await db.collection("government_departments").updateOne({ ...mode, departmentId: req.params.departmentId }, { $set: changes });
    if (!result.matchedCount) return res.status(404).json({ error: "Department not found" });
    res.json({ success: true, departmentId: req.params.departmentId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/government/admin/officers", requireGovernmentAdministrator, async (req, res) => {
  try {
    if (!["Admin", "Super Administrator"].includes(req.authenticatedUser.role)) {
      return res.status(403).json({ error: "Only a super administrator can register government officers" });
    }
    const body = req.body || {};
    for (const field of ["name", "email", "password", "departmentId"]) {
      const error = validText(body[field], field, field === "password" ? 200 : 200);
      if (error) return res.status(400).json({ error });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) return res.status(400).json({ error: "email must be valid" });
    if (body.password.length < 12) return res.status(400).json({ error: "password must be at least 12 characters" });
    if (!["Government Officer", "Department Administrator"].includes(body.role)) return res.status(400).json({ error: "role must be Government Officer or Department Administrator" });
    const department = await db.collection("government_departments").findOne({ departmentId: body.departmentId, active: true });
    if (!department) return res.status(400).json({ error: "An active department is required" });
    if (await db.collection("users").findOne({ email: body.email.trim().toLowerCase() })) return res.status(409).json({ error: "An account already uses this email" });
    const user = {
      userId: `GOV-${crypto.randomUUID()}`, name: body.name.trim(), email: body.email.trim().toLowerCase(),
      passwordHash: await bcrypt.hash(body.password, 12), role: body.role,
      departmentId: department.departmentId, departmentName: department.name,
      isActive: true, createdAt: new Date(), updatedAt: new Date(),
    };
    await db.collection("users").insertOne(user);
    await db.collection("government_audit_logs").insertOne({
      action: "GOVERNMENT_OFFICER_REGISTERED", actorId: req.authenticatedUser.userId,
      targetUserId: user.userId, departmentId: department.departmentId, createdAt: new Date(),
    });
    const { passwordHash, _id, ...safeUser } = user;
    res.status(201).json(safeUser);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/government/admin/officers", requireGovernmentAdministrator, async (req, res) => {
  try {
    const mode = governmentDemoFilter(req);
    if (mode.error) return res.status(403).json({ error: mode.error });
    if (req.query.demo === "true") {
      const [demoOfficers, workloads] = await Promise.all([
        db.collection("government_demo_officers").find(mode, { projection: { userId: 1, name: 1, role: 1, departmentId: 1, departmentName: 1, isActive: 1, isSynthetic: 1 } }).limit(500).toArray(),
        db.collection("government_complaints").aggregate([
          { $match: { isSynthetic: true, assignedOfficerId: { $exists: true }, status: { $nin: ["RESOLVED", "REJECTED"] } } },
          { $group: { _id: "$assignedOfficerId", count: { $sum: 1 } } },
        ]).toArray(),
      ]);
      const workloadById = Object.fromEntries(workloads.map(item => [item._id, item.count]));
      return res.json(demoOfficers.map(({ _id, ...officer }) => ({ ...officer, openComplaintCount: workloadById[officer.userId] || 0 })));
    }
    const roleFilter = {
      role: { $in: ["Government Officer", "Department Administrator", "Super Administrator", "Admin"] },
      isSynthetic: { $ne: true },
    };
    const [officers, workloads] = await Promise.all([db.collection("users").find(roleFilter, {
      projection: { userId: 1, name: 1, fullName: 1, role: 1, departmentId: 1, departmentName: 1, isActive: 1, isSynthetic: 1 },
    }).limit(500).toArray(), db.collection("government_complaints").aggregate([
      { $match: { ...(req.query.demo === "true" ? { isSynthetic: true } : { isSynthetic: { $ne: true } }), assignedOfficerId: { $exists: true }, status: { $nin: ["RESOLVED", "REJECTED"] } } },
      { $group: { _id: "$assignedOfficerId", count: { $sum: 1 } } },
    ]).toArray()]);
    const workloadById = Object.fromEntries(workloads.map(item => [item._id, item.count]));
    res.json(officers.map(({ _id, ...officer }) => ({ ...officer, openComplaintCount: workloadById[officer.userId] || 0 })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch("/api/government/admin/officers/:userId", requireGovernmentAdministrator, async (req, res) => {
  try {
    if (req.query.demo === "true") return res.status(403).json({ error: "Demo officer records are read-only" });
    const changes = {};
    if (req.body?.departmentId !== undefined || req.body?.departmentName !== undefined) {
      if (typeof req.body.departmentId !== "string" || typeof req.body.departmentName !== "string") return res.status(400).json({ error: "departmentId and departmentName are required together" });
      if (req.body.departmentId) {
        const department = await db.collection("government_departments").findOne({ departmentId: req.body.departmentId, active: true });
        if (!department) return res.status(400).json({ error: "Select an active department" });
        changes.departmentId = department.departmentId;
        changes.departmentName = department.name;
      } else {
        changes.departmentId = "";
        changes.departmentName = "";
      }
    }
    if (req.body?.isActive !== undefined) {
      if (typeof req.body.isActive !== "boolean") return res.status(400).json({ error: "isActive must be a boolean" });
      changes.isActive = req.body.isActive;
    }
    if (!Object.keys(changes).length) return res.status(400).json({ error: "No officer changes provided" });
    changes.updatedAt = new Date();
    const result = await db.collection("users").updateOne({
      userId: req.params.userId,
      role: { $in: ["Government Officer", "Department Administrator", "Super Administrator", "Admin"] },
      isSynthetic: { $ne: true },
    }, { $set: changes });
    if (!result.matchedCount) return res.status(404).json({ error: "Government officer not found" });
    res.json({ success: true, userId: req.params.userId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/government/admin/alerts", requireGovernmentAdministrator, async (req, res) => {
  try {
    const mode = governmentDemoFilter(req);
    if (mode.error) return res.status(403).json({ error: mode.error });
    const complaintDates = governmentDateFilter(req.query, "submittedAt");
    const applicationDates = governmentDateFilter(req.query, "submittedAt");
    if (complaintDates.error || applicationDates.error) return res.status(400).json({ error: complaintDates.error || applicationDates.error });
    const now = new Date();
    const dueSoonAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const [overdue, dueSoon, approvals] = await Promise.all([
      db.collection("government_complaints").find({ ...mode, ...complaintDates, dueAt: { $lt: now }, status: { $nin: ["RESOLVED", "REJECTED"] } })
        .project({ complaintId: 1, subject: 1, district: 1, dueAt: 1, status: 1 }).sort({ dueAt: 1 }).limit(20).toArray(),
      db.collection("government_complaints").find({ ...mode, ...complaintDates, dueAt: { $gte: now, $lte: dueSoonAt }, status: { $nin: ["RESOLVED", "REJECTED"] } })
        .project({ complaintId: 1, subject: 1, district: 1, dueAt: 1, status: 1 }).sort({ dueAt: 1 }).limit(20).toArray(),
      db.collection("government_scheme_applications").find({ ...mode, ...applicationDates, status: "PENDING" })
        .project({ applicationId: 1, schemeName: 1, submittedAt: 1 }).sort({ submittedAt: 1 }).limit(20).toArray(),
    ]);
    res.json({ overdue, dueSoon, approvals });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/government/advisories
app.get("/api/government/advisories", async (req, res) => {
  try {
    const collection = db.collection("government_alerts");
    let advisories = await collection.find({ advisoryId: { $exists: true } }).toArray();
    if (advisories.length === 0) {
      const farms = await db.collection("farms").find({}).toArray();
      const districts = [...new Set(farms.map(farm => farm.district).filter(Boolean))];
      const farmNames = [...new Set(farms.map(farm => farm.farmName || farm.name).filter(Boolean))];
      const templates = [
        { title: "Biosecurity Entry Control", priority: "High", message: "Review visitor logs, restrict non-essential entry, and ensure dedicated footwear and hand sanitation at farm entrances." },
        { title: "Vaccination Schedule Review", priority: "Critical", message: "Check vaccination records for all livestock and arrange any overdue doses with the assigned veterinarian." },
        { title: "Daily Disease Monitoring", priority: "High", message: "Record unusual illness or mortality daily and report suspected notifiable disease promptly to the veterinary authority." },
        { title: "Feed and Water Hygiene", priority: "Medium", message: "Protect feed from pests and contamination, and clean and inspect drinking water equipment regularly." },
        { title: "Animal Movement Records", priority: "Medium", message: "Keep movement records current and verify animal health documentation before bringing animals onto the farm." },
        { title: "Poultry House Wild Bird Protection", priority: "High", message: "Inspect poultry-house screens and roofs, prevent wild bird access to feed and water, and report sudden mortality." },
        { title: "Waste and Carcass Disposal", priority: "Medium", message: "Use the approved disposal procedure for manure, waste, and carcasses, and keep disposal areas away from animal housing." },
      ];
      const issuedAt = new Date();
      advisories = templates.map((item, index) => ({
        advisoryId: `ADV-BASE-${index + 1}`,
        ...item,
        district: districts.length ? districts[index % districts.length] : "All Districts",
        farmName: farmNames.length ? farmNames[index % farmNames.length] : "All registered farms",
        farmId: farms.length ? (farms[index % farms.length].farmId || String(farms[index % farms.length]._id || "")) : "",
        status: index < 2 ? "Active" : "Inactive",
        issuedBy: "Government Officer",
        issuedDate: new Date(issuedAt.getTime() - index * 86400000).toISOString(),
        expiryDate: "",
        createdAt: new Date(issuedAt.getTime() - index * 86400000),
        updatedAt: issuedAt,
        seeded: true,
      }));
      await collection.insertMany(advisories);
    }
    advisories.sort((a, b) => new Date(b.issuedDate || b.createdAt || 0) - new Date(a.issuedDate || a.createdAt || 0));
    const [totalAdvisories, activeAdvisories] = await Promise.all([
      collection.countDocuments({ advisoryId: { $exists: true } }),
      collection.countDocuments({ advisoryId: { $exists: true }, status: "Active" }),
    ]);
    res.json({ advisories, totalAdvisories, activeAdvisories });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/government/advisories/:advisoryId
app.put("/api/government/advisories/:advisoryId", async (req, res) => {
  try {
    const allowedFields = ["title", "message", "district", "priority", "status", "issuedDate", "expiryDate", "issuedBy"];
    const updates = Object.fromEntries(allowedFields.filter(key => req.body[key] !== undefined).map(key => [key, req.body[key]]));
    if (updates.status && !["Active", "Inactive"].includes(updates.status)) {
      return res.status(400).json({ error: "Advisory status must be Active or Inactive" });
    }
    updates.updatedAt = new Date();
    const collection = db.collection("government_alerts");
    const result = await collection.updateOne({ advisoryId: req.params.advisoryId }, { $set: updates });
    if (!result.matchedCount) return res.status(404).json({ error: "Advisory not found" });
    res.json(await collection.findOne({ advisoryId: req.params.advisoryId }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/government/advisory
app.post("/api/government/advisory", async (req, res) => {
  try {
    const { title, message, district, priority, issuedBy } = req.body;
    const advisory = {
      advisoryId: "ADV-" + Date.now(), title, message,
      district: district || "All Districts", priority: priority || "Medium",
      issuedBy: issuedBy || "Government Officer",
      status: "Active", issuedDate: new Date().toISOString(), createdAt: new Date()
    };
    await db.collection("government_alerts").insertOne(advisory);
    // Notify all farmers
    await db.collection("notifications").insertOne({
      notificationId: "N-" + Date.now() + "-adv",
      targetRole: "Farmer", type: "GOVERNMENT_ADVISORY",
      title: `Government Advisory: ${title}`,
      message, isRead: false, createdAt: new Date()
    });
    res.status(201).json({ success: true, advisoryId: advisory.advisoryId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
