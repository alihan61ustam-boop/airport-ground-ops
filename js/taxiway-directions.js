/**
 * Taxiway Traffic Flow Direction Management Engine (One-Way Taxiway System)
 * 
 * Supports:
 * - Direct Map-Click Interaction on ANY orange taxiway segment across the entire airport
 * - Visual supersonic directional arrow indicators on the asphalt centerline
 * - Seamless toggle between [AKTİF] (Interactive Editing) and [PASİF] (Clean Normal Operation)
 * - Automatic route recalculation in Dijkstra graph
 * - Alternating one-way corridors and airport-wide presets
 */

class TaxiwayDirectionManager {
  constructor() {
    this.airportIcao = "LTFM";
    this.isEditModeActive = false;
    this.wasSimPlayingBeforeEdit = false;
    this.hasPendingRouteChanges = false;
    this.map = null;

    // Map layer groups
    this.editInteractiveLayer = null; // Thick hoverable click targets for edit mode
    this.arrowLayerGroup = null;       // Directional arrow markers on the roads

    // Storage for user-designated directions:
    // featId -> "FORWARD" | "REVERSE" | "BIDIRECTIONAL"
    this.featureDirections = new Map();

    // ref -> "FORWARD" | "REVERSE" | "WEST_TO_EAST" | "EAST_TO_WEST"
    this.refDirections = new Map();

    // Registered airport taxiways catalog
    this.taxiways = [];
    this.taxiwaysById = new Map();
    this.taxiwayPolylines = new Map(); // featId -> L.polyline

    // Fallback corridor configurations for presets
    this.corridors = {
      LTFM: [
        { id: "LTFM_ROW_1", name: "Güney Paralel 1 (TWY A1/C1B)", minLat: 41.2638, maxLat: 41.2662, minLon: 28.7120, maxLon: 28.7420, direction: "WEST_TO_EAST", label: "Row 1 (A1)" },
        { id: "LTFM_ROW_2", name: "Güney Paralel 2 (TWY A3/A4)", minLat: 41.2663, maxLat: 41.2678, minLon: 28.7100, maxLon: 28.7450, direction: "EAST_TO_WEST", label: "Row 2 (A3/A4)" },
        { id: "LTFM_ROW_3", name: "Merkez Paralel 1 (TWY N1/NW/NE)", minLat: 41.2679, maxLat: 41.2695, minLon: 28.7100, maxLon: 28.7450, direction: "WEST_TO_EAST", label: "Row 3 (N1)" },
        { id: "LTFM_ROW_4", name: "Merkez Paralel 2 (TWY N2/N3)", minLat: 41.2696, maxLat: 41.2718, minLon: 28.7100, maxLon: 28.7450, direction: "EAST_TO_WEST", label: "Row 4 (N2/N3)" },
        { id: "LTFM_ROW_5", name: "Kuzey Paralel 1 (TWY N4/N5)", minLat: 41.2719, maxLat: 41.2745, minLon: 28.7100, maxLon: 28.7450, direction: "WEST_TO_EAST", label: "Row 5 (N4/N5)" },
        { id: "LTFM_ROW_6", name: "Kuzey Paralel 2 (TWY N6)", minLat: 41.2746, maxLat: 41.2780, minLon: 28.7100, maxLon: 28.7450, direction: "EAST_TO_WEST", label: "Row 6 (N6)" }
      ],
      LTFJ: [
        { id: "LTFJ_ROW_1", name: "Ana Paralel Taksi Yolu (TWY A)", minLat: 40.8900, maxLat: 40.9060, minLon: 29.2980, maxLon: 29.3300, direction: "WEST_TO_EAST", label: "TWY A" },
        { id: "LTFJ_ROW_2", name: "İç Apron Taksi Yolu (TWY B)", minLat: 40.8950, maxLat: 40.9100, minLon: 29.3050, maxLon: 29.3250, direction: "EAST_TO_WEST", label: "TWY B" }
      ]
    };
  }

