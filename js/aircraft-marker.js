/**
 * High-Performance Aircraft Marker & Real-World Airline Logo Engine
 * Features:
 * - Authentic vector airline logo badges (THY, Pegasus, AJet, SunExpress, Lufthansa, Emirates, Qatar, Flydubai, etc.)
 * - Prominently visible airline emblems placed directly on/above the aircraft
 * - GPU-accelerated 60+ FPS rendering (zero SVG filter convolution, cached DOM references, dirty-check updates)
 */

const AIRLINE_LIVERIES = {
  THY: {
    name: "Türk Hava Yolları",
    code: "TK",
    displayTag: "THY",
    tailColor: "#c8102e",
    wingColor: "#c8102e",
    bodyColor: "#ffffff",
    badgeBg: "#990012",
    badgeBorder: "#ff4d6d",
    textColor: "#ffffff",
    logoSvg: `
      <svg class="airline-emblem-svg" viewBox="0 0 24 24" width="13" height="13">
        <circle cx="12" cy="12" r="10.5" fill="#c8102e" stroke="#ffffff" stroke-width="1.3"/>
        <path d="M 6.5,14.5 C 8,11.5 11,8 16.5,7 C 14.5,9.5 13.5,12 14,14 C 11.5,13.5 9,14 6.5,14.5 Z" fill="#ffffff"/>
        <circle cx="15.8" cy="7.8" r="0.9" fill="#c8102e"/>
      </svg>
    `
  },
  PGT: {
    name: "Pegasus Airlines",
    code: "PC",
    displayTag: "PEGASUS",
    tailColor: "#e30613",
    wingColor: "#ffcc00",
    bodyColor: "#ffffff",
    badgeBg: "#b3000b",
    badgeBorder: "#ffcc00",
    textColor: "#ffdd44",
    logoSvg: `
      <svg class="airline-emblem-svg" viewBox="0 0 24 24" width="13" height="13">
        <rect x="1.5" y="1.5" width="21" height="21" rx="4" fill="#e30613" stroke="#ffcc00" stroke-width="1.3"/>
        <path d="M 5,16.5 C 8,13.5 10,8.5 18,5.8 C 14,8.8 12,12.8 14,16.5 C 11,15.5 8,16 5,16.5 Z" fill="#ffcc00"/>
        <path d="M 9.5,12.5 Q 14.5,9.5 17,7.5" stroke="#ffffff" stroke-width="1.2" fill="none"/>
      </svg>
    `
  },
  AJT: {
    name: "AJet",
    code: "VF",
    displayTag: "AJET",
    tailColor: "#0b1f3f",
    wingColor: "#00a3e0",
    bodyColor: "#ffffff",
    badgeBg: "#0b1f3f",
    badgeBorder: "#00a3e0",
    textColor: "#38bdf8",
    logoSvg: `
      <svg class="airline-emblem-svg" viewBox="0 0 24 24" width="13" height="13">
        <circle cx="12" cy="12" r="10.5" fill="#0b1f3f" stroke="#00a3e0" stroke-width="1.3"/>
        <path d="M 5,15 C 8,11 12,7 18.5,8 C 15,10 13,13 14,16 C 11,15 8,15 5,15 Z" fill="#00a3e0"/>
        <path d="M 11,11 C 13,8.5 16,7.5 19,7.5 C 16.5,9 15,11 15.5,13 Z" fill="#e30613"/>
      </svg>
    `
  },
  SXS: {
    name: "SunExpress",
    code: "XQ",
    displayTag: "SUNEXPRESS",
    tailColor: "#ff671f",
    wingColor: "#002d62",
    bodyColor: "#ffffff",
    badgeBg: "#002244",
    badgeBorder: "#ff671f",
    textColor: "#ff8c42",
    logoSvg: `
      <svg class="airline-emblem-svg" viewBox="0 0 24 24" width="13" height="13">
        <rect x="1.5" y="1.5" width="21" height="21" rx="4" fill="#002d62" stroke="#ff671f" stroke-width="1.3"/>
        <path d="M 5,17 C 9,13 13,8 19,7 C 15,10 13,14 14,17 Z" fill="#ff671f"/>
        <circle cx="17.5" cy="8" r="2.2" fill="#ffcc00"/>
      </svg>
    `
  },
  DLH: {
    name: "Lufthansa",
    code: "LH",
    displayTag: "LUFTHANSA",
    tailColor: "#001b44",
    wingColor: "#ffb300",
    bodyColor: "#ffffff",
    badgeBg: "#001b44",
    badgeBorder: "#ffb300",
    textColor: "#ffb300",
    logoSvg: `
      <svg class="airline-emblem-svg" viewBox="0 0 24 24" width="13" height="13">
        <circle cx="12" cy="12" r="10.5" fill="#001b44" stroke="#ffb300" stroke-width="1.3"/>
        <circle cx="12" cy="12" r="7.5" fill="none" stroke="#ffb300" stroke-width="0.9"/>
        <path d="M 6.5,13 C 9,11 12.5,9 16,8 C 14,11 11,13 8,14 Z" fill="#ffb300"/>
        <path d="M 13,9 L 16.5,7" stroke="#ffb300" stroke-width="1"/>
      </svg>
    `
  },
  UAE: {
    name: "Emirates",
    code: "EK",
    displayTag: "EMIRATES",
    tailColor: "#d71920",
    wingColor: "#00732f",
    bodyColor: "#ffffff",
    badgeBg: "#8b0000",
    badgeBorder: "#d4af37",
    textColor: "#fef08a",
    logoSvg: `
      <svg class="airline-emblem-svg" viewBox="0 0 24 24" width="13" height="13">
        <rect x="1.5" y="2.5" width="21" height="19" rx="3" fill="#d71920" stroke="#d4af37" stroke-width="1.3"/>
        <path d="M 5,12 Q 10,7 15,11 Q 19,8 19,13 Q 14,15 9,13 Z" fill="#ffffff"/>
        <rect x="4" y="16" width="16" height="2" fill="#00732f"/>
      </svg>
    `
  },
  QTR: {
    name: "Qatar Airways",
    code: "QR",
    displayTag: "QATAR",
    tailColor: "#5c0632",
    wingColor: "#5c0632",
    bodyColor: "#ffffff",
    badgeBg: "#400423",
    badgeBorder: "#9f1239",
    textColor: "#fecdd3",
    logoSvg: `
      <svg class="airline-emblem-svg" viewBox="0 0 24 24" width="13" height="13">
        <circle cx="12" cy="12" r="10.5" fill="#5c0632" stroke="#ffffff" stroke-width="1.3"/>
        <path d="M 8,16 L 12,9 L 16,16 Z" fill="#ffffff"/>
        <path d="M 11.5,9 Q 10,4 9,2.5" stroke="#ffffff" stroke-width="1.1" fill="none"/>
        <path d="M 12.5,9 Q 14,4 15,2.5" stroke="#ffffff" stroke-width="1.1" fill="none"/>
      </svg>
    `
  },
  FDB: {
    name: "Flydubai",
    code: "FZ",
    displayTag: "FLYDUBAI",
    tailColor: "#0072ce",
    wingColor: "#ff7900",
    bodyColor: "#ffffff",
    badgeBg: "#004b87",
    badgeBorder: "#ff7900",
    textColor: "#ffedd5",
    logoSvg: `
      <svg class="airline-emblem-svg" viewBox="0 0 24 24" width="13" height="13">
        <rect x="1.5" y="1.5" width="21" height="21" rx="4" fill="#0072ce" stroke="#ff7900" stroke-width="1.3"/>
        <path d="M 4,16 Q 10,9 18,8 Q 14,14 6,17 Z" fill="#ff7900"/>
        <circle cx="17" cy="8.5" r="2" fill="#ffffff"/>
      </svg>
    `
  },
  BAW: {
    name: "British Airways",
    code: "BA",
    displayTag: "BRITISH",
    tailColor: "#075aaa",
    wingColor: "#eb2226",
    bodyColor: "#ffffff",
    badgeBg: "#05305c",
    badgeBorder: "#eb2226",
    textColor: "#ffffff",
    logoSvg: `
      <svg class="airline-emblem-svg" viewBox="0 0 24 24" width="13" height="13">
        <rect x="1.5" y="2.5" width="21" height="19" rx="3" fill="#075aaa" stroke="#eb2226" stroke-width="1.3"/>
        <path d="M 4,13 Q 12,8 20,9" stroke="#eb2226" stroke-width="2" fill="none"/>
        <path d="M 4,15 Q 12,10 20,11" stroke="#ffffff" stroke-width="1.2" fill="none"/>
      </svg>
    `
  },
  ABY: {
    name: "Air Arabia",
    code: "G9",
    displayTag: "AIR ARABIA",
    tailColor: "#e21836",
    wingColor: "#e21836",
    bodyColor: "#ffffff",
    badgeBg: "#9e0e24",
    badgeBorder: "#f43f5e",
    textColor: "#ffffff",
    logoSvg: `
      <svg class="airline-emblem-svg" viewBox="0 0 24 24" width="13" height="13">
        <circle cx="12" cy="12" r="10.5" fill="#e21836" stroke="#ffffff" stroke-width="1.3"/>
        <path d="M 5,14 Q 9,9 12,12 Q 15,9 19,14 Q 15,12 12,13 Q 9,12 5,14 Z" fill="#ffffff"/>
      </svg>
    `
  },
  GEN: {
    name: "Genel Havacılık / VIP",
    code: "TC",
    displayTag: "VIP / GEN",
    tailColor: "#059669",
    wingColor: "#f59e0b",
    bodyColor: "#ffffff",
    badgeBg: "#064e3b",
    badgeBorder: "#f59e0b",
    textColor: "#fef08a",
    logoSvg: `
      <svg class="airline-emblem-svg" viewBox="0 0 24 24" width="13" height="13">
        <circle cx="12" cy="12" r="10.5" fill="#059669" stroke="#f59e0b" stroke-width="1.3"/>
        <polygon points="12,5 13.8,9 18,9 14.5,11.8 16,16 12,13.5 8,16 9.5,11.8 6,9 10.2,9" fill="#f59e0b"/>
      </svg>
    `
  },
  ROT: {
    name: "Tarom",
    code: "RO",
    displayTag: "TAROM",
    tailColor: "#00205b",
    wingColor: "#ffc72c",
    bodyColor: "#ffffff",
    badgeBg: "#001845",
    badgeBorder: "#ffc72c",
    textColor: "#ffdd44",
    logoSvg: `
      <svg class="airline-emblem-svg" viewBox="0 0 24 24" width="13" height="13">
        <circle cx="12" cy="12" r="10.5" fill="#00205b" stroke="#ffc72c" stroke-width="1.3"/>
        <path d="M 6,15 L 12,8 L 18,15 L 12,12 Z" fill="#ffc72c"/>
      </svg>
    `
  },
  AFR: {
    name: "Air France",
    code: "AF",
    displayTag: "AIR FRANCE",
    tailColor: "#002157",
    wingColor: "#ed1c24",
    bodyColor: "#ffffff",
    badgeBg: "#001844",
    badgeBorder: "#ed1c24",
    textColor: "#ffffff",
    logoSvg: `
      <svg class="airline-emblem-svg" viewBox="0 0 24 24" width="13" height="13">
        <circle cx="12" cy="12" r="10.5" fill="#002157" stroke="#ffffff" stroke-width="1.3"/>
        <path d="M 6,16 L 14,8 L 17,9 L 10,17 Z" fill="#ed1c24"/>
      </svg>
    `
  },
  KLM: {
    name: "KLM Royal Dutch Airlines",
    code: "KL",
    displayTag: "KLM",
    tailColor: "#00a1de",
    wingColor: "#00a1de",
    bodyColor: "#ffffff",
    badgeBg: "#005580",
    badgeBorder: "#00a1de",
    textColor: "#ffffff",
    logoSvg: `
      <svg class="airline-emblem-svg" viewBox="0 0 24 24" width="13" height="13">
        <circle cx="12" cy="12" r="10.5" fill="#00a1de" stroke="#ffffff" stroke-width="1.3"/>
        <path d="M 7,15 L 8,11 L 10,13 L 12,9 L 14,13 L 16,11 L 17,15 Z" fill="#ffffff"/>
      </svg>
    `
  },
  AFL: {
    name: "Aeroflot",
    code: "SU",
    displayTag: "AEROFLOT",
    tailColor: "#002b49",
    wingColor: "#d52b1e",
    bodyColor: "#cfd6df",
    badgeBg: "#001d33",
    badgeBorder: "#d52b1e",
    textColor: "#ffffff",
    logoSvg: `
      <svg class="airline-emblem-svg" viewBox="0 0 24 24" width="13" height="13">
        <circle cx="12" cy="12" r="10.5" fill="#002b49" stroke="#d52b1e" stroke-width="1.3"/>
        <path d="M 5,14 Q 12,8 19,14 Q 12,12 5,14 Z" fill="#d52b1e"/>
      </svg>
    `
  },
  SVA: {
    name: "Saudia",
    code: "SV",
    displayTag: "SAUDIA",
    tailColor: "#004b30",
    wingColor: "#c29b38",
    bodyColor: "#ffffff",
    badgeBg: "#003320",
    badgeBorder: "#c29b38",
    textColor: "#fef08a",
    logoSvg: `
      <svg class="airline-emblem-svg" viewBox="0 0 24 24" width="13" height="13">
        <circle cx="12" cy="12" r="10.5" fill="#004b30" stroke="#c29b38" stroke-width="1.3"/>
        <path d="M 12,6 L 12,18 M 8,14 L 16,14" stroke="#c29b38" stroke-width="1.5"/>
      </svg>
    `
  },
  MSR: {
    name: "EgyptAir",
    code: "MS",
    displayTag: "EGYPTAIR",
    tailColor: "#0c2340",
    wingColor: "#b3995d",
    bodyColor: "#ffffff",
    badgeBg: "#071629",
    badgeBorder: "#b3995d",
    textColor: "#fef08a",
    logoSvg: `
      <svg class="airline-emblem-svg" viewBox="0 0 24 24" width="13" height="13">
        <circle cx="12" cy="12" r="10.5" fill="#0c2340" stroke="#b3995d" stroke-width="1.3"/>
        <path d="M 6,15 Q 12,6 18,13 Q 12,10 6,15 Z" fill="#b3995d"/>
      </svg>
    `
  },
  WZZ: {
    name: "Wizz Air",
    code: "W6",
    displayTag: "WIZZ AIR",
    tailColor: "#c6007e",
    wingColor: "#0f204b",
    bodyColor: "#ffffff",
    badgeBg: "#5c003a",
    badgeBorder: "#ff40b3",
    textColor: "#ffb3e6",
    logoSvg: `
      <svg class="airline-emblem-svg" viewBox="0 0 24 24" width="13" height="13">
        <circle cx="12" cy="12" r="10.5" fill="#c6007e" stroke="#ffffff" stroke-width="1.3"/>
        <text x="12" y="15" font-size="9" font-weight="900" text-anchor="middle" fill="#ffffff">W</text>
      </svg>
    `
  },
  TBZ: {
    name: "ATA Airlines",
    code: "I3",
    displayTag: "ATA AIR",
    tailColor: "#002855",
    wingColor: "#d9272e",
    bodyColor: "#ffffff",
    badgeBg: "#001a38",
    badgeBorder: "#d9272e",
    textColor: "#ffffff",
    logoSvg: `
      <svg class="airline-emblem-svg" viewBox="0 0 24 24" width="13" height="13">
        <circle cx="12" cy="12" r="10.5" fill="#002855" stroke="#d9272e" stroke-width="1.3"/>
        <text x="12" y="15" font-size="8" font-weight="900" text-anchor="middle" fill="#ffffff">ATA</text>
      </svg>
    `
  },
  LOT: {
    name: "LOT Polish Airlines",
    code: "LO",
    displayTag: "LOT",
    tailColor: "#00205b",
    wingColor: "#00205b",
    bodyColor: "#ffffff",
    badgeBg: "#001438",
    badgeBorder: "#38bdf8",
    textColor: "#ffffff",
    logoSvg: `
      <svg class="airline-emblem-svg" viewBox="0 0 24 24" width="13" height="13">
        <circle cx="12" cy="12" r="10.5" fill="#00205b" stroke="#ffffff" stroke-width="1.3"/>
        <text x="12" y="15" font-size="8" font-weight="900" text-anchor="middle" fill="#ffffff">LOT</text>
      </svg>
    `
  },
  AEE: {
    name: "Aegean Airlines",
    code: "A3",
    displayTag: "AEGEAN",
    tailColor: "#002b49",
    wingColor: "#0072ce",
    bodyColor: "#ffffff",
    badgeBg: "#001a2e",
    badgeBorder: "#00a3e0",
    textColor: "#38bdf8",
    logoSvg: `
      <svg class="airline-emblem-svg" viewBox="0 0 24 24" width="13" height="13">
        <circle cx="12" cy="12" r="10.5" fill="#002b49" stroke="#00a3e0" stroke-width="1.3"/>
        <path d="M 6,14 Q 10,8 14,11 Q 18,7 18,12 Z" fill="#00a3e0"/>
      </svg>
    `
  },
  MEA: {
    name: "Middle East Airlines",
    code: "ME",
    displayTag: "MEA",
    tailColor: "#007a3d",
    wingColor: "#ed1b24",
    bodyColor: "#ffffff",
    badgeBg: "#004724",
    badgeBorder: "#ed1b24",
    textColor: "#ffffff",
    logoSvg: `
      <svg class="airline-emblem-svg" viewBox="0 0 24 24" width="13" height="13">
        <circle cx="12" cy="12" r="10.5" fill="#007a3d" stroke="#ffffff" stroke-width="1.3"/>
        <path d="M 12,6 L 15,11 L 13,11 L 16,16 L 8,16 L 11,11 L 9,11 Z" fill="#ffffff"/>
      </svg>
    `
  },
  MNB: {
    name: "MNG Airlines",
    code: "MB",
    displayTag: "MNG CARGO",
    tailColor: "#c8102e",
    wingColor: "#00205b",
    bodyColor: "#ffffff",
    badgeBg: "#8b0000",
    badgeBorder: "#ffcc00",
    textColor: "#ffffff",
    logoSvg: `
      <svg class="airline-emblem-svg" viewBox="0 0 24 24" width="13" height="13">
        <circle cx="12" cy="12" r="10.5" fill="#c8102e" stroke="#ffcc00" stroke-width="1.3"/>
        <text x="12" y="15" font-size="8" font-weight="900" text-anchor="middle" fill="#ffffff">MNG</text>
      </svg>
    `
  },
  FDX: {
    name: "FedEx",
    code: "FX",
    displayTag: "FEDEX",
    tailColor: "#4d148c",
    wingColor: "#ff6600",
    bodyColor: "#ffffff",
    badgeBg: "#2d0b54",
    badgeBorder: "#ff6600",
    textColor: "#ffedd5",
    logoSvg: `
      <svg class="airline-emblem-svg" viewBox="0 0 24 24" width="13" height="13">
        <rect x="2" y="2" width="20" height="20" rx="3" fill="#4d148c" stroke="#ff6600" stroke-width="1.2"/>
        <text x="12" y="15" font-size="7" font-weight="900" text-anchor="middle" fill="#ff6600">FX</text>
      </svg>
    `
  },
  PBD: {
    name: "Pobeda",
    code: "DP",
    displayTag: "POBEDA",
    tailColor: "#00a1de",
    wingColor: "#00205b",
    bodyColor: "#ffffff",
    badgeBg: "#004066",
    badgeBorder: "#00a1de",
    textColor: "#38bdf8",
    logoSvg: `
      <svg class="airline-emblem-svg" viewBox="0 0 24 24" width="13" height="13">
        <circle cx="12" cy="12" r="10.5" fill="#00a1de" stroke="#ffffff" stroke-width="1.3"/>
        <text x="12" y="15" font-size="8" font-weight="900" text-anchor="middle" fill="#ffffff">DP</text>
      </svg>
    `
  }
};

