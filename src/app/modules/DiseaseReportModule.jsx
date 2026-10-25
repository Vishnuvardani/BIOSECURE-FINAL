import { useState, useEffect } from "react";
import { AlertTriangle, FileText, MapPin, CheckCircle, Clock, Eye, RefreshCw, Send, Check } from "lucide-react";
import { submitDiseaseReport, getDiseaseReports, updateDiseaseStatus } from "../../api/mongoService";
import { formatDate, formatDateTime } from "../../utils/dateTime";

const P = {
  red: "#C62828", redBg: "#fef2f2", redLight: "#ef4444",
  yellow: "#F9A825", yellowBg: "#fffde7",
  green: "#2E7D32", greenLight: "#4CAF50", greenBg: "#f0fdf4",
  blue: "#1565C0", blueBg: "#e3f2fd",
  purple: "#6d28d9", purpleBg: "#f5f3ff",
  gray: "#6b7280", dark: "#1a1a2e", white: "#ffffff",
  olive: "#808034", oliveDark: "#5c5c24", ivoryDark: "#f0f0d8",
};

const PIG_DISEASES = [
  "African Swine Fever (ASF)", "Swine Influenza", "Classical Swine Fever (CSF)",
  "PRRS", "Porcine Epidemic Diarrhea (PED)", "Swine Erysipelas", "Other"
];

const POULTRY_DISEASES = [
  "Avian Influenza / Bird Flu (HPAI)", "Newcastle Disease", "Infectious Bursal Disease (IBD)",
  "Marek's Disease", "Infectious Bronchitis", "Fowl Cholera", "Other"
];

const SYMPTOMS_PIG = [
  "Fever", "Loss of appetite", "Skin lesions / blotches", "Respiratory distress",
  "Sudden death", "Vomiting / diarrhea", "Lameness", "Reproductive failure", "Neurological signs"
];

const SYMPTOMS_POULTRY = [
  "Sudden high mortality", "Respiratory distress", "Drop in egg production",
  "Swollen head / face", "Greenish diarrhea", "Nervous signs / tremors", "Loss of appetite", "Nasal discharge"
];

const STATUS_CONFIG = {
  REPORTED:               { color: P.blue,   bg: P.blueBg,   label: "Reported" },
  UNDER_REVIEW:           { color: P.yellow, bg: P.yellowBg, label: "Under Review" },
  VETERINARY_INSPECTION:  { color: P.purple, bg: P.purpleBg, label: "Vet Inspection" },
  CONFIRMED:              { color: P.red,    bg: P.redBg,    label: "Confirmed" },
  RULED_OUT:              { color: P.green,  bg: P.greenBg,  label: "Ruled Out" },
  RESOLVED:               { color: P.gray,   bg: "#f3f4f6",  label: "Resolved" },
};

const STATUS_OPTS = ["REPORTED", "UNDER_REVIEW", "VETERINARY_INSPECTION", "CONFIRMED", "RULED_OUT", "RESOLVED"];

const SEVERITY_OPTIONS = [
  { value: "LOW",      color: P.green,  bg: P.greenBg },
  { value: "MODERATE", color: P.yellow, bg: P.yellowBg },
  { value: "HIGH",     color: "#E65100", bg: "#fff3e0" },
  { value: "CRITICAL", color: P.red,    bg: P.redBg },
];

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.REPORTED;
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color: cfg.color, background: cfg.bg, padding: "3px 10px", borderRadius: 10 }}>
      {cfg.label}
    </span>
  );
}

