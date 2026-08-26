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
  // from the route — a two-point overlay per leg is immune
  const lineStyle = new mapkit.Style({
    strokeColor: "#8e939c",
    strokeOpacity: 0.5,
    lineWidth: 1.5,
  });

  const coordinates = locations.map(locationToCoordinate);

  for (let i = 0; i < coordinates.length - 1; i++) {
    map.addOverlay(
      new mapkit.PolylineOverlay([coordinates[i], coordinates[i + 1]], {
        style: lineStyle,
      }),
    );
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
