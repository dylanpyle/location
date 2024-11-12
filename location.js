function locationToLatLng(location) {
  return [location.lat, location.lng];
}

const tileUrl =
  "https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png";
const attribution =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> & <a href="https://carto.com/attributions">CARTO</a>';

function getLocationString(location) {
  const isDomestic = location.region === "United States";

  const parts = [
    location.city,
    isDomestic ? location.state : location.region,
  ].filter(Boolean);

  return parts.join(", ");
}

function getDateString(date) {
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function bindTooltip(marker, location) {
  const date = new Date(location.timestamp);

  marker.bindTooltip(`${getDateString(date)} (${getLocationString(location)}`);
}

function renderLocationText(currentLocation, otherLocations) {
  const currentLocationEl = document.getElementById("current-location");
  const previousLocationsEl = document.getElementById("previous-locations");

  const currentLocationString = getLocationString(currentLocation);
  currentLocationEl.textContent = currentLocationString;

  let lastLocation = currentLocationString;

  const recent = otherLocations.slice(0, 11);

  for (const location of recent) {
    const locationString = getLocationString(location);

    if (locationString === lastLocation) {
      continue;
    }

    const locationEl = document.createElement("li");

    const date = new Date(location.timestamp);
    const dateString = getDateString(date);
    locationEl.textContent = `${dateString} - ${locationString}`;

    previousLocationsEl.appendChild(locationEl);

    lastLocation = locationString;
  }
}

async function run() {
  const locationsResponse = await fetch("/somewhere.json");
  const locations = (await locationsResponse.json()).locations;

  const [currentLocation, ...otherLocations] = locations;

  renderLocationText(currentLocation, otherLocations);

  const map = L.map("map");

  const tiles = L.tileLayer(tileUrl, {
    attribution,
    subdomains: "abcd",
    maxZoom: 20,
  });

  tiles.addTo(map);

  const currentLocationIcon = L.divIcon({ className: "current-location-icon" });
  const previousLocationIcon = L.divIcon({
    className: "previous-location-icon",
  });

  const linePoints = locations.map(locationToLatLng);
  const polyline = L.polyline(linePoints, {
    color: "#bbb",
    weight: 1,
  }).addTo(map);

  map.setView(locationToLatLng(currentLocation), 5);

  for (const location of otherLocations) {
    const latLng = locationToLatLng(location);
    const marker = L.marker(latLng, { icon: previousLocationIcon }).addTo(map);
    bindTooltip(marker, location);
  }

  const latestPoint = locationToLatLng(currentLocation);
  const latestMarker = L.marker(latestPoint, { icon: currentLocationIcon })
    .addTo(map);
  const latestCircle = L.circle(latestPoint, {
    color: "transparent",
    fillColor: "#08A6FF",
    fillOpacity: 0.2,
    radius: 5000,
  }).addTo(map);

  bindTooltip(latestMarker, currentLocation);

  map.attributionControl.setPrefix(false);
}

run();
