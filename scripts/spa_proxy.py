#!/usr/bin/env python3
from __future__ import annotations

import argparse
import mimetypes
import os
import posixpath
import urllib.error
import urllib.parse
import urllib.request
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


HOP_BY_HOP_HEADERS = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
}

API_PREFIXES = (
    "/api/",
    "/docs",
    "/redoc",
    "/openapi.json",
)


class SpaProxyHandler(BaseHTTPRequestHandler):
    server_version = "InsightLabWeb/1.0"

    def do_GET(self) -> None:
        self._handle()

    def do_HEAD(self) -> None:
        self._handle(head_only=True)

    def do_POST(self) -> None:
        self._handle()

    def do_PUT(self) -> None:
        self._handle()

    def do_PATCH(self) -> None:
        self._handle()

    def do_DELETE(self) -> None:
        self._handle()

    def do_OPTIONS(self) -> None:
        self._handle()

    def _handle(self, *, head_only: bool = False) -> None:
        parsed = urllib.parse.urlsplit(self.path)
        path = parsed.path or "/"
        if self._is_backend_path(path):
            self._proxy_to_backend(head_only=head_only)
            return
        self._serve_spa(path, head_only=head_only)

    def _is_backend_path(self, path: str) -> bool:
        return any(path == prefix.rstrip("/") or path.startswith(prefix) for prefix in API_PREFIXES)

    def _serve_spa(self, path: str, *, head_only: bool) -> None:
        dist_dir: Path = self.server.dist_dir  # type: ignore[attr-defined]
        safe_path = posixpath.normpath(urllib.parse.unquote(path)).lstrip("/")
        if safe_path.startswith("../"):
            self.send_error(HTTPStatus.BAD_REQUEST)
            return

        candidate = dist_dir / safe_path
        if path == "/" or not candidate.is_file():
            candidate = dist_dir / "index.html"

        if not candidate.is_file():
            self.send_error(HTTPStatus.SERVICE_UNAVAILABLE, "frontend dist is missing")
            return

        content_type = mimetypes.guess_type(str(candidate))[0] or "application/octet-stream"
        stat = candidate.stat()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(stat.st_size))
        self.send_header("Last-Modified", self.date_time_string(stat.st_mtime))
        if candidate.name == "index.html":
            self.send_header("Cache-Control", "no-cache")
        elif "/assets/" in f"/{safe_path}":
            self.send_header("Cache-Control", "public, max-age=31536000, immutable")
        self.end_headers()
        if not head_only:
            with candidate.open("rb") as fh:
                self.wfile.write(fh.read())

    def _proxy_to_backend(self, *, head_only: bool) -> None:
        backend_base: str = self.server.backend_base  # type: ignore[attr-defined]
        target = urllib.parse.urljoin(backend_base.rstrip("/") + "/", self.path.lstrip("/"))
        body = None
        content_length = self.headers.get("Content-Length")
        if content_length:
            body = self.rfile.read(int(content_length))

        headers = {
            key: value
            for key, value in self.headers.items()
            if key.lower() not in HOP_BY_HOP_HEADERS and key.lower() != "host"
        }
        headers["X-Forwarded-Host"] = self.headers.get("Host", "")
        headers["X-Forwarded-Proto"] = "https"

        request = urllib.request.Request(target, data=body, headers=headers, method=self.command)
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                self.send_response(response.status)
                for key, value in response.headers.items():
                    if key.lower() not in HOP_BY_HOP_HEADERS:
                        self.send_header(key, value)
                self.end_headers()
                if not head_only:
                    self.wfile.write(response.read())
        except urllib.error.HTTPError as exc:
            self.send_response(exc.code)
            for key, value in exc.headers.items():
                if key.lower() not in HOP_BY_HOP_HEADERS:
                    self.send_header(key, value)
            self.end_headers()
            if not head_only:
                self.wfile.write(exc.read())
        except Exception:
            self.send_error(HTTPStatus.BAD_GATEWAY, "backend unavailable")

    def log_message(self, fmt: str, *args: object) -> None:
        print(f"{self.log_date_time_string()} {self.address_string()} {fmt % args}", flush=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default=os.environ.get("INSIGHT_WEB_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("INSIGHT_WEB_PORT", "8081")))
    parser.add_argument("--dist", default=os.environ.get("INSIGHT_WEB_DIST", "/home/ubuntu/insight-lab-profile/frontend/dist"))
    parser.add_argument("--backend", default=os.environ.get("INSIGHT_WEB_BACKEND", "http://127.0.0.1:8080"))
    args = parser.parse_args()

    server = ThreadingHTTPServer((args.host, args.port), SpaProxyHandler)
    server.dist_dir = Path(args.dist).resolve()  # type: ignore[attr-defined]
    server.backend_base = args.backend  # type: ignore[attr-defined]
    print(f"serving {server.dist_dir} on http://{args.host}:{args.port}, proxying API to {args.backend}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
