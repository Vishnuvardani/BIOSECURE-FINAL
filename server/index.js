/**
 * BioSecure Farm - Express API Server
 * Connects to MongoDB using MONGO_URI and DB_NAME environment variables.
 * Run: node server/index.js
 */
const express    = require("express");
const cors       = require("cors");
const bcrypt     = require("bcryptjs");
const { MongoClient, ObjectId } = require("mongodb");

const app      = express();
const PORT     = Number(process.env.PORT) || 5000;
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017";
const DB_NAME   = process.env.DB_NAME || "biosecure_db";

app.use(cors());
app.use(express.json({ limit: "10mb" }));

let db;

MongoClient.connect(MONGO_URI)
  .then(client => {
    db = client.db(DB_NAME);
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
      const docs = await db.collection(collectionName).find(filter).toArray();
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
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "email and password required" });
    const user = await db.collection("users").findOne({ email });
    if (!user) return res.status(401).json({ error: "Invalid email or password" });
    // Support both hashed passwords (new users) and legacy users without hash
    if (user.passwordHash) {
      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) return res.status(401).json({ error: "Invalid email or password" });
    }
    const { passwordHash: _, ...safeUser } = user;
    res.json({ success: true, user: safeUser });
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
    const body = req.body;
    if (!body.farmId || !body.farmerId) return res.status(400).json({ error: "farmId and farmerId required" });
    const reportId  = "DR-" + Date.now();
    const riskLevel = calcDiseaseRisk(body);
    // Get farm coordinates from farms collection
    const farm = await db.collection("farms").findOne({ farmId: body.farmId });
    const latitude  = body.latitude  || farm?.latitude  || 0;
    const longitude = body.longitude || farm?.longitude || 0;
    const doc = {
      reportId, farmId: body.farmId, farmerId: body.farmerId,
      animalType: body.animalType, suspectedDisease: body.suspectedDisease,
      otherDisease: body.otherDisease || "",
      symptoms: body.symptoms || [], affectedAnimals: Number(body.affectedAnimals) || 0,
      deaths: Number(body.deaths) || 0, symptomStartDate: body.symptomStartDate,
      severity: body.severity, remarks: body.remarks || "",
      imageUrl: body.imageUrl || null, latitude, longitude,
      status: "REPORTED", riskLevel,
      reportedDate: new Date().toISOString(),
      veterinarianId: null, inspectionStatus: "PENDING",
      diagnosis: null, createdAt: new Date(), updatedAt: new Date()
    };
    await db.collection("disease_reports").insertOne(doc);
    // Find nearby farms within configurable radius
    const config = await db.collection("system_config").findOne({ key: "risk_radius_km" });
    const radiusKm = config?.value || 5;
    const allFarms = await db.collection("farms").find({ latitude: { $exists: true } }).toArray();
    const nearbyFarms = allFarms.filter(f =>
      f.farmId !== body.farmId && f.latitude && f.longitude &&
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
app.put("/api/disease/:reportId/status", async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ["REPORTED","UNDER_REVIEW","VETERINARY_INSPECTION","CONFIRMED","RULED_OUT","RESOLVED"];
    if (!validStatuses.includes(status)) return res.status(400).json({ error: "Invalid status" });
    await db.collection("disease_reports").updateOne(
      { reportId: req.params.reportId },
      { $set: { status, updatedAt: new Date() } }
    );
    res.json({ success: true, reportId: req.params.reportId, status });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/disease/:reportId/inspection
app.put("/api/disease/:reportId/inspection", async (req, res) => {
  try {
    const update = {
      veterinarianId: req.body.veterinarianId,
      inspectionDate: req.body.inspectionDate,
      symptomsObserved: req.body.symptomsObserved,
      clinicalFindings: req.body.clinicalFindings,
      samplesCollected: req.body.samplesCollected,
      preliminaryDiagnosis: req.body.preliminaryDiagnosis,
      recommendedActions: req.body.recommendedActions,
      followUpDate: req.body.followUpDate,
      inspectionStatus: req.body.inspectionStatus || "INSPECTED",
      status: "VETERINARY_INSPECTION",
      updatedAt: new Date()
    };
    await db.collection("disease_reports").updateOne({ reportId: req.params.reportId }, { $set: update });
    res.json({ success: true, reportId: req.params.reportId });
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
    const docs = await db.collection("notifications").find(filter).sort({ createdAt: -1 }).limit(50).toArray();
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
app.get("/api/government/dashboard", async (req, res) => {
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
app.get("/api/government/outbreaks", async (req, res) => {
  try {
    const filter = {};
    if (req.query.riskLevel) filter.riskLevel = req.query.riskLevel;
    if (req.query.status)    filter.status    = req.query.status;
    if (req.query.animalType) filter.animalType = req.query.animalType;
    const docs = await db.collection("disease_reports").find(filter).sort({ createdAt: -1 }).toArray();
    res.json(docs);
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
