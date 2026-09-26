/**
 * Airport Runway Operations & Direction Management Module
 * Supports:
 * - Active Runway & Direction selection (Landing vs Takeoff, e.g. 16R/34L, 17L/35R, 06L/24R, 06R/24L)
 * - Mandatory Runway Entry Taxiway (Outbound flights MUST strictly enter through this holding point)
 * - Flexible Runway Exits (Landing aircraft can rollout and exit from any allowed taxiway)
 */

class RunwayConfigManager {
  constructor() {
    this.airportIcao = "LTFJ";
    this.listeners = [];

    // Configuration catalog for each airport
    this.catalogs = {
      LTFM: {
        presets: {
          NORTH: {
            id: "NORTH",
            name: "Kuzey Operasyonu (Kuzey Rüzgarı)",
            description: "16R İniş (Kuzeyden Güneye) / 35R Kalkış (Güneyden Kuzeye)",
            arrRunway: "16R",
            arrHeading: 163,
            depRunway: "35R",
            depHeading: 354,
            mandatoryDepEntry: "B1",
            allowedExits: ["A6A", "A7A", "A5A", "A4A", "A3A", "A2A"],
            exitMode: "flexible"
          },
          SOUTH: {
            id: "SOUTH",
            name: "Güney Operasyonu (Lodos Rüzgarı)",
            description: "34L İniş (Güneyden Kuzeye) / 17L Kalkış (Kuzeyden Güneye)",
            arrRunway: "34L",
            arrHeading: 343,
            depRunway: "17L",
            depHeading: 174,
            mandatoryDepEntry: "B14",
            allowedExits: ["A5A", "A6A", "A7A", "A10A", "A11A", "A12A"],
            exitMode: "flexible"
          }
        },
        runways: {
          "16R": {
            id: "16R",
            pairId: "16R/34L",
            name: "Pist 16R",
            heading: 163,
            threshold: [41.298586, 28.706735],
            touchdown: [41.287917, 28.706942],
            rolloutEnd: [41.265000, 28.707300],
            liftoff: [41.265000, 28.707300],
            exits: [
              { id: "A6A", name: "A6A", desc: "Hızlı Çıkış (Rapid Exit)", pos: [41.282251, 28.707052] },
              { id: "A7A", name: "A7A", desc: "Hızlı Çıkış (Rapid Exit)", pos: [41.281049, 28.707075] },
              { id: "A5A", name: "A5A", desc: "Orta Çıkış (Intermediate)", pos: [41.278734, 28.707120] },
              { id: "A4A", name: "A4A", desc: "Güney Çıkış", pos: [41.267818, 28.717754] },
              { id: "A3A", name: "A3A", desc: "Pist Sonu Çıkışı", pos: [41.266845, 28.709862] },
              { id: "A2A", name: "A2A", desc: "Pist Sonu Çıkışı", pos: [41.265850, 28.709882] }
            ],
            entries: [
              { id: "A1", name: "A1", desc: "Pist Başı (Full Length)", holdPos: [41.298524, 28.709226], lineupPos: [41.298586, 28.706735] },
              { id: "A10", name: "A10", desc: "Kesişim Girişi (Intersection)", holdPos: [41.296574, 28.709265], lineupPos: [41.296164, 28.706782] },
              { id: "A11", name: "A11", desc: "Kesişim Girişi", holdPos: [41.297646, 28.709244], lineupPos: [41.297211, 28.706761] }
            ]
          },
          "34L": {
            id: "34L",
            pairId: "16R/34L",
            name: "Pist 34L",
            heading: 343,
            threshold: [41.264946, 28.707387],
            touchdown: [41.274000, 28.707150],
            rolloutEnd: [41.298586, 28.706735],
            liftoff: [41.298586, 28.706735],
            exits: [
              { id: "A5A", name: "A5A", desc: "Hızlı Çıkış (Rapid Exit)", pos: [41.278734, 28.707120] },
              { id: "A6A", name: "A6A", desc: "Hızlı Çıkış", pos: [41.282251, 28.707052] },
              { id: "A7A", name: "A7A", desc: "Orta Çıkış", pos: [41.281049, 28.707075] },
              { id: "A10A", name: "A10A", desc: "Kuzey Çıkış", pos: [41.296164, 28.706782] },
              { id: "A11A", name: "A11A", desc: "Kuzey Çıkış", pos: [41.297211, 28.706761] },
              { id: "A12A", name: "A12A", desc: "Pist Sonu Çıkışı", pos: [41.298120, 28.706744] }
            ],
            entries: [
              { id: "A1A", name: "A1A", desc: "Pist Başı (Full Length)", holdPos: [41.264976, 28.709899], lineupPos: [41.264946, 28.707387] },
              { id: "A2A", name: "A2A", desc: "Kesişim Girişi (Intersection)", holdPos: [41.265850, 28.709882], lineupPos: [41.265829, 28.707900] },
              { id: "A3A", name: "A3A", desc: "Kesişim Girişi", holdPos: [41.266845, 28.709862], lineupPos: [41.266823, 28.707887] }
            ]
          },
          "35R": {
            id: "35R",
            pairId: "17L/35R",
            name: "Pist 35R",
            heading: 354,
            threshold: [41.262028, 28.727194],
            touchdown: [41.272000, 28.727100],
            rolloutEnd: [41.298820, 28.727016],
            liftoff: [41.298820, 28.727016],
            exits: [
              { id: "C10", name: "C10", desc: "Hızlı Çıkış", pos: [41.284163, 28.727302] },
              { id: "C11", name: "C11", desc: "Kuzey Çıkış", pos: [41.294823, 28.727094] },
              { id: "C12", name: "C12", desc: "Pist Sonu Çıkış", pos: [41.296968, 28.727583] },
              { id: "C14", name: "C14", desc: "Pist Sonu Çıkış", pos: [41.298716, 28.727018] }
            ],
            entries: [
              { id: "B1", name: "B1", desc: "Pist Başı (Full Length)", holdPos: [41.261940, 28.725220], lineupPos: [41.262028, 28.727194] },
              { id: "B2", name: "B2", desc: "Kesişim Girişi (Intersection)", holdPos: [41.262872, 28.724652], lineupPos: [41.262866, 28.727200] },
              { id: "B3", name: "B3", desc: "Kesişim Girişi (Intersection)", holdPos: [41.265786, 28.725144], lineupPos: [41.265836, 28.727659] }
            ]
          },
          "17L": {
            id: "17L",
            pairId: "17L/35R",
            name: "Pist 17L",
            heading: 174,
            threshold: [41.298716, 28.727018],
            touchdown: [41.288000, 28.727100],
            rolloutEnd: [41.262028, 28.727194],
            liftoff: [41.262028, 28.727194],
            exits: [
              { id: "C10", name: "C10", desc: "Hızlı Çıkış", pos: [41.284163, 28.727302] },
              { id: "B3", name: "B3", desc: "Güney Çıkış", pos: [41.265786, 28.725144] },
              { id: "B2", name: "B2", desc: "Pist Sonu Çıkış", pos: [41.262872, 28.724652] },
              { id: "B1", name: "B1", desc: "Pist Sonu Çıkış", pos: [41.261940, 28.725220] }
            ],
            entries: [
              { id: "B14", name: "B14", desc: "Pist Başı (Full Length)", holdPos: [41.298690, 28.724509], lineupPos: [41.298716, 28.727018] },
              { id: "B12", name: "B12", desc: "Kesişim Girişi (Intersection)", holdPos: [41.298174, 28.722252], lineupPos: [41.297844, 28.727570] },
              { id: "B10", name: "B10", desc: "Kesişim Girişi (Intersection)", holdPos: [41.296715, 28.722280], lineupPos: [41.296598, 28.727100] }
            ]
          }
        }
      },
      LTFJ: {
        presets: {
          OPS_06: {
            id: "OPS_06",
            name: "06 Operasyonu (Doğu Yönü)",
            description: "06L İniş (Batıdan Doğuya) / 06R Kalkış (Batıdan Doğuya)",
            arrRunway: "06L",
            arrHeading: 58,
            depRunway: "06R",
            depHeading: 58,
            mandatoryDepEntry: "TWY A1",
            allowedExits: ["TWY K", "TWY L", "TWY F", "TWY C11"],
            exitMode: "flexible"
          },
          OPS_24: {
            id: "OPS_24",
            name: "24 Operasyonu (Batı Yönü)",
            description: "24R İniş (Doğudan Batıya) / 24L Kalkış (Doğudan Batıya)",
            arrRunway: "24R",
            arrHeading: 238,
            depRunway: "24L",
            depHeading: 238,
            mandatoryDepEntry: "TWY A11",
            allowedExits: ["TWY F", "TWY L", "TWY K", "TWY D1"],
            exitMode: "flexible"
          }
        },
        runways: {
          "06L": {
            id: "06L",
            pairId: "06L/24R",
            name: "Pist 06L (Kuzey)",
            heading: 58,
            threshold: [40.892641, 29.293205],
            touchdown: [40.895588, 29.301219],
            rolloutEnd: [40.904441, 29.325242],
            liftoff: [40.904441, 29.325242],
            exits: [
              { id: "TWY K", name: "TWY K", desc: "Hızlı Çıkış (Rapid Exit)", pos: [40.895868, 29.301964] },
              { id: "TWY L", name: "TWY L", desc: "Hızlı Çıkış", pos: [40.897595, 29.306680] },
              { id: "TWY F", name: "TWY F", desc: "Orta Çıkış", pos: [40.900218, 29.313777] },
              { id: "TWY C11", name: "TWY C11", desc: "Pist Sonu Çıkışı", pos: [40.904278, 29.324800] }
            ],
            entries: [
              { id: "TWY D1", name: "TWY D1", desc: "Pist Başı (Full Length)", holdPos: [40.895727, 29.295872], lineupPos: [40.892641, 29.293205] },
              { id: "TWY K", name: "TWY K", desc: "Kesişim Girişi (Intersection)", holdPos: [40.894590, 29.303166], lineupPos: [40.895868, 29.301964] }
            ]
          },
          "24R": {
            id: "24R",
            pairId: "06L/24R",
            name: "Pist 24R (Kuzey)",
            heading: 238,
            threshold: [40.904441, 29.325242],
            touchdown: [40.901500, 29.317000],
            rolloutEnd: [40.892641, 29.293205],
            liftoff: [40.892641, 29.293205],
            exits: [
              { id: "TWY F", name: "TWY F", desc: "Hızlı Çıkış (Rapid Exit)", pos: [40.900218, 29.313777] },
              { id: "TWY L", name: "TWY L", desc: "Hızlı Çıkış", pos: [40.897595, 29.306680] },
              { id: "TWY K", name: "TWY K", desc: "Orta Çıkış", pos: [40.895868, 29.301964] },
              { id: "TWY D1", name: "TWY D1", desc: "Pist Sonu Çıkışı", pos: [40.895727, 29.295872] }
            ],
            entries: [
              { id: "TWY C11", name: "TWY C11", desc: "Pist Başı (Full Length)", holdPos: [40.902820, 29.325718], lineupPos: [40.904441, 29.325242] },
              { id: "TWY F", name: "TWY F", desc: "Kesişim Girişi (Intersection)", holdPos: [40.904209, 29.318903], lineupPos: [40.900218, 29.313777] }
            ]
          },
          "06R": {
            id: "06R",
            pairId: "06R/24L",
            name: "Pist 06R (Güney)",
            heading: 58,
            threshold: [40.884851, 29.302589],
            touchdown: [40.889000, 29.314000],
            rolloutEnd: [40.898754, 29.340392],
            liftoff: [40.898754, 29.340392],
            exits: [
              { id: "TWY A4", name: "TWY A4", desc: "Orta Çıkış", pos: [40.888757, 29.313212] },
              { id: "TWY A5", name: "TWY A5", desc: "Hızlı Çıkış", pos: [40.889602, 29.309748] },
              { id: "TWY A6", name: "TWY A6", desc: "Hızlı Çıkış", pos: [40.891157, 29.313969] },
              { id: "TWY A7", name: "TWY A7", desc: "Pist Sonu Çıkışı", pos: [40.891762, 29.321366] }
            ],
            entries: [
              { id: "TWY A1", name: "TWY A1", desc: "Pist Başı (Full Length)", holdPos: [40.884727, 29.302251], lineupPos: [40.884851, 29.302589] },
              { id: "TWY A2", name: "TWY A2", desc: "Kesişim Girişi (Intersection)", holdPos: [40.886293, 29.301835], lineupPos: [40.884898, 29.302716] },
              { id: "TWY A3", name: "TWY A3", desc: "Kesişim Girişi (Intersection)", holdPos: [40.886601, 29.302830], lineupPos: [40.885693, 29.304879] },
              { id: "TWY A4", name: "TWY A4", desc: "Kesişim Girişi (Intersection)", holdPos: [40.887983, 29.305353], lineupPos: [40.888757, 29.313212] }
            ]
          },
          "24L": {
            id: "24L",
            pairId: "06R/24L",
            name: "Pist 24L (Güney)",
            heading: 238,
            threshold: [40.898754, 29.340392],
            touchdown: [40.894000, 29.328000],
            rolloutEnd: [40.884851, 29.302589],
            liftoff: [40.884851, 29.302589],
            exits: [
              { id: "TWY A6", name: "TWY A6", desc: "Hızlı Çıkış", pos: [40.891157, 29.313969] },
              { id: "TWY A5", name: "TWY A5", desc: "Hızlı Çıkış", pos: [40.889602, 29.309748] },
              { id: "TWY A4", name: "TWY A4", desc: "Orta Çıkış", pos: [40.888757, 29.313212] },
              { id: "TWY A2", name: "TWY A2", desc: "Pist Sonu Çıkışı", pos: [40.884898, 29.302716] }
            ],
            entries: [
              { id: "TWY A11", name: "TWY A11", desc: "Pist Başı (Full Length)", holdPos: [40.899613, 29.338133], lineupPos: [40.898754, 29.340392] },
              { id: "TWY A10", name: "TWY A10", desc: "Kesişim Girişi (Intersection)", holdPos: [40.898160, 29.338764], lineupPos: [40.897709, 29.337538] },
              { id: "TWY A7", name: "TWY A7", desc: "Kesişim Girişi (Intersection)", holdPos: [40.895553, 29.325899], lineupPos: [40.891762, 29.321366] }
            ]
          }
        }
      }
    };

    // Active state
    this.activeConfig = {
      LTFM: {
        preset: "NORTH",
        arrRunway: "16R",
        depRunway: "35R",
        mandatoryDepEntry: "B1",
        allowedExits: ["A6A", "A7A", "A5A", "A4A", "A3A", "A2A"],
        exitMode: "flexible"
      },
      LTFJ: {
        preset: "OPS_06",
        arrRunway: "06L",
        depRunway: "06R",
        mandatoryDepEntry: "TWY A1",
        allowedExits: ["TWY K", "TWY L", "TWY F", "TWY C11"],
        exitMode: "flexible"
      }
    };

    // Expand hold position entries to 20 holding points for all departure runways
    this.populate20HoldEntries();
  }

