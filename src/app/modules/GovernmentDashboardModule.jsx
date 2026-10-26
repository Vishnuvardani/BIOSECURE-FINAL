import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Bell, CheckCircle, ChevronLeft, ChevronRight, ClipboardList, Download, FileText, Landmark, Plus, RefreshCw, Search, Users } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  createGovernmentDepartment,
  createGovernmentOfficer,
  createGovernmentScheme,
  getGovernmentAdminDashboard,
  getGovernmentAlerts,
  getGovernmentApplications,
  getGovernmentComplaint,
  getGovernmentComplaints,
  getGovernmentDepartments,
  getGovernmentOfficers,
  getGovernmentSchemes,
  reviewGovernmentApplication,
  updateGovernmentComplaint,
  updateGovernmentOfficer,
  updateGovernmentDepartment,
  updateGovernmentScheme,
} from "../../api/mongoService";

const STATUS = ["SUBMITTED", "UNDER_REVIEW", "ASSIGNED", "IN_PROGRESS", "RESOLVED", "REJECTED"];
const PRIORITY = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const COLORS = ["#315f91", "#e39b26", "#7253a4", "#287b78", "#378457", "#b34747"];
const EMPTY_DASHBOARD = { citizens: 0, complaints: 0, pending: 0, inProgress: 0, resolved: 0, schemesActive: 0, totalApplications: 0, pendingApplications: 0, overdue: 0, trend: [], byStatus: [], departments: [], districts: [] };
const panel = { background: "#fff", border: "1px solid #e4e9f0", borderRadius: 14, padding: 18, boxShadow: "0 3px 14px #1e3a5f08" };

