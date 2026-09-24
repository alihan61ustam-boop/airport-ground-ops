/**
 * Airport Ground Ops - Core Application Logic (v4)
 * Optimized for Sabiha Gökçen (LTFJ) and İstanbul Havalimanı (LTFM).
 * Features:
 * - Dynamic glowing blue route polyline on clicking an aircraft.
 * - Live Aircraft HUD with real-time speed, altitude, heading & active taxiway (A4, B4A, B4B, C5A, N1, T11).
 * - Real-time synchronization between map stand occupancy and right sidebar list/counts.
 * - Zero-watermark tile scaling (maxNativeZoom: 16).
 */

let map = null;
let currentIcao = "LTFJ";
let rawAirportGeoJSON = null;
let standsMap = new Map(); // standId -> { feature, marker, customData }
let activeStandId = null;

// Layer groups
let runwayLayerGroup = null;
let taxiwayLayerGroup = null;
let apronLayerGroup = null;
let standLayerGroup = null;
let taxiRouteHighlightLayerGroup = null; // Glowing blue taxi route

// Traffic simulator & selection state
let trafficSim = null;
let selectedFlightId = null;
let isCameraFollowing = false;
let isUserScrubbingTimeline = false;
let blueRoutePolyline = null;
let blueDestMarker = null;

document.addEventListener("DOMContentLoaded", () => {
  initMap();
  setupUIEvents();
  setupHUDControls();
  setupTimelineControls();
  loadAirport("LTFJ");
});

function initMap() {
  map = L.map("map", {
    zoomControl: false,
    minZoom: 11,
    maxZoom: 20
  }).setView([40.8986, 29.3092], 15);

  window.map = map;
  window.standsMap = standsMap;

  L.control.zoom({ position: "topright" }).addTo(map);

  // 1. ESRI Dark Gray Canvas (with maxNativeZoom: 16 so zoom scales cleanly without watermark)
  const darkCanvas = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}", {
    attribution: '&copy; Esri, HERE, Garmin, &copy; OpenStreetMap contributors',
    maxNativeZoom: 16,
    maxZoom: 20
  }).addTo(map);

  // 2. High Resolution ESRI Satellite Imagery
  const satelliteBasemap = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    attribution: '&copy; Esri, Maxar, Earthstar Geographics',
    maxZoom: 19
  });

  // 3. OpenStreetMap Standard
  const osmStandard = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19
  });

  // Vector feature layers
  apronLayerGroup = L.layerGroup().addTo(map);
  runwayLayerGroup = L.layerGroup().addTo(map);
  taxiwayLayerGroup = L.layerGroup().addTo(map);
  standLayerGroup = L.layerGroup().addTo(map);
  taxiRouteHighlightLayerGroup = L.layerGroup().addTo(map);

  const baseMaps = {
    "Karanlık Radar (Dark Canvas)": darkCanvas,
    "Uydu Görüntüsü (Satellite)": satelliteBasemap,
    "Açık Harita (OSM Standard)": osmStandard
  };

  const overlayMaps = {
    "Pistler (Runways)": runwayLayerGroup,
    "Taksi Yolları (Taxiways)": taxiwayLayerGroup,
    "Apron Alanları": apronLayerGroup,
    "Park Pozisyonları (Stands)": standLayerGroup,
    "Rota Vurgusu (Blue Route)": taxiRouteHighlightLayerGroup
  };

  L.control.layers(baseMaps, overlayMaps, { position: "topright" }).addTo(map);

  // Deselect on clicking empty map
  map.on("click", () => {
    // Only deselect if not clicking an aircraft or stand
    if (selectedFlightId && !isCameraFollowing) {
      clearAircraftSelection();
    }
  });
}

