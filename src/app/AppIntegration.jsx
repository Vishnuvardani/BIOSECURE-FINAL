/**
 * AppIntegration.jsx
 * Wraps the existing App/DashboardShell and injects the 5 new modules:
 * 1. Biosecurity Assessment (connected to MongoDB)
 * 2. Disease Reporting (connected to MongoDB)
 * 3. GIS Outbreak Map (connected to MongoDB)
 * 4. Notification System (connected to MongoDB)
 * 5. Veterinary Inspection Workflow (connected to MongoDB)
 *
 * Also adds new nav items for each role.
 */
import { useState } from "react";
import { formatDate } from "../utils/dateTime";
import {
  Home, Leaf, Activity, Shield, Map, AlertTriangle, Syringe, LogOut,
  Zap, FileText, Bell, User, ClipboardList, BarChart2, Eye,
  CheckCircle, Flag, Database, Settings, Users, Stethoscope, MapPin, CalendarDays
} from "lucide-react";

import BiosecurityAssessmentModule from "./modules/BiosecurityAssessmentModule";
import DiseaseReportModule         from "./modules/DiseaseReportModule";
import GISOutbreakMapModule        from "./modules/GISOutbreakMapModule";
import NotificationSystemModule    from "./modules/NotificationSystemModule";
import VetInspectionModule         from "./modules/VetInspectionModule";
import VetAssignedFarmsModule      from "./modules/VetAssignedFarmsModule";
import VeterinaryAppointmentsModule from "./modules/VeterinaryAppointmentsModule";
import AIAssistantModule from "./modules/AIAssistantModule";
import GovernmentFarmMonitoringModule from "./modules/GovernmentFarmMonitoringModule";
import GovernmentAdvisoriesModule from "./modules/GovernmentAdvisoriesModule";

// ── Palette (matches App.jsx) ─────────────────────────────────────────────
const P = {
  olive: "#808034", oliveDark: "#5c5c24", ivory: "#FFFFE3",
  ivoryDark: "#f0f0d8", dark: "#1a1a0e", mid: "#6b6b4a",
  light: "#a0a080", white: "#ffffff",
  success: "#4CAF50", warning: "#FF9800", danger: "#D32F2F",
  info: "#42A5F5", purple: "#723480", lavender: "#DBD4FF",
};

// ── Extended nav configs with new module items ────────────────────────────
export const NAV_CONFIG = {
  farmer: {
    color: "#1a2010", accent: P.olive, title: "BioSecure Farm",
    items: [
      { label: "Dashboard",              icon: Home },
      { label: "Farm Management",        icon: Leaf },
      { label: "Animals",                icon: Activity },
      { label: "Biosecurity",            icon: Shield },
      { label: "Biosecurity Assessment", icon: Shield, isNew: true },
      { label: "Disease Report",         icon: AlertTriangle, isNew: true },
      { label: "Outbreak Map",           icon: MapPin, isNew: true },
      { label: "Find Veterinarian",      icon: Stethoscope, isNew: true },
      { label: "Vaccination",            icon: Syringe },
      { label: "AI Assistant",           icon: Zap },
      { label: "Notifications",          icon: Bell, isNew: true },
      { label: "Profile",                icon: User },
    ],
  },
  veterinarian: {
    color: "#1e0838", accent: P.purple, title: "Vet Portal",
    items: [
      { label: "Dashboard",           icon: Home },
      { label: "Assigned Farms",      icon: Leaf },
      { label: "Inspection",          icon: ClipboardList },
      { label: "Vet Inspection",      icon: Stethoscope, isNew: true },
      { label: "Appointment Requests", icon: CalendarDays, isNew: true },
      { label: "Health Records",      icon: FileText },
      { label: "Vaccination",         icon: Syringe },
      { label: "Disease Report",      icon: AlertTriangle, isNew: true },
      { label: "Outbreak Map",        icon: MapPin, isNew: true },
      { label: "AI Recommendation",   icon: Zap },
      { label: "Notifications",       icon: Bell, isNew: true },
      { label: "Profile",             icon: User },
    ],
  },
  government: {
    color: "#0d1a2d", accent: P.info, title: "Gov't Portal",
    items: [
      { label: "Dashboard",           icon: Home },
      { label: "Farm Monitoring",     icon: Eye },
      { label: "Disease Surveillance",icon: Activity },
      { label: "Outbreak Map",        icon: MapPin, isNew: true },
      { label: "Advisories",          icon: Flag },
      { label: "Notifications",       icon: Bell, isNew: true },
      { label: "Profile",             icon: User },
    ],
  },
  admin: {
    color: "#1a2010", accent: P.olive, title: "Admin Panel",
    items: [
      { label: "Dashboard",           icon: Home },
      { label: "User Management",     icon: Users },
      { label: "Farm Management",     icon: Leaf },
      { label: "Disease Database",    icon: Database },
      { label: "Notifications",       icon: Bell, isNew: true },
      { label: "Analytics",           icon: BarChart2 },
      { label: "System Settings",     icon: Settings },
      { label: "Profile",             icon: User },
    ],
  },
};