export default function GovernmentDashboardModule({ user }) {
  const [section, setSection] = useState("Overview");
  const [demo, setDemo] = useState(Boolean(import.meta.env.DEV));
  const [dashboard, setDashboard] = useState(EMPTY_DASHBOARD);
  const [complaints, setComplaints] = useState({ items: [], total: 0, page: 1, pages: 1 });
  const [applications, setApplications] = useState({ items: [], total: 0, pages: 1 });
  const [applicationPage, setApplicationPage] = useState(1);
  const [applicationStatus, setApplicationStatus] = useState("");
  const [schemes, setSchemes] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [officers, setOfficers] = useState([]);
  const [alerts, setAlerts] = useState({ overdue: [], dueSoon: [], approvals: [] });
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("");
  const [district, setDistrict] = useState("");
  const [priority, setPriority] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sortBy, setSortBy] = useState("submittedAt");
  const [sortOrder, setSortOrder] = useState("desc");
  const [trendPeriod, setTrendPeriod] = useState("monthly");
  const [page, setPage] = useState(1);
  const [selectedComplaint, setSelectedComplaint] = useState(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [schemeFormOpen, setSchemeFormOpen] = useState(false);
  const [editingSchemeId, setEditingSchemeId] = useState("");
  const [schemeForm, setSchemeForm] = useState({ name: "", description: "", departmentName: "", eligibility: "", requiredDocuments: "", openingAt: "", closingAt: "" });
  const [departmentName, setDepartmentName] = useState("");
  const [officerFormOpen, setOfficerFormOpen] = useState(false);
  const [officerForm, setOfficerForm] = useState({ name: "", email: "", password: "", role: "Government Officer", departmentId: "" });
  const demoParams = useMemo(() => demo ? { demo: "true" } : {}, [demo]);
  const dashboardParams = useMemo(() => ({
    ...demoParams, ...(from ? { from } : {}), ...(to ? { to } : {}), period: trendPeriod,
  }), [demoParams, from, to, trendPeriod]);
  const complaintFilters = useMemo(() => ({
    ...demoParams, page: String(page), pageSize: "10",
    ...(query.trim() ? { q: query.trim() } : {}),
    ...(department ? { departmentId: department } : {}),
    ...(district ? { district } : {}),
    ...(priority ? { priority } : {}),
    ...(status ? { status } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}),
    sortBy, sortOrder,
  }), [demoParams, page, query, department, district, priority, status, from, to, sortBy, sortOrder]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [overview, complaintData, alertData] = await Promise.all([
        getGovernmentAdminDashboard(dashboardParams),
        getGovernmentComplaints({ ...complaintFilters, page: "1", pageSize: "5" }),
        getGovernmentAlerts(dashboardParams),
      ]);
      setDashboard({ ...EMPTY_DASHBOARD, ...overview });
      setComplaints(complaintData);
      setAlerts(alertData);
      if (section === "Complaints") {
        setComplaints(await getGovernmentComplaints(complaintFilters));
      } else if (section === "Schemes") {
        const [schemeList, appList] = await Promise.all([
          getGovernmentSchemes(dashboardParams),
          getGovernmentApplications({ ...dashboardParams, page: String(applicationPage), pageSize: "10", ...(applicationStatus ? { status: applicationStatus } : {}) }),
        ]);
        setSchemes(schemeList);
        setApplications(appList);
      } else if (section === "Departments & Officers") {
        const [departmentList, officerList] = await Promise.all([
          getGovernmentDepartments(demoParams),
          getGovernmentOfficers(demoParams),
        ]);
        setDepartments(departmentList);
        setOfficers(officerList);
      }
    } catch (loadError) {
      setError(loadError.message || "Unable to load government administration data");
    } finally {
      setLoading(false);
    }
  }, [dashboardParams, demoParams, complaintFilters, section, applicationPage, applicationStatus]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [query, department, district, priority, status, from, to, sortBy, sortOrder, demo]);
  useEffect(() => { setApplicationPage(1); }, [applicationStatus, demo]);

  const openComplaint = async item => {
    try {
      const complaint = await getGovernmentComplaint(item.complaintId, demoParams);
      setSelectedComplaint({ ...complaint, statusDraft: complaint.status, noteDraft: "", officerDraft: complaint.assignedOfficerId || "", resolutionDraft: complaint.resolutionDetails || "", rejectionDraft: complaint.rejectionReason || "" });
    } catch (detailError) { setNotice(detailError.message); }
  };

  const saveComplaint = async () => {
    if (!selectedComplaint) return;
    if (!window.confirm("Save these complaint changes?")) return;
    setBusy(true);
    try {
      const officer = officers.find(item => item.userId === selectedComplaint.officerDraft);
      await updateGovernmentComplaint(selectedComplaint.complaintId, {
        status: selectedComplaint.statusDraft,
        ...(selectedComplaint.officerDraft ? { assignedOfficerId: selectedComplaint.officerDraft, assignedOfficerName: officer?.name || officer?.fullName || selectedComplaint.officerDraft } : {}),
        ...(selectedComplaint.noteDraft ? { internalNote: selectedComplaint.noteDraft } : {}),
        ...(selectedComplaint.statusDraft === "RESOLVED" ? { resolutionDetails: selectedComplaint.resolutionDraft } : {}),
        ...(selectedComplaint.statusDraft === "REJECTED" ? { rejectionReason: selectedComplaint.rejectionDraft } : {}),
      }, demoParams);
      setNotice("Complaint updated successfully.");
      setSelectedComplaint(null);
      await load();
    } catch (saveError) { setNotice(saveError.message); }
    finally { setBusy(false); }
  };

  const saveScheme = async event => {
    event.preventDefault();
    setBusy(true);
    try {
      const body = {
        ...schemeForm,
        requiredDocuments: schemeForm.requiredDocuments.split(",").map(value => value.trim()).filter(Boolean),
      };
      if (editingSchemeId) await updateGovernmentScheme(editingSchemeId, body, demoParams);
      else await createGovernmentScheme(body, demoParams);
      setSchemeFormOpen(false);
      setEditingSchemeId("");
      setSchemeForm({ name: "", description: "", departmentName: "", eligibility: "", requiredDocuments: "", openingAt: "", closingAt: "" });
      setNotice(editingSchemeId ? "Scheme updated." : "Scheme created.");
      await load();
    } catch (saveError) { setNotice(saveError.message); }
    finally { setBusy(false); }
  };

  const decideApplication = async (application, nextStatus) => {
    let rejectionReason = "";
    if (nextStatus === "REJECTED") {
      rejectionReason = window.prompt("Enter the reason for rejection:");
      if (!rejectionReason?.trim()) return;
    }
    if (!window.confirm(`${nextStatus === "APPROVED" ? "Approve" : "Reject"} this application?`)) return;
    setBusy(true);
    try {
      await reviewGovernmentApplication(application.applicationId, { status: nextStatus, rejectionReason }, demoParams);
      setNotice(`Application ${nextStatus.toLowerCase()}.`);
      await load();
    } catch (reviewError) { setNotice(reviewError.message); }
    finally { setBusy(false); }
  };

  const addDepartment = async event => {
    event.preventDefault();
    setBusy(true);
    try {
      await createGovernmentDepartment({ name: departmentName }, demoParams);
      setDepartmentName("");
      setNotice("Department added.");
      await load();
    } catch (saveError) { setNotice(saveError.message); }
    finally { setBusy(false); }
  };

  const addOfficer = async event => {
    event.preventDefault();
    setBusy(true);
    try {
      await createGovernmentOfficer(officerForm);
      setOfficerFormOpen(false);
      setOfficerForm({ name: "", email: "", password: "", role: "Government Officer", departmentId: "" });
      setNotice("Government officer account created.");
      await load();
    } catch (saveError) { setNotice(saveError.message); }
    finally { setBusy(false); }
  };

  const exportComplaints = async (format = "csv") => {
    const printWindow = format === "pdf" ? window.open("", "_blank") : null;
    if (format === "pdf" && !printWindow) {
      setNotice("Allow pop-ups to print the complaint report as PDF.");
      return;
    }
    setBusy(true);
    try {
      const firstPage = await getGovernmentComplaints({ ...complaintFilters, page: "1", pageSize: "100" });
      const exported = [...firstPage.items];
      for (let nextPage = 2; nextPage <= firstPage.pages; nextPage += 1) {
        const result = await getGovernmentComplaints({ ...complaintFilters, page: String(nextPage), pageSize: "100" });
        exported.push(...result.items);
      }
    const rows = [["Complaint ID", "Subject", "Department", "District", "Priority", "Status", "Submitted"]];
      exported.forEach(item => rows.push([item.complaintId, item.subject, item.departmentName, item.district, item.priority, item.status, dateLabel(item.submittedAt)]));
      if (format === "pdf") {
        const body = exported.map(item => `<tr>${[item.complaintId, item.subject, item.departmentName, item.district, item.priority, item.status, dateLabel(item.submittedAt)].map(value => `<td>${escapeHtml(value)}</td>`).join("")}</tr>`).join("");
        printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Government complaints report</title><style>body{font:12px Arial,sans-serif;padding:24px;color:#17283d}h1{font-size:20px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccd5df;padding:7px;text-align:left}th{background:#edf2f7}</style></head><body><h1>Government complaints report</h1><p>${exported.length} matching records · Generated ${new Date().toLocaleString()}</p><table><thead><tr>${rows[0].map(value => `<th>${escapeHtml(value)}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table></body></html>`);
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
      } else {
        const csv = rows.map(row => row.map(value => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\r\n");
        const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = "government-complaints.csv";
        link.click();
        URL.revokeObjectURL(url);
      }
      setNotice(format === "pdf" ? `Prepared a printable report with ${exported.length} complaints. Choose Save as PDF in the print dialog.` : `Exported ${exported.length} complaints to CSV.`);
    } catch (exportError) { setNotice(exportError.message); }
    finally { setBusy(false); }
  };

  const metrics = [
    ["Registered citizens", dashboard.citizens, Users, "#315f91"],
    ["Total complaints", dashboard.complaints, FileText, "#386cb0"],
    ["Pending complaints", dashboard.pending, ClipboardList, "#e39b26"],
    ["In progress", dashboard.inProgress, Activity, "#7253a4"],
    ["Resolved complaints", dashboard.resolved, CheckCircle, "#378457"],
    ["Active schemes", dashboard.schemesActive, Landmark, "#287b78"],
    ["Scheme applications", dashboard.totalApplications, FileText, "#4a759c"],
    ["Awaiting approval", dashboard.pendingApplications, AlertTriangle, "#b34747"],
  ];

  return <main style={{ maxWidth: 1450, margin: "0 auto", color: "#17283d", fontFamily: "Inter, sans-serif" }}>
    <header style={{ ...panel, display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center", marginBottom: 16, padding: "15px 20px" }}>
      <div style={{ width: 44, height: 44, borderRadius: 13, display: "grid", placeItems: "center", background: "#e8eef7" }}><Landmark size={22} color="#244a73" /></div>
      <div style={{ flex: 1, minWidth: 180 }}><h2 style={{ fontSize: 19, margin: 0 }}>Government Administration Portal</h2><p style={{ color: "#708095", fontSize: 11, margin: "4px 0 0" }}>Citizen services · complaints · public schemes · departmental performance</p></div>
      {import.meta.env.DEV && <label style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 11, fontWeight: 700, color: demo ? "#835b13" : "#476078", background: demo ? "#fff3d9" : "#edf2f7", borderRadius: 9, padding: "9px 11px" }}><input type="checkbox" checked={demo} onChange={event => setDemo(event.target.checked)} /> Development DM data</label>}
      <label style={dateFilter}>From <input type="date" aria-label="Dashboard start date" value={from} max={to || undefined} onChange={event => setFrom(event.target.value)} /></label>
      <label style={dateFilter}>To <input type="date" aria-label="Dashboard end date" value={to} min={from || undefined} onChange={event => setTo(event.target.value)} /></label>
      <button onClick={load} disabled={loading} style={buttonStyle}><RefreshCw size={14} /> Refresh</button>
    </header>
    {notice && <div role="status" style={{ ...panel, padding: 10, marginBottom: 12, color: "#236b45" }}>{notice}</div>}
    {error && <div role="alert" style={{ ...panel, padding: 13, marginBottom: 14, color: "#a93232", borderColor: "#efc6c6" }}>Could not load dashboard data: {error} <button onClick={load} style={{ ...buttonStyle, marginLeft: 8 }}>Retry</button></div>}
    <nav aria-label="Government administration sections" style={{ display: "flex", gap: 7, overflowX: "auto", paddingBottom: 12 }}>
      {["Overview", "Complaints", "Schemes", "Departments & Officers"].map(item => <button key={item} onClick={() => setSection(item)} style={{ ...tabStyle, ...(section === item ? tabActive : {}) }}>{item}</button>)}
    </nav>
    {loading ? <div style={{ ...panel, color: "#708095", textAlign: "center", padding: 36 }}>Loading government services…</div> : section === "Overview" ? <Overview
      dashboard={dashboard} metrics={metrics} complaints={complaints.items} alerts={alerts}
      onOpenComplaints={() => setSection("Complaints")} onOpenSchemes={() => setSection("Schemes")}
      demo={demo} trendPeriod={trendPeriod} onTrendPeriod={setTrendPeriod}
    /> : section === "Complaints" ? <section style={panel}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", marginBottom: 13 }}>
        <h3 style={{ margin: 0, flex: 1 }}>Citizen complaints <small style={{ color: "#75849a", fontWeight: 400 }}>({complaints.total})</small></h3>
        <button disabled={busy} onClick={() => exportComplaints("csv")} style={buttonStyle}><Download size={14} /> Export CSV</button>
        <button disabled={busy} onClick={() => exportComplaints("pdf")} style={buttonStyle}>Print / Save PDF</button>
      </div>
      <div style={filterGrid}>
        <label style={searchStyle}><Search size={14} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Complaint ID, subject, citizen reference" aria-label="Search complaints" style={inputStyle} /></label>
        <select aria-label="Filter department" value={department} onChange={event => setDepartment(event.target.value)} style={selectStyle}><option value="">All departments</option>{dashboard.departments.map(item => <option key={item.departmentId || item.department} value={item.departmentId || ""}>{item.department}</option>)}</select>
        <select aria-label="Filter district" value={district} onChange={event => setDistrict(event.target.value)} style={selectStyle}><option value="">All districts</option>{dashboard.districts.map(item => <option key={item.district}>{item.district}</option>)}</select>
        <select aria-label="Filter priority" value={priority} onChange={event => setPriority(event.target.value)} style={selectStyle}><option value="">All priorities</option>{PRIORITY.map(value => <option key={value}>{value}</option>)}</select>
        <select aria-label="Filter complaint status" value={status} onChange={event => setStatus(event.target.value)} style={selectStyle}><option value="">All statuses</option>{STATUS.map(value => <option key={value}>{value}</option>)}</select>
        <label style={dateFilter}>From <input type="date" aria-label="Complaints from date" value={from} max={to || undefined} onChange={event => setFrom(event.target.value)} /></label>
        <label style={dateFilter}>To <input type="date" aria-label="Complaints to date" value={to} min={from || undefined} onChange={event => setTo(event.target.value)} /></label>
        <select aria-label="Sort complaints" value={sortBy} onChange={event => setSortBy(event.target.value)} style={selectStyle}><option value="submittedAt">Sort: submission date</option><option value="priority">Sort: priority</option><option value="status">Sort: status</option><option value="subject">Sort: subject</option></select>
        <button onClick={() => setSortOrder(value => value === "asc" ? "desc" : "asc")} style={buttonStyle}>Order: {sortOrder === "asc" ? "Oldest / A–Z" : "Newest / Z–A"}</button>
      </div>
      <div style={{ overflowX: "auto" }}><table style={tableStyle}><thead><tr>{["Complaint", "Department / district", "Priority", "Status", "Submitted / due", "Assigned officer", "Action"].map(item => <th key={item} style={thStyle}>{item}</th>)}</tr></thead><tbody>
        {complaints.items.map(item => <tr key={item.complaintId}><td style={tdStyle}><b>{item.complaintId}</b><div style={smallText}>{item.subject}</div><div style={smallText}>Citizen ref: {item.citizenReference}</div></td><td style={tdStyle}>{item.departmentName}<div style={smallText}>{item.district}</div></td><td style={tdStyle}><Badge value={item.priority} /></td><td style={tdStyle}><Badge value={item.status} /></td><td style={tdStyle}>{dateLabel(item.submittedAt)}<div style={smallText}>Due {dateLabel(item.dueAt)}</div></td><td style={tdStyle}>{item.assignedOfficerName || "Unassigned"}</td><td style={tdStyle}><button onClick={() => openComplaint(item)} style={linkStyle}>Review</button></td></tr>)}
      </tbody></table></div>
      {!complaints.items.length && <Empty text={demo ? "No DM complaints yet. Seed local data to populate this page." : "No complaints match these filters."} />}
      <Pager page={page} pages={complaints.pages} onPage={setPage} />
    </section> : section === "Schemes" ? <SchemesSection
      schemes={schemes} applications={applications.items} applicationPage={applicationPage} applicationPages={applications.pages} applicationStatus={applicationStatus} onApplicationStatus={setApplicationStatus} onApplicationPage={setApplicationPage} busy={busy} onCreate={() => { setEditingSchemeId(""); setSchemeFormOpen(true); }} onEdit={scheme => {
        setEditingSchemeId(scheme.schemeId);
        setSchemeForm({ name: scheme.name || "", description: scheme.description || "", departmentName: scheme.departmentName || "", eligibility: scheme.eligibility || "", requiredDocuments: (scheme.requiredDocuments || []).join(", "), openingAt: dateInput(scheme.openingAt), closingAt: dateInput(scheme.closingAt) });
        setSchemeFormOpen(true);
      }} onToggle={async scheme => {
        try { await updateGovernmentScheme(scheme.schemeId, { active: !scheme.active }, demoParams); setNotice("Scheme updated."); await load(); }
        catch (updateError) { setNotice(updateError.message); }
      }} onDecision={decideApplication} />
    : <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,420px),1fr))", gap: 15 }}>
      <div style={panel}><h3 style={{ marginTop: 0 }}>Departments</h3><form onSubmit={addDepartment} style={{ display: "flex", gap: 7, marginBottom: 12 }}><input required maxLength={200} value={departmentName} onChange={event => setDepartmentName(event.target.value)} placeholder="New department name" style={inputBox} /><button disabled={busy} style={primaryButton}><Plus size={14} /> Add</button></form>{departments.map(item => <div key={item.departmentId} style={listRow}><div><b>{item.name}</b><div style={smallText}>{item.active ? "Active" : "Inactive"}</div></div>{!item.isSynthetic && <button onClick={async () => {
        try { await updateGovernmentDepartment(item.departmentId, { active: !item.active }, demoParams); setNotice("Department status updated."); await load(); }
        catch (updateError) { setNotice(updateError.message); }
      }} style={buttonStyle}>{item.active ? "Deactivate" : "Activate"}</button>}</div>)}{!departments.length && <Empty text="No departments have been configured." />}</div>
      <div style={panel}><div style={titleRow}><h3 style={{ ...panelTitle, flex: 1 }}>Authorized officers and workload</h3>{["Admin", "Super Administrator"].includes(user?.role) && !demo && <button onClick={() => setOfficerFormOpen(true)} style={primaryButton}><Plus size={14} /> Register officer</button>}</div>{officers.map(officer => {
        const workload = officer.openComplaintCount || 0;
        return <div key={officer.userId} style={listRow}><div style={{ flex: 1 }}><b>{officer.name || officer.fullName || officer.userId}</b><div style={smallText}>{officer.role} · {officer.departmentName || "No department"} · {workload} open in current page · {officer.isActive === false ? "Inactive" : "Active"}</div>{!officer.isSynthetic && <select aria-label={`Assign department to ${officer.name || officer.userId}`} value={officer.departmentId || ""} onChange={async event => {
          const nextDepartment = departments.find(item => item.departmentId === event.target.value);
          try { await updateGovernmentOfficer(officer.userId, { departmentId: nextDepartment?.departmentId || "", departmentName: nextDepartment?.name || "" }); setNotice("Officer department updated."); await load(); }
          catch (updateError) { setNotice(updateError.message); }
        }} style={{ ...selectStyle, marginTop: 5 }}><option value="">No department</option>{departments.map(item => <option key={item.departmentId} value={item.departmentId}>{item.name}</option>)}</select>}</div>{!officer.isSynthetic && <button onClick={async () => {
          const nextActive = officer.isActive === false;
          if (!window.confirm(`${nextActive ? "Activate" : "Deactivate"} this officer?`)) return;
          try { await updateGovernmentOfficer(officer.userId, { isActive: nextActive }); setNotice("Officer status updated."); await load(); }
          catch (updateError) { setNotice(updateError.message); }
        }} style={buttonStyle}>{officer.isActive === false ? "Activate" : "Deactivate"}</button>}</div>;
      })}{!officers.length && <Empty text="No government officer accounts were found." />}</div>
    </section>}

    {schemeFormOpen && <Modal title={editingSchemeId ? "Edit government scheme" : "Create government scheme"} onClose={() => setSchemeFormOpen(false)}>
      <form onSubmit={saveScheme} style={{ display: "grid", gap: 9 }}>
        <Input label="Scheme name" value={schemeForm.name} onChange={name => setSchemeForm({ ...schemeForm, name })} required />
        <Input label="Description" value={schemeForm.description} onChange={description => setSchemeForm({ ...schemeForm, description })} required />
        <Input label="Responsible department" value={schemeForm.departmentName} onChange={departmentName => setSchemeForm({ ...schemeForm, departmentName })} required />
        <Input label="Eligibility criteria" value={schemeForm.eligibility} onChange={eligibility => setSchemeForm({ ...schemeForm, eligibility })} />
        <Input label="Required documents (comma separated)" value={schemeForm.requiredDocuments} onChange={requiredDocuments => setSchemeForm({ ...schemeForm, requiredDocuments })} />
        <label style={labelStyle}>Application opens<input type="date" value={schemeForm.openingAt} onChange={event => setSchemeForm({ ...schemeForm, openingAt: event.target.value })} style={inputBox} /></label>
        <label style={labelStyle}>Application closes<input type="date" value={schemeForm.closingAt} onChange={event => setSchemeForm({ ...schemeForm, closingAt: event.target.value })} style={inputBox} /></label>
        <button disabled={busy} style={primaryButton}>{editingSchemeId ? "Save scheme" : "Create scheme"}</button>
      </form>
    </Modal>}
    {officerFormOpen && <Modal title="Register government officer" onClose={() => setOfficerFormOpen(false)}>
      <form onSubmit={addOfficer} style={{ display: "grid", gap: 9 }}>
        <Input label="Officer name" value={officerForm.name} onChange={name => setOfficerForm({ ...officerForm, name })} required />
        <Input label="Government email" value={officerForm.email} onChange={email => setOfficerForm({ ...officerForm, email })} required />
        <label style={labelStyle}>Temporary password (minimum 12 characters)<input type="password" required minLength={12} autoComplete="new-password" value={officerForm.password} onChange={event => setOfficerForm({ ...officerForm, password: event.target.value })} style={inputBox} /></label>
        <label style={labelStyle}>Role<select value={officerForm.role} onChange={event => setOfficerForm({ ...officerForm, role: event.target.value })} style={selectStyle}><option>Government Officer</option><option>Department Administrator</option></select></label>
        <label style={labelStyle}>Department<select required value={officerForm.departmentId} onChange={event => setOfficerForm({ ...officerForm, departmentId: event.target.value })} style={selectStyle}><option value="">Select department</option>{departments.filter(item => item.active).map(item => <option key={item.departmentId} value={item.departmentId}>{item.name}</option>)}</select></label>
        <button disabled={busy} style={primaryButton}>Create account</button>
      </form>
    </Modal>}
    {selectedComplaint && <Modal title={`${selectedComplaint.complaintId} · ${selectedComplaint.subject}`} onClose={() => setSelectedComplaint(null)}>
      <p style={{ color: "#61748a", fontSize: 12 }}>{selectedComplaint.description}</p>
      <p style={smallText}>Citizen reference: {selectedComplaint.citizenReference} · {selectedComplaint.district} · submitted {dateLabel(selectedComplaint.submittedAt)} · due {dateLabel(selectedComplaint.dueAt)}</p>
      <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
        <label style={labelStyle}>Status<select value={selectedComplaint.statusDraft} onChange={event => setSelectedComplaint({ ...selectedComplaint, statusDraft: event.target.value })} style={selectStyle}>{STATUS.map(value => <option key={value}>{value}</option>)}</select></label>
        <label style={labelStyle}>Assign officer<select value={selectedComplaint.officerDraft} onChange={event => setSelectedComplaint({ ...selectedComplaint, officerDraft: event.target.value })} style={selectStyle}><option value="">Unassigned</option>{officers.map(officer => <option key={officer.userId} value={officer.userId}>{officer.name || officer.fullName} · {officer.departmentName || "No department"}</option>)}</select></label>
        {selectedComplaint.statusDraft === "RESOLVED" && <label style={labelStyle}>Resolution details<textarea required value={selectedComplaint.resolutionDraft} onChange={event => setSelectedComplaint({ ...selectedComplaint, resolutionDraft: event.target.value })} style={inputBox} /></label>}
        {selectedComplaint.statusDraft === "REJECTED" && <label style={labelStyle}>Rejection reason<textarea required value={selectedComplaint.rejectionDraft} onChange={event => setSelectedComplaint({ ...selectedComplaint, rejectionDraft: event.target.value })} style={inputBox} /></label>}
        <label style={labelStyle}>Internal note<textarea maxLength={2000} value={selectedComplaint.noteDraft} onChange={event => setSelectedComplaint({ ...selectedComplaint, noteDraft: event.target.value })} style={inputBox} /></label>
        {(selectedComplaint.auditHistory || []).slice(-5).reverse().map((entry, index) => <div key={`${entry.changedAt}-${index}`} style={smallText}>{dateLabel(entry.changedAt)} · {entry.actorName || entry.actorId} · {entry.action || entry.status || "Updated"}</div>)}
        <button disabled={busy} onClick={saveComplaint} style={primaryButton}>Save complaint changes</button>
      </div>
    </Modal>}
  </main>;
}

