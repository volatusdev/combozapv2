import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage, Server } from "http";
import type { Socket } from "net";
import { logger } from "./logger.js";

interface RoomPeer {
  ws: WebSocket;
  name: string;
  isHost: boolean;
  peerId: string;
  status: "lobby" | "admitted";
}

const rooms = new Map<string, Map<string, RoomPeer>>();

export function setupCallSignaling(server: Server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req: IncomingMessage, socket: Socket, head: Buffer) => {
    const url = req.url ?? "";
    const match = url.match(/^\/api\/calls\/ws\/([a-z0-9-]+)$/);
    if (!match) { socket.destroy(); return; }
    const slug = match[1];
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req, slug);
    });
  });

  wss.on("connection", (ws: WebSocket, _req: IncomingMessage, slug: string) => {
    const peerId = Math.random().toString(36).slice(2, 10);
    let peerName = "Participante";
    let isHost = false;

    if (!rooms.has(slug)) rooms.set(slug, new Map());
    const room = rooms.get(slug)!;

    const send = (data: object) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
    };

    const sendTo = (targetId: string, data: object) => {
      const target = room.get(targetId);
      if (target?.ws.readyState === WebSocket.OPEN) {
        target.ws.send(JSON.stringify(data));
      }
    };

    const broadcastAdmitted = (data: object, excludeId?: string) => {
      room.forEach((peer, id) => {
        if (id === excludeId) return;
        if (peer.status !== "admitted") return;
        if (peer.ws.readyState === WebSocket.OPEN) {
          peer.ws.send(JSON.stringify(data));
        }
      });
    };

    const getHost = (): RoomPeer | undefined => {
      for (const [, peer] of room) {
        if (peer.isHost && peer.status === "admitted") return peer;
      }
      return undefined;
    };

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as Record<string, unknown>;
        const type = msg.type as string;

        switch (type) {
          case "join": {
            peerName = ((msg.name as string) ?? "").trim() || "Participante";
            isHost = !!(msg.isHost as boolean);

            if (isHost) {
              room.set(peerId, { ws, name: peerName, isHost: true, peerId, status: "admitted" });

              const admittedPeers = [...room.values()]
                .filter(p => p.peerId !== peerId && p.status === "admitted")
                .map(p => ({ peerId: p.peerId, name: p.name, isHost: p.isHost }));

              const lobbyPeers = [...room.values()]
                .filter(p => p.peerId !== peerId && p.status === "lobby")
                .map(p => ({ peerId: p.peerId, name: p.name }));

              send({ type: "joined", peerId, status: "admitted", admittedPeers, lobbyPeers });

              broadcastAdmitted({ type: "peer-joined", peerId, name: peerName, isHost: true }, peerId);
              logger.info({ slug, peerId, peerName }, "Host joined call room");
            } else {
              room.set(peerId, { ws, name: peerName, isHost: false, peerId, status: "lobby" });
              send({ type: "joined", peerId, status: "lobby" });

              const host = getHost();
              if (host) sendTo(host.peerId, { type: "join-request", peerId, name: peerName });
              logger.info({ slug, peerId, peerName }, "Guest waiting in lobby");
            }
            break;
          }

          case "admit": {
            const self = room.get(peerId);
            if (!self?.isHost) break;

            const targetId = msg.peerId as string;
            const target = room.get(targetId);
            if (!target || target.status !== "lobby") break;

            target.status = "admitted";

            const admittedPeers = [...room.values()]
              .filter(p => p.peerId !== targetId && p.status === "admitted")
              .map(p => ({ peerId: p.peerId, name: p.name, isHost: p.isHost }));

            sendTo(targetId, { type: "admitted", admittedPeers });

            broadcastAdmitted(
              { type: "peer-joined", peerId: targetId, name: target.name, isHost: false },
              targetId,
            );
            logger.info({ slug, targetId, name: target.name }, "Guest admitted to call");
            break;
          }

          case "reject": {
            const self = room.get(peerId);
            if (!self?.isHost) break;

            const targetId = msg.peerId as string;
            const target = room.get(targetId);
            if (!target || target.status !== "lobby") break;

            sendTo(targetId, { type: "rejected" });
            room.delete(targetId);
            target.ws.close();
            logger.info({ slug, targetId }, "Guest rejected");
            break;
          }

          case "kick": {
            const self = room.get(peerId);
            if (!self?.isHost) break;

            const targetId = msg.peerId as string;
            const target = room.get(targetId);
            if (!target) break;

            sendTo(targetId, { type: "kicked" });
            room.delete(targetId);
            broadcastAdmitted({ type: "peer-left", peerId: targetId, name: target.name }, targetId);
            target.ws.close();
            logger.info({ slug, targetId }, "Peer kicked");
            break;
          }

          case "offer":
          case "answer":
          case "ice-candidate": {
            const targetId = msg.to as string;
            if (!targetId) break;
            const target = room.get(targetId);
            if (target?.ws.readyState === WebSocket.OPEN) {
              target.ws.send(JSON.stringify({ ...msg, from: peerId }));
            }
            break;
          }

          case "chat": {
            const self = room.get(peerId);
            if (self?.status !== "admitted") break;
            const text = ((msg.text as string) ?? "").slice(0, 500);
            if (!text) break;
            const chatMsg = { type: "chat", from: peerId, name: peerName, text, ts: Date.now() };
            broadcastAdmitted(chatMsg, peerId);
            break;
          }

          case "pix": {
            const self = room.get(peerId);
            if (!self?.isHost) break;
            const pixMsg = {
              type: "pix",
              url: msg.url,
              qrCodeImage: msg.qrCodeImage,
              valueCents: msg.valueCents,
              description: msg.description,
            };
            broadcastAdmitted(pixMsg, peerId);
            break;
          }
        }
      } catch (err) {
        logger.warn({ err }, "WS signaling parse error");
      }
    });

    ws.on("close", () => {
      const peer = room.get(peerId);
      if (!peer) return;
      room.delete(peerId);
      if (peer.status === "admitted") {
        broadcastAdmitted({ type: "peer-left", peerId, name: peerName }, peerId);
      }
      if (room.size === 0) {
        rooms.delete(slug);
        logger.info({ slug }, "Call room closed");
      }
    });

    ws.on("error", (err) => {
      logger.warn({ err, slug, peerId }, "WS peer error");
    });
  });

  logger.info("WebRTC signaling server attached");
}
