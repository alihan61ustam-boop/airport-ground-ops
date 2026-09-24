#!/usr/bin/env python3
"""
Airport Ground Data Fetcher & Server
Fetches airport runways, taxiways, aprons and parking positions from OpenStreetMap Overpass API
and outputs clean GeoJSON, plus provides a local HTTP server for the web application.
"""

import sys
import os
import json
import urllib.request
import urllib.parse
import http.server
import socketserver
import webbrowser

AIRPORTS = {
    "LTFJ": {"name": "Istanbul Sabiha Gokcen", "lat": 40.8986, "lon": 29.3092, "radius": 4000},
    "LTFM": {"name": "Istanbul Airport", "lat": 41.2753, "lon": 28.7519, "radius": 7000},
    "LTAI": {"name": "Antalya Airport", "lat": 36.8987, "lon": 30.8005, "radius": 4500},
    "LTAC": {"name": "Ankara Esenboga", "lat": 40.1281, "lon": 32.9951, "radius": 4500},
    "LTBJ": {"name": "Izmir Adnan Menderes", "lat": 38.2924, "lon": 27.1570, "radius": 4000},
    "EDDF": {"name": "Frankfurt Airport", "lat": 50.0379, "lon": 8.5622, "radius": 6000},
    "EGLL": {"name": "London Heathrow", "lat": 51.4700, "lon": -0.4543, "radius": 6000},
    "KJFK": {"name": "New York JFK", "lat": 40.6413, "lon": -73.7781, "radius": 6000}
}

OVERPASS_SERVERS = [
    "https://overpass-api.de/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter"
]

def build_overpass_query(lat, lon, radius=4000):
    query = f"""
    [out:json][timeout:45];
    (
      node["aeroway"~"parking_position|gate"](around:{radius},{lat},{lon});
      way["aeroway"~"runway|taxiway|apron|parking_position"](around:{radius},{lat},{lon});
      relation["aeroway"~"runway|taxiway|apron"](around:{radius},{lat},{lon});
    );
    out body;
    >;
    out skel qt;
    """
    return query.strip()

def osm_to_geojson(osm_data):
    nodes = {}
    for el in osm_data.get("elements", []):
        if el["type"] == "node":
            nodes[el["id"]] = (el["lon"], el["lat"])

    features = []
    for el in osm_data.get("elements", []):
        tags = el.get("tags", {})
        aeroway = tags.get("aeroway")
        if not aeroway:
            continue

        props = {
            "id": el["id"],
            "type": el["type"],
            "aeroway": aeroway,
            "ref": tags.get("ref", tags.get("name", "")),
            "name": tags.get("name", ""),
            "surface": tags.get("surface", ""),
            "width": tags.get("width", ""),
            "length": tags.get("length", ""),
            "tags": tags
        }

        if el["type"] == "node":
            lon, lat = el["lon"], el["lat"]
            features.append({
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [lon, lat]},
                "properties": props
            })
        elif el["type"] == "way":
            coord_list = [nodes[nid] for nid in el.get("nodes", []) if nid in nodes]
            if len(coord_list) < 2:
                continue

            # If closed way and aeroway in apron or parking_position or tagged as area
            is_closed = (coord_list[0] == coord_list[-1]) and len(coord_list) >= 4
            if is_closed and (aeroway in ["apron", "parking_position"] or tags.get("area") == "yes"):
                geom_type = "Polygon"
                coords = [coord_list]
            else:
                geom_type = "LineString"
                coords = coord_list

            features.append({
                "type": "Feature",
                "geometry": {"type": geom_type, "coordinates": coords},
                "properties": props
            })

    return {
        "type": "FeatureCollection",
        "features": features
    }

def fetch_airport_data(icao):
    icao = icao.upper()
    if icao not in AIRPORTS:
        print(f"Unknown ICAO: {icao}. Available: {list(AIRPORTS.keys())}")
        return None

    info = AIRPORTS[icao]
    print(f"Fetching {icao} ({info['name']}) around ({info['lat']}, {info['lon']}) radius {info['radius']}m...")
    query = build_overpass_query(info["lat"], info["lon"], info["radius"])
    
    encoded_data = urllib.parse.urlencode({"data": query}).encode("utf-8")
    req = urllib.request.Request(
        OVERPASS_SERVERS[0],
        data=encoded_data,
        headers={"User-Agent": "AirportGroundOps/1.0 (Educational/Aviation Research)"}
    )

    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            content = resp.read().decode("utf-8")
            raw_osm = json.loads(content)
            geojson = osm_to_geojson(raw_osm)
            return geojson
    except Exception as e:
        print(f"Error fetching from primary server: {e}")
        # Try second server
        try:
            req = urllib.request.Request(OVERPASS_SERVERS[1], data=encoded_data, headers={"User-Agent": "AirportGroundOps/1.0"})
            with urllib.request.urlopen(req, timeout=60) as resp:
                content = resp.read().decode("utf-8")
                raw_osm = json.loads(content)
                return osm_to_geojson(raw_osm)
        except Exception as e2:
            print(f"Error on fallback server: {e2}")
            return None

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(script_dir)

    if len(sys.argv) > 1 and sys.argv[1] == "--serve":
        port = int(sys.argv[2]) if len(sys.argv) > 2 else 8000
        print(f"Starting local server at http://localhost:{port}")
        webbrowser.open(f"http://localhost:{port}")
        with socketserver.TCPServer(("", port), http.server.SimpleHTTPRequestHandler) as httpd:
            print("Press Ctrl+C to stop.")
            httpd.serve_forever()
        return

    target_icao = sys.argv[1].upper() if len(sys.argv) > 1 else "LTFJ"
    geojson = fetch_airport_data(target_icao)
    if geojson:
        out_path = os.path.join(script_dir, "data", f"{target_icao.lower()}.geojson")
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(geojson, f, indent=2, ensure_ascii=False)
        print(f"Successfully saved {len(geojson['features'])} features to {out_path}!")

if __name__ == "__main__":
    main()