  initMapOverlay(map) {
    if (!map) return;
    this.map = map;
    if (!this.editInteractiveLayer) {
      this.editInteractiveLayer = L.layerGroup();
    }
    if (!this.arrowLayerGroup) {
      this.arrowLayerGroup = L.layerGroup();
    }
    this.updateUI();
  }

  /**
   * Refreshes or reloads the overlay with current or new GeoJSON
   */
  refreshOverlay(geojson, icao) {
    if (geojson) {
      this.registerAirportFeatures(geojson, icao || this.airportIcao);
    } else if (this.isEditModeActive) {
      this.renderAllArrows();
    }
  }

  get isEditMode() {
    return this.isEditModeActive;
  }

  set isEditMode(val) {
    this.setEditMode(val);
  }

  /**
   * Registers all taxiway features from the loaded GeoJSON
   */
  registerAirportFeatures(geojson, icao = "LTFM") {
    if (!geojson) return;
    this.airportIcao = (icao === "LTFM") ? "LTFM" : "LTFJ";
    this.taxiways = [];
    this.taxiwaysById.clear();
    this.taxiwayPolylines.clear();

    if (!this.map && window.map) {
      this.map = window.map;
    }
    if (this.map && !this.map.getPane("taxiEditPane")) {
      const p = this.map.createPane("taxiEditPane");
      p.style.zIndex = "620";
    }
    if (!this.editInteractiveLayer && (this.map || window.map)) {
      this.editInteractiveLayer = L.layerGroup();
    }
    if (!this.arrowLayerGroup && (this.map || window.map)) {
      this.arrowLayerGroup = L.layerGroup();
    }

    if (this.editInteractiveLayer) {
      this.editInteractiveLayer.clearLayers();
    }
    if (this.arrowLayerGroup) {
      this.arrowLayerGroup.clearLayers();
    }

    const features = geojson.features || [];
    let idx = 0;

    features.forEach(f => {
      if (f.properties?.aeroway === "taxiway" && f.geometry?.type === "LineString") {
        idx++;
        const featId = f.properties?.id ? String(f.properties.id) : (f.id ? String(f.id) : `twy_${idx}`);
        f._assignedId = featId;

        this.taxiways.push(f);
        this.taxiwaysById.set(featId, f);

        // Build interactive polyline for Edit Mode
        if (this.editInteractiveLayer && f.geometry.coordinates?.length >= 2) {
          const latLngs = f.geometry.coordinates.map(c => [c[1], c[0]]);

          // Generous thick line for effortless click detection (24px hit target)
          const hitLine = L.polyline(latLngs, {
            pane: "taxiEditPane",
            color: "#00f0ff",
            weight: 24,
            opacity: 0.05,
            interactive: true,
            className: "taxi-interactive-hit"
          });

          // Visible outline line that lights up on hover
          const highlightLine = L.polyline(latLngs, {
            pane: "taxiEditPane",
            color: "#00f0ff",
            weight: 6,
            opacity: 0,
            interactive: false,
            className: "taxi-interactive-highlight"
          });

          const refName = f.properties.ref || f.properties.name || "Taksi Yolu";

          hitLine.on("mouseover", () => {
            if (this.isEditModeActive) {
              highlightLine.setStyle({ opacity: 0.95 });
            }
          });

          hitLine.on("mouseout", () => {
            if (this.isEditModeActive) {
              highlightLine.setStyle({ opacity: 0 });
            }
          });

          hitLine.on("click", (e) => {
            if (this.isEditModeActive) {
              L.DomEvent.stopPropagation(e);
              this.handleTaxiwayClick(f, highlightLine, e.latlng);
            }
          });

          hitLine.bindTooltip(`<b>${refName}</b><br><span style="color: #38bdf8;">👉 Tıkla: Yön Belirle</span>`, {
            sticky: true,
            className: "taxi-edit-tooltip"
          });

          this.editInteractiveLayer.addLayer(highlightLine);
          this.editInteractiveLayer.addLayer(hitLine);
          this.taxiwayPolylines.set(featId, highlightLine);
        }
      }
    });

    console.log(`[TaxiwayDirectionManager] Registered ${this.taxiways.length} interactive taxiways for ${this.airportIcao}`);

    if (this.isEditModeActive) {
      this.renderAllArrows();
    }
  }

