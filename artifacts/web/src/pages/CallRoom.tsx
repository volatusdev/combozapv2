import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation } from "wouter";

function useSlug() {
  const [location] = useLocation();
  const match = location.match(/^\/call\/([a-z0-9-]+)/);
  return match ? match[1] : "";
}

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

interface ChatMsg {
  type: "chat" | "pix";
  from?: string;
  name?: string;
  text?: string;
  ts?: number;
  url?: string;
  qrCodeImage?: string;
  valueCents?: number;
  description?: string;
}

interface ParticipantInfo {
  peerId: string;
  name: string;
  isHost: boolean;
  stream?: MediaStream;
}

type CallStatus = "pre" | "lobby" | "admitted" | "rejected" | "kicked" | "ended";

export function CallRoom() {
  const slug = useSlug();
  const isHostParam = new URLSearchParams(window.location.search).get("host") === "1";

  const [roomTitle, setRoomTitle] = useState("Reuniao");
  const [roomNotFound, setRoomNotFound] = useState(false);
  const [myName, setMyName] = useState("");
  const [nameEntered, setNameEntered] = useState(false);
  const [callStatus, setCallStatus] = useState<CallStatus>("pre");

  const [participants, setParticipants] = useState<ParticipantInfo[]>([]);
  const [lobbyPeers, setLobbyPeers] = useState<{ peerId: string; name: string }[]>([]);

  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);

  const [chatMsgs, setChatMsgs] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [showChat, setShowChat] = useState(false);
  const [unreadChat, setUnreadChat] = useState(0);

  const [showPix, setShowPix] = useState(false);
  const [pixValue, setPixValue] = useState("");
  const [pixDesc, setPixDesc] = useState("");
  const [pixLoading, setPixLoading] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const myPeerIdRef = useRef("");
  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const participantsRef = useRef<Map<string, ParticipantInfo>>(new Map());
  const chatEndRef = useRef<HTMLDivElement>(null);
  const myNameRef = useRef("");

  useEffect(() => {
    if (!slug) return;
    fetch(`/api/calls/rooms/${slug}`, { credentials: "include" })
      .then(r => (r.ok ? r.json() : null))
      .then((data: { room?: { title: string } } | null) => {
        if (!data?.room) { setRoomNotFound(true); return; }
        setRoomTitle(data.room.title);
      })
      .catch(() => setRoomNotFound(true));
  }, [slug]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMsgs]);

  const sendWs = useCallback((msg: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const syncParticipants = useCallback(() => {
    setParticipants([...participantsRef.current.values()]);
  }, []);

  const removePeer = useCallback((peerId: string) => {
    participantsRef.current.delete(peerId);
    const pc = pcsRef.current.get(peerId);
    if (pc) { pc.close(); pcsRef.current.delete(peerId); }
    syncParticipants();
  }, [syncParticipants]);

  const makePc = useCallback((peerId: string, name: string, isHost: boolean): RTCPeerConnection => {
    const existing = pcsRef.current.get(peerId);
    if (existing && existing.signalingState !== "closed") return existing;

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcsRef.current.set(peerId, pc);

    if (!participantsRef.current.has(peerId)) {
      participantsRef.current.set(peerId, { peerId, name, isHost });
      syncParticipants();
    }

    localStreamRef.current?.getTracks().forEach(t => {
      pc.addTrack(t, localStreamRef.current!);
    });

    pc.ontrack = (e) => {
      if (e.streams[0]) {
        const prev = participantsRef.current.get(peerId);
        participantsRef.current.set(peerId, { ...(prev ?? { peerId, name, isHost }), stream: e.streams[0] });
        syncParticipants();
      }
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) sendWs({ type: "ice-candidate", candidate: e.candidate, to: peerId });
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed") removePeer(peerId);
    };

    return pc;
  }, [sendWs, syncParticipants, removePeer]);

  const connectToExisting = useCallback(async (admittedPeers: { peerId: string; name: string; isHost: boolean }[]) => {
    for (const peer of admittedPeers) {
      const pc = makePc(peer.peerId, peer.name, peer.isHost);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendWs({ type: "offer", sdp: offer, to: peer.peerId });
    }
  }, [makePc, sendWs]);

  const startCall = useCallback(async (name: string) => {
    myNameRef.current = name;

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    } catch {
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
      catch { stream = new MediaStream(); }
    }
    localStreamRef.current = stream;
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/calls/ws/${slug}`);
    wsRef.current = ws;

    ws.onopen = () => ws.send(JSON.stringify({ type: "join", name, isHost: isHostParam }));

    ws.onmessage = async (ev) => {
      const msg = JSON.parse(ev.data as string) as Record<string, unknown>;

      switch (msg.type as string) {
        case "joined": {
          myPeerIdRef.current = msg.peerId as string;
          const status = msg.status as string;
          if (status === "admitted") {
            setCallStatus("admitted");
            const existing = (msg.admittedPeers as { peerId: string; name: string; isHost: boolean }[]) ?? [];
            await connectToExisting(existing);
            const lobby = (msg.lobbyPeers as { peerId: string; name: string }[]) ?? [];
            setLobbyPeers(lobby);
          } else {
            setCallStatus("lobby");
          }
          break;
        }

        case "admitted": {
          setCallStatus("admitted");
          const existing = (msg.admittedPeers as { peerId: string; name: string; isHost: boolean }[]) ?? [];
          await connectToExisting(existing);
          break;
        }

        case "rejected": {
          setCallStatus("rejected");
          localStreamRef.current?.getTracks().forEach(t => t.stop());
          break;
        }

        case "kicked": {
          setCallStatus("kicked");
          localStreamRef.current?.getTracks().forEach(t => t.stop());
          ws.close();
          break;
        }

        case "join-request": {
          const reqId = msg.peerId as string;
          const reqName = (msg.name as string) || "Participante";
          setLobbyPeers(prev => prev.some(p => p.peerId === reqId) ? prev : [...prev, { peerId: reqId, name: reqName }]);
          break;
        }

        case "peer-joined": {
          const joinedId = msg.peerId as string;
          const joinedName = (msg.name as string) || "Participante";
          const joinedIsHost = !!(msg.isHost as boolean);
          setLobbyPeers(prev => prev.filter(p => p.peerId !== joinedId));
          if (!participantsRef.current.has(joinedId)) {
            participantsRef.current.set(joinedId, { peerId: joinedId, name: joinedName, isHost: joinedIsHost });
            syncParticipants();
          }
          break;
        }

        case "peer-left": {
          removePeer(msg.peerId as string);
          setLobbyPeers(prev => prev.filter(p => p.peerId !== msg.peerId));
          break;
        }

        case "offer": {
          const fromId = msg.from as string;
          const fromPeer = participantsRef.current.get(fromId);
          const pc = makePc(fromId, fromPeer?.name ?? "Participante", fromPeer?.isHost ?? false);
          await pc.setRemoteDescription(msg.sdp as RTCSessionDescriptionInit);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          sendWs({ type: "answer", sdp: answer, to: fromId });
          break;
        }

        case "answer": {
          const fromId = msg.from as string;
          const pc = pcsRef.current.get(fromId);
          if (pc && pc.signalingState !== "stable") {
            await pc.setRemoteDescription(msg.sdp as RTCSessionDescriptionInit);
          }
          break;
        }

        case "ice-candidate": {
          const fromId = msg.from as string;
          const pc = pcsRef.current.get(fromId);
          if (pc) {
            try { await pc.addIceCandidate(msg.candidate as RTCIceCandidateInit); } catch { /* ignore */ }
          }
          break;
        }

        case "chat": {
          const chatMsg = msg as ChatMsg;
          setChatMsgs(prev => [...prev, chatMsg]);
          setUnreadChat(prev => prev + 1);
          break;
        }

        case "pix": {
          setChatMsgs(prev => [...prev, msg as ChatMsg]);
          setUnreadChat(prev => prev + 1);
          break;
        }
      }
    };
  }, [slug, isHostParam, connectToExisting, makePc, removePeer, sendWs, syncParticipants]);

  const toggleMic = () => {
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
    setMicOn(v => !v);
  };

  const toggleCam = () => {
    localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = !t.enabled; });
    setCamOn(v => !v);
  };

  const endCall = useCallback(() => {
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    wsRef.current?.close();
    pcsRef.current.forEach(pc => pc.close());
    setCallStatus("ended");
  }, []);

  const admitPeer = (peerId: string) => {
    sendWs({ type: "admit", peerId });
    setLobbyPeers(prev => prev.filter(p => p.peerId !== peerId));
  };

  const rejectPeer = (peerId: string) => {
    sendWs({ type: "reject", peerId });
    setLobbyPeers(prev => prev.filter(p => p.peerId !== peerId));
  };

  const kickPeer = (peerId: string) => {
    sendWs({ type: "kick", peerId });
    removePeer(peerId);
  };

  const sendChat = () => {
    const text = chatInput.trim();
    if (!text) return;
    sendWs({ type: "chat", text });
    setChatMsgs(prev => [...prev, { type: "chat", from: myPeerIdRef.current, name: myNameRef.current, text, ts: Date.now() }]);
    setChatInput("");
  };

  const openChat = () => {
    setShowChat(v => !v);
    setUnreadChat(0);
  };

  const copyInviteLink = () => {
    const guestUrl = `${window.location.origin}/call/${slug}`;
    navigator.clipboard.writeText(guestUrl).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  };

  const generatePix = async () => {
    const cents = Math.round(parseFloat(pixValue.replace(",", ".")) * 100);
    if (isNaN(cents) || cents < 100) { alert("Valor minimo R$ 1,00"); return; }
    setPixLoading(true);
    try {
      const r = await fetch(`/api/calls/rooms/${slug}/pix`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ valueCents: cents, description: pixDesc }),
      });
      const data = await r.json() as { correlationId?: string; qrCodeImage?: string; valueCents?: number; description?: string; error?: string };
      if (!r.ok || !data.correlationId) { alert(data.error ?? "Erro ao gerar PIX"); return; }
      const pixUrl = `${window.location.origin}/pix/${data.correlationId}`;
      sendWs({ type: "pix", url: pixUrl, qrCodeImage: data.qrCodeImage ?? null, valueCents: data.valueCents, description: data.description });
      setChatMsgs(prev => [...prev, { type: "pix", url: pixUrl, qrCodeImage: data.qrCodeImage, valueCents: data.valueCents, description: data.description }]);
      setShowPix(false); setPixValue(""); setPixDesc("");
    } catch { alert("Erro ao gerar PIX"); }
    finally { setPixLoading(false); }
  };

  // ── Terminal states ──────────────────────────────────────────────────────

  if (!slug || roomNotFound) {
    return (
      <FullCenter>
        <IconCircle><IcoX size={22} color="#ef4444" /></IconCircle>
        <h2 style={S.heading}>Sala nao encontrada</h2>
        <p style={S.subtext}>Este link expirou ou e invalido.</p>
      </FullCenter>
    );
  }

  if (callStatus === "ended") {
    return (
      <FullCenter>
        <IconCircle><IcoPhoneOff size={22} color="#64748b" /></IconCircle>
        <h2 style={S.heading}>Chamada encerrada</h2>
        <p style={{ ...S.subtext, marginBottom: 20 }}>Obrigado por usar o ComboZap.</p>
        <button onClick={() => window.close()} style={S.btnPrimary}>Fechar janela</button>
      </FullCenter>
    );
  }

  if (callStatus === "rejected") {
    return (
      <FullCenter>
        <IconCircle><IcoX size={22} color="#ef4444" /></IconCircle>
        <h2 style={S.heading}>Entrada recusada</h2>
        <p style={S.subtext}>O organizador recusou sua entrada nesta sala.</p>
      </FullCenter>
    );
  }

  if (callStatus === "kicked") {
    return (
      <FullCenter>
        <IconCircle><IcoX size={22} color="#ef4444" /></IconCircle>
        <h2 style={S.heading}>Voce foi removido</h2>
        <p style={S.subtext}>O organizador encerrou sua participacao.</p>
      </FullCenter>
    );
  }

  // ── Name entry ───────────────────────────────────────────────────────────

  if (!nameEntered) {
    return (
      <FullCenter>
        <div style={{ background: "#1e293b", borderRadius: 14, padding: "32px 28px", width: "100%", maxWidth: 360 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}>
            <IconCircle><IcoVideo size={20} color="#94a3b8" /></IconCircle>
          </div>
          <h2 style={{ ...S.heading, marginBottom: 6 }}>{roomTitle}</h2>
          <p style={{ ...S.subtext, marginBottom: 22, textAlign: "center" }}>
            {isHostParam ? "Entre como organizador da reuniao" : "Solicite entrada na reuniao"}
          </p>
          <input
            value={myName}
            onChange={e => setMyName(e.target.value)}
            placeholder="Seu nome completo"
            style={S.input}
            onKeyDown={e => {
              if (e.key === "Enter" && myName.trim()) {
                setNameEntered(true);
                startCall(myName.trim());
              }
            }}
            autoFocus
          />
          <button
            disabled={!myName.trim()}
            onClick={() => { if (myName.trim()) { setNameEntered(true); startCall(myName.trim()); } }}
            style={{ ...S.btnPrimary, width: "100%", marginTop: 10, opacity: myName.trim() ? 1 : 0.4, cursor: myName.trim() ? "pointer" : "not-allowed" }}
          >
            {isHostParam ? "Iniciar reuniao" : "Solicitar entrada"}
          </button>
        </div>
      </FullCenter>
    );
  }

  // ── Lobby (guest waiting) ────────────────────────────────────────────────

  if (callStatus === "lobby") {
    return (
      <FullCenter>
        <div style={{ background: "#1e293b", borderRadius: 14, padding: "32px 28px", width: "100%", maxWidth: 360, textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}>
            <IconCircle><IcoClock size={20} color="#94a3b8" /></IconCircle>
          </div>
          <h2 style={{ ...S.heading, marginBottom: 8 }}>Aguardando aprovacao</h2>
          <p style={{ ...S.subtext, marginBottom: 4 }}>O organizador sera notificado da sua entrada.</p>
          <p style={{ color: "#475569", fontSize: 13, margin: 0 }}>
            Entrando como: <strong style={{ color: "#cbd5e1" }}>{myName}</strong>
          </p>
          <div style={{ display: "flex", justifyContent: "center", marginTop: 24 }}>
            <Spinner />
          </div>
          <button onClick={endCall} style={{ ...S.btnDanger, width: "100%", marginTop: 24 }}>
            Cancelar
          </button>
        </div>
      </FullCenter>
    );
  }

  // ── In-call UI ───────────────────────────────────────────────────────────

  const totalCount = participants.length + 1;
  const cols = participants.length === 0 ? 1 : participants.length <= 3 ? 2 : 3;

  return (
    <div style={{ minHeight: "100vh", background: "#0f172a", display: "flex", flexDirection: "column" }}>

      {/* Header */}
      <div style={{ padding: "8px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #1e293b", gap: 10, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <IcoVideo size={15} color="#475569" />
          <span style={{ color: "#e2e8f0", fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {roomTitle}
          </span>
          <span style={{
            background: participants.length > 0 ? "rgba(34,197,94,0.12)" : "rgba(100,116,139,0.12)",
            color: participants.length > 0 ? "#4ade80" : "#64748b",
            borderRadius: 20, padding: "2px 9px", fontSize: 11, fontWeight: 500, flexShrink: 0,
          }}>
            {totalCount} participante{totalCount !== 1 ? "s" : ""}
          </span>
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          {isHostParam && (
            <button
              onClick={copyInviteLink}
              style={{ ...S.hBtn, background: linkCopied ? "rgba(34,197,94,0.12)" : "transparent", color: linkCopied ? "#4ade80" : "#64748b", border: `1px solid ${linkCopied ? "rgba(34,197,94,0.3)" : "#1e293b"}` }}
            >
              <IcoLink size={13} color={linkCopied ? "#4ade80" : "#64748b"} />
              <span style={{ fontSize: 11, fontWeight: 600 }}>{linkCopied ? "Copiado!" : "Copiar link"}</span>
            </button>
          )}
          <button onClick={openChat} style={{ ...S.hBtn, background: showChat ? "#1e293b" : "transparent", position: "relative" }}>
            <IcoChat size={14} color={showChat ? "#e2e8f0" : "#64748b"} />
            {!showChat && unreadChat > 0 && (
              <span style={{ position: "absolute", top: 2, right: 2, width: 8, height: 8, background: "#3b82f6", borderRadius: "50%" }} />
            )}
          </button>
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* Left: video area */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

          {/* Lobby requests bar (host only) */}
          {isHostParam && lobbyPeers.length > 0 && (
            <div style={{ background: "#0f2547", borderBottom: "1px solid #1e40af", padding: "8px 14px" }}>
              <div style={{ fontSize: 11, color: "#93c5fd", fontWeight: 700, marginBottom: 7, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Solicitacoes de entrada ({lobbyPeers.length})
              </div>
              {lobbyPeers.map(p => (
                <div key={p.peerId} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                  <div style={{ width: 26, height: 26, borderRadius: "50%", background: "#1e3a5f", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <IcoUser size={13} color="#64748b" />
                  </div>
                  <span style={{ color: "#e2e8f0", fontSize: 13, flex: 1, fontWeight: 500 }}>{p.name}</span>
                  <button
                    onClick={() => admitPeer(p.peerId)}
                    style={{ padding: "4px 11px", background: "rgba(22,101,52,0.8)", color: "#4ade80", border: "1px solid #166534", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer" }}
                  >
                    Admitir
                  </button>
                  <button
                    onClick={() => rejectPeer(p.peerId)}
                    style={{ padding: "4px 11px", background: "rgba(69,10,10,0.8)", color: "#f87171", border: "1px solid #991b1b", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer" }}
                  >
                    Recusar
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Video grid */}
          <div style={{ flex: 1, background: "#0a0f1a", position: "relative", overflow: "hidden" }}>
            {participants.length === 0 ? (
              <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#1e293b", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
                    <IcoUser size={28} color="#334155" />
                  </div>
                  <div style={{ color: "#475569", fontSize: 14, fontWeight: 500 }}>Aguardando participantes</div>
                  <div style={{ color: "#334155", fontSize: 12, marginTop: 5 }}>Compartilhe o link desta sala</div>
                </div>
              </div>
            ) : (
              <div style={{
                display: "grid",
                gridTemplateColumns: `repeat(${cols}, 1fr)`,
                gap: 2,
                height: "100%",
              }}>
                {participants.map(p => (
                  <RemoteVideo
                    key={p.peerId}
                    participant={p}
                    isHost={isHostParam}
                    onKick={() => kickPeer(p.peerId)}
                  />
                ))}
              </div>
            )}

            {/* Local PiP */}
            <div style={{ position: "absolute", bottom: 12, right: 12, width: 148, height: 96, borderRadius: 9, overflow: "hidden", border: "1.5px solid #1e293b", background: "#0a0f1a", boxShadow: "0 4px 18px rgba(0,0,0,0.6)", zIndex: 10 }}>
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)", display: camOn ? "block" : "none" }}
              />
              {!camOn && (
                <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <IcoUser size={22} color="#334155" />
                </div>
              )}
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, textAlign: "center", fontSize: 9, color: "#94a3b8", padding: "2px 4px", background: "rgba(0,0,0,0.65)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {myName}{isHostParam ? " (Organizador)" : ""}
              </div>
            </div>
          </div>

          {/* Controls */}
          <div style={{ padding: "10px 14px", background: "#0f172a", borderTop: "1px solid #1e293b", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, flexShrink: 0 }}>
            <CtrlBtn active={micOn} danger={!micOn} onClick={toggleMic} title={micOn ? "Mutar microfone" : "Ativar microfone"}>
              {micOn ? <IcoMic size={17} color="#e2e8f0" /> : <IcoMicOff size={17} color="#fff" />}
            </CtrlBtn>
            <CtrlBtn active={camOn} danger={!camOn} onClick={toggleCam} title={camOn ? "Desativar camera" : "Ativar camera"}>
              {camOn ? <IcoCamera size={17} color="#e2e8f0" /> : <IcoCameraOff size={17} color="#fff" />}
            </CtrlBtn>
            {isHostParam && (
              <button
                onClick={() => setShowPix(true)}
                style={{ height: 44, borderRadius: 22, background: "#14532d", border: "1px solid #166534", cursor: "pointer", color: "#4ade80", padding: "0 16px", fontWeight: 600, fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}
              >
                <IcoPix size={15} color="#4ade80" />
                Gerar venda
              </button>
            )}
            <CtrlBtn active={false} danger={true} onClick={endCall} title="Encerrar chamada">
              <IcoPhoneOff size={17} color="#fff" />
            </CtrlBtn>
          </div>
        </div>

        {/* Chat + Participants panel */}
        {showChat && (
          <div style={{ width: 272, background: "#1a2435", borderLeft: "1px solid #1e293b", display: "flex", flexDirection: "column", flexShrink: 0 }}>

            {/* Participants (host sees with kick) */}
            {isHostParam && (
              <div style={{ borderBottom: "1px solid #1e293b" }}>
                <div style={{ padding: "10px 13px 6px", fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Participantes ({totalCount})
                </div>
                <div style={{ padding: "0 13px 8px", display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: "#94a3b8" }}>{myName} (voce)</span>
                  </div>
                  {participants.map(p => (
                    <div key={p.peerId} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: "#94a3b8", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {p.name}{p.isHost ? " (Org)" : ""}
                      </span>
                      <button
                        onClick={() => kickPeer(p.peerId)}
                        title="Remover participante"
                        style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", display: "flex", alignItems: "center", borderRadius: 4, color: "#475569" }}
                      >
                        <IcoX size={11} color="#475569" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ padding: "8px 13px 6px", borderBottom: "1px solid #1e293b", fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Chat
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "10px 10px", display: "flex", flexDirection: "column", gap: 8 }}>
              {chatMsgs.length === 0 && (
                <div style={{ textAlign: "center", color: "#334155", fontSize: 12, marginTop: 18 }}>Nenhuma mensagem ainda</div>
              )}
              {chatMsgs.map((msg, i) => {
                if (msg.type === "pix") {
                  return (
                    <div key={i} style={{ background: "#0c2d18", border: "1px solid #166534", borderRadius: 9, padding: 11 }}>
                      <div style={{ color: "#4ade80", fontWeight: 700, fontSize: 11, marginBottom: 7, display: "flex", alignItems: "center", gap: 5 }}>
                        <IcoPix size={13} color="#4ade80" />
                        Cobranca PIX
                      </div>
                      {msg.qrCodeImage && (
                        <img src={msg.qrCodeImage} alt="QR" style={{ width: "100%", borderRadius: 6, marginBottom: 7, display: "block" }} />
                      )}
                      <div style={{ color: "#86efac", fontSize: 15, fontWeight: 700 }}>
                        {msg.valueCents != null ? `R$ ${(msg.valueCents / 100).toFixed(2).replace(".", ",")}` : ""}
                      </div>
                      {msg.description && <div style={{ color: "#86efac", fontSize: 11, marginTop: 2 }}>{msg.description}</div>}
                      {msg.url && (
                        <a href={msg.url} target="_blank" rel="noopener noreferrer"
                          style={{ display: "block", marginTop: 8, background: "#166534", color: "#4ade80", textAlign: "center", padding: "8px", borderRadius: 6, fontSize: 12, fontWeight: 700, textDecoration: "none" }}>
                          Pagar agora
                        </a>
                      )}
                    </div>
                  );
                }
                const isMe = msg.from === myPeerIdRef.current;
                return (
                  <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: isMe ? "flex-end" : "flex-start" }}>
                    {!isMe && <div style={{ fontSize: 10, color: "#475569", marginBottom: 2, paddingLeft: 2 }}>{msg.name}</div>}
                    <div style={{ background: isMe ? "#1d4ed8" : "#1e293b", borderRadius: 8, padding: "7px 9px", color: "#e2e8f0", fontSize: 13, maxWidth: "85%", lineHeight: 1.4, wordBreak: "break-word" }}>
                      {msg.text}
                    </div>
                  </div>
                );
              })}
              <div ref={chatEndRef} />
            </div>
            <div style={{ padding: "8px", borderTop: "1px solid #1e293b", display: "flex", gap: 6 }}>
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && sendChat()}
                placeholder="Mensagem..."
                style={{ flex: 1, padding: "7px 10px", borderRadius: 7, border: "1px solid #334155", background: "#0f172a", color: "#e2e8f0", fontSize: 13, outline: "none" }}
              />
              <button
                onClick={sendChat}
                style={{ background: "#1d4ed8", color: "#fff", border: "none", borderRadius: 7, padding: "7px 11px", cursor: "pointer", display: "flex", alignItems: "center" }}
              >
                <IcoSend size={14} color="#fff" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* PIX modal */}
      {showPix && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, padding: 20 }}>
          <div style={{ background: "#1a2435", borderRadius: 14, padding: 22, width: "100%", maxWidth: 330, border: "1px solid #1e293b" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <IcoPix size={17} color="#4ade80" />
                <span style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>Gerar venda PIX</span>
              </div>
              <button onClick={() => setShowPix(false)} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", padding: 4 }}>
                <IcoX size={15} color="#64748b" />
              </button>
            </div>
            <label style={{ color: "#64748b", fontSize: 11, display: "block", marginBottom: 5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Valor (R$)</label>
            <input value={pixValue} onChange={e => setPixValue(e.target.value)} placeholder="0,00" inputMode="decimal"
              style={{ ...S.input, fontSize: 20, fontWeight: 700, marginBottom: 13 }} autoFocus />
            <label style={{ color: "#64748b", fontSize: 11, display: "block", marginBottom: 5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Descricao</label>
            <input value={pixDesc} onChange={e => setPixDesc(e.target.value)} placeholder="Ex: Produto XYZ"
              style={{ ...S.input, marginBottom: 18 }} />
            <button
              onClick={generatePix}
              disabled={pixLoading}
              style={{ width: "100%", padding: "11px", background: "#166534", color: "#4ade80", border: "1px solid #166534", borderRadius: 9, fontWeight: 700, fontSize: 13, cursor: pixLoading ? "not-allowed" : "pointer", opacity: pixLoading ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}
            >
              <IcoPix size={15} color="#4ade80" />
              {pixLoading ? "Gerando..." : "Enviar cobranca"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Remote video tile ─────────────────────────────────────────────────────────

function RemoteVideo({ participant, isHost, onKick }: {
  participant: ParticipantInfo;
  isHost: boolean;
  onKick: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && participant.stream) {
      videoRef.current.srcObject = participant.stream;
    }
  }, [participant.stream]);

  return (
    <div style={{ position: "relative", background: "#0a0f1a", overflow: "hidden", minHeight: 160 }}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        style={{ width: "100%", height: "100%", objectFit: "cover", display: participant.stream ? "block" : "none" }}
      />
      {!participant.stream && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ width: 52, height: 52, borderRadius: "50%", background: "#1e293b", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 8px" }}>
              <IcoUser size={22} color="#334155" />
            </div>
            <div style={{ fontSize: 11, color: "#334155" }}>{participant.name}</div>
          </div>
        </div>
      )}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "24px 10px 7px", background: "linear-gradient(transparent, rgba(0,0,0,0.72))", display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <span style={{ fontSize: 11, color: "#e2e8f0", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {participant.name}{participant.isHost ? " (Organizador)" : ""}
        </span>
        {isHost && (
          <button
            onClick={onKick}
            style={{ background: "rgba(220,38,38,0.25)", border: "1px solid rgba(220,38,38,0.5)", borderRadius: 5, padding: "2px 7px", cursor: "pointer", color: "#f87171", fontSize: 10, fontWeight: 700, flexShrink: 0, marginLeft: 6 }}
          >
            Remover
          </button>
        )}
      </div>
    </div>
  );
}

// ── UI helpers ────────────────────────────────────────────────────────────────

function FullCenter({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#0f172a", padding: 20, textAlign: "center", gap: 0 }}>
      {children}
    </div>
  );
}

function IconCircle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#1e293b", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px" }}>
      {children}
    </div>
  );
}

function CtrlBtn({ children, onClick, danger, active, title }: { children: React.ReactNode; onClick: () => void; danger?: boolean; active?: boolean; title?: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 44, height: 44, borderRadius: "50%",
        background: danger ? "#dc2626" : active === false ? "#1e293b" : "#1e293b",
        border: danger ? "none" : "1px solid #334155",
        cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "background 0.15s",
      }}
    >
      {children}
    </button>
  );
}

function Spinner() {
  return (
    <>
      <style>{`@keyframes _spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ width: 26, height: 26, border: "2.5px solid #1e293b", borderTop: "2.5px solid #64748b", borderRadius: "50%", animation: "_spin 0.85s linear infinite" }} />
    </>
  );
}