  populate20HoldEntries() {
    if (!this.catalogs) return;
    Object.values(this.catalogs).forEach(apt => {
      if (!apt.runways) return;
      Object.values(apt.runways).forEach(rwy => {
        if (!rwy.entries || rwy.entries.length < 20) {
          const pfx = rwy.entries && rwy.entries[0] ? rwy.entries[0].name.replace(/\d+/g, "") : "TWY ";
          const baseHold = (rwy.entries && rwy.entries[0]) ? rwy.entries[0].holdPos : rwy.threshold;
          const endHold = rwy.liftoff || rwy.rolloutEnd || rwy.threshold;
          const baseLineup = rwy.threshold;
          const endLineup = rwy.liftoff || rwy.rolloutEnd || rwy.threshold;

          const entries = [];
          for (let i = 0; i < 20; i++) {
            const t = i / 19;
            const hLat = +(baseHold[0] + t * (endHold[0] - baseHold[0])).toFixed(6);
            const hLon = +(baseHold[1] + t * (endHold[1] - baseHold[1])).toFixed(6);
            const lLat = +(baseLineup[0] + t * (endLineup[0] - baseLineup[0])).toFixed(6);
            const lLon = +(baseLineup[1] + t * (endLineup[1] - baseLineup[1])).toFixed(6);
            const num = i + 1;
            const cleanPfx = pfx.trim() ? pfx : "B";
            entries.push({
              id: `${cleanPfx}${num}`,
              name: `${cleanPfx}${num}`,
              desc: i === 0 ? "Pist Başı (Full Length)" : (i === 19 ? "Pist Sonu Girişi" : `Kesişim Hold Pozisyonu ${num}`),
              holdPos: [hLat, hLon],
              lineupPos: [lLat, lLon]
            });
          }
          rwy.entries = entries;
        }
      });
    });
  }

