import { Activity, AlertTriangle, Leaf, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "../../api/mongoService";

const P = { dark: "#1a1a0e", mid: "#6b6b4a", olive: "#808034", red: "#D32F2F", orange: "#FF9800", blue: "#42A5F5", white: "#fff", line: "#ececda" };

function formatDate(value) {
  if (!value) return "Date not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function GovernmentDashboardModule({ farms = [], reports = [] }) {
  const [liveReports, setLiveReports] = useState(Array.isArray(reports) ? reports : []);
  const [reportLoadError, setReportLoadError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const loadReports = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await fetch(`${API_BASE}/government/outbreaks`, { cache: "no-store" });
      if (!response.ok) throw new Error(`Request failed (${response.status})`);
      const result = await response.json();
      if (!Array.isArray(result)) throw new Error("Unexpected reports response");
      setLiveReports(result);
      setReportLoadError("");
    } catch (error) {
      setReportLoadError(error?.message || "Unable to load disease reports");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadReports();
    const timer = window.setInterval(loadReports, 30_000);
    return () => window.clearInterval(timer);
  }, [loadReports]);

  const dashboardReports = liveReports;
  const farmById = new Map();
  farms.forEach(farm => {
    [farm.farmId, farm.id, farm._id].filter(Boolean).forEach(id => farmById.set(String(id), farm));
  });
  const activeReports = dashboardReports.filter(report => !["RESOLVED", "RULED_OUT"].includes(String(report.status || "").toUpperCase()));
  const totalAffected = dashboardReports.reduce((sum, report) => sum + (Number(report.affectedAnimals) || 0), 0);
  const districtCounts = new Map();
  activeReports.forEach(report => {
    const farm = farmById.get(String(report.farmId || ""));
    const district = report.district || farm?.district || "District not recorded";
    const entry = districtCounts.get(district) || { district, reports: 0, affectedAnimals: 0 };
    entry.reports += 1;
    entry.affectedAnimals += Number(report.affectedAnimals) || 0;
    districtCounts.set(district, entry);
  });
  const recentReports = activeReports.slice().sort((a, b) => new Date(b.createdAt || b.reportDate || 0) - new Date(a.createdAt || a.reportDate || 0)).slice(0, 10);
  const metrics = [
    { label: "Registered Farms", value: farms.length, icon: Leaf, color: P.olive },
    { label: "Disease Reports", value: dashboardReports.length, icon: Activity, color: P.blue },
    { label: "Active Outbreaks", value: activeReports.length, icon: AlertTriangle, color: P.red },
    { label: "Animals Affected", value: totalAffected, icon: ShieldAlert, color: P.orange },
  ];

  return (
    <div style={{ maxWidth: 1250, margin: "0 auto", fontFamily: "Inter, sans-serif", color: P.dark }}>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}><button onClick={loadReports} disabled={refreshing} style={{ border: `1px solid ${P.line}`, borderRadius: 7, padding: "6px 10px", background: P.white, color: P.mid, cursor: refreshing ? "wait" : "pointer", fontSize: 11 }}>{refreshing ? "Refreshing…" : "Refresh reports"}</button></div>
      {reportLoadError && <p role="status" style={{ color: P.red, fontSize: 12, margin: "0 0 10px" }}>Could not refresh disease reports: {reportLoadError}. Showing the last available data.</p>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 14, marginBottom: 20 }}>
        {metrics.map(metric => {
          const Icon = metric.icon;
          return <div key={metric.label} style={{ display: "flex", alignItems: "center", gap: 13, background: P.white, border: `1px solid ${P.line}`, borderRadius: 12, padding: 17 }}><div style={{ width: 40, height: 40, borderRadius: 11, background: `${metric.color}18`, display: "grid", placeItems: "center" }}><Icon size={19} color={metric.color} /></div><div><div style={{ fontSize: 21, fontWeight: 800, color: P.dark }}>{Number(metric.value).toLocaleString()}</div><div style={{ fontSize: 11, color: P.mid, marginTop: 3 }}>{metric.label}</div><div style={{ fontSize: 10, color: P.mid, marginTop: 2 }}>MongoDB</div></div></div>;
        })}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,400px),1fr))", gap: 16 }}>
        <section style={panelStyle}>
          <h2 style={headingStyle}>Active Outbreaks by District</h2>
          {districtCounts.size ? [...districtCounts.values()].sort((a, b) => b.reports - a.reports).map(item => <div key={item.district} style={rowStyle}><div style={{ minWidth: 0, flex: 1 }}><strong style={{ fontSize: 13 }}>{item.district}</strong><div style={{ color: P.mid, fontSize: 11, marginTop: 4 }}>{item.affectedAnimals.toLocaleString()} animals affected</div></div><span style={{ background: "#fef2f2", color: P.red, borderRadius: 20, padding: "5px 9px", fontSize: 11, fontWeight: 700 }}>{item.reports} report{item.reports === 1 ? "" : "s"}</span></div>) : <p style={emptyStyle}>No active disease reports in MongoDB.</p>}
        </section>

        <section style={panelStyle}>
          <h2 style={headingStyle}>Recent Disease Reports</h2>
          {recentReports.length ? recentReports.map((report, index) => {
            const farm = farmById.get(String(report.farmId || ""));
            return <div key={report.reportId || report._id || index} style={rowStyle}><div style={{ minWidth: 0, flex: 1 }}><strong style={{ display: "block", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{report.diseaseName || report.disease || "Disease report"}</strong><div style={{ color: P.mid, fontSize: 11, marginTop: 4 }}>{report.farmName || farm?.farmName || farm?.name || "Farm not linked"} · {report.district || farm?.district || "District not recorded"}</div><div style={{ color: P.mid, fontSize: 10, marginTop: 3 }}>{formatDate(report.createdAt || report.reportDate || report.outbreakDate)}</div></div><span style={{ color: P.red, background: "#fef2f2", borderRadius: 20, padding: "5px 9px", fontSize: 10, fontWeight: 700 }}>{report.status || report.severity || "Open"}</span></div>;
          }) : <p style={emptyStyle}>No active disease reports in MongoDB.</p>}
        </section>
      </div>
      <p style={{ color: P.mid, fontSize: 10, textAlign: "right", marginTop: 12 }}>Dashboard figures are loaded from MongoDB.</p>
    </div>
  );
}

const panelStyle = { background: P.white, border: `1px solid ${P.line}`, borderRadius: 12, overflow: "hidden", padding: "17px 18px" };
const headingStyle = { margin: "0 0 4px", fontSize: 14, fontWeight: 750, color: P.dark };
const rowStyle = { display: "flex", alignItems: "center", gap: 12, padding: "13px 0", borderBottom: `1px solid ${P.line}` };
const emptyStyle = { color: P.mid, fontSize: 12, padding: "14px 0", margin: 0 };