function setupUIEvents() {
  // Tab switching
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-pane").forEach(p => p.classList.remove("active"));

      btn.classList.add("active");
      const targetPane = document.getElementById(btn.dataset.tab);
      if (targetPane) targetPane.classList.add("active");
    });
  });

  // Airport dropdown selection (LTFJ or LTFM)
  const selectElem = document.getElementById("airportSelect");
  selectElem.addEventListener("change", (e) => {
    const icao = e.target.value;
    if (icao) loadAirport(icao);
  });

  // Refresh airport button
  document.getElementById("btnRefreshAirport").addEventListener("click", () => {
    loadAirport(selectElem.value || "LTFJ");
  });

  // Stand search input filter
  document.getElementById("standSearchInput").addEventListener("input", (e) => {
    renderStandsList(e.target.value);
  });

  // Stand filter chips
  document.querySelectorAll(".chip").forEach(chip => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      renderStandsList(document.getElementById("standSearchInput").value);
    });
  });

  // Stand Editor Form submit
  document.getElementById("standEditForm").addEventListener("submit", (e) => {
    e.preventDefault();
    saveActiveStandData();
  });

  // Reset/Clear stand button
  document.getElementById("btnResetStand").addEventListener("click", () => {
    resetActiveStandData();
  });

  // Flightradar24 CSV/JSON file import
  const frFileInput = document.getElementById("fileImportFlightradar");
  document.getElementById("btnImportFlightradar").addEventListener("click", () => frFileInput.click());
  frFileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const isCSV = file.name.toLowerCase().endsWith(".csv");
    const reader = new FileReader();
    reader.onload = (evt) => {
      const success = trafficSim.loadFlightradarData(evt.target.result, isCSV);
      if (success) {
        showToast(`${trafficSim.flights.length} adet Flightradar uçuşu simülasyona yüklendi!`);
      } else {
        showToast("Dosya ayrıştırılamadı. Geçerli bir Flightradar CSV/JSON yükleyin.");
      }
    };
    reader.readAsText(file);
  });

  // Export JSON
  document.getElementById("btnExportJSON").addEventListener("click", exportOpsDataJSON);
  
  // Export GeoJSON
  document.getElementById("btnExportGeoJSON").addEventListener("click", exportAirportGeoJSON);

  // Import JSON backup
  const fileInput = document.getElementById("fileImportJSON");
  document.getElementById("btnImportJSON").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", handleFileImport);

  // Clear all data
  document.getElementById("btnClearAllData").addEventListener("click", () => {
    if (confirm("Bu havalimanı için işlenmiş tüm uçuş ve park verileri silinecek. Emin misiniz?")) {
      localStorage.removeItem(`airport_ops_${currentIcao}`);
      loadStoredData();
      refreshAllStandMarkers();
      renderStandsList();
      updateStatistics();
      showToast("Tüm stand verileri temizlendi.");
    }
  });
}

/**
 * Setup Live Aircraft HUD Controls
 */
function setupHUDControls() {
  const btnClose = document.getElementById("btnHudClose");
  const btnFollow = document.getElementById("btnHudFollow");

  btnClose.addEventListener("click", () => {
    clearAircraftSelection();
  });

  btnFollow.addEventListener("click", () => {
    isCameraFollowing = !isCameraFollowing;
    btnFollow.classList.toggle("active", isCameraFollowing);
    if (isCameraFollowing) {
      showToast("Kamera uçağı takip ediyor.");
    }
  });
}

/**
 * Selects an aircraft, displays the glowing blue route and opens the live HUD
 */
function selectAircraft(flightId) {
  if (!trafficSim) return;
  const flight = trafficSim.flights.find(f => f.id === flightId);
  if (!flight) return;

  selectedFlightId = flightId;
  window.selectedFlightId = flightId;

  // Open HUD Panel
  const hud = document.getElementById("aircraftHUD");
  hud.classList.remove("hidden");

  // Populate Header
  document.getElementById("hudCallsign").textContent = flight.callsign;
  document.getElementById("hudAirline").textContent = (AIRLINE_LIVERIES[flight.airline]?.name || flight.airline);
  document.getElementById("hudReg").textContent = `${flight.registration} (${flight.type})`;
  document.getElementById("hudDestStand").textContent = `Stand ${flight.standRef}`;
  document.getElementById("hudRoute").textContent = `${flight.origin} ➔ ${flight.destination}`;

  // Draw Glowing Blue Route Polyline
  drawBlueTaxiRoute(flight);

  // Bring marker to focus
  map.panTo([flight.lat, flight.lon], { animate: true, duration: 0.5 });
}
window.selectAircraft = selectAircraft;

function clearAircraftSelection() {
  selectedFlightId = null;
  window.selectedFlightId = null;
  isCameraFollowing = false;

  const btnFollow = document.getElementById("btnHudFollow");
  if (btnFollow) btnFollow.classList.remove("active");

  const hud = document.getElementById("aircraftHUD");
  if (hud) hud.classList.add("hidden");

  taxiRouteHighlightLayerGroup.clearLayers();
  blueRoutePolyline = null;
  blueDestMarker = null;

  // Refresh markers to remove selection glow
  if (trafficSim) {
    trafficSim.activeAircraftMarkers.forEach((marker, id) => {
      const flight = trafficSim.flights.find(f => f.id === id);
      if (flight) AircraftMarkerManager.updateMarkerPosition(marker, flight);
    });
  }
}