function Overview({ dashboard, metrics, complaints, alerts, onOpenComplaints, onOpenSchemes, demo, trendPeriod, onTrendPeriod }) {
  const districtData = dashboard.departments;
  return <div>
    <div style={cardGrid}>{metrics.map(([label, value, Icon, color]) => <div key={label} style={{ ...panel, padding: 15, display: "flex", gap: 11, alignItems: "center" }}><span style={{ width: 37, height: 37, display: "grid", placeItems: "center", borderRadius: 11, background: `${color}18` }}><Icon size={17} color={color} /></span><div><b style={{ display: "block", fontSize: 21 }}>{Number(value || 0).toLocaleString()}</b><span style={smallText}>{label}</span></div></div>)}</div>
    <div style={chartGrid}>
      <section style={panel}><div style={titleRow}><h3 style={{ ...panelTitle, flex: 1 }}>Complaints received and resolved</h3><select aria-label="Complaint trend period" value={trendPeriod} onChange={event => onTrendPeriod(event.target.value)} style={selectStyle}><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></div>{dashboard.trend.length ? <div style={{ height: 235 }}><ResponsiveContainer width="100%" height="100%"><LineChart data={dashboard.trend}><CartesianGrid stroke="#e8edf3" strokeDasharray="3 3" /><XAxis dataKey="month" tick={{ fontSize: 10 }} /><YAxis allowDecimals={false} tick={{ fontSize: 10 }} /><Tooltip /><Legend /><Line dataKey="received" name="Received" stroke="#315f91" strokeWidth={2} /><Line dataKey="resolved" name="Resolved" stroke="#378457" strokeWidth={2} /></LineChart></ResponsiveContainer></div> : <Empty text="No complaint history is available for this period." />}</section>
      <section style={panel}><h3 style={panelTitle}>Complaint status distribution</h3>{dashboard.byStatus.length ? <div style={{ height: 235 }}><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={dashboard.byStatus} dataKey="count" nameKey="status" innerRadius={50} outerRadius={83} paddingAngle={3}>{dashboard.byStatus.map((entry, index) => <Cell key={entry.status} fill={COLORS[index % COLORS.length]} />)}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer></div> : <Empty text="No complaints recorded." />}</section>
      <section style={panel}><h3 style={panelTitle}>Department performance</h3>{districtData.length ? <div style={{ height: 235 }}><ResponsiveContainer width="100%" height="100%"><BarChart data={districtData}><CartesianGrid stroke="#e8edf3" strokeDasharray="3 3" /><XAxis dataKey="department" tick={{ fontSize: 9 }} interval={0} angle={-15} textAnchor="end" height={48} /><YAxis allowDecimals={false} tick={{ fontSize: 10 }} /><Tooltip /><Legend /><Bar dataKey="received" name="Received" fill="#4b76a5" radius={[4, 4, 0, 0]} /><Bar dataKey="resolved" name="Resolved" fill="#48a17d" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div> : <Empty text="Department performance will appear when complaints are available." />}</section>
      <section style={panel}><h3 style={panelTitle}>Complaints by district</h3>{dashboard.districts.length ? <div style={{ height: 235 }}><ResponsiveContainer width="100%" height="100%"><BarChart data={dashboard.districts}><CartesianGrid stroke="#e8edf3" strokeDasharray="3 3" /><XAxis dataKey="district" tick={{ fontSize: 9 }} interval={0} angle={-15} textAnchor="end" height={48} /><YAxis allowDecimals={false} tick={{ fontSize: 10 }} /><Tooltip /><Bar dataKey="complaints" name="Complaints" fill="#287b78" radius={[4, 4, 0, 0]}>{dashboard.districts.map((item, index) => <Cell key={item.district} fill={COLORS[index % COLORS.length]} />)}</Bar></BarChart></ResponsiveContainer></div> : <Empty text="No location-based complaint data available." />}</section>
    </div>
    <div style={chartGrid}>
      <section style={panel}><div style={titleRow}><h3 style={panelTitle}>Recent complaints</h3><button onClick={onOpenComplaints} style={linkStyle}>View all</button></div>{complaints.slice(0, 5).map(item => <div key={item.complaintId} style={listRow}><div><b>{item.complaintId} · {item.subject}</b><div style={smallText}>{item.departmentName} · {item.district} · {dateLabel(item.submittedAt)}</div></div><Badge value={item.status} /></div>)}{!complaints.length && <Empty text={demo ? "No DM complaints. Seed the local database to populate this dashboard." : "No complaints received."} />}</section>
      <section style={panel}><div style={titleRow}><h3 style={panelTitle}>Alerts and approvals</h3><button onClick={onOpenSchemes} style={linkStyle}>Review applications</button></div>{alerts.overdue.map(item => <div key={item.complaintId} style={{ ...listRow, color: "#a33838" }}><AlertTriangle size={15} /><span><b>Overdue:</b> {item.complaintId} · {item.subject}</span></div>)}{alerts.dueSoon.map(item => <div key={item.complaintId} style={listRow}><Bell size={15} color="#c28319" /><span><b>Due soon:</b> {item.complaintId} · {item.subject} · {dateLabel(item.dueAt)}</span></div>)}{alerts.approvals.slice(0, 5).map(item => <div key={item.applicationId} style={listRow}><Bell size={15} color="#c28319" /><span>Pending approval · {item.schemeName} · {item.applicationId}</span></div>)}{!alerts.overdue.length && !alerts.dueSoon.length && !alerts.approvals.length && <Empty text="No overdue complaints or pending approvals." />}</section>
    </div>
  </div>;
}

