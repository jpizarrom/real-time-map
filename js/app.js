CONFIG = {

  lat:     -40.19904,
  lng:     -73.72183,
  zoom:    5,
  maxZoom: 9,
  minZoom: 0,

  // CartoDB user and main table name
  userName: 'jpizarrom',
  tableName: 'counties',

  // We can observe another table and update the map when it's updated
  watchedUserName: 'jpizarrom',
  watchedTableName: 'states_results',

  style: "#counties { line-width:1; line-color: #ffffff; } \
    [status='0']  { polygon-fill: #000000; } \
    [status='1']    { polygon-fill: #0000FF; } \
    [status='2']     { polygon-fill: #996633; } \
    [status='3']     { polygon-fill: #00ffff; } \
    [status='4']    { polygon-fill: #00ff00; } \
    [status='5']     { polygon-fill: #ff00ff; } \
    [status='6']    { polygon-fill: #ff7f00; } \
    [status='7']     { polygon-fill: #7f007f; } ",

  polygonHoverStyle: { color: "#ff7800", weight: 5, opacity: 0.65, clickable:false },
  polygonClickStyle: { color: "red",     weight: 5, opacity: 0.65, clickable:false }

};

window.stop_refresh     = false;
window.refresh_interval = 3000;

var
hoverData       = null,
timeID          = null,
request         = null,
timer           = null,
lastEpoch      = null;

var
popup           = null,
map             = null;

var // layers
layer           = null,
layer_6         = null,
layer_8         = null,
geojsonLayer    = new L.GeoJSON(null),
clickLayer      = new L.GeoJSON(null);

var oldIE = ($.browser.msie && $.browser.version < 9) ? true : false;

// Request animation frame
window.cancelRequestAnimFrame = ( function() {
  return window.cancelAnimationFrame       ||
  window.webkitCancelRequestAnimationFrame ||
  window.mozCancelRequestAnimationFrame    ||
  window.oCancelRequestAnimationFrame      ||
  window.msCancelRequestAnimationFrame     ||

  function( callback ){
    window.clearTimeout(timeID);
  };

})();

window.requestAnimFrame = (function(){
  return  window.requestAnimationFrame ||
  window.webkitRequestAnimationFrame   ||
  window.mozRequestAnimationFrame      ||
  window.oRequestAnimationFrame        ||
  window.msRequestAnimationFrame       ||

  function( callback ){
    timeID = window.setTimeout(callback, 1000 / 60);
  };

})();


// Stop watch methods
function setupStopWatch() {
  $('.last-update').stopwatch({format: 'Last update: <strong>{Minutes} and {seconds} ago</strong>'});
}

function startStopWatch() {
  $(".last-update").stopwatch('start');
}

function resetStopWatch() {
  $(".last-update").stopwatch('reset');
}

function showMessage(message) {

  $(".message").html(message);

  $(".message").animate({ opacity: 1, top: 0 }, { duration: 250, complete: function() {

    setTimeout(function() {
      $(".message").animate({ opacity: 0, top: "-40px" }, 250);
    }, 3000);

  }});
}

// Adds a polygon in the area where the user clicked
function addClickPolygon(data) {

  if (!hoverData) return;

  map.removeLayer(clickLayer);

  var polygon = {
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: [hoverData[data.cartodb_id]]
    }
  };

  clickLayer = new L.GeoJSON(polygon, { style: CONFIG.polygonClickStyle });
  map.addLayer(clickLayer);

  clickLayer.cartodb_id = data.cartodb_id;
}

// Adds a hihglighted polygon
function highlightPolygon(data) {

  if (!hoverData) return;

  // Show the hover polygon if it is a different feature
  map.removeLayer(geojsonLayer);

  var polygon = {
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: [hoverData[data.cartodb_id]]
    }
  };

  geojsonLayer = new L.GeoJSON(polygon, { style: CONFIG.polygonHoverStyle });
  map.addLayer(geojsonLayer);

  geojsonLayer.cartodb_id = data.cartodb_id;

}

function onFeatureClick(e, latlng, pos, data) {

  if (typeof( window.event ) != "undefined" ) { // IE
    e.cancelBubble=true;
  } else { // Rest
    e.preventDefault();
    e.stopPropagation();
  }

  // Set popup content
  popup.setContent(data);

  // Set position
  popup.setLatLng(latlng);

  // Show the popup
  map.openPopup(popup);
  addClickPolygon(data);
}

function onFeatureOut() {

  if (!hoverData) return;

  document.body.style.cursor = "default";

  geojsonLayer.cartodb_id = null;
  geojsonLayer.off("featureparse");
  map.removeLayer(geojsonLayer)

}

function onFeatureHover(e, latlng, pos, data) {
  document.body.style.cursor = "pointer";

  highlightPolygon(data);
}

function createLayer(version, opacity, admin_level) {

  var query = "SELECT st_name, st_usps, counties.the_geom_webmercator, counties.cartodb_id, states_results.gov_result as status, counties.fips as thecode, counties.st_usps as usps FROM counties, states_results WHERE states_results.usps = counties.st_usps AND version="+version;
  query = "SELECT st_name, st_usps, counties.the_geom_webmercator, counties.cartodb_id, states_results.gov_result as status, counties.fips as thecode, counties.st_usps as usps FROM counties, states_results WHERE admin_level='"+admin_level+"'";

  return new L.CartoDBLayer({
    map: map,

//    tiler_domain: "{s}.viz2.cartodb.com",
//    subdomains: "abcd",

    user_name:  CONFIG.userName, // <- if you don't use a CDN put your username here
    table_name: CONFIG.tableName,
    tile_style: CONFIG.style,
    opacity:    opacity,
    query:      query,

    extra_params: {
      cache_buster: version
    },

    interactivity: "cartodb_id, status, st_usps",

    featureOver:  onFeatureHover,
    featureOut:   onFeatureOut,
    featureClick: onFeatureClick
  });

}

