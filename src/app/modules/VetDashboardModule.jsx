import { useEffect, useMemo, useState } from "react";
import { Home, ClipboardList, AlertTriangle, Syringe, MapPin, Bell, Stethoscope, CheckCircle, Clock, TrendingUp } from "lucide-react";
import { getFarms, getDiseases, getNotifications, getAnalyticsSummary, getVaccinations } from "../../api/mongoService";
import { formatDate } from "../../utils/dateTime";

const P = {
  purple: "#6d28d9", purpleBg: "#f5f3ff", purpleLight: "#ede9fe",
  red: "#C62828", redBg: "#fef2f2",
  yellow: "#F9A825", yellowBg: "#fffde7",
  green: "#4CAF50", greenBg: "#f0fdf4",
  blue: "#1565c0", blueBg: "#eff6ff",
  dark: "#1a1a2e", gray: "#6b7280", white: "#ffffff",
};

// Static demo data (shown after real data)
const DEMO_FARMS = [
  { farmId: "DEMO-FARM-001", farmName: "Green Valley Pig Farm", farmType: "pig", district: "Demo District", risk: "MODERATE", latitude: 12.9716, longitude: 77.5946 },
  { farmId: "DEMO-FARM-002", farmName: "Sunrise Poultry Farm", farmType: "poultry", district: "Demo District", risk: "LOW", latitude: 13.0827, longitude: 80.2707 },
];

const DEMO_DISEASES = [
  { reportId: "DEMO-RPT-001", suspectedDisease: "Classical Swine Fever", farmId: "DEMO-FARM-001", status: "UNDER_REVIEW", riskLevel: "HIGH", affectedAnimals: 15, reportedDate: new Date().toISOString() },
  { reportId: "DEMO-RPT-002", suspectedDisease: "Newcastle Disease", farmId: "DEMO-FARM-002", status: "REPORTED", riskLevel: "MODERATE", affectedAnimals: 50, reportedDate: new Date().toISOString() },
];

const DEMO_NOTIFICATIONS = [
  { notificationId: "DEMO-NOTIF-001", title: "Scheduled Vaccination", message: "Reminder: Annual vaccination drive next week", type: "info", createdAt: new Date().toISOString() },
  { notificationId: "DEMO-NOTIF-002", title: "Disease Alert", message: "New suspected case reported in nearby farm", type: "alert", createdAt: new Date().toISOString() },
];

