/**
 * Taxiway Traffic Flow Direction Management Engine (One-Way Taxiway System)
 * 
 * Supports:
 * - Alternating one-way directions on parallel taxiways (e.g. West->East, East->West)
 * - Map visualization with glowing directional chevron flow arrows
 * - Interactive direction toggling per corridor or full airport preset
 * - Strict enforcement inside Dijkstra routing to eliminate head-on gridlocks
 */

class TaxiwayDirectionManager {
  constructor() {
    this.airportIcao = "LTFM";
    this.overlayLayerGroup = null;
    this.isOverlayVisible = true;

    // Corridor configurations
    this.corridors = {
      LTFM: [
        {
          id: "LTFM_ROW_1",
          name: "Güney Paralel 1 (TWY A1/C1B)",
          minLat: 41.2638,
          maxLat: 41.2662,
          minLon: 28.7120,
          maxLon: 28.7420,
          direction: "WEST_TO_EAST", // Batıdan Doğuya
          label: "Row 1 (A1)"
        },
        {
          id: "LTFM_ROW_2",
          name: "Güney Paralel 2 (TWY A3/A4)",
          minLat: 41.2663,
          maxLat: 41.2678,
          minLon: 28.7100,
          maxLon: 28.7450,
          direction: "EAST_TO_WEST", // Doğudan Batıya
          label: "Row 2 (A3/A4)"
        },
        {
          id: "LTFM_ROW_3",
          name: "Merkez Paralel 1 (TWY N1/NW/NE)",
          minLat: 41.2679,
          maxLat: 41.2695,
          minLon: 28.7100,
          maxLon: 28.7450,
          direction: "WEST_TO_EAST", // Batıdan Doğuya
          label: "Row 3 (N1)"
        },
        {
          id: "LTFM_ROW_4",
          name: "Merkez Paralel 2 (TWY N2/N3)",
          minLat: 41.2696,
          maxLat: 41.2718,
          minLon: 28.7100,
          maxLon: 28.7450,
          direction: "EAST_TO_WEST", // Doğudan Batıya
          label: "Row 4 (N2/N3)"
        },
        {
          id: "LTFM_ROW_5",
          name: "Kuzey Paralel 1 (TWY N4/N5)",
          minLat: 41.2719,
          maxLat: 41.2745,
          minLon: 28.7100,
          maxLon: 28.7450,
          direction: "WEST_TO_EAST", // Batıdan Doğuya
          label: "Row 5 (N4/N5)"
        },
        {
          id: "LTFM_ROW_6",
          name: "Kuzey Paralel 2 (TWY N6)",
          minLat: 41.2746,
          maxLat: 41.2780,
          minLon: 28.7100,
          maxLon: 28.7450,
          direction: "EAST_TO_WEST", // Doğudan Batıya
          label: "Row 6 (N6)"
        }
      ],
      LTFJ: [
        {
          id: "LTFJ_ROW_1",
          name: "Ana Paralel Taksi Yolu (TWY A)",
          minLat: 40.8900,
          maxLat: 40.9060,
          minLon: 29.2980,
          maxLon: 29.3300,
          direction: "WEST_TO_EAST",
          label: "TWY A"
        },
        {
          id: "LTFJ_ROW_2",
          name: "İç Apron Taksi Yolu (TWY B)",
          minLat: 40.8950,
          maxLat: 40.9100,
          minLon: 29.3050,
          maxLon: 29.3250,
          direction: "EAST_TO_WEST",
          label: "TWY B"
        }
      ]
    };
  }

  getCorridors(icao = this.airportIcao) {
    return this.corridors[icao] || [];
  }

  setCorridorDirection(corridorId, newDirection) {
    const list = this.getCorridors();
    const c = list.find(x => x.id === corridorId);
    if (c) {
      c.direction = newDirection;
      this.refreshOverlay();
      this.rebuildSystemRoutes();
    }
  }

  toggleCorridorDirection(corridorId) {
    const list = this.getCorridors();
    const c = list.find(x => x.id === corridorId);
    if (c) {
      if (c.direction === "WEST_TO_EAST") c.direction = "EAST_TO_WEST";
      else if (c.direction === "EAST_TO_WEST") c.direction = "BIDIRECTIONAL";
      else c.direction = "WEST_TO_EAST";
      this.refreshOverlay();
      this.rebuildSystemRoutes();
    }
  }