// Fade in and switch the layers
function fadeIn(lyr) {

  var
  deleted = false,
  opacity = 0;

  (function animloop(){

    request = requestAnimFrame(animloop);

    lyr.setOpacity(opacity);

    opacity += .05;

    if (!deleted && opacity >= 1 ) {

      opacity = 0;
      deleted = true;

      resetStopWatch();

      cancelRequestAnimFrame(request);

      // Switch layers
      map.removeLayer(layer);

      delete layer;
      layer = lyr;

      map.invalidateSize(false);
    }

  })();
}

// When the new layer is fully loaded, we show it gradually.
// Then we remove the old layer.
function onLayerLoaded(layerNew) {

  layerNew.off("load", null, layerNew); // unbind the load event
  showMessage("Map updated");

  if (oldIE) { // since IE<9 doesn't support opacity, we just remove the layer

    map.removeLayer(layer);

    delete layer;
    layer = layerNew; // layer switch

  } else {
    fadeIn(layerNew);
  }

}

function refresh() {

  if (window.stop_refresh) return;

  // We ping this URL every 3000 ms (or the number defined in CONFIG.refreshInterval) and if the table was updated we create a new layer.
  var url = "http://" + CONFIG.watchedUserName + ".cartodb.com/api/v2/sql?q=" + escape("SELECT max(version) as epoch_updated FROM " + CONFIG.watchedTableName);

  $.ajax({ url: url, cache: true, jsonpCallback: "callback", dataType: "jsonp", success: function(data) {

    try {

      if (!data.rows) {
        data = JSON.parse(data);
      }

    } catch(e) {
      // console.log(e);
      return;
    }

    var epoch = data.rows[0].epoch_updated;

    if (epoch > lastEpoch) { // Update the map

      if (!layer) { // create layer

        layer = createLayer(epoch, 1, 4);
        map.addLayer(layer, false);
//        layer.hide();

        layer_6 = createLayer(epoch, 1, 6);
        map.addLayer(layer_6, false);
        layer_6.hide();

        layer_8 = createLayer(epoch, 1, 8);
        map.addLayer(layer_8, false);
        layer_8.hide();

        startStopWatch();

      } else { // update layer

        showMessage("New data coming…");

        var opacity = (oldIE) ? 1 : 0; // since IE<9 versions don't support opacity we just create a visible layer

        var layerNew = createLayer(epoch, opacity, 4);
        map.addLayer(layerNew, false);
//        layer.hide();

        layer_6 = createLayer(epoch, opacity, 8);
        map.addLayer(layer_6, false);
        layer_6.hide();

        layer_8 = createLayer(epoch, opacity, 8);
        map.addLayer(layer_8, false);
        layer_8.hide();

        layerNew.on("load", function() {
          onLayerLoaded(this);
        });

      }

      lastEpoch = epoch;
    }

  }});

  if (!timer) { // creates the timer
    timer = setInterval(refresh, window.refresh_interval);
  }
}

// To maximize the feature hover/out speed we load the geometries of the counties in a hash
function getHoverData(admin_level) {

  var url = "http://com.cartodb.uselections.s3.amazonaws.com/hover_geoms/cty0921md_01.js";
  if (admin_level == 4)
  url = "http://localhost/real-time-map/bin/data.min.js";
  if (admin_level == 6)
  url = "http://localhost/real-time-map/bin/data_6.min.js";
  if (admin_level == 8)
  url = "http://localhost/real-time-map/bin/data_8.min.js";
//  url = "http://" + CONFIG.userName + ".cartodb.com/api/v2/sql?format=geojson&q=" + escape("SELECT cartodb_id, ST_SIMPLIFY(the_geom, 0.1) as the_geom FROM " + CONFIG.tableName+ " WHERE admin_level='4'");

  $.ajax({ url: url, jsonpCallback: "callback", dataType: "jsonp", success: function(data) {
    hoverData = data;
    showMessage("hoverData");
  }});

}

function init() {
$("#reg_tab").on('click', function(event) {
    layer.show();
    layer_6.hide();
    layer_8.hide();
    getHoverData(4);
});
$("#prov_tab").on('click', function(event) {
    layer.hide();
    layer_6.show();
    layer_8.hide();
    getHoverData(6);
});
$("#com_tab").on('click', function(event) {
    layer.hide();
    layer_6.hide();
    layer_8.show();
    getHoverData(8);
});

  setupStopWatch();

  // Initialize the popup
  popup = new L.CartoDBPopup();

  // Set the map options
  var mapOptions = {
    center: new L.LatLng(CONFIG.lat, CONFIG.lng),
    zoom: CONFIG.zoom,
    maxZoom: CONFIG.maxZoom,
    minZoom: CONFIG.minZoom,
    zoomAnimation: true,
    fadeAnimation: true
  };

  map = new L.Map('map', mapOptions);
  
  var mapboxUrl = 'http://{s}.tiles.mapbox.com/v3/cartodb.map-1nh578vv/{z}/{x}/{y}.png'
        , mapbox = new L.TileLayer(mapboxUrl, {maxZoom: 18, attribution: "OpenStreetMaps"});
  map.addLayer(mapbox,true);
  
  map.on("popupclose", function() {
    map.removeLayer(clickLayer);
  });

  refresh(); // Go!
  // Get the counties' geometries
  getHoverData(4);
}