/**
 * Draws or updates the glowing blue taxi route polyline for the selected aircraft
 */
function drawBlueTaxiRoute(flight) {
  taxiRouteHighlightLayerGroup.clearLayers();

  const coords = flight.remainingRoute && flight.remainingRoute.length > 1
    ? flight.remainingRoute
    : (flight.fullRoute || [[flight.lat, flight.lon]]);

  // Outer glow line
  const outerGlow = L.polyline(coords, {
    color: "#00e5ff",
    weight: 8,
    opacity: 0.35,
    lineCap: "round",
    lineJoin: "round"
  });

  // Inner sharp route line
  blueRoutePolyline = L.polyline(coords, {
    color: "#00e5ff",
    weight: 4,
    opacity: 0.95,
    dashArray: "10, 8",
    lineCap: "round",
    lineJoin: "round"
  });

  // Destination point marker
  const destCoord = coords[coords.length - 1];
  blueDestMarker = L.circleMarker(destCoord, {
    radius: 7,
    color: "#00e5ff",
    fillColor: "#00e5ff",
    fillOpacity: 0.8,
    weight: 3
  }).bindTooltip(`<b>Hedef: Stand ${flight.standRef}</b>`, { permanent: true, direction: "top", offset: [0, -10] });

  taxiRouteHighlightLayerGroup.addLayer(outerGlow);
  taxiRouteHighlightLayerGroup.addLayer(blueRoutePolyline);
  taxiRouteHighlightLayerGroup.addLayer(blueDestMarker);
}

/**
 * Updates Live HUD telemetry every tick as the simulation runs
 */
function updateLiveHUD(flight) {
  if (!flight) return;

  const hud = document.getElementById("aircraftHUD");
  if (!hud || hud.classList.contains("hidden")) return;

  document.getElementById("hudSpeed").textContent = Math.round(flight.speed || 0);
  document.getElementById("hudAlt").textContent = Math.round(flight.altitude || 0);
  document.getElementById("hudHeading").textContent = Math.round(flight.heading || 0);

  const phaseElem = document.getElementById("hudPhase");
  const phaseTitles = {
    approaching: "Son Yaklaşma",
    landing: "Piste İniş",
    taxi_in: "Taksi Yapıyor",
    on_stand: "Park Pozisyonunda",
    pushback: "Geri İtme (Pushback)",
    taxi_out: "Piste Taksi",
    holding: "Pist Beklemede (Hold)",
    queued: "Sırada Bekliyor",
    takeoff: "Kalkış Koşusu",
    departed: "Ayrıldı"
  };
  phaseElem.textContent = phaseTitles[flight.phase] || flight.phase;

  // Active taxiway
  document.getElementById("hudCurrentTwy").textContent = flight.currentTwyName || "Taksi Yolu";

  // Sequence tags
  renderHUDSequenceTags(flight);

  // Update glowing blue route polyline dynamically as plane moves
  if (blueRoutePolyline && flight.remainingRoute && flight.remainingRoute.length > 1) {
    blueRoutePolyline.setLatLngs(flight.remainingRoute);
  }

  // Camera follow
  if (isCameraFollowing && map) {
    map.panTo([flight.lat, flight.lon], { animate: false });
  }
}

function renderHUDSequenceTags(flight) {
  const container = document.getElementById("hudTaxiSequence");
  if (!container || !flight.twySequence) return;

  const curTwy = flight.currentTwyName || "";
  let html = "";
  let passedCurrent = false;

  flight.twySequence.forEach(name => {
    let cls = "";
    if (name === curTwy || curTwy.includes(name)) {
      cls = "active";
      passedCurrent = true;
    } else if (!passedCurrent) {
      cls = "done";
    }
    if (name.includes("Stand") || name.includes("RWY")) {
      cls += " dest";
    }
    html += `<span class="twy-tag ${cls}">${name}</span>`;
  });

  container.innerHTML = html;
}

/**
 * Real-time callback triggered when simulation changes stand occupancy
 */