class AircraftMarkerManager {
  static getLivery(airlineKey, flight) {
    if (airlineKey && AIRLINE_LIVERIES[airlineKey]) {
      return AIRLINE_LIVERIES[airlineKey];
    }

    // Dynamic brand generator: Never default regular flights to VIP / GEN!
    const name = flight?.airlineName || airlineKey || "Uçuş";
    const tag = (airlineKey && airlineKey.length <= 6 && airlineKey !== "GEN") 
      ? airlineKey 
      : (flight?.callsign ? flight.callsign.substring(0, 3) : "AIR");

    if (tag === "GEN" || tag === "TC") {
      return AIRLINE_LIVERIES.GEN;
    }

    // Deterministic brand colors from name/tag hash
    let hash = 0;
    const str = (name || "") + tag;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    const h = Math.abs(hash) % 360;
    const brandColor = `hsl(${h}, 80%, 45%)`;
    const brandBg = `hsl(${h}, 70%, 15%)`;
    const brandBorder = `hsl(${h}, 85%, 60%)`;

    return {
      name: name,
      code: tag,
      displayTag: tag,
      tailColor: brandColor,
      wingColor: brandColor,
      bodyColor: "#ffffff",
      badgeBg: brandBg,
      badgeBorder: brandBorder,
      textColor: "#ffffff",
      logoSvg: `
        <svg class="airline-emblem-svg" viewBox="0 0 24 24" width="13" height="13">
          <circle cx="12" cy="12" r="10.5" fill="${brandColor}" stroke="#ffffff" stroke-width="1.2"/>
          <text x="12" y="15" font-size="8" font-weight="900" text-anchor="middle" fill="#ffffff">${tag.substring(0, 2)}</text>
        </svg>
      `
    };
  }

