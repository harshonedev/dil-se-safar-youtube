const STALE_MS = 45_000;

type PresenceStore = {
  sessions: Map<string, number>;
};

function getStore(): PresenceStore {
  const globalStore = globalThis as typeof globalThis & {
    __presence?: PresenceStore;
  };

  if (!globalStore.__presence) {
    globalStore.__presence = { sessions: new Map() };
  }

  return globalStore.__presence;
}

function prune(store: PresenceStore) {
  const now = Date.now();

  for (const [sessionId, lastSeen] of store.sessions) {
    if (now - lastSeen > STALE_MS) {
      store.sessions.delete(sessionId);
    }
  }
}

export async function POST(request: Request) {
  const body = (await request.json()) as { sessionId?: string };
  const sessionId = body.sessionId;

  if (!sessionId || typeof sessionId !== "string") {
    return Response.json({ error: "Invalid session" }, { status: 400 });
  }

  const store = getStore();
  store.sessions.set(sessionId, Date.now());
  prune(store);

  return Response.json({ count: store.sessions.size });
}

export async function GET() {
  const store = getStore();
  prune(store);

  return Response.json({ count: store.sessions.size });
}
