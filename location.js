const RECENT_LOCATION_COUNT = 11;

function locationToLatLng(location) {
  return [location.lat, location.lng];
}

const tileUrl =
  "https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png";
const attribution =
  'Imagery &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>, <a href="https://carto.com/attributions">CARTO</a>';

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
  marker.bindTooltip(`${getDateString(date)} (${getLocationString(location)})`);
}

function createLocationEl(location, isCurrent) {
  const locationEl = document.createElement("li");
  locationEl.classList.add("location");

  const iconEl = document.createElement("div");
  iconEl.classList.add("location-icon");
  locationEl.appendChild(iconEl);

  const textEl = document.createElement("div");

  const locationString = getLocationString(location);

  const locationDescriptionEl = document.createElement("div");
  locationDescriptionEl.classList.add("location-description");
  locationDescriptionEl.textContent = locationString;
  textEl.appendChild(locationDescriptionEl);

  const date = new Date(location.timestamp);
  const dateString = getDateString(date);

  const dateEl = document.createElement("div");
  dateEl.classList.add("date");
  dateEl.textContent = dateString;
  textEl.appendChild(dateEl);

  locationEl.appendChild(textEl);

  return locationEl;
}

function renderLocationList(locations) {
  const locationsEl = document.getElementById("locations");

  const recent = locations.slice(0, RECENT_LOCATION_COUNT);

  recent.forEach((location, i) => {
    const locationString = getLocationString(location);
    const next = recent[i + 1];

    if (next) {
      const nextLocation = getLocationString(recent[i + 1]);

      if (locationString === nextLocation) {
        return;
      }
    }

    locationsEl.appendChild(createLocationEl(location, false));
  });
}

async function run() {
  const locationsResponse = await fetch("/somewhere.json");
  const locations = (await locationsResponse.json()).locations;

  const [currentLocation, ...otherLocations] = locations;

  renderLocationList(locations);

  const map = L.map("map");

  const tiles = L.tileLayer(tileUrl, {
    attribution,
    subdomains: "abcd",
    maxZoom: 20,
  });

  tiles.addTo(map);

  const currentLocationIcon = L.divIcon({ className: "current-location-icon" });
  const previousLocationIcon = L.divIcon({
    className: "location-icon",
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
  const latestMarker = L.marker(latestPoint, {
    icon: currentLocationIcon,
    zIndexOffset: 1000,
  })
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