// ── SVG icons (no emojis) ─────────────────────────────────────────────────────

type IconProps = { size: number; color: string };

function IcoVideo({ size, color }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>;
}
function IcoMic({ size, color }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>;
}
function IcoMicOff({ size, color }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>;
}
function IcoCamera({ size, color }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>;
}
function IcoCameraOff({ size, color }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34m-7.72-2.06a4 4 0 1 1-5.56-5.56"/></svg>;
}
function IcoPhoneOff({ size, color }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.42 19.42 0 0 1 4.43 9.88a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.34 1h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.3 8.84"/><line x1="23" y1="1" x2="1" y2="23"/></svg>;
}
function IcoUser({ size, color }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
}
function IcoChat({ size, color }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>;
}
function IcoClock({ size, color }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
}
function IcoX({ size, color }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
}
function IcoPix({ size, color }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>;
}
function IcoSend({ size, color }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>;
}
function IcoLink({ size, color }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const S = {
  heading: {
    color: "#fff",
    margin: "0 0 6px",
    fontSize: 20,
    fontWeight: 700,
    textAlign: "center" as const,
  },
  subtext: {
    color: "#64748b",
    fontSize: 14,
    margin: 0,
    lineHeight: 1.5,
    textAlign: "center" as const,
  },
  input: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid #334155",
    background: "#0f172a",
    color: "#fff",
    fontSize: 14,
    boxSizing: "border-box" as const,
    outline: "none",
    marginBottom: 0,
  } as React.CSSProperties,
  btnPrimary: {
    padding: "11px 22px",
    background: "#1d4ed8",
    color: "#fff",
    border: "none",
    borderRadius: 9,
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  } as React.CSSProperties,
  btnDanger: {
    padding: "11px 20px",
    background: "#dc2626",
    color: "#fff",
    border: "none",
    borderRadius: 9,
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  } as React.CSSProperties,
  hBtn: {
    height: 30,
    padding: "0 10px",
    borderRadius: 7,
    border: "1px solid #1e293b",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 4,
    fontSize: 12,
    fontWeight: 500,
    position: "relative",
  } as React.CSSProperties,
};
