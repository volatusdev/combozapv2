import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "../lib/use-auth";
import type { RolePermissions } from "../lib/auth-context";

interface SidebarProps {
  open?: boolean;
  onClose?: () => void;
}

type Section = keyof RolePermissions;

const sdrItems: { href: string; label: string; icon: React.FC<{ size?: number; color?: string }>; section: Section }[] = [
  { href: "/sdr/atendimento", label: "Central de Atendimento", icon: ChatIcon,    section: "atendimento" },
  { href: "/sdr/funil",       label: "Kanban",                 icon: FunilIcon,   section: "funil" },
  { href: "/sdr/calls",       label: "Chamadas de Vídeo",      icon: VideoIcon,   section: "funil" },
  { href: "/sdr/contatos",    label: "Contatos",               icon: ContactsIcon, section: "contatos" },
  { href: "/sdr/tags",        label: "Tags de Identificação",  icon: TagIcon,     section: "tags" },
  { href: "/sdr/conexao",     label: "Conexão WhatsApp",       icon: QrCodeIcon,  section: "conexao" },
  { href: "/sdr/meu-plano",   label: "Meu Plano SDR",          icon: PlanIcon,    section: "plano" },
];

const agentItems: { href: string; label: string; icon: React.FC<{ size?: number; color?: string }>; section: Section }[] = [
  { href: "/sdr/agente",   label: "Agente SDR",   icon: AgentIcon,    section: "agentes" },
  { href: "/sdr/followup", label: "Follow-up IA", icon: FollowupIcon, section: "agentes" },
  { href: "/sdr/vendas",       label: "Vendas PIX",   icon: PixIcon,       section: "agentes" },
  { href: "/sdr/adquirentes", label: "Adquirentes",  icon: AcquirerIcon,  section: "agentes" },
];

