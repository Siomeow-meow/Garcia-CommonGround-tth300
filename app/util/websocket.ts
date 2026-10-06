import { apiRequest, type ApiMessage } from "@/app/lib/api";
import { getConversations } from "@/app/lib/conversation";

const OPEN = 1;
const CLOSED = 3;
const POLL_INTERVAL = 2500;

let status = CLOSED;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let knownMessageIds = new Set<number>();
const statusListeners: ((status: number) => void)[] = [];
let messageListeners: ((data: { type: "message"; message: ApiMessage }) => void)[] = [];

function updateStatus(nextStatus: number) {
  status = nextStatus;
  statusListeners.forEach((listener) => listener(status));
}

function publish(message: ApiMessage) {
  messageListeners.forEach((listener) => listener({ type: "message", message }));
}

async function pollMessages() {
  try {
    const conversations = await getConversations();
    for (const conversation of conversations) {
      for (const message of conversation.messages ?? []) {
        const id = Number(message.id);
        if (!knownMessageIds.has(id)) {
          knownMessageIds.add(id);
          publish(message);
        }
      }
    }
    updateStatus(OPEN);
  } catch {
    updateStatus(CLOSED);
  }
}

export async function connectChat(_userId: string) {
  if (pollTimer) clearInterval(pollTimer);
  knownMessageIds = new Set<number>();
  try {
    const conversations = await getConversations();
    for (const conversation of conversations) {
      for (const message of conversation.messages ?? []) {
        knownMessageIds.add(Number(message.id));
      }
    }
    updateStatus(OPEN);
    pollTimer = setInterval(() => void pollMessages(), POLL_INTERVAL);
  } catch {
    updateStatus(CLOSED);
  }
}

export function disconnectChat() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  knownMessageIds.clear();
  updateStatus(CLOSED);
}

export function onConnectionStatusChange(listener: (status: number) => void) {
  statusListeners.push(listener);
  listener(status);
}

export async function sendMessage(content: string, _senderId: string, receiverId: string) {
  const result = await apiRequest<{ message: ApiMessage }>("messages.send", {
    body: { content, receiverId },
  });
  knownMessageIds.add(Number(result.message.id));
  publish(result.message);
  return result.message;
}

export function onMessage(listener: (data: { type: "message"; message: ApiMessage }) => void) {
  messageListeners.push(listener);
  return () => {
    messageListeners = messageListeners.filter((item) => item !== listener);
  };
}