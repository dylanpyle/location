const COLLAPSED_STAY_COUNT = 10;
const FOCUS_SPAN_DEGREES = 10;
const REFRESH_INTERVAL = 30 * 60 * 1000;

// MapKit JS tokens from maps.developer.apple.com, each with its origin
// restricted to one domain. Origin-locked tokens never expire and are useless
// from any other site, so they're fine to commit. `location.test` is for local
// development; point it at 127.0.0.1 in /etc/hosts (see readme)
const MAPKIT_TOKENS = {
  "location.dylanpyle.com":
    "eyJraWQiOiJVVzU4NTJSSFdSIiwidHlwIjoiSldUIiwiYWxnIjoiRVMyNTYifQ.eyJpc3MiOiJMVDlRVjdFQUo3IiwiaWF0IjoxNzg3NzE2OTc5LCJvcmlnaW4iOiJsb2NhdGlvbi5keWxhbnB5bGUuY29tIiwic2NvcGUiOiJtYXBraXRfanMifQ.KQ9DTMMVw6ys_LYfHwwjfGgSTyUVwbvW0AMcHZcuOK50OXTyJfP3w0oBQyK2zi20dW7lMUeLVQQSdagqcZOW5A",
  "location.test": "eyJraWQiOiIzQjQ3VjRHMzVBIiwidHlwIjoiSldUIiwiYWxnIjoiRVMyNTYifQ.eyJpc3MiOiJMVDlRVjdFQUo3IiwiaWF0IjoxNzg4ODIxMTcyLCJvcmlnaW4iOiJsb2NhdGlvbi50ZXN0Iiwic2NvcGUiOiJtYXBraXRfanMifQ.7tvu-KUajFKNxYFH47wNKfW6hSFubfALh7sf1iSMx6jHvvvwaN_blq-yxzdMQVeV3U1fYpD8mAA7xjIbVLiNGQ",
};

function authorizeMapKit(done) {
  const token = MAPKIT_TOKENS[window.location.hostname];

  if (!token) {
    console.error(
      `No MapKit token for ${window.location.hostname}; see readme.md`,
    );
  }

  done(token);
}

const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
const mobileQuery = window.matchMedia("(max-width: 640px)");

const panelEl = document.querySelector(".panel");
const currentButton = document.getElementById("current");
const currentPlaceEl = document.getElementById("current-place");
const currentDateEl = document.getElementById("current-date");
const listEl = document.getElementById("locations");
const showAllButton = document.getElementById("show-all");

// Everything rendered on screen derives from this
const app = {
  locations: null,
  stays: null,
  expanded: false,
  selectedStay: null,
  rows: new Map(), // stay index → row button
  map: null,
  annotations: [], // parallel to locations
  lineStyle: null,
  minZoomDegreesPerPixel: null,
};

function fetchLocations() {
  return fetch("/somewhere.json", { cache: "no-cache" })
    .then((response) => response.json())
    .then((data) => data.locations);
}

function getLocationString(location) {
  const isDomestic = location.region === "United States";

  const parts = [
    location.city,
    isDomestic ? location.state : location.region,
  ].filter(Boolean);

  return parts.join(", ");
}

// The log only gets a new entry when the rounded coordinates change, so moving
// around within a city produces a run of entries. Each run is one stay, and
// the oldest entry in it is the arrival (entries are newest-first)
function groupStays(locations) {
  const stays = [];

  locations.forEach((location, index) => {
    const name = getLocationString(location);
    const last = stays[stays.length - 1];

    if (last && last.name === name) {
      last.entries.push(index);
      last.arrived = location.timestamp;
    } else {
      stays.push({ name, entries: [index], arrived: location.timestamp });
    }
  });

  return stays;
}

function getDateString(date) {
  const sameYear = date.getFullYear() === new Date().getFullYear();

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  });
}

function daysAgo(date) {
  const startOfDay = (d) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

  return Math.round((startOfDay(new Date()) - startOfDay(date)) / 86400000);
}

function getRelativeDateString(date) {
  const days = daysAgo(date);

  if (days <= 0) {
    return "Today";
  }

  if (days === 1) {
    return "Yesterday";
  }

  if (days < 7) {
    return date.toLocaleString("en-US", { weekday: "long" });
  }

  return getDateString(date);
}

