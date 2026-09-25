/**
 * Dynamic Airport Taxiway Graph & Autonomous Routing Engine
 * Automatically extracts the full taxiway network from the airport GeoJSON,
 * snaps intersections, and calculates optimal, alternative, traffic-aware routes
 * using Dijkstra pathfinding on actual taxiway centerlines (100% adherence to orange lines).
 */

class TaxiwayGraphRouter {
  constructor() {
    this.airportIcao = null;
    this.nodes = []; // Array of [lat, lon]
    this.adj = new Map(); // nodeId -> Array of { target, dist, ref, edgeKey }
    this.edgeUsageMap = new Map(); // edgeKey -> number of aircraft currently assigned
    this.isGraphReady = false;

    // Spatial hash grid for fast node snapping (~18m tolerance)
    this.CELL_SIZE = 0.00018; // approx 18-20m
    this.grid = new Map();
  }

  clear() {
    this.nodes = [];
    this.adj.clear();
    this.edgeUsageMap.clear();
    this.grid.clear();
    this.isGraphReady = false;
  }

  /**
   * Builds the connected routing graph directly from GeoJSON taxiways
   */
  buildFromGeoJSON(geojson, icao = "LTFM") {
    this.clear();
    this.airportIcao = icao;

    const features = geojson.features || [];
    let taxiwayCount = 0;

    features.forEach(f => {
      if (f.properties?.aeroway === "taxiway" && f.geometry?.type === "LineString") {
        const coords = f.geometry.coordinates;
        const ref = f.properties.ref || "";
        if (coords.length >= 2) {
          taxiwayCount++;
          for (let i = 0; i < coords.length - 1; i++) {
            const u = this.getOrCreateNode(coords[i][1], coords[i][0]);
            const v = this.getOrCreateNode(coords[i + 1][1], coords[i + 1][0]);
            if (u !== v) {
              const p1 = this.nodes[u];
              const p2 = this.nodes[v];
              const dist = this.calcDistance(p1[0], p1[1], p2[0], p2[1]);
              const edgeKey = u < v ? `${u}_${v}` : `${v}_${u}`;

              if (!this.adj.has(u)) this.adj.set(u, []);
              if (!this.adj.has(v)) this.adj.set(v, []);

              this.adj.get(u).push({ target: v, dist, ref, edgeKey });
              this.adj.get(v).push({ target: u, dist, ref, edgeKey });
            }
          }
        }
      }
    });

    this.isGraphReady = this.nodes.length > 0;
    console.log(`[TaxiwayRouter] Built graph for ${icao}: ${this.nodes.length} nodes, from ${taxiwayCount} taxiways.`);
  }

  getOrCreateNode(lat, lon) {
    const key = this.getCellKey(lat, lon);
    const [cLat, cLon] = key;

    // Search neighbor cells in spatial hash
    for (let dLat = -1; dLat <= 1; dLat++) {
      for (let dLon = -1; dLon <= 1; dLon++) {
        const nKey = `${cLat + dLat}_${cLon + dLon}`;
        if (this.grid.has(nKey)) {
          const list = this.grid.get(nKey);
          for (const existingId of list) {
            const existing = this.nodes[existingId];
            if (this.calcDistance(existing[0], existing[1], lat, lon) < 22) {
              return existingId; // Snap to existing node
            }
          }
        }
      }
    }

    // Create new node
    const newId = this.nodes.length;
    this.nodes.push([lat, lon]);
    const hashKey = `${cLat}_${cLon}`;
    if (!this.grid.has(hashKey)) this.grid.set(hashKey, []);
    this.grid.get(hashKey).push(newId);
    return newId;
  }

  getCellKey(lat, lon) {
    return [Math.floor(lat / this.CELL_SIZE), Math.floor(lon / this.CELL_SIZE)];
  }

  findNearestNode(lat, lon) {
    let bestId = 0;
    let bestDist = Infinity;
    for (let i = 0; i < this.nodes.length; i++) {
      const d = this.calcDistance(this.nodes[i][0], this.nodes[i][1], lat, lon);
      if (d < bestDist) {
        bestDist = d;
        bestId = i;
      }
    }
    return { id: bestId, dist: bestDist };
  }

