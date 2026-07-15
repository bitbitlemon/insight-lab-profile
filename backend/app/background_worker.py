import asyncio
import logging
import signal
from contextlib import suppress

from .services.background import initialize_runtime, start_background_services, stop_background_services

logging.basicConfig(level=logging.INFO)
_log = logging.getLogger(__name__)


async def main() -> None:
    initialize_runtime()
    tasks = await start_background_services()
    stop_event = asyncio.Event()
    loop = asyncio.get_running_loop()

    for sig in (signal.SIGINT, signal.SIGTERM):
        with suppress(NotImplementedError):
            loop.add_signal_handler(sig, stop_event.set)

    _log.info("background worker started")
    try:
        await stop_event.wait()
    finally:
        _log.info("background worker stopping")
        await stop_background_services(tasks)


if __name__ == "__main__":
    asyncio.run(main())
