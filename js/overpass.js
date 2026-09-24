/**
 * Overpass API Client & Airport Registry
 * Focused exclusively on Sabiha Gökçen (LTFJ) and İstanbul Havalimanı (LTFM).
 */

const AIRPORT_REGISTRY = {
  LTFJ: { 
    icao: "LTFJ", 
    iata: "SAW", 
    name: "İstanbul Sabiha Gökçen Uluslararası Havalimanı", 
    country: "Türkiye", 
    lat: 40.8986, 
    lon: 29.3092, 
    radius: 3500 
  },
  LTFM: { 
    icao: "LTFM", 
    iata: "IST", 
    name: "İstanbul Havalimanı (Arnavutköy)", 
    country: "Türkiye", 
    lat: 41.2753, 
    lon: 28.7519, 
    radius: 7000 
  }
};

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter"
];

class AirportDataService {
  /**
   * Fetches airport GeoJSON from local cache (data/*.geojson) or live Overpass API.
   */
  static async loadAirportData(icao) {
    icao = icao.toUpperCase();
    if (icao !== "LTFJ" && icao !== "LTFM") {
      icao = "LTFJ"; // Default to Sabiha Gokcen
    }
    
    // First, load from local cached GeoJSON (instant response, zero latency)
    try {
      const localResp = await fetch(`data/${icao.toLowerCase()}.geojson`);
      if (localResp.ok) {
        const geojson = await localResp.json();
        console.log(`[DataService] Loaded ${icao} from local cache (${geojson.features?.length} elements).`);
        return { source: "local", data: geojson };
      }
    } catch (e) {
      console.warn("Local file fetch fallback:", e);
    }

    // Fallback to Overpass API
    const airportInfo = AIRPORT_REGISTRY[icao];
    const liveGeoJSON = await this.queryOverpass(airportInfo.lat, airportInfo.lon, airportInfo.radius);
    return { source: "overpass_live", data: liveGeoJSON };
  }

  static async queryOverpass(lat, lon, radius = 4000) {
    const query = `
      [out:json][timeout:50];
      (
        node["aeroway"~"parking_position|gate"](around:${radius},${lat},${lon});
        way["aeroway"~"runway|taxiway|apron|parking_position"](around:${radius},${lat},${lon});
        relation["aeroway"~"runway|taxiway|apron"](around:${radius},${lat},${lon});
      );
      out body;
      >;
      out skel qt;
    `.trim();

    let lastError = null;
    for (const endpoint of OVERPASS_ENDPOINTS) {
      try {
        const bodyParams = new URLSearchParams();
        bodyParams.append("data", query);

        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
          body: bodyParams
        });

        if (!response.ok) {
          throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
        }

        const osmData = await response.json();
        return this.convertOsmToGeoJSON(osmData);
      } catch (err) {
        console.warn(`Overpass query failed on ${endpoint}:`, err);
        lastError = err;
      }
    }

    throw new Error(`Overpass API'den veri alınamadı. Hata: ${lastError?.message || "Sunucuya ulaşılamadı"}`);
  }

  static convertOsmToGeoJSON(osmData) {
    const nodes = {};
    const elements = osmData.elements || [];

    for (const el of elements) {
      if (el.type === "node") {
        nodes[el.id] = [el.lon, el.lat];
      }
    }

    const features = [];
    for (const el of elements) {
      const tags = el.tags || {};
      const aeroway = tags.aeroway;
      if (!aeroway) continue;

      const props = {
        id: el.id,
        osmType: el.type,
        aeroway: aeroway,
        ref: tags.ref || tags.name || `ID-${el.id}`,
        name: tags.name || tags.ref || "",
        surface: tags.surface || "asphalt",
        width: tags.width || "",
        length: tags.length || "",
        tags: tags
      };

      if (el.type === "node") {
        features.push({
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [el.lon, el.lat]
          },
          properties: props
        });
      } else if (el.type === "way") {
        const nodeIds = el.nodes || [];
        const coords = [];
        for (const nid of nodeIds) {
          if (nodes[nid]) coords.push(nodes[nid]);
        }
        if (coords.length < 2) continue;

        const isClosed = coords.length >= 4 && coords[0][0] === coords[coords.length - 1][0] && coords[0][1] === coords[coords.length - 1][1];
        let geomType = "LineString";
        let finalCoords = coords;

        if (isClosed && (aeroway === "apron" || aeroway === "parking_position" || tags.area === "yes")) {
          geomType = "Polygon";
          finalCoords = [coords];
        }

        features.push({
          type: "Feature",
          geometry: {
            type: geomType,
            coordinates: finalCoords
          },
          properties: props
        });
      }
    }

    return {
      type: "FeatureCollection",
      features: features
    };
  }
}