export function Sidebar({ open, onClose }: SidebarProps) {
  const [location] = useLocation();
  const { user, logout, isTeamMember, can } = useAuth();
  const [equipeOpen, setEquipeOpen] = useState(() => location.startsWith("/sdr/equipe"));

  function NavItem({ href, label, icon: Icon }: { href: string; label: string; icon: React.FC<{ size?: number; color?: string }> }) {
    const active = location === href || (location === "/" && href === "/sdr/atendimento");
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
          background: active ? "#f0fdf4" : "transparent",
          marginBottom: 2, transition: "all 0.1s",
        }}
      >
        <Icon size={16} color={active ? "#16a34a" : "#888"} />
        {label}
      </Link>
    );
  }

  function SubNavItem({ href, label, icon: Icon }: { href: string; label: string; icon: React.FC<{ size?: number; color?: string }> }) {
    const active = location.startsWith(href);
    return (
      <Link
        href={href}
        onClick={onClose}
        style={{
          display: "flex", alignItems: "center", gap: 9,
          padding: "8px 12px 8px 28px", borderRadius: 8,
          textDecoration: "none", fontSize: 13,
          fontWeight: active ? 700 : 500,
          color: active ? "#111" : "#666",
          background: active ? "#f0fdf4" : "transparent",
          marginBottom: 2, transition: "all 0.1s",
        }}
      >
        <Icon size={14} color={active ? "#16a34a" : "#aaa"} />
        {label}
      </Link>
    );
  }

  const visibleSdrItems = isTeamMember
    ? sdrItems.filter(i => can(i.section))
    : sdrItems;

  const visibleAgentItems = isTeamMember
    ? agentItems.filter(i => can(i.section))
    : agentItems;

  const showEquipe = !isTeamMember;

  return (
    <aside className={`sidebar${open ? " open" : ""}`}>
      <div style={{ padding: "16px 20px 14px", borderBottom: "1px solid #f0f0f0" }}>
        <img src="/combozap-logo.png" alt="ComboZap" style={{ height: 36, display: "block" }} />
        <div style={{ fontSize: 11, color: "#999", marginTop: 4 }}>Central SDR WhatsApp</div>
      </div>

      <nav style={{ flex: 1, padding: "12px 10px", overflowY: "auto" }}>
        <SectionLabel>Visão Geral</SectionLabel>
        <NavItem href="/sdr/dashboard" label="Dashboard" icon={DashboardIcon} />

        {visibleSdrItems.length > 0 && (
          <>
            <SectionLabel>Módulos SDR</SectionLabel>
            {visibleSdrItems.map(item => <NavItem key={item.href} {...item} />)}
          </>
        )}

        {visibleAgentItems.length > 0 && (
          <>
            <SectionLabel>Agente SDR</SectionLabel>
            {visibleAgentItems.map(item => <NavItem key={item.href} {...item} />)}
          </>
        )}

        <SectionLabel>Tutoriais</SectionLabel>
        <NavItem href="/sdr/tutoriais" label="Video Aulas" icon={VideoIcon} />

        {showEquipe && (
          <>
            <SectionLabel>Gestão</SectionLabel>

            <button
              onClick={() => setEquipeOpen(o => !o)}
              style={{
                display: "flex", alignItems: "center", gap: 10, width: "100%",
                padding: "9px 12px", borderRadius: 8, border: "none",
                fontSize: 13.5, fontWeight: 500, color: "#555",
                background: equipeOpen ? "#fafafa" : "transparent",
                cursor: "pointer", marginBottom: 2, textAlign: "left",
                transition: "all 0.1s",
              }}
            >
              <TeamIcon size={16} color="#888" />
              <span style={{ flex: 1 }}>Equipe</span>
              <ChevronIcon open={equipeOpen} />
            </button>

            {equipeOpen && (
              <div style={{ marginBottom: 2 }}>
                <SubNavItem href="/sdr/equipe/cargos" label="Cargos" icon={BadgeIcon} />
                <SubNavItem href="/sdr/equipe/time" label="Time" icon={UsersIcon} />
              </div>
            )}
          </>
        )}
      </nav>

      <div style={{ padding: "14px 16px", borderTop: "1px solid #f0f0f0" }}>
        {user && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#111", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {user.teamMemberName ?? user.name}
            </div>
            <div style={{ fontSize: 11.5, color: "#999", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {user.teamMemberEmail ?? user.email}
            </div>
            {isTeamMember && (
              <div style={{ fontSize: 10.5, color: "#22c55e", fontWeight: 600, marginTop: 2 }}>
                Membro da equipe
              </div>
            )}
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10.5, fontWeight: 700, color: "#bbb", textTransform: "uppercase", letterSpacing: 0.8, padding: "16px 10px 6px" }}>
      {children}
    </div>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function DashboardIcon({ size = 16, color = "#888" }: { size?: number; color?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>;
}
function ChatIcon({ size = 16, color = "#888" }: { size?: number; color?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>;
}
function ContactsIcon({ size = 16, color = "#888" }: { size?: number; color?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
}
function TagIcon({ size = 16, color = "#888" }: { size?: number; color?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>;
}
function QrCodeIcon({ size = 16, color = "#888" }: { size?: number; color?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="3" height="3"/></svg>;
}
function PlanIcon({ size = 16, color = "#888" }: { size?: number; color?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>;
}
function AgentIcon({ size = 16, color = "#888" }: { size?: number; color?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M6 20v-2a6 6 0 0 1 12 0v2"/><circle cx="18" cy="8" r="3"/><path d="M21 20v-1a3 3 0 0 0-2.6-2.97"/></svg>;
}
function TeamIcon({ size = 16, color = "#888" }: { size?: number; color?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
}
function BadgeIcon({ size = 14, color = "#aaa" }: { size?: number; color?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/></svg>;
}
function UsersIcon({ size = 14, color = "#aaa" }: { size?: number; color?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
}
function VideoIcon({ size = 16, color = "#888" }: { size?: number; color?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>;
}
function FollowupIcon({ size = 16, color = "#888" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      <line x1="9" y1="10" x2="15" y2="10"/>
      <line x1="9" y1="14" x2="12" y2="14"/>
    </svg>
  );
}
function PixIcon({ size = 16, color = "#888" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/><path d="M6 15h.01M10 15h4"/>
    </svg>
  );
}
function FunilIcon({ size = 16, color = "#888" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="4" height="18" rx="1"/>
      <rect x="10" y="3" width="4" height="13" rx="1"/>
      <rect x="17" y="3" width="4" height="8" rx="1"/>
    </svg>
  );
}
function AcquirerIcon({ size = 16, color = "#888" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2"/>
      <path d="M2 10h20"/>
      <circle cx="7" cy="15" r="1" fill={color}/>
      <path d="M11 15h6"/>
    </svg>
  );
}