  /**
   * Toggles Edit Mode between AKTİF and PASİF
   */
  setEditMode(isActive) {
    const nextActive = !!isActive;
    if (this.isEditModeActive === nextActive) return;

    this.isEditModeActive = nextActive;

    if (this.isEditModeActive) {
      // 1. Simülasyon saatini ve zaman akışını durdur
      const sim = window.trafficSimulator || window.trafficSim;
      this.wasSimPlayingBeforeEdit = !!(sim && sim.isPlaying);

      if (window.setSimulationPlayback) {
        window.setSimulationPlayback(false);
      } else if (sim && sim.isPlaying) {
        sim.pause();
      }

      this.hasPendingRouteChanges = false;

      if (this.map) {
        const container = this.map.getContainer();
        container.classList.add("taxiway-edit-mode-active");
        if (this.editInteractiveLayer && !this.map.hasLayer(this.editInteractiveLayer)) {
          this.editInteractiveLayer.addTo(this.map);
        }
        if (this.arrowLayerGroup && !this.map.hasLayer(this.arrowLayerGroup)) {
          this.arrowLayerGroup.addTo(this.map);
        }
        this.renderAllArrows();
      }

      if (typeof showToast === "function") {
        showToast("⏸️ Taksi Yönü Düzenleme AKTİF: Simülasyon saati durduruldu. Yollara tıklayarak yönleri belirleyin.");
      }
    } else {
      // 2. Düzenleme PASİF: Normal görünüme dön
      if (this.map) {
        const container = this.map.getContainer();
        container.classList.remove("taxiway-edit-mode-active");
        if (this.editInteractiveLayer && this.map.hasLayer(this.editInteractiveLayer)) {
          this.map.removeLayer(this.editInteractiveLayer);
        }
        if (this.arrowLayerGroup && this.map.hasLayer(this.arrowLayerGroup)) {
          this.map.removeLayer(this.arrowLayerGroup);
        }
        this.arrowLayerGroup.clearLayers();
        this.map.closePopup();
      }

      // 3. Değişiklik varsa TEK SEFERDE hepsini hesapla ve simülasyonu yeniden oluştur
      if (this.hasPendingRouteChanges) {
        this.hasPendingRouteChanges = false;
        if (typeof showToast === "function") {
          showToast("⚙️ Yeni taksi yönleri uygulandı, tüm rotalar tek seferde hesaplanıyor...");
        }

        setTimeout(() => {
          this.rebuildSystemRoutes();

          const sim = window.trafficSimulator || window.trafficSim;
          if (sim) {
            sim.updateSimulation(0, true);
          }

          if (this.wasSimPlayingBeforeEdit) {
            if (window.setSimulationPlayback) {
              window.setSimulationPlayback(true);
            } else if (sim) {
              sim.start();
            }
            if (typeof showToast === "function") {
              showToast("✔️ Yeni taksi rotaları hazır, simülasyon akışı devam ediyor.");
            }
          } else {
            if (typeof showToast === "function") {
              showToast("✔️ Yeni taksi rotaları başarıyla oluşturuldu.");
            }
          }
        }, 25);
      } else {
        if (this.wasSimPlayingBeforeEdit) {
          if (window.setSimulationPlayback) {
            window.setSimulationPlayback(true);
          } else {
            const sim = window.trafficSimulator || window.trafficSim;
            if (sim) sim.start();
          }
        }
        if (typeof showToast === "function") {
          showToast("⚪ Taksi Yönü Düzenleme PASİF: Normal akış görüntüsüne dönüldü.");
        }
      }
    }

    this.updateUI();
  }

  toggleEditMode() {
    this.setEditMode(!this.isEditModeActive);
  }

