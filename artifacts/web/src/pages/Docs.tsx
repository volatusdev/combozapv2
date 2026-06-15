import { useState } from "react";
import { useLocation } from "wouter";

const BLACK = "#0d0d0d";
const GREEN = "#22c55e";
const GREEN_DARK = "#16a34a";
const GRAY = "#6b7280";
const BORDER = "#e5e7eb";
const OFF_WHITE = "#f7f7f5";
const WHITE = "#ffffff";
const CODE_BG = "#0f1117";
const CODE_TEXT = "#e2e8f0";

type Section = "overview" | "auth" | "webhook" | "send" | "contacts" | "slots" | "errors";

const SECTIONS: { id: Section; label: string }[] = [
  { id: "overview", label: "Visão Geral" },
  { id: "auth", label: "Autenticação" },
  { id: "webhook", label: "Webhooks" },
  { id: "send", label: "Enviar Mensagens" },
  { id: "contacts", label: "Contatos" },
  { id: "slots", label: "Slots / Instâncias" },
  { id: "errors", label: "Erros" },
];

function CodeBlock({ code, lang = "bash" }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <div style={{ position: "relative", marginTop: 16, marginBottom: 24 }}>
      <div style={{ background: CODE_BG, borderRadius: 10, overflow: "hidden", border: `1px solid #1e2432` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderBottom: "1px solid #1e2432" }}>
          <span style={{ fontSize: 11, color: "#64748b", fontFamily: "monospace", letterSpacing: 0.5 }}>{lang}</span>
          <button onClick={copy} style={{
            background: "none", border: `1px solid #2d3748`, borderRadius: 5, color: "#94a3b8",
            fontSize: 11, padding: "3px 10px", cursor: "pointer", fontWeight: 500,
          }}>
            {copied ? "Copiado" : "Copiar"}
          </button>
        </div>
        <pre style={{ margin: 0, padding: "18px 20px", overflowX: "auto", fontSize: 12.5, lineHeight: 1.7, color: CODE_TEXT, fontFamily: "'Fira Code', 'Cascadia Code', 'Consolas', monospace" }}>
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );
}

function Badge({ text, color = GREEN }: { text: string; color?: string }) {
  const bg = color === GREEN ? "#f0fdf4" : color === "#3b82f6" ? "#eff6ff" : color === "#f59e0b" ? "#fffbeb" : "#fef2f2";
  const border = color === GREEN ? "#bbf7d0" : color === "#3b82f6" ? "#bfdbfe" : color === "#f59e0b" ? "#fde68a" : "#fecaca";
  const textColor = color === GREEN ? GREEN_DARK : color === "#3b82f6" ? "#1d4ed8" : color === "#f59e0b" ? "#92400e" : "#991b1b";
  return (
    <span style={{ display: "inline-block", background: bg, border: `1px solid ${border}`, color: textColor, fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 99, letterSpacing: 0.3, marginRight: 6 }}>
      {text}
    </span>
  );
}

function Method({ method }: { method: string }) {
  const colors: Record<string, string> = { GET: "#3b82f6", POST: GREEN, PUT: "#f59e0b", DELETE: "#ef4444", PATCH: "#8b5cf6" };
  return <Badge text={method} color={colors[method] ?? GRAY} />;
}

function Endpoint({ method, path, desc, children }: { method: string; path: string; desc: string; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ border: `1px solid ${BORDER}`, borderRadius: 12, marginBottom: 12, overflow: "hidden" }}>
      <div
        onClick={() => setOpen(!open)}
        style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 20px", cursor: "pointer", background: open ? OFF_WHITE : WHITE, transition: "background 0.15s" }}
      >
        <Method method={method} />
        <code style={{ fontFamily: "monospace", fontSize: 13, color: BLACK, fontWeight: 600, flex: 1 }}>{path}</code>
        <span style={{ fontSize: 12.5, color: GRAY, marginRight: 8 }}>{desc}</span>
        <span style={{ fontSize: 18, color: GRAY, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>›</span>
      </div>
      {open && <div style={{ padding: "0 20px 20px", background: WHITE, borderTop: `1px solid ${BORDER}` }}>{children}</div>}
    </div>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 26, fontWeight: 800, color: BLACK, letterSpacing: -0.5, marginBottom: subtitle ? 8 : 0 }}>{title}</h2>
      {subtitle && <p style={{ fontSize: 15, color: GRAY, lineHeight: 1.65 }}>{subtitle}</p>}
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: BORDER, margin: "48px 0" }} />;
}

