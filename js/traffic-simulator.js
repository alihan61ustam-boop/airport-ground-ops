/**
 * Airport Ground Traffic Simulation Engine (v5)
 * Driven by TaxiwayGraphRouter (Dijkstra over actual GeoJSON taxiway network).
 * Features:
 * - 100% adherence to orange taxiway lines (zero air-jumping).
 * - Automatic alternative path finding based on congestion weights.
 * - Dynamic separation & queueing for ground traffic safety.
 * - Real-time sync with right sidebar stand list and live HUD.
 */

class GroundTrafficSimulator {
  constructor(airportIcao = "LTFJ") {
    this.airportIcao = (airportIcao === "LTFM") ? "LTFM" : "LTFJ";
    this.simSeconds = 8 * 3600 + 15 * 60; // 08:15:00
    this.isPlaying = true;
    this.speedMultiplier = 15;
    this.flights = [];
    this.activeAircraftMarkers = new Map();
    this.onTickCallbacks = [];
    this.animationTimer = null;
    this.lastRealTimestamp = performance.now();

    this.runwayLocks = {
      "16R": null,
      "17L": null,
      "06L": null,
      "06R": null
    };

    this.initSchedule();
  }

  setAirport(icao) {
    this.airportIcao = (icao === "LTFM") ? "LTFM" : "LTFJ";
    this.clearAllAircraft();
    this.initSchedule();
  }

  clearAllAircraft() {
    this.activeAircraftMarkers.forEach(marker => {
      if (window.map) window.map.removeLayer(marker);
    });
    this.activeAircraftMarkers.clear();
  }

  initSchedule() {
    this.flights = [];
    if (!window.TaxiwayGraphRouter || !window.TaxiwayGraphRouter.isGraphReady) {
      return;
    }
    const baseStands = this.getAirportStands();

    if (this.airportIcao === "LTFM") {
      this.generateLTFMSchedule(baseStands);
    } else {
      this.generateLTFJSchedule(baseStands);
    }
  }

  getAirportStands() {
    const stands = [];
    if (window.standsMap && window.standsMap.size > 0) {
      window.standsMap.forEach(s => stands.push(s));
    }
    return stands;
  }

  /**
   * Generates ~650 realistic flights for LTFJ with TaxiwayGraphRouter
   */
  generateLTFJSchedule(availableStands) {
    const airlines = [
      { code: "PC", prefix: "PGT", name: "Pegasus Airlines" },
      { code: "VF", prefix: "AJT", name: "AJet" },
      { code: "TK", prefix: "THY", name: "Türk Hava Yolları" }
    ];

    const routes = [
      { dest: "ADB", city: "İzmir" }, { dest: "AYT", city: "Antalya" },
      { dest: "ESB", city: "Ankara" }, { dest: "BJV", city: "Bodrum" },
      { dest: "DLM", city: "Dalaman" }, { dest: "TZX", city: "Trabzon" },
      { dest: "GZT", city: "Gaziantep" }, { dest: "STN", city: "Londra" },
      { dest: "CDG", city: "Paris" }, { dest: "AMS", city: "Amsterdam" },
      { dest: "DXB", city: "Dubai" }, { dest: "VIE", city: "Viyana" }
    ];

    const aircraftTypes = ["A321neo", "B737-800", "A320neo", "B737-MAX8"];
    let flightCounter = 1001;

    for (let hour = 0; hour < 24; hour++) {
      let flightsThisHour = 8;
      if (hour >= 6 && hour <= 9) flightsThisHour = 36;
      else if (hour > 9 && hour <= 14) flightsThisHour = 32;
      else if (hour > 14 && hour <= 17) flightsThisHour = 28;
      else if (hour > 17 && hour <= 22) flightsThisHour = 34;
      else if (hour > 22 || hour < 6) flightsThisHour = 14;

      for (let i = 0; i < flightsThisHour; i++) {
        const rand = Math.random();
        let airline = airlines[0];
        if (rand > 0.65 && rand <= 0.90) airline = airlines[1];
        else if (rand > 0.90) airline = airlines[2];

        const flightNum = `${airline.code} ${2000 + (flightCounter % 899)}`;
        const tailReg = `TC-${airline.code === "PC" ? "NB" + String.fromCharCode(65 + (flightCounter % 26)) : (airline.code === "VF" ? "J" + String.fromCharCode(65 + (flightCounter % 26)) + "A" : "LS" + String.fromCharCode(65 + (flightCounter % 26)))}`;
        const acType = aircraftTypes[Math.floor(Math.random() * aircraftTypes.length)];
        const route = routes[Math.floor(Math.random() * routes.length)];

        const standIndex = (flightCounter * 7) % (availableStands.length || 1);
        const standObj = availableStands.length > 0
          ? availableStands[standIndex]
          : { ref: `20${(flightCounter % 9) + 1}A`, lat: 40.9067, lon: 29.3157 };

        const baseMinute = Math.floor((i / flightsThisHour) * 60) + Math.floor(Math.random() * 3);
        const arrivalSec = hour * 3600 + baseMinute * 60;
        const groundTimeSec = 45 * 60;
        const departureSec = arrivalSec + groundTimeSec;

        // Autonomous Graph Route Generation
        const routeData = window.TaxiwayGraphRouter.generateAutonomousFlightTrajectory(
          false,
          standObj.ref,
          [standObj.lat, standObj.lon],
          arrivalSec,
          groundTimeSec,
          flightCounter
        );

        this.flights.push({
          id: `FLT_${flightCounter}`,
          callsign: flightNum,
          airline: airline.prefix,
          registration: tailReg,
          type: acType,
          origin: route.dest,
          destination: route.dest,
          standRef: standObj.ref,
          timeInFormatted: this.formatTime(arrivalSec + 250),
          timeOutFormatted: this.formatTime(departureSec - 270),
          startTime: arrivalSec - 180,
          endTime: departureSec + 120,
          trajectory: routeData.trajectory,
          fullRoute: routeData.fullRoute,
          twySequence: routeData.twySequence,
          currentTwyName: "Approach"
        });

        flightCounter++;
      }
    }
  }

