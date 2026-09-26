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
let runwayOverlayLayerGroup = null; // ATC Runway indicators (Mandatory entry & exits)

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
  initWelcomeModal();
  initTaxiwayDirectionsUI();
  loadAirport(document.getElementById("airportSelect")?.value || "LTFM");
});

function initMap() {
  map = L.map("map", {
    zoomControl: false,
    preferCanvas: true,
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
  runwayOverlayLayerGroup = L.layerGroup().addTo(map);

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
    "Rota Vurgusu (Blue Route)": taxiRouteHighlightLayerGroup,
    "Pist Giriş & Çıkışları (ATC)": runwayOverlayLayerGroup
  };

  L.control.layers(baseMaps, overlayMaps, { position: "topright" }).addTo(map);

  // Deselect on clicking empty map
  map.on("click", () => {
    // Only deselect if not clicking an aircraft or stand
    if (selectedFlightId && !isCameraFollowing) {
      clearAircraftSelection();
    }
  });

  if (window.TaxiwayDirectionManager) {
    window.TaxiwayDirectionManager.initMapOverlay(map);
  }
}

function setupUIEvents() {
  setupRunwayConfigEvents();

  // Mobile / Tablet sidebar drawer toggling
  const btnToggle = document.getElementById("btnToggleSidebar");
  const btnClose = document.getElementById("btnCloseSidebar");
  const backdrop = document.getElementById("sidebarBackdrop");
  const sidebar = document.querySelector(".sidebar");

  const openSidebar = () => {
    if (sidebar) sidebar.classList.add("open");
    if (backdrop) backdrop.classList.add("show");
  };

  const closeSidebar = () => {
    if (sidebar) sidebar.classList.remove("open");
    if (backdrop) backdrop.classList.remove("show");
  };

  if (btnToggle) {
    btnToggle.addEventListener("click", () => {
      if (sidebar && sidebar.classList.contains("open")) {
        closeSidebar();
      } else {
        openSidebar();
      }
    });
  }

  if (btnClose) btnClose.addEventListener("click", closeSidebar);
  if (backdrop) backdrop.addEventListener("click", closeSidebar);

  // Tab switching
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-pane").forEach(p => p.classList.remove("active"));

      btn.classList.add("active");
      const targetPane = document.getElementById(btn.dataset.tab);
      if (targetPane) targetPane.classList.add("active");

      if (btn.dataset.tab === "tab-stands") {
        renderStandsList(document.getElementById("standSearchInput")?.value || "");
      } else if (btn.dataset.tab === "tab-flights") {
        renderFlightsList();
      }
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

  // Stand filter chips (scoped to tab-stands)
  document.querySelectorAll("#tab-stands .chip").forEach(chip => {
    chip.addEventListener("click", () => {
      document.querySelectorAll("#tab-stands .chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      renderStandsList(document.getElementById("standSearchInput")?.value || "");
    });
  });

  // Flight search input filter
  const flightSearchInput = document.getElementById("flightSearchInput");
  if (flightSearchInput) {
    flightSearchInput.addEventListener("input", (e) => {
      renderFlightsList(e.target.value);
    });
  }

  // Flight filter chips (scoped to tab-flights)
  document.querySelectorAll("#tab-flights .flight-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      document.querySelectorAll("#tab-flights .flight-chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      renderFlightsList(flightSearchInput?.value || "");
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

// ==============================================================
// GEÇİCİ HOŞGELDİN POPUP YÖNETİMİ - Sonraki buildde kaldırılacak
// ==============================================================
function closeWelcomeModal() {
  const modal = document.getElementById("welcomeModal");
  if (modal) {
    modal.classList.add("hidden");
    modal.style.display = "none";
  }
}
window.closeWelcomeModal = closeWelcomeModal;

function initWelcomeModal() {
  const modal = document.getElementById("welcomeModal");
  const btnClose = document.getElementById("btnCloseWelcomeModal");
  const btnStart = document.getElementById("btnStartWelcome");

  if (!modal) return;

  modal.classList.remove("hidden");
  modal.style.display = "flex";

  if (btnClose) {
    btnClose.addEventListener("click", (e) => {
      e.stopPropagation();
      closeWelcomeModal();
    });
  }

  if (btnStart) {
    btnStart.addEventListener("click", (e) => {
      e.stopPropagation();
      closeWelcomeModal();
    });
  }

  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeWelcomeModal();
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeWelcomeModal();
  });
}

/**
 * Setup Taxiway Directions & Interactive Flow Editor Controls
 */
function initTaxiwayDirectionsUI() {
  const btnHeader = document.getElementById("btnTaxiwayDirModalOpen");
  const btnToggleMode = document.getElementById("btnToggleTaxiEditMode");
  const btnCloseToolbar = document.getElementById("btnCloseTaxiEditToolbar");
  const btnFinishEdit = document.getElementById("btnFinishTaxiEdit");
  const btnResetAll = document.getElementById("btnResetAllTaxiDirs");
  const btnPresetAlt = document.getElementById("btnPresetAlternating");
  const btnPresetRev = document.getElementById("btnPresetReverse");

  if (btnHeader) {
    btnHeader.addEventListener("click", () => {
      if (window.TaxiwayDirectionManager) {
        window.TaxiwayDirectionManager.toggleEditMode();
      }
    });
  }

  if (btnToggleMode) {
    btnToggleMode.addEventListener("click", () => {
      if (window.TaxiwayDirectionManager) {
        window.TaxiwayDirectionManager.toggleEditMode();
      }
    });
  }

  if (btnCloseToolbar) {
    btnCloseToolbar.addEventListener("click", () => {
      if (window.TaxiwayDirectionManager) {
        window.TaxiwayDirectionManager.setEditMode(false);
      }
    });
  }

  if (btnFinishEdit) {
    btnFinishEdit.addEventListener("click", () => {
      if (window.TaxiwayDirectionManager) {
        window.TaxiwayDirectionManager.setEditMode(false);
      }
    });
  }

  if (btnResetAll) {
    btnResetAll.addEventListener("click", () => {
      if (window.TaxiwayDirectionManager) {
        window.TaxiwayDirectionManager.presetResetAll();
      }
    });
  }

  if (btnPresetAlt) {
    btnPresetAlt.addEventListener("click", () => {
      if (window.TaxiwayDirectionManager) {
        window.TaxiwayDirectionManager.presetAlternating();
      }
    });
  }

  if (btnPresetRev) {
    btnPresetRev.addEventListener("click", () => {
      if (window.TaxiwayDirectionManager) {
        window.TaxiwayDirectionManager.presetReverse();
      }
    });
  }

  // Bind congestion alert dismiss button
  const btnDismissCongestion = document.getElementById("btnDismissCongestion");
  if (btnDismissCongestion) {
    btnDismissCongestion.addEventListener("click", () => {
      const alertEl = document.getElementById("atcCongestionAlert");
      if (alertEl) alertEl.style.display = "none";
    });
  }
}

/**
 * Live Airport Weather & Wind Telemetry Service (Open-Meteo Aviation Feed)
 */
const AirportWeatherService = {
  activeIcao: "LTFM",
  cache: new Map(),

  async fetchWeather(icao = currentIcao) {
    icao = (icao === "LTFM") ? "LTFM" : "LTFJ";
    this.activeIcao = icao;
    const isLTFM = (icao === "LTFM");
    const lat = isLTFM ? 41.26 : 40.90;
    const lon = isLTFM ? 28.74 : 29.31;

    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure&timezone=Europe%2FIstanbul`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Weather fetch status ${res.status}`);
      const data = await res.json();
      if (!data.current) throw new Error("No current weather data");

      const weather = this.parseWeatherData(icao, data.current);
      this.cache.set(icao, weather);
      this.updateUI(weather);
    } catch (err) {
      console.warn(`[WeatherService] Live API fetch failed for ${icao}, using realistic METAR fallback:`, err);
      const fallback = this.getFallbackWeather(icao);
      this.updateUI(fallback);
    }
  },

  parseWeatherData(icao, cur) {
    const isLTFM = (icao === "LTFM");
    const temp = Math.round(cur.temperature_2m ?? 20);
    const humidity = cur.relative_humidity_2m ?? 70;
    const precipProb = cur.precipitation_probability !== undefined ? cur.precipitation_probability : 0;
    const precip = cur.precipitation || 0;
    const windSpeedKmh = cur.wind_speed_10m || 15;
    const windSpeedKt = Math.round(windSpeedKmh * 0.539957);
    const windDir = Math.round(cur.wind_direction_10m ?? 60);
    const qnh = Math.round(cur.surface_pressure ? cur.surface_pressure + 13 : 1016);

    const windName = this.getWindCompass(windDir);
    const cond = this.getWeatherCondition(cur.weather_code ?? 3);

    // Crosswind / Headwind calculation for active runway
    const rwyHdg = isLTFM ? 160 : 60;
    const windAngleRad = Math.abs(windDir - rwyHdg) * (Math.PI / 180);
    const headwindKt = Math.round(windSpeedKt * Math.cos(windAngleRad));
    const crosswindKt = Math.round(Math.abs(windSpeedKt * Math.sin(windAngleRad)));

    const windCompText = headwindKt >= 0 
      ? `Pist ${isLTFM ? '16R' : '06L'} Karşı: ${headwindKt} KT | Yan: ${crosswindKt} KT` 
      : `Pist ${isLTFM ? '35R' : '24R'} Karşı: ${Math.abs(headwindKt)} KT | Yan: ${crosswindKt} KT`;

    return {
      icao,
      name: isLTFM ? "LTFM · İstanbul Havalimanı" : "LTFJ · Sabiha Gökçen",
      temp: `${temp}°C`,
      humidity: `%${humidity}`,
      precipProb: `%${precipProb}`,
      precipText: precip > 0 ? `${precip.toFixed(1)} mm / Yağışlı` : "0.0 mm / Yağışsız",
      windSpeedKt,
      windDir,
      windText: `${String(windDir).padStart(3, "0")}° / ${windSpeedKt} KT (${windName})`,
      windComp: windCompText,
      pressure: `${qnh} hPa (QNH)`,
      surfacePressure: `Yüzey: ${Math.round(cur.surface_pressure || 1003)} hPa`,
      condition: cond.text,
      icon: cond.icon,
      flightCat: (precipProb > 60 || (cur.weather_code && cur.weather_code >= 61)) ? "IFR" : (precipProb > 30 ? "MVFR" : "VFR")
    };
  },

  getFallbackWeather(icao) {
    const isLTFM = (icao === "LTFM");
    return {
      icao,
      name: isLTFM ? "LTFM · İstanbul Havalimanı" : "LTFJ · Sabiha Gökçen",
      temp: isLTFM ? "20°C" : "19°C",
      humidity: "%73",
      precipProb: "%0",
      precipText: "0.0 mm / Yağışsız",
      windSpeedKt: 9,
      windDir: 60,
      windText: "060° / 09 KT (Poyraz)",
      windComp: "Pist 16R Karşı Rüzgar (Uygun)",
      pressure: "1016 hPa (QNH)",
      surfacePressure: "Yüzey: 1003 hPa",
      condition: "Parçalı Bulutlu",
      icon: "⛅",
      flightCat: "VFR"
    };
  },

  getWindCompass(deg) {
    if (deg >= 22.5 && deg < 67.5) return "Poyraz";
    if (deg >= 67.5 && deg < 112.5) return "Gündoğusu";
    if (deg >= 112.5 && deg < 157.5) return "Keşişleme";
    if (deg >= 157.5 && deg < 202.5) return "Kıble";
    if (deg >= 202.5 && deg < 247.5) return "Lodos";
    if (deg >= 247.5 && deg < 292.5) return "Günbatısı";
    if (deg >= 292.5 && deg < 337.5) return "Karayel";
    return "Yıldız";
  },

  getWeatherCondition(code) {
    if (code === 0) return { text: "Açık / Güneşli", icon: "☀️" };
    if (code === 1 || code === 2) return { text: "Az Bulutlu", icon: "🌤️" };
    if (code === 3) return { text: "Parçalı Bulutlu", icon: "⛅" };
    if (code === 45 || code === 48) return { text: "Puslu / Sisli", icon: "🌫️" };
    if (code >= 51 && code <= 55) return { text: "Çisenti Yağış", icon: "🌦️" };
    if (code >= 61 && code <= 65) return { text: "Hafif Yağmur", icon: "🌧️" };
    if (code >= 71 && code <= 77) return { text: "Kar Yağışlı", icon: "🌨️" };
    if (code >= 80 && code <= 82) return { text: "Sağanak Yağış", icon: "⛈️" };
    if (code >= 95) return { text: "Gök Gürültülü Fırtına", icon: "🌩️" };
    return { text: "Parçalı Bulutlu", icon: "⛅" };
  },

  updateUI(w) {
    const elStation = document.getElementById("weatherStationIcao");
    const elCond = document.getElementById("weatherCondition");
    const elIcon = document.getElementById("weatherIcon");
    const elCat = document.getElementById("weatherFlightCat");
    const elWind = document.getElementById("weatherWind");
    const elWindComp = document.getElementById("weatherWindComp");
    const elPrecipProb = document.getElementById("weatherPrecipProb");
    const elPrecipAmt = document.getElementById("weatherPrecipAmount");
    const elHum = document.getElementById("weatherHumidity");
    const elQnh = document.getElementById("weatherQNH");
    const elTempMinMax = document.getElementById("weatherTempMinMax");

    if (elStation) elStation.textContent = w.icao;
    if (elCond) elCond.textContent = `${w.temp} · ${w.condition}`;
    if (elIcon) elIcon.textContent = w.icon;
    if (elCat) {
      elCat.textContent = w.flightCat;
      elCat.className = `weather-badge-vfr ${w.flightCat.toLowerCase()}`;
    }
    if (elWind) elWind.textContent = w.windText;
    if (elWindComp) elWindComp.textContent = w.windComp;
    if (elPrecipProb) elPrecipProb.textContent = `${w.precipProb} İhtimal`;
    if (elPrecipAmt) elPrecipAmt.textContent = w.precipText;
    if (elHum) elHum.textContent = `Nem: ${w.humidity}`;
    if (elQnh) elQnh.textContent = w.pressure;
    if (elTempMinMax) elTempMinMax.textContent = w.surfacePressure;
  }
};
window.AirportWeatherService = AirportWeatherService;

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
function selectAircraft(flightId, autoJumpToTime = false) {
  if (!trafficSim) return;
  const flight = trafficSim.flights.find(f => f.id === flightId);
  if (!flight) return;

  selectedFlightId = flightId;
  window.selectedFlightId = flightId;

  const isLive = trafficSim.simSeconds >= flight.startTime && trafficSim.simSeconds <= flight.endTime;

  if (!isLive && autoJumpToTime) {
    // Jump simulation time right to when this flight begins its operation
    trafficSim.setTime(Math.max(0, flight.startTime + 15));
    trafficSim.updateSimulation(0, true);
    showToast(`${flight.callsign} için simülasyon saati ${flight.timeInFormatted || flight.eta}'e ayarlandı.`);
  }

  // Open HUD Panel
  const hud = document.getElementById("aircraftHUD");
  if (hud) hud.classList.remove("hidden");

  // Populate Header
  document.getElementById("hudCallsign").textContent = flight.callsign;
  const livery = window.AircraftMarkerManager?.getLivery(flight.airline);
  const hudAirlineEl = document.getElementById("hudAirline");
  if (livery && hudAirlineEl) {
    hudAirlineEl.innerHTML = `${livery.logoSvg || ''} <span>${livery.name} (${livery.displayTag})</span>`;
    hudAirlineEl.style.display = "inline-flex";
    hudAirlineEl.style.alignItems = "center";
    hudAirlineEl.style.gap = "6px";
  } else if (hudAirlineEl) {
    hudAirlineEl.textContent = flight.airlineName || flight.airline;
  }
  document.getElementById("hudReg").textContent = `${flight.registration} (${flight.type})`;
  document.getElementById("hudDestStand").textContent = `Stand ${flight.standRef}`;
  document.getElementById("hudRoute").textContent = `${flight.origin} ➔ ${flight.destination}`;

  // Draw Glowing Blue Route Polyline
  drawBlueTaxiRoute(flight);

  // Bring marker or assigned stand to focus
  if (flight.lat && flight.lon) {
    map.panTo([flight.lat, flight.lon], { animate: true, duration: 0.5 });
  } else if (flight.fullRoute && flight.fullRoute.length > 0) {
    const pt = flight.fullRoute[0];
    map.panTo([pt[0], pt[1]], { animate: true, duration: 0.5 });
  } else {
    const stand = Array.from(standsMap.values()).find(s => s.ref === flight.standRef);
    if (stand) {
      map.panTo([stand.lat, stand.lon], { animate: true, duration: 0.5 });
    }
  }

  // Highlight active flight card if visible
  document.querySelectorAll(".flight-card").forEach(c => {
    c.classList.toggle("selected", c.dataset.flightId === flightId);
  });
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

  // Flight Safety Separation Protocol Status
  const safetyBadge = document.getElementById("hudSafetyBadge");
  const longStatus = document.getElementById("hudLongitudinalStatus");
  const latStatus = document.getElementById("hudLateralStatus");
  const safetyDetail = document.getElementById("hudSafetyDetail");

  const dim = flight.dim || (window.GroundTrafficSimulator && window.GroundTrafficSimulator.getAircraftDim(flight.type)) || { length: 42, wingspan: 36 };
  const minLongReq = flight.reqMinLong || Math.round(2.0 * dim.length);
  const minLatReq = flight.reqMinLat || Math.round(1.5 * dim.wingspan);

  if (flight.isQueued) {
    if (safetyBadge) {
      safetyBadge.className = "hud-safety-badge holding";
      safetyBadge.textContent = "AYRIM KORUMA (HOLD)";
    }
    phaseElem.style.borderColor = "#f59e0b";
    phaseElem.style.color = "#fbbf24";
    phaseElem.style.background = "rgba(245, 158, 11, 0.25)";

    if (flight.queueReason === "longitudinal") {
      phaseElem.textContent = "Ön-Arka Ayrım Hold";
      if (longStatus) {
        longStatus.className = "rule-status warn";
        longStatus.textContent = `Bekleniyor (${flight.conflictWith || 'Trafik'} < ${minLongReq}m)`;
      }
      if (latStatus) {
        latStatus.className = "rule-status ok";
        latStatus.textContent = `> ${minLatReq}m Korunuyor`;
      }
      if (safetyDetail) {
        safetyDetail.classList.remove("hidden");
        safetyDetail.textContent = `⚠️ Uçuş Güvenliği: Öndeki uçak (${flight.conflictWith || 'Trafik'}) ile 2 uçak boyu emniyet mesafesi (${minLongReq}m) sağlanana kadar taksi durduruldu.`;
      }
    } else if (flight.queueReason === "lateral") {
      phaseElem.textContent = "Yanal Ayrım Hold";
      if (longStatus) {
        longStatus.className = "rule-status ok";
        longStatus.textContent = `≥ ${minLongReq}m Korunuyor`;
      }
      if (latStatus) {
        latStatus.className = "rule-status warn";
        latStatus.textContent = `Bekleniyor (${flight.conflictWith || 'Trafik'} ≤ ${minLatReq}m)`;
      }
      if (safetyDetail) {
        safetyDetail.classList.remove("hidden");
        safetyDetail.textContent = `⚠️ Uçuş Güvenliği: Kesişen/yanal trafik (${flight.conflictWith || 'Trafik'}) ile 1.5x kanat açıklığı (${minLatReq}m) güvenlik ayrımı için yol veriliyor.`;
      }
    } else if (flight.queueReason === "takeoff_separation") {
      phaseElem.textContent = "Pist Ayrım Hold";
      if (longStatus) {
        longStatus.className = "rule-status warn";
        longStatus.textContent = `Pist Beklemesi (Hold)`;
      }
      if (latStatus) {
        latStatus.className = "rule-status ok";
        latStatus.textContent = `> ${minLatReq}m Korunuyor`;
      }
      if (safetyDetail) {
        safetyDetail.classList.remove("hidden");
        safetyDetail.textContent = `⚠️ Uçuş Güvenliği: Pistteki iniş/kalkış trafiği (${flight.conflictWith || 'Pist'}) ayrımı tamamlanana kadar bekleme noktasında tutuluyor.`;
      }
    } else {
      phaseElem.textContent = "Taksi Sırasında";
      if (longStatus) longStatus.textContent = `Taksi Sırasında Bekliyor`;
      if (latStatus) latStatus.textContent = `> ${minLatReq}m Korunuyor`;
      if (safetyDetail) {
        safetyDetail.classList.remove("hidden");
        safetyDetail.textContent = `Taksi yolu güvenlik ayrımı gereğince yer hareketi durduruldu.`;
      }
    }
  } else {
    phaseElem.style.borderColor = "";
    phaseElem.style.color = "";
    phaseElem.style.background = "";

    if (safetyBadge) {
      safetyBadge.className = "hud-safety-badge safe";
      safetyBadge.textContent = "GÜVENLİ (STANDART)";
    }
    if (longStatus) {
      longStatus.className = "rule-status ok";
      longStatus.textContent = `≥ 2 Uçak Boyu (${minLongReq}m) Aktif`;
    }
    if (latStatus) {
      latStatus.className = "rule-status ok";
      latStatus.textContent = `> 1.5x Kanat (${minLatReq}m) Aktif`;
    }
    if (safetyDetail) {
      safetyDetail.classList.add("hidden");
    }
  }

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
let lastStandsListRenderTime = 0;
function onStandOccupancyChanged() {
  updateStandCounterChips();
  updateStatistics();

  const isStandsTabActive = document.getElementById("tab-stands")?.classList.contains("active");
  const now = performance.now();
  if (isStandsTabActive && (now - lastStandsListRenderTime > 1200)) {
    lastStandsListRenderTime = now;
    const currentSearch = document.getElementById("standSearchInput")?.value || "";
    renderStandsList(currentSearch);
  }

  if (activeStandId && standsMap.has(activeStandId)) {
    const standObj = standsMap.get(activeStandId);
    if (!standObj.customData.manual) {
      updateEditorFields(standObj);
    }
  }
}
window.onStandOccupancyChanged = onStandOccupancyChanged;

function updateStandCounterChips() {
  let totalCount = 0;
  let freeCount = 0;
  let occupiedCount = 0;
  let maintenanceCount = 0;

  standsMap.forEach(stand => {
    totalCount++;
    const status = stand.customData?.status || "free";
    const isOccupied = (status === "occupied" || status === "boarding" || status === "nightstop");
    if (status === "free") freeCount++;
    else if (isOccupied) occupiedCount++;
    else if (status === "maintenance") maintenanceCount++;
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

/**
 * Bottom Timeline Bar Controls
 */
function setupTimelineControls() {
  trafficSim = new GroundTrafficSimulator(currentIcao);
  window.trafficSim = trafficSim;
  window.trafficSimulator = trafficSim;
  trafficSim.start();

  const btnPlay = document.getElementById("btnPlayPause");
  const slider = document.getElementById("timelineSlider");
  const clock = document.getElementById("digitalClock");

  // Format real-world date above clock
  const now = new Date();
  const dateFormatted = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' }).format(now);
  const digitalDateEl = document.getElementById("digitalDate");
  if (digitalDateEl) digitalDateEl.textContent = `📅 ${dateFormatted}`;

  if (slider) slider.value = Math.floor(trafficSim.simSeconds);
  if (clock) clock.textContent = trafficSim.formatTime(trafficSim.simSeconds);

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
    const holdEl = document.getElementById("trafficSafetyHold");
    if (holdEl) holdEl.textContent = c.safetyHold || 0;

    // Live HUD refresh if an aircraft is currently selected
    if (selectedFlightId) {
      const activeFlight = data.activeFlights?.find(f => f.id === selectedFlightId);
      if (activeFlight) {
        updateLiveHUD(activeFlight);
      }
    }

    // Throttled Flight Schedule List and Filter Badges update (1.5s interval)
    const now = performance.now();
    if (now - lastFlightListUpdateTime > 1500) {
      lastFlightListUpdateTime = now;
      if (typeof updateFlightFilterBadges === "function") {
        updateFlightFilterBadges();
      }
      const flightsTab = document.getElementById("tab-flights");
      if (flightsTab && flightsTab.classList.contains("active")) {
        const searchInput = document.getElementById("flightSearchInput");
        if (document.activeElement !== searchInput && typeof renderFlightsList === "function") {
          renderFlightsList(searchInput?.value || "", false);
        }
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

  if (window.RunwayConfigManager) {
    window.RunwayConfigManager.setAirport(icao);
  }
  if (window.TaxiwayDirectionManager) {
    window.TaxiwayDirectionManager.airportIcao = icao;
  }

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

    if (window.TaxiwayDirectionManager) {
      window.TaxiwayDirectionManager.refreshOverlay();
    }

    if (window.AirportWeatherService) {
      window.AirportWeatherService.fetchWeather(icao);
    }

    if (typeof updateFlightFilterBadges === "function") {
      updateFlightFilterBadges();
    }
    if (typeof renderFlightsList === "function") {
      renderFlightsList();
    }

    if (window.RunwayConfigManager) {
      const cfg = window.RunwayConfigManager.getCurrentConfig(icao);
      updateRunwayHeaderSummary(cfg);
      renderRunwayATCIndicators(cfg);
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
  const canvasRenderer = L.canvas({ padding: 0.5 });

  geojson.features.forEach(feature => {
    const props = feature.properties || {};
    const geom = feature.geometry;
    const aeroway = props.aeroway;

    // 1. Apron Polygons
    if (aeroway === "apron") {
      const layer = L.geoJSON(feature, {
        renderer: canvasRenderer,
        style: {
          color: "#1e4d3a",
          weight: 1,
          fillColor: "#0f2b20",
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
        renderer: canvasRenderer,
        style: {
          color: "#05100c",
          weight: isPolygon ? 2 : 20,
          fillColor: "#091d15",
          fillOpacity: 0.95,
          opacity: 0.95
        }
      });

      if (!isPolygon) {
        const centerLine = L.geoJSON(feature, {
          renderer: canvasRenderer,
          style: {
            color: "#ffffff",
            weight: 2.5,
            dashArray: "14, 14",
            opacity: 0.95
          }
        });
        runwayLayerGroup.addLayer(centerLine);
      }

      layer.bindTooltip(`<b>PİST: ${props.ref || props.name || "Runway"}</b><br>Yüzey: ${props.surface || "Asfalt"}<br><span style="color: #38bdf8;">👉 Pist & Yön Ayarı İçin Tıklayın</span>`, {
        sticky: true
      });
      layer.on("click", () => {
        openRunwayModal(props.ref || props.name);
      });
      runwayLayerGroup.addLayer(layer);
      extendBounds(bounds, geom);
    }
    // 3. Taxiways (Taksi Yolları)
    else if (aeroway === "taxiway") {
      const layer = L.geoJSON(feature, {
        renderer: canvasRenderer,
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
      let lat = null, lon = null;
      if (geom.type === "Point") {
        lon = geom.coordinates[0];
        lat = geom.coordinates[1];
      } else if (geom.type === "Polygon" && geom.coordinates[0]?.length > 0) {
        const ring = geom.coordinates[0];
        let sumLat = 0, sumLon = 0;
        for (let i = 0; i < ring.length; i++) {
          sumLon += ring[i][0];
          sumLat += ring[i][1];
        }
        lat = sumLat / ring.length;
        lon = sumLon / ring.length;
      }

      if (lat !== null && lon !== null) {
        bounds.extend([lat, lon]);

        const standRef = props.ref || props.name || `#${props.id || Math.random().toString(36).substr(2, 6)}`;
        // Deduplicate stands with identical ref
        const standId = `stand_${standRef.replace(/[^a-zA-Z0-9]/g, "_")}`;
        if (standsMap.has(standId)) {
          return;
        }

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
  document.querySelector('.tab-btn[data-tab="tab-editor"]')?.click();

  // If on mobile/tablet screen, open the sidebar drawer automatically so editor is visible
  if (window.innerWidth < 1024) {
    const sidebar = document.querySelector(".sidebar");
    const backdrop = document.getElementById("sidebarBackdrop");
    if (sidebar) sidebar.classList.add("open");
    if (backdrop) backdrop.classList.add("show");
  }
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

let lastFlightListUpdateTime = 0;

/**
 * Updates count indicators in the Flight Schedule tab and top badge
 */
function updateFlightFilterBadges() {
  if (!trafficSim || !trafficSim.flights) return;
  const flights = trafficSim.flights;
  const curTime = trafficSim.simSeconds;

  const total = flights.length;
  let activeCount = 0;
  let arrCount = 0;
  let depCount = 0;
  let standCount = 0;

  for (let i = 0; i < total; i++) {
    const f = flights[i];
    const isLive = curTime >= f.startTime && curTime <= f.endTime;
    if (isLive) {
      activeCount++;
      const p = f.phase || "taxi_in";
      if (p === "on_stand") {
        standCount++;
      } else if (p === "approaching" || p === "landing" || p === "taxi_in") {
        arrCount++;
      } else {
        depCount++;
      }
    }
  }

  const tabBadge = document.getElementById("flightCountTab");
  if (tabBadge) tabBadge.textContent = total;

  const bAll = document.getElementById("flightFilterAll");
  const bActive = document.getElementById("flightFilterActive");
  const bArr = document.getElementById("flightFilterArr");
  const bDep = document.getElementById("flightFilterDep");
  const bStand = document.getElementById("flightFilterStand");

  if (bAll) bAll.textContent = total;
  if (bActive) bActive.textContent = activeCount;
  if (bArr) bArr.textContent = arrCount;
  if (bDep) bDep.textContent = depCount;
  if (bStand) bStand.textContent = standCount;
}
window.updateFlightFilterBadges = updateFlightFilterBadges;

/**
 * Helper to produce user-friendly flight phase label and CSS class
 */
function getFlightPhaseDisplay(flight, isLive) {
  if (!isLive) {
    if (trafficSim && trafficSim.simSeconds > flight.endTime) {
      return { cssClass: "scheduled", label: "Tamamlandı" };
    }
    return { cssClass: "scheduled", label: "Planlandı" };
  }
  const p = flight.phase || "taxi_in";
  switch (p) {
    case "approaching": return { cssClass: "approaching", label: "Yaklaşmada" };
    case "landing": return { cssClass: "landing", label: "İnişte" };
    case "taxi_in": return { cssClass: "taxi_in", label: "Giriş Taksisi" };
    case "on_stand": return { cssClass: "on_stand", label: "Parkta" };
    case "pushback": return { cssClass: "pushback", label: "Pushback" };
    case "taxi_out": return { cssClass: "taxi_out", label: "Kalkış Taksisi" };
    case "holding": return { cssClass: "holding", label: "Pist Bekleme" };
    case "queued": return { cssClass: "queued", label: "Taksi Sırası" };
    case "takeoff": return { cssClass: "takeoff", label: "Kalkışta" };
    default: return { cssClass: "taxi_in", label: "Taksi" };
  }
}

/**
 * Renders the entire flight schedule board with real-time tracking,
 * filtering and search capabilities.
 */
function renderFlightsList(filterText = "", resetScroll = true) {
  const container = document.getElementById("flightsList");
  if (!container || !trafficSim || !trafficSim.flights) return;

  const curTime = trafficSim.simSeconds;
  const activeChip = document.querySelector("#tab-flights .flight-chip.active")?.dataset.flightFilter || "all";
  const search = (filterText || document.getElementById("flightSearchInput")?.value || "").toLowerCase().trim();

  updateFlightFilterBadges();

  const prevScroll = container.scrollTop;

  // Filter flights
  const matching = [];
  const allFlights = trafficSim.flights;

  for (let i = 0; i < allFlights.length; i++) {
    const f = allFlights[i];
    const isLive = curTime >= f.startTime && curTime <= f.endTime;
    const p = f.phase || "taxi_in";

    // Filter chip criteria
    if (activeChip === "active" && !isLive) continue;
    if (activeChip === "arr") {
      const isArr = isLive ? (p === "approaching" || p === "landing" || p === "taxi_in") : (curTime < f.startTime + 600);
      if (!isArr) continue;
    }
    if (activeChip === "dep") {
      const isDep = isLive ? (p === "pushback" || p === "taxi_out" || p === "holding" || p === "queued" || p === "takeoff") : (curTime >= f.startTime + 600);
      if (!isDep) continue;
    }
    if (activeChip === "stand") {
      const isOnStand = isLive && p === "on_stand";
      if (!isOnStand) continue;
    }

    // Text search query
    if (search) {
      const matchCallsign = (f.callsign || "").toLowerCase().includes(search);
      const matchCity = (f.city || "").toLowerCase().includes(search);
      const matchDest = (f.destination || "").toLowerCase().includes(search);
      const matchOrigin = (f.origin || "").toLowerCase().includes(search);
      const matchStand = (f.standRef || "").toLowerCase().includes(search);
      const matchType = (f.type || "").toLowerCase().includes(search);
      const matchReg = (f.registration || "").toLowerCase().includes(search);
      const matchAirline = (f.airlineName || "").toLowerCase().includes(search);

      if (!matchCallsign && !matchCity && !matchDest && !matchOrigin && !matchStand && !matchType && !matchReg && !matchAirline) {
        continue;
      }
    }

    matching.push({ flight: f, isLive: isLive });
  }

  // Sort matching: currently active first, then chronological by startTime
  matching.sort((a, b) => {
    if (a.isLive && !b.isLive) return -1;
    if (!a.isLive && b.isLive) return 1;
    return a.flight.startTime - b.flight.startTime;
  });

  const MAX_RENDER = 120;
  const toRender = matching.slice(0, MAX_RENDER);

  const fragment = document.createDocumentFragment();

  toRender.forEach(item => {
    const f = item.flight;
    const isLive = item.isLive;
    const phaseInfo = getFlightPhaseDisplay(f, isLive);
    const livery = window.AircraftMarkerManager?.getLivery(f.airline);

    const card = document.createElement("div");
    card.className = `flight-card ${isLive ? 'is-live' : ''} ${selectedFlightId === f.id ? 'selected' : ''}`;
    card.dataset.flightId = f.id;

    card.innerHTML = `
      <div class="flight-card-header">
        <div class="flight-card-callsign-wrap">
          <div class="flight-logo-icon">${livery?.logoSvg || ''}</div>
          <span class="flight-card-callsign">${f.callsign}</span>
          <span class="flight-card-airline">${livery?.displayTag || f.airline}</span>
        </div>
        <span class="flight-card-phase ${phaseInfo.cssClass}">${phaseInfo.label}</span>
      </div>

      <div class="flight-card-route">
        <div class="route-point">
          <span class="route-city">${f.origin}</span>
          <span class="route-time">ETA ${f.timeInFormatted || f.eta}</span>
        </div>
        <div class="route-arrow">➔</div>
        <div class="route-point right">
          <span class="route-city">${f.city || f.destination} (${f.destination})</span>
          <span class="route-time">ETD ${f.timeOutFormatted || f.etd}</span>
        </div>
      </div>

      <div class="flight-card-footer">
        <span class="flight-card-gate">Atanan Park: <b>${f.standRef}</b></span>
        <span class="flight-card-ac">${f.registration} • ${f.type}</span>
      </div>
    `;

    card.addEventListener("click", () => {
      document.querySelectorAll(".flight-card").forEach(c => c.classList.remove("selected"));
      card.classList.add("selected");
      selectAircraft(f.id, true);
    });

    fragment.appendChild(card);
  });

  if (matching.length > MAX_RENDER) {
    const moreNotice = document.createElement("div");
    moreNotice.className = "flight-card-more";
    moreNotice.innerHTML = `+${matching.length - MAX_RENDER} adet daha uçuş var. Aramayı daraltarak diğer uçuşları filtreleyebilirsiniz.`;
    fragment.appendChild(moreNotice);
  } else if (matching.length === 0) {
    const emptyNotice = document.createElement("div");
    emptyNotice.className = "flight-card-more";
    emptyNotice.innerHTML = `Eşleşen uçuş bulunamadı. Filtreleri veya arama kriterini değiştirin.`;
    fragment.appendChild(emptyNotice);
  }

  container.innerHTML = "";
  container.appendChild(fragment);

  if (!resetScroll) {
    container.scrollTop = prevScroll;
  }
}
window.renderFlightsList = renderFlightsList;

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

/* ==========================================================================
   RUNWAY OPERATIONS & DIRECTION MANAGEMENT (ATC CONTROL)
   ========================================================================== */

function setupRunwayConfigEvents() {
  const btnOpen = document.getElementById("btnRunwayModalOpen");
  const btnClose = document.getElementById("btnCloseRunwayModal");
  const btnCancel = document.getElementById("btnCancelRunwayModal");
  const btnApply = document.getElementById("btnApplyRunwayConfig");
  const modal = document.getElementById("runwayModal");
  const selectArr = document.getElementById("selectArrRunway");
  const selectDep = document.getElementById("selectDepRunway");
  const selectEntry = document.getElementById("selectMandatoryEntry");
  const btnSelectAll = document.getElementById("btnSelectAllExits");

  if (btnOpen) btnOpen.addEventListener("click", () => openRunwayModal());
  if (btnClose) btnClose.addEventListener("click", closeRunwayModal);
  if (btnCancel) btnCancel.addEventListener("click", closeRunwayModal);

  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeRunwayModal();
    });
  }

  // When departure runway changes, re-populate its mandatory entry options
  if (selectDep) {
    selectDep.addEventListener("change", () => {
      const depRwy = selectDep.value;
      populateMandatoryEntryDropdown(currentIcao, depRwy);
      clearPresetHighlight();
      updateModalSummaryPreview();
    });
  }

  // When arrival runway changes, re-populate available exits checklist
  if (selectArr) {
    selectArr.addEventListener("change", () => {
      const arrRwy = selectArr.value;
      populateExitsChecklist(currentIcao, arrRwy);
      clearPresetHighlight();
      updateModalSummaryPreview();
    });
  }

  if (selectEntry) {
    selectEntry.addEventListener("change", () => {
      clearPresetHighlight();
      updateModalSummaryPreview();
    });
  }

  if (btnSelectAll) {
    btnSelectAll.addEventListener("click", () => {
      document.querySelectorAll("#runwayExitsContainer input[type='checkbox']").forEach(cb => {
        cb.checked = true;
      });
      clearPresetHighlight();
      updateModalSummaryPreview();
    });
  }

  if (btnApply) {
    btnApply.addEventListener("click", applyRunwayConfigFromModal);
  }

  // Register listener with RunwayConfigManager
  if (window.RunwayConfigManager) {
    window.RunwayConfigManager.onConfigChanged((cfg) => {
      updateRunwayHeaderSummary(cfg);
      renderRunwayATCIndicators(cfg);
    });
  }
}

function clearPresetHighlight() {
  document.querySelectorAll("#runwayPresetButtons .btn-preset").forEach(b => b.classList.remove("active"));
}

function openRunwayModal(preselectRunwayId = null) {
  if (!window.RunwayConfigManager) return;
  const cfg = window.RunwayConfigManager.getCurrentConfig(currentIcao);
  const catalog = window.RunwayConfigManager.catalogs[currentIcao];
  if (!catalog) return;

  // Determine preselection if runway was clicked on map
  let targetArr = cfg.arrRunway;
  let targetDep = cfg.depRunway;

  if (preselectRunwayId) {
    const cleanRef = String(preselectRunwayId).replace(/[^0-9LRC]/gi, "");
    for (const rwyKey of Object.keys(catalog.runways)) {
      if (cleanRef.includes(rwyKey) || rwyKey.includes(cleanRef) || String(preselectRunwayId).includes(rwyKey)) {
        if (cleanRef.startsWith("17") || cleanRef.startsWith("35") || cleanRef.startsWith("06R") || cleanRef.startsWith("24L")) {
          targetDep = rwyKey;
        } else {
          targetArr = rwyKey;
        }
        break;
      }
    }
  }

  populatePresetButtons(currentIcao, cfg.preset);
  populateRunwayDropdowns(currentIcao, targetArr, targetDep);
  populateMandatoryEntryDropdown(currentIcao, targetDep, cfg.mandatoryDepEntry?.id);
  populateExitsChecklist(currentIcao, targetArr, cfg.allowedExits.map(e => e.id));
  updateModalSummaryPreview();

  const modal = document.getElementById("runwayModal");
  if (modal) modal.classList.remove("hidden");
}

function closeRunwayModal() {
  const modal = document.getElementById("runwayModal");
  if (modal) modal.classList.add("hidden");
}

function populatePresetButtons(icao, activePresetId = null) {
  const container = document.getElementById("runwayPresetButtons");
  if (!container || !window.RunwayConfigManager) return;

  const presets = window.RunwayConfigManager.catalogs[icao]?.presets || {};
  let html = "";

  Object.values(presets).forEach(p => {
    const isActive = (p.id === activePresetId);
    html += `
      <button type="button" class="btn-preset ${isActive ? 'active' : ''}" data-preset="${p.id}">
        <span class="preset-title">${p.name}</span>
        <span class="preset-desc">${p.description}</span>
      </button>
    `;
  });

  container.innerHTML = html;

  container.querySelectorAll(".btn-preset").forEach(btn => {
    btn.addEventListener("click", () => {
      const pId = btn.dataset.preset;
      const presetObj = presets[pId];
      if (!presetObj) return;

      container.querySelectorAll(".btn-preset").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      // Apply preset values to UI dropdowns
      const selectArr = document.getElementById("selectArrRunway");
      const selectDep = document.getElementById("selectDepRunway");
      if (selectArr) selectArr.value = presetObj.arrRunway;
      if (selectDep) selectDep.value = presetObj.depRunway;

      populateMandatoryEntryDropdown(icao, presetObj.depRunway, presetObj.mandatoryDepEntry);
      populateExitsChecklist(icao, presetObj.arrRunway, presetObj.allowedExits);
      updateModalSummaryPreview();
    });
  });
}

function populateRunwayDropdowns(icao, selectedArr, selectedDep) {
  const catalog = window.RunwayConfigManager.catalogs[icao];
  if (!catalog) return;

  const selectArr = document.getElementById("selectArrRunway");
  const selectDep = document.getElementById("selectDepRunway");

  if (selectArr) {
    let arrHtml = "";
    Object.values(catalog.runways).forEach(rwy => {
      const isSel = (rwy.id === selectedArr) ? "selected" : "";
      arrHtml += `<option value="${rwy.id}" ${isSel}>${rwy.name} (${rwy.heading}° - İniş)</option>`;
    });
    selectArr.innerHTML = arrHtml;
  }

  if (selectDep) {
    let depHtml = "";
    Object.values(catalog.runways).forEach(rwy => {
      const isSel = (rwy.id === selectedDep) ? "selected" : "";
      depHtml += `<option value="${rwy.id}" ${isSel}>${rwy.name} (${rwy.heading}° - Kalkış)</option>`;
    });
    selectDep.innerHTML = depHtml;
  }
}

function populateMandatoryEntryDropdown(icao, depRwyId, selectedEntryId = null) {
  const catalog = window.RunwayConfigManager.catalogs[icao];
  const select = document.getElementById("selectMandatoryEntry");
  if (!catalog || !select) return;

  const rwy = catalog.runways[depRwyId];
  if (!rwy || !rwy.entries) return;

  let html = "";
  rwy.entries.forEach((entry, idx) => {
    const isSel = (entry.id === selectedEntryId || (!selectedEntryId && idx === 0)) ? "selected" : "";
    html += `<option value="${entry.id}" ${isSel}>TWY ${entry.name} - ${entry.desc}</option>`;
  });
  select.innerHTML = html;
}

function populateExitsChecklist(icao, arrRwyId, selectedExitIds = []) {
  const catalog = window.RunwayConfigManager.catalogs[icao];
  const container = document.getElementById("runwayExitsContainer");
  if (!catalog || !container) return;

  const rwy = catalog.runways[arrRwyId];
  if (!rwy || !rwy.exits) return;

  let html = "";
  rwy.exits.forEach(exit => {
    const isChecked = (selectedExitIds.length === 0 || selectedExitIds.includes(exit.id)) ? "checked" : "";
    html += `
      <label class="exit-checkbox-label">
        <input type="checkbox" value="${exit.id}" ${isChecked}>
        <span><b>${exit.name}</b> <small style="color: var(--text-muted);">(${exit.desc || 'Çıkış'})</small></span>
      </label>
    `;
  });

  container.innerHTML = html;

  container.querySelectorAll("input[type='checkbox']").forEach(cb => {
    cb.addEventListener("change", () => {
      clearPresetHighlight();
      updateModalSummaryPreview();
    });
  });
}

function updateModalSummaryPreview() {
  const bannerText = document.getElementById("runwayConfigSummaryText");
  const selectArr = document.getElementById("selectArrRunway");
  const selectDep = document.getElementById("selectDepRunway");
  const selectEntry = document.getElementById("selectMandatoryEntry");
  if (!bannerText || !selectArr || !selectDep) return;

  const arrVal = selectArr.options[selectArr.selectedIndex]?.text || selectArr.value;
  const depVal = selectDep.options[selectDep.selectedIndex]?.text || selectDep.value;
  const entryVal = selectEntry?.options[selectEntry.selectedIndex]?.text || selectEntry?.value || "";

  const checkedCount = document.querySelectorAll("#runwayExitsContainer input:checked").length;
  const totalCount = document.querySelectorAll("#runwayExitsContainer input").length;

  bannerText.innerHTML = `
    <b>İniş:</b> ${arrVal} (Kullanılabilir Çıkış: ${checkedCount}/${totalCount}) &nbsp;|&nbsp; 
    <b>Kalkış:</b> ${depVal} &nbsp;|&nbsp; 
    <b style="color: #fca5a5;">Zorunlu Giriş Taksi Yolu:</b> <span style="color: #fef08a; font-family: var(--font-mono); font-weight: bold;">${entryVal}</span>
  `;
}

function applyRunwayConfigFromModal() {
  if (!window.RunwayConfigManager) return;

  const selectArr = document.getElementById("selectArrRunway");
  const selectDep = document.getElementById("selectDepRunway");
  const selectEntry = document.getElementById("selectMandatoryEntry");

  const arrRunway = selectArr ? selectArr.value : null;
  const depRunway = selectDep ? selectDep.value : null;
  const mandatoryDepEntry = selectEntry ? selectEntry.value : null;

  const checkedBoxes = Array.from(document.querySelectorAll("#runwayExitsContainer input:checked"));
  let allowedExits = checkedBoxes.map(cb => cb.value);

  if (allowedExits.length === 0) {
    allowedExits = Array.from(document.querySelectorAll("#runwayExitsContainer input")).map(cb => cb.value);
  }

  // Update configuration in RunwayConfigManager
  window.RunwayConfigManager.updateCustomConfig(currentIcao, {
    arrRunway,
    depRunway,
    mandatoryDepEntry,
    allowedExits,
    exitMode: "flexible"
  });

  // Rebuild simulation trajectories immediately with zero disruption
  if (trafficSim) {
    trafficSim.rebuildFlightTrajectories();
  }

  closeRunwayModal();

  const cfg = window.RunwayConfigManager.getCurrentConfig(currentIcao);
  showToast(`Pist Operasyonu Güncellendi: ${cfg.arrRunway} İniş / ${cfg.depRunway} Kalkış (Zorunlu Giriş: ${cfg.mandatoryDepEntry.name})`);
}

function updateRunwayHeaderSummary(cfg) {
  const el = document.getElementById("headerRunwaySummary");
  if (!el || !cfg) return;
  const depHdg = cfg.depRunwayData?.heading || 354;
  const dir = (depHdg >= 300 || depHdg <= 60) ? "Kuzey" : "Güney";
  el.textContent = `${cfg.arrRunway} İniş / ${cfg.depRunway} Kalkış (${dir} Yönü)`;
}

function renderRunwayATCIndicators(cfg) {
  if (!runwayOverlayLayerGroup || !cfg) return;
  runwayOverlayLayerGroup.clearLayers();

  // 1. High-Visibility Departure Runway Plate on Map
  if (cfg.depRunwayData && cfg.depRunwayData.threshold) {
    const depHdg = cfg.depRunwayData.heading || 354;
    const depDirText = (depHdg >= 300 || depHdg <= 60) ? "KUZEYE DOĞRU" : "GÜNEYE DOĞRU";
    const depHtml = `
      <div class="atc-rwy-plate dep" title="Kalkış Pisti: ${cfg.depRunwayData.name}">
        <div class="rwy-plate-top">
          <span class="rwy-plate-badge">🛫 KALKIŞ PİSTİ</span>
          <span class="rwy-wind-chip">RÜZGAR UYUMLU</span>
        </div>
        <div class="rwy-plate-main">
          <span class="rwy-plate-name">${cfg.depRunwayData.name}</span>
          <span class="rwy-plate-heading">▲ ${depDirText} (${depHdg}°)</span>
        </div>
      </div>
    `;
    const depIcon = L.divIcon({
      html: depHtml,
      className: "atc-rwy-plate-container",
      iconSize: [210, 56],
      iconAnchor: [105, 28]
    });
    const depMarker = L.marker(cfg.depRunwayData.threshold, { icon: depIcon, zIndexOffset: 2500 })
      .bindTooltip(`<b>Aktif Kalkış Pisti: ${cfg.depRunwayData.name}</b><br>Kalkış Yönü: ${depDirText} (${depHdg}°)<br><span style="color:#38bdf8;">👉 Değiştirmek İçin Tıklayın</span>`, { direction: "top" })
      .on("click", () => openRunwayModal());
    runwayOverlayLayerGroup.addLayer(depMarker);
  }

  // 2. High-Visibility Arrival Runway Plate on Map
  if (cfg.arrRunwayData && cfg.arrRunwayData.touchdown) {
    const arrHdg = cfg.arrRunwayData.heading || 163;
    const arrDirText = (arrHdg >= 300 || arrHdg <= 60) ? "KUZEYE DOĞRU" : "GÜNEYE DOĞRU";
    const arrHtml = `
      <div class="atc-rwy-plate arr" title="İniş Pisti: ${cfg.arrRunwayData.name}">
        <div class="rwy-plate-top">
          <span class="rwy-plate-badge">🛬 İNİŞ PİSTİ</span>
          <span class="rwy-wind-chip">RÜZGAR UYUMLU</span>
        </div>
        <div class="rwy-plate-main">
          <span class="rwy-plate-name">${cfg.arrRunwayData.name}</span>
          <span class="rwy-plate-heading">▲ ${arrDirText} (${arrHdg}°)</span>
        </div>
      </div>
    `;
    const arrIcon = L.divIcon({
      html: arrHtml,
      className: "atc-rwy-plate-container",
      iconSize: [210, 56],
      iconAnchor: [105, 28]
    });
    const arrMarker = L.marker(cfg.arrRunwayData.touchdown, { icon: arrIcon, zIndexOffset: 2500 })
      .bindTooltip(`<b>Aktif İniş Pisti: ${cfg.arrRunwayData.name}</b><br>İniş Yönü: ${arrDirText} (${arrHdg}°)<br><span style="color:#38bdf8;">👉 Değiştirmek İçin Tıklayın</span>`, { direction: "top" })
      .on("click", () => openRunwayModal());
    runwayOverlayLayerGroup.addLayer(arrMarker);
  }
}

window.openRunwayModal = openRunwayModal;
window.closeRunwayModal = closeRunwayModal;