export function Docs() {
  const [, setLocation] = useLocation();
  const [activeSection, setActiveSection] = useState<Section>("overview");

  const baseUrl = `https://{seu-dominio}`;

  function scrollTo(id: Section) {
    setActiveSection(id);
    document.getElementById(`section-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div style={{ minHeight: "100vh", background: WHITE, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", color: BLACK }}>

      {/* ── Topbar ── */}
      <nav style={{
        position: "sticky", top: 0, zIndex: 50, background: "rgba(255,255,255,0.97)",
        backdropFilter: "blur(10px)", borderBottom: `1px solid ${BORDER}`,
        padding: "0 40px", height: 62, display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <button onClick={() => setLocation("/")} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 19, fontWeight: 800, color: BLACK, padding: 0 }}>
            Combo<span style={{ color: GREEN }}>Zap</span>
          </button>
          <span style={{ color: BORDER }}>|</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: GRAY }}>Documentação</span>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <a href="mailto:suporte@combozap.com" style={{ fontSize: 13, color: GRAY, textDecoration: "none" }}>Suporte</a>
          <button onClick={() => setLocation("/")} style={{ background: GREEN, color: WHITE, border: "none", borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            Voltar ao site
          </button>
        </div>
      </nav>

      <div style={{ display: "flex", maxWidth: 1200, margin: "0 auto", padding: "0 24px" }}>

        {/* ── Sidebar nav ── */}
        <aside style={{
          width: 220, flexShrink: 0, padding: "40px 0 40px 8px",
          position: "sticky", top: 62, height: "calc(100vh - 62px)", overflowY: "auto",
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 12, paddingLeft: 12 }}>
            Conteúdo
          </div>
          {SECTIONS.map(s => (
            <button key={s.id} onClick={() => scrollTo(s.id)} style={{
              display: "block", width: "100%", textAlign: "left", background: "none",
              border: "none", padding: "8px 12px", borderRadius: 7, cursor: "pointer",
              fontSize: 13.5, fontWeight: activeSection === s.id ? 600 : 400,
              color: activeSection === s.id ? GREEN_DARK : GRAY,
              borderLeft: activeSection === s.id ? `2px solid ${GREEN}` : "2px solid transparent",
              transition: "all 0.15s",
            }}>
              {s.label}
            </button>
          ))}
        </aside>

        {/* ── Main content ── */}
        <main style={{ flex: 1, padding: "48px 0 80px 48px", minWidth: 0 }}>

          {/* OVERVIEW */}
          <div id="section-overview">
            <SectionTitle
              title="ComboZap API"
              subtitle="API REST para integrar agentes externos, chatbots e sistemas com sua central de atendimento WhatsApp."
            />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 32 }}>
              {[
                { label: "Base URL", value: `${baseUrl}/api` },
                { label: "Formato", value: "JSON (application/json)" },
                { label: "Autenticação", value: "Session Cookie + API Key" },
                { label: "Versão", value: "v1" },
              ].map((item, i) => (
                <div key={i} style={{ border: `1px solid ${BORDER}`, borderRadius: 10, padding: "16px 18px", background: OFF_WHITE }}>
                  <div style={{ fontSize: 11, color: GRAY, fontWeight: 600, marginBottom: 4, letterSpacing: 0.3 }}>{item.label}</div>
                  <code style={{ fontSize: 12.5, color: BLACK, fontFamily: "monospace" }}>{item.value}</code>
                </div>
              ))}
            </div>
            <div style={{ background: "#f0fdf4", border: `1px solid #bbf7d0`, borderRadius: 10, padding: "16px 20px", fontSize: 13.5, color: "#166534", lineHeight: 1.6 }}>
              <strong>Casos de uso:</strong> conecte seu chatbot, CRM externo, sistema de agendamento ou qualquer automação para enviar e receber mensagens WhatsApp via ComboZap.
            </div>
          </div>

          <Divider />

          {/* AUTH */}
          <div id="section-auth">
            <SectionTitle title="Autenticação" subtitle="A API suporta dois métodos: cookie de sessão (para uso no navegador) e API Key (para integrações servidor-a-servidor)." />

            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: BLACK }}>Login via API</h3>
            <p style={{ fontSize: 14, color: GRAY, marginBottom: 0, lineHeight: 1.65 }}>
              Faça login para obter um cookie de sessão. O cookie é retornado automaticamente e deve ser enviado em todas as requisições subsequentes.
            </p>
            <CodeBlock lang="bash" code={`curl -X POST ${baseUrl}/api/auth/login \\
  -H "Content-Type: application/json" \\
  -c cookies.txt \\
  -d '{
    "email": "usuario@email.com",
    "password": "suasenha"
  }'`} />

            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: BLACK }}>Verificar sessão</h3>
            <CodeBlock lang="bash" code={`curl ${baseUrl}/api/auth/me \\
  -b cookies.txt`} />

            <div style={{ border: `1px solid #fde68a`, background: "#fffbeb", borderRadius: 10, padding: "14px 18px", fontSize: 13, color: "#92400e", lineHeight: 1.6 }}>
              <strong>Integracao servidor-a-servidor:</strong> para uso em backend, envie o header <code>X-Api-Key: sua_chave</code> em vez de cookie de sessão. Entre em contato com o suporte para gerar sua API Key.
            </div>
          </div>

          <Divider />

          {/* WEBHOOK */}
          <div id="section-webhook">
            <SectionTitle
              title="Webhooks"
              subtitle="Configure uma URL no seu sistema para receber eventos em tempo real — mensagens recebidas, status de envio, conexão de slots e muito mais."
            />

            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: BLACK }}>Configurar webhook</h3>
            <p style={{ fontSize: 14, color: GRAY, marginBottom: 0, lineHeight: 1.65 }}>
              Configure a URL do seu endpoint via API ou pelo painel. O ComboZap envia um POST para sua URL sempre que um evento ocorrer.
            </p>
            <CodeBlock lang="bash" code={`curl -X POST ${baseUrl}/api/sdr/whatsapp/webhook \\
  -b cookies.txt \\
  -H "Content-Type: application/json" \\
  -d '{
    "slotId": "slot_01",
    "webhookUrl": "https://meusite.com/webhook/whatsapp",
    "events": ["message.received", "message.sent", "slot.connected", "slot.disconnected"]
  }'`} />

            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: BLACK }}>Eventos disponíveis</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
              {[
                { event: "message.received", desc: "Nova mensagem recebida em qualquer slot", important: true },
                { event: "message.sent", desc: "Confirmação de mensagem enviada com sucesso", important: false },
                { event: "message.failed", desc: "Falha no envio de mensagem", important: false },
                { event: "slot.connected", desc: "Slot WhatsApp conectado/autenticado via QR Code", important: false },
                { event: "slot.disconnected", desc: "Slot desconectado ou sessão expirada", important: true },
                { event: "contact.updated", desc: "Dados de contato atualizados (nome, foto, etc.)", important: false },
              ].map((ev, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", border: `1px solid ${BORDER}`, borderRadius: 9, background: WHITE }}>
                  <code style={{ fontSize: 12.5, color: GREEN_DARK, background: "#f0fdf4", padding: "3px 10px", borderRadius: 6, fontFamily: "monospace", whiteSpace: "nowrap" }}>{ev.event}</code>
                  <span style={{ fontSize: 13, color: GRAY, flex: 1 }}>{ev.desc}</span>
                  {ev.important && <Badge text="Importante" color={GREEN} />}
                </div>
              ))}
            </div>

            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: BLACK }}>Payload de mensagem recebida</h3>
            <p style={{ fontSize: 14, color: GRAY, marginBottom: 0, lineHeight: 1.65 }}>
              Quando uma mensagem chega, seu endpoint recebe este JSON via POST:
            </p>
            <CodeBlock lang="json" code={`{
  "event": "message.received",
  "timestamp": "2025-06-06T18:30:00.000Z",
  "slotId": "slot_01",
  "slotName": "Vendas",
  "message": {
    "id": "msg_3FA2B1C4",
    "from": "5511999998888",
    "fromName": "João Silva",
    "body": "Olá, gostaria de saber mais sobre os planos.",
    "type": "text",
    "timestamp": "2025-06-06T18:30:00.000Z",
    "isGroup": false
  }
}`} />

            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: BLACK }}>Exemplo — receber webhook em Node.js</h3>
            <CodeBlock lang="javascript" code={`const express = require('express');
const app = express();
app.use(express.json());

app.post('/webhook/whatsapp', (req, res) => {
  const { event, message, slotId } = req.body;

  if (event === 'message.received') {
    console.log(\`Mensagem de \${message.fromName}: \${message.body}\`);

    // Aqui você pode:
    // - Acionar seu bot / agente de IA
    // - Salvar no seu CRM
    // - Disparar uma resposta automática via API

    // Responder ao remetente automaticamente:
    // await sendMessage(slotId, message.from, 'Recebi sua mensagem!');
  }

  res.sendStatus(200); // SEMPRE responda 200
});

app.listen(3000);`} />

            <div style={{ border: `1px solid ${BORDER}`, borderRadius: 10, padding: "14px 18px", fontSize: 13, color: GRAY, lineHeight: 1.65 }}>
              <strong style={{ color: BLACK }}>Importante:</strong> seu endpoint deve responder com HTTP 200 em ate 5 segundos. Timeouts ou erros causam retentativas automaticas com backoff exponencial (3x, intervalos de 10s, 60s, 300s).
            </div>
          </div>

          <Divider />

          {/* SEND MESSAGES */}
          <div id="section-send">
            <SectionTitle title="Enviar Mensagens" subtitle="Envie mensagens de texto, imagens e arquivos para qualquer numero WhatsApp a partir do seu sistema." />

            <Endpoint method="POST" path="/api/sdr/whatsapp/send" desc="Enviar mensagem de texto">
              <p style={{ fontSize: 13.5, color: GRAY, margin: "16px 0 4px", lineHeight: 1.65 }}>
                Envia uma mensagem para um numero WhatsApp usando o slot especificado.
              </p>
              <CodeBlock lang="bash" code={`curl -X POST ${baseUrl}/api/sdr/whatsapp/send \\
  -b cookies.txt \\
  -H "Content-Type: application/json" \\
  -d '{
    "slotId": "slot_01",
    "phone": "5511999998888",
    "message": "Ola! Tudo bem? Aqui e o assistente da ComboZap."
  }'`} />
              <h4 style={{ fontSize: 13, fontWeight: 700, color: BLACK, marginBottom: 8 }}>Resposta de sucesso</h4>
              <CodeBlock lang="json" code={`{
  "success": true,
  "messageId": "msg_A1B2C3D4",
  "timestamp": "2025-06-06T18:31:00.000Z"
}`} />
            </Endpoint>

            <Endpoint method="POST" path="/api/sdr/whatsapp/send-bulk" desc="Disparo em massa">
              <p style={{ fontSize: 13.5, color: GRAY, margin: "16px 0 4px", lineHeight: 1.65 }}>
                Envia uma mensagem para uma lista de numeros com delay natural entre envios para evitar bloqueios.
              </p>
              <CodeBlock lang="bash" code={`curl -X POST ${baseUrl}/api/sdr/whatsapp/send-bulk \\
  -b cookies.txt \\
  -H "Content-Type: application/json" \\
  -d '{
    "slotId": "slot_01",
    "phones": ["5511999990001", "5511999990002", "5511999990003"],
    "message": "Promocao especial! Use o cupom COMBOZAP15.",
    "delayMs": 3000
  }'`} />
            </Endpoint>

            <Endpoint method="POST" path="/api/sdr/whatsapp/send-media" desc="Enviar imagem ou arquivo">
              <CodeBlock lang="bash" code={`curl -X POST ${baseUrl}/api/sdr/whatsapp/send-media \\
  -b cookies.txt \\
  -H "Content-Type: application/json" \\
  -d '{
    "slotId": "slot_01",
    "phone": "5511999998888",
    "mediaUrl": "https://meusite.com/proposta.pdf",
    "mediaType": "document",
    "caption": "Segue sua proposta comercial!"
  }'`} />
            </Endpoint>

            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, marginTop: 32, color: BLACK }}>Exemplo completo — bot de atendimento</h3>
            <CodeBlock lang="javascript" code={`// Recebe webhook → processa com IA → responde automaticamente

async function handleWebhook(req, res) {
  const { event, message, slotId } = req.body;
  if (event !== 'message.received') return res.sendStatus(200);

  // 1. Processar com seu agente de IA
  const reply = await myAiAgent.respond(message.body, {
    contact: message.fromName,
    history: await getHistory(message.from),
  });

  // 2. Responder via ComboZap API
  await fetch('${baseUrl}/api/sdr/whatsapp/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': process.env.COMBOZAP_SESSION,
      // OU: 'X-Api-Key': process.env.COMBOZAP_API_KEY
    },
    body: JSON.stringify({
      slotId,
      phone: message.from,
      message: reply,
    }),
  });

  res.sendStatus(200);
}`} />
          </div>

          <Divider />

          {/* CONTACTS */}
          <div id="section-contacts">
            <SectionTitle title="Contatos" subtitle="Consulte, crie e atualize contatos da sua base diretamente via API." />

            <Endpoint method="GET" path="/api/sdr/contacts" desc="Listar contatos">
              <CodeBlock lang="bash" code={`curl "${baseUrl}/api/sdr/contacts?q=joao&limit=20&offset=0" \\
  -b cookies.txt`} />
              <CodeBlock lang="json" code={`{
  "contacts": [
    {
      "id": 42,
      "phone": "5511999998888",
      "name": "Joao Silva",
      "tags": ["lead-quente", "produto-a"],
      "createdAt": "2025-05-10T12:00:00.000Z"
    }
  ],
  "total": 1
}`} />
            </Endpoint>

            <Endpoint method="POST" path="/api/sdr/contacts" desc="Criar contato">
              <CodeBlock lang="bash" code={`curl -X POST ${baseUrl}/api/sdr/contacts \\
  -b cookies.txt \\
  -H "Content-Type: application/json" \\
  -d '{
    "phone": "5511999997777",
    "name": "Maria Souza",
    "tags": ["lead", "produto-b"]
  }'`} />
            </Endpoint>

            <Endpoint method="PATCH" path="/api/sdr/contacts/:id" desc="Atualizar contato">
              <CodeBlock lang="bash" code={`curl -X PATCH ${baseUrl}/api/sdr/contacts/42 \\
  -b cookies.txt \\
  -H "Content-Type: application/json" \\
  -d '{
    "tags": ["cliente-ativo", "produto-a"]
  }'`} />
            </Endpoint>
          </div>

          <Divider />

          {/* SLOTS */}
          <div id="section-slots">
            <SectionTitle title="Slots / Instâncias" subtitle="Consulte o status das conexoes WhatsApp e obtenha QR Codes para autenticacao." />

            <Endpoint method="GET" path="/api/sdr/whatsapp/slots" desc="Listar slots">
              <CodeBlock lang="bash" code={`curl ${baseUrl}/api/sdr/whatsapp/slots \\
  -b cookies.txt`} />
              <CodeBlock lang="json" code={`{
  "slots": [
    {
      "id": "slot_01",
      "name": "Vendas",
      "status": "connected",
      "phone": "5511999990001",
      "connectedAt": "2025-06-06T08:00:00.000Z"
    },
    {
      "id": "slot_02",
      "name": "Suporte",
      "status": "disconnected",
      "phone": null,
      "connectedAt": null
    }
  ]
}`} />
            </Endpoint>

            <Endpoint method="GET" path="/api/sdr/whatsapp/slots/:id/qr" desc="Obter QR Code">
              <p style={{ fontSize: 13.5, color: GRAY, margin: "16px 0 4px", lineHeight: 1.65 }}>
                Retorna o QR Code em base64 para exibir no seu sistema e autenticar o slot.
              </p>
              <CodeBlock lang="bash" code={`curl ${baseUrl}/api/sdr/whatsapp/slots/slot_02/qr \\
  -b cookies.txt`} />
              <CodeBlock lang="json" code={`{
  "qrCode": "data:image/png;base64,iVBOR...",
  "expiresAt": "2025-06-06T18:32:00.000Z"
}`} />
            </Endpoint>
          </div>

          <Divider />

          {/* ERRORS */}
          <div id="section-errors">
            <SectionTitle title="Erros" subtitle="A API usa codigos HTTP padrao. Todos os erros retornam JSON com o campo error." />

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { status: 400, title: "Bad Request", desc: "Dados invalidos ou ausentes no corpo da requisicao." },
                { status: 401, title: "Unauthorized", desc: "Sessao expirada ou API Key invalida. Faca login novamente." },
                { status: 403, title: "Forbidden", desc: "Seu plano nao permite esta acao (ex: excedeu o limite de slots)." },
                { status: 404, title: "Not Found", desc: "Recurso nao encontrado (contato, slot ou mensagem inexistente)." },
                { status: 429, title: "Too Many Requests", desc: "Limite de requisicoes atingido. Aguarde e tente novamente." },
                { status: 500, title: "Internal Server Error", desc: "Erro inesperado no servidor. Contate o suporte se persistir." },
              ].map((err, i) => (
                <div key={i} style={{ display: "flex", gap: 16, padding: "14px 18px", border: `1px solid ${BORDER}`, borderRadius: 10, background: WHITE, alignItems: "flex-start" }}>
                  <code style={{ fontSize: 13, fontWeight: 800, color: err.status >= 500 ? "#dc2626" : err.status >= 400 ? "#d97706" : BLACK, fontFamily: "monospace", minWidth: 36 }}>{err.status}</code>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: BLACK, marginBottom: 3 }}>{err.title}</div>
                    <div style={{ fontSize: 13, color: GRAY }}>{err.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, marginTop: 32, color: BLACK }}>Formato de erro</h3>
            <CodeBlock lang="json" code={`{
  "error": "unauthorized",
  "message": "Sessao expirada. Faca login novamente."
}`} />

            <div style={{ background: "#f0fdf4", border: `1px solid #bbf7d0`, borderRadius: 10, padding: "16px 20px", marginTop: 24, fontSize: 13.5, color: "#166534", lineHeight: 1.6 }}>
              <strong>Precisa de ajuda?</strong> Entre em contato via{" "}
              <a href="mailto:suporte@combozap.com" style={{ color: GREEN_DARK, fontWeight: 600 }}>suporte@combozap.com</a>{" "}
              ou abra um ticket no painel. Respondemos em ate 24h.
            </div>
          </div>

        </main>
      </div>
    </div>
  );
}