function SchemesSection({ schemes, applications, applicationPage, applicationPages, applicationStatus, onApplicationStatus, onApplicationPage, busy, onCreate, onEdit, onToggle, onDecision }) {
  return <div style={{ display: "grid", gap: 15 }}>
    <section style={panel}><div style={titleRow}><h3 style={panelTitle}>Government schemes</h3><button onClick={onCreate} style={primaryButton}><Plus size={14} /> Add scheme</button></div><div style={{ overflowX: "auto" }}><table style={tableStyle}><thead><tr>{["Scheme", "Department", "Applications", "Approved / rejected / pending", "Dates", "Status", "Action"].map(item => <th key={item} style={thStyle}>{item}</th>)}</tr></thead><tbody>{schemes.map(item => <tr key={item.schemeId}><td style={tdStyle}><b>{item.name}</b><div style={smallText}>{item.eligibility || item.description}</div></td><td style={tdStyle}>{item.departmentName}</td><td style={tdStyle}>{item.applicationCount ?? "—"}</td><td style={tdStyle}>{item.approvedCount ?? "—"} / {item.rejectedCount ?? "—"} / {item.pendingCount ?? "—"}</td><td style={tdStyle}>{dateLabel(item.openingAt)} – {dateLabel(item.closingAt)}</td><td style={tdStyle}><Badge value={item.active ? "ACTIVE" : "INACTIVE"} /></td><td style={tdStyle}><button disabled={busy} onClick={() => onEdit(item)} style={linkStyle}>Edit</button><button disabled={busy} onClick={() => onToggle(item)} style={{ ...linkStyle, marginLeft: 7 }}>{item.active ? "Deactivate" : "Activate"}</button></td></tr>)}</tbody></table></div>{!schemes.length && <Empty text="No schemes are available. Add a scheme or seed local DM data." />}</section>
    <section style={panel}><div style={titleRow}><h3 style={{ ...panelTitle, flex: 1 }}>Recent scheme applications</h3><select aria-label="Filter scheme applications" value={applicationStatus} onChange={event => onApplicationStatus(event.target.value)} style={selectStyle}><option value="">All application statuses</option><option value="PENDING">Pending</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option></select></div><div style={{ overflowX: "auto" }}><table style={tableStyle}><thead><tr>{["Application", "Scheme", "Citizen reference", "District", "Submitted", "Status", "Review"].map(item => <th key={item} style={thStyle}>{item}</th>)}</tr></thead><tbody>{applications.map(item => <tr key={item.applicationId}><td style={tdStyle}>{item.applicationId}</td><td style={tdStyle}>{item.schemeName}</td><td style={tdStyle}>{item.citizenReference}</td><td style={tdStyle}>{item.district}</td><td style={tdStyle}>{dateLabel(item.submittedAt)}</td><td style={tdStyle}><Badge value={item.status} /></td><td style={tdStyle}>{item.status === "PENDING" && <><button disabled={busy} onClick={() => onDecision(item, "APPROVED")} style={linkStyle}>Approve</button><button disabled={busy} onClick={() => onDecision(item, "REJECTED")} style={{ ...linkStyle, color: "#b34747", marginLeft: 9 }}>Reject</button></>}</td></tr>)}</tbody></table></div>{!applications.length && <Empty text="No applications are awaiting review." />}<Pager page={applicationPage} pages={applicationPages || 1} onPage={onApplicationPage} /></section>
  </div>;
}