// ── Role label mapping ────────────────────────────────────────────────────
const ROLE_LABELS = {
  farmer: "Farmer",
  veterinarian: "Veterinarian",
  government: "Government Officer",
  admin: "Admin",
};

// ── Render new module pages ───────────────────────────────────────────────
function renderNewModule(module, farms, user, role) {
  switch (module) {
    case "Assigned Farms":
      return <VetAssignedFarmsModule farms={farms} user={user} />;
    case "Find Veterinarian":
    case "Appointment Requests":
      return <VeterinaryAppointmentsModule farms={farms} user={user} role={role} />;
    case "Biosecurity Assessment":
      return <BiosecurityAssessmentModule farms={farms} user={user} />;
    case "Disease Report":
      return <DiseaseReportModule farms={farms} user={user} />;
    case "Outbreak Map":
      return <GISOutbreakMapModule />;
    case "Notifications":
      return <NotificationSystemModule user={user} role={ROLE_LABELS[role]} />;
    case "Vet Inspection":
      return <VetInspectionModule user={user} />;
    case "Farm Monitoring":
      return <GovernmentFarmMonitoringModule farms={farms} user={user} />;
    case "Advisories":
      return <GovernmentAdvisoriesModule farms={farms} user={user} />;
    case "AI Assistant":
    case "AI Recommendation":
      return <AIAssistantModule user={user} onNavigate={module => {}} />;
    default:
      return null;
  }
}

const NEW_MODULES = new Set([
  "Biosecurity Assessment", "Disease Report", "Outbreak Map", "Assigned Farms", "Find Veterinarian", "Appointment Requests",
  "Notifications", "Vet Inspection", "Farm Monitoring", "Advisories", "AI Assistant", "AI Recommendation"
]);

