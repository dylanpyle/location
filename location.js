const RECENT_LOCATION_COUNT = 10;

const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

const tileUrls = {
  light: "https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png",
  dark: "https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png",
};

const polylineColors = {
  light: "#b6bac1",
  dark: "#3d434c",
};

const attribution =
  'Imagery &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>, <a href="https://carto.com/attributions">CARTO</a>';

function currentScheme() {
  return darkQuery.matches ? "dark" : "light";
}

function locationToLatLng(location) {
  return [location.lat, location.lng];
}

function getLocationString(location) {
  const isDomestic = location.region === "United States";

  const parts = [
    location.city,
    isDomestic ? location.state : location.region,
  ].filter(Boolean);

  return parts.join(", ");
}

function getDateString(date) {
  const sameYear = date.getFullYear() === new Date().getFullYear();

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  });
}

function getRelativeDateString(date) {
  const startOfDay = (d) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

  const days = Math.round(
    (startOfDay(new Date()) - startOfDay(date)) / 86400000,
  );

  if (days <= 0) {
    return "Today";
  }

  if (days === 1) {
    return "Yesterday";
  }

  if (days < 7) {
    return `${days} days ago`;
  }

  return getDateString(date);
}

function getSinceString(date) {
  const startOfDay = (d) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

  const days = Math.round(
    (startOfDay(new Date()) - startOfDay(date)) / 86400000,
  );

  if (days <= 0) {
    return "Since today";
  }

  if (days === 1) {
    return "Since yesterday";
  }

  if (days < 7) {
    return `Since ${date.toLocaleString("en-US", { weekday: "long" })}`;
  }

  return `Since ${getDateString(date)}`;
}

function bindTooltip(marker, location) {
  const date = new Date(location.timestamp);
  marker.bindTooltip(`${getLocationString(location)} · ${getDateString(date)}`);
}

function createLocationEl(location) {
  const locationEl = document.createElement("li");

  const dotEl = document.createElement("div");
  dotEl.classList.add("timeline-dot");
  locationEl.appendChild(dotEl);

  const textEl = document.createElement("div");

  const descriptionEl = document.createElement("div");
  descriptionEl.classList.add("location-description");
  descriptionEl.textContent = getLocationString(location);
  textEl.appendChild(descriptionEl);

  const dateEl = document.createElement("div");
  dateEl.classList.add("date");
  dateEl.textContent = getRelativeDateString(new Date(location.timestamp));
  textEl.appendChild(dateEl);

  locationEl.appendChild(textEl);

  return locationEl;
}

function renderPanel(locations) {
  const [currentLocation, ...previousLocations] = locations;

  document.getElementById("current-place").textContent =
    getLocationString(currentLocation);
  document.getElementById("current-date").textContent = getSinceString(
    new Date(currentLocation.timestamp),
  );

  const locationsEl = document.getElementById("locations");

  let previousString = getLocationString(currentLocation);
  let shown = 0;

  for (const location of previousLocations) {
    if (shown >= RECENT_LOCATION_COUNT) {
      break;
    }

    const locationString = getLocationString(location);

    if (locationString === previousString) {
      continue;
    }

    previousString = locationString;
    locationsEl.appendChild(createLocationEl(location));
    shown++;
  }
}

async function run() {
  const locationsResponse = await fetch("/somewhere.json");
  const locations = (await locationsResponse.json()).locations;

  const [currentLocation, ...otherLocations] = locations;

  renderPanel(locations);

  const map = L.map("map", { zoomControl: false });
  L.control.zoom({ position: "bottomleft" }).addTo(map);

  const tiles = L.tileLayer(tileUrls[currentScheme()], {
    attribution,
    subdomains: "abcd",
    maxZoom: 20,
  });

  tiles.addTo(map);

  const currentLocationIcon = L.divIcon({ className: "current-location-icon" });
  const previousLocationIcon = L.divIcon({
    className: "past-location-icon",
    iconSize: [9, 9],
  });

  const linePoints = locations.map(locationToLatLng);
  const polyline = L.polyline(linePoints, {
    color: polylineColors[currentScheme()],
    weight: 1.5,
  }).addTo(map);

  darkQuery.addEventListener("change", () => {
    tiles.setUrl(tileUrls[currentScheme()]);
    polyline.setStyle({ color: polylineColors[currentScheme()] });
  });

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

  bindTooltip(latestMarker, currentLocation);

  map.attributionControl.setPrefix(false);
}

run();