function onStandOccupancyChanged() {
  const currentSearch = document.getElementById("standSearchInput")?.value || "";
  renderStandsList(currentSearch);
  updateStatistics();

  if (activeStandId && standsMap.has(activeStandId)) {
    const standObj = standsMap.get(activeStandId);
    if (!standObj.customData.manual) {
      updateEditorFields(standObj);
    }
  }
}
window.onStandOccupancyChanged = onStandOccupancyChanged;

/**
 * Bottom Timeline Bar Controls
 */
function setupTimelineControls() {
  trafficSim = new GroundTrafficSimulator(currentIcao);
  trafficSim.start();

  const btnPlay = document.getElementById("btnPlayPause");
  const slider = document.getElementById("timelineSlider");
  const clock = document.getElementById("digitalClock");

  btnPlay.addEventListener("click", () => {
    if (trafficSim.isPlaying) {
      trafficSim.pause();
      btnPlay.textContent = "▶";
      btnPlay.title = "Oynat";
    } else {
      trafficSim.start();
      btnPlay.textContent = "⏸";
      btnPlay.title = "Duraklat";
    }
  });

  // Speed multiplier buttons
  document.querySelectorAll(".speed-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".speed-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const speed = parseInt(btn.dataset.speed, 10) || 15;
      trafficSim.setSpeed(speed);
      showToast(`Simülasyon hızı: ${speed}x`);
    });
  });

  // Slider dragging
  slider.addEventListener("mousedown", () => { isUserScrubbingTimeline = true; });
  slider.addEventListener("touchstart", () => { isUserScrubbingTimeline = true; });

  slider.addEventListener("input", (e) => {
    const sec = parseInt(e.target.value, 10);
    trafficSim.setTime(sec);
    clock.textContent = trafficSim.formatTime(sec);
  });

  const stopScrubbing = () => { isUserScrubbingTimeline = false; };
  window.addEventListener("mouseup", stopScrubbing);
  window.addEventListener("touchend", stopScrubbing);

  // Simulation tick callback
  trafficSim.onTick((data) => {
    clock.textContent = data.timeFormatted;
    if (!isUserScrubbingTimeline) {
      slider.value = Math.floor(data.simSeconds);
    }

    // Traffic metrics
    const c = data.counts;
    document.getElementById("trafficTotalDay").textContent = data.totalFlightsInSchedule || 0;
    document.getElementById("trafficApproaching").textContent = c.approaching;
    document.getElementById("trafficTaxiing").textContent = c.taxiing;
    document.getElementById("trafficOnStand").textContent = c.on_stand;
    document.getElementById("trafficTakeoff").textContent = c.takeoff;

    // Live HUD refresh if an aircraft is currently selected
    if (selectedFlightId) {
      const activeFlight = data.activeFlights?.find(f => f.id === selectedFlightId);
      if (activeFlight) {
        updateLiveHUD(activeFlight);
      }
    }
  });
}

/**
 * Loads airport features and renders layers
 */
async function loadAirport(icao) {
  icao = (icao === "LTFM") ? "LTFM" : "LTFJ";
  currentIcao = icao;
  clearAircraftSelection();
  updateStatus("Veri yükleniyor...", "loading");

  try {
    const result = await AirportDataService.loadAirportData(icao);
    rawAirportGeoJSON = result.data;

    // 1. Build connected taxiway graph for dynamic zero-air-cutting routing
    if (window.TaxiwayGraphRouter) {
      window.TaxiwayGraphRouter.buildFromGeoJSON(rawAirportGeoJSON, icao);
    }

    renderAirportFeatures(rawAirportGeoJSON);
    loadStoredData();
    renderStandsList();
    updateStatistics();

    if (trafficSim) {
      trafficSim.setAirport(icao);
    }

    const count = rawAirportGeoJSON.features?.length || 0;
    const name = icao === "LTFM" ? "İstanbul Havalimanı (IST)" : "Sabiha Gökçen (SAW)";
    updateStatus(`${name} - ${count} Unsur Yüklendi`, "ready");
    showToast(`${name} pistleri, taksi yolları ve canlı trafiği hazır.`);
  } catch (err) {
    console.error("Airport load failed:", err);
    updateStatus("Yükleme hatası", "error");
    showToast(err.message || "Havalimanı verisi çekilemedi.");
  }
}

/**
 * Parses GeoJSON and draws Runways, Taxiways, Aprons and Stands
 */
