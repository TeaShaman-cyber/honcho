#!/usr/bin/env python3
"""Hermes Python MCP SDK 2.3.0 compatibility probe for a disposable server.

This is not a live Hermes runtime test and does not access user memory.
The HTTP endpoint is a loopback-only, synthetic bearer conformance adapter.
"""
from __future__ import annotations

import argparse
import asyncio

import httpx2
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client


async def probe(url: str, mode: str) -> None:
    async with httpx2.AsyncClient(timeout=10, headers={"Authorization": "Bearer conformance-local-only"}) as client:
        async with streamable_http_client(url, http_client=client) as streams:
            async with ClientSession(streams[0], streams[1]) as session:
                if mode == "legacy":
                    initialized = await session.initialize()
                    if initialized.protocol_version != "2025-11-25":
                        raise AssertionError(
                            f"legacy handshake advertised {initialized.protocol_version}"
                        )
                else:
                    discovered = await session.discover()
                    if "2026-07-28" not in discovered.supported_versions:
                        raise AssertionError(
                            f"modern protocol absent: {discovered.supported_versions}"
                        )

                tools = await session.list_tools()
                names = {tool.name for tool in tools.tools}
                if "search" not in names:
                    raise AssertionError("Honcho search tool absent")
                print(f"HERMES_MCP_2_3_0_{mode.upper()}=PASS tools={len(names)}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--url", default="http://127.0.0.1:3001/mcp",
        help="Synthetic bearer-protected loopback conformance adapter URL",
    )
    args = parser.parse_args()
    if not args.url.startswith("http://127.0.0.1:"):
        raise SystemExit("Only loopback IPv4 HTTP URLs are allowed in this probe")
    asyncio.run(probe(args.url, "legacy"))
    asyncio.run(probe(args.url, "modern"))


if __name__ == "__main__":
    main()
