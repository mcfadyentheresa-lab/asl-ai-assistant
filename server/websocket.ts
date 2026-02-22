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

interface ProjectClient {
  ws: WebSocket;
  userId: string;
  firstName: string;
  lastName: string;
  role: string;
  profileImageUrl: string | null;
}

interface ProjectRoom {
  clients: Map<WebSocket, ProjectClient>;
}

const projectRooms = new Map<number, ProjectRoom>();

function getOrCreateProjectRoom(projectId: number): ProjectRoom {
  let room = projectRooms.get(projectId);
  if (!room) {
    room = { clients: new Map() };
    projectRooms.set(projectId, room);
  }
  return room;
}

function broadcastProjectPresence(projectId: number) {
  const room = projectRooms.get(projectId);
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

  const msg = JSON.stringify({ type: "project:presence", users: uniqueUsers });
  Array.from(room.clients.entries()).forEach(([ws]) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  });
}

function broadcastProjectUpdate(projectId: number, sourceWs: WebSocket, message: string) {
  const room = projectRooms.get(projectId);
  if (!room) return;
  Array.from(room.clients.entries()).forEach(([ws]) => {
    if (ws !== sourceWs && ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  });
}

function removeFromProjectRoom(ws: WebSocket, projectId: number) {
  const room = projectRooms.get(projectId);
  if (!room) return;
  room.clients.delete(ws);
  if (room.clients.size === 0) {
    projectRooms.delete(projectId);
  } else {
    broadcastProjectPresence(projectId);
  }
}

export function broadcastProjectChange(projectId: number, resources: string[], action: string, entityId?: number, sourceUserId?: string) {
  const room = projectRooms.get(projectId);
  if (!room) return;

  let sourceFirstName = "";
  if (sourceUserId) {
    const clients = Array.from(room.clients.values());
    const match = clients.find(c => c.userId === sourceUserId);
    if (match) sourceFirstName = match.firstName;
  }

  const msg = JSON.stringify({
    type: "project:update",
    resources,
    action,
    entityId,
    sourceUserId,
    sourceFirstName,
  });

  Array.from(room.clients.entries()).forEach(([ws]) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  });
}

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws: WebSocket, _req: IncomingMessage) => {
    let currentBoardId: number | null = null;
    let clientInfo: BoardClient | null = null;
    let currentProjectId: number | null = null;

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

          case "project:join": {
            const projectId = Number(msg.projectId);
            if (!projectId || !msg.userId) return;

            if (currentProjectId !== null) {
              removeFromProjectRoom(ws, currentProjectId);
            }

            currentProjectId = projectId;
            const projRoom = getOrCreateProjectRoom(projectId);
            projRoom.clients.set(ws, {
              ws,
              userId: msg.userId,
              firstName: msg.firstName || "",
              lastName: msg.lastName || "",
              role: msg.role || "",
              profileImageUrl: msg.profileImageUrl || null,
            });
            broadcastProjectPresence(projectId);
            log(`User ${msg.firstName} ${msg.lastName} joined project ${projectId}`, "ws");
            break;
          }

          case "project:leave": {
            if (currentProjectId !== null) {
              removeFromProjectRoom(ws, currentProjectId);
              log(`User left project ${currentProjectId}`, "ws");
              currentProjectId = null;
            }
            break;
          }

          case "project:update": {
            if (currentProjectId !== null) {
              broadcastProjectUpdate(currentProjectId, ws, JSON.stringify(msg));
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
      if (currentProjectId !== null) {
        removeFromProjectRoom(ws, currentProjectId);
      }
    });
  });

  log("WebSocket server ready on /ws", "ws");
}