  setPreset(presetName) {
    const list = this.getCorridors();
    list.forEach((c, idx) => {
      if (presetName === "ALTERNATING") {
        c.direction = (idx % 2 === 0) ? "WEST_TO_EAST" : "EAST_TO_WEST";
      } else if (presetName === "REVERSE_ALTERNATING") {
        c.direction = (idx % 2 === 0) ? "EAST_TO_WEST" : "WEST_TO_EAST";
      } else if (presetName === "BIDIRECTIONAL") {
        c.direction = "BIDIRECTIONAL";
      }
    });
    this.refreshOverlay();
    this.rebuildSystemRoutes();
  }

  rebuildSystemRoutes() {
    if (window.TaxiwayGraphRouter && window.TaxiwayGraphRouter.isGraphReady) {
      if (window.trafficSimulator) {
        window.trafficSimulator.rebuildFlightTrajectories();
      }
    }
  }

  /**
   * Evaluates if traveling from node p1 to p2 is permissible under the active one-way rules
   * p1 = [lat1, lon1], p2 = [lat2, lon2]
   */
  isEdgeAllowed(p1, p2) {
    const midLat = (p1[0] + p2[0]) / 2;
    const midLon = (p1[1] + p2[1]) / 2;
    const dLon = p2[1] - p1[1];
    const dLat = p2[0] - p1[0];

    // Only apply horizontal flow rules if the segment is predominantly horizontal
    if (Math.abs(dLon) < 1.3 * Math.abs(dLat)) {
      return true; // North-South connectors are bidirectional
    }

    const list = this.getCorridors();
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (midLat >= c.minLat && midLat <= c.maxLat && midLon >= c.minLon && midLon <= c.maxLon) {
        if (c.direction === "WEST_TO_EAST") {
          // Must move from West to East (dLon > -0.00002)
          return dLon > -0.00005;
        } else if (c.direction === "EAST_TO_WEST") {
          // Must move from East to West (dLon < +0.00002)
          return dLon < 0.00005;
        }
        return true;
      }
    }

    return true;
  }

  initMapOverlay(map) {
    if (!map) return;
    if (!this.overlayLayerGroup) {
      this.overlayLayerGroup = L.layerGroup();
      this.overlayLayerGroup.addTo(map);
    }
    this.refreshOverlay();
  }

  refreshOverlay() {
    if (!this.overlayLayerGroup || !window.map) return;
    this.overlayLayerGroup.clearLayers();

    if (!this.isOverlayVisible) return;

    const list = this.getCorridors();
    list.forEach(c => {
      const isEast = (c.direction === "WEST_TO_EAST");
      const isWest = (c.direction === "EAST_TO_WEST");
      const color = isEast ? "#10b981" : (isWest ? "#00e5ff" : "#94a3b8");
      const dirSymbol = isEast ? "➔ DOĞU (W➔E)" : (isWest ? "⬅ BATI (E➔W)" : "⬌ ÇİFT YÖN");
      const midLat = (c.minLat + c.maxLat) / 2;

      // Draw faint corridor boundary guide line
      const line = L.polyline([
        [midLat, c.minLon],
        [midLat, c.maxLon]
      ], {
        color: color,
        weight: 3,
        opacity: 0.35,
        dashArray: "6, 12",
        interactive: false
      });
      line.addTo(this.overlayLayerGroup);

      // Render 4 flow chevrons along the corridor
      const steps = 4;
      for (let s = 1; s <= steps; s++) {
        const lon = c.minLon + (c.maxLon - c.minLon) * (s / (steps + 1));
        const iconHtml = `
          <div class="taxi-flow-badge" style="border-color: ${color}; color: ${color};" title="Tıkla: Yönü Değiştir (${c.name})">
            ${dirSymbol}
          </div>
        `;
        const marker = L.marker([midLat, lon], {
          icon: L.divIcon({
            className: "flow-arrow-container",
            html: iconHtml,
            iconSize: [110, 24],
            iconAnchor: [55, 12]
          }),
          interactive: true
        });

        marker.on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          this.toggleCorridorDirection(c.id);
        });

        marker.addTo(this.overlayLayerGroup);
      }
    });
  }

  toggleOverlayVisibility() {
    this.isOverlayVisible = !this.isOverlayVisible;
    this.refreshOverlay();
    return this.isOverlayVisible;
  }
}

window.TaxiwayDirectionManager = new TaxiwayDirectionManager();