function renderAirportFeatures(geojson) {
  runwayLayerGroup.clearLayers();
  taxiwayLayerGroup.clearLayers();
  apronLayerGroup.clearLayers();
  standLayerGroup.clearLayers();
  taxiRouteHighlightLayerGroup.clearLayers();
  standsMap.clear();

  let bounds = L.latLngBounds();

  geojson.features.forEach(feature => {
    const props = feature.properties || {};
    const geom = feature.geometry;
    const aeroway = props.aeroway;

    // 1. Apron Polygons
    if (aeroway === "apron") {
      const layer = L.geoJSON(feature, {
        style: {
          color: "#475569",
          weight: 1,
          fillColor: "#1e293b",
          fillOpacity: 0.65
        }
      });
      apronLayerGroup.addLayer(layer);
      extendBounds(bounds, geom);
    }
    // 2. Runways (Pistler)
    else if (aeroway === "runway") {
      const isPolygon = geom.type === "Polygon";
      const layer = L.geoJSON(feature, {
        style: {
          color: "#0f172a",
          weight: isPolygon ? 2 : 20,
          fillColor: "#182234",
          fillOpacity: 0.95,
          opacity: 0.95
        }
      });

      if (!isPolygon) {
        const centerLine = L.geoJSON(feature, {
          style: {
            color: "#ffffff",
            weight: 2.5,
            dashArray: "14, 14",
            opacity: 0.95
          }
        });
        runwayLayerGroup.addLayer(centerLine);
      }

      layer.bindTooltip(`<b>PİST: ${props.ref || props.name || "Runway"}</b><br>Yüzey: ${props.surface || "Asfalt"}`, {
        sticky: true
      });
      runwayLayerGroup.addLayer(layer);
      extendBounds(bounds, geom);
    }
    // 3. Taxiways (Taksi Yolları)
    else if (aeroway === "taxiway") {
      const layer = L.geoJSON(feature, {
        style: {
          color: "#f59e0b",
          weight: 3.5,
          opacity: 0.85
        }
      });
      layer.bindTooltip(`Taksi Yolu: <b>${props.ref || props.name || "TWY"}</b>`, {
        sticky: true
      });
      taxiwayLayerGroup.addLayer(layer);
      extendBounds(bounds, geom);
    }
    // 4. Parking Positions / Gates (Park Pozisyonları)
    else if (aeroway === "parking_position" || aeroway === "gate") {
      if (geom.type === "Point") {
        const [lon, lat] = geom.coordinates;
        bounds.extend([lat, lon]);

        const standId = `stand_${props.id || Math.random().toString(36).substr(2, 9)}`;
        const standRef = props.ref || props.name || `#${props.id}`;

        const standObj = {
          id: standId,
          ref: standRef,
          lat: lat,
          lon: lon,
          feature: feature,
          customData: {
            status: "free",
            flight: "",
            aircraft: "",
            timeIn: "",
            timeOut: "",
            notes: "",
            manual: false
          }
        };

        const marker = createStandMarker(standObj);
        standObj.marker = marker;
        standLayerGroup.addLayer(marker);
        standsMap.set(standId, standObj);
      }
    }
  });

  if (bounds.isValid()) {
    map.fitBounds(bounds, { padding: [30, 30] });
  }
}

function extendBounds(bounds, geom) {
  if (geom.type === "Point") {
    bounds.extend([geom.coordinates[1], geom.coordinates[0]]);
  } else if (geom.type === "LineString") {
    geom.coordinates.forEach(c => bounds.extend([c[1], c[0]]));
  } else if (geom.type === "Polygon") {
    geom.coordinates[0].forEach(c => bounds.extend([c[1], c[0]]));
  }
}

function createStandMarker(standObj) {
  const custom = standObj.customData;
  const statusClass = custom.status || "free";
  const subText = custom.flight ? `<span class="stand-marker-sub">${custom.flight}</span>` : "";

  const icon = L.divIcon({
    className: "stand-custom-icon",
    html: `
      <div id="marker_${standObj.id}" class="stand-marker-badge ${statusClass}">
        <span>${standObj.ref}</span>
        ${subText}
      </div>
    `,
    iconSize: [42, 26],
    iconAnchor: [21, 13]
  });

  const marker = L.marker([standObj.lat, standObj.lon], { icon: icon });

  marker.on("click", () => {
    selectStand(standObj.id);
  });

  updateMarkerTooltip(marker, standObj);
  return marker;
}

