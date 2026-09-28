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

function escapeHTML(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
window.escapeHTML = escapeHTML;

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

  // Weather widget minimize toggle
  const btnToggleWeather = document.getElementById("btnToggleWeatherWidget");
  const weatherWidget = document.getElementById("airportWeatherWidget");
  if (btnToggleWeather && weatherWidget) {
    btnToggleWeather.addEventListener("click", (e) => {
      e.stopPropagation();
      const isCompact = weatherWidget.classList.toggle("weather-compact");
      btnToggleWeather.textContent = isCompact ? "+" : "─";
      btnToggleWeather.title = isCompact ? "Hava Durumu Panelini Genişlet" : "Hava Durumu Panelini Küçült";
    });
  }

  // Mobile / Tablet sidebar drawer toggling
  const btnToggle = document.getElementById("btnToggleSidebar");
  const btnClose = document.getElementById("btnCloseSidebar");
  const backdrop = document.getElementById("sidebarBackdrop");
  const sidebar = document.querySelector(".sidebar");

  const openSidebar = () => {
    if (sidebar) {
      sidebar.classList.add("open");
      if (btnToggle) btnToggle.setAttribute("aria-expanded", "true");
    }
    if (backdrop) backdrop.classList.add("show");
  };

  const closeSidebar = () => {
    if (sidebar) {
      sidebar.classList.remove("open");
      if (btnToggle) btnToggle.setAttribute("aria-expanded", "false");
    }
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

  // Mobile Touch Swipe-to-dismiss gesture on sidebar drawer
  if (sidebar) {
    let touchStartX = 0;
    let touchStartY = 0;
    sidebar.addEventListener("touchstart", (e) => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }, { passive: true });

    sidebar.addEventListener("touchend", (e) => {
      const touchEndX = e.changedTouches[0].clientX;
      const touchEndY = e.changedTouches[0].clientY;
      const dx = touchEndX - touchStartX;
      const dy = touchEndY - touchStartY;
      if (dx > 60 && Math.abs(dx) > Math.abs(dy)) {
        closeSidebar();
      }
    }, { passive: true });
  }

  // Global Keyboard Navigation Shortcuts for ATC Ground Operators
  window.addEventListener("keydown", (e) => {
    const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : "";
    const isEditingText = activeTag === "input" || activeTag === "textarea" || activeTag === "select";

    // Escape key closes open modals, drawer, or deselects aircraft
    if (e.key === "Escape") {
      const runwayModal = document.getElementById("runwayModal");
      if (runwayModal && !runwayModal.classList.contains("hidden")) {
        closeRunwayModal();
        return;
      }
      const welcomeModal = document.getElementById("welcomeModal");
      if (welcomeModal && !welcomeModal.classList.contains("hidden") && welcomeModal.style.display !== "none") {
        closeWelcomeModal();
        return;
      }
      if (window.TaxiwayDirectionManager && window.TaxiwayDirectionManager.isEditModeActive) {
        window.TaxiwayDirectionManager.setEditMode(false);
        return;
      }
      if (selectedFlightId) {
        clearAircraftSelection();
        return;
      }
      if (sidebar && sidebar.classList.contains("open")) {
        closeSidebar();
        return;
      }
    }

    if (isEditingText) return;

    // Spacebar toggles simulation Play/Pause
    if (e.code === "Space" || e.key === " ") {
      e.preventDefault();
      if (window.setSimulationPlayback && trafficSim) {
        window.setSimulationPlayback(!trafficSim.isPlaying);
      }
    }
    // Number keys 1-6 for simulation speeds (1x, 2x, 5x, 10x, 30x, 60x)
    else if (["1", "2", "3", "4", "5", "6"].includes(e.key) && trafficSim) {
      const speedMap = { "1": 1, "2": 2, "3": 5, "4": 10, "5": 30, "6": 60 };
      const speed = speedMap[e.key];
      trafficSim.setSpeed(speed);
      document.querySelectorAll(".speed-btn").forEach(b => {
        b.classList.toggle("active", parseInt(b.dataset.speed, 10) === speed);
      });
      showToast(`⚡ Simülasyon hızı: ${speed}x`);
    }
    // Key R: Toggle Runway Configuration modal
    else if (e.key === "r" || e.key === "R") {
      const runwayModal = document.getElementById("runwayModal");
      if (runwayModal && !runwayModal.classList.contains("hidden")) {
        closeRunwayModal();
      } else {
        openRunwayModal();
      }
    }
    // Key T: Toggle Taxiway Direction Editor
    else if (e.key === "t" || e.key === "T") {
      if (window.TaxiwayDirectionManager) {
        window.TaxiwayDirectionManager.toggleEditMode();
      }
    }
  });

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
      e.target.value = "";
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

  // Compact weather widget to prevent overlap
  const weatherWidget = document.getElementById("airportWeatherWidget");
  if (weatherWidget) {
    weatherWidget.classList.add("weather-compact");
    const minBtn = document.getElementById("btnToggleWeatherWidget");
    if (minBtn) {
      minBtn.textContent = "+";
      minBtn.title = "Hava Durumu Panelini Genişlet";
    }
  }

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

  // Update ADS-B Live Badge in HUD
  const hudAdsbBadge = document.getElementById("hudAdsbBadge");
  if (hudAdsbBadge) {
    hudAdsbBadge.classList.toggle("hidden", !flight.isLiveADSB);
    if (flight.isLiveADSB) {
      hudAdsbBadge.title = `OpenSky ADS-B Canlı Radar ile Tespit Edildi (ICAO24: ${flight.adsbTelemetry?.icao24 || 'N/A'})`;
    }
  }

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

  // Restore weather widget to full view
  const weatherWidget = document.getElementById("airportWeatherWidget");
  if (weatherWidget) {
    weatherWidget.classList.remove("weather-compact");
    const minBtn = document.getElementById("btnToggleWeatherWidget");
    if (minBtn) {
      minBtn.textContent = "─";
      minBtn.title = "Hava Durumu Panelini Küçült";
    }
  }

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

  const hudAdsbBadge = document.getElementById("hudAdsbBadge");
  if (hudAdsbBadge) {
    hudAdsbBadge.classList.toggle("hidden", !flight.isLiveADSB);
  }

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

    if (flight.queueReason === "following") {
      phaseElem.textContent = "Ön-Arka Takip";
      if (longStatus) {
        longStatus.className = "rule-status warn";
        longStatus.textContent = `Öndeki Uçak Bekleniyor (${flight.conflictWith || 'Trafik'})`;
      }
      if (latStatus) {
        latStatus.className = "rule-status ok";
        latStatus.textContent = `Fiziksel Ayrım Korunuyor`;
      }
      if (safetyDetail) {
        safetyDetail.classList.remove("hidden");
        safetyDetail.textContent = `⚠️ Yer Hareketi: Öndeki uçak (${flight.conflictWith || 'Trafik'}) ile fiziksel temas önleme mesafesi (< 24m) nedeniyle bekleniyor.`;
      }
    } else if (flight.queueReason === "junction_yield") {
      phaseElem.textContent = "Kavşak Yol Verme";
      if (longStatus) {
        longStatus.className = "rule-status warn";
        longStatus.textContent = `Düz Gelen Trafik Öncelikli`;
      }
      if (latStatus) {
        latStatus.className = "rule-status warn";
        latStatus.textContent = `Yol Veriliyor (${flight.conflictWith || 'Trafik'})`;
      }
      if (safetyDetail) {
        safetyDetail.classList.remove("hidden");
        safetyDetail.textContent = `⚠️ Kavşak Önceliği: Ana hatta düz devam eden trafiğe (${flight.conflictWith || 'Trafik'}) otomatik öncelik verildi; geçişi bekleniyor.`;
      }
    } else if (flight.queueReason === "takeoff_separation") {
      phaseElem.textContent = "Pist Beklemesi (Hold)";
      if (longStatus) {
        longStatus.className = "rule-status warn";
        longStatus.textContent = `Pist İniş/Kalkış Beklemesi`;
      }
      if (latStatus) {
        latStatus.className = "rule-status ok";
        latStatus.textContent = `Pist Başı Hazır`;
      }
      if (safetyDetail) {
        safetyDetail.classList.remove("hidden");
        safetyDetail.textContent = `⚠️ Pist Trafiği: ${flight.conflictWith || 'Pistteki uçak'} iniş/kalkış koşusunu tamamlayıp pisti terk edene kadar bekleme noktasında tutuluyor.`;
      }
    } else {
      phaseElem.textContent = "Taksi Sırasında";
      if (longStatus) longStatus.textContent = `Taksi Sırasında Bekliyor`;
      if (latStatus) latStatus.textContent = `Fiziksel Ayrım Korunuyor`;
      if (safetyDetail) {
        safetyDetail.classList.remove("hidden");
        safetyDetail.textContent = `Taksi yolu yer akışı gereğince bekleniyor.`;
      }
    }
  } else {
    phaseElem.style.borderColor = "";
    phaseElem.style.color = "";
    phaseElem.style.background = "";

    if (safetyBadge) {
      safetyBadge.className = "hud-safety-badge safe";
      safetyBadge.textContent = "AKICI (PİST & KAVŞAK AÇIK)";
    }
    if (longStatus) {
      longStatus.className = "rule-status ok";
      longStatus.textContent = `Mesafe Korunuyor (Serbest)`;
    }
    if (latStatus) {
      latStatus.className = "rule-status ok";
      latStatus.textContent = `Kavşak & Pist Açık`;
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

  flight.twySequence.forEach((name, idx) => {
    if (idx > 0) {
      html += `<span class="twy-arrow">➔</span>`;
    }
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
  const digitalDateEl = document.getElementById("digitalDate");
  const startText = document.getElementById("timelineStartText");
  const endText = document.getElementById("timelineEndText");

  // Format real-world date and start/end labels
  if (startText) startText.textContent = `Şimdi (${trafficSim.getWallClockTimeHM(0)})`;
  if (endText) endText.textContent = `+24 Sa (${trafficSim.getWallClockTimeHM(86400)})`;
  if (digitalDateEl) digitalDateEl.textContent = `📅 ${trafficSim.getWallDateFormatted()}`;
  if (clock) clock.textContent = trafficSim.getWallClockTime();

  if (slider) {
    slider.min = "0";
    slider.max = "86400";
    slider.value = Math.floor(trafficSim.simSeconds);
  }

  // Quick-sync jump to current real-world time of day (CANLI / ANLIK)
  const handleLiveSync = () => {
    trafficSim.snapToRealTime();
    document.querySelectorAll(".speed-btn").forEach(b => {
      b.classList.toggle("active", parseInt(b.dataset.speed, 10) === 1);
    });
    if (clock) clock.textContent = trafficSim.getWallClockTime();
    if (slider) slider.value = Math.floor(trafficSim.simSeconds);
    if (digitalDateEl) digitalDateEl.textContent = `📅 ${trafficSim.getWallDateFormatted()}`;
    showToast(`🟢 Simülasyon saati anlık gerçek zamana (${trafficSim.getWallClockTime()}) eşitlendi.`);
  };

  const btnLiveSync = document.getElementById("btnLiveSync");
  if (btnLiveSync) btnLiveSync.addEventListener("click", handleLiveSync);

  const btnJumpLive = document.getElementById("btnJumpLiveNow");
  if (btnJumpLive) btnJumpLive.addEventListener("click", handleLiveSync);

  // OpenSky ADS-B Header Telemetry Button Click
  const btnHeaderAdsb = document.getElementById("btnHeaderAdsb");
  if (btnHeaderAdsb) {
    btnHeaderAdsb.addEventListener("click", () => {
      const feed = trafficSim?.liveFeed;
      const count = feed ? feed.detectedLiveAircraft.size : 0;
      const status = feed?.lastStatus || "Aktif";
      const src = feed?.sourceUsed || "OpenSky Network API";
      showToast(`📡 OpenSky ADS-B Radar: ${status} | Kaynak: ${src}`);
    });
  }

  // Listen to OpenSky ADS-B updates
  if (trafficSim.liveFeed) {
    trafficSim.liveFeed.onUpdate((feedData) => {
      const headerAdsbSummary = document.getElementById("headerAdsbSummary");
      if (headerAdsbSummary) {
        headerAdsbSummary.textContent = feedData.count > 0 ? `CANLI (${feedData.count} Uçak)` : `CANLI (Taranıyor...)`;
      }
      const flightsTab = document.getElementById("tab-flights");
      if (flightsTab && flightsTab.classList.contains("active")) {
        const searchInput = document.getElementById("flightSearchInput");
        if (document.activeElement !== searchInput && typeof renderFlightsList === "function") {
          renderFlightsList(searchInput?.value || "", false);
        }
      }
    });
  }

  window.setSimulationPlayback = function(play) {
    if (!trafficSim) return;
    if (play) {
      trafficSim.start();
      if (btnPlay) {
        btnPlay.textContent = "⏸";
        btnPlay.title = "Duraklat";
      }
    } else {
      trafficSim.pause();
      if (btnPlay) {
        btnPlay.textContent = "▶";
        btnPlay.title = "Oynat";
      }
    }
  };

  if (btnPlay) {
    btnPlay.addEventListener("click", () => {
      window.setSimulationPlayback(!trafficSim.isPlaying);
    });
  }

  // Speed multiplier buttons (1x, 2x, 5x, 10x, 30x, 60x)
  document.querySelectorAll(".speed-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".speed-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const speed = parseInt(btn.dataset.speed, 10) || 1;
      trafficSim.setSpeed(speed);
      showToast(`⚡ Simülasyon hızı: ${speed}x`);
    });
  });

  // Slider dragging
  if (slider) {
    slider.addEventListener("mousedown", () => { isUserScrubbingTimeline = true; });
    slider.addEventListener("touchstart", () => { isUserScrubbingTimeline = true; });

    slider.addEventListener("input", (e) => {
      const sec = parseInt(e.target.value, 10);
      trafficSim.setTime(sec);
      if (clock) clock.textContent = trafficSim.getWallClockTime(sec);
      if (digitalDateEl) digitalDateEl.textContent = `📅 ${trafficSim.getWallDateFormatted(sec)}`;
    });
  }

  const stopScrubbing = () => { isUserScrubbingTimeline = false; };
  window.addEventListener("mouseup", stopScrubbing);
  window.addEventListener("touchend", stopScrubbing);

  // Simulation tick callback
  trafficSim.onTick((data) => {
    if (clock) clock.textContent = data.wallClockTime || data.timeFormatted;
    if (digitalDateEl && data.wallDateFormatted) {
      digitalDateEl.textContent = `📅 ${data.wallDateFormatted}`;
    }
    if (!isUserScrubbingTimeline && slider) {
      slider.value = Math.floor(data.simSeconds);
    }

    // Header ADS-B summary
    const headerAdsbSummary = document.getElementById("headerAdsbSummary");
    if (headerAdsbSummary) {
      const count = data.liveAdsbCount !== undefined ? data.liveAdsbCount : (trafficSim.liveFeed ? trafficSim.liveFeed.detectedLiveAircraft.size : 0);
      headerAdsbSummary.textContent = count > 0 ? `CANLI (${count} Uçak)` : `CANLI (Taranıyor...)`;
    }

    // Traffic metrics
    const c = data.counts;
    const totalDayEl = document.getElementById("trafficTotalDay");
    if (totalDayEl) totalDayEl.textContent = data.totalFlightsInSchedule || 0;
    const appEl = document.getElementById("trafficApproaching");
    if (appEl) appEl.textContent = c.approaching;
    const taxiEl = document.getElementById("trafficTaxiing");
    if (taxiEl) taxiEl.textContent = c.taxiing;
    const standEl = document.getElementById("trafficOnStand");
    if (standEl) standEl.textContent = c.on_stand;
    const depEl = document.getElementById("trafficTakeoff");
    if (depEl) depEl.textContent = c.takeoff;
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
      const startText = document.getElementById("timelineStartText");
      const endText = document.getElementById("timelineEndText");
      if (startText) startText.textContent = `Şimdi (${trafficSim.getWallClockTimeHM(0)})`;
      if (endText) endText.textContent = `+24 Sa (${trafficSim.getWallClockTimeHM(86400)})`;
    }

    if (window.TaxiwayDirectionManager) {
      if (typeof window.TaxiwayDirectionManager.registerAirportFeatures === "function") {
        window.TaxiwayDirectionManager.registerAirportFeatures(rawAirportGeoJSON, icao);
      }
      if (typeof window.TaxiwayDirectionManager.refreshOverlay === "function") {
        window.TaxiwayDirectionManager.refreshOverlay(rawAirportGeoJSON, icao);
      }
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
    const shortName = icao === "LTFM" ? "LTFM · IST" : "LTFJ · SAW";
    updateStatus(`${shortName} · ${count.toLocaleString('tr-TR')} Unsur`, "ready");
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
      layer.bindTooltip(`Taksi Yolu: <b>${props.ref || props.name || "TWY"}</b><br><span style="color: #38bdf8;">👉 Yön Belirlemek İçin Tıklayın</span>`, {
        sticky: true
      });
      layer.on("click", (e) => {
        if (e && e.originalEvent) L.DomEvent.stopPropagation(e);
        if (window.TaxiwayDirectionManager) {
          if (!window.TaxiwayDirectionManager.isEditModeActive) {
            window.TaxiwayDirectionManager.setEditMode(true);
          }
          window.TaxiwayDirectionManager.handleTaxiwayClick(feature, layer, e.latlng);
        }
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
  const subText = custom.flight ? `<span class="stand-marker-sub">${escapeHTML(custom.flight)}</span>` : "";

  const icon = L.divIcon({
    className: "stand-custom-icon",
    html: `
      <div id="marker_${standObj.id}" class="stand-marker-badge ${statusClass}">
        <span>${escapeHTML(standObj.ref)}</span>
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
      <b style="color: #38bdf8; font-size: 13px;">STAND ${escapeHTML(standObj.ref)}</b><br>
      Durum: <b>${statusLabels[c.status] || "BOŞ"}</b><br>
      ${c.flight ? `Uçuş: <b style="color: #f59e0b;">${escapeHTML(c.flight)}</b><br>` : ""}
      ${c.aircraft ? `Uçak: ${escapeHTML(c.aircraft)}<br>` : ""}
      ${c.timeIn ? `Varış: ${escapeHTML(c.timeIn)} | Kalkış: ${escapeHTML(c.timeOut || '-')}<br>` : ""}
      ${c.notes ? `<small style="color: #94a3b8;">${escapeHTML(c.notes)}</small>` : ""}
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
        <span class="stand-id">${escapeHTML(stand.ref)}</span>
        <span class="card-status-dot" style="background-color: ${dotColor}"></span>
      </div>
      ${stand.customData.flight ? `<div class="stand-flight">${escapeHTML(stand.customData.flight)}</div>` : `<div style="font-size: 11px; color: var(--text-dim);">Boş</div>`}
      ${stand.customData.aircraft ? `<div class="stand-aircraft">${escapeHTML(stand.customData.aircraft)}</div>` : ""}
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
          ${f.isLiveADSB ? '<span class="flight-card-badge-adsb" title="OpenSky ADS-B Radar ile Canlı Tespit Edildi">🟢 CANLI ADS-B</span>' : ''}
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
    } finally {
      e.target.value = "";
    }
  };
  reader.readAsText(file);
}

function updateStatus(text, state = "ready") {
  const el = document.getElementById("statusText");
  const dot = document.querySelector(".status-dot");
  const badge = document.querySelector(".status-badge");
  if (el) el.textContent = text;
  if (badge) badge.title = `Operasyon Durumu: ${text}`;

  if (dot) {
    if (state === "loading") {
      dot.style.backgroundColor = "var(--accent-amber)";
      if (badge) {
        badge.style.color = "var(--accent-amber)";
        badge.style.borderColor = "rgba(245, 158, 11, 0.4)";
        badge.style.background = "rgba(245, 158, 11, 0.12)";
      }
    } else if (state === "error") {
      dot.style.backgroundColor = "var(--accent-red)";
      if (badge) {
        badge.style.color = "var(--accent-red)";
        badge.style.borderColor = "rgba(239, 68, 68, 0.4)";
        badge.style.background = "rgba(239, 68, 68, 0.12)";
      }
    } else {
      dot.style.backgroundColor = "var(--accent-green)";
      if (badge) {
        badge.style.color = "var(--accent-green)";
        badge.style.borderColor = "rgba(16, 185, 129, 0.35)";
        badge.style.background = "rgba(16, 185, 129, 0.12)";
      }
    }
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
   MULTI-RUNWAY OPERATIONS & TRAFFIC DISTRIBUTION (ATC CONTROL)
   ========================================================================== */

function setupRunwayConfigEvents() {
  const btnOpen = document.getElementById("btnRunwayModalOpen");
  const btnClose = document.getElementById("btnCloseRunwayModal");
  const btnCancel = document.getElementById("btnCancelRunwayModal");
  const btnApply = document.getElementById("btnApplyRunwayConfig");
  const modal = document.getElementById("runwayModal");

  if (btnOpen) btnOpen.addEventListener("click", () => openRunwayModal());
  if (btnClose) btnClose.addEventListener("click", closeRunwayModal);
  if (btnCancel) btnCancel.addEventListener("click", closeRunwayModal);

  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeRunwayModal();
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

function openRunwayModal(preselectComplexId = null) {
  if (!window.RunwayConfigManager) return;
  const cfg = window.RunwayConfigManager.getCurrentConfig(currentIcao);

  populatePresetButtons(currentIcao, cfg.preset);
  populateMultiRunwayGrid(currentIcao);
  updateMultiRunwaySummary(currentIcao);

  const modal = document.getElementById("runwayModal");
  if (modal) modal.classList.remove("hidden");

  if (preselectComplexId) {
    setTimeout(() => {
      const card = document.querySelector(`.runway-card-item[data-complex-id='${preselectComplexId}']`);
      if (card) {
        card.scrollIntoView({ behavior: "smooth", block: "center" });
        card.classList.add("highlight-card");
        setTimeout(() => card.classList.remove("highlight-card"), 1600);
      }
    }, 100);
  }
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
      container.querySelectorAll(".btn-preset").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      window.RunwayConfigManager.applyPreset(icao, pId);
      populateMultiRunwayGrid(icao);
      updateMultiRunwaySummary(icao);
    });
  });
}

function populateMultiRunwayGrid(icao) {
  const container = document.getElementById("multiRunwayCardsGrid");
  if (!container || !window.RunwayConfigManager) return;

  const complexes = window.RunwayConfigManager.getAllRunwayComplexes(icao);
  let html = "";

  complexes.forEach(c => {
    const curRwy = c.currentRwyData || {};
    const hdg = curRwy.heading || 0;
    const isNorth = (hdg >= 300 || hdg <= 60);
    const dirText = isNorth ? "Kuzey" : "Güney";
    const statusClass = c.active ? "active" : "passive";
    const role = c.role || "dep";

    html += `
      <div class="runway-card-item ${statusClass}" data-complex-id="${c.id}">
        <div class="rwy-card-header">
          <div class="rwy-name-box">
            <span class="rwy-header-icon">${role === 'arr' ? '🛬' : (role === 'both' ? '🔄' : '🛫')}</span>
            <div class="rwy-title-col">
              <span class="rwy-title">${c.name}</span>
              <span class="rwy-badge-role ${role}">${role === 'dep' ? 'Kalkış Pisti' : (role === 'arr' ? 'İniş Pisti' : 'Karma Pist (DEP+ARR)')}</span>
            </div>
          </div>
          <button type="button" class="btn-rwy-status ${c.active ? 'is-active' : 'is-passive'}" data-action="toggle-active">
            ${c.active ? '🟢 AKTİF' : '⚪ PASİF'}
          </button>
        </div>

        <div class="rwy-card-body">
          <!-- Direction Switcher -->
          <div class="rwy-control-row">
            <span class="rwy-row-label">Operasyon Yönü:</span>
            <div class="rwy-dir-action-group">
              <span class="rwy-dir-display">
                <b>Pist ${c.selectedDirection}</b> (${hdg}° · ${dirText})
              </span>
              <button type="button" class="btn-flip-dir" data-action="flip-direction" title="Pistin başını ve sonunu tersine çevir">
                ⇄ Yönü Değiştir (${c.otherDirection})
              </button>
            </div>
          </div>

          <!-- Role Selection (DEP / ARR / BOTH) -->
          <div class="rwy-control-row">
            <span class="rwy-row-label">Pist Rolü:</span>
            <div class="rwy-role-pills">
              <button type="button" class="btn-role-pill ${role === 'dep' ? 'active dep' : ''}" data-role="dep" title="Yalnızca Kalkış">
                🛫 Sadece Kalkış
              </button>
              <button type="button" class="btn-role-pill ${role === 'arr' ? 'active arr' : ''}" data-role="arr" title="Yalnızca İniş">
                🛬 Sadece İniş
              </button>
              <button type="button" class="btn-role-pill ${role === 'both' ? 'active both' : ''}" data-role="both" title="Kalkış ve İniş Birlikte">
                🔄 Çift Yönlü Karma
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;

  // Attach interactive listeners to each runway card
  container.querySelectorAll(".runway-card-item").forEach(card => {
    const complexId = card.dataset.complexId;

    // Toggle Active / Passive
    const btnStatus = card.querySelector("[data-action='toggle-active']");
    if (btnStatus) {
      btnStatus.addEventListener("click", () => {
        window.RunwayConfigManager.toggleRunwayActive(complexId, icao);
        populateMultiRunwayGrid(icao);
        updateMultiRunwaySummary(icao);
        clearPresetHighlight();
      });
    }

    // Flip Direction (e.g. 16R ⇄ 34L or 35R ⇄ 17L)
    const btnFlip = card.querySelector("[data-action='flip-direction']");
    if (btnFlip) {
      btnFlip.addEventListener("click", () => {
        window.RunwayConfigManager.flipRunwayDirection(complexId, icao);
        populateMultiRunwayGrid(icao);
        updateMultiRunwaySummary(icao);
        clearPresetHighlight();
      });
    }

    // Role Buttons
    card.querySelectorAll(".btn-role-pill").forEach(pill => {
      pill.addEventListener("click", () => {
        const role = pill.dataset.role;
        window.RunwayConfigManager.setRunwayRole(complexId, role, icao);
        populateMultiRunwayGrid(icao);
        updateMultiRunwaySummary(icao);
        clearPresetHighlight();
      });
    });
  });
}

function updateMultiRunwaySummary(icao) {
  const bannerText = document.getElementById("runwayConfigSummaryText");
  if (!bannerText || !window.RunwayConfigManager) return;

  const depRunways = window.RunwayConfigManager.getActiveDepRunways(icao);
  const arrRunways = window.RunwayConfigManager.getActiveArrRunways(icao);
  const complexes = window.RunwayConfigManager.getAllRunwayComplexes(icao);
  const activeCount = complexes.filter(c => c.active).length;

  const depNames = depRunways.map(r => r.id).join(", ") || "Yok";
  const arrNames = arrRunways.map(r => r.id).join(", ") || "Yok";

  bannerText.innerHTML = `
    <b>⚡ ${activeCount} Pist Aktif</b> &nbsp;|&nbsp; 
    <span style="color: #6ee7b7;">🛬 İniş: <b>${arrNames}</b></span> &nbsp;|&nbsp; 
    <span style="color: #fde047;">🛫 Kalkış: <b>${depNames}</b></span> &nbsp;|&nbsp; 
    <small style="color: #94a3b8;">Uçaklar stand konumlarına göre en yakın aktif piste otomatik dağıtılır.</small>
  `;
}

function applyRunwayConfigFromModal() {
  if (!window.RunwayConfigManager) return;

  window.RunwayConfigManager.syncActiveConfig(currentIcao);
  window.RunwayConfigManager.notifyChange(currentIcao);

  // Recalculate and redistribute all flight trajectories immediately
  if (trafficSim) {
    trafficSim.rebuildFlightTrajectories();
  }

  closeRunwayModal();

  const depRunways = window.RunwayConfigManager.getActiveDepRunways(currentIcao);
  const arrRunways = window.RunwayConfigManager.getActiveArrRunways(currentIcao);
  showToast(`⚡ Çoklu Pist Operasyonu Güncellendi: İniş [${arrRunways.map(r => r.id).join(', ')}] / Kalkış [${depRunways.map(r => r.id).join(', ')}]`);
}

function updateRunwayHeaderSummary(cfg) {
  const el = document.getElementById("headerRunwaySummary");
  const btn = document.getElementById("btnRunwayModalOpen");
  if (!el || !cfg || !window.RunwayConfigManager) return;
  const depList = window.RunwayConfigManager.getActiveDepRunways(currentIcao).map(r => r.id);
  const arrList = window.RunwayConfigManager.getActiveArrRunways(currentIcao).map(r => r.id);
  const totalActive = window.RunwayConfigManager.getAllRunwayComplexes(currentIcao).filter(c => c.active).length;
  el.textContent = `${totalActive} Pist · ${arrList[0] || '16R'} 🛬 / ${depList[0] || '17L'} 🛫`;
  if (btn) {
    btn.title = `Pist Yönetimi: ${totalActive} Pist Aktif (İniş: ${arrList.join('/')} · Kalkış: ${depList.join('/')})`;
  }
}

function renderRunwayATCIndicators(cfg) {
  if (!runwayOverlayLayerGroup || !window.RunwayConfigManager) return;
  runwayOverlayLayerGroup.clearLayers();

  const complexes = window.RunwayConfigManager.getAllRunwayComplexes(currentIcao);

  complexes.forEach(c => {
    const curRwy = c.currentRwyData;
    if (!curRwy) return;

    let pos = curRwy.threshold;
    if (c.active && c.role === "arr" && curRwy.touchdown) {
      pos = curRwy.touchdown;
    } else if (!c.active && curRwy.threshold && curRwy.rolloutEnd) {
      pos = [(curRwy.threshold[0] + curRwy.rolloutEnd[0]) * 0.5, (curRwy.threshold[1] + curRwy.rolloutEnd[1]) * 0.5];
    }

    const hdg = curRwy.heading || 0;
    const isNorth = (hdg >= 300 || hdg <= 60);
    const dirArrow = isNorth ? "▲" : "▼";
    const dirText = isNorth ? "KUZEY" : "GÜNEY";

    let roleBadge = "⚪ PASİF (KAPALI)";
    let plateClass = "passive";

    if (c.active) {
      if (c.role === "dep") {
        roleBadge = "🛫 KALKIŞ (DEP)";
        plateClass = "dep";
      } else if (c.role === "arr") {
        roleBadge = "🛬 İNİŞ (ARR)";
        plateClass = "arr";
      } else {
        roleBadge = "🔄 KARMA (DEP+ARR)";
        plateClass = "both";
      }
    }

    const html = `
      <div class="atc-rwy-plate ${plateClass}" title="${c.name} - Ayarlamak için tıklayın">
        <div class="rwy-plate-top">
          <span class="rwy-plate-badge">${roleBadge}</span>
          <span class="rwy-wind-chip">${c.active ? 'AKTİF' : 'DEVRE DIŞI'}</span>
        </div>
        <div class="rwy-plate-main">
          <span class="rwy-plate-name">${c.selectedDirection}</span>
          <span class="rwy-plate-heading">${dirArrow} ${dirText} (${hdg}°)</span>
        </div>
      </div>
    `;

    const icon = L.divIcon({
      html: html,
      className: "atc-rwy-plate-container",
      iconSize: [210, 56],
      iconAnchor: [105, 28]
    });

    const marker = L.marker(pos, { icon: icon, zIndexOffset: 2500 })
      .bindTooltip(`<b>${c.name}</b><br>Durum: ${c.active ? 'Aktif' : 'Pasif'}<br>Yön: ${c.selectedDirection} (${dirText})<br>Rol: ${c.role.toUpperCase()}<br><span style="color:#38bdf8;">👉 Değiştirmek / Yönetmek İçin Tıklayın</span>`, { direction: "top" })
      .on("click", () => openRunwayModal(c.id));

    runwayOverlayLayerGroup.addLayer(marker);
  });
}

window.openRunwayModal = openRunwayModal;
window.closeRunwayModal = closeRunwayModal;

