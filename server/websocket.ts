import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import type { IncomingMessage } from "http";
import { log } from "./index";

interface BoardClient {
  ws: WebSocket;
  userId: string;
  firstName: string;
  lastName: string;
  role: string;
  profileImageUrl: string | null;
}

interface BoardRoom {
  clients: Map<WebSocket, BoardClient>;
}

const rooms = new Map<number, BoardRoom>();

function getOrCreateRoom(boardId: number): BoardRoom {
  let room = rooms.get(boardId);
  if (!room) {
    room = { clients: new Map() };
    rooms.set(boardId, room);
  }
  return room;
}

function broadcastPresence(boardId: number) {
  const room = rooms.get(boardId);
  if (!room) return;

  const users = Array.from(room.clients.values()).map((c) => ({
    userId: c.userId,
    firstName: c.firstName,
    lastName: c.lastName,
    role: c.role,
    profileImageUrl: c.profileImageUrl,
  }));

  const uniqueUsers = Array.from(
    new Map(users.map((u) => [u.userId, u])).values()
  );

  const msg = JSON.stringify({ type: "presence:update", users: uniqueUsers });
  Array.from(room.clients.entries()).forEach(([ws]) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  });
}

function broadcastToOthers(boardId: number, sourceWs: WebSocket, message: string) {
  const room = rooms.get(boardId);
  if (!room) return;
  Array.from(room.clients.entries()).forEach(([ws]) => {
    if (ws !== sourceWs && ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  });
}

function removeFromRoom(ws: WebSocket, boardId: number) {
  const room = rooms.get(boardId);
  if (!room) return;
  room.clients.delete(ws);
  if (room.clients.size === 0) {
    rooms.delete(boardId);
  } else {
    broadcastPresence(boardId);
  }
}

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws: WebSocket, _req: IncomingMessage) => {
    let currentBoardId: number | null = null;
    let clientInfo: BoardClient | null = null;

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        switch (msg.type) {
          case "join": {
            const boardId = Number(msg.boardId);
            if (!boardId || !msg.userId) return;

            if (currentBoardId !== null) {
              removeFromRoom(ws, currentBoardId);
            }

            currentBoardId = boardId;
            const room = getOrCreateRoom(boardId);
            clientInfo = {
              ws,
              userId: msg.userId,
              firstName: msg.firstName || "",
              lastName: msg.lastName || "",
              role: msg.role || "",
              profileImageUrl: msg.profileImageUrl || null,
            };
            room.clients.set(ws, clientInfo);
            broadcastPresence(boardId);
            log(`User ${msg.firstName} ${msg.lastName} joined board ${boardId}`, "ws");
            break;
          }

          case "element:add":
          case "element:update":
          case "element:remove":
          case "element:move":
          case "elements:positions": {
            if (currentBoardId === null || !clientInfo) return;
            broadcastToOthers(
              currentBoardId,
              ws,
              JSON.stringify({
                ...msg,
                sourceUserId: clientInfo.userId,
                sourceFirstName: clientInfo.firstName,
                sourceLastName: clientInfo.lastName,
              })
            );
            break;
          }

          case "cursor:move": {
            if (currentBoardId === null || !clientInfo) return;
            broadcastToOthers(
              currentBoardId,
              ws,
              JSON.stringify({
                type: "cursor:move",
                userId: clientInfo.userId,
                firstName: clientInfo.firstName,
                lastName: clientInfo.lastName,
                x: msg.x,
                y: msg.y,
              })
            );
            break;
          }

          case "ping": {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "pong" }));
            }
            break;
          }

          case "leave": {
            if (currentBoardId !== null) {
              removeFromRoom(ws, currentBoardId);
              log(`User left board ${currentBoardId}`, "ws");
              currentBoardId = null;
              clientInfo = null;
            }
            break;
          }
        }
      } catch (_err) {
        // ignore malformed messages
      }
    });

    ws.on("close", () => {
      if (currentBoardId !== null) {
        removeFromRoom(ws, currentBoardId);
      }
    });
  });

  log("WebSocket server ready on /ws", "ws");
}
