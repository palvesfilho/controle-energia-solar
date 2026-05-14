"use client";

import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export interface MapaMarker {
  id: string;
  nome: string;
  latitude: number;
  longitude: number;
  cidade: string | null;
  uf: string | null;
  statusMonitoramento: string;
  potenciaInstalada: number | null;
}

const STATUS_LABEL: Record<string, string> = {
  ONLINE: "Online",
  OFFLINE: "Offline",
  ALERTA: "Alerta",
  SEM_DADOS: "Sem dados",
};

const STATUS_COLOR: Record<string, string> = {
  ONLINE: "#10b981",
  OFFLINE: "#ef4444",
  ALERTA: "#f59e0b",
  SEM_DADOS: "#9ca3af",
};

function buildIcon(status: string, selected = false): L.DivIcon {
  const color = STATUS_COLOR[status] ?? STATUS_COLOR.SEM_DADOS;
  const scale = selected ? 1.4 : 1;
  const w = Math.round(18 * scale);
  const h = Math.round(30 * scale);
  const ring = selected
    ? `<circle cx="12.5" cy="12.5" r="10" fill="none" stroke="${color}" stroke-width="2" opacity="0.5"/>`
    : "";
  const html = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 25 41" style="filter: drop-shadow(0 1px 2px rgba(0,0,0,0.4));">
      <path d="M12.5 0C5.596 0 0 5.596 0 12.5c0 9.375 12.5 28.5 12.5 28.5S25 21.875 25 12.5C25 5.596 19.404 0 12.5 0z" fill="${color}" stroke="white" stroke-width="1.5"/>
      <circle cx="12.5" cy="12.5" r="4.5" fill="white"/>
      ${ring}
    </svg>
  `;
  return L.divIcon({
    html,
    className: "mapa-usina-pin",
    iconSize: [w, h],
    iconAnchor: [Math.round(w / 2), h],
    popupAnchor: [0, -Math.round(h * 0.87)],
  });
}

function FocusController({
  selectedId,
  markers,
  markerRefs,
}: {
  selectedId: string | null;
  markers: MapaMarker[];
  markerRefs: React.MutableRefObject<Record<string, L.Marker | null>>;
}) {
  const map = useMap();
  useEffect(() => {
    if (!selectedId) return;
    const target = markers.find((m) => m.id === selectedId);
    if (!target) return;
    map.flyTo([target.latitude, target.longitude], Math.max(map.getZoom(), 13), {
      duration: 0.8,
    });
    const ref = markerRefs.current[selectedId];
    if (ref) {
      setTimeout(() => ref.openPopup(), 500);
    }
  }, [selectedId, markers, map, markerRefs]);
  return null;
}

export function MapaLeaflet({
  markers,
  selectedId = null,
}: {
  markers: MapaMarker[];
  selectedId?: string | null;
}) {
  // Centro aproximado do Rio Grande do Sul
  const center: [number, number] = [-30.0346, -53.5];
  const zoom = 7;
  const markerRefs = useRef<Record<string, L.Marker | null>>({});

  return (
    <MapContainer
      center={center}
      zoom={zoom}
      scrollWheelZoom
      style={{ height: "100%", width: "100%" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FocusController
        selectedId={selectedId}
        markers={markers}
        markerRefs={markerRefs}
      />
      {markers.map((m) => (
        <Marker
          key={m.id}
          position={[m.latitude, m.longitude]}
          icon={buildIcon(m.statusMonitoramento, m.id === selectedId)}
          ref={(ref) => {
            markerRefs.current[m.id] = ref;
          }}
        >
          <Popup>
            <div className="space-y-1 text-sm">
              <div className="font-semibold">{m.nome}</div>
              {(m.cidade || m.uf) && (
                <div className="text-muted-foreground">
                  {m.cidade}
                  {m.cidade && m.uf ? " / " : ""}
                  {m.uf}
                </div>
              )}
              {m.potenciaInstalada != null && (
                <div>{m.potenciaInstalada} kWp</div>
              )}
              <div className="flex items-center gap-1.5">
                <span
                  style={{
                    display: "inline-block",
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: STATUS_COLOR[m.statusMonitoramento] ?? STATUS_COLOR.SEM_DADOS,
                  }}
                />
                Status: {STATUS_LABEL[m.statusMonitoramento] ?? m.statusMonitoramento}
              </div>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
