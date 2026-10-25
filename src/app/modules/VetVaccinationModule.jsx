import { useEffect, useMemo, useState } from "react";
import { Syringe, Calendar, CheckCircle, Clock, AlertCircle, Plus, Search, Filter } from "lucide-react";
import { getVaccinations, getFarms, createVaccination } from "../../api/mongoService";
import { formatDate, getLocalDateInputValue } from "../../utils/dateTime";

const P = {
  green: "#2f855a", greenBg: "#ecfdf3",
  blue: "#1565c0", blueBg: "#eff6ff",
  yellow: "#b7791f", yellowBg: "#fffbeb",
  red: "#c62828", redBg: "#fef2f2",
  purple: "#6d28d9", purpleBg: "#f5f3ff",
  dark: "#1a1a2e", gray: "#6b7280", white: "#ffffff",
};

const DEMO_VACCINATIONS = [
  { vaccinationId: "DEMO-VAC-001", vaccineName: "Classical Swine Fever Vaccine", disease: "Classical Swine Fever", farmId: "DEMO-FARM-001", farmName: "Green Valley Pig Farm", administeredDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), status: "completed", batchNumber: "CSF-2024-001", dosage: "2ml", administeredBy: { fullName: "Dr. Demo Vet" } },
  { vaccinationId: "DEMO-VAC-002", vaccineName: "Newcastle Disease Vaccine (LaSota)", disease: "Newcastle Disease", farmId: "DEMO-FARM-002", farmName: "Sunrise Poultry Farm", administeredDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), status: "completed", batchNumber: "ND-2024-015", dosage: "0.5ml", administeredBy: { fullName: "Dr. Demo Vet" } },
  { vaccinationId: "DEMO-VAC-003", vaccineName: "Foot and Mouth Disease Vaccine", disease: "FMD", farmId: "DEMO-FARM-001", farmName: "Green Valley Pig Farm", administeredDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(), status: "scheduled", batchNumber: "FMD-2024-008", dosage: "3ml", administeredBy: null },
];

const VACCINE_TYPES = [
  "Classical Swine Fever Vaccine",
  "Newcastle Disease Vaccine (LaSota)",
  "Newcastle Disease Vaccine (Komarov)",
  "Foot and Mouth Disease Vaccine",
  "Porcine Reproductive & Respiratory Syndrome (PRRS) Vaccine",
  "Avian Influenza Vaccine",
  "Infectious Bursal Disease Vaccine",
  "Salmonella Vaccine",
  "Brucellosis Vaccine",
  "Rabies Vaccine",
  "Anthrax Vaccine",
  "Other",
];

function StatusBadge({ status }) {
  const styles = {
    completed: [P.green, P.greenBg, "Completed"],
    scheduled: [P.blue, P.blueBg, "Scheduled"],
    missed: [P.red, P.redBg, "Missed"],
    in_progress: [P.yellow, P.yellowBg, "In Progress"],
  };
  const [color, bg, label] = styles[status] || [P.gray, "#f1f5f9", status];
  return <span style={{ color, background: bg, borderRadius: 999, padding: "3px 10px", fontSize: 10, fontWeight: 700 }}>{label}</span>;
}

function VaccinationCard({ vaccination, onClick }) {
  return (
    <div onClick={onClick} style={{ background: P.white, borderRadius: 12, border: "1px solid #e5e7eb", padding: 16, cursor: "pointer", transition: "all 0.15s", marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: P.purpleBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Syringe size={18} color={P.purple} />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: P.dark }}>{vaccination.vaccineName}</div>
            <div style={{ fontSize: 12, color: P.gray, marginTop: 2 }}>{vaccination.disease}</div>
          </div>
        </div>
        <StatusBadge status={vaccination.status} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 11, color: P.gray }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}><Calendar size={12} /> {formatDate(vaccination.administeredDate)}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ fontWeight: 600 }}>Farm:</span> {vaccination.farmName || vaccination.farmId}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ fontWeight: 600 }}>Batch:</span> {vaccination.batchNumber || "-"}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ fontWeight: 600 }}>By:</span> {vaccination.administeredBy?.fullName || "Pending"}</div>
      </div>
    </div>
  );
}

