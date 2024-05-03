function locationToLatLng(location) {
  return [location.lat, location.lng];
}

async function run() {
  const locationsResponse = await fetch('/somewhere.json');
  const locations = (await locationsResponse.json()).locations;

  const map = L.map('map');


  const tiles = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20
  });

  tiles.addTo(map);

  const currentLocationIcon = L.divIcon({ className: 'current-location-icon' });
  const previousLocationIcon = L.divIcon({ className: 'previous-location-icon' });

  const linePoints = locations.map(locationToLatLng);
  const polyline = L.polyline(linePoints, {color: '#444'}).addTo(map);

  const [currentLocation, ...otherLocations] = locations;

  map.setView(locationToLatLng(currentLocation), 13);

  for (const location of otherLocations) {
    const latLng = locationToLatLng(location);
    const marker = L.marker(latLng, { icon: previousLocationIcon }).addTo(map);
    const date = new Date(location.timestamp);

    marker.bindTooltip(date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }));
  }

  const latestPoint = locationToLatLng(currentLocation);
  const latestMarker = L.marker(latestPoint, { icon: currentLocationIcon }).addTo(map);
  const currentLocationDate = new Date(currentLocation.timestamp);
  latestMarker.bindTooltip(currentLocationDate.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }));

  map.attributionControl.setPrefix(false);
}

run();
