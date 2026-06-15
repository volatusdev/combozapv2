import { Link, useLocation } from "wouter";
import { useAuth } from "../lib/use-auth";

interface AdminSidebarProps {
  open?: boolean;
  onClose?: () => void;
}

export function AdminSidebar({ open, onClose }: AdminSidebarProps) {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  function NavItem({ href, label, icon: Icon }: { href: string; label: string; icon: React.FC<{ size?: number; color?: string }> }) {
    const active = location === href || location.startsWith(href + "/");
    return (
      <Link
        href={href}
        onClick={onClose}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "9px 12px", borderRadius: 8,
          textDecoration: "none", fontSize: 13.5,
          fontWeight: active ? 700 : 500,
          color: active ? "#111" : "#555",
          background: active ? "#f1f5f9" : "transparent",
          marginBottom: 2, transition: "all 0.1s",
          borderLeft: active ? "2px solid #111" : "2px solid transparent",
        }}
      >
        <Icon size={16} color={active ? "#111" : "#888"} />
        {label}
      </Link>
    );
  }

  return (
    <aside className={`sidebar${open ? " open" : ""}`}>
      <div style={{ padding: "16px 20px 14px", borderBottom: "1px solid #f0f0f0" }}>
        <img src="/combozap-logo.png" alt="ComboZap" style={{ height: 36, display: "block" }} />
        <div style={{ fontSize: 10.5, fontWeight: 700, color: "#999", marginTop: 4, textTransform: "uppercase", letterSpacing: 1 }}>
          Painel Administrativo
        </div>
      </div>

      <nav style={{ flex: 1, padding: "12px 10px", overflowY: "auto" }}>
        <NavItem href="/admin/dashboard" label="Dashboard Master" icon={DashboardIcon} />
        <NavItem href="/admin/tutoriais" label="Video Aulas" icon={VideoIcon} />
      </nav>

      <div style={{ padding: "14px 16px", borderTop: "1px solid #f0f0f0" }}>
        {user && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#111" }}>{user.name}</div>
            <div style={{ fontSize: 11, color: "#999" }}>{user.email}</div>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: "#555", marginTop: 2, textTransform: "uppercase", letterSpacing: 0.6 }}>
              Administrador
            </div>
          </div>
        )}
        <button
          onClick={logout}
          style={{
            width: "100%", padding: "8px 12px", borderRadius: 8,
            border: "1px solid #e5e5e5", background: "#fff",
            fontSize: 13, fontWeight: 600, color: "#666", cursor: "pointer", textAlign: "left",
          }}
        >
          Sair
        </button>
      </div>
    </aside>
  );
}

function DashboardIcon({ size = 16, color = "#888" }: { size?: number; color?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>;
}
function VideoIcon({ size = 16, color = "#888" }: { size?: number; color?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>;
}