function AddVaccinationForm({ farms, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    vaccineName: "", disease: "", farmId: "", administeredDate: getLocalDateInputValue(), batchNumber: "", dosage: "", notes: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  const handleSubmit = async () => {
    if (!form.vaccineName || !form.farmId) { setMessage("Please fill required fields"); return; }
    setSubmitting(true);
    try {
      await createVaccination({ ...form, status: "scheduled" });
      setMessage("Vaccination record added successfully");
      setTimeout(() => onSubmit(), 1000);
    } catch (e) { setMessage(e.message || "Failed to add record"); }
    finally { setSubmitting(false); }
  };

  const selectedFarm = farms.find(f => f.farmId === form.farmId);

  return (
    <div style={{ background: P.white, borderRadius: 16, border: "1px solid #e5e7eb", padding: 24 }}>
      <h3 style={{ margin: "0 0 20px", fontSize: 16, fontWeight: 700, color: P.dark, fontFamily: "Poppins" }}>Add Vaccination Record</h3>
      {message && <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 8, background: message.includes("success") ? P.greenBg : P.redBg, color: message.includes("success") ? P.green : P.red, fontSize: 12, fontWeight: 600 }}>{message}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: P.gray, marginBottom: 5 }}>Farm *</label>
          <select value={form.farmId} onChange={e => setForm(f => ({ ...f, farmId: e.target.value }))} style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #dbe2ea", fontSize: 12, color: P.dark, background: P.white }}>
            <option value="">Select farm</option>
            {farms.map(f => <option key={f.farmId} value={f.farmId}>{f.farmName}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: P.gray, marginBottom: 5 }}>Vaccine Type *</label>
          <select value={form.vaccineName} onChange={e => setForm(f => ({ ...f, vaccineName: e.target.value }))} style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #dbe2ea", fontSize: 12, color: P.dark, background: P.white }}>
            <option value="">Select vaccine</option>
            {VACCINE_TYPES.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: P.gray, marginBottom: 5 }}>Disease</label>
          <input value={form.disease} onChange={e => setForm(f => ({ ...f, disease: e.target.value }))} placeholder="e.g. Classical Swine Fever" style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #dbe2ea", fontSize: 12, color: P.dark, boxSizing: "border-box" }} />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: P.gray, marginBottom: 5 }}>Date</label>
          <input type="date" value={form.administeredDate} onChange={e => setForm(f => ({ ...f, administeredDate: e.target.value }))} style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #dbe2ea", fontSize: 12, color: P.dark, boxSizing: "border-box" }} />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: P.gray, marginBottom: 5 }}>Batch Number</label>
          <input value={form.batchNumber} onChange={e => setForm(f => ({ ...f, batchNumber: e.target.value }))} placeholder="Batch #" style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #dbe2ea", fontSize: 12, color: P.dark, boxSizing: "border-box" }} />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: P.gray, marginBottom: 5 }}>Dosage</label>
          <input value={form.dosage} onChange={e => setForm(f => ({ ...f, dosage: e.target.value }))} placeholder="e.g. 2ml" style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #dbe2ea", fontSize: 12, color: P.dark, boxSizing: "border-box" }} />
        </div>
      </div>
      <div style={{ marginTop: 16 }}>
        <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: P.gray, marginBottom: 5 }}>Notes</label>
        <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Additional notes..." style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #dbe2ea", fontSize: 12, color: P.dark, resize: "vertical", boxSizing: "border-box" }} />
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
        <button onClick={onCancel} style={{ flex: 1, padding: "12px", borderRadius: 10, background: "#f3f4f6", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, color: P.gray }}>Cancel</button>
        <button onClick={handleSubmit} disabled={submitting} style={{ flex: 2, padding: "12px", borderRadius: 10, background: submitting ? "#9ca3af" : P.purple, color: P.white, fontWeight: 700, fontSize: 13, border: "none", cursor: submitting ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <Plus size={14} /> {submitting ? "Adding..." : "Add Vaccination Record"}
        </button>
      </div>
    </div>
  );
}