function getSinceString(date) {
  const days = daysAgo(date);

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

// --- Panel ---

function createRow(stay, stayIndex) {
  const li = document.createElement("li");

  const button = document.createElement("button");
  button.type = "button";
  button.classList.add("row");
  button.addEventListener("click", () => focusStay(stayIndex));
  li.appendChild(button);

  const descriptionEl = document.createElement("span");
  descriptionEl.classList.add("location-description");
  descriptionEl.textContent = stay.name;
  button.appendChild(descriptionEl);

  const dateEl = document.createElement("span");
  dateEl.classList.add("date");
  dateEl.textContent = getRelativeDateString(new Date(stay.arrived));
  button.appendChild(dateEl);

  return { li, button };
}

function renderPanel() {
  const [current, ...previous] = app.stays;

  currentPlaceEl.textContent = current.name;
  currentDateEl.textContent = getSinceString(new Date(current.arrived));
  document.title = current.name;

  const shown = app.expanded
    ? previous
    : previous.slice(0, COLLAPSED_STAY_COUNT);

  app.rows = new Map();
  listEl.replaceChildren();

  shown.forEach((stay, i) => {
    const stayIndex = i + 1;
    const { li, button } = createRow(stay, stayIndex);
    app.rows.set(stayIndex, button);
    listEl.appendChild(li);
  });

  showAllButton.hidden = previous.length <= COLLAPSED_STAY_COUNT;
  showAllButton.textContent = app.expanded ? "Show Less" : "Show All";

  setSelectedStay(app.selectedStay);
}

function setSelectedStay(stayIndex) {
  app.selectedStay = stayIndex;

  for (const [index, row] of app.rows) {
    if (index === stayIndex) {
      row.setAttribute("aria-current", "true");
    } else {
      row.removeAttribute("aria-current");
    }
  }
}

showAllButton.addEventListener("click", () => {
  app.expanded = !app.expanded;
  renderPanel();

  if (!app.expanded) {
    panelEl.scrollTop = 0;
  }
});

currentButton.addEventListener("click", () => focusStay(0));

// --- Map ---

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function toDegrees(radians) {
  return (radians * 180) / Math.PI;
}

// Points along the great circle between two locations, as [lat, lng] pairs
function greatCirclePoints(a, b) {
  const lat1 = toRadians(a.lat);
  const lng1 = toRadians(a.lng);
  const lat2 = toRadians(b.lat);
  const lng2 = toRadians(b.lng);

  const angularDistance = 2 *
    Math.asin(
      Math.sqrt(
        Math.sin((lat2 - lat1) / 2) ** 2 +
          Math.cos(lat1) * Math.cos(lat2) * Math.sin((lng2 - lng1) / 2) ** 2,
      ),
    );

  if (angularDistance < 1e-6) {
    return [[a.lat, a.lng], [b.lat, b.lng]];
  }

  // One segment per ~0.05 radians (~320 km), so short hops stay straight
  const steps = Math.max(1, Math.ceil(angularDistance / 0.05));
  const points = [];

  for (let i = 0; i <= steps; i++) {
    const fraction = i / steps;
    const scaleA = Math.sin((1 - fraction) * angularDistance) /
      Math.sin(angularDistance);
    const scaleB = Math.sin(fraction * angularDistance) /
      Math.sin(angularDistance);

    const x = scaleA * Math.cos(lat1) * Math.cos(lng1) +
      scaleB * Math.cos(lat2) * Math.cos(lng2);
    const y = scaleA * Math.cos(lat1) * Math.sin(lng1) +
      scaleB * Math.cos(lat2) * Math.sin(lng2);
    const z = scaleA * Math.sin(lat1) + scaleB * Math.sin(lat2);

    points.push([
      toDegrees(Math.atan2(z, Math.sqrt(x * x + y * y))),
      toDegrees(Math.atan2(y, x)),
    ]);
  }

  return points;
}

// Break a path into separate runs where it crosses the antimeridian, so the
// crossing doesn't draw as a line across the entire map. Each run is closed
// onto the interpolated crossing point at ±180° so the two halves meet at the
// date line instead of leaving a gap
function splitAtAntimeridian(points) {
  const runs = [[points[0]]];

  for (let i = 1; i < points.length; i++) {
    const [lat1, lng1] = points[i - 1];
    const [lat2, lng2] = points[i];

    if (Math.abs(lng2 - lng1) > 180) {
      const unwrappedLng2 = lng2 > lng1 ? lng2 - 360 : lng2 + 360;
      const boundary = lng1 > 0 ? 180 : -180;
      const fraction = (boundary - lng1) / (unwrappedLng2 - lng1);
      const crossingLat = lat1 + fraction * (lat2 - lat1);

      runs[runs.length - 1].push([crossingLat, boundary]);
      runs.push([[crossingLat, -boundary]]);
    }

    runs[runs.length - 1].push(points[i]);
  }

  return runs.filter((run) => run.length >= 2);
}

function locationToCoordinate(location) {
  return new mapkit.Coordinate(location.lat, location.lng);
}

function createDotElement(className) {
  const el = document.createElement("div");
  el.classList.add(className);
  return el;
}

function applyColorScheme() {
  const dark = darkQuery.matches;

  app.map.colorScheme = dark
    ? mapkit.Map.ColorSchemes.Dark
    : mapkit.Map.ColorSchemes.Light;
  app.lineStyle.strokeColor = dark ? "#c7ccd6" : "#8e939c";
  app.lineStyle.strokeOpacity = dark ? 0.3 : 0.5;
}

// Inset the map's logical viewport by the area the panel covers, so focused
// locations center within the visible portion of the map
function applyLayout() {
  const mobile = mobileQuery.matches;

  app.map.padding = mobile
    ? new mapkit.Padding({ bottom: panelEl.offsetHeight + 20 })
    : new mapkit.Padding({ left: panelEl.offsetWidth + 32 });
  app.map.showsZoomControl = !mobile;
}

function createMap() {
  const map = new mapkit.Map("map", {
    mapType: mapkit.Map.MapTypes.MutedStandard,
    showsMapTypeControl: false,
    showsCompass: mapkit.FeatureVisibility.Hidden,
    showsScale: mapkit.FeatureVisibility.Hidden,
    isRotationEnabled: false,
  });

  map.addEventListener("select", (event) => {
    const stayIndex = event.annotation?.data?.stay;

    if (stayIndex === undefined) {
      return;
    }

    if (!app.rows.has(stayIndex) && stayIndex > 0) {
      app.expanded = true;
      renderPanel();
    }

    setSelectedStay(stayIndex);
    app.rows.get(stayIndex)?.scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    });
  });

  map.addEventListener("deselect", (event) => {
    if (event.annotation?.data?.stay === app.selectedStay) {
      setSelectedStay(null);
    }
  });

  return map;
}

