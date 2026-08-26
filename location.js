const RECENT_LOCATION_COUNT = 10;

// Origin-locked to location.dylanpyle.com
const PRODUCTION_TOKEN =
  "eyJraWQiOiJVVzU4NTJSSFdSIiwidHlwIjoiSldUIiwiYWxnIjoiRVMyNTYifQ.eyJpc3MiOiJMVDlRVjdFQUo3IiwiaWF0IjoxNzg3NzE2OTc5LCJvcmlnaW4iOiJsb2NhdGlvbi5keWxhbnB5bGUuY29tIiwic2NvcGUiOiJtYXBraXRfanMifQ.KQ9DTMMVw6ys_LYfHwwjfGgSTyUVwbvW0AMcHZcuOK50OXTyJfP3w0oBQyK2zi20dW7lMUeLVQQSdagqcZOW5A";

// Unrestricted, short-lived; regenerate at maps.developer.apple.com when expired
const DEVELOPMENT_TOKEN =
  "eyJraWQiOiJWMzhMOUxNNjkzIiwidHlwIjoiSldUIiwiYWxnIjoiRVMyNTYifQ.eyJpc3MiOiJMVDlRVjdFQUo3IiwiaWF0IjoxNzg3NzE2OTkzLCJzY29wZSI6Im1hcGtpdF9qcyIsImV4cCI6MTc4ODMzMjM5OX0.0L4XMeuA_h6DKHUsFZ9mi-kdRaB0FqTTuNUZDq5Std-pv-ot537dZQKhvJlRnStiSBdtCsVx2pLn7AwY7syxlA";

function getMapKitToken() {
  const isLocal = ["localhost", "127.0.0.1", "[::1]"].includes(
    window.location.hostname,
  );

  return isLocal ? DEVELOPMENT_TOKEN : PRODUCTION_TOKEN;
}

const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

const locationsPromise = fetch("/somewhere.json")
  .then((response) => response.json())
  .then((data) => data.locations);

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
    return `${days} days ago`;
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

function createLocationEl(location) {
  const locationEl = document.createElement("li");

  const descriptionEl = document.createElement("span");
  descriptionEl.classList.add("location-description");
  descriptionEl.textContent = getLocationString(location);
  locationEl.appendChild(descriptionEl);

  const dateEl = document.createElement("span");
  dateEl.classList.add("date");
  dateEl.textContent = getRelativeDateString(new Date(location.timestamp));
  locationEl.appendChild(dateEl);

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

locationsPromise.then(renderPanel);

function locationToCoordinate(location) {
  return new mapkit.Coordinate(location.lat, location.lng);
}

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

function createDotElement(className) {
  const el = document.createElement("div");
  el.classList.add(className);
  return el;
}

function currentColorScheme() {
  return darkQuery.matches
    ? mapkit.Map.ColorSchemes.Dark
    : mapkit.Map.ColorSchemes.Light;
}

window.initMapKit = async function initMapKit() {
  mapkit.init({
    authorizationCallback: (done) => done(getMapKitToken()),
  });

  const locations = await locationsPromise;
  const [currentLocation, ...otherLocations] = locations;

  const map = new mapkit.Map("map", {
    mapType: mapkit.Map.MapTypes.MutedStandard,
    colorScheme: currentColorScheme(),
    showsMapTypeControl: false,
    showsCompass: mapkit.FeatureVisibility.Hidden,
    showsScale: mapkit.FeatureVisibility.Hidden,
    isRotationEnabled: false,
  });

  darkQuery.addEventListener("change", () => {
    map.colorScheme = currentColorScheme();
  });

  // MapKit silently thins the points of longer PolylineOverlay paths (even
  // when split into multi-point chunks), which dropped single-visit locations
  // from the route — one short overlay per leg keeps every location on the map
  const lineStyle = new mapkit.Style({
    strokeColor: "#8e939c",
    strokeOpacity: 0.5,
    lineWidth: 1.5,
  });

  for (let i = 0; i < locations.length - 1; i++) {
    const arc = greatCirclePoints(locations[i], locations[i + 1]);

    for (const run of splitAtAntimeridian(arc)) {
      map.addOverlay(
        new mapkit.PolylineOverlay(
          run.map(([lat, lng]) => new mapkit.Coordinate(lat, lng)),
          { style: lineStyle },
        ),
      );
    }
  }

  const pastAnnotations = otherLocations.map(
    (location) =>
      new mapkit.Annotation(
        locationToCoordinate(location),
        () => createDotElement("past-location-icon"),
        {
          title: getLocationString(location),
          subtitle: getDateString(new Date(location.timestamp)),
          displayPriority: 750,
          anchorOffset: new DOMPoint(0, -4.5),
        },
      ),
  );

  const currentAnnotation = new mapkit.Annotation(
    locationToCoordinate(currentLocation),
    () => createDotElement("current-location-icon"),
    {
      title: getLocationString(currentLocation),
      subtitle: getDateString(new Date(currentLocation.timestamp)),
      displayPriority: 1000,
      anchorOffset: new DOMPoint(0, -8),
    },
  );

  map.addAnnotations([...pastAnnotations, currentAnnotation]);

  // Inset the map's logical viewport by the area the panel covers, so the
  // current location centers within the visible portion of the map
  const panelEl = document.querySelector(".panel");
  const isMobileLayout = window.matchMedia("(max-width: 640px)").matches;

  map.padding = isMobileLayout
    ? new mapkit.Padding({ bottom: panelEl.offsetHeight + 20 })
    : new mapkit.Padding({ left: panelEl.offsetWidth + 32 });

  map.region = new mapkit.CoordinateRegion(
    locationToCoordinate(currentLocation),
    new mapkit.CoordinateSpan(14, 14),
  );
};
