/**
 * Aircraft Marker & SVG Renderer
 * Generates top-down, rotatable aviation aircraft icons with airline liveries,
 * selection glow, and interactive HUD trigger.
 */

const AIRLINE_LIVERIES = {
  PGT: { name: "Pegasus Airlines", code: "PC", tailColor: "#dc2626", wingColor: "#f59e0b", bodyColor: "#ffffff" },
  THY: { name: "Türk Hava Yolları", code: "TK", tailColor: "#e11d48", wingColor: "#e11d48", bodyColor: "#ffffff" },
  AJT: { name: "AJet", code: "VF", tailColor: "#1e3a8a", wingColor: "#0284c7", bodyColor: "#ffffff" },
  SXS: { name: "SunExpress", code: "XQ", tailColor: "#ea580c", wingColor: "#0284c7", bodyColor: "#ffffff" },
  GEN: { name: "Genel Havacılık", code: "TC", tailColor: "#059669", wingColor: "#10b981", bodyColor: "#ffffff" }
};

class AircraftMarkerManager {
  static createAircraftSVG(airlineKey, heading = 0, isSelected = false, size = 38) {
    const livery = AIRLINE_LIVERIES[airlineKey] || AIRLINE_LIVERIES.GEN;
    const filterId = isSelected ? "selectedGlow" : "shadow";

    return `
      <svg class="aircraft-svg ${isSelected ? 'selected-aircraft' : ''}" width="${size}" height="${size}" viewBox="0 0 100 100" style="transform: rotate(${heading}deg);">
        <defs>
          <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#000" flood-opacity="0.6"/>
          </filter>
          <filter id="selectedGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="0" stdDeviation="5" flood-color="#00e5ff" flood-opacity="0.9"/>
          </filter>
        </defs>

        <g filter="url(#${filterId})">
          <!-- Main Wings -->
          <polygon points="50,40 10,65 14,70 48,52 52,52 86,70 90,65" fill="${livery.bodyColor}" stroke="${isSelected ? '#00e5ff' : '#1e293b'}" stroke-width="${isSelected ? 2.5 : 1.5}" />
          <!-- Winglets -->
          <polygon points="8,63 10,65 14,70 12,68" fill="${livery.wingColor}" />
          <polygon points="92,63 90,65 86,70 88,68" fill="${livery.wingColor}" />

          <!-- Jet Engines -->
          <rect x="34" y="52" width="5" height="12" rx="2" fill="#475569" stroke="#0f172a" stroke-width="1" />
          <rect x="61" y="52" width="5" height="12" rx="2" fill="#475569" stroke="#0f172a" stroke-width="1" />

          <!-- Horizontal Stabilizer -->
          <polygon points="50,82 28,95 31,98 48,90 52,90 69,98 72,95" fill="${livery.bodyColor}" stroke="${isSelected ? '#00e5ff' : '#1e293b'}" stroke-width="${isSelected ? 2 : 1.5}" />

          <!-- Fuselage -->
          <ellipse cx="50" cy="50" rx="6" ry="42" fill="${livery.bodyColor}" stroke="${isSelected ? '#00e5ff' : '#1e293b'}" stroke-width="${isSelected ? 2.5 : 1.5}" />

          <!-- Vertical Tailfin -->
          <polygon points="50,68 47,94 53,94" fill="${livery.tailColor}" stroke="#0f172a" stroke-width="1" />
          <circle cx="50" cy="88" r="2.5" fill="#ffffff" />

          <!-- Cockpit Windshield -->
          <path d="M 47,15 Q 50,11 53,15 Q 50,18 47,15 Z" fill="#0284c7" stroke="#0f172a" stroke-width="0.8" />
        </g>
      </svg>
    `;
  }

  static createMarker(flight) {
    const isSelected = (window.selectedFlightId === flight.id);
    const heading = flight.heading || 0;
    const svgHtml = this.createAircraftSVG(flight.airline, heading, isSelected);

    const labelHtml = `
      <div class="aircraft-radar-label ${isSelected ? 'selected' : ''}">
        <span class="flight-code">${flight.callsign}</span>
        <span class="flight-type">${flight.type} • ${flight.speed}kt</span>
      </div>
    `;

    const icon = L.divIcon({
      className: "aircraft-marker-container",
      html: `
        <div class="aircraft-wrapper ${isSelected ? 'active-selection' : ''}" id="ac_${flight.id}">
          ${svgHtml}
          ${labelHtml}
        </div>
      `,
      iconSize: [46, 46],
      iconAnchor: [23, 23]
    });

    const marker = L.marker([flight.lat, flight.lon], { icon: icon, zIndexOffset: isSelected ? 3000 : 2000 });

    marker.on("click", (e) => {
      L.DomEvent.stopPropagation(e);
      if (typeof window.selectAircraft === "function") {
        window.selectAircraft(flight.id);
      }
    });

    return marker;
  }

  static updateMarkerPosition(marker, flight) {
    marker.setLatLng([flight.lat, flight.lon]);

    const isSelected = (window.selectedFlightId === flight.id);
    const el = document.getElementById(`ac_${flight.id}`);
    if (el) {
      const svg = el.querySelector(".aircraft-svg");
      if (svg) {
        svg.style.transform = `rotate(${flight.heading || 0}deg)`;
        if (isSelected) {
          svg.classList.add("selected-aircraft");
        } else {
          svg.classList.remove("selected-aircraft");
        }
      }
      const label = el.querySelector(".aircraft-radar-label");
      if (label) {
        if (isSelected) label.classList.add("selected");
        else label.classList.remove("selected");
        label.innerHTML = `
          <span class="flight-code">${flight.callsign}</span>
          <span class="flight-type">${flight.type} • ${flight.speed}kt</span>
        `;
      }
    }
  }
}

window.AircraftMarkerManager = AircraftMarkerManager;