export default function VetVaccinationModule({ user }) {
  const [vaccinations, setVaccinations] = useState([]);
  const [farms, setFarms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Combine real data with demo data, real data first
  const allVaccinations = useMemo(() => {
    const real = vaccinations.filter(v => !v.vaccinationId?.startsWith("DEMO-"));
    const demo = DEMO_VACCINATIONS.filter(dv => !real.some(r => r.vaccinationId === dv.vaccinationId));
    return [...real, ...demo];
  }, [vaccinations]);

  const filteredVaccinations = useMemo(() => {
    let result = allVaccinations;
    if (statusFilter !== "all") {
      result = result.filter(v => v.status === statusFilter);
    }
    if (search) {
      const needle = search.toLowerCase();
      result = result.filter(v => 
        v.vaccineName?.toLowerCase().includes(needle) ||
        v.disease?.toLowerCase().includes(needle) ||
        v.farmName?.toLowerCase().includes(needle) ||
        v.farmId?.toLowerCase().includes(needle)
      );
    }
    return result.sort((a, b) => new Date(b.administeredDate) - new Date(a.administeredDate));
  }, [allVaccinations, search, statusFilter]);

  const stats = useMemo(() => ({
    total: allVaccinations.length,
    completed: allVaccinations.filter(v => v.status === "completed").length,
    scheduled: allVaccinations.filter(v => v.status === "scheduled").length,
    missed: allVaccinations.filter(v => v.status === "missed").length,
  }), [allVaccinations]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const [vacData, farmsData] = await Promise.all([
          getVaccinations().catch(() => []),
          getFarms().catch(() => []),
        ]);
        if (!active) return;
        setVaccinations(Array.isArray(vacData) ? vacData : []);
        setFarms(Array.isArray(farmsData) ? farmsData : []);
      } catch { }
      finally { if (active) setLoading(false); }
    };
    load();
    return () => { active = false; };
  }, []);

  const handleSubmit = () => {
    setShowForm(false);
    getVaccinations().then(data => setVaccinations(Array.isArray(data) ? data : [])).catch(() => {});
  };

  if (loading) {
    return <div style={{ fontFamily: "Inter", maxWidth: 1000, margin: "0 auto", padding: 24, textAlign: "center" }}><div style={{ color: P.gray, fontSize: 13 }}>Loading vaccination records...</div></div>;
  }

  if (showForm) {
    return (
      <div style={{ fontFamily: "Inter", maxWidth: 700, margin: "0 auto" }}>
        <button onClick={() => setShowForm(false)} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 16, padding: "8px 14px", borderRadius: 10, background: "#f3f4f6", border: "none", cursor: "pointer", fontSize: 12, color: P.gray }}>
          ← Back to Records
        </button>
        <AddVaccinationForm farms={farms} onSubmit={handleSubmit} onCancel={() => setShowForm(false)} />
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "Inter", maxWidth: 1000, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24, padding: "20px 24px", background: `linear-gradient(135deg, ${P.purple}18, ${P.purple}06)`, borderRadius: 16, border: `1px solid ${P.purple}20` }}>
        <div style={{ width: 48, height: 48, borderRadius: 14, background: P.purple, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Syringe size={22} color={P.white} />
        </div>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontFamily: "Poppins", fontSize: 18, fontWeight: 700, color: P.dark, margin: 0 }}>Vaccination Records</h2>
          <p style={{ fontSize: 12, color: P.gray, margin: "3px 0 0" }}>Manage and track all vaccination activities</p>
        </div>
        <button onClick={() => setShowForm(true)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 18px", background: P.purple, color: P.white, border: "none", borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
          <Plus size={16} /> Add Record
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Total Records", value: stats.total, icon: Syringe, color: P.purple, bg: P.purpleBg },
          { label: "Completed", value: stats.completed, icon: CheckCircle, color: P.green, bg: P.greenBg },
          { label: "Scheduled", value: stats.scheduled, icon: Clock, color: P.blue, bg: P.blueBg },
          { label: "Missed", value: stats.missed, icon: AlertCircle, color: P.red, bg: P.redBg },
        ].map(stat => (
          <div key={stat.label} style={{ background: P.white, borderRadius: 12, padding: "14px 18px", border: `1px solid ${stat.color}20`, display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: stat.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <stat.icon size={16} color={stat.color} />
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: stat.color, fontFamily: "Poppins" }}>{stat.value}</div>
              <div style={{ fontSize: 10, color: P.gray }}>{stat.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: P.white, border: "1px solid #e5e7eb", borderRadius: 10, flex: 1, maxWidth: 320 }}>
          <Search size={14} color={P.gray} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search vaccines, diseases, farms..." style={{ flex: 1, border: "none", outline: "none", fontSize: 12, color: P.dark, background: "transparent" }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: P.white, border: "1px solid #e5e7eb", borderRadius: 10 }}>
          <Filter size={14} color={P.gray} />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ border: "none", outline: "none", fontSize: 12, color: P.dark, background: "transparent", cursor: "pointer" }}>
            <option value="all">All Status</option>
            <option value="completed">Completed</option>
            <option value="scheduled">Scheduled</option>
            <option value="missed">Missed</option>
          </select>
        </div>
      </div>

      {/* Records List */}
      <div style={{ background: P.white, borderRadius: 14, border: "1px solid #e5e7eb", overflow: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", borderBottom: "1px solid #f3f4f6" }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: P.dark, fontFamily: "Poppins" }}>All Vaccination Records</h3>
          <span style={{ fontSize: 11, color: P.gray }}>{filteredVaccinations.length} records</span>
        </div>
        <div style={{ padding: 16 }}>
          {filteredVaccinations.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: P.gray, fontSize: 13 }}>No vaccination records found</div>
          ) : (
            filteredVaccinations.map(vac => <VaccinationCard key={vac.vaccinationId} vaccination={vac} onClick={() => {}} />)
          )}
        </div>
      </div>
    </div>
  );
}