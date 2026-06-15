import { useState } from "react";
import { useAuth } from "../lib/use-auth";
import { useLocation } from "wouter";

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

type Modal = null | "login" | "register";

const GREEN = "#22c55e";
const GREEN_DARK = "#16a34a";
const BLACK = "#0d0d0d";
const GRAY = "#6b7280";
const BORDER = "#e5e7eb";
const OFF_WHITE = "#f7f7f5";
const WHITE = "#ffffff";

function IconChat() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
function IconUsers() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
function IconTag() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  );
}
function IconSend() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}
function IconPhone() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="2" width="14" height="20" rx="2" ry="2" /><line x1="12" y1="18" x2="12.01" y2="18" />
    </svg>
  );
}
function IconShield() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}
function IconCode() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
    </svg>
  );
}
function IconCheck() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

const APP_URL = "https://app.combozap.com";

function isLandingDomain(): boolean {
  const h = window.location.hostname;
  return h === "combozap.com" || h === "www.combozap.com";
}

export function Landing() {
  const { login, loginWithGoogle, register } = useAuth();
  const [, setLocation] = useLocation();
  const [modal, setModal] = useState<Modal>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [rName, setRName] = useState("");
  const [rEmail, setREmail] = useState("");
  const [rWhatsapp, setRWhatsapp] = useState("");
  const [rPassword, setRPassword] = useState("");
  const [rConfirm, setRConfirm] = useState("");
  const [rTerms, setRTerms] = useState(false);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function openModal(m: Modal) {
    if (isLandingDomain()) {
      window.location.href = m === "register" ? `${APP_URL}/register` : `${APP_URL}/login`;
      return;
    }
    setError(""); setModal(m);
  }
  function closeModal() { setModal(null); setError(""); }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try { await login(email, password); }
    catch (err: any) { setError(err.message || "Erro ao entrar"); }
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
    setError(""); setLoading(true);
    try { await loginWithGoogle(); }
    catch (err: any) { setError(err.message || "Erro ao entrar com Google"); }
    finally { setLoading(false); }
  };

  const INPUT: React.CSSProperties = {
    width: "100%", padding: "11px 14px", borderRadius: 8,
    border: `1px solid ${BORDER}`, fontSize: 14, outline: "none",
    color: BLACK, boxSizing: "border-box", background: WHITE,
    transition: "border-color 0.15s",
  };
  const BTN_PRIMARY: React.CSSProperties = {
    padding: "13px 28px", borderRadius: 8, border: "none",
    background: GREEN, color: WHITE, fontSize: 15, fontWeight: 700,
    cursor: "pointer", transition: "background 0.15s", whiteSpace: "nowrap",
  };
  const BTN_OUTLINE: React.CSSProperties = {
    padding: "12px 28px", borderRadius: 8, border: `1.5px solid ${BORDER}`,
    background: WHITE, color: BLACK, fontSize: 15, fontWeight: 600,
    cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap",
  };

  const features = [
    { icon: <IconChat />, title: "Central de Atendimento", desc: "Responda clientes pelo WhatsApp direto do navegador. Interface em tempo real, sem precisar do celular." },
    { icon: <IconUsers />, title: "Gestão de Contatos", desc: "Todos os contatos do seu WhatsApp sincronizados e organizados. Busca instantânea por nome ou número." },
    { icon: <IconTag />, title: "Tags de Identificação", desc: "Crie etiquetas personalizadas e segmente seus contatos por interesse, estágio de venda ou qualquer critério." },
    { icon: <IconSend />, title: "Disparo Inteligente", desc: "Envie mensagens em massa para grupos de contatos. Disparo com delay natural para evitar bloqueios." },
    { icon: <IconPhone />, title: "Multi-Slots WhatsApp", desc: "Conecte até 5 números diferentes na mesma conta. Cada slot isolado com QR Code independente." },
    { icon: <IconShield />, title: "100% Seguro e Privado", desc: "Seus dados ficam no seu servidor. Sem compartilhamento com terceiros, sem dependência de nuvem externa." },
  ];

  const plans = [
    {
      name: "Starter", price: "R$ 147", cents: ",90", period: "/mês", popular: true,
      desc: "Tudo que você precisa para vender pelo WhatsApp com IA.",
      items: ["1 número WhatsApp", "Agentes de IA ilimitados", "Inteligência Artificial incluída", "Central de atendimento", "Gestão de contatos", "Tags ilimitadas", "Disparo em massa", "Suporte incluso"],
    },
  ];

  return (
    <div style={{ minHeight: "100vh", background: WHITE, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", color: BLACK }}>

      {/* ── Navbar ── */}
      <nav className="lp-nav" style={{
        position: "sticky", top: 0, zIndex: 50,
        background: "rgba(255,255,255,0.97)", backdropFilter: "blur(10px)",
        borderBottom: `1px solid ${BORDER}`,
        padding: "0 40px", height: 62,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <img src="/combozap-logo.png" alt="ComboZap" style={{ height: 44 }} />
        <div className="lp-nav-actions" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            className="lp-docs-btn"
            style={{ background: "none", border: "none", fontSize: 14, color: GRAY, cursor: "pointer", padding: "8px 14px", fontWeight: 500 }}
            onClick={() => setLocation("/docs")}
          >
            Documentação
          </button>
          <button style={BTN_OUTLINE} onClick={() => openModal("login")}>Entrar</button>
          <button style={{ ...BTN_PRIMARY, padding: "10px 22px", fontSize: 14 }} onClick={() => openModal("register")}>
            Criar conta
          </button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="lp-hero" style={{ padding: "100px 40px 88px", textAlign: "center", background: WHITE }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <h1 style={{
            fontSize: "clamp(34px, 6vw, 64px)", fontWeight: 900, color: BLACK,
            lineHeight: 1.06, marginBottom: 24, letterSpacing: -2,
          }}>
            Atenda, organize e<br />
            <span style={{ color: GREEN }}>venda mais</span> pelo WhatsApp
          </h1>
          <p style={{
            fontSize: "clamp(15px, 2.2vw, 18px)", color: GRAY, lineHeight: 1.7,
            marginBottom: 44, maxWidth: 560, margin: "0 auto 44px",
          }}>
            Central de atendimento completa com gestão de contatos, tags,
            disparo em massa e conexão multi-slot, tudo via WhatsApp, sem complicação.
          </p>
          <div className="lp-hero-btns" style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <button
              style={{ ...BTN_PRIMARY, fontSize: 15, padding: "14px 36px" }}
              onClick={() => openModal("register")}
            >
              Começar grátis
            </button>
            <button style={{ ...BTN_OUTLINE, fontSize: 15, padding: "14px 36px" }} onClick={() => openModal("login")}>
              Já tenho conta
            </button>
          </div>
          <p style={{ marginTop: 20, fontSize: 12, color: "#b0b8c1", letterSpacing: 0.2 }}>
            Sem cartão de crédito &nbsp;·&nbsp; Primeiro slot gratuito
          </p>
        </div>
      </section>

      {/* ── Agente SDR ── */}
      <section className="lp-sdr" style={{ background: OFF_WHITE, padding: "96px 40px", borderTop: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}` }}>
        <div className="lp-sdr-grid" style={{ maxWidth: 1080, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80, alignItems: "center" }}>

          {/* Texto */}
          <div>
            <div style={{ display: "inline-block", fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: BLACK, background: "#e8e8e6", padding: "5px 14px", borderRadius: 20, marginBottom: 28 }}>
              Agente SDR
            </div>
            <h2 style={{ fontSize: "clamp(26px, 3.5vw, 44px)", fontWeight: 900, color: BLACK, lineHeight: 1.1, letterSpacing: -1.5, marginBottom: 20 }}>
              Ative uma vez.<br />Ele trabalha<br />enquanto você dorme.
            </h2>
            <p style={{ fontSize: 16, color: GRAY, lineHeight: 1.75, marginBottom: 36, maxWidth: 440 }}>
              Configure o Agente SDR com um prompt no seu estilo. Ele atende, qualifica, pergunta, envia links e fecha vendas pelo WhatsApp — 24 horas por dia, sem parecer robô, sem parecer IA.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 44 }}>
              {[
                ["Delay natural de resposta", "Digita por alguns segundos antes de responder. Ninguém vai saber que é automatizado."],
                ["Qualifica e converte", "Faz as perguntas certas, entende a necessidade e conduz o lead até a venda."],
                ["Disponível 24h, sem pausas", "Feriado, madrugada, fim de semana. Ele sempre responde, você nunca perde um lead."],
              ].map(([title, desc]) => (
                <div key={title} style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: BLACK, flexShrink: 0, marginTop: 8 }} />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: BLACK, marginBottom: 3 }}>{title}</div>
                    <div style={{ fontSize: 13.5, color: GRAY, lineHeight: 1.6 }}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>

            <button
              style={{ ...BTN_PRIMARY, fontSize: 14, padding: "13px 32px" }}
              onClick={() => openModal("register")}
            >
              Ativar meu agente
            </button>
          </div>

          {/* Preview conversa */}
          <div style={{ position: "relative" }}>
            <div style={{
              background: WHITE, borderRadius: 20, border: `1px solid ${BORDER}`,
              overflow: "hidden", boxShadow: "0 2px 40px rgba(0,0,0,0.06)",
              fontFamily: "system-ui, sans-serif",
            }}>
              <div style={{ padding: "14px 20px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 12, background: WHITE }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#e8e8e6", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={GRAY} strokeWidth="1.8"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                </div>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: BLACK }}>Agente SDR</div>
                  <div style={{ fontSize: 11.5, color: "#22c55e", fontWeight: 600 }}>online agora</div>
                </div>
              </div>

              <div style={{ padding: "24px 20px", display: "flex", flexDirection: "column", gap: 14, background: "#fafafa", minHeight: 300 }}>
                <ChatBubble align="left" text="Oi, vi o anuncio de vocês. Quero saber o preço do plano." time="09:14" />
                <TypingBubble />
                <ChatBubble align="right" text="Olá, que bom ter você aqui. Antes de te passar os valores, me conta — você atende clientes por WhatsApp hoje?" time="09:14" />
                <ChatBubble align="left" text="Sim, tenho uma loja e respondo tudo no celular" time="09:15" />
                <ChatBubble align="right" text="Entendido. Quantos atendimentos você faz por dia, mais ou menos?" time="09:15" />
                <ChatBubble align="left" text="Umas 40, 50 conversas" time="09:16" />
                <ChatBubble align="right" text="Perfeito. O plano Intermediário é o ideal pra você — 3 números conectados, disparo em massa e agente SDR ativo." time="09:16" />
              </div>

              <div style={{ padding: "12px 20px", borderTop: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 12, background: WHITE }}>
                <div style={{ flex: 1, height: 36, background: "#f3f4f6", borderRadius: 18, display: "flex", alignItems: "center", padding: "0 14px" }}>
                  <span style={{ fontSize: 13, color: "#c0c4cc" }}>Mensagem</span>
                </div>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: BLACK, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={WHITE} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                </div>
              </div>
            </div>

            {/* Badge flutuante */}
            <div className="lp-sdr-badge" style={{
              position: "absolute", bottom: -18, left: -18,
              background: BLACK, color: WHITE,
              borderRadius: 14, padding: "10px 18px",
              fontSize: 12.5, fontWeight: 700,
              boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: GREEN }} />
              Respondendo em 12s · sem humano
            </div>
          </div>

        </div>
      </section>

      {/* ── Divider ── */}
      <div className="lp-divider" style={{ height: 1, background: BORDER, margin: "0 40px" }} />

      {/* ── Features ── */}
      <section className="lp-features" style={{ padding: "88px 40px", background: WHITE }}>
        <div style={{ maxWidth: 1080, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <h2 style={{ fontSize: "clamp(22px, 3.5vw, 40px)", fontWeight: 800, color: BLACK, letterSpacing: -1, marginBottom: 14 }}>
              Tudo que você precisa para atender bem
            </h2>
            <p style={{ fontSize: 15, color: GRAY, maxWidth: 480, margin: "0 auto", lineHeight: 1.65 }}>
              Uma plataforma completa que centraliza todo o seu atendimento via WhatsApp.
            </p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(270px, 1fr))", gap: 18 }}>
            {features.map((f, i) => (
              <div key={i} style={{
                border: `1px solid ${BORDER}`, borderRadius: 14, padding: "28px 26px",
                background: WHITE, transition: "border-color 0.2s, box-shadow 0.2s",
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "#d1fae5"; e.currentTarget.style.boxShadow = "0 4px 20px rgba(0,0,0,0.06)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.boxShadow = "none"; }}
              >
                <div style={{ width: 42, height: 42, background: "#f0fdf4", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18 }}>
                  {f.icon}
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: BLACK, marginBottom: 8 }}>{f.title}</div>
                <div style={{ fontSize: 13.5, color: GRAY, lineHeight: 1.65 }}>{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section className="lp-pricing" style={{ padding: "0 40px 88px", background: WHITE }}>
        <div style={{ maxWidth: 1060, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 52 }}>
            <h2 style={{ fontSize: "clamp(22px, 3.5vw, 40px)", fontWeight: 800, color: BLACK, letterSpacing: -1, marginBottom: 14 }}>
              Planos simples e transparentes
            </h2>
            <p style={{ fontSize: 15, color: GRAY }}>Escolha o plano ideal para o tamanho da sua operação.</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20 }}>
            {plans.map((p, i) => (
              <div key={i} style={{
                borderRadius: 16, padding: "32px 28px",
                border: p.popular ? `1.5px solid ${GREEN}` : `1px solid ${BORDER}`,
                background: p.popular ? "#f9fefb" : WHITE,
                position: "relative", display: "flex", flexDirection: "column",
              }}>
                {p.popular && (
                  <div style={{
                    position: "absolute", top: -13, left: "50%", transform: "translateX(-50%)",
                    background: GREEN, color: WHITE, fontSize: 11, fontWeight: 700,
                    padding: "3px 14px", borderRadius: 99, whiteSpace: "nowrap", letterSpacing: 0.3,
                  }}>
                    Mais popular
                  </div>
                )}
                <div style={{ fontSize: 17, fontWeight: 800, color: BLACK, marginBottom: 4 }}>{p.name}</div>
                <div style={{ fontSize: 13, color: GRAY, marginBottom: 24 }}>{p.desc}</div>
                <div style={{ marginBottom: 28 }}>
                  <span style={{ fontSize: 36, fontWeight: 900, color: BLACK, letterSpacing: -1.5 }}>{p.price}</span>
                  <span style={{ fontSize: 18, fontWeight: 700, color: BLACK }}>{p.cents}</span>
                  <span style={{ fontSize: 13, color: GRAY }}>{p.period}</span>
                </div>
                <div style={{ marginBottom: 28, display: "flex", flexDirection: "column", gap: 11, flex: 1 }}>
                  {p.items.map((item, j) => (
                    <div key={j} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13.5, color: "#374151" }}>
                      <span style={{ flexShrink: 0 }}><IconCheck /></span>
                      {item}
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => openModal("register")}
                  style={{
                    padding: "12px", borderRadius: 8, border: "none", cursor: "pointer",
                    background: p.popular ? GREEN : BLACK,
                    color: WHITE, fontSize: 14, fontWeight: 700,
                    transition: "opacity 0.15s",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = "0.85")}
                  onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
                >
                  Começar com {p.name}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── API / Integrações banner ── */}
      <section className="lp-api" style={{ padding: "0 40px 88px" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto" }}>
          <div className="lp-api-inner" style={{
            border: `1px solid ${BORDER}`, borderRadius: 18, padding: "48px 52px",
            background: OFF_WHITE, display: "flex", alignItems: "center", gap: 40, flexWrap: "wrap",
          }}>
            <div style={{ flex: 1, minWidth: 260 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                <div style={{ width: 40, height: 40, background: "#f0fdf4", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <IconCode />
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: GREEN_DARK, letterSpacing: 1.2, textTransform: "uppercase" }}>API & Webhooks</span>
              </div>
              <h3 style={{ fontSize: "clamp(20px, 3vw, 30px)", fontWeight: 800, color: BLACK, letterSpacing: -0.8, marginBottom: 12, lineHeight: 1.2 }}>
                Conecte seu agente ou site externo
              </h3>
              <p style={{ fontSize: 14.5, color: GRAY, lineHeight: 1.7 }}>
                Exponha webhooks para receber mensagens em tempo real e use nossa API REST para enviar mensagens, gerenciar contatos e automatizar fluxos diretamente do seu sistema.
              </p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 200 }}>
              <button
                onClick={() => setLocation("/docs")}
                style={{ ...BTN_PRIMARY, fontSize: 14, padding: "12px 28px", textAlign: "center" }}
              >
                Ver documentação
              </button>
              <div style={{ fontSize: 12, color: "#9ca3af", textAlign: "center" }}>
                REST · Webhooks · Exemplos prontos
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="lp-cta" style={{ padding: "80px 40px", background: OFF_WHITE, borderTop: `1px solid ${BORDER}`, textAlign: "center" }}>
        <div style={{ maxWidth: 580, margin: "0 auto" }}>
          <h2 style={{ fontSize: "clamp(22px, 3.5vw, 38px)", fontWeight: 800, color: BLACK, marginBottom: 16, letterSpacing: -0.8 }}>
            Pronto para começar?
          </h2>
          <p style={{ fontSize: 15, color: GRAY, marginBottom: 36, lineHeight: 1.65 }}>
            Crie sua conta agora e comece a atender pelo WhatsApp com o primeiro slot gratuito.
          </p>
          <button
            style={{ ...BTN_PRIMARY, fontSize: 15, padding: "14px 40px" }}
            onClick={() => openModal("register")}
          >
            Criar conta grátis
          </button>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="lp-footer" style={{ padding: "24px 40px", background: WHITE, borderTop: `1px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <img src="/combozap-logo.png" alt="ComboZap" style={{ height: 36 }} />
        <div style={{ fontSize: 12, color: "#9ca3af" }}>
          © 2025 ComboZap SDR — Central de Atendimento WhatsApp
        </div>
        <button
          onClick={() => setLocation("/docs")}
          style={{ background: "none", border: "none", fontSize: 12, color: GRAY, cursor: "pointer", textDecoration: "underline" }}
        >
          Documentação API
        </button>
      </footer>

      {/* ── Modal overlay ── */}
      {modal && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.52)",
            zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
          }}
          onClick={(e) => e.target === e.currentTarget && closeModal()}
        >
          <div className="lp-modal-box" style={{
            background: WHITE, borderRadius: 18, width: "100%", maxWidth: 840,
            position: "relative", boxShadow: "0 24px 72px rgba(0,0,0,0.22)",
            maxHeight: "94vh", overflow: "hidden", display: "flex",
          }}>
            {/* Left: imagem */}
            <div className="lp-modal-img" style={{ width: "44%", flexShrink: 0, position: "relative", overflow: "hidden" }}>
              <img
                src="/paulista-office.png"
                alt="Vista da Avenida Paulista"
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
              <div style={{
                position: "absolute", inset: 0,
                background: "linear-gradient(to top, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 55%)",
                pointerEvents: "none",
              }} />
              <div style={{ position: "absolute", bottom: 24, left: 0, right: 0, textAlign: "center", padding: "0 20px" }}>
                <img src="/combozap-logo.png" alt="ComboZap" style={{ height: 26, filter: "brightness(0) invert(1)" }} />
                <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.72)", marginTop: 4, letterSpacing: 0.2 }}>
                  Central WhatsApp Profissional
                </div>
              </div>
            </div>

            {/* Right: formulário */}
            <div className="lp-modal-form" style={{ flex: 1, padding: "36px 32px", overflowY: "auto", position: "relative" }}>
              <button
                onClick={closeModal}
                style={{ position: "absolute", top: 16, right: 16, background: "none", border: "none", cursor: "pointer", fontSize: 22, color: "#aaa", lineHeight: 1 }}
              >
                ×
              </button>
              <div style={{ textAlign: "center", marginBottom: 28 }}>
                <div style={{ fontSize: 19, fontWeight: 800, marginBottom: 6, color: BLACK }}>
                  {modal === "login" ? "Entrar na sua conta" : "Criar nova conta"}
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 400, color: GRAY }}>
                  {modal === "login" ? "Bem-vindo de volta" : "Comece grátis, sem cartão"}
                </div>
              </div>

              {error && (
                <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "11px 14px", marginBottom: 18, fontSize: 13, color: "#b91c1c" }}>
                  {error}
                </div>
              )}

              {modal === "login" && (
                <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 5 }}>E-mail</label>
                    <input style={INPUT} type="email" required placeholder="voce@email.com" value={email} onChange={e => setEmail(e.target.value)} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 5 }}>Senha</label>
                    <input style={INPUT} type="password" required placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} />
                  </div>
                  <button type="submit" disabled={loading}
                    style={{ ...BTN_PRIMARY, width: "100%", fontSize: 14, padding: "13px", opacity: loading ? 0.7 : 1, cursor: loading ? "not-allowed" : "pointer" }}>
                    {loading ? "Entrando..." : "Entrar"}
                  </button>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ flex: 1, height: 1, background: BORDER }} />
                    <span style={{ fontSize: 12, color: "#9ca3af", whiteSpace: "nowrap" }}>ou continue com</span>
                    <div style={{ flex: 1, height: 1, background: BORDER }} />
                  </div>
                  <button type="button" onClick={handleGoogle} disabled={loading} style={{
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                    width: "100%", padding: "11px", borderRadius: 8,
                    border: `1px solid ${BORDER}`, background: "#fff", cursor: loading ? "not-allowed" : "pointer",
                    fontSize: 14, fontWeight: 600, color: BLACK, opacity: loading ? 0.6 : 1,
                  }}>
                    <GoogleIcon /> Continuar com Google
                  </button>
                  <div style={{ textAlign: "center", fontSize: 13, color: GRAY, marginTop: 4 }}>
                    Não tem conta?{" "}
                    <button type="button" style={{ background: "none", border: "none", color: GREEN, fontWeight: 700, cursor: "pointer", fontSize: 13 }}
                      onClick={() => { setError(""); setModal("register"); }}>
                      Criar agora
                    </button>
                  </div>
                </form>
              )}

              {modal === "register" && (
                <form onSubmit={handleRegister} style={{ display: "flex", flexDirection: "column", gap: 13 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 5 }}>Nome completo</label>
                    <input style={INPUT} required placeholder="João Silva" value={rName} onChange={e => setRName(e.target.value)} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 5 }}>E-mail</label>
                    <input style={INPUT} type="email" required placeholder="voce@email.com" value={rEmail} onChange={e => setREmail(e.target.value)} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 5 }}>WhatsApp (com DDD)</label>
                    <input style={INPUT} required placeholder="55119..." value={rWhatsapp} onChange={e => setRWhatsapp(e.target.value)} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 5 }}>
                      Senha <span style={{ color: "#9ca3af", fontWeight: 400 }}>(mín. 8 caracteres)</span>
                    </label>
                    <input style={INPUT} type="password" required placeholder="••••••••" value={rPassword} onChange={e => setRPassword(e.target.value)} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 5 }}>Repetir senha</label>
                    <input style={INPUT} type="password" required placeholder="••••••••" value={rConfirm} onChange={e => setRConfirm(e.target.value)} />
                  </div>
                  <label style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 13, color: GRAY, cursor: "pointer" }}>
                    <input type="checkbox" checked={rTerms} onChange={e => setRTerms(e.target.checked)} style={{ marginTop: 2, flexShrink: 0 }} />
                    <span>Aceito os <span style={{ color: GREEN, fontWeight: 600 }}>termos de uso</span> e a política de privacidade</span>
                  </label>
                  <button type="submit" disabled={loading || !rTerms}
                    style={{ ...BTN_PRIMARY, width: "100%", fontSize: 14, padding: "13px", marginTop: 2, opacity: (loading || !rTerms) ? 0.6 : 1, cursor: (loading || !rTerms) ? "not-allowed" : "pointer" }}>
                    {loading ? "Criando conta..." : "Criar conta"}
                  </button>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ flex: 1, height: 1, background: BORDER }} />
                    <span style={{ fontSize: 12, color: "#9ca3af", whiteSpace: "nowrap" }}>ou registre com</span>
                    <div style={{ flex: 1, height: 1, background: BORDER }} />
                  </div>
                  <button type="button" onClick={handleGoogle} disabled={loading} style={{
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                    width: "100%", padding: "11px", borderRadius: 8,
                    border: `1px solid ${BORDER}`, background: "#fff", cursor: loading ? "not-allowed" : "pointer",
                    fontSize: 14, fontWeight: 600, color: BLACK, opacity: loading ? 0.6 : 1,
                  }}>
                    <GoogleIcon /> Registrar com Google
                  </button>
                  <div style={{ textAlign: "center", fontSize: 13, color: GRAY }}>
                    Já tem conta?{" "}
                    <button type="button" style={{ background: "none", border: "none", color: GREEN, fontWeight: 700, cursor: "pointer", fontSize: 13 }}
                      onClick={() => { setError(""); setModal("login"); }}>
                      Entrar
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes typing-dot { 0%, 60%, 100% { transform: translateY(0); opacity: 0.4; } 30% { transform: translateY(-4px); opacity: 1; } }

        @media (max-width: 768px) {
          .lp-nav { padding: 0 16px !important; height: 56px !important; }
          .lp-docs-btn { display: none !important; }
          .lp-nav-actions button { padding: 9px 14px !important; font-size: 13px !important; }

          .lp-hero { padding: 56px 20px 48px !important; }
          .lp-hero-btns { flex-direction: column !important; align-items: stretch !important; }
          .lp-hero-btns button { width: 100% !important; box-sizing: border-box !important; }

          .lp-sdr { padding: 56px 20px !important; }
          .lp-sdr-grid { grid-template-columns: 1fr !important; gap: 40px !important; }
          .lp-sdr-badge {
            position: static !important;
            margin-top: 20px !important;
            display: inline-flex !important;
            align-self: flex-start !important;
          }

          .lp-divider { margin: 0 20px !important; }

          .lp-features { padding: 56px 20px !important; }

          .lp-pricing { padding: 0 20px 56px !important; }

          .lp-api { padding: 0 20px 56px !important; }
          .lp-api-inner { padding: 28px 20px !important; flex-direction: column !important; gap: 24px !important; }
          .lp-api-inner > div:last-child { min-width: unset !important; width: 100% !important; }
          .lp-api-inner button { width: 100% !important; }

          .lp-cta { padding: 56px 20px !important; }

          .lp-footer { padding: 20px 16px !important; flex-direction: column !important; align-items: center !important; text-align: center !important; gap: 10px !important; }

          .lp-modal-img { display: none !important; }
          .lp-modal-box { border-radius: 14px !important; max-height: 96vh !important; }
          .lp-modal-form { padding: 28px 20px !important; }
        }

        @media (max-width: 400px) {
          .lp-nav-actions button:first-of-type { display: none !important; }
        }
      `}</style>
    </div>
  );
}

function ChatBubble({ align, text, time }: { align: "left" | "right"; text: string; time: string }) {
  const isRight = align === "right";
  return (
    <div style={{ display: "flex", justifyContent: isRight ? "flex-end" : "flex-start" }}>
      <div style={{
        maxWidth: "78%",
        background: isRight ? "#0d0d0d" : "#ffffff",
        color: isRight ? "#ffffff" : "#111",
        borderRadius: isRight ? "16px 4px 16px 16px" : "4px 16px 16px 16px",
        padding: "10px 14px",
        fontSize: 13,
        lineHeight: 1.55,
        border: isRight ? "none" : "1px solid #e5e7eb",
        boxShadow: isRight ? "none" : "0 1px 4px rgba(0,0,0,0.05)",
      }}>
        {text}
        <div style={{ fontSize: 10.5, marginTop: 4, textAlign: "right", opacity: 0.5 }}>{time}</div>
      </div>
    </div>
  );
}

function TypingBubble() {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end" }}>
      <div style={{
        background: "#0d0d0d", borderRadius: "16px 4px 16px 16px",
        padding: "12px 16px", display: "flex", gap: 4, alignItems: "center",
      }}>
        {[0, 0.18, 0.36].map((delay, i) => (
          <div key={i} style={{
            width: 6, height: 6, borderRadius: "50%", background: "#fff",
            animation: `typing-dot 1.1s ease-in-out ${delay}s infinite`,
          }} />
        ))}
      </div>
    </div>
  );
}