// ── Sidebar ───────────────────────────────────────────────────────────────
function Sidebar({ role, activeModule, onNavigate, onLogout, user, sidebarOpen, setSidebarOpen }) {
  const cfg = NAV_CONFIG[role];
  const initials = user?.name?.split(" ").map(n => n[0]).join("").slice(0, 2) || "??";

  return (
    <div style={{ display: "flex", flexDirection: "column", width: sidebarOpen ? 220 : 56, flexShrink: 0, background: cfg.color, transition: "width 0.25s", height: "100vh", overflow: "hidden" }}>
      {/* Logo */}
      <button onClick={() => setSidebarOpen(o => !o)} title={sidebarOpen ? "Minimize sidebar" : "Expand sidebar"} style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 12px", marginBottom: 4, background: "none", border: "none", cursor: "pointer", textAlign: "left", width: "100%" }}>
        <img src="/picsvg_download.png" alt="BioSecure Farm" style={{ width: 32, height: 32, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />
        {sidebarOpen && (
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ color: "#fff", fontSize: 13, fontWeight: 700, fontFamily: "Poppins", margin: 0, lineHeight: 1 }}>BioSecure</p>
            <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 10, margin: "2px 0 0" }}>{cfg.title}</p>
          </div>
        )}
      </button>

      {/* Nav items */}
      <nav style={{ flex: 1, padding: "0 8px", overflowY: "auto" }}>
        {cfg.items.map(item => {
          const Icon = item.icon;
          const active = activeModule === item.label;
          return (
            <button key={item.label} onClick={() => onNavigate(item.label)} title={!sidebarOpen ? item.label : undefined}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 12, marginBottom: 2, border: "none", cursor: "pointer", textAlign: "left", background: active ? `${cfg.accent}35` : "transparent", color: active ? cfg.accent : "rgba(255,255,255,0.55)", transition: "all 0.15s" }}>
              <Icon size={15} style={{ flexShrink: 0 }} />
              {sidebarOpen && (
                <span style={{ fontSize: 12, fontWeight: active ? 700 : 400, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.label}</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* User footer */}
      <div style={{ margin: 8, padding: 10, borderRadius: 12, background: "rgba(255,255,255,0.06)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 30, height: 30, borderRadius: "50%", background: cfg.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
            {initials}
          </div>
          {sidebarOpen && (
            <>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ color: "#fff", fontSize: 11, fontWeight: 600, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.name || "User"}</p>
                <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 10, margin: 0 }}>{ROLE_LABELS[role]}</p>
              </div>
              <button onClick={onLogout} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.4)" }}>
                <LogOut size={13} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Topbar ────────────────────────────────────────────────────────────────
function Topbar({ activeModule, onLogout, language = "en" }) {
  const changeLanguage = nextLanguage => {
    window.localStorage.setItem("biosecure-language", nextLanguage);
    window.dispatchEvent(new CustomEvent("biosecure-language-change", { detail: nextLanguage }));
  };

  return (
    <div style={{ position: "sticky", top: 0, zIndex: 10, display: "flex", alignItems: "center", gap: 16, padding: "10px 24px", background: "rgba(255,255,227,0.92)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(128,128,52,0.1)" }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h1 style={{ fontFamily: "Poppins", fontSize: 16, fontWeight: 700, color: P.dark, margin: 0 }}>{activeModule}</h1>
        </div>
        <p style={{ fontSize: 11, color: P.mid, margin: 0 }}>{formatDate(new Date(), { weekday: "long", month: "long", day: "numeric" })}</p>
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 4, padding: 3, borderRadius: 8, background: P.ivoryDark }} aria-label="Language">
        <button type="button" onClick={() => changeLanguage("en")} style={{ border: "none", borderRadius: 6, padding: "5px 8px", cursor: "pointer", fontSize: 11, fontWeight: 700, background: language === "en" ? P.olive : "transparent", color: language === "en" ? P.white : P.mid }}>English</button>
        <button type="button" onClick={() => changeLanguage("ta")} style={{ border: "none", borderRadius: 6, padding: "5px 8px", cursor: "pointer", fontSize: 11, fontWeight: 700, background: language === "ta" ? P.olive : "transparent", color: language === "ta" ? P.white : P.mid }}>தமிழ்</button>
      </div>
      <button onClick={onLogout} title="Log out" style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 12px", border: "1px solid rgba(128,128,52,0.2)", borderRadius: 10, background: P.ivoryDark, color: P.mid, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
        <LogOut size={14} />
        Logout
      </button>
    </div>
  );
}

// ── Main IntegratedDashboard ──────────────────────────────────────────────
export function IntegratedDashboard({ role, user, farms, onLogout, renderLegacyPage, language = "en" }) {
  const [activeModule, setActiveModule] = useState("Dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const isNewModule = NEW_MODULES.has(activeModule);

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: P.ivory, fontFamily: "Inter" }}>
      <Sidebar
        role={role} activeModule={activeModule}
        onNavigate={setActiveModule} onLogout={onLogout}
        user={user} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen}
      />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <Topbar activeModule={activeModule} onLogout={onLogout} language={language} />
        <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
          {isNewModule
            ? renderNewModule(activeModule, farms || [], user, role)
            : renderLegacyPage(role, activeModule, setActiveModule)
          }
        </div>
      </div>
    </div>
  );
}

export default IntegratedDashboard;
