/**
 * Airport Runway Operations & Direction Management Module
 * Supports:
 * - Multi-Runway Management & Traffic Distribution (All 5 LTFM runways & 2 LTFJ runways)
 * - Interactive Runway Activation / Deactivation (Active vs Passive for each runway)
 * - Independent Role Selection (Arrival / Departure / Mixed)
 * - Independent Direction Assignment (e.g. 35R ⇄ 17L, 16R ⇄ 34L)
 * - 20 Holding Points per runway for intersection takeoff operations
 */

class RunwayConfigManager {
  constructor() {
    this.airportIcao = "LTFM";
    this.listeners = [];

    // Configuration catalog for each airport
    this.catalogs = {
      LTFM: {
        presets: {
          DISTRIBUTED: {
            id: "DISTRIBUTED",
            name: "⚡ Çoklu Pist Trafik Dağıtımı (Tavsiye Edilen)",
            description: "16R İniş, 34R Kalkış, 35R Kalkış, 35L Kalkış, 36 Kalkış (Trafiği 5 Piste Dağıtır)",
            arrRunway: "16R",
            depRunway: "35R",
            mandatoryDepEntry: "B1",
            allowedExits: ["A6A", "A7A", "A5A", "A4A", "A3A", "A2A"],
            exitMode: "flexible",
            multiRunways: {
              "16R/34L": { active: true, selectedDirection: "16R", role: "arr" },
              "16L/34R": { active: true, selectedDirection: "34R", role: "dep" },
              "17R/35L": { active: true, selectedDirection: "35L", role: "dep" },
              "17L/35R": { active: true, selectedDirection: "35R", role: "dep" },
              "18/36":   { active: true, selectedDirection: "36",  role: "dep" }
            }
          },
          NORTH: {
            id: "NORTH",
            name: "Kuzey Operasyonu (Tüm Kuzey Pistleri)",
            description: "16R/16L İniş / 35R/35L/36 Kalkış (Kuzey Rüzgarı)",
            arrRunway: "16R",
            depRunway: "35R",
            mandatoryDepEntry: "B1",
            allowedExits: ["A6A", "A7A", "A5A", "A4A", "A3A", "A2A"],
            exitMode: "flexible",
            multiRunways: {
              "16R/34L": { active: true, selectedDirection: "16R", role: "arr" },
              "16L/34R": { active: true, selectedDirection: "16L", role: "arr" },
              "17R/35L": { active: true, selectedDirection: "35L", role: "dep" },
              "17L/35R": { active: true, selectedDirection: "35R", role: "dep" },
              "18/36":   { active: true, selectedDirection: "36",  role: "dep" }
            }
          },
          SOUTH: {
            id: "SOUTH",
            name: "Güney Operasyonu (Lodos Rüzgarı)",
            description: "34L/34R İniş / 17L/17R/18 Kalkış (Güney Rüzgarı)",
            arrRunway: "34L",
            depRunway: "17L",
            mandatoryDepEntry: "B14",
            allowedExits: ["A5A", "A6A", "A7A", "A10A", "A11A", "A12A"],
            exitMode: "flexible",
            multiRunways: {
              "16R/34L": { active: true, selectedDirection: "34L", role: "arr" },
              "16L/34R": { active: true, selectedDirection: "34R", role: "arr" },
              "17R/35L": { active: true, selectedDirection: "17R", role: "dep" },
              "17L/35R": { active: true, selectedDirection: "17L", role: "dep" },
              "18/36":   { active: true, selectedDirection: "18",   role: "dep" }
            }
          },
          CLASSIC: {
            id: "CLASSIC",
            name: "Klasik Tekli Operasyon",
            description: "Yalnızca 16R İniş / 35R Kalkış",
            arrRunway: "16R",
            depRunway: "35R",
            mandatoryDepEntry: "B1",
            allowedExits: ["A6A", "A7A", "A5A"],
            exitMode: "flexible",
            multiRunways: {
              "16R/34L": { active: true, selectedDirection: "16R", role: "arr" },
              "16L/34R": { active: false, selectedDirection: "16L", role: "arr" },
              "17R/35L": { active: false, selectedDirection: "35L", role: "dep" },
              "17L/35R": { active: true, selectedDirection: "35R", role: "dep" },
              "18/36":   { active: false, selectedDirection: "36",  role: "dep" }
            }
          }
        },
        runwayComplexes: [
          { id: "16R/34L", name: "Pist 16R / 34L (Batı İç)", primary: "16R", opposite: "34L" },
          { id: "16L/34R", name: "Pist 16L / 34R (Batı Dış)", primary: "16L", opposite: "34R" },
          { id: "17R/35L", name: "Pist 17R / 35L (Doğu Dış)", primary: "35L", opposite: "17R" },
          { id: "17L/35R", name: "Pist 17L / 35R (Doğu İç)", primary: "35R", opposite: "17L" },
          { id: "18/36",   name: "Pist 18 / 36 (En Doğu)",     primary: "36",  opposite: "18" }
        ],
        runways: {
          "16R": {
            id: "16R",
            pairId: "16R/34L",
            name: "Pist 16R",
            heading: 163,
            threshold: [41.298586, 28.706735],
            touchdown: [41.287917, 28.706942],
            rolloutEnd: [41.264828, 28.707389],
            liftoff: [41.264828, 28.707389],
            exits: [
              { id: "A6A", name: "A6A", desc: "Hızlı Çıkış (Rapid Exit)", pos: [41.282251, 28.707052] },
              { id: "A7A", name: "A7A", desc: "Hızlı Çıkış (Rapid Exit)", pos: [41.281049, 28.707075] },
              { id: "A5A", name: "A5A", desc: "Orta Çıkış (Intermediate)", pos: [41.278734, 28.707120] },
              { id: "A4A", name: "A4A", desc: "Güney Çıkış", pos: [41.267818, 28.717754] },
              { id: "A3A", name: "A3A", desc: "Pist Sonu Çıkışı", pos: [41.266845, 28.709862] }
            ],
            entries: [
              { id: "A1", name: "A1", desc: "Pist Başı (Full Length)", holdPos: [41.298524, 28.709226], lineupPos: [41.298586, 28.706735] }
            ]
          },
          "34L": {
            id: "34L",
            pairId: "16R/34L",
            name: "Pist 34L",
            heading: 343,
            threshold: [41.264828, 28.707389],
            touchdown: [41.274000, 28.707150],
            rolloutEnd: [41.298586, 28.706735],
            liftoff: [41.298586, 28.706735],
            exits: [
              { id: "A5A", name: "A5A", desc: "Hızlı Çıkış", pos: [41.278734, 28.707120] },
              { id: "A6A", name: "A6A", desc: "Hızlı Çıkış", pos: [41.282251, 28.707052] },
              { id: "A7A", name: "A7A", desc: "Orta Çıkış", pos: [41.281049, 28.707075] },
              { id: "A10A", name: "A10A", desc: "Kuzey Çıkış", pos: [41.296164, 28.706782] }
            ],
            entries: [
              { id: "A1A", name: "A1A", desc: "Pist Başı (Full Length)", holdPos: [41.264976, 28.709899], lineupPos: [41.264828, 28.707389] }
            ]
          },
          "16L": {
            id: "16L",
            pairId: "16L/34R",
            name: "Pist 16L",
            heading: 163,
            threshold: [41.298628, 28.709224],
            touchdown: [41.288000, 28.709300],
            rolloutEnd: [41.264872, 28.709902],
            liftoff: [41.264872, 28.709902],
            exits: [
              { id: "A6B", name: "A6B", desc: "Hızlı Çıkış", pos: [41.282500, 28.709350] },
              { id: "A7B", name: "A7B", desc: "Orta Çıkış", pos: [41.280500, 28.709400] }
            ],
            entries: [
              { id: "A1L", name: "A1L", desc: "Pist Başı (Full Length)", holdPos: [41.298500, 28.711500], lineupPos: [41.298628, 28.709224] }
            ]
          },
          "34R": {
            id: "34R",
            pairId: "16L/34R",
            name: "Pist 34R",
            heading: 343,
            threshold: [41.264872, 28.709902],
            touchdown: [41.274000, 28.709800],
            rolloutEnd: [41.298628, 28.709224],
            liftoff: [41.298628, 28.709224],
            exits: [
              { id: "A6B", name: "A6B", desc: "Hızlı Çıkış", pos: [41.282500, 28.709350] },
              { id: "A7B", name: "A7B", desc: "Orta Çıkış", pos: [41.280500, 28.709400] }
            ],
            entries: [
              { id: "A1R", name: "A1R", desc: "Pist Başı (Full Length)", holdPos: [41.264800, 28.712000], lineupPos: [41.264872, 28.709902] }
            ]
          },
          "35R": {
            id: "35R",
            pairId: "17L/35R",
            name: "Pist 35R",
            heading: 354,
            threshold: [41.261944, 28.727735],
            touchdown: [41.272000, 28.727600],
            rolloutEnd: [41.298820, 28.727016],
            liftoff: [41.298820, 28.727016],
            exits: [
              { id: "C10", name: "C10", desc: "Hızlı Çıkış", pos: [41.284163, 28.727302] },
              { id: "C11", name: "C11", desc: "Kuzey Çıkış", pos: [41.294823, 28.727094] },
              { id: "C12", name: "C12", desc: "Pist Sonu Çıkış", pos: [41.296968, 28.727583] }
            ],
            entries: [
              { id: "B1", name: "B1", desc: "Pist Başı (Full Length)", holdPos: [41.261940, 28.725220], lineupPos: [41.261944, 28.727735] }
            ]
          },
          "17L": {
            id: "17L",
            pairId: "17L/35R",
            name: "Pist 17L",
            heading: 174,
            threshold: [41.298820, 28.727016],
            touchdown: [41.288000, 28.727100],
            rolloutEnd: [41.261944, 28.727735],
            liftoff: [41.261944, 28.727735],
            exits: [
              { id: "C10", name: "C10", desc: "Hızlı Çıkış", pos: [41.284163, 28.727302] },
              { id: "B3", name: "B3", desc: "Güney Çıkış", pos: [41.265786, 28.725144] }
            ],
            entries: [
              { id: "B14", name: "B14", desc: "Pist Başı (Full Length)", holdPos: [41.298690, 28.724509], lineupPos: [41.298820, 28.727016] }
            ]
          },
          "35L": {
            id: "35L",
            pairId: "17R/35L",
            name: "Pist 35L",
            heading: 354,
            threshold: [41.261896, 28.725219],
            touchdown: [41.272000, 28.725100],
            rolloutEnd: [41.298811, 28.724507],
            liftoff: [41.298811, 28.724507],
            exits: [
              { id: "B8", name: "B8", desc: "Hızlı Çıkış", pos: [41.284000, 28.725000] },
              { id: "B10", name: "B10", desc: "Kuzey Çıkış", pos: [41.295000, 28.724700] }
            ],
            entries: [
              { id: "B1L", name: "B1L", desc: "Pist Başı (Full Length)", holdPos: [41.261800, 28.723000], lineupPos: [41.261896, 28.725219] }
            ]
          },
          "17R": {
            id: "17R",
            pairId: "17R/35L",
            name: "Pist 17R",
            heading: 174,
            threshold: [41.298811, 28.724507],
            touchdown: [41.288000, 28.724600],
            rolloutEnd: [41.261896, 28.725219],
            liftoff: [41.261896, 28.725219],
            exits: [
              { id: "B8", name: "B8", desc: "Hızlı Çıkış", pos: [41.284000, 28.725000] }
            ],
            entries: [
              { id: "B14L", name: "B14L", desc: "Pist Başı (Full Length)", holdPos: [41.298700, 28.722000], lineupPos: [41.298811, 28.724507] }
            ]
          },
          "36": {
            id: "36",
            pairId: "18/36",
            name: "Pist 36",
            heading: 358,
            threshold: [41.262338, 28.756682],
            touchdown: [41.270000, 28.756500],
            rolloutEnd: [41.289681, 28.756155],
            liftoff: [41.289681, 28.756155],
            exits: [
              { id: "D5", name: "D5", desc: "Hızlı Çıkış", pos: [41.278000, 28.756300] }
            ],
            entries: [
              { id: "D1", name: "D1", desc: "Pist Başı (Full Length)", holdPos: [41.262200, 28.754500], lineupPos: [41.262338, 28.756682] }
            ]
          },
          "18": {
            id: "18",
            pairId: "18/36",
            name: "Pist 18",
            heading: 178,
            threshold: [41.289681, 28.756155],
            touchdown: [41.280000, 28.756300],
            rolloutEnd: [41.262338, 28.756682],
            liftoff: [41.262338, 28.756682],
            exits: [
              { id: "D5", name: "D5", desc: "Hızlı Çıkış", pos: [41.278000, 28.756300] }
            ],
            entries: [
              { id: "D10", name: "D10", desc: "Pist Başı (Full Length)", holdPos: [41.289600, 28.754000], lineupPos: [41.289681, 28.756155] }
            ]
          }
        }
      },
      LTFJ: {
        presets: {
          DISTRIBUTED: {
            id: "DISTRIBUTED",
            name: "⚡ Çift Pist Operasyonu (Tavsiye Edilen)",
            description: "06L İniş (Kuzey) / 06R Kalkış (Güney) Paralel Akış",
            arrRunway: "06L",
            depRunway: "06R",
            mandatoryDepEntry: "TWY A1",
            allowedExits: ["TWY K", "TWY L", "TWY F", "TWY C11"],
            exitMode: "flexible",
            multiRunways: {
              "06L/24R": { active: true, selectedDirection: "06L", role: "arr" },
              "06R/24L": { active: true, selectedDirection: "06R", role: "dep" }
            }
          },
          OPS_06: {
            id: "OPS_06",
            name: "06 Operasyonu (Doğu Yönü)",
            description: "06L İniş (Batıdan Doğuya) / 06R Kalkış (Batıdan Doğuya)",
            arrRunway: "06L",
            depRunway: "06R",
            mandatoryDepEntry: "TWY A1",
            allowedExits: ["TWY K", "TWY L", "TWY F", "TWY C11"],
            exitMode: "flexible",
            multiRunways: {
              "06L/24R": { active: true, selectedDirection: "06L", role: "arr" },
              "06R/24L": { active: true, selectedDirection: "06R", role: "dep" }
            }
          },
          OPS_24: {
            id: "OPS_24",
            name: "24 Operasyonu (Batı Yönü)",
            description: "24R İniş (Doğudan Batıya) / 24L Kalkış (Doğudan Batıya)",
            arrRunway: "24R",
            depRunway: "24L",
            mandatoryDepEntry: "TWY A11",
            allowedExits: ["TWY F", "TWY L", "TWY K", "TWY D1"],
            exitMode: "flexible",
            multiRunways: {
              "06L/24R": { active: true, selectedDirection: "24R", role: "arr" },
              "06R/24L": { active: true, selectedDirection: "24L", role: "dep" }
            }
          }
        },
        runwayComplexes: [
          { id: "06L/24R", name: "Pist 06L / 24R (Kuzey)", primary: "06L", opposite: "24R" },
          { id: "06R/24L", name: "Pist 06R / 24L (Güney)", primary: "06R", opposite: "24L" }
        ],
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
              { id: "TWY D1", name: "TWY D1", desc: "Pist Başı (Full Length)", holdPos: [40.895727, 29.295872], lineupPos: [40.892641, 29.293205] }
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
              { id: "TWY L", name: "TWY L", desc: "Hızlı Çıkış", pos: [40.897595, 29.306680] }
            ],
            entries: [
              { id: "TWY C11", name: "TWY C11", desc: "Pist Başı (Full Length)", holdPos: [40.902820, 29.325718], lineupPos: [40.904441, 29.325242] }
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
              { id: "TWY A5", name: "TWY A5", desc: "Hızlı Çıkış", pos: [40.889602, 29.309748] },
              { id: "TWY A6", name: "TWY A6", desc: "Hızlı Çıkış", pos: [40.891157, 29.313969] }
            ],
            entries: [
              { id: "TWY A1", name: "TWY A1", desc: "Pist Başı (Full Length)", holdPos: [40.884727, 29.302251], lineupPos: [40.884851, 29.302589] }
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
              { id: "TWY A6", name: "TWY A6", desc: "Hızlı Çıkış", pos: [40.891157, 29.313969] }
            ],
            entries: [
              { id: "TWY A11", name: "TWY A11", desc: "Pist Başı (Full Length)", holdPos: [40.899613, 29.338133], lineupPos: [40.898754, 29.340392] }
            ]
          }
        }
      }
    };

    // Active multi-runway states
    this.multiRunwayStates = {
      LTFM: {
        "16R/34L": { active: true, selectedDirection: "16R", role: "arr" },
        "16L/34R": { active: true, selectedDirection: "34R", role: "dep" },
        "17R/35L": { active: true, selectedDirection: "35L", role: "dep" },
        "17L/35R": { active: true, selectedDirection: "35R", role: "dep" },
        "18/36":   { active: true, selectedDirection: "36",  role: "dep" }
      },
      LTFJ: {
        "06L/24R": { active: true, selectedDirection: "06L", role: "arr" },
        "06R/24L": { active: true, selectedDirection: "06R", role: "dep" }
      }
    };

    this.activeConfig = {
      LTFM: {
        preset: "DISTRIBUTED",
        arrRunway: "16R",
        depRunway: "35R",
        mandatoryDepEntry: "B1",
        allowedExits: ["A6A", "A7A", "A5A", "A4A", "A3A", "A2A"],
        exitMode: "flexible"
      },
      LTFJ: {
        preset: "DISTRIBUTED",
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

  /**
   * Returns array of all active departure runway objects for traffic distribution
   */
  getActiveDepRunways(icao = null) {
    const code = icao || this.airportIcao;
    const catalog = this.catalogs[code];
    const states = this.multiRunwayStates[code];
    if (!catalog || !states) return [];

    const activeList = [];
    Object.entries(states).forEach(([complexId, state]) => {
      if (state.active && (state.role === "dep" || state.role === "both")) {
        const rwyObj = catalog.runways[state.selectedDirection];
        if (rwyObj) activeList.push(rwyObj);
      }
    });

    if (activeList.length === 0) {
      const fallbackId = this.activeConfig[code].depRunway;
      const fallback = catalog.runways[fallbackId] || Object.values(catalog.runways)[0];
      if (fallback) activeList.push(fallback);
    }
    return activeList;
  }

  /**
   * Returns array of all active arrival runway objects for traffic distribution
   */
  getActiveArrRunways(icao = null) {
    const code = icao || this.airportIcao;
    const catalog = this.catalogs[code];
    const states = this.multiRunwayStates[code];
    if (!catalog || !states) return [];

    const activeList = [];
    Object.entries(states).forEach(([complexId, state]) => {
      if (state.active && (state.role === "arr" || state.role === "both")) {
        const rwyObj = catalog.runways[state.selectedDirection];
        if (rwyObj) activeList.push(rwyObj);
      }
    });

    if (activeList.length === 0) {
      const fallbackId = this.activeConfig[code].arrRunway;
      const fallback = catalog.runways[fallbackId] || Object.values(catalog.runways)[0];
      if (fallback) activeList.push(fallback);
    }
    return activeList;
  }

  /**
   * Returns list of all runway complexes and their active/direction/role configuration
   */
  getAllRunwayComplexes(icao = null) {
    const code = icao || this.airportIcao;
    const catalog = this.catalogs[code];
    const states = this.multiRunwayStates[code];
    if (!catalog) return [];

    const list = catalog.runwayComplexes || [];
    return list.map(c => {
      const state = states[c.id] || { active: true, selectedDirection: c.primary, role: "dep" };
      const currentDirObj = catalog.runways[state.selectedDirection];
      const otherDirId = state.selectedDirection === c.primary ? c.opposite : c.primary;
      const otherDirObj = catalog.runways[otherDirId];
      return {
        id: c.id,
        name: c.name,
        active: !!state.active,
        role: state.role || "dep",
        selectedDirection: state.selectedDirection,
        currentRwyData: currentDirObj,
        otherRwyData: otherDirObj,
        otherDirection: otherDirId
      };
    });
  }

  /**
   * Toggles active state of a runway complex
   */
  toggleRunwayActive(complexId, icao = null) {
    const code = icao || this.airportIcao;
    const state = this.multiRunwayStates[code]?.[complexId];
    if (state) {
      state.active = !state.active;
      this.syncActiveConfig(code);
      this.notifyChange(code);
      return state.active;
    }
    return false;
  }

  /**
   * Flips runway direction (e.g. 16R ➔ 34L or 35R ➔ 17L)
   */
  flipRunwayDirection(complexId, icao = null) {
    const code = icao || this.airportIcao;
    const catalog = this.catalogs[code];
    const state = this.multiRunwayStates[code]?.[complexId];
    const complexDef = catalog?.runwayComplexes?.find(c => c.id === complexId);
    if (state && complexDef) {
      state.selectedDirection = state.selectedDirection === complexDef.primary ? complexDef.opposite : complexDef.primary;
      this.syncActiveConfig(code);
      this.notifyChange(code);
      return state.selectedDirection;
    }
    return null;
  }

  /**
   * Sets runway role ('dep', 'arr', 'both')
   */
  setRunwayRole(complexId, role, icao = null) {
    const code = icao || this.airportIcao;
    const state = this.multiRunwayStates[code]?.[complexId];
    if (state) {
      state.role = role;
      this.syncActiveConfig(code);
      this.notifyChange(code);
      return true;
    }
    return false;
  }

  syncActiveConfig(code) {
    const depList = this.getActiveDepRunways(code);
    const arrList = this.getActiveArrRunways(code);
    if (depList.length > 0) this.activeConfig[code].depRunway = depList[0].id;
    if (arrList.length > 0) this.activeConfig[code].arrRunway = arrList[0].id;
  }

  getCurrentConfig(icao = null) {
    const code = icao || this.airportIcao;
    const airportCatalog = this.catalogs[code];
    const cfg = this.activeConfig[code];

    const depRunways = this.getActiveDepRunways(code);
    const arrRunways = this.getActiveArrRunways(code);

    const primaryDep = depRunways[0] || Object.values(airportCatalog.runways)[0];
    const primaryArr = arrRunways[0] || Object.values(airportCatalog.runways)[0];

    return {
      airportIcao: code,
      preset: cfg.preset,
      arrRunway: primaryArr.id,
      depRunway: primaryDep.id,
      arrRunwayData: primaryArr,
      depRunwayData: primaryDep,
      activeDepRunways: depRunways,
      activeArrRunways: arrRunways,
      mandatoryDepEntry: primaryDep.entries?.[0] || { name: "B1", id: "B1", holdPos: primaryDep.threshold },
      allowedExits: primaryArr.exits || [],
      allExits: primaryArr.exits || [],
      allEntries: primaryDep.entries || [],
      exitMode: "flexible"
    };
  }

  applyPreset(icao, presetId) {
    const code = icao || this.airportIcao;
    const catalog = this.catalogs[code];
    if (!catalog || !catalog.presets[presetId]) return false;

    const preset = catalog.presets[presetId];
    if (preset.multiRunways) {
      this.multiRunwayStates[code] = JSON.parse(JSON.stringify(preset.multiRunways));
    }
    this.activeConfig[code] = {
      preset: presetId,
      arrRunway: preset.arrRunway,
      depRunway: preset.depRunway,
      mandatoryDepEntry: preset.mandatoryDepEntry,
      allowedExits: [...(preset.allowedExits || [])],
      exitMode: preset.exitMode || "flexible"
    };

    this.syncActiveConfig(code);
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
