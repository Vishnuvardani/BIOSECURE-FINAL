import { useCallback, useEffect, useState } from "react";
import { Edit2, Eye, Flag, Save, X } from "lucide-react";
import { API_BASE } from "../../api/mongoService";

const priorityColors = { Critical: "#D32F2F", High: "#FF9800", Medium: "#42A5F5", Low: "#4CAF50" };
const P = { olive: "#808034", dark: "#1a1a0e", mid: "#6b6b4a", light: "#a0a080", ivory: "#FFFFE3", ivoryDark: "#f0f0d8", white: "#fff", green: "#4CAF50", red: "#D32F2F" };
const inputStyle = { width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 8, border: "1px solid #d8d8c2", background: P.white, color: P.dark, font: "inherit", fontSize: 13 };

function dateLabel(value) {
  if (!value) return "Date not set";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function GovernmentAdvisoriesModule({ farms = [], user }) {
  const [advisories, setAdvisories] = useState([]);
  const [totalAdvisories, setTotalAdvisories] = useState(0);
  const [activeAdvisories, setActiveAdvisories] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const loadAdvisories = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch(`${API_BASE}/government/advisories`, { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load advisories from MongoDB.");
      const data = await response.json();
      const records = Array.isArray(data) ? data : Array.isArray(data.advisories) ? data.advisories : Array.isArray(data.data) ? data.data : [];
      setAdvisories(records);
      setTotalAdvisories(data.totalAdvisories === undefined ? records.length : Number(data.totalAdvisories) || 0);
      setActiveAdvisories(data.activeAdvisories === undefined ? records.filter(item => item.status === "Active").length : Number(data.activeAdvisories) || 0);
    } catch (error) {
      setLoadError(error.message || "Could not load advisories.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAdvisories(); }, [loadAdvisories]);

  const openView = advisory => { setSelected(advisory); setDraft(null); setEditing(false); setSaveError(""); };
  const openEdit = advisory => {
    setSelected(advisory);
    setDraft({
      title: advisory.title || "",
      message: advisory.message || "",
      district: advisory.district || "All Districts",
      priority: advisory.priority || "Medium",
      status: advisory.status || "Inactive",
      issuedDate: advisory.issuedDate ? new Date(advisory.issuedDate).toISOString().slice(0, 10) : "",
      expiryDate: advisory.expiryDate ? new Date(advisory.expiryDate).toISOString().slice(0, 10) : "",
    });
    setEditing(true);
    setSaveError("");
  };

  const saveEdit = async event => {
    event.preventDefault();
    if (!selected || !draft) return;
    setSaving(true);
    setSaveError("");
    try {
      const response = await fetch(`${API_BASE}/government/advisories/${encodeURIComponent(selected.advisoryId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, issuedBy: selected.issuedBy || user?.name || "Government Officer" }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save advisory changes.");
      setAdvisories(current => current.map(item => item.advisoryId === result.advisoryId ? result : item));
      setSelected(result);
      setEditing(false);
      setDraft(null);
      await loadAdvisories();
    } catch (error) {
      setSaveError(error.message || "Could not save advisory changes.");
    } finally {
      setSaving(false);
    }
  };

  const notifiedCount = farms.length;

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", fontFamily: "Inter, sans-serif", color: P.dark }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 14, marginBottom: 24 }}>
        <div style={{ background: P.white, borderRadius: 12, padding: 18, border: "1px solid #ececda" }}><div style={{ color: P.red, fontSize: 24, fontWeight: 800 }}>{activeAdvisories.toLocaleString()}</div><div style={{ fontSize: 12, color: P.mid, marginTop: 4 }}>Active Advisories · Live MongoDB count</div></div>
        <div style={{ background: P.white, borderRadius: 12, padding: 18, border: "1px solid #ececda" }}><div style={{ color: P.green, fontSize: 24, fontWeight: 800 }}>{notifiedCount.toLocaleString()}</div><div style={{ fontSize: 12, color: P.mid, marginTop: 4 }}>Registered Farms Notified</div></div>
        <div style={{ background: P.white, borderRadius: 12, padding: 18, border: "1px solid #ececda" }}><div style={{ color: P.olive, fontSize: 24, fontWeight: 800 }}>{totalAdvisories.toLocaleString()}</div><div style={{ fontSize: 12, color: P.mid, marginTop: 4 }}>Total Advisories · Live MongoDB count</div></div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}><Flag size={18} color={P.olive} /><h2 style={{ fontSize: 17, margin: 0, fontWeight: 750 }}>Government Advisories</h2></div>
      {loadError && <div role="alert" style={{ padding: 12, marginBottom: 14, borderRadius: 8, background: "#fef2f2", color: P.red, fontSize: 13 }}>{loadError} <button onClick={loadAdvisories} style={{ marginLeft: 8, cursor: "pointer" }}>Retry</button></div>}
      {loading ? <p style={{ color: P.mid, padding: 18 }}>Loading advisories…</p> : (
        <div style={{ display: "grid", gap: 12 }}>
          {advisories.map(advisory => {
            const color = priorityColors[advisory.priority] || P.olive;
            return <article key={advisory.advisoryId} style={{ background: P.white, border: "1px solid #ececda", borderLeft: `4px solid ${color}`, borderRadius: 12, padding: 18, display: "flex", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
              <div style={{ width: 38, height: 38, flex: "0 0 38px", borderRadius: 10, background: `${color}18`, display: "grid", placeItems: "center" }}><Flag size={18} color={color} /></div>
              <div style={{ flex: "1 1 300px", minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}><strong style={{ fontSize: 14 }}>{advisory.title}</strong><span style={{ fontSize: 10, fontWeight: 700, color, background: `${color}15`, padding: "4px 8px", borderRadius: 20 }}>{advisory.priority}</span><span style={{ fontSize: 10, fontWeight: 700, color: advisory.status === "Active" ? P.green : P.mid, background: advisory.status === "Active" ? "#effaf0" : P.ivoryDark, padding: "4px 8px", borderRadius: 20 }}>{advisory.status}</span></div>
                <div style={{ color: P.mid, fontSize: 11, marginTop: 6 }}>Issued by {advisory.issuedBy || "Government Officer"} · {advisory.district || "All Districts"} · {dateLabel(advisory.issuedDate)}</div>
                <p style={{ color: P.mid, fontSize: 12, lineHeight: 1.55, margin: "9px 0 0", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{advisory.message}</p>
              </div>
              <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
                <button onClick={() => openView(advisory)} style={actionStyle}><Eye size={14} /> View</button>
                <button onClick={() => openEdit(advisory)} style={actionStyle}><Edit2 size={14} /> Edit</button>
              </div>
            </article>;
          })}
          {!advisories.length && !loadError && <p style={{ color: P.mid, padding: 18 }}>No advisories are available.</p>}
        </div>
      )}

      {selected && <div onMouseDown={event => { if (event.target === event.currentTarget) { setSelected(null); setEditing(false); } }} style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(15,23,42,.52)", display: "grid", placeItems: "center", padding: 16 }}>
        <section role="dialog" aria-modal="true" aria-label={editing ? "Edit advisory" : "Advisory details"} style={{ width: "min(620px,100%)", maxHeight: "90vh", overflow: "auto", background: P.white, borderRadius: 14, padding: 22, boxShadow: "0 18px 60px rgba(0,0,0,.2)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}><h3 style={{ margin: 0, fontSize: 17 }}>{editing ? "Edit Advisory" : "Advisory Details"}</h3><button aria-label="Close" onClick={() => { setSelected(null); setEditing(false); }} style={{ border: 0, background: "transparent", cursor: "pointer", color: P.mid }}><X size={18} /></button></div>
          {editing ? <form onSubmit={saveEdit} style={{ display: "grid", gap: 12 }}>
            <label style={labelStyle}>Title<input required value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} style={inputStyle} /></label>
            <label style={labelStyle}>Target district<input required value={draft.district} onChange={event => setDraft({ ...draft, district: event.target.value })} style={inputStyle} /></label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 }}>
              <label style={labelStyle}>Priority<select value={draft.priority} onChange={event => setDraft({ ...draft, priority: event.target.value })} style={inputStyle}>{Object.keys(priorityColors).map(priority => <option key={priority}>{priority}</option>)}</select></label>
              <label style={labelStyle}>Status<select value={draft.status} onChange={event => setDraft({ ...draft, status: event.target.value })} style={inputStyle}><option>Active</option><option>Inactive</option></select></label>
              <label style={labelStyle}>Effective date<input type="date" value={draft.issuedDate} onChange={event => setDraft({ ...draft, issuedDate: event.target.value })} style={inputStyle} /></label>
              <label style={labelStyle}>Expiry date<input type="date" value={draft.expiryDate} onChange={event => setDraft({ ...draft, expiryDate: event.target.value })} style={inputStyle} /></label>
            </div>
            <label style={labelStyle}>Advisory details<textarea required rows={6} value={draft.message} onChange={event => setDraft({ ...draft, message: event.target.value })} style={{ ...inputStyle, resize: "vertical" }} /></label>
            {saveError && <p role="alert" style={{ margin: 0, color: P.red, fontSize: 12 }}>{saveError}</p>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}><button type="button" onClick={() => { setEditing(false); setDraft(null); }} style={actionStyle}>Cancel</button><button type="submit" disabled={saving} style={{ ...actionStyle, background: P.olive, color: P.white, borderColor: P.olive, opacity: saving ? .7 : 1 }}><Save size={14} />{saving ? "Saving…" : "Save changes"}</button></div>
          </form> : <div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}><span style={tagStyle}>{selected.priority}</span><span style={{ ...tagStyle, color: selected.status === "Active" ? P.green : P.mid }}>{selected.status}</span></div>
            <h4 style={{ margin: "0 0 10px", fontSize: 16 }}>{selected.title}</h4>
            <p style={{ margin: "0 0 16px", color: P.mid, fontSize: 13, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{selected.message || "No details provided."}</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, padding: 12, background: P.ivory, borderRadius: 9, fontSize: 12 }}>
                <div><b>Target district</b><div>{selected.district || "All Districts"}</div></div><div><b>Farm reference</b><div>{selected.farmName || "All registered farms"}</div></div><div><b>Issued by</b><div>{selected.issuedBy || "Government Officer"}</div></div><div><b>Effective</b><div>{dateLabel(selected.issuedDate)}</div></div><div><b>Expires</b><div>{dateLabel(selected.expiryDate)}</div></div><div><b>Registered farms notified</b><div>{farms.length.toLocaleString()}</div></div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}><button onClick={() => openEdit(selected)} style={{ ...actionStyle, background: P.olive, color: P.white, borderColor: P.olive }}><Edit2 size={14} /> Edit</button><button onClick={() => setSelected(null)} style={actionStyle}>Close</button></div>
          </div>}
        </section>
      </div>}
    </div>
  );
}

const actionStyle = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "8px 11px", borderRadius: 8, border: "1px solid #dedecb", background: "#f7f7ed", color: "#50503a", fontSize: 12, fontWeight: 650, cursor: "pointer" };
const labelStyle = { display: "grid", gap: 6, fontSize: 12, color: "#50503a", fontWeight: 650 };
const tagStyle = { fontSize: 10, fontWeight: 700, color: "#808034", background: "#f0f0d8", padding: "4px 8px", borderRadius: 20 };