  /**
   * Handles user click on a taxiway line
   */
  handleTaxiwayClick(feature, polyline, clickLatLng) {
    const featId = feature.properties?.id ? String(feature.properties.id) : (feature.id ? String(feature.id) : feature._assignedId);
    const ref = feature.properties?.ref || feature.properties?.name || "TWY";

    const currentDir = this.featureDirections.get(featId) || "BIDIRECTIONAL";
    let nextDir = "FORWARD";

    if (currentDir === "BIDIRECTIONAL") {
      nextDir = "FORWARD";
    } else if (currentDir === "FORWARD") {
      nextDir = "REVERSE";
    } else {
      nextDir = "BIDIRECTIONAL";
    }

    if (nextDir === "BIDIRECTIONAL") {
      this.featureDirections.delete(featId);
    } else {
      this.featureDirections.set(featId, nextDir);
    }

    // Determine human-readable heading description
    const dirInfo = this.getDirectionDescription(feature, nextDir);

    // Refresh visual arrow for this road
    this.renderAllArrows();

    this.hasPendingRouteChanges = true;

    // Only rebuild immediately if NOT in interactive edit mode
    if (!this.isEditModeActive) {
      this.rebuildSystemRoutes();
    }

    // Update UI badge & stats
    this.updateUI();

    // Show interactive mini ATC popup
    this.showTaxiwayPopup(feature, featId, ref, nextDir, dirInfo, clickLatLng);
  }

  /**
   * Sets direction directly for a specific feature
   */
  setFeatureDir(featId, dir) {
    const feature = this.taxiwaysById.get(featId);
    if (!feature) return;

    if (dir === "BIDIRECTIONAL") {
      this.featureDirections.delete(featId);
    } else {
      this.featureDirections.set(featId, dir);
    }

    this.hasPendingRouteChanges = true;
    this.renderAllArrows();
    if (!this.isEditModeActive) {
      this.rebuildSystemRoutes();
    }
    this.updateUI();

    if (this.map) this.map.closePopup();
    if (typeof showToast === "function") {
      const ref = feature.properties?.ref || "TWY";
      const dirText = dir === "FORWARD" ? "İleri Tek Yön" : (dir === "REVERSE" ? "Geri Tek Yön" : "Çift Yön");
      showToast(`${ref}: ${dirText} olarak güncellendi.`);
    }
  }

  /**
   * Applies the chosen direction to ALL taxiway features sharing the same ref (e.g. all segments of TWY A1)
   */
  applyDirToAllRef(ref, dir) {
    if (!ref) return;
    let count = 0;

    this.taxiways.forEach(f => {
      const fRef = f.properties?.ref || f.properties?.name;
      if (fRef === ref) {
        const featId = f.properties?.id ? String(f.properties.id) : (f.id ? String(f.id) : f._assignedId);
        if (dir === "BIDIRECTIONAL") {
          this.featureDirections.delete(featId);
        } else {
          this.featureDirections.set(featId, dir);
        }
        count++;
      }
    });

    this.hasPendingRouteChanges = true;
    this.renderAllArrows();
    if (!this.isEditModeActive) {
      this.rebuildSystemRoutes();
    }
    this.updateUI();

    if (this.map) this.map.closePopup();
    if (typeof showToast === "function") {
      const dirText = dir === "FORWARD" ? "İleri Tek Yön" : (dir === "REVERSE" ? "Geri Tek Yön" : "Çift Yön");
      showToast(`Tüm "${ref}" Taksi Yolları (${count} segment): ${dirText} olarak ayarlandı.`);
    }
  }