  /**
   * Generates clean, fast vector SVG for airplane model without costly SVG filters
   */
  static createAircraftSVG(livery, heading = 0, isSelected = false, size = 42) {
    const strokeColor = isSelected ? '#00e5ff' : '#0f172a';
    const strokeWidth = isSelected ? '2.4' : '1.2';

    return `
      <svg class="aircraft-svg ${isSelected ? 'selected-aircraft' : ''}" width="${size}" height="${size}" viewBox="0 0 100 100" style="transform: rotate(${heading}deg);">
        <g class="plane-body-group">
          <!-- Main Swept Wings -->
          <polygon points="50,38 8,66 12,71 47,52 53,52 88,71 92,66" fill="${livery.bodyColor}" stroke="${strokeColor}" stroke-width="${strokeWidth}" />
          <!-- Winglets in authentic airline color -->
          <polygon points="6,64 8,66 12,71 10,69" fill="${livery.wingColor}" />
          <polygon points="94,64 92,66 88,71 90,69" fill="${livery.wingColor}" />

          <!-- Jet Turbofan Engines -->
          <rect x="33" y="52" width="6" height="13" rx="2" fill="#334155" stroke="#0f172a" stroke-width="1" />
          <rect x="61" y="52" width="6" height="13" rx="2" fill="#334155" stroke="#0f172a" stroke-width="1" />

          <!-- Horizontal Stabilizers -->
          <polygon points="50,81 26,95 29,98 48,90 52,90 71,98 74,95" fill="${livery.bodyColor}" stroke="${strokeColor}" stroke-width="${strokeWidth}" />

          <!-- Aerodynamic Fuselage -->
          <ellipse cx="50" cy="50" rx="6.5" ry="43" fill="${livery.bodyColor}" stroke="${strokeColor}" stroke-width="${strokeWidth}" />

          <!-- High-Visibility Vertical Tailfin in Brand Color -->
          <polygon points="50,66 46,95 54,95" fill="${livery.tailColor}" stroke="#0f172a" stroke-width="1" />
          <circle cx="50" cy="88" r="2.8" fill="#ffffff" />

          <!-- Cockpit Flight Deck Glass -->
          <path d="M 46.5,14 Q 50,10 53.5,14 Q 50,17 46.5,14 Z" fill="#0284c7" stroke="#0f172a" stroke-width="0.8" />
        </g>
      </svg>
    `;
  }

