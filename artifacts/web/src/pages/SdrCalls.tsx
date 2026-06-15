import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Layout } from "../components/Layout";

// ── palette ──────────────────────────────────────────────────────────────────
const GREEN      = "#22c55e";
const GREEN_DARK = "#16a34a";
const BORDER     = "#e5e7eb";
const GRAY       = "#6b7280";

// ── types ────────────────────────────────────────────────────────────────────
interface CallRoom { id: number; slug: string; title: string; expiresAt: string; createdAt: string; }
interface Appointment {
  id: number; guestName: string; guestPhone: string;
  scheduledAt: string; durationMinutes: number; notes: string; status: string;
  roomSlug?: string; source?: string;
}
interface AvailSettings { days: number[]; startHour: number; endHour: number; slotMinutes: number; }

// ── helpers ──────────────────────────────────────────────────────────────────
async function apiFetch(path: string, opts?: RequestInit) {
  const r = await fetch(path, { credentials: "include", ...opts });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<unknown>;
}

const PT_DAYS  = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const PT_DAYS_FULL = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const PT_MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function buildCalendar(year: number, month: number): (number | null)[][] {
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

function generateSlots(date: Date, s: AvailSettings): Date[] {
  if (!s.days.includes(date.getDay())) return [];
  const slots: Date[] = [];
  for (let m = s.startHour * 60; m < s.endHour * 60; m += s.slotMinutes) {
    const d = new Date(date);
    d.setHours(Math.floor(m / 60), m % 60, 0, 0);
    slots.push(d);
  }
  return slots;
}

function fmtTime(d: Date) {
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const STATUS_MAP: Record<string, { label: string; bg: string; color: string }> = {
  pending:   { label: "Pendente",   bg: "#fffbeb", color: "#92400e" },
  confirmed: { label: "Confirmado", bg: "#eff6ff", color: "#1d4ed8" },
  done:      { label: "Concluído",  bg: "#f0fdf4", color: GREEN_DARK },
  cancelled: { label: "Cancelado",  bg: "#f9fafb", color: GRAY },
};

// ── Tab: Salas ────────────────────────────────────────────────────────────────
function SalasTab() {
  const qc = useQueryClient();
  const [newTitle, setNewTitle] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ rooms: CallRoom[] }>({
    queryKey: ["call-rooms"],
    queryFn: () => apiFetch("/api/calls/rooms") as Promise<{ rooms: CallRoom[] }>,
  });
  const createMut = useMutation({
    mutationFn: (title: string) =>
      apiFetch("/api/calls/rooms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["call-rooms"] }); setNewTitle(""); setShowNew(false); },
  });
  const deleteMut = useMutation({
    mutationFn: (slug: string) => apiFetch(`/api/calls/rooms/${slug}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["call-rooms"] }),
  });

  const copyLink = (slug: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/call/${slug}`).catch(() => undefined);
    setCopied(slug); setTimeout(() => setCopied(null), 2000);
  };

  const rooms = data?.rooms ?? [];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 20 }}>
        <button onClick={() => setShowNew(true)} style={{
          background: GREEN_DARK, color: "#fff", border: "none", borderRadius: 10,
          padding: "10px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer",
        }}>＋ Nova Reunião</button>
      </div>

      {showNew && (
        <div style={{ background: "#f9fafb", border: `1px solid ${BORDER}`, borderRadius: 14, padding: 22, marginBottom: 20 }}>
          <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 600 }}>Nova Reunião</h3>
          <input
            value={newTitle} onChange={e => setNewTitle(e.target.value)}
            placeholder="Nome da reunião"
            style={{ width: "100%", padding: "11px 13px", borderRadius: 8, border: `1px solid ${BORDER}`, fontSize: 14, boxSizing: "border-box", marginBottom: 12, outline: "none" }}
            onKeyDown={e => e.key === "Enter" && createMut.mutate(newTitle)}
            autoFocus
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => createMut.mutate(newTitle)} disabled={createMut.isPending}
              style={{ background: GREEN_DARK, color: "#fff", border: "none", borderRadius: 8, padding: "9px 22px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
              {createMut.isPending ? "Criando..." : "Criar Sala"}
            </button>
            <button onClick={() => setShowNew(false)}
              style={{ background: "#fff", color: "#374151", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 16px", fontSize: 14, cursor: "pointer" }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {isLoading && <div style={{ textAlign: "center", padding: 48, color: "#9ca3af" }}>Carregando...</div>}

      {!isLoading && rooms.length === 0 && (
        <div style={{ textAlign: "center", padding: "56px 24px", background: "#f9fafb", borderRadius: 16, border: `1.5px dashed ${BORDER}` }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📹</div>
          <div style={{ fontSize: 17, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Nenhuma sala ativa</div>
          <div style={{ fontSize: 14, color: "#9ca3af" }}>Crie uma sala e envie o link para o cliente.<br />Durante a call, gere cobranças PIX com um clique.</div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {rooms.map(room => (
          <div key={room.slug} style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 14, padding: "16px 20px", display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ width: 46, height: 46, borderRadius: 10, background: "#f0fdf4", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 22 }}>🎥</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 15, color: "#111", marginBottom: 2 }}>{room.title}</div>
              <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 4 }}>Expira em {new Date(room.expiresAt).toLocaleString("pt-BR")}</div>
              <div style={{ fontSize: 11, color: GRAY, fontFamily: "monospace", background: "#f3f4f6", padding: "2px 8px", borderRadius: 4, display: "inline-block", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis" }}>
                {window.location.origin}/call/{room.slug}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <button onClick={() => copyLink(room.slug)}
                style={{ background: copied === room.slug ? "#10b981" : "#f3f4f6", color: copied === room.slug ? "#fff" : "#374151", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, cursor: "pointer", fontWeight: 500, transition: "background 0.2s" }}>
                {copied === room.slug ? "✓ Copiado" : "Copiar Link"}
              </button>
              <Link href={`/call/${room.slug}?host=1`}>
                <button style={{ background: GREEN_DARK, color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>Entrar</button>
              </Link>
              <button onClick={() => { if (window.confirm("Encerrar esta sala?")) deleteMut.mutate(room.slug); }}
                style={{ background: "#fff", color: "#ef4444", border: "1px solid #fee2e2", borderRadius: 8, padding: "8px 13px", fontSize: 13, cursor: "pointer" }}>✕</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Booking form (inline in day panel) ───────────────────────────────────────
function BookingForm({ slotDate, onCancel, onSaved }: { slotDate: Date; onCancel: () => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) { alert("Informe o nome do cliente"); return; }
    setSaving(true);
    try {
      await apiFetch("/api/calls/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guestName: name, guestPhone: phone, scheduledAt: slotDate.toISOString(), notes }),
      });
      onSaved();
    } catch (err) { alert("Erro: " + String(err)); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ background: "#f0fdf4", border: `1px solid #bbf7d0`, borderRadius: 10, padding: 16, marginTop: 8 }}>
      <div style={{ fontWeight: 600, fontSize: 13, color: GREEN_DARK, marginBottom: 12 }}>
        Agendar {fmtTime(slotDate)}
      </div>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="Nome do cliente *"
        style={{ width: "100%", padding: "9px 11px", borderRadius: 7, border: `1px solid ${BORDER}`, fontSize: 13, marginBottom: 8, boxSizing: "border-box", outline: "none" }} />
      <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Telefone (opcional)"
        style={{ width: "100%", padding: "9px 11px", borderRadius: 7, border: `1px solid ${BORDER}`, fontSize: 13, marginBottom: 8, boxSizing: "border-box", outline: "none" }} />
      <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Observações (opcional)" rows={2}
        style={{ width: "100%", padding: "9px 11px", borderRadius: 7, border: `1px solid ${BORDER}`, fontSize: 13, marginBottom: 12, boxSizing: "border-box", outline: "none", resize: "none" }} />
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={save} disabled={saving}
          style={{ background: GREEN_DARK, color: "#fff", border: "none", borderRadius: 7, padding: "8px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          {saving ? "Salvando..." : "Confirmar"}
        </button>
        <button onClick={onCancel}
          style={{ background: "#fff", color: GRAY, border: `1px solid ${BORDER}`, borderRadius: 7, padding: "8px 14px", fontSize: 13, cursor: "pointer" }}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ── Tab: Agenda ───────────────────────────────────────────────────────────────
function AgendaTab() {
  const qc = useQueryClient();
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(today.getDate());
  const [bookingSlot, setBookingSlot] = useState<Date | null>(null);

  const { data: availData } = useQuery<{ settings: AvailSettings }>({
    queryKey: ["call-availability"],
    queryFn: () => apiFetch("/api/calls/availability") as Promise<{ settings: AvailSettings }>,
  });
  const { data: apptData, refetch: refetchAppts } = useQuery<{ appointments: Appointment[] }>({
    queryKey: ["call-appointments", viewYear, viewMonth],
    queryFn: () => apiFetch(`/api/calls/appointments?year=${viewYear}&month=${viewMonth + 1}`) as Promise<{ appointments: Appointment[] }>,
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/calls/appointments/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["call-appointments"] }); },
  });
  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiFetch(`/api/calls/appointments/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["call-appointments"] }); },
  });

  const settings = availData?.settings ?? { days: [1,2,3,4,5], startHour: 9, endHour: 18, slotMinutes: 60 };
  const appointments = apptData?.appointments ?? [];

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
    setSelectedDay(null); setBookingSlot(null);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
    setSelectedDay(null); setBookingSlot(null);
  };

  const weeks = buildCalendar(viewYear, viewMonth);
  const daysWithAppts = new Set(appointments.map(a => new Date(a.scheduledAt).getDate()));

  const selectedDate = selectedDay ? new Date(viewYear, viewMonth, selectedDay) : null;
  const slots = selectedDate ? generateSlots(selectedDate, settings) : [];
  const dayAppts = selectedDate
    ? appointments.filter(a => {
        const d = new Date(a.scheduledAt);
        return d.getFullYear() === viewYear && d.getMonth() === viewMonth && d.getDate() === selectedDay;
      })
    : [];

  const isToday = (d: number) => d === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();
  const isPast  = (d: number) => new Date(viewYear, viewMonth, d).setHours(23,59,59,0) < Date.now();

  return (
    <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 20, alignItems: "start" }}>
      {/* Calendar */}
      <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 14, padding: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <button onClick={prevMonth} style={{ background: "none", border: `1px solid ${BORDER}`, borderRadius: 7, width: 30, height: 30, cursor: "pointer", fontSize: 14 }}>‹</button>
          <span style={{ fontWeight: 700, fontSize: 15, color: "#111" }}>{PT_MONTHS[viewMonth]} {viewYear}</span>
          <button onClick={nextMonth} style={{ background: "none", border: `1px solid ${BORDER}`, borderRadius: 7, width: 30, height: 30, cursor: "pointer", fontSize: 14 }}>›</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 6 }}>
          {PT_DAYS.map(d => (
            <div key={d} style={{ textAlign: "center", fontSize: 11, color: GRAY, fontWeight: 600, padding: "4px 0" }}>{d}</div>
          ))}
        </div>

        {weeks.map((week, wi) => (
          <div key={wi} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
            {week.map((day, di) => {
              const sel = day === selectedDay;
              const hasAppt = day ? daysWithAppts.has(day) : false;
              const todayDay = day ? isToday(day) : false;
              const avail = day && settings.days.includes(new Date(viewYear, viewMonth, day).getDay());
              return (
                <div key={di} onClick={() => day && setDay(day)}
                  style={{
                    textAlign: "center", padding: "6px 2px", borderRadius: 7, cursor: day ? "pointer" : "default",
                    background: sel ? GREEN_DARK : todayDay ? "#f0fdf4" : "transparent",
                    color: !day ? "transparent" : sel ? "#fff" : isPast(day!) ? "#d1d5db" : "#111",
                    fontWeight: todayDay || sel ? 700 : 400, fontSize: 13, position: "relative",
                    border: todayDay && !sel ? `1px solid ${GREEN}` : "1px solid transparent",
                    opacity: day && !avail && !hasAppt ? 0.4 : 1,
                  }}>
                  {day ?? ""}
                  {hasAppt && day && (
                    <div style={{ width: 5, height: 5, borderRadius: "50%", background: sel ? "#fff" : GREEN, margin: "2px auto 0" }} />
                  )}
                </div>
              );
            })}
          </div>
        ))}

        <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${BORDER}`, display: "flex", gap: 12, fontSize: 12, color: GRAY }}>
          <span><span style={{ color: GREEN }}>●</span> Agendamentos</span>
          <span style={{ opacity: 0.5 }}>dim = indisponível</span>
        </div>
      </div>

      {/* Day detail */}
      <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 14, padding: 20, minHeight: 300 }}>
        {!selectedDate ? (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "#9ca3af" }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>📅</div>
            Selecione um dia no calendário
          </div>
        ) : (
          <>
            <div style={{ fontWeight: 700, fontSize: 16, color: "#111", marginBottom: 4 }}>
              {PT_DAYS_FULL[selectedDate.getDay()]}, {selectedDay} de {PT_MONTHS[viewMonth]}
            </div>
            <div style={{ fontSize: 13, color: GRAY, marginBottom: 18 }}>
              {slots.length === 0
                ? "Nenhum horário disponível neste dia (configure na aba Disponibilidade)"
                : `${slots.length} horário${slots.length > 1 ? "s" : ""} disponível${slots.length > 1 ? "s" : ""}`}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {slots.map(slot => {
                const booked = dayAppts.find(a => {
                  const at = new Date(a.scheduledAt);
                  return at.getHours() === slot.getHours() && at.getMinutes() === slot.getMinutes();
                });
                const isBooking = bookingSlot?.getTime() === slot.getTime();
                const s = booked ? STATUS_MAP[booked.status] ?? STATUS_MAP.pending : null;

                return (
                  <div key={slot.getTime()}>
                    <div style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "10px 14px", borderRadius: 9,
                      background: booked ? s!.bg : "#f9fafb",
                      border: `1px solid ${booked ? "#e5e7eb" : BORDER}`,
                    }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: "#111", minWidth: 42 }}>{fmtTime(slot)}</span>
                      {booked ? (
                        <>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ fontWeight: 600, fontSize: 13, color: "#111" }}>{booked.guestName}</span>
                              {booked.source === "agent" && (
                                <span style={{ background: "#eff6ff", color: "#1d4ed8", borderRadius: 20, padding: "1px 7px", fontSize: 10, fontWeight: 600 }}>via Agente</span>
                              )}
                            </div>
                            {booked.guestPhone && <div style={{ fontSize: 12, color: GRAY }}>{booked.guestPhone}</div>}
                            {booked.notes && <div style={{ fontSize: 12, color: GRAY, marginTop: 2 }}>{booked.notes}</div>}
                          </div>
                          <span style={{ background: s!.bg, color: s!.color, borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 600, border: `1px solid ${BORDER}` }}>
                            {s!.label}
                          </span>
                          {booked.roomSlug && (
                            <a href={`/call/${booked.roomSlug}?host=1`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
                              <button style={{ background: GREEN_DARK, color: "#fff", border: "none", borderRadius: 7, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>▶ Entrar</button>
                            </a>
                          )}
                          <select
                            value={booked.status}
                            onChange={e => statusMut.mutate({ id: booked.id, status: e.target.value })}
                            style={{ fontSize: 12, border: `1px solid ${BORDER}`, borderRadius: 6, padding: "4px 6px", background: "#fff", cursor: "pointer" }}>
                            <option value="pending">Pendente</option>
                            <option value="confirmed">Confirmar</option>
                            <option value="done">Concluído</option>
                            <option value="cancelled">Cancelar</option>
                          </select>
                          <button onClick={() => { if (window.confirm("Remover agendamento?")) deleteMut.mutate(booked.id); }}
                            style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 16, padding: "0 4px" }}>✕</button>
                        </>
                      ) : (
                        <>
                          <span style={{ flex: 1, fontSize: 13, color: "#9ca3af" }}>Disponível</span>
                          {!isPast(selectedDay!) && (
                            <button
                              onClick={() => setBookingSlot(isBooking ? null : slot)}
                              style={{ background: isBooking ? "#f3f4f6" : GREEN_DARK, color: isBooking ? GRAY : "#fff", border: "none", borderRadius: 7, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                              {isBooking ? "Fechar" : "+ Agendar"}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                    {isBooking && (
                      <BookingForm slotDate={slot} onCancel={() => setBookingSlot(null)} onSaved={() => { setBookingSlot(null); void refetchAppts(); }} />
                    )}
                  </div>
                );
              })}

              {slots.length === 0 && dayAppts.length === 0 && (
                <div style={{ textAlign: "center", padding: "32px 0", color: "#9ca3af", fontSize: 13 }}>
                  Configure seus dias e horários disponíveis na aba <strong>Disponibilidade</strong>.
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );

  function setDay(d: number) { setSelectedDay(d); setBookingSlot(null); }
}

// ── Tab: Disponibilidade ──────────────────────────────────────────────────────
function DisponibilidadeTab() {
  const qc = useQueryClient();
  const { data } = useQuery<{ settings: AvailSettings }>({
    queryKey: ["call-availability"],
    queryFn: () => apiFetch("/api/calls/availability") as Promise<{ settings: AvailSettings }>,
  });

  const defaults: AvailSettings = { days: [1,2,3,4,5], startHour: 9, endHour: 18, slotMinutes: 60 };
  const init = data?.settings ?? defaults;

  const [days, setDays]       = useState<number[]>(init.days);
  const [startH, setStartH]   = useState(init.startHour);
  const [endH, setEndH]       = useState(init.endHour);
  const [slot, setSlot]       = useState(init.slotMinutes);
  const [saved, setSaved]     = useState(false);

  // Sync when data loads
  const loaded = !!data;
  const [synced, setSynced] = useState(false);
  if (loaded && !synced) {
    setSynced(true);
    setDays(init.days);
    setStartH(init.startHour);
    setEndH(init.endHour);
    setSlot(init.slotMinutes);
  }

  const saveMut = useMutation({
    mutationFn: () =>
      apiFetch("/api/calls/availability", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { days, startHour: startH, endHour: endH, slotMinutes: slot } }),
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["call-availability"] }); setSaved(true); setTimeout(() => setSaved(false), 2000); },
  });

  const toggleDay = (d: number) => setDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort());

  const hours = Array.from({ length: 19 }, (_, i) => i + 5); // 5..23

  // Preview: how many slots per day
  const slotsCount = startH < endH ? Math.floor((endH - startH) * 60 / slot) : 0;

  return (
    <div style={{ maxWidth: 560 }}>
      <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 14, padding: 28 }}>
        <h3 style={{ margin: "0 0 20px", fontSize: 16, fontWeight: 700, color: "#111" }}>Horários Disponíveis</h3>

        {/* Days */}
        <div style={{ marginBottom: 24 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 10 }}>Dias da semana</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {PT_DAYS.map((name, dow) => {
              const active = days.includes(dow);
              return (
                <button key={dow} onClick={() => toggleDay(dow)}
                  style={{
                    padding: "7px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none",
                    background: active ? GREEN_DARK : "#f3f4f6",
                    color: active ? "#fff" : GRAY,
                    transition: "background 0.15s",
                  }}>
                  {name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Hours */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>Início</label>
            <select value={startH} onChange={e => setStartH(Number(e.target.value))}
              style={{ width: "100%", padding: "10px 12px", border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 14, background: "#fff", cursor: "pointer" }}>
              {hours.filter(h => h < endH).map(h => <option key={h} value={h}>{String(h).padStart(2,"0")}:00</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>Término</label>
            <select value={endH} onChange={e => setEndH(Number(e.target.value))}
              style={{ width: "100%", padding: "10px 12px", border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 14, background: "#fff", cursor: "pointer" }}>
              {hours.filter(h => h > startH).map(h => <option key={h} value={h}>{String(h).padStart(2,"0")}:00</option>)}
            </select>
          </div>
        </div>

        {/* Slot duration */}
        <div style={{ marginBottom: 24 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>Duração de cada slot</label>
          <div style={{ display: "flex", gap: 8 }}>
            {[30, 45, 60, 90].map(m => (
              <button key={m} onClick={() => setSlot(m)}
                style={{
                  padding: "8px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none",
                  background: slot === m ? GREEN_DARK : "#f3f4f6",
                  color: slot === m ? "#fff" : GRAY,
                }}>
                {m < 60 ? `${m}min` : m === 60 ? "1h" : "1h30"}
              </button>
            ))}
          </div>
        </div>

        {/* Preview */}
        {slotsCount > 0 && days.length > 0 && (
          <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "12px 16px", marginBottom: 22, fontSize: 13, color: GREEN_DARK }}>
            ✓ {slotsCount} horário{slotsCount > 1 ? "s" : ""} por dia, das {String(startH).padStart(2,"0")}:00 às {String(endH).padStart(2,"0")}:00
            {" "}em {days.length} dia{days.length > 1 ? "s" : ""} da semana
          </div>
        )}

        <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || saved}
          style={{
            background: saved ? "#10b981" : GREEN_DARK, color: "#fff", border: "none", borderRadius: 9,
            padding: "11px 28px", fontSize: 14, fontWeight: 600, cursor: "pointer", transition: "background 0.2s",
          }}>
          {saved ? "✓ Salvo!" : saveMut.isPending ? "Salvando..." : "Salvar Configurações"}
        </button>
      </div>

      <div style={{ marginTop: 16, padding: "14px 18px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, fontSize: 13, color: "#92400e" }}>
        <strong>💡 Dica:</strong> Depois de configurar, acesse a aba <strong>Agenda</strong>, selecione um dia disponível e clique em <strong>+ Agendar</strong> para criar compromissos.
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
type Tab = "salas" | "agenda" | "disponibilidade";

export function SdrCalls() {
  const [tab, setTab] = useState<Tab>("salas");

  const tabs: { id: Tab; label: string; emoji: string }[] = [
    { id: "salas",           label: "Salas Ativas",   emoji: "📹" },
    { id: "agenda",          label: "Agenda",          emoji: "📅" },
    { id: "disponibilidade", label: "Disponibilidade", emoji: "⚙️" },
  ];

  return (
    <Layout>
      <div style={{ padding: "28px 24px", maxWidth: 1000, margin: "0 auto" }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#111" }}>Chamadas de Vídeo</h1>
          <p style={{ margin: "5px 0 0", fontSize: 14, color: GRAY }}>
            Salas com link único, cobrança PIX integrada e agendamento com calendário.
          </p>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, background: "#f3f4f6", borderRadius: 12, padding: 4, marginBottom: 28, width: "fit-content" }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{
                padding: "8px 18px", borderRadius: 9, border: "none", cursor: "pointer",
                fontSize: 13, fontWeight: tab === t.id ? 700 : 500,
                background: tab === t.id ? "#fff" : "transparent",
                color: tab === t.id ? "#111" : GRAY,
                boxShadow: tab === t.id ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
                transition: "all 0.15s",
                display: "flex", alignItems: "center", gap: 6,
              }}>
              <span>{t.emoji}</span> {t.label}
            </button>
          ))}
        </div>

        {tab === "salas"           && <SalasTab />}
        {tab === "agenda"          && <AgendaTab />}
        {tab === "disponibilidade" && <DisponibilidadeTab />}
      </div>
    </Layout>
  );
}