  /**
   * Shows a sleek ATC Leaflet popup on the clicked taxiway
   */
  showTaxiwayPopup(feature, featId, ref, currentDir, dirInfo, latLng) {
    if (!this.map || !latLng) return;

    const popupHtml = `
      <div class="taxi-click-popup">
        <div class="taxi-popup-header">
          <span class="taxi-popup-tag">TAKSİ YOLU KONTROL</span>
          <div class="taxi-popup-title">${ref}</div>
        </div>
        <div class="taxi-popup-status">
          <span class="status-label">Seçili Yön:</span>
          <span class="status-value ${currentDir.toLowerCase()}">${dirInfo.badgeText}</span>
        </div>
        <div class="taxi-popup-actions">
          <button class="btn-pop-dir ${currentDir === 'FORWARD' ? 'active' : ''}" onclick="window.TaxiwayDirectionManager.setFeatureDir('${featId}', 'FORWARD')">
            🟢 ➔ İleri
          </button>
          <button class="btn-pop-dir ${currentDir === 'REVERSE' ? 'active' : ''}" onclick="window.TaxiwayDirectionManager.setFeatureDir('${featId}', 'REVERSE')">
            🔵 ⬅ Geri
          </button>
          <button class="btn-pop-dir ${currentDir === 'BIDIRECTIONAL' ? 'active' : ''}" onclick="window.TaxiwayDirectionManager.setFeatureDir('${featId}', 'BIDIRECTIONAL')">
            ⚪ ⇄ Çift Yön
          </button>
        </div>
        ${ref && ref !== "TWY" ? `
          <button class="btn-pop-all" onclick="window.TaxiwayDirectionManager.applyDirToAllRef('${ref}', '${currentDir}')">
            🌐 Tüm "${ref}" Hatlarına Uygula
          </button>
        ` : ''}
      </div>
    `;

    L.popup({
      className: "taxi-atc-popup",
      closeButton: true,
      autoPan: true,
      offset: [0, -10]
    })
    .setLatLng(latLng)
    .setContent(popupHtml)
    .openOn(this.map);
  }

  /**
   * Renders supersonic arrow markers for all currently configured taxiways
   */
  renderAllArrows() {
    if (!this.arrowLayerGroup || !this.map) return;
    this.arrowLayerGroup.clearLayers();

    if (!this.isEditModeActive) return;

    this.featureDirections.forEach((dir, featId) => {
      const feature = this.taxiwaysById.get(featId);
      if (feature && dir !== "BIDIRECTIONAL") {
        this.renderArrowForFeature(featId, feature, dir);
      }
    });
  }

  /**
   * Draws supersonic arrows directly along the asphalt centerline of the feature
   */
  renderArrowForFeature(featId, feature, dir) {
    const coords = feature.geometry?.coordinates;
    if (!coords || coords.length < 2) return;

    const latLngs = coords.map(c => [c[1], c[0]]);
    const ref = feature.properties?.ref || feature.properties?.name || "TWY";

    // Calculate total length and segments
    const segments = [];
    let totalLen = 0;

    for (let i = 0; i < latLngs.length - 1; i++) {
      const p1 = latLngs[i];
      const p2 = latLngs[i + 1];
      const d = this.calcDistance(p1[0], p1[1], p2[0], p2[1]);
      segments.push({ p1, p2, dist: d });
      totalLen += d;
    }

    if (totalLen <= 0) return;

    // Determine how many arrows to place along the line
    const fractions = (totalLen > 240) ? [0.33, 0.67] : [0.5];

    fractions.forEach(frac => {
      const targetDist = totalLen * frac;
      let cum = 0;

      for (let s of segments) {
        if (cum + s.dist >= targetDist) {
          const t = (targetDist - cum) / Math.max(1, s.dist);
          const lat = s.p1[0] + t * (s.p2[0] - s.p1[0]);
          const lon = s.p1[1] + t * (s.p2[1] - s.p1[1]);

          // Compute bearing
          const rad = Math.PI / 180;
          const dLat = s.p2[0] - s.p1[0];
          const dLon = (s.p2[1] - s.p1[1]) * Math.cos(lat * rad);
          let bearing = Math.atan2(dLon, dLat) * (180 / Math.PI);
          if (bearing < 0) bearing += 360;

          // If REVERSE, flip by 180°
          let heading = (dir === "FORWARD") ? bearing : (bearing + 180) % 360;
          const color = (dir === "FORWARD") ? "#10b981" : "#00e5ff";

          const arrowIcon = L.divIcon({
            className: "taxi-road-arrow-container",
            html: `
              <div class="taxi-road-arrow-glyph" style="transform: rotate(${Math.round(heading)}deg); color: ${color}; filter: drop-shadow(0 0 6px ${color});">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2L21 21L12 16.5L3 21L12 2Z" stroke="#03160e" stroke-width="2"/>
                </svg>
              </div>
              <div class="taxi-road-arrow-badge" style="border-color: ${color}; color: ${color};">
                ${ref}
              </div>
            `,
            iconSize: [36, 42],
            iconAnchor: [18, 21]
          });

          const marker = L.marker([lat, lon], {
            icon: arrowIcon,
            interactive: true
          });

          marker.on("click", (e) => {
            L.DomEvent.stopPropagation(e);
            this.handleTaxiwayClick(feature, null, [lat, lon]);
          });

          marker.addTo(this.arrowLayerGroup);
          break;
        }
        cum += s.dist;
      }
    });
  }