  /**
   * Dijkstra pathfinding with dynamic traffic congestion penalties
   */
  findRoute(startCoord, endCoord, alternativeBias = 0) {
    if (!this.isGraphReady) return null;

    const startNode = this.findNearestNode(startCoord[0], startCoord[1]).id;
    const endNode = this.findNearestNode(endCoord[0], endCoord[1]).id;

    if (startNode === endNode) {
      return { coords: [startCoord, endCoord], twyNames: ["Apron"], distance: 0 };
    }

    const distMap = new Map();
    const prevMap = new Map();
    const visited = new Set();

    // Priority Queue using binary heap / sorted array
    const pq = [{ node: startNode, cost: 0 }];
    distMap.set(startNode, 0);

    while (pq.length > 0) {
      // Pop lowest cost
      pq.sort((a, b) => a.cost - b.cost);
      const { node: u, cost: currentCost } = pq.shift();

      if (u === endNode) break;
      if (visited.has(u)) continue;
      visited.add(u);

      const neighbors = this.adj.get(u) || [];
      for (const edge of neighbors) {
        const v = edge.target;
        if (visited.has(v)) continue;

        // Congestion penalty: if edges are occupied, weight multiplies to pick alternative paths!
        const usage = this.edgeUsageMap.get(edge.edgeKey) || 0;
        const congestionMultiplier = 1.0 + (usage * 2.8) + (Math.random() * alternativeBias);
        const weight = edge.dist * congestionMultiplier;

        const newCost = currentCost + weight;
        if (!distMap.has(v) || newCost < distMap.get(v)) {
          distMap.set(v, newCost);
          prevMap.set(v, { u, ref: edge.ref, edgeKey: edge.edgeKey });
          pq.push({ node: v, cost: newCost });
        }
      }
    }

    if (!prevMap.has(endNode)) {
      console.warn(`[TaxiwayRouter] No connected route found between nodes ${startNode} and ${endNode}`);
      return null;
    }

    // Reconstruct path
    const pathCoords = [];
    const twyNames = [];
    const usedEdgeKeys = [];
    let curr = endNode;

    while (prevMap.has(curr)) {
      const step = prevMap.get(curr);
      pathCoords.push(this.nodes[curr]);
      if (step.ref && (twyNames.length === 0 || twyNames[twyNames.length - 1] !== step.ref)) {
        twyNames.push(step.ref);
      }
      usedEdgeKeys.push(step.edgeKey);
      curr = step.u;
    }
    pathCoords.push(this.nodes[startNode]);

    // Reverse to go start -> end
    pathCoords.reverse();
    twyNames.reverse();

    // Register edge usage to distribute traffic
    usedEdgeKeys.forEach(k => {
      this.edgeUsageMap.set(k, (this.edgeUsageMap.get(k) || 0) + 1);
    });

    return {
      coords: pathCoords,
      twyNames: twyNames.length > 0 ? twyNames : ["TWY"],
      distance: distMap.get(endNode)
    };
  }