  setAirport(icao) {
    this.airportIcao = icao === "LTFM" ? "LTFM" : "LTFJ";
  }

  getCurrentConfig(icao = null) {
    const code = icao || this.airportIcao;
    const airportCatalog = this.catalogs[code];
    const cfg = this.activeConfig[code];

    const arrData = airportCatalog.runways[cfg.arrRunway] || Object.values(airportCatalog.runways)[0];
    const depData = airportCatalog.runways[cfg.depRunway] || Object.values(airportCatalog.runways)[1] || arrData;

    // Find mandatory entry object
    let mandatoryEntry = depData.entries.find(e => e.id === cfg.mandatoryDepEntry);
    if (!mandatoryEntry) {
      mandatoryEntry = depData.entries[0];
      cfg.mandatoryDepEntry = mandatoryEntry.id;
    }

    // Filter allowed exits
    const activeExits = arrData.exits.filter(e => cfg.allowedExits.includes(e.id));
    const safeExits = activeExits.length > 0 ? activeExits : arrData.exits;

    return {
      airportIcao: code,
      preset: cfg.preset,
      arrRunway: cfg.arrRunway,
      depRunway: cfg.depRunway,
      arrRunwayData: arrData,
      depRunwayData: depData,
      mandatoryDepEntry: mandatoryEntry,
      allowedExits: safeExits,
      allExits: arrData.exits,
      allEntries: depData.entries,
      exitMode: cfg.exitMode
    };
  }