  static createMarker(flight) {
    const livery = this.getLivery(flight.airline, flight);
    const isSelected = (window.selectedFlightId === flight.id);
    const heading = flight.heading || 0;
    const svgHtml = this.createAircraftSVG(livery, heading, isSelected);

    // High-visibility top badge with authentic airline vector logo
    const logoBadgeHtml = `
      <div class="airline-brand-badge" style="background: ${livery.badgeBg}; border-color: ${livery.badgeBorder}; color: ${livery.textColor};">
        ${livery.logoSvg}
        <span class="airline-brand-tag">${livery.displayTag}</span>
      </div>
    `;

    // High-contrast flight code and telemetry label below
    const labelHtml = `
      <div class="aircraft-radar-label ${isSelected ? 'selected' : ''}">
        <span class="flight-code">${flight.callsign}</span>
        <span class="flight-type">${flight.type} • <b class="flight-speed-val">${Math.round(flight.speed || 0)}</b>kt</span>
      </div>
    `;

    const icon = L.divIcon({
      className: "aircraft-marker-container",
      html: `
        <div class="aircraft-wrapper ${isSelected ? 'active-selection' : ''}" id="ac_${flight.id}">
          ${logoBadgeHtml}
          ${svgHtml}
          ${labelHtml}
        </div>
      `,
      iconSize: [60, 60],
      iconAnchor: [30, 30]
    });

    const marker = L.marker([flight.lat, flight.lon], {
      icon: icon,
      zIndexOffset: isSelected ? 4000 : 2000
    });

    marker._flightId = flight.id;
    marker._lastHeading = heading;
    marker._lastSpeed = Math.round(flight.speed || 0);
    marker._lastLat = flight.lat;
    marker._lastLon = flight.lon;
    marker._domCached = false;
    marker._wrapper = null;
    marker._svg = null;
    marker._label = null;
    marker._speedVal = null;

    marker.on("click", (e) => {
      L.DomEvent.stopPropagation(e);
      if (typeof window.selectAircraft === "function") {
        window.selectAircraft(flight.id);
      }
    });

    return marker;
  }