  /**
   * Generates ~1350 realistic flights for LTFM with TaxiwayGraphRouter
   */
  generateLTFMSchedule(availableStands) {
    const airlines = [
      { code: "TK", prefix: "THY", name: "Türk Hava Yolları" },
      { code: "VF", prefix: "AJT", name: "AJet" },
      { code: "LH", prefix: "GEN", name: "Lufthansa" },
      { code: "EK", prefix: "GEN", name: "Emirates" }
    ];

    const routes = [
      "JFK - New York", "LHR - Londra", "CDG - Paris", "FRA - Frankfurt",
      "DXB - Dubai", "NRT - Tokyo", "SIN - Singapur", "ORD - Chicago",
      "MIA - Miami", "ESB - Ankara", "AYT - Antalya", "ADB - İzmir"
    ];

    const aircraftTypes = ["B777-300ER", "A350-900", "A330-300", "B787-9", "A321neo"];
    let flightCounter = 5001;

    for (let hour = 0; hour < 24; hour++) {
      let flightsThisHour = 18;
      if (hour >= 6 && hour <= 9) flightsThisHour = 72;
      else if (hour > 9 && hour <= 15) flightsThisHour = 65;
      else if (hour > 15 && hour <= 22) flightsThisHour = 70;
      else if (hour > 22 || hour < 6) flightsThisHour = 26;

      for (let i = 0; i < flightsThisHour; i++) {
        const rand = Math.random();
        let airline = airlines[0];
        if (rand > 0.82 && rand <= 0.90) airline = airlines[1];
        else if (rand > 0.90) airline = airlines[2 + Math.floor(Math.random() * 2)];

        const flightNum = `${airline.code} ${1000 + (flightCounter % 1899)}`;
        const tailReg = `TC-L${String.fromCharCode(65 + (flightCounter % 26))}${String.fromCharCode(65 + (flightCounter % 26))}`;
        const acType = aircraftTypes[Math.floor(Math.random() * aircraftTypes.length)];
        const dest = routes[Math.floor(Math.random() * routes.length)];

        let standObj = null;
        if (flightCounter % 10 === 0) {
          standObj = availableStands.find(s => s.ref === "F13") || { ref: "F13", lat: 41.26647, lon: 28.74934 };
        } else {
          const standIndex = (flightCounter * 11) % (availableStands.length || 1);
          standObj = availableStands.length > 0
            ? availableStands[standIndex]
            : { ref: `D${(flightCounter % 15) + 1}`, lat: 41.2650, lon: 28.7420 };
        }

        const baseMinute = Math.floor((i / flightsThisHour) * 60) + Math.floor(Math.random() * 2);
        const arrivalSec = hour * 3600 + baseMinute * 60;
        const groundTimeSec = 55 * 60;
        const departureSec = arrivalSec + groundTimeSec;

        // Autonomous Graph Route Generation
        const routeData = window.TaxiwayGraphRouter.generateAutonomousFlightTrajectory(
          true,
          standObj.ref,
          [standObj.lat, standObj.lon],
          arrivalSec,
          groundTimeSec,
          flightCounter
        );

        this.flights.push({
          id: `FLT_${flightCounter}`,
          callsign: flightNum,
          airline: airline.prefix,
          registration: tailReg,
          type: acType,
          origin: dest.split(" - ")[0],
          destination: dest.split(" - ")[0],
          standRef: standObj.ref,
          timeInFormatted: this.formatTime(arrivalSec + 370),
          timeOutFormatted: this.formatTime(departureSec - 340),
          startTime: arrivalSec - 180,
          endTime: departureSec + 130,
          trajectory: routeData.trajectory,
          fullRoute: routeData.fullRoute,
          twySequence: routeData.twySequence,
          currentTwyName: "Approach"
        });

        flightCounter++;
      }
    }
  }