  /**
   * Generates a complete flight trajectory connecting runway, taxiway graph route, and stand
   */
  generateAutonomousFlightTrajectory(isLTFM, standRef, standCoord, arrivalSec, groundTimeSec, flightIndex) {
    const airportCode = isLTFM ? "LTFM" : "LTFJ";
    const rwyCfg = window.RunwayConfigManager
      ? window.RunwayConfigManager.getCurrentConfig(airportCode)
      : null;

    let rwyThreshold, rwyTouchdown, rwyExits, rwyTakeoffHold, rwyTakeoffThreshold, rwyLiftoff;
    let arrRwyName, depRwyName, mandatoryEntryName;

    if (rwyCfg && rwyCfg.arrRunwayData && rwyCfg.depRunwayData) {
      rwyThreshold = rwyCfg.arrRunwayData.threshold;
      rwyTouchdown = rwyCfg.arrRunwayData.touchdown;
      rwyExits = rwyCfg.allowedExits && rwyCfg.allowedExits.length > 0
        ? rwyCfg.allowedExits
        : rwyCfg.allExits;
      arrRwyName = rwyCfg.arrRunwayData.name;

      // Strict Mandatory Departure Entry Taxiway
      const mandatoryEntry = rwyCfg.mandatoryDepEntry;
      rwyTakeoffHold = mandatoryEntry.holdPos;
      rwyTakeoffThreshold = mandatoryEntry.lineupPos;
      rwyLiftoff = rwyCfg.depRunwayData.liftoff;
      depRwyName = rwyCfg.depRunwayData.name;
      mandatoryEntryName = mandatoryEntry.name;
    } else if (isLTFM) {
      rwyThreshold = [41.2985855, 28.7067348]; // 16R
      rwyTouchdown = [41.2879172, 28.7069417];
      rwyExits = [
        { name: "A6A", pos: [41.2822509, 28.7070516] },
        { name: "A7A", pos: [41.2810494, 28.7070749] },
        { name: "A5A", pos: [41.2787340, 28.7071198] }
      ];
      rwyTakeoffHold = [41.2619400, 28.7252200];
      rwyTakeoffThreshold = [41.2619440, 28.7277350];
      rwyLiftoff = [41.2988196, 28.7270160];
      arrRwyName = "RWY 16R";
      depRwyName = "RWY 35R";
      mandatoryEntryName = "B1";
    } else {
      rwyThreshold = [40.8926406, 29.2932050]; // 06L
      rwyTouchdown = [40.8955880, 29.3012193];
      rwyExits = [
        { name: "TWY F", pos: [40.9002179, 29.3137768] },
        { name: "TWY L", pos: [40.8975949, 29.3066797] },
        { name: "TWY K", pos: [40.8958676, 29.3019640] }
      ];
      rwyTakeoffHold = [40.8848511, 29.3025894];
      rwyTakeoffThreshold = [40.8848978, 29.3027162];
      rwyLiftoff = [40.8987538, 29.3403920];
      arrRwyName = "RWY 06L";
      depRwyName = "RWY 06R";
      mandatoryEntryName = "TWY A1";
    }

    // Select optimal exit that minimizes taxi distance & apron traffic congestion to the assigned stand
    let exitChoice = rwyExits[0];
    let bestExitScore = Infinity;

    for (let e = 0; e < rwyExits.length; e++) {
      const exitCandidate = rwyExits[e];
      const directDist = this.calcDistance(exitCandidate.pos[0], exitCandidate.pos[1], standCoord[0], standCoord[1]);
      const exitNodeId = this.findNearestNode(exitCandidate.pos[0], exitCandidate.pos[1]).id;
      const neighbors = this.adj.get(exitNodeId) || [];
      let exitCongestion = 0;
      for (const edge of neighbors) {
        exitCongestion += (this.edgeUsageMap.get(edge.edgeKey) || 0);
      }

      // Balance physical proximity to gate with traffic congestion avoidance
      const score = directDist + (exitCongestion * 220) + ((flightIndex % rwyExits.length === e) ? -35 : 0);
      if (score < bestExitScore) {
        bestExitScore = score;
        exitChoice = exitCandidate;
      }
    }

    // 2. Run graph routing from chosen Runway Exit to Stand
    const inboundRoute = this.findRoute(exitChoice.pos, standCoord, 0.45);

    // 3. Run graph routing from Stand to Departure Runway STRICT Mandatory Entry Holding Point
    // Outbound taxi MUST strictly route to the chosen mandatory entry taxiway!
    const outboundRoute = this.findRoute(standCoord, rwyTakeoffHold, 0.45);

    const trajectory = [];
    let curTime = arrivalSec - 180;

    // Approach
    const approachPt = [
      rwyThreshold[0] + (rwyThreshold[0] > rwyTouchdown[0] ? 0.035 : -0.035),
      rwyThreshold[1] + (rwyThreshold[1] > rwyTouchdown[1] ? 0.025 : -0.025)
    ];
    trajectory.push({
      time: curTime,
      pos: approachPt,
      phase: "approaching",
      speed: 145,
      alt: 1500,
      twyName: "Approach"
    });

    curTime = arrivalSec - 30;
    trajectory.push({ time: curTime, pos: rwyThreshold, phase: "landing", speed: 135, alt: 50, twyName: arrRwyName });
    curTime = arrivalSec;
    trajectory.push({ time: curTime, pos: rwyTouchdown, phase: "landing", speed: 115, alt: 0, twyName: arrRwyName });
    curTime += 40;
    trajectory.push({ time: curTime, pos: exitChoice.pos, phase: "landing", speed: 45, alt: 0, twyName: `Çıkış: ${exitChoice.name}` });

    // Append graph-traced inbound taxiway waypoints (every single point is on orange taxiway lines)
    if (inboundRoute && inboundRoute.coords.length > 0) {
      const stepDuration = Math.max(3, Math.floor(220 / inboundRoute.coords.length));
      inboundRoute.coords.forEach((coord, idx) => {
        curTime += stepDuration;
        const twyTag = inboundRoute.twyNames[Math.min(idx, inboundRoute.twyNames.length - 1)] || "Taxiway";
        trajectory.push({
          time: curTime,
          pos: coord,
          phase: "taxi_in",
          speed: 16,
          alt: 0,
          twyName: twyTag
        });
      });
    }

    // Lead into stand & stop
    curTime += 20;
    trajectory.push({
      time: curTime,
      pos: standCoord,
      phase: "on_stand",
      speed: 0,
      alt: 0,
      twyName: `Stand ${standRef}`
    });

    // Parked time on stand
    const departureSec = arrivalSec + groundTimeSec;
    trajectory.push({
      time: departureSec - 300,
      pos: standCoord,
      phase: "on_stand",
      speed: 0,
      alt: 0,
      twyName: `Stand ${standRef}`
    });

    curTime = departureSec - 280;

    // Pushback
    const pushbackNode = (outboundRoute && outboundRoute.coords.length > 1) ? outboundRoute.coords[1] : [standCoord[0] + 0.0003, standCoord[1] + 0.0003];
    trajectory.push({
      time: curTime,
      pos: pushbackNode,
      phase: "pushback",
      speed: 4,
      alt: 0,
      twyName: "Pushback"
    });

    // Outbound taxiway graph path strictly to the Mandatory Entry holding point
    if (outboundRoute && outboundRoute.coords.length > 0) {
      const stepDuration = Math.max(3, Math.floor(240 / outboundRoute.coords.length));
      outboundRoute.coords.forEach((coord, idx) => {
        curTime += stepDuration;
        const twyTag = outboundRoute.twyNames[Math.min(idx, outboundRoute.twyNames.length - 1)] || "Taxiway";
        const isHold = (idx >= outboundRoute.coords.length - 2);
        trajectory.push({
          time: curTime,
          pos: coord,
          phase: isHold ? "holding" : "taxi_out",
          speed: isHold ? 10 : 16,
          alt: 0,
          twyName: isHold ? `Zorunlu Giriş: TWY ${mandatoryEntryName} (Hold)` : twyTag,
          isHoldingPoint: isHold
        });
      });
    }

    // Lineup on takeoff runway strictly from the mandatory entry point
    curTime += 20;
    trajectory.push({
      time: curTime,
      pos: rwyTakeoffThreshold,
      phase: "takeoff",
      speed: 40,
      alt: 0,
      twyName: `${depRwyName} Lineup (via ${mandatoryEntryName})`
    });

    // Takeoff roll and climbout
    curTime += 35;
    trajectory.push({
      time: curTime,
      pos: rwyLiftoff,
      phase: "takeoff",
      speed: 160,
      alt: 20,
      twyName: depRwyName
    });

    curTime += 80;
    const climbPt = [
      rwyLiftoff[0] + (rwyLiftoff[0] > rwyTakeoffThreshold[0] ? 0.035 : -0.035),
      rwyLiftoff[1] + (rwyLiftoff[1] > rwyTakeoffThreshold[1] ? 0.030 : -0.030)
    ];
    trajectory.push({
      time: curTime,
      pos: climbPt,
      phase: "departed",
      speed: 220,
      alt: 2800,
      twyName: "Departed"
    });

    const fullRoute = trajectory.map(t => t.pos);
    const twySequence = [
      `Çıkış: ${exitChoice.name}`,
      ...(inboundRoute?.twyNames || []),
      `Stand ${standRef}`,
      ...(outboundRoute?.twyNames || []),
      `Zorunlu Giriş: ${mandatoryEntryName}`,
      depRwyName
    ];

    return {
      trajectory,
      fullRoute,
      twySequence
    };
  }

  calcDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const p1 = lat1 * Math.PI / 180;
    const p2 = lat2 * Math.PI / 180;
    const dp = (lat2 - lat1) * Math.PI / 180;
    const dl = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dp / 2) * Math.sin(dp / 2) +
              Math.cos(p1) * Math.cos(p2) *
              Math.sin(dl / 2) * Math.sin(dl / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}

window.TaxiwayGraphRouter = new TaxiwayGraphRouter();
