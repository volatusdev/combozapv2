import { useState } from "react";
import { useAuth } from "../lib/use-auth";

const BLACK  = "#0d0d0d";
const GREEN  = "#22c55e";
const BORDER = "#e5e7eb";
const GRAY   = "#6b7280";

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  );
}

type Tab = "login" | "register";

export function AppLogin({ defaultTab = "login" }: { defaultTab?: Tab }) {
  const { login, loginWithGoogle, register } = useAuth();

  const [tab, setTab]         = useState<Tab>(defaultTab);
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);

  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");

  const [rName, setRName]         = useState("");
  const [rEmail, setREmail]       = useState("");
  const [rWhatsapp, setRWhatsapp] = useState("");
  const [rPassword, setRPassword] = useState("");
  const [rConfirm, setRConfirm]   = useState("");
  const [rTerms, setRTerms]       = useState(false);

  const INPUT: React.CSSProperties = {
    width: "100%", padding: "11px 14px", borderRadius: 8,
    border: `1px solid ${BORDER}`, fontSize: 14, outline: "none",
    background: "#fff", color: BLACK, boxSizing: "border-box",
  };
  const LABEL: React.CSSProperties = {
    fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 5,
  };
  const BTN_PRIMARY: React.CSSProperties = {
    background: GREEN, color: "#fff", border: "none", borderRadius: 8,
    fontWeight: 700, cursor: "pointer", width: "100%", fontSize: 14, padding: "13px",
  };
  const BTN_GOOGLE: React.CSSProperties = {
    display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
    width: "100%", padding: "11px", borderRadius: 8,
    border: `1.5px solid ${BORDER}`, background: "#fff",
    fontSize: 14, fontWeight: 600, color: BLACK,
    cursor: "pointer", boxSizing: "border-box",
  };
  const DIVIDER = (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "4px 0" }}>
      <div style={{ flex: 1, height: 1, background: BORDER }} />
      <span style={{ fontSize: 12, color: "#9ca3af" }}>ou</span>
      <div style={{ flex: 1, height: 1, background: BORDER }} />
    </div>
  );

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try { await login(email, password); }
    catch (err: any) { setError(err.message || "E-mail ou senha incorretos"); }
    finally { setLoading(false); }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try { await register(rName, rEmail, rWhatsapp, rPassword, rConfirm, rTerms); }
    catch (err: any) { setError(err.message || "Erro ao criar conta"); }
    finally { setLoading(false); }
  };

  const handleGoogle = async () => {
    if (loading) return;
    setError(""); setLoading(true);
    try { await loginWithGoogle(); }
    catch (err: any) { setError(err.message || "Erro ao entrar com Google"); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f7f7f5" }}>

      {/* ── Lado esquerdo — imagem Paulista ────────────────────────────── */}
      <div style={{
        flex: "0 0 45%", position: "relative", overflow: "hidden",
        display: "none",
      }}
        className="login-panel-left"
      >
        <img
          src="/paulista.png"
          alt="Avenida Paulista"
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(135deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.2) 60%, rgba(22,163,74,0.15) 100%)",
        }} />
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          padding: "40px 36px",
        }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", lineHeight: 1.3, marginBottom: 8 }}>
            Central de Atendimento<br />WhatsApp Profissional
          </div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.75)", lineHeight: 1.6 }}>
            Gerencie contatos, dispare mensagens e<br />acompanhe atendimentos em tempo real.
          </div>
        </div>
      </div>

      {/* ── Lado direito — formulário ───────────────────────────────────── */}
      <div style={{
        flex: 1, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        padding: "32px 24px", overflowY: "auto",
        minHeight: "100vh",
      }}>
        {/* Logo (visível só quando painel esquerdo está oculto no mobile) */}
        <div style={{ marginBottom: 28, textAlign: "center" }} className="login-logo-mobile">
          <img src="/combozap-logo.png" alt="ComboZap" style={{ height: 34 }} />
          <div style={{ fontSize: 13, color: GRAY, marginTop: 6 }}>Central de Atendimento WhatsApp</div>
        </div>

        <div style={{
          background: "#fff", borderRadius: 16, padding: "36px 40px",
          width: "100%", maxWidth: 420,
          border: `1px solid ${BORDER}`,
          boxShadow: "0 4px 32px rgba(0,0,0,0.08)",
        }}>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 28, background: "#f3f4f6", borderRadius: 10, padding: 4 }}>
            {(["login", "register"] as Tab[]).map(t => (
              <button key={t} type="button" onClick={() => { setTab(t); setError(""); }} style={{
                flex: 1, padding: "9px", borderRadius: 8, border: "none", cursor: "pointer",
                fontWeight: 600, fontSize: 13,
                background: tab === t ? "#fff" : "transparent",
                color: tab === t ? BLACK : GRAY,
                boxShadow: tab === t ? "0 1px 4px rgba(0,0,0,0.1)" : "none",
                transition: "all 0.15s",
              }}>
                {t === "login" ? "Entrar" : "Criar conta"}
              </button>
            ))}
          </div>

          {error && (
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#dc2626", marginBottom: 16 }}>
              {error}
            </div>
          )}

          {/* ── Login ── */}
          {tab === "login" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Google primeiro */}
              <button type="button" onClick={handleGoogle} disabled={loading} style={{ ...BTN_GOOGLE, opacity: loading ? 0.7 : 1 }}>
                <GoogleIcon /> Continuar com Google
              </button>
              {DIVIDER}
              <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <label style={LABEL}>E-mail</label>
                  <input style={INPUT} type="email" required placeholder="voce@email.com" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
                </div>
                <div>
                  <label style={LABEL}>Senha</label>
                  <input style={INPUT} type="password" required placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
                </div>
                <button type="submit" disabled={loading} style={{ ...BTN_PRIMARY, opacity: loading ? 0.7 : 1 }}>
                  {loading ? "Entrando..." : "Entrar"}
                </button>
              </form>
            </div>
          )}

          {/* ── Registro ── */}
          {tab === "register" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Google primeiro */}
              <button type="button" onClick={handleGoogle} disabled={loading} style={{ ...BTN_GOOGLE, opacity: loading ? 0.7 : 1 }}>
                <GoogleIcon /> Registrar com Google
              </button>
              {DIVIDER}
              <form onSubmit={handleRegister} style={{ display: "flex", flexDirection: "column", gap: 13 }}>
                <div>
                  <label style={LABEL}>Nome completo</label>
                  <input style={INPUT} type="text" required placeholder="Seu nome" value={rName} onChange={e => setRName(e.target.value)} autoComplete="name" />
                </div>
                <div>
                  <label style={LABEL}>E-mail</label>
                  <input style={INPUT} type="email" required placeholder="voce@email.com" value={rEmail} onChange={e => setREmail(e.target.value)} autoComplete="email" />
                </div>
                <div>
                  <label style={LABEL}>WhatsApp</label>
                  <input style={INPUT} type="tel" placeholder="(11) 99999-9999" value={rWhatsapp} onChange={e => setRWhatsapp(e.target.value)} autoComplete="tel" />
                </div>
                <div>
                  <label style={LABEL}>Senha</label>
                  <input style={INPUT} type="password" required placeholder="Mínimo 8 caracteres" value={rPassword} onChange={e => setRPassword(e.target.value)} autoComplete="new-password" />
                </div>
                <div>
                  <label style={LABEL}>Confirmar senha</label>
                  <input style={INPUT} type="password" required placeholder="Repita a senha" value={rConfirm} onChange={e => setRConfirm(e.target.value)} autoComplete="new-password" />
                </div>
                <label style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 13, color: GRAY, cursor: "pointer" }}>
                  <input type="checkbox" checked={rTerms} onChange={e => setRTerms(e.target.checked)} style={{ marginTop: 2, flexShrink: 0, accentColor: GREEN }} />
                  <span>Aceito os <span style={{ color: GREEN, fontWeight: 600 }}>termos de uso</span> e a política de privacidade</span>
                </label>
                <button type="submit" disabled={loading || !rTerms} style={{ ...BTN_PRIMARY, opacity: (loading || !rTerms) ? 0.6 : 1, cursor: (loading || !rTerms) ? "not-allowed" : "pointer" }}>
                  {loading ? "Criando conta..." : "Criar conta"}
                </button>
              </form>
            </div>
          )}
        </div>

        <div style={{ marginTop: 20, fontSize: 12, color: "#9ca3af", textAlign: "center" }}>
          <a href="https://combozap.com" style={{ color: GRAY, textDecoration: "none" }}>← Voltar ao site</a>
          <span style={{ margin: "0 10px", color: "#d1d5db" }}>·</span>
          {tab === "login"
            ? <a href="/register" style={{ color: GRAY, textDecoration: "none" }}>Criar conta</a>
            : <a href="/login"    style={{ color: GRAY, textDecoration: "none" }}>Já tenho conta</a>
          }
        </div>
      </div>

      {/* CSS responsivo */}
      <style>{`
        @media (min-width: 768px) {
          .login-panel-left { display: flex !important; }
          .login-logo-mobile { display: none !important; }
        }
      `}</style>
    </div>
  );
}