function ReportCard({ report, onView, isVet, onStatusChange }) {
  return (
    <div style={{ background: P.white, borderRadius: 14, border: `1.5px solid ${report.riskLevel === "HIGH" ? P.red + "40" : "#e5e7eb"}`, padding: "14px 18px", marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <AlertTriangle size={14} color={report.riskLevel === "HIGH" ? P.red : P.yellow} />
            <span style={{ fontSize: 13, fontWeight: 700, color: P.dark }}>Suspected {report.suspectedDisease}</span>
          </div>
          <p style={{ fontSize: 11, color: P.gray, margin: 0 }}>
            Farm: {report.farmId} · {report.animalType} · {formatDate(report.reportedDate)}
          </p>
          <p style={{ fontSize: 11, color: P.gray, margin: "2px 0 0" }}>
            Affected: {report.affectedAnimals} animals · Deaths: {report.deaths}
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
          <StatusBadge status={report.status} />
          <span style={{ fontSize: 10, fontWeight: 700, color: report.riskLevel === "HIGH" ? P.red : report.riskLevel === "MODERATE" ? P.yellow : P.green, background: report.riskLevel === "HIGH" ? P.redBg : report.riskLevel === "MODERATE" ? P.yellowBg : P.greenBg, padding: "2px 8px", borderRadius: 8 }}>
            {report.riskLevel} RISK
          </span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={() => onView(report)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 8, background: P.blueBg, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, color: P.blue }}>
          <Eye size={12} /> View Details
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 10px", borderRadius: 8, background: "#f3f4f6", fontSize: 11, color: P.gray }}>
          <MapPin size={11} /> {report.latitude?.toFixed ? report.latitude.toFixed(4) : (report.latitude || "N/A")}, {report.longitude?.toFixed ? report.longitude.toFixed(4) : (report.longitude || "N/A")}
        </div>
        {isVet && onStatusChange && (
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11, color: P.gray, fontWeight: 600 }}>Change Status:</span>
            <select
              value={report.status}
              onChange={e => onStatusChange(report.reportId, e.target.value)}
              style={{ padding: "5px 10px", borderRadius: 8, border: "1.5px solid #d1d5db", fontSize: 11, fontWeight: 700, color: P.purple, background: P.white, cursor: "pointer", outline: "none" }}
            >
              {STATUS_OPTS.map(s => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}

function ReportDetailModal({ report, onClose, isVet, onStatusChange }) {
  if (!report) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: P.white, borderRadius: 20, padding: 28, maxWidth: 580, width: "100%", maxHeight: "85vh", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h3 style={{ fontFamily: "Poppins", fontSize: 16, fontWeight: 700, color: P.dark, margin: 0 }}>Disease Report Details</h3>
          <button onClick={onClose} style={{ background: "#f3f4f6", border: "none", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontSize: 12, color: P.gray }}>Close</button>
        </div>

        {isVet && onStatusChange && (
          <div style={{ background: P.purpleBg, border: `1.5px solid ${P.purple}30`, borderRadius: 12, padding: "14px 16px", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div>
                <p style={{ fontSize: 12, fontWeight: 700, color: P.purple, margin: 0 }}>Update Report Status (Vet Action)</p>
                <p style={{ fontSize: 11, color: P.gray, margin: "2px 0 0" }}>Changes will trigger an email to registered farmer with farm details and record an app notification.</p>
              </div>
              <select
                value={report.status}
                onChange={e => onStatusChange(report.reportId, e.target.value)}
                style={{ padding: "8px 12px", borderRadius: 10, border: `1.5px solid ${P.purple}`, fontSize: 12, fontWeight: 700, color: P.purple, background: P.white, cursor: "pointer", outline: "none" }}
              >
                {STATUS_OPTS.map(s => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
              </select>
            </div>
          </div>
        )}

        <div style={{ background: P.redBg, borderRadius: 12, padding: 14, marginBottom: 16, border: `1px solid ${P.red}20` }}>
          <p style={{ fontSize: 11, color: P.red, fontWeight: 600, margin: "0 0 4px" }}>⚠ SUSPECTED DISEASE REPORT — NOT A CONFIRMED DIAGNOSIS</p>
          <p style={{ fontSize: 11, color: P.gray, margin: 0 }}>Final diagnosis will be updated by the veterinarian after inspection and testing.</p>
        </div>

        {[
          ["Report ID", report.reportId],
          ["Farm ID", report.farmId],
          ["Animal Type", report.animalType],
          ["Suspected Disease", report.suspectedDisease],
          ...(report.suspectedDisease === "Other" && report.otherDisease ? [["If other, mention", report.otherDisease]] : []),
          ["Affected Animals", report.affectedAnimals],
          ["Deaths", report.deaths],
          ["Severity", report.severity],
          ["Symptom Start Date", report.symptomStartDate],
          ["Risk Level", report.riskLevel],
          ["Status", report.status],
          ["Reported Date", formatDateTime(report.reportedDate)],
          ["Location", `${report.latitude || "N/A"}, ${report.longitude || "N/A"}`],
        ].map(([k, v]) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f3f4f6" }}>
            <span style={{ fontSize: 12, color: P.gray }}>{k}</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: P.dark }}>{String(v)}</span>
          </div>
        ))}
        {report.symptoms?.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: P.gray, marginBottom: 6 }}>Symptoms Reported</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {report.symptoms.map((s, i) => (
                <span key={i} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 8, background: P.yellowBg, color: P.yellow, fontWeight: 600 }}>{s}</span>
              ))}
            </div>
          </div>
        )}
        {report.remarks && (
          <div style={{ marginTop: 12, padding: 12, background: "#f9fafb", borderRadius: 10 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: P.gray, marginBottom: 4 }}>Remarks</p>
            <p style={{ fontSize: 12, color: P.dark, margin: 0 }}>{report.remarks}</p>
          </div>
        )}
        {report.nearbyFarms?.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: P.red, marginBottom: 6 }}>⚠ Nearby Farms ({report.nearbyFarms.length} within risk zone)</p>
            {report.nearbyFarms.map((f, i) => (
              <div key={i} style={{ fontSize: 11, color: P.gray, padding: "3px 0" }}>• {f.farmName || f.farmId} — {f.distance} km</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function DiseaseReportModule({ farms = [], user, role }) {
  const isVet = role === "veterinarian" || user?.role === "veterinarian";
  const [tab, setTab] = useState(isVet ? "history" : "report");
  const [form, setForm] = useState({ farmId: "", animalType: "", suspectedDisease: "", otherDisease: "", symptoms: [], affectedAnimals: "", deaths: "", symptomStartDate: "", severity: "", remarks: "", latitude: "", longitude: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(null);
  const [reports, setReports] = useState([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);
  const [error, setError] = useState("");
  const [vetNotice, setVetNotice] = useState("");

  const diseases = form.animalType === "Pig" ? PIG_DISEASES : form.animalType === "Poultry" ? POULTRY_DISEASES : [];
  const symptoms = form.animalType === "Pig" ? SYMPTOMS_PIG : form.animalType === "Poultry" ? SYMPTOMS_POULTRY : [];

  const loadReports = async () => {
    setLoadingReports(true);
    try {
      const data = await getDiseaseReports();
      setReports(Array.isArray(data) ? data : []);
    } catch { setReports([]); }
    finally { setLoadingReports(false); }
  };

  useEffect(() => {
    if (isVet || tab === "history") {
      loadReports();
    }
  }, [isVet, tab]);

  const toggleSymptom = (s) => setForm(f => ({
    ...f, symptoms: f.symptoms.includes(s) ? f.symptoms.filter(x => x !== s) : [...f.symptoms, s]
  }));

  const getLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(pos => {
      setForm(f => ({ ...f, latitude: pos.coords.latitude.toFixed(6), longitude: pos.coords.longitude.toFixed(6) }));
    });
  };

  const handleSubmit = async () => {
    if (!form.farmId || !form.animalType || !form.suspectedDisease || !form.severity)
      return setError("Please fill all required fields.");
    setError(""); setSubmitting(true);
    try {
      const payload = {
        ...form,
        farmerId: user?.userId || "unknown",
        affectedAnimals: Number(form.affectedAnimals) || 0,
        deaths: Number(form.deaths) || 0,
        latitude: form.latitude && form.latitude.trim() ? Number(form.latitude) : null,
        longitude: form.longitude && form.longitude.trim() ? Number(form.longitude) : null,
      };
      const res = await submitDiseaseReport(payload);
      setSubmitted(res);
      setForm({ farmId: "", animalType: "", suspectedDisease: "", otherDisease: "", symptoms: [], affectedAnimals: "", deaths: "", symptomStartDate: "", severity: "", remarks: "", latitude: "", longitude: "" });
    } catch (e) {
      setError("Submission failed: " + e.message);
    } finally { setSubmitting(false); }
  };

  const handleVetStatusChange = async (reportId, status) => {
    try {
      const res = await updateDiseaseStatus(reportId, {
        status,
        vetEmail: user?.email,
        vetName: user?.fullName || user?.name || "Dr. Priya Vishnu"
      });
      setReports(rs => rs.map(r => r.reportId === reportId ? { ...r, status } : r));
      setSelectedReport(r => r && r.reportId === reportId ? { ...r, status } : r);
      const farmerDetail = res?.farmerEmail ? ` Farm details & status change emailed to ${res.farmerEmail}.` : " Details emailed to registered farmer.";
      setVetNotice(`Status updated to ${status.replace(/_/g, " ")}!${farmerDetail} In-app notification created.`);
      setTimeout(() => setVetNotice(""), 6000);
    } catch (e) {
      console.error(e);
      alert("Status update failed: " + e.message);
    }
  };

  return (
    <div style={{ fontFamily: "Inter", maxWidth: 820, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20, padding: "18px 22px", background: `linear-gradient(135deg, ${P.red}12, ${P.red}04)`, borderRadius: 18, border: `1px solid ${P.red}20` }}>
        <div style={{ width: 46, height: 46, borderRadius: 13, background: P.red, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <AlertTriangle size={22} color={P.white} />
        </div>
        <div>
          <h2 style={{ fontFamily: "Poppins", fontSize: 17, fontWeight: 700, color: P.dark, margin: 0 }}>
            {isVet ? "Disease Reports" : "Disease Reporting"}
          </h2>
          <p style={{ fontSize: 12, color: P.gray, margin: "2px 0 0" }}>
            {isVet ? "Review reports, update status, and notify farmers automatically via email" : "Report suspected disease symptoms for veterinarian review and risk zoning"}
          </p>
        </div>
      </div>

      {/* Vet Notice Banner */}
      {isVet && vetNotice && (
        <div style={{ background: P.greenBg, border: `1.5px solid ${P.greenLight}50`, borderRadius: 12, padding: "12px 18px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
          <CheckCircle size={18} color={P.greenLight} style={{ flexShrink: 0 }} />
          <p style={{ fontSize: 12, color: P.green, fontWeight: 600, margin: 0 }}>{vetNotice}</p>
        </div>
      )}

      {/* Tabs (Farmer / non-vet module) */}
      {!isVet && (
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {[
            { id: "report", label: "Report a Disease", icon: AlertTriangle },
            { id: "history", label: "Report History", icon: FileText },
          ].map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)}
              style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 18px", borderRadius: 10, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, background: tab === id ? P.red : P.ivoryDark, color: tab === id ? P.white : P.dark, transition: "all 0.15s" }}>
              <Icon size={14} />{label}
            </button>
          ))}
        </div>
      )}

      {/* Success Banner (Farmer) */}
      {!isVet && submitted && (
        <div style={{ background: P.greenBg, border: `1.5px solid ${P.greenLight}40`, borderRadius: 14, padding: "14px 18px", marginBottom: 16, display: "flex", alignItems: "flex-start", gap: 12 }}>
          <CheckCircle size={20} color={P.greenLight} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: P.green, margin: "0 0 4px" }}>Report Submitted Successfully</p>
            <p style={{ fontSize: 12, color: P.gray, margin: 0 }}>Report ID: <strong>{submitted.reportId}</strong> · Risk Level: <strong style={{ color: submitted.riskLevel === "HIGH" ? P.red : P.yellow }}>{submitted.riskLevel}</strong> · {submitted.notificationsSent} notifications sent</p>
            {submitted.nearbyFarms?.length > 0 && <p style={{ fontSize: 11, color: P.red, margin: "4px 0 0" }}>⚠ {submitted.nearbyFarms.length} nearby farm(s) identified within risk zone</p>}
          </div>
          <button onClick={() => setSubmitted(null)} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", fontSize: 18, color: P.gray }}>×</button>
        </div>
      )}

      {/* Farmer Report Form */}
      {!isVet && tab === "report" && (
        <div>
          {/* Disclaimer */}
          <div style={{ background: P.yellowBg, border: `1px solid ${P.yellow}40`, borderRadius: 12, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: "#92400e" }}>
            <strong>Important:</strong> This report will be classified as a <strong>"Suspected Disease Report"</strong>. The system does not medically confirm any disease. Final diagnosis will be provided by a licensed veterinarian after inspection.
          </div>

          <div style={{ background: P.white, borderRadius: 16, border: "1px solid #e5e7eb", padding: 22 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              {/* Farm */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: P.gray, display: "block", marginBottom: 6 }}>Farm *</label>
                <select value={form.farmId} onChange={e => setForm(f => ({ ...f, farmId: e.target.value }))}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: `1.5px solid ${form.farmId ? P.olive : "#e5e7eb"}`, fontSize: 13, color: P.dark, background: P.white, outline: "none" }}>
                  <option value="">Select farm...</option>
                  {farms.map(f => <option key={f.farmId} value={f.farmId}>{f.farmName || f.farmId}</option>)}
                </select>
              </div>

              {/* Animal Type */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: P.gray, display: "block", marginBottom: 6 }}>Animal Type *</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {["Pig", "Poultry"].map(t => (
                    <button key={t} onClick={() => setForm(f => ({ ...f, animalType: t, suspectedDisease: "", otherDisease: "", symptoms: [] }))}
                      style={{ flex: 1, padding: "10px", borderRadius: 10, border: `2px solid ${form.animalType === t ? P.olive : "#e5e7eb"}`, background: form.animalType === t ? P.olive + "18" : P.white, cursor: "pointer", fontSize: 13, fontWeight: 600, color: form.animalType === t ? P.olive : P.gray }}>
                      {t === "Pig" ? "🐷 Pig" : "🐔 Poultry"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Disease */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: P.gray, display: "block", marginBottom: 6 }}>Suspected Disease *</label>
                <select value={form.suspectedDisease} onChange={e => setForm(f => ({ ...f, suspectedDisease: e.target.value, otherDisease: e.target.value === "Other" ? f.otherDisease : "" }))}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: `1.5px solid ${form.suspectedDisease ? P.red : "#e5e7eb"}`, fontSize: 13, color: P.dark, background: P.white, outline: "none" }}>
                  <option value="">Select disease...</option>
                  {diseases.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              {form.suspectedDisease === "Other" && (
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: P.gray, display: "block", marginBottom: 6 }}>If other, mention:</label>
                  <input value={form.otherDisease} onChange={e => setForm(f => ({ ...f, otherDisease: e.target.value }))}
                    placeholder="Mention the suspected disease" style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #e5e7eb", fontSize: 13, color: P.dark, outline: "none", boxSizing: "border-box" }} />
                </div>
              )}

              {/* Severity */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: P.gray, display: "block", marginBottom: 6 }}>Severity *</label>
                <div style={{ display: "flex", gap: 6 }}>
                  {SEVERITY_OPTIONS.map(s => (
                    <button key={s.value} onClick={() => setForm(f => ({ ...f, severity: s.value }))}
                      style={{ flex: 1, padding: "8px 4px", borderRadius: 10, border: `2px solid ${form.severity === s.value ? s.color : "#e5e7eb"}`, background: form.severity === s.value ? s.bg : P.white, cursor: "pointer", fontSize: 10, fontWeight: 700, color: form.severity === s.value ? s.color : P.gray }}>
                      {s.value}
                    </button>
                  ))}
                </div>
              </div>

              {/* Affected Animals */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: P.gray, display: "block", marginBottom: 6 }}>Affected Animals</label>
                <input type="number" min="0" value={form.affectedAnimals} onChange={e => setForm(f => ({ ...f, affectedAnimals: e.target.value }))}
                  placeholder="e.g. 50" style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #e5e7eb", fontSize: 13, color: P.dark, outline: "none", boxSizing: "border-box" }} />
              </div>

              {/* Deaths */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: P.gray, display: "block", marginBottom: 6 }}>Number of Deaths</label>
                <input type="number" min="0" value={form.deaths} onChange={e => setForm(f => ({ ...f, deaths: e.target.value }))}
                  placeholder="e.g. 5" style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #e5e7eb", fontSize: 13, color: P.dark, outline: "none", boxSizing: "border-box" }} />
              </div>

              {/* Symptom Start Date */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: P.gray, display: "block", marginBottom: 6 }}>Date Symptoms Started</label>
                <input type="date" value={form.symptomStartDate} onChange={e => setForm(f => ({ ...f, symptomStartDate: e.target.value }))}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #e5e7eb", fontSize: 13, color: P.dark, outline: "none", boxSizing: "border-box" }} />
              </div>

              {/* Location detection */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: P.gray, display: "block", marginBottom: 6 }}>GPS Coordinates</label>
                <div style={{ display: "flex", gap: 6 }}>
                  <input readOnly value={form.latitude && form.longitude ? `${form.latitude}, ${form.longitude}` : ""} placeholder="Not detected" style={{ flex: 1, padding: "10px 12px", borderRadius: 10, border: "1.5px solid #e5e7eb", fontSize: 12, color: P.dark, background: "#f9fafb" }} />
                  <button type="button" onClick={getLocation} style={{ display: "flex", alignItems: "center", gap: 4, padding: "8px 12px", borderRadius: 10, background: P.ivoryDark, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, color: P.dark }}>
                    <MapPin size={12} /> Detect
                  </button>
                </div>
              </div>

            </div>

            {/* Symptoms */}
            {symptoms.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: P.gray, display: "block", marginBottom: 8 }}>Symptoms Observed (select all that apply)</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {symptoms.map(s => (
                    <button key={s} type="button" onClick={() => toggleSymptom(s)}
                      style={{ padding: "6px 12px", borderRadius: 10, border: `1.5px solid ${form.symptoms.includes(s) ? P.red : "#e5e7eb"}`, background: form.symptoms.includes(s) ? P.redBg : P.white, cursor: "pointer", fontSize: 11, fontWeight: 600, color: form.symptoms.includes(s) ? P.red : P.gray }}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Remarks */}
            <div style={{ marginTop: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: P.gray, display: "block", marginBottom: 6 }}>Additional Remarks</label>
              <textarea value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} rows={3}
                placeholder="Describe any additional observations, affected areas, or relevant history..."
                style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #e5e7eb", fontSize: 13, color: P.dark, outline: "none", resize: "vertical", boxSizing: "border-box" }} />
            </div>
          </div>

          {error && <div style={{ background: P.redBg, border: `1px solid ${P.red}30`, borderRadius: 10, padding: "10px 14px", margin: "12px 0", fontSize: 12, color: P.red }}>{error}</div>}

          <button onClick={handleSubmit} disabled={submitting}
            style={{ width: "100%", marginTop: 16, padding: "15px", borderRadius: 14, background: submitting ? "#9ca3af" : `linear-gradient(135deg, ${P.red}, ${P.red}cc)`, color: P.white, fontWeight: 700, fontSize: 14, border: "none", cursor: submitting ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <AlertTriangle size={17} />
            {submitting ? "Submitting Report..." : "Submit Suspected Disease Report"}
          </button>
        </div>
      )}

      {/* History view (Shown for Vet directly, or for Farmer when History tab is selected) */}
      {(isVet || tab === "history") && (
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: P.dark }}>{reports.length} report(s) found</span>
            <button onClick={loadReports} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 10, background: P.ivoryDark, border: "none", cursor: "pointer", fontSize: 12, color: P.gray }}>
              <RefreshCw size={13} /> Refresh
            </button>
          </div>
          {loadingReports ? (
            <div style={{ textAlign: "center", padding: 40, color: P.gray }}>Loading reports...</div>
          ) : reports.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: P.gray, background: P.white, borderRadius: 14, border: "1px solid #e5e7eb" }}>
              <FileText size={32} color="#d1d5db" style={{ marginBottom: 8 }} />
              <p style={{ margin: 0 }}>No disease reports found</p>
            </div>
          ) : (
            reports.map(r => (
              <ReportCard
                key={r.reportId}
                report={r}
                onView={setSelectedReport}
                isVet={isVet}
                onStatusChange={isVet ? handleVetStatusChange : null}
              />
            ))
          )}
        </div>
      )}

      <ReportDetailModal
        report={selectedReport}
        onClose={() => setSelectedReport(null)}
        isVet={isVet}
        onStatusChange={isVet ? handleVetStatusChange : null}
      />
    </div>
  );
}