function Modal({ title, onClose, children }) {
  return <div role="presentation" onClick={onClose} style={overlay}><section role="dialog" aria-modal="true" aria-label={title} onClick={event => event.stopPropagation()} style={dialog}><div style={titleRow}><h3 style={{ ...panelTitle, flex: 1 }}>{title}</h3><button aria-label="Close dialog" onClick={onClose} style={buttonStyle}>Close</button></div>{children}</section></div>;
}
function Input({ label, value, onChange, required = false }) {
  return <label style={labelStyle}>{label}<input required={required} maxLength={5000} value={value} onChange={event => onChange(event.target.value)} style={inputBox} /></label>;
}
function Badge({ value }) {
  const color = value === "RESOLVED" || value === "APPROVED" || value === "ACTIVE" ? "#287348" : value === "REJECTED" || value === "URGENT" || value === "HIGH" ? "#a63e3e" : value === "SUBMITTED" || value === "PENDING" ? "#a77317" : "#456a91";
  return <span style={{ display: "inline-block", background: `${color}16`, color, borderRadius: 20, padding: "4px 8px", fontSize: 10, fontWeight: 750, whiteSpace: "nowrap" }}>{String(value || "UNKNOWN").replaceAll("_", " ")}</span>;
}
function Empty({ text }) { return <p style={{ padding: "12px 2px", color: "#75849a", fontSize: 12, margin: 0 }}>{text}</p>; }
function Pager({ page, pages, onPage }) {
  return <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 9, paddingTop: 13, color: "#75849a", fontSize: 11 }}>Page {page} of {pages}<button aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)} style={buttonStyle}><ChevronLeft size={14} /></button><button aria-label="Next page" disabled={page >= pages} onClick={() => onPage(page + 1)} style={buttonStyle}><ChevronRight size={14} /></button></div>;
}
function dateLabel(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}
function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
function dateInput(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

const buttonStyle = { display: "inline-flex", alignItems: "center", gap: 5, border: "1px solid #d8e0ea", borderRadius: 8, padding: "8px 11px", background: "#fff", color: "#435a72", cursor: "pointer", fontSize: 11 };
const primaryButton = { ...buttonStyle, background: "#244a73", color: "#fff", borderColor: "#244a73", fontWeight: 700 };
const tabStyle = { ...buttonStyle, whiteSpace: "nowrap", padding: "9px 13px" };
const tabActive = { background: "#244a73", color: "#fff", borderColor: "#244a73" };
const panelTitle = { margin: "0 0 12px", fontSize: 14, color: "#243c57" };
const cardGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(205px,1fr))", gap: 11, marginBottom: 15 };
const chartGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,420px),1fr))", gap: 14, marginBottom: 14 };
const filterGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 8, marginBottom: 13 };
const titleRow = { display: "flex", alignItems: "center", gap: 10, marginBottom: 9 };
const tableStyle = { width: "100%", borderCollapse: "collapse", minWidth: 780, fontSize: 11 };
const thStyle = { padding: "10px 8px", textAlign: "left", background: "#f4f7fa", color: "#51667e", borderBottom: "1px solid #e4e9f0", whiteSpace: "nowrap" };
const tdStyle = { padding: "10px 8px", borderBottom: "1px solid #edf0f4", verticalAlign: "top", color: "#263c55" };
const smallText = { color: "#78889b", fontSize: 10, marginTop: 3 };
const linkStyle = { border: 0, background: "transparent", color: "#245b91", textDecoration: "underline", cursor: "pointer", fontSize: 11, fontWeight: 650, padding: 3 };
const listRow = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 0", borderBottom: "1px solid #edf0f4", fontSize: 11 };
const searchStyle = { display: "flex", alignItems: "center", gap: 7, border: "1px solid #d8e0ea", borderRadius: 8, padding: "0 9px", color: "#75849a" };
const dateFilter = { display: "flex", alignItems: "center", gap: 5, border: "1px solid #d8e0ea", borderRadius: 8, padding: "4px 8px", color: "#63768b", fontSize: 10 };
const inputStyle = { width: "100%", minWidth: 0, border: 0, outline: 0, padding: "9px 0", fontSize: 11 };
const selectStyle = { border: "1px solid #d8e0ea", borderRadius: 8, padding: 9, background: "#fff", color: "#435a72", fontSize: 11, minWidth: 0 };
const inputBox = { boxSizing: "border-box", width: "100%", border: "1px solid #d8e0ea", borderRadius: 8, padding: 9, font: "inherit", fontSize: 12 };
const labelStyle = { display: "grid", gap: 5, color: "#51667e", fontSize: 11 };
const overlay = { position: "fixed", inset: 0, zIndex: 100, background: "#101e30a6", display: "grid", placeItems: "center", padding: 14 };
const dialog = { background: "#fff", borderRadius: 14, padding: 20, width: "min(620px, 100%)", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 18px 60px #10203040" };