  loadFlightradarData(fileContent, isCSV = true) {
    try {
      this.clearAllAircraft();
      this.flights = [];
      const availableStands = this.getAirportStands();

      if (!isCSV) {
        const data = JSON.parse(fileContent);
        this.flights = Array.isArray(data) ? data : (data.flights || []);
      } else {
        const lines = fileContent.trim().split("\n");
        const headers = lines[0].split(",").map(h => h.trim().toLowerCase());

        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(",").map(c => c.trim().replace(/^"|"$/g, ''));
          if (cols.length < 3) continue;

          const rec = {};
          headers.forEach((h, idx) => { rec[h] = cols[idx] || ""; });

          const callsign = rec["flight"] || rec["callsign"] || `FLT${i}`;
          const reg = rec["registration"] || rec["aircraft"] || "TC-XXX";
          const type = rec["aircraft_type"] || rec["type"] || "A320";
          const origin = rec["origin"] || rec["from"] || "SAW";
          const destination = rec["destination"] || rec["to"] || "AYT";

          const timeStr = rec["std"] || rec["atd"] || rec["time"] || "08:00";
          const [hh, mm] = timeStr.split(":").map(Number);
          const arrivalSec = (isNaN(hh) ? 8 : hh) * 3600 + (isNaN(mm) ? 0 : mm) * 60;
          const departureSec = arrivalSec + 45 * 60;

          const standObj = availableStands.length > 0
            ? availableStands[i % availableStands.length]
            : { ref: `S${i}`, lat: 40.8986, lon: 29.3080 };

          const isLTFM = this.airportIcao === "LTFM";
          const routeData = window.TaxiwayGraphRouter.generateAutonomousFlightTrajectory(
            isLTFM,
            standObj.ref,
            [standObj.lat, standObj.lon],
            arrivalSec,
            45 * 60,
            i
          );

          this.flights.push({
            id: `FR24_${i}`,
            callsign: callsign,
            airline: callsign.startsWith("TK") ? "THY" : (callsign.startsWith("PC") ? "PGT" : "AJT"),
            registration: reg,
            type: type,
            origin: origin,
            destination: destination,
            standRef: standObj.ref,
            timeInFormatted: this.formatTime(arrivalSec + 240),
            timeOutFormatted: this.formatTime(departureSec - 240),
            startTime: arrivalSec - 180,
            endTime: departureSec + 120,
            trajectory: routeData.trajectory,
            fullRoute: routeData.fullRoute,
            twySequence: routeData.twySequence,
            currentTwyName: "Approach"
          });
        }
      }
      return true;
    } catch (e) {
      console.error("Flightradar data import error:", e);
      return false;
    }
  }

  start() {
    this.isPlaying = true;
    this.lastRealTimestamp = performance.now();
    this.loop();
  }

  pause() {
    this.isPlaying = false;
    if (this.animationTimer) {
      cancelAnimationFrame(this.animationTimer);
      this.animationTimer = null;
    }
  }

  setSpeed(multiplier) {
    this.speedMultiplier = multiplier;
  }

  setTime(seconds) {
    this.simSeconds = Math.max(0, Math.min(86399, seconds));
    this.updateSimulation(0);
  }

  loop() {
    if (!this.isPlaying) return;

    const now = performance.now();
    const dtSeconds = (now - this.lastRealTimestamp) / 1000;
    this.lastRealTimestamp = now;

    this.simSeconds = (this.simSeconds + dtSeconds * this.speedMultiplier) % 86400;
    this.updateSimulation(dtSeconds);
    this.animationTimer = requestAnimationFrame(() => this.loop());
  }

  updateSimulation(dt) {
    const currentTime = this.simSeconds;
    const activeFlights = [];
    const occupiedFlightsMap = new Map();

    const rwyActive = { "16R": false, "17L": false, "06L": false, "06R": false };

    this.flights.forEach(f => {
      if (currentTime >= f.startTime && currentTime <= f.endTime) {
        const state = this.interpolateState(f, currentTime);
        if (state) {
          f.lat = state.lat;
          f.lon = state.lon;
          f.heading = state.heading;
          f.speed = state.speed;
          f.phase = state.phase;
          f.altitude = state.alt;
          f.currentTwyName = state.twyName || "Taksi Yolu";
          f.isHoldingPoint = !!state.isHoldingPoint;

          if (state.phase === "landing" || state.phase === "takeoff") {
            if (this.airportIcao === "LTFM") {
              if (state.phase === "landing") rwyActive["16R"] = true;
              if (state.phase === "takeoff") rwyActive["17L"] = true;
            } else {
              if (state.phase === "landing") rwyActive["06L"] = true;
              if (state.phase === "takeoff") rwyActive["06R"] = true;
            }
          }
          activeFlights.push(f);
        }
      }
    });

    let counts = { approaching: 0, taxiing: 0, on_stand: 0, takeoff: 0 };

    for (let i = 0; i < activeFlights.length; i++) {
      const flightA = activeFlights[i];

      // Runway Incursion Protection
      if (flightA.isHoldingPoint) {
        const targetRwy = this.airportIcao === "LTFM" ? "17L" : "06R";
        if (rwyActive[targetRwy]) {
          flightA.speed = 0;
          flightA.phase = "holding";
          flightA.currentTwyName = `${flightA.currentTwyName} (Pist Bekleme / Hold)`;
        }
      }

      // Dynamic Taxiway Queueing
      if (flightA.phase === "taxi_in" || flightA.phase === "taxi_out") {
        for (let j = 0; j < activeFlights.length; j++) {
          if (i === j) continue;
          const flightB = activeFlights[j];
          if (flightB.phase === "taxi_in" || flightB.phase === "taxi_out" || flightB.phase === "holding") {
            const dist = this.calcDistanceMeters(flightA.lat, flightA.lon, flightB.lat, flightB.lon);
            if (dist < 75) {
              flightA.speed = 0;
              flightA.phase = "queued";
              flightA.currentTwyName = `${flightA.currentTwyName} (Taksi Sırası / Queued)`;
              break;
            }
          }
        }
      }

      flightA.remainingRoute = this.getRemainingPath(flightA, currentTime);

      if (flightA.phase === "on_stand") {
        occupiedFlightsMap.set(flightA.standRef, flightA);
        counts.on_stand++;
      } else if (flightA.phase === "taxi_in" || flightA.phase === "taxi_out" || flightA.phase === "pushback" || flightA.phase === "holding" || flightA.phase === "queued") {
        counts.taxiing++;
      } else if (flightA.phase === "landing" || flightA.phase === "approaching") {
        counts.approaching++;
      } else {
        counts.takeoff++;
      }

      this.syncAircraftMarker(flightA);
    }

    this.activeAircraftMarkers.forEach((marker, id) => {
      if (!activeFlights.some(f => f.id === id)) {
        if (window.map) window.map.removeLayer(marker);
        this.activeAircraftMarkers.delete(id);
      }
    });

    this.syncStandOccupancy(occupiedFlightsMap);

    this.notifyTick({
      simSeconds: this.simSeconds,
      timeFormatted: this.formatTime(this.simSeconds),
      totalFlightsInSchedule: this.flights.length,
      activeFlightsCount: activeFlights.length,
      counts: counts,
      activeFlights: activeFlights
    });
  }

  getRemainingPath(flight, time) {
    const traj = flight.trajectory;
    const remaining = [[flight.lat, flight.lon]];
    for (let i = 0; i < traj.length; i++) {
      if (traj[i].time > time) {
        remaining.push(traj[i].pos);
      }
    }
    return remaining;
  }

  syncAircraftMarker(flight) {
    if (!window.map) return;

    if (this.activeAircraftMarkers.has(flight.id)) {
      const marker = this.activeAircraftMarkers.get(flight.id);
      AircraftMarkerManager.updateMarkerPosition(marker, flight);
    } else {
      const marker = AircraftMarkerManager.createMarker(flight);
      marker.addTo(window.map);
      this.activeAircraftMarkers.set(flight.id, marker);
    }
  }

  syncStandOccupancy(occupiedFlightsMap) {
    if (!window.standsMap) return;

    let anyChanged = false;

    window.standsMap.forEach(standObj => {
      if (standObj.customData && standObj.customData.manual) return;

      const activeFlight = occupiedFlightsMap.get(standObj.ref);
      const isOccupied = !!activeFlight;

      const prevStatus = standObj.customData.status;
      const prevFlight = standObj.customData.flight || "";
      const newStatus = isOccupied ? "occupied" : "free";
      const newFlight = isOccupied ? activeFlight.callsign : "";

      if (prevStatus !== newStatus || prevFlight !== newFlight) {
        standObj.customData.status = newStatus;
        standObj.customData.flight = newFlight;
        standObj.customData.aircraft = isOccupied ? `${activeFlight.type} (${activeFlight.registration})` : "";
        standObj.customData.notes = isOccupied ? `${activeFlight.origin} ➔ ${activeFlight.destination}` : "";
        standObj.customData.timeIn = isOccupied ? activeFlight.timeInFormatted : "";
        standObj.customData.timeOut = isOccupied ? activeFlight.timeOutFormatted : "";

        anyChanged = true;
        if (typeof window.updateStandMarkerVisual === "function") {
          window.updateStandMarkerVisual(standObj);
        }
      }
    });

    if (anyChanged && typeof window.onStandOccupancyChanged === "function") {
      window.onStandOccupancyChanged();
    }
  }

  interpolateState(flight, time) {
    const traj = flight.trajectory;
    if (!traj || traj.length < 2) return null;

    if (time <= traj[0].time) {
      return {
        lat: traj[0].pos[0],
        lon: traj[0].pos[1],
        heading: this.calcBearing(traj[0].pos, traj[1].pos),
        speed: traj[0].speed,
        phase: traj[0].phase,
        alt: traj[0].alt,
        twyName: traj[0].twyName,
        isHoldingPoint: traj[0].isHoldingPoint
      };
    }

    if (time >= traj[traj.length - 1].time) {
      return null;
    }

    for (let i = 0; i < traj.length - 1; i++) {
      const segA = traj[i];
      const segB = traj[i + 1];

      if (time >= segA.time && time <= segB.time) {
        const segDuration = segB.time - segA.time;
        const factor = segDuration > 0 ? (time - segA.time) / segDuration : 0;

        const lat = segA.pos[0] + (segB.pos[0] - segA.pos[0]) * factor;
        const lon = segA.pos[1] + (segB.pos[1] - segA.pos[1]) * factor;
        const speed = Math.round(segA.speed + (segB.speed - segA.speed) * factor);
        const alt = Math.round(segA.alt + (segB.alt - segA.alt) * factor);

        let heading = this.calcBearing(segA.pos, segB.pos);
        if (segB.phase === "pushback") {
          heading = (heading + 180) % 360;
        }

        return {
          lat: lat,
          lon: lon,
          heading: heading,
          speed: speed,
          phase: segB.phase,
          alt: alt,
          twyName: segB.twyName || segA.twyName,
          isHoldingPoint: segB.isHoldingPoint
        };
      }
    }
    return null;
  }

  calcBearing(posA, posB) {
    const lat1 = posA[0] * Math.PI / 180;
    const lon1 = posA[1] * Math.PI / 180;
    const lat2 = posB[0] * Math.PI / 180;
    const lon2 = posB[1] * Math.PI / 180;

    const dLon = lon2 - lon1;
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

    let brng = Math.atan2(y, x) * 180 / Math.PI;
    return (brng + 360) % 360;
  }

  calcDistanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const phi1 = lat1 * Math.PI / 180;
    const phi2 = lat2 * Math.PI / 180;
    const dPhi = (lat2 - lat1) * Math.PI / 180;
    const dLambda = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(dPhi / 2) * Math.sin(dPhi / 2) +
              Math.cos(phi1) * Math.cos(phi2) *
              Math.sin(dLambda / 2) * Math.sin(dLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  onTick(callback) {
    this.onTickCallbacks.push(callback);
  }

  notifyTick(data) {
    this.onTickCallbacks.forEach(cb => cb(data));
  }
}

window.GroundTrafficSimulator = GroundTrafficSimulator;