function renderMap() {
  const { map, locations, stays } = app;

  map.removeAnnotations(map.annotations);
  map.removeOverlays(map.overlays);

  // MapKit silently thins the points of longer PolylineOverlay paths (even
  // when split into multi-point chunks), which dropped single-visit locations
  // from the route — one short overlay per leg keeps every location on the map
  for (let i = 0; i < locations.length - 1; i++) {
    const arc = greatCirclePoints(locations[i], locations[i + 1]);

    for (const run of splitAtAntimeridian(arc)) {
      map.addOverlay(
        new mapkit.PolylineOverlay(
          run.map(([lat, lng]) => new mapkit.Coordinate(lat, lng)),
          { style: app.lineStyle },
        ),
      );
    }
  }

  app.annotations = locations.map(() => null);

  stays.forEach((stay, stayIndex) => {
    const isCurrent = stayIndex === 0;

    for (const entryIndex of stay.entries) {
      const location = locations[entryIndex];

      // Repeat visits stack identical dots; a newer entry gets a slightly
      // higher priority so the one MapKit keeps visible is the latest visit
      const priority = isCurrent
        ? 1000
        : 950 - Math.round((200 * entryIndex) / locations.length);

      app.annotations[entryIndex] = new mapkit.Annotation(
        locationToCoordinate(location),
        () =>
          createDotElement(
            isCurrent ? "current-location-icon" : "past-location-icon",
          ),
        {
          title: stay.name,
          subtitle: getDateString(new Date(location.timestamp)),
          data: { stay: stayIndex },
          displayPriority: priority,
          anchorOffset: new DOMPoint(0, isCurrent ? -8 : -4.5),
        },
      );
    }
  });

  map.addAnnotations(app.annotations);
}

function stayRegion(stay) {
  const newest = app.locations[stay.entries[0]];

  return new mapkit.CoordinateRegion(
    locationToCoordinate(newest),
    new mapkit.CoordinateSpan(FOCUS_SPAN_DEGREES, FOCUS_SPAN_DEGREES),
  );
}