  /**
   * Fast position & telemetry update with DOM node caching and dirty checking
   */
  static updateMarkerPosition(marker, flight, isVisible = true) {
    if (!isVisible) {
      if (marker._wrapper && marker._wrapper.style.display !== "none") {
        marker._wrapper.style.display = "none";
      }
      return;
    }

    if (marker._wrapper && marker._wrapper.style.display === "none") {
      marker._wrapper.style.display = "flex";
    }

    // Leaflet LatLng update - only when aircraft actually moves
    const dLat = Math.abs(flight.lat - (marker._lastLat || 0));
    const dLon = Math.abs(flight.lon - (marker._lastLon || 0));
    if (dLat > 0.000004 || dLon > 0.000004) {
      marker.setLatLng([flight.lat, flight.lon]);
      marker._lastLat = flight.lat;
      marker._lastLon = flight.lon;
    }

    // Cache DOM references once to avoid continuous DOM queries
    if (!marker._domCached) {
      const el = document.getElementById(`ac_${flight.id}`);
      if (el) {
        marker._wrapper = el;
        marker._svg = el.querySelector(".aircraft-svg");
        marker._label = el.querySelector(".aircraft-radar-label");
        marker._speedVal = el.querySelector(".flight-speed-val");
        marker._domCached = true;
      } else {
        return;
      }
    }

    const heading = Math.round(flight.heading || 0);
    const speed = Math.round(flight.speed || 0);
    const isSelected = (window.selectedFlightId === flight.id);

    // Update rotation only when heading changes by >= 1 deg
    if (marker._svg && Math.abs(heading - marker._lastHeading) >= 1) {
      marker._svg.style.transform = `rotate(${heading}deg)`;
      marker._lastHeading = heading;
    }

    // Update speed text or HOLD status only when it changes
    const speedDisplay = flight.isQueued ? "HOLD" : speed;
    if (marker._speedVal && marker._lastSpeedDisplay !== speedDisplay) {
      marker._speedVal.textContent = speedDisplay;
      marker._lastSpeedDisplay = speedDisplay;
    }

    // Toggle holding-separation styling on radar label
    if (marker._label && marker._wasQueued !== !!flight.isQueued) {
      marker._wasQueued = !!flight.isQueued;
      marker._label.classList.toggle("holding-separation", !!flight.isQueued);
    }

    // Toggle selection glow state only when changed
    if (marker._wasSelected !== isSelected) {
      marker._wasSelected = isSelected;
      if (marker._svg) {
        marker._svg.classList.toggle("selected-aircraft", isSelected);
      }
      if (marker._label) {
        marker._label.classList.toggle("selected", isSelected);
      }
      if (marker._wrapper) {
        marker._wrapper.classList.toggle("active-selection", isSelected);
      }
      marker.setZIndexOffset(isSelected ? 4000 : 2000);
    }
  }
}

window.AircraftMarkerManager = AircraftMarkerManager;
window.AIRLINE_LIVERIES = AIRLINE_LIVERIES;