  /**
   * Helper to compute cardinal direction and human text
   */
  getDirectionDescription(feature, dir) {
    if (dir === "BIDIRECTIONAL") {
      return { text: "Çift Yön (Serbest Akış)", badgeText: "⇄ Çift Yön" };
    }

    const coords = feature.geometry?.coordinates || [];
    if (coords.length < 2) {
      return { text: "Tek Yön", badgeText: "➔ Tek Yön" };
    }

    const start = coords[0];
    const end = coords[coords.length - 1];
    let dLon = end[0] - start[0];
    let dLat = end[1] - start[1];

    if (dir === "REVERSE") {
      dLon = -dLon;
      dLat = -dLat;
    }

    if (Math.abs(dLon) > 1.3 * Math.abs(dLat)) {
      return dLon > 0 
        ? { text: "Doğuya Doğru (W➔E)", badgeText: "➔ Doğuya (W➔E)" } 
        : { text: "Batıya Doğru (E➔W)", badgeText: "⬅ Batıya (E➔W)" };
    } else if (Math.abs(dLat) > 1.3 * Math.abs(dLon)) {
      return dLat > 0 
        ? { text: "Kuzeye Doğru (S➔N)", badgeText: "⬆ Kuzeye (S➔N)" } 
        : { text: "Güneye Doğru (N➔S)", badgeText: "⬇ Güneye (N➔S)" };
    }

    return dir === "FORWARD" 
      ? { text: "İleri Tek Yön", badgeText: "➔ İleri Tek Yön" } 
      : { text: "Geri Tek Yön", badgeText: "⬅ Geri Tek Yön" };
  }

  /**
   * Presets
   */
  presetAlternating() {
    this.featureDirections.clear();
    const list = this.corridors[this.airportIcao] || [];
    list.forEach((c, idx) => {
      c.direction = (idx % 2 === 0) ? "WEST_TO_EAST" : "EAST_TO_WEST";
    });

    this.hasPendingRouteChanges = true;
    this.renderAllArrows();
    if (!this.isEditModeActive) {
      this.rebuildSystemRoutes();
    }
    this.updateUI();

    if (typeof showToast === "function") {
      showToast("⚡ Alternatif Akış Şablonu (W➔E / E➔W) uygulandı.");
    }
  }

  presetReverse() {
    this.featureDirections.clear();
    const list = this.corridors[this.airportIcao] || [];
    list.forEach((c, idx) => {
      c.direction = (idx % 2 === 0) ? "EAST_TO_WEST" : "WEST_TO_EAST";
    });

    this.hasPendingRouteChanges = true;
    this.renderAllArrows();
    if (!this.isEditModeActive) {
      this.rebuildSystemRoutes();
    }
    this.updateUI();

    if (typeof showToast === "function") {
      showToast("🔄 Ters Alternatif Akış Şablonu (E➔W / W➔E) uygulandı.");
    }
  }

  presetResetAll() {
    this.featureDirections.clear();
    this.refDirections.clear();
    const list = this.corridors[this.airportIcao] || [];
    list.forEach(c => {
      c.direction = "BIDIRECTIONAL";
    });

    this.hasPendingRouteChanges = true;
    this.renderAllArrows();
    if (!this.isEditModeActive) {
      this.rebuildSystemRoutes();
    }
    this.updateUI();

    if (typeof showToast === "function") {
      showToast("⚪ Tüm taksi yolları çift yönlü (serbest akış) olarak sıfırlandı.");
    }
  }

