"""Simple thread-based background worker with retries and dead-lettering."""

from __future__ import annotations

import asyncio
import logging
import time
import uuid
from concurrent.futures import Future, ThreadPoolExecutor
from collections import deque
from typing import Any, Callable, Dict, Tuple

logger = logging.getLogger(__name__)

_executor = ThreadPoolExecutor(max_workers=4)
_tasks: Dict[str, Future] = {}
# Dead-letter queue storing failed jobs for later inspection
# Each entry: (function name, args, kwargs, exception)
dead_letter_queue: deque[Tuple[str, tuple, dict, Exception]] = deque()


def _run_with_retry(
    func: Callable[..., Any], *args: Any, retries: int = 3, backoff: int = 1, **kwargs: Any
) -> Any:
    """Execute ``func`` with retry and exponential backoff."""

    for attempt in range(1, retries + 1):
        try:
            return func(*args, **kwargs)
        except Exception as exc:  # pragma: no cover - defensive
            logger.error(
                "Background task %s failed on attempt %s/%s: %s", func.__name__, attempt, retries, exc
            )
            if attempt == retries:
                dead_letter_queue.append((func.__name__, args, kwargs, exc))
                raise
            time.sleep(backoff * attempt)


def enqueue(
    func: Callable[..., Any], *args: Any, retries: int = 3, backoff: int = 1, **kwargs: Any
) -> str:
    """Submit ``func`` to the worker and return a task id."""

    task_id = str(uuid.uuid4())
    future = _executor.submit(_run_with_retry, func, *args, retries=retries, backoff=backoff, **kwargs)
    _tasks[task_id] = future
    return task_id


async def result(task_id: str) -> Any:
    """Return the result for ``task_id`` or raise its exception."""

    future = _tasks.get(task_id)
    if future is None:
        raise KeyError(task_id)
    return await asyncio.wrap_future(future)