function updateMarkerTooltip(marker, standObj) {
  const c = standObj.customData;
  const statusLabels = {
    free: "BOŞ",
    occupied: "DOLU",
    boarding: "BORDİNG",
    maintenance: "BAKIMDA",
    nightstop: "YATILI"
  };

  const content = `
    <div style="font-family: var(--font-sans); font-size: 11px; line-height: 1.4;">
      <b style="color: #38bdf8; font-size: 13px;">STAND ${standObj.ref}</b><br>
      Durum: <b>${statusLabels[c.status] || "BOŞ"}</b><br>
      ${c.flight ? `Uçuş: <b style="color: #f59e0b;">${c.flight}</b><br>` : ""}
      ${c.aircraft ? `Uçak: ${c.aircraft}<br>` : ""}
      ${c.timeIn ? `Varış: ${c.timeIn} | Kalkış: ${c.timeOut || '-'}<br>` : ""}
      ${c.notes ? `<small style="color: #94a3b8;">${c.notes}</small>` : ""}
    </div>
  `;
  marker.bindTooltip(content, { direction: "top", offset: [0, -10] });
}

function selectStand(standId) {
  const prevActive = document.querySelector(".stand-marker-badge.selected");
  if (prevActive) prevActive.classList.remove("selected");

  activeStandId = standId;
  const standObj = standsMap.get(standId);
  if (!standObj) return;

  const currentBadge = document.getElementById(`marker_${standId}`);
  if (currentBadge) currentBadge.classList.add("selected");

  document.querySelectorAll(".stand-card").forEach(c => c.classList.remove("selected"));
  const card = document.getElementById(`card_${standId}`);
  if (card) {
    card.classList.add("selected");
    card.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  updateEditorFields(standObj);
  document.querySelector('.tab-btn[data-tab="tab-editor"]').click();
}

function updateEditorFields(standObj) {
  document.getElementById("editorStandRef").textContent = standObj.ref;
  document.getElementById("editStandId").value = standObj.id;

  const data = standObj.customData;
  document.getElementById("editStatus").value = data.status || "free";
  document.getElementById("editFlight").value = data.flight || "";
  document.getElementById("editAircraft").value = data.aircraft || "";
  document.getElementById("editTimeIn").value = data.timeIn || "";
  document.getElementById("editTimeOut").value = data.timeOut || "";
  document.getElementById("editNotes").value = data.notes || "";

  updateEditorHeaderBadge(data.status);
}

function updateEditorHeaderBadge(status) {
  const badge = document.getElementById("editorStandBadge");
  const text = document.getElementById("editorStatusText");

  const colors = {
    free: { text: "BOŞ (AVAILABLE)", color: "var(--stand-free)" },
    occupied: { text: "DOLU (OCCUPIED)", color: "var(--stand-occupied)" },
    boarding: { text: "BORDİNG", color: "var(--stand-boarding)" },
    maintenance: { text: "BAKIMDA", color: "var(--stand-maintenance)" },
    nightstop: { text: "YATILI", color: "var(--accent-purple)" }
  };

  const info = colors[status] || colors.free;
  text.textContent = info.text;
  badge.style.color = info.color;
  badge.style.borderColor = info.color;
}

function saveActiveStandData() {
  if (!activeStandId) {
    showToast("Lütfen önce bir park pozisyonu seçin.");
    return;
  }

  const standObj = standsMap.get(activeStandId);
  if (!standObj) return;

  const status = document.getElementById("editStatus").value;
  const flight = document.getElementById("editFlight").value.trim().toUpperCase();
  const aircraft = document.getElementById("editAircraft").value.trim();
  const timeIn = document.getElementById("editTimeIn").value;
  const timeOut = document.getElementById("editTimeOut").value;
  const notes = document.getElementById("editNotes").value.trim();

  standObj.customData = {
    status: status,
    flight: flight,
    aircraft: aircraft,
    timeIn: timeIn,
    timeOut: timeOut,
    notes: notes,
    manual: true
  };

  saveStoredData();
  updateStandMarkerVisual(standObj);
  updateMarkerTooltip(standObj.marker, standObj);
  renderStandsList(document.getElementById("standSearchInput").value);
  updateStatistics();

  showToast(`Stand ${standObj.ref} bilgileri kaydedildi.`);
}

function resetActiveStandData() {
  if (!activeStandId) return;
  const standObj = standsMap.get(activeStandId);
  if (!standObj) return;

  standObj.customData = {
    status: "free",
    flight: "",
    aircraft: "",
    timeIn: "",
    timeOut: "",
    notes: "",
    manual: false
  };

  saveStoredData();
  updateStandMarkerVisual(standObj);
  updateMarkerTooltip(standObj.marker, standObj);
  selectStand(activeStandId);
  renderStandsList(document.getElementById("standSearchInput").value);
  updateStatistics();

  showToast(`Stand ${standObj.ref} boşaltıldı.`);
}

function updateStandMarkerVisual(standObj) {
  const el = document.getElementById(`marker_${standObj.id}`);
  if (el) {
    el.className = `stand-marker-badge ${standObj.customData.status || "free"}`;
    if (activeStandId === standObj.id) el.classList.add("selected");
    const subText = standObj.customData.flight ? `<span class="stand-marker-sub">${standObj.customData.flight}</span>` : "";
    el.innerHTML = `<span>${standObj.ref}</span>${subText}`;
  }
}
window.updateStandMarkerVisual = updateStandMarkerVisual;

function refreshAllStandMarkers() {
  standsMap.forEach(standObj => {
    updateStandMarkerVisual(standObj);
    updateMarkerTooltip(standObj.marker, standObj);
  });
}

function getStorageKey() {
  return `airport_ops_${currentIcao}`;
}

function saveStoredData() {
  const exportable = {};
  standsMap.forEach((val, key) => {
    if (val.customData.manual || val.customData.status !== "free" || val.customData.flight) {
      exportable[key] = val.customData;
    }
  });
  localStorage.setItem(getStorageKey(), JSON.stringify(exportable));
}

function loadStoredData() {
  const stored = localStorage.getItem(getStorageKey());
  if (!stored) return;

  try {
    const data = JSON.parse(stored);
    Object.keys(data).forEach(id => {
      if (standsMap.has(id)) {
        standsMap.get(id).customData = data[id];
      }
    });
    refreshAllStandMarkers();
  } catch (e) {
    console.warn("Stored data parse failed:", e);
  }
}

function renderStandsList(filterText = "") {
  const container = document.getElementById("standsList");
  if (!container) return;
  container.innerHTML = "";

  const activeChip = document.querySelector(".chip.active")?.dataset.filter || "all";
  const search = filterText.toLowerCase().trim();

  let totalCount = 0;
  let freeCount = 0;
  let occupiedCount = 0;
  let maintenanceCount = 0;

  const sortedStands = Array.from(standsMap.values()).sort((a, b) => {
    return a.ref.localeCompare(b.ref, undefined, { numeric: true, sensitivity: 'base' });
  });

  sortedStands.forEach(stand => {
    totalCount++;
    const status = stand.customData.status || "free";
    const isOccupied = (status === "occupied" || status === "boarding" || status === "nightstop");

    if (status === "free") freeCount++;
    else if (isOccupied) occupiedCount++;
    else if (status === "maintenance") maintenanceCount++;

    if (activeChip === "free" && status !== "free") return;
    if (activeChip === "occupied" && !isOccupied) return;
    if (activeChip === "maintenance" && status !== "maintenance") return;

    if (search) {
      const matchRef = stand.ref.toLowerCase().includes(search);
      const matchFlight = (stand.customData.flight || "").toLowerCase().includes(search);
      const matchAircraft = (stand.customData.aircraft || "").toLowerCase().includes(search);
      if (!matchRef && !matchFlight && !matchAircraft) return;
    }

    const card = document.createElement("div");
    card.id = `card_${stand.id}`;
    card.className = `stand-card ${activeStandId === stand.id ? "selected" : ""}`;
    
    const dotColor = isOccupied ? "var(--stand-occupied)" : (status === "maintenance" ? "var(--stand-maintenance)" : "var(--stand-free)");

    card.innerHTML = `
      <div class="stand-card-header">
        <span class="stand-id">${stand.ref}</span>
        <span class="card-status-dot" style="background-color: ${dotColor}"></span>
      </div>
      ${stand.customData.flight ? `<div class="stand-flight">${stand.customData.flight}</div>` : `<div style="font-size: 11px; color: var(--text-dim);">Boş</div>`}
      ${stand.customData.aircraft ? `<div class="stand-aircraft">${stand.customData.aircraft}</div>` : ""}
    `;

    card.addEventListener("click", () => {
      selectStand(stand.id);
      map.flyTo([stand.lat, stand.lon], 18, { animate: true, duration: 0.8 });
    });

    container.appendChild(card);
  });

  const countAllEl = document.getElementById("countAll");
  const countFreeEl = document.getElementById("countFree");
  const countOccupiedEl = document.getElementById("countOccupied");
  const countMaintEl = document.getElementById("countMaintenance");

  if (countAllEl) countAllEl.textContent = totalCount;
  if (countFreeEl) countFreeEl.textContent = freeCount;
  if (countOccupiedEl) countOccupiedEl.textContent = occupiedCount;
  if (countMaintEl) countMaintEl.textContent = maintenanceCount;
}

function updateStatistics() {
  const total = standsMap.size;
  let occupied = 0;
  standsMap.forEach(s => {
    const st = s.customData.status;
    if (st === "occupied" || st === "boarding" || st === "nightstop") occupied++;
  });

  const rate = total > 0 ? Math.round((occupied / total) * 100) : 0;

  const totalEl = document.getElementById("statTotalStands");
  const rateEl = document.getElementById("statOccupancyRate");
  if (totalEl) totalEl.textContent = total;
  if (rateEl) rateEl.textContent = `${rate}%`;
  
  let runways = 0;
  let taxiways = 0;
  if (rawAirportGeoJSON?.features) {
    rawAirportGeoJSON.features.forEach(f => {
      if (f.properties?.aeroway === "runway") runways++;
      if (f.properties?.aeroway === "taxiway") taxiways++;
    });
  }
  const rwyEl = document.getElementById("statRunways");
  const twyEl = document.getElementById("statTaxiways");
  if (rwyEl) rwyEl.textContent = runways;
  if (twyEl) twyEl.textContent = taxiways;
}

function exportOpsDataJSON() {
  const exportPayload = {
    airport: currentIcao,
    exportedAt: new Date().toISOString(),
    stands: {}
  };

  standsMap.forEach((val, key) => {
    exportPayload.stands[val.ref] = {
      id: key,
      lat: val.lat,
      lon: val.lon,
      ...val.customData
    };
  });

  downloadJSON(exportPayload, `AirportOps_${currentIcao}_${Date.now()}.json`);
  showToast("Operasyon verisi JSON olarak indirildi.");
}

function exportAirportGeoJSON() {
  if (!rawAirportGeoJSON) {
    showToast("Havalimanı şema verisi bulunamadı.");
    return;
  }
  downloadJSON(rawAirportGeoJSON, `AirportSchema_${currentIcao}.geojson`);
  showToast("Havalimanı GeoJSON şeması indirildi.");
}

function downloadJSON(obj, filename) {
  const str = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(obj, null, 2));
  const el = document.createElement("a");
  el.setAttribute("href", str);
  el.setAttribute("download", filename);
  document.body.appendChild(el);
  el.click();
  el.remove();
}

