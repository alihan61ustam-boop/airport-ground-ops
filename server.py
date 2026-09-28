#!/usr/bin/env python3
"""
Airport Ground Ops - Local HTTP Server & OpenSky ADS-B API Proxy
================================================================
Serves static application files and provides a cached proxy to OpenSky Network
ADS-B live flight states API (15-second cache to prevent 429 rate-limiting).

Endpoints:
  - GET / : Serves index.html and static web assets
  - GET /api/live-flights : Returns OpenSky ADS-B flights in Istanbul TMA (40.7-41.4N, 28.4-29.6E)
  - GET /api/health : Server health status and cache telemetry
"""

import http.server
import socketserver
import urllib.request
import urllib.error
import json
import time
import os
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get("PORT", 8080))
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

OPENSKY_URL = "https://opensky-network.org/api/states/all?lamin=40.7&lomin=28.4&lamax=41.4&lomax=29.6"
CACHE_TTL = 15.0  # OpenSky rate limit safety buffer (15 seconds)

# In-memory proxy cache
_cache = {
    "timestamp": 0,
    "status": "init",
    "raw_json": None,
    "parsed_count": 0,
    "hits": 0,
    "misses": 0
}

def fetch_opensky_states():
    """Fetches live ADS-B states from OpenSky with proper user agent."""
    now = time.time()
    
    # Return valid in-memory cache if younger than TTL
    if _cache["raw_json"] and (now - _cache["timestamp"]) < CACHE_TTL:
        _cache["hits"] += 1
        return _cache["raw_json"], "HIT"
    
    _cache["misses"] += 1
    req = urllib.request.Request(
        OPENSKY_URL,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) GroundOpsAviation/2.0",
            "Accept": "application/json"
        }
    )
    
    try:
        with urllib.request.urlopen(req, timeout=8) as response:
            if response.status == 200:
                raw_bytes = response.read()
                data = json.loads(raw_bytes.decode("utf-8"))
                states = data.get("states") or []
                _cache["timestamp"] = now
                _cache["status"] = "live"
                _cache["parsed_count"] = len(states)
                _cache["raw_json"] = json.dumps({
                    "source": "OpenSky Network Live ADS-B",
                    "time": data.get("time", int(now)),
                    "cachedAt": int(now),
                    "count": len(states),
                    "states": states
                }).encode("utf-8")
                return _cache["raw_json"], "LIVE_FETCH"
    except urllib.error.HTTPError as e:
        print(f"[OpenSky Proxy] HTTP Error {e.code}: {e.reason}", file=sys.stderr)
        if _cache["raw_json"]:
            return _cache["raw_json"], f"STALE_FALLBACK_HTTP_{e.code}"
    except Exception as e:
        print(f"[OpenSky Proxy] Network Error: {e}", file=sys.stderr)
        if _cache["raw_json"]:
            return _cache["raw_json"], "STALE_FALLBACK_NETWORK_ERR"
            
    # Generate realistic live mock states for Istanbul if OpenSky is rate-limited or unreachable
    fallback_time = int(now)
    mock_states = [
        ["4b8211", "THY1985 ", "Turkey", fallback_time, fallback_time, 28.742, 41.265, 0, True, 14.2, 172.0, 0, None, 0, "1000", False, 0],
        ["4b8302", "THY4WF  ", "Turkey", fallback_time, fallback_time, 28.738, 41.271, 15, True, 18.0, 168.0, 0, None, 15, "1000", False, 0],
        ["4b9105", "PGT2140 ", "Turkey", fallback_time, fallback_time, 29.314, 40.902, 0, True, 12.0, 62.0, 0, None, 0, "1000", False, 0],
        ["4b928a", "AJT4022 ", "Turkey", fallback_time, fallback_time, 29.309, 40.898, 0, True, 10.5, 58.0, 0, None, 0, "1000", False, 0],
        ["4b840f", "THY7VM  ", "Turkey", fallback_time, fallback_time, 28.751, 41.258, 120, False, 138.0, 160.0, -3.2, None, 120, "1000", False, 0],
        ["4b8590", "THY92K  ", "Turkey", fallback_time, fallback_time, 28.730, 41.280, 450, False, 165.0, 340.0, 8.5, None, 450, "1000", False, 0],
        ["4005e2", "BAW676  ", "United Kingdom", fallback_time, fallback_time, 28.748, 41.260, 0, True, 0, 90.0, 0, None, 0, "1000", False, 0],
        ["89648c", "UAE122  ", "United Arab Emirates", fallback_time, fallback_time, 28.745, 41.268, 0, True, 15.0, 170.0, 0, None, 0, "1000", False, 0],
        ["3c64c2", "DLH1298 ", "Germany", fallback_time, fallback_time, 28.740, 41.262, 0, True, 0, 270.0, 0, None, 0, "1000", False, 0],
        ["760a12", "SIA392  ", "Singapore", fallback_time, fallback_time, 28.755, 41.255, 300, False, 150.0, 160.0, -2.8, None, 300, "1000", False, 0]
    ]
    
    mock_payload = json.dumps({
        "source": "OpenSky Synthetic Real-Time TMA Feed (Fallback)",
        "time": fallback_time,
        "cachedAt": fallback_time,
        "count": len(mock_states),
        "states": mock_states
    }).encode("utf-8")
    
    return mock_payload, "SYNTHETIC_FALLBACK"


class GroundOpsRequestHandler(http.server.SimpleHTTPRequestHandler):
    """Custom request handler with CORS support and API proxying."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def do_OPTIONS(self):
        """Handle CORS pre-flight requests."""
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Range")
        self.end_headers()

    def do_GET(self):
        """Route API calls or serve static files."""
        # API: OpenSky Live Flights
        if self.path.startswith("/api/live-flights") or self.path.startswith("/api/opensky"):
            body, cache_tag = fetch_opensky_states()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
            self.send_header("X-Proxy-Cache", cache_tag)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        # API: Server Health & Telemetry
        if self.path.startswith("/api/health"):
            health = {
                "status": "healthy",
                "uptime": time.time(),
                "opensky": {
                    "lastFetch": _cache["timestamp"],
                    "cacheAgeSec": round(time.time() - _cache["timestamp"], 1) if _cache["timestamp"] > 0 else None,
                    "status": _cache["status"],
                    "cachedFlightCount": _cache["parsed_count"],
                    "hits": _cache["hits"],
                    "misses": _cache["misses"]
                }
            }
            body = json.dumps(health, indent=2).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        # Serve static web assets
        super().do_GET()


def run_server():
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), GroundOpsRequestHandler) as httpd:
        print("=" * 65)
        print("  AIRPORT GROUND OPS - LIVE AVIATION & TRAFFIC SERVER")
        print("=" * 65)
        print(f"  > Web App URL:      http://localhost:{PORT}/index.html")
        print(f"  > Live ADS-B Proxy: http://localhost:{PORT}/api/live-flights")
        print(f"  > Health Telemetry: http://localhost:{PORT}/api/health")
        print(f"  > OpenSky Region:   Istanbul TMA (40.7-41.4 N, 28.4-29.6 E)")
        print(f"  > Rate-Limit Cache: 15 seconds in-memory TTL")
        print("=" * 65)
        print("Sunucu calisiyor. Durdurmak icin Ctrl+C tuslarina basin.\n")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nSunucu kapatildi.")


if __name__ == "__main__":
    run_server()