  rebuildSystemRoutes() {
    if (window.TaxiwayGraphRouter && window.TaxiwayGraphRouter.isGraphReady) {
      const sim = window.trafficSimulator || window.trafficSim;
      if (sim && typeof sim.rebuildFlightTrajectories === "function") {
        sim.rebuildFlightTrajectories();
      }
    }
  }

  /**
   * Evaluates if moving from pU to pV along edge is allowed under the current one-way configuration
   */
  isEdgeAllowed(pU, pV, edge) {
    if (!edge) return true;

    // 1. Specific Feature Override (highest priority)
    if (edge.featId && this.featureDirections.has(edge.featId)) {
      const dir = this.featureDirections.get(edge.featId);
      if (dir === "FORWARD") {
        return edge.forward === true;
      } else if (dir === "REVERSE") {
        return edge.forward === false;
      } else if (dir === "BIDIRECTIONAL") {
        return true;
      }
    }

    // 2. Ref-Level Override (if entire named taxiway was set)
    if (edge.ref && this.refDirections.has(edge.ref)) {
      const dir = this.refDirections.get(edge.ref);
      const dLon = pV[1] - pU[1];
      const dLat = pV[0] - pU[0];
      if (dir === "WEST_TO_EAST") return dLon > -0.00005;
      if (dir === "EAST_TO_WEST") return dLon < 0.00005;
      if (dir === "NORTH_TO_SOUTH") return dLat < 0.00005;
      if (dir === "SOUTH_TO_NORTH") return dLat > -0.00005;
      if (dir === "FORWARD") return edge.forward === true;
      if (dir === "REVERSE") return edge.forward === false;
      return true;
    }

    // 3. Fallback to Corridor Rule
    return this.isCorridorAllowed(pU, pV);
  }

  isCorridorAllowed(pU, pV) {
    const midLat = (pU[0] + pV[0]) / 2;
    const midLon = (pU[1] + pV[1]) / 2;
    const dLon = pV[1] - pU[1];
    const dLat = pU[0] - pV[0];

    if (Math.abs(dLon) < 1.3 * Math.abs(dLat)) {
      return true; // North-south links are bidirectional by default
    }

    const list = this.corridors[this.airportIcao] || [];
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (midLat >= c.minLat && midLat <= c.maxLat && midLon >= c.minLon && midLon <= c.maxLon) {
        if (c.direction === "WEST_TO_EAST") {
          return dLon > -0.00005;
        } else if (c.direction === "EAST_TO_WEST") {
          return dLon < 0.00005;
        }
        return true;
      }
    }

    return true;
  }

  /**
   * Updates toolbar, badges, and headers
   */
  updateUI() {
    const headerSummary = document.getElementById("headerTaxiDirSummary");
    const headerBtn = document.getElementById("btnTaxiwayDirModalOpen");
    const toolbar = document.getElementById("taxiwayEditToolbar");
    const btnToggle = document.getElementById("btnToggleTaxiEditMode");
    const txtStatus = document.getElementById("txtEditModeStatus");
    const lblCount = document.getElementById("lblConfiguredCount");

    const count = this.featureDirections.size;

    if (headerSummary) {
      headerSummary.textContent = this.isEditModeActive ? "DÜZENLE: AKTİF (Saat Durduruldu)" : "DÜZENLE: PASİF";
    }

    if (headerBtn) {
      if (this.isEditModeActive) {
        headerBtn.classList.add("active-edit-mode");
      } else {
        headerBtn.classList.remove("active-edit-mode");
      }
    }

    if (toolbar) {
      toolbar.style.display = this.isEditModeActive ? "block" : "none";
    }

    if (btnToggle && txtStatus) {
      if (this.isEditModeActive) {
        btnToggle.className = "btn-mode-toggle active";
        txtStatus.textContent = "AKTİF (Saat Duraklatıldı)";
      } else {
        btnToggle.className = "btn-mode-toggle passive";
        txtStatus.textContent = "PASİF";
      }
    }

    if (lblCount) {
      lblCount.textContent = `${count} Yol${this.hasPendingRouteChanges ? ' (Hesaplama Beklemede)' : ''}`;
    }
  }

  calcDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}

window.TaxiwayDirectionManager = new TaxiwayDirectionManager();