function handleFileImport(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (evt) => {
    try {
      const data = JSON.parse(evt.target.result);
      if (data.stands) {
        Object.values(data.stands).forEach(item => {
          standsMap.forEach(standObj => {
            if (standObj.ref === item.ref || standObj.id === item.id) {
              standObj.customData = {
                status: item.status || "free",
                flight: item.flight || "",
                aircraft: item.aircraft || "",
                timeIn: item.timeIn || "",
                timeOut: item.timeOut || "",
                notes: item.notes || "",
                manual: true
              };
            }
          });
        });
        saveStoredData();
        refreshAllStandMarkers();
        renderStandsList();
        updateStatistics();
        showToast("JSON verisi başarıyla içe aktarıldı.");
      } else {
        showToast("Geçersiz JSON formatı. 'stands' nesnesi bulunamadı.");
      }
    } catch (err) {
      showToast("Dosya okuma hatası: " + err.message);
    }
  };
  reader.readAsText(file);
}

function updateStatus(text, state = "ready") {
  const el = document.getElementById("statusText");
  const dot = document.querySelector(".status-dot");
  if (el) el.textContent = text;

  if (dot) {
    if (state === "loading") dot.style.backgroundColor = "var(--accent-amber)";
    else if (state === "error") dot.style.backgroundColor = "var(--accent-red)";
    else dot.style.backgroundColor = "var(--accent-green)";
  }
}

function showToast(msg) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3000);
}