function StatCard({ icon: Icon, label, value, color, bg }) {
  return (
    <div style={{ background: P.white, borderRadius: 12, padding: "16px 20px", border: `1px solid ${color}20`, display: "flex", alignItems: "center", gap: 14 }}>
      <div style={{ width: 44, height: 44, borderRadius: 12, background: bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon size={20} color={color} />
      </div>
      <div>
        <div style={{ fontSize: 22, fontWeight: 700, color: color, fontFamily: "Poppins" }}>{value}</div>
        <div style={{ fontSize: 11, color: P.gray }}>{label}</div>
      </div>
    </div>
  );
}

function RiskBadge({ level }) {
  const colors = { HIGH: [P.red, P.redBg], MODERATE: [P.yellow, P.yellowBg], LOW: [P.green, P.greenBg] };
  const [color, bg] = colors[level] || [P.gray, "#f3f4f6"];
  return <span style={{ color, background: bg, borderRadius: 999, padding: "3px 8px", fontSize: 10, fontWeight: 700 }}>{level}</span>;
}

function ActivityItem({ icon: Icon, title, message, time, color }) {
  return (
    <div style={{ display: "flex", gap: 12, padding: "12px 0", borderBottom: "1px solid #f3f4f6" }}>
      <div style={{ width: 32, height: 32, borderRadius: 8, background: `${color}15`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon size={14} color={color} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: P.dark }}>{title}</div>
        <div style={{ fontSize: 11, color: P.gray, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{message}</div>
      </div>
      <div style={{ fontSize: 10, color: P.gray, flexShrink: 0 }}>{time}</div>
    </div>
  );
}

export default function VetDashboardModule({ user }) {
  const [farms, setFarms] = useState([]);
  const [diseases, setDiseases] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [vaccinations, setVaccinations] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);

  // Combine real data with demo data, real data first
  const allFarms = useMemo(() => {
    const real = farms.filter(f => !f.farmId?.startsWith("DEMO-"));
    const demo = DEMO_FARMS.filter(df => !real.some(r => r.farmId === df.farmId));
    return [...real, ...demo];
  }, [farms]);

  const allDiseases = useMemo(() => {
    const real = diseases.filter(d => !d.reportId?.startsWith("DEMO-"));
    const demo = DEMO_DISEASES.filter(dd => !real.some(r => r.reportId === dd.reportId));
    return [...real, ...demo];
  }, [diseases]);

  const allNotifications = useMemo(() => {
    const real = notifications.filter(n => !n.notificationId?.startsWith("DEMO-"));
    const demo = DEMO_NOTIFICATIONS.filter(dn => !real.some(r => r.notificationId === dn.notificationId));
    return [...real, ...demo];
  }, [notifications]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const [farmsData, diseasesData, notifsData, vacData, analyticsData] = await Promise.all([
          getFarms().catch(() => []),
          getDiseases().catch(() => []),
          getNotifications().catch(() => []),
          getVaccinations().catch(() => []),
          getAnalyticsSummary().catch(() => null),
        ]);
        if (!active) return;
        setFarms(Array.isArray(farmsData) ? farmsData : []);
        setDiseases(Array.isArray(diseasesData) ? diseasesData : []);
        setNotifications(Array.isArray(notifsData) ? notifsData : []);
        setVaccinations(Array.isArray(vacData) ? vacData : []);
        setAnalytics(analyticsData);
      } catch { }
      finally { if (active) setLoading(false); }
    };
    load();
    return () => { active = false; };
  }, []);

  const stats = useMemo(() => ({
    assignedFarms: allFarms.length,
    suspectedCases: allDiseases.filter(d => ["REPORTED", "UNDER_REVIEW"].includes(d.status)).length,
    highRiskCases: allDiseases.filter(d => d.riskLevel === "HIGH").length,
    vaccinationsCompleted: analytics?.vaccinationsCompleted || vaccinations.filter(v => v.status === "completed").length,
  }), [allFarms, allDiseases, analytics, vaccinations]);

  const recentActivities = useMemo(() => {
    const items = [];
    allDiseases.slice(0, 3).forEach(d => {
      items.push({ icon: AlertTriangle, title: `Suspected ${d.suspectedDisease}`, message: `Farm: ${d.farmId}`, time: formatDate(d.reportedDate), color: d.riskLevel === "HIGH" ? P.red : P.yellow });
    });
    allNotifications.slice(0, 3).forEach(n => {
      items.push({ icon: Bell, title: n.title, message: n.message, time: formatDate(n.createdAt), color: n.type === "alert" ? P.red : P.blue });
    });
    return items.sort((a, b) => new Date(b.time) - new Date(a.time)).slice(0, 5);
  }, [allDiseases, allNotifications]);

  if (loading) {
    return (
      <div style={{ fontFamily: "Inter", maxWidth: 1200, margin: "0 auto", padding: 24, textAlign: "center" }}>
        <div style={{ color: P.gray, fontSize: 13 }}>Loading dashboard data...</div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "Inter", maxWidth: 1200, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24, padding: "20px 24px", background: `linear-gradient(135deg, ${P.purple}18, ${P.purple}06)`, borderRadius: 16, border: `1px solid ${P.purple}20` }}>
        <div style={{ width: 48, height: 48, borderRadius: 14, background: P.purple, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Home size={22} color={P.white} />
        </div>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontFamily: "Poppins", fontSize: 18, fontWeight: 700, color: P.dark, margin: 0 }}>Veterinarian Dashboard</h2>
          <p style={{ fontSize: 12, color: P.gray, margin: "3px 0 0" }}>Overview of your assigned farms and activities</p>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, color: P.gray }}>Welcome back</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: P.purple }}>{user?.name || user?.fullName || "Dr. Veterinarian"}</div>
        </div>
      </div>

      {/* Stats Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
        <StatCard icon={Home} label="Assigned Farms" value={stats.assignedFarms} color={P.purple} bg={P.purpleBg} />
        <StatCard icon={AlertTriangle} label="Suspected Cases" value={stats.suspectedCases} color={P.yellow} bg={P.yellowBg} />
        <StatCard icon={ClipboardList} label="High Risk Cases" value={stats.highRiskCases} color={P.red} bg={P.redBg} />
        <StatCard icon={Syringe} label="Vaccinations Done" value={stats.vaccinationsCompleted} color={P.green} bg={P.greenBg} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 20 }}>
        {/* Assigned Farms */}
        <section style={{ background: P.white, borderRadius: 14, border: "1px solid #e5e7eb", overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid #f3f4f6" }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: P.dark, fontFamily: "Poppins" }}>Assigned Farms</h3>
            <span style={{ fontSize: 11, color: P.gray }}>{allFarms.length} farms</span>
          </div>
          <div style={{ padding: 8 }}>
            {allFarms.length === 0 ? (
              <div style={{ padding: 32, textAlign: "center", color: P.gray, fontSize: 12 }}>No farms assigned yet</div>
            ) : (
              allFarms.slice(0, 5).map(farm => (
                <div key={farm.farmId} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 10, marginBottom: 4, cursor: "pointer", transition: "background 0.15s" }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: P.purpleBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>
                    {farm.farmType === "pig" ? "🐷" : "🐔"}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: P.dark }}>{farm.farmName}</div>
                    <div style={{ fontSize: 11, color: P.gray }}>{farm.farmId} · {farm.district || "Location unavailable"}</div>
                  </div>
                  <RiskBadge level={farm.risk} />
                </div>
              ))
            )}
          </div>
        </section>

        {/* Recent Activity */}
        <section style={{ background: P.white, borderRadius: 14, border: "1px solid #e5e7eb", overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid #f3f4f6" }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: P.dark, fontFamily: "Poppins" }}>Recent Activity</h3>
            <Clock size={14} color={P.gray} />
          </div>
          <div style={{ padding: "8px 20px" }}>
            {recentActivities.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: P.gray, fontSize: 12 }}>No recent activity</div>
            ) : (
              recentActivities.map((item, i) => (
                <ActivityItem key={i} {...item} />
              ))
            )}
          </div>
        </section>
      </div>

      {/* Quick Actions */}
      <div style={{ marginTop: 24, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {[
          { label: "Start Inspection", icon: Stethoscope, color: P.purple, bg: P.purpleBg },
          { label: "View Appointments", icon: Clock, color: P.blue, bg: P.blueBg },
          { label: "Disease Reports", icon: AlertTriangle, color: P.yellow, bg: P.yellowBg },
          { label: "Vaccination Records", icon: Syringe, color: P.green, bg: P.greenBg },
        ].map(action => (
          <button key={action.label} style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", background: P.white, border: "1px solid #e5e7eb", borderRadius: 12, cursor: "pointer", transition: "all 0.15s" }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: action.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <action.icon size={15} color={action.color} />
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, color: P.dark }}>{action.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}