  applyPreset(icao, presetId) {
    const code = icao || this.airportIcao;
    const catalog = this.catalogs[code];
    if (!catalog || !catalog.presets[presetId]) return false;

    const preset = catalog.presets[presetId];
    this.activeConfig[code] = {
      preset: presetId,
      arrRunway: preset.arrRunway,
      depRunway: preset.depRunway,
      mandatoryDepEntry: preset.mandatoryDepEntry,
      allowedExits: [...preset.allowedExits],
      exitMode: preset.exitMode || "flexible"
    };

    this.notifyChange(code);
    return true;
  }

  updateCustomConfig(icao, newConfig) {
    const code = icao || this.airportIcao;
    const airportCatalog = this.catalogs[code];
    if (!airportCatalog) return false;

    const cur = this.activeConfig[code];

    if (newConfig.arrRunway && airportCatalog.runways[newConfig.arrRunway]) {
      cur.arrRunway = newConfig.arrRunway;
    }
    if (newConfig.depRunway && airportCatalog.runways[newConfig.depRunway]) {
      cur.depRunway = newConfig.depRunway;
    }

    const depData = airportCatalog.runways[cur.depRunway];
    if (newConfig.mandatoryDepEntry) {
      const match = depData.entries.find(e => e.id === newConfig.mandatoryDepEntry);
      if (match) cur.mandatoryDepEntry = match.id;
      else cur.mandatoryDepEntry = depData.entries[0]?.id;
    } else {
      // Validate existing entry
      const match = depData.entries.find(e => e.id === cur.mandatoryDepEntry);
      if (!match) cur.mandatoryDepEntry = depData.entries[0]?.id;
    }

    const arrData = airportCatalog.runways[cur.arrRunway];
    if (Array.isArray(newConfig.allowedExits) && newConfig.allowedExits.length > 0) {
      cur.allowedExits = newConfig.allowedExits.filter(id => arrData.exits.some(e => e.id === id));
      if (cur.allowedExits.length === 0) {
        cur.allowedExits = arrData.exits.map(e => e.id);
      }
    } else {
      cur.allowedExits = arrData.exits.map(e => e.id);
    }

    cur.preset = "CUSTOM";
    cur.exitMode = newConfig.exitMode || "flexible";

    this.notifyChange(code);
    return true;
  }

  onConfigChanged(fn) {
    this.listeners.push(fn);
  }

  notifyChange(code) {
    const data = this.getCurrentConfig(code);
    this.listeners.forEach(fn => {
      try {
        fn(data);
      } catch (err) {
        console.error("[RunwayConfigManager] Listener error:", err);
      }
    });
  }
}

window.RunwayConfigManager = new RunwayConfigManager();
