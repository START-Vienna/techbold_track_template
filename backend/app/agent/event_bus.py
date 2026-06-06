from __future__ import annotations

import asyncio
import uuid


class AgentEventBus:
    """Pure live fan-out from a background agent task to all active subscribers per chat.

    Historical messages are served from the DB via GET /api/chats/{chat_id}/messages.
    This bus only delivers events to currently connected subscribers.
    """

    def __init__(self) -> None:
        self._queues: dict[uuid.UUID, list[asyncio.Queue[dict | None]]] = {}

    def subscribe(self, chat_id: uuid.UUID) -> asyncio.Queue[dict | None]:
        """Register an SSE listener. Receives only events published after this call."""
        q: asyncio.Queue[dict | None] = asyncio.Queue()
        self._queues.setdefault(chat_id, []).append(q)
        return q

    def unsubscribe(self, chat_id: uuid.UUID, q: asyncio.Queue[dict | None]) -> None:
        """Remove a specific subscriber queue without affecting others."""
        queues = self._queues.get(chat_id)
        if queues is not None:
            try:
                queues.remove(q)
            except ValueError:
                pass
            if not queues:
                self._queues.pop(chat_id, None)

    async def publish(self, chat_id: uuid.UUID, event: dict) -> None:
        """Publish an event to all active subscribers."""
        for q in self._queues.get(chat_id, []):
            await q.put(event)

    async def close(self, chat_id: uuid.UUID) -> None:
        """Signal all active subscribers to stop, then clear the entry."""
        for q in self._queues.get(chat_id, []):
            await q.put(None)
        self._queues.pop(chat_id, None)

    def is_subscribed(self, chat_id: uuid.UUID) -> bool:
        return bool(self._queues.get(chat_id))


agent_event_bus = AgentEventBus()
