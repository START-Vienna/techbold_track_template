from __future__ import annotations

import asyncio
import uuid


class AgentEventBus:
    """Fans SSE events from a background agent task to one subscriber per chat.

    Events are buffered so late-connecting SSE clients receive the full history.
    """

    def __init__(self) -> None:
        self._queues: dict[uuid.UUID, asyncio.Queue[dict | None]] = {}
        self._buffers: dict[uuid.UUID, list[dict | None]] = {}

    def subscribe(self, chat_id: uuid.UUID) -> asyncio.Queue[dict | None]:
        """Register an SSE listener, replaying all buffered events first."""
        q: asyncio.Queue[dict | None] = asyncio.Queue()
        for event in self._buffers.get(chat_id, []):
            q.put_nowait(event)
        self._queues[chat_id] = q
        return q

    async def publish(self, chat_id: uuid.UUID, event: dict) -> None:
        """Buffer and publish an event. Late subscribers will receive it on subscribe()."""
        self._buffers.setdefault(chat_id, []).append(event)
        if q := self._queues.get(chat_id):
            await q.put(event)

    async def close(self, chat_id: uuid.UUID) -> None:
        """Buffer the sentinel None and unregister the live queue."""
        self._buffers.setdefault(chat_id, []).append(None)
        if q := self._queues.get(chat_id):
            await q.put(None)
        self._queues.pop(chat_id, None)

    def is_subscribed(self, chat_id: uuid.UUID) -> bool:
        return chat_id in self._queues


agent_event_bus = AgentEventBus()