// Fly to a stay and open its callout, which also highlights its row
function focusStay(stayIndex) {
  if (!app.map) {
    return;
  }

  const stay = app.stays[stayIndex];

  app.map.setRegionAnimated(stayRegion(stay), true);
  app.annotations[stay.entries[0]].selected = true;
  setSelectedStay(stayIndex);
}

// MapKit stops zooming out at a fixed camera distance. Measure how much
// longitude a pixel covers there by briefly setting a whole-world region;
// region changes apply synchronously, so nothing is painted in between
function minZoomDegreesPerPixel() {
  const { map } = app;

  if (app.minZoomDegreesPerPixel === null) {
    const region = map.region;

    map.region = new mapkit.CoordinateRegion(
      new mapkit.Coordinate(0, 0),
      new mapkit.CoordinateSpan(180, 360),
    );
    app.minZoomDegreesPerPixel = map.region.span.longitudeDelta /
      map.element.clientWidth;
    map.region = region;
  }

  return app.minZoomDegreesPerPixel;
}

function normalizeLongitude(lng) {
  return ((lng + 540) % 360) - 180;
}

// The trail spans more longitude than the widest view can hold, so show the
// widest view over whichever slice of it holds the most entries
function showEverywhere() {
  const { map, locations } = app;
  const visibleWidth = map.element.clientWidth - map.padding.left -
    map.padding.right;
  const windowSpan = minZoomDegreesPerPixel() * visibleWidth * 0.9;

  // Longitudes listed twice so a window can wrap across the antimeridian
  const sorted = locations.map((l) => l.lng).sort((a, b) => a - b);
  const unwrapped = sorted.concat(sorted.map((lng) => lng + 360));

  let best = { count: 0, start: 0, end: 0 };
  let end = 0;

  sorted.forEach((start, i) => {
    while (end < unwrapped.length && unwrapped[end] <= start + windowSpan) {
      end++;
    }

    if (end - i > best.count) {
      best = { count: end - i, start, end: unwrapped[end - 1] };
    }
  });

  const inWindow = (lng) => {
    const unwrappedLng = lng < best.start ? lng + 360 : lng;
    return unwrappedLng >= best.start && unwrappedLng <= best.end;
  };

  const lats = locations.filter((l) => inWindow(l.lng)).map((l) => l.lat);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);

  const center = new mapkit.Coordinate(
    (minLat + maxLat) / 2,
    normalizeLongitude((best.start + best.end) / 2),
  );
  const span = new mapkit.CoordinateSpan(
    Math.max((maxLat - minLat) * 1.2, FOCUS_SPAN_DEGREES),
    Math.max((best.end - best.start) * 1.08, FOCUS_SPAN_DEGREES),
  );

  deselectAll();
  map.setRegionAnimated(new mapkit.CoordinateRegion(center, span), true);
}

document.getElementById("recenter").addEventListener("click", () =>
  focusStay(0)
);
document.getElementById("fit-all").addEventListener("click", showEverywhere);

function deselectAll() {
  for (const annotation of app.annotations) {
    annotation.selected = false;
  }
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    deselectAll();
  }
});

// --- Data flow ---

function render(locations) {
  app.locations = locations;
  app.stays = groupStays(locations);
  app.selectedStay = null;

  renderPanel();

  if (app.map) {
    renderMap();
  }
}

// Pick up new entries while the page stays open. They land at most once a
// day, so a slow poll plus a check whenever the tab comes back is plenty
async function refresh() {
  if (!app.locations) {
    return;
  }

  let locations;

  try {
    locations = await fetchLocations();
  } catch {
    return;
  }

  const unchanged = locations.length === app.locations.length &&
    locations[0].timestamp === app.locations[0].timestamp;

  if (unchanged) {
    return;
  }

  const previousPlace = app.stays[0].name;
  render(locations);

  if (app.map && app.stays[0].name !== previousPlace) {
    app.map.setRegionAnimated(stayRegion(app.stays[0]), true);
  }
}

setInterval(refresh, REFRESH_INTERVAL);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    refresh();
  }
});

const locationsPromise = fetchLocations();
locationsPromise.then(render);

window.initMapKit = async function initMapKit() {
  mapkit.init({ authorizationCallback: authorizeMapKit });

  await locationsPromise;

  app.lineStyle = new mapkit.Style({ lineWidth: 1.5 });
  app.map = createMap();

  applyColorScheme();
  darkQuery.addEventListener("change", applyColorScheme);

  applyLayout();
  window.addEventListener("resize", applyLayout);

  renderMap();
  app.map.region = stayRegion(app.stays[0]);
};
