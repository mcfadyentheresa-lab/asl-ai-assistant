import { useEffect, useRef, useCallback, useState } from "react";
import { useCanvasStore } from "@/stores/canvas-store";
import type { CanvasElement } from "@shared/schema";

interface BoardUser {
  userId: string;
  firstName: string;
  lastName: string;
  role: string;
  profileImageUrl: string | null;
}

interface CursorPosition {
  userId: string;
  firstName: string;
  lastName: string;
  x: number;
  y: number;
  color: string;
}

export interface ActiveEdit {
  elementId: number;
  userId: string;
  firstName: string;
  lastName: string;
  color: string;
  expiresAt: number;
}

const COLLABORATOR_COLORS = [
  "#ef4444",
  "#3b82f6",
  "#f59e0b",
  "#10b981",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#f97316",
];

function getUserColor(userId: string, colorMap: Map<string, string>): string {
  if (colorMap.has(userId)) return colorMap.get(userId)!;
  const color = COLLABORATOR_COLORS[colorMap.size % COLLABORATOR_COLORS.length];
  colorMap.set(userId, color);
  return color;
}

export function useBoardRealtime(
  boardId: number | null,
  user: { id: string; firstName?: string | null; lastName?: string | null; role?: string; profileImageUrl?: string | null } | null | undefined
) {
  const wsRef = useRef<WebSocket | null>(null);
  const [collaborators, setCollaborators] = useState<BoardUser[]>([]);
  const [cursors, setCursors] = useState<Record<string, CursorPosition>>({});
  const [activeEdits, setActiveEdits] = useState<Record<number, ActiveEdit>>({});
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isConnectedRef = useRef(false);
  const colorMapRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setActiveEdits((prev) => {
        const next: Record<number, ActiveEdit> = {};
        let changed = false;
        for (const [key, edit] of Object.entries(prev)) {
          if (edit.expiresAt > now) {
            next[Number(key)] = edit;
          } else {
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 500);
    return () => clearInterval(interval);
  }, []);

  const trackEdit = useCallback((elementId: number, userId: string, firstName: string, lastName: string) => {
    // Don't pin a "you edited this" pill on your own elements when the
    // server echoes our own edit back. Other users' edits still show.
    if (userId === user?.id) return;
    const color = getUserColor(userId, colorMapRef.current);
    setActiveEdits((prev) => ({
      ...prev,
      [elementId]: {
        elementId,
        userId,
        firstName,
        lastName,
        color,
        expiresAt: Date.now() + 3000,
      },
    }));
  }, [user?.id]);

  const lastPongRef = useRef<number>(Date.now());
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const connectRef = useRef<() => void>(() => {});

  const forceReconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      try { wsRef.current.close(); } catch {}
      wsRef.current = null;
    }
    isConnectedRef.current = false;
    connectRef.current();
  }, []);

  const connect = useCallback(() => {
    if (!boardId || !user) return;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;
    if (wsRef.current && wsRef.current.readyState === WebSocket.CONNECTING) return;

    if (wsRef.current) {
      try { wsRef.current.close(); } catch {}
      wsRef.current = null;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      // If the user has already switched to a different board between the
      // time we kicked off this WS and the time it connected, bail out.
      // Without this guard, the late `onopen` for the old board fetches
      // its elements and overwrites the new board's (empty) canvas with
      // the old board's content — exactly the "first board populates the
      // new board" bug.
      if (wsRef.current !== ws) {
        try { ws.close(); } catch {}
        return;
      }
      isConnectedRef.current = true;
      lastPongRef.current = Date.now();
      ws.send(JSON.stringify({
        type: "join",
        boardId,
        userId: user.id,
        firstName: user.firstName || "",
        lastName: user.lastName || "",
        role: user.role || "",
        profileImageUrl: user.profileImageUrl || null,
      }));
      fetch(`/api/planning-boards/${boardId}/elements`, { credentials: "include" })
        .then((r) => r.json())
        .then((els: CanvasElement[]) => {
          if (!Array.isArray(els)) return;
          // Double-guard against the race: by the time the fetch resolves
          // the user may have moved to another board. Only write into the
          // store if (a) this WS is still the active one AND (b) the
          // store's currently-loaded boardId matches the boardId we
          // fetched for.
          if (wsRef.current !== ws) return;
          if (useCanvasStore.getState().boardId !== boardId) return;
          useCanvasStore.getState().setElements(els);
        })
        .catch(() => {});
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === "pong") {
          lastPongRef.current = Date.now();
          return;
        }

        const store = useCanvasStore.getState();
        const srcName = msg.sourceFirstName || "";
        const srcLast = msg.sourceLastName || "";
        const srcId = msg.sourceUserId || "";

        // Drop any element-mutation messages that arrive on a stale WS
        // (one whose boardId no longer matches the active board). Without
        // this, late messages from a previous board would mutate the new
        // board's store.
        const isStale =
          wsRef.current !== ws ||
          useCanvasStore.getState().boardId !== boardId;

        switch (msg.type) {
          case "presence:update": {
            const otherUsers = (msg.users as BoardUser[]).filter((u) => u.userId !== user.id);
            otherUsers.forEach((u) => getUserColor(u.userId, colorMapRef.current));
            if (!isStale) setCollaborators(otherUsers);
            break;
          }

          case "element:add":
            if (isStale) break;
            if (msg.element) {
              store.addElement(msg.element as CanvasElement);
              if (srcId) trackEdit(msg.element.id, srcId, srcName, srcLast);
            }
            break;

          case "element:update":
            if (isStale) break;
            if (msg.elementId && msg.updates) {
              store.updateElement(msg.elementId, msg.updates);
              if (srcId) trackEdit(msg.elementId, srcId, srcName, srcLast);
            }
            break;

          case "element:remove":
            if (isStale) break;
            if (msg.elementId) {
              store.removeElement(msg.elementId);
            }
            break;

          case "element:move":
            if (isStale) break;
            if (msg.elementId != null && msg.x != null && msg.y != null) {
              store.moveElement(msg.elementId, msg.x, msg.y);
              if (srcId) trackEdit(msg.elementId, srcId, srcName, srcLast);
            }
            break;

          case "elements:positions":
            if (isStale) break;
            if (msg.updates && Array.isArray(msg.updates)) {
              msg.updates.forEach((u: any) => {
                const el = store.elements[u.id];
                if (el) {
                  store.updateElement(u.id, {
                    x: u.x,
                    y: u.y,
                    width: u.width,
                    height: u.height,
                    zIndex: u.zIndex,
                    parentColumnId: u.parentColumnId,
                  });
                  if (srcId) trackEdit(u.id, srcId, srcName, srcLast);
                }
              });
            }
            break;

          case "cursor:move": {
            // Never render our own cursor pill — that's just noise (the
            // user already knows where their own pointer is). The server
            // echoes cursor messages back to the sender by default, so we
            // filter on the client side here.
            if (msg.userId === user.id) break;
            if (isStale) break;
            const cursorColor = getUserColor(msg.userId, colorMapRef.current);
            setCursors((prev) => ({
              ...prev,
              [msg.userId]: {
                userId: msg.userId,
                firstName: msg.firstName,
                lastName: msg.lastName,
                x: msg.x,
                y: msg.y,
                color: cursorColor,
              },
            }));
            break;
          }
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.onclose = () => {
      isConnectedRef.current = false;
      wsRef.current = null;
      setCollaborators([]);
      setCursors({});
      setActiveEdits({});
      if (boardId) {
        reconnectTimeoutRef.current = setTimeout(connect, 2000);
      }
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [boardId, user, trackEdit]);

  connectRef.current = connect;

  useEffect(() => {
    connect();

    if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
    pingIntervalRef.current = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "ping" }));
        if (Date.now() - lastPongRef.current > 15000) {
          forceReconnect();
        }
      } else if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED) {
        connect();
      }
    }, 5000);

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          connect();
        } else {
          wsRef.current.send(JSON.stringify({ type: "ping" }));
          setTimeout(() => {
            if (Date.now() - lastPongRef.current > 6000) {
              forceReconnect();
            }
          }, 2000);
        }
      }
    };

    const handleOnline = () => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        connect();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("online", handleOnline);
    window.addEventListener("focus", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("focus", handleVisibility);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        if (wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: "leave" }));
        }
        wsRef.current.close();
        wsRef.current = null;
      }
      isConnectedRef.current = false;
      setCollaborators([]);
      setCursors({});
      setActiveEdits({});
    };
  }, [connect, forceReconnect]);

  const sendElementAdd = useCallback((element: CanvasElement) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "element:add", element }));
    }
  }, []);

  const sendElementUpdate = useCallback((elementId: number, updates: Partial<CanvasElement>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "element:update", elementId, updates }));
    }
  }, []);

  const sendElementRemove = useCallback((elementId: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "element:remove", elementId }));
    }
  }, []);

  const sendElementMove = useCallback((elementId: number, x: number, y: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "element:move", elementId, x, y }));
    }
  }, []);

  const sendPositionsUpdate = useCallback((updates: { id: number; x: number; y: number; width: number; height: number; zIndex: number; parentColumnId: number | null }[]) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "elements:positions", updates }));
    }
  }, []);

  const sendCursorMove = useCallback((x: number, y: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "cursor:move", x, y }));
    }
  }, []);

  const getCollaboratorColor = useCallback((userId: string) => {
    return getUserColor(userId, colorMapRef.current);
  }, []);

  return {
    collaborators,
    cursors,
    activeEdits,
    getCollaboratorColor,
    sendElementAdd,
    sendElementUpdate,
    sendElementRemove,
    sendElementMove,
    sendPositionsUpdate,
    sendCursorMove,
  };
}
