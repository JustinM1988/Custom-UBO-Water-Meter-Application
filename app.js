debugLog('app.js file loaded', 'success');

if (typeof require === 'undefined') {
    debugLog('ERROR: require function not found - ArcGIS API not loaded properly', 'error');
} else {
    debugLog('require function found - attempting to load modules', 'info');
}

require([
    "esri/Map",
    "esri/views/MapView", 
    "esri/layers/FeatureLayer",
    "esri/widgets/Legend",
    "esri/widgets/Expand",
    "esri/renderers/UniqueValueRenderer",
    "esri/symbols/SimpleMarkerSymbol",
    "esri/Graphic",
    "esri/geometry/Point"
], function(Map, MapView, FeatureLayer, Legend, Expand, UniqueValueRenderer, SimpleMarkerSymbol, Graphic, Point) {
    
    debugLog('All ArcGIS modules loaded successfully!', 'success');
    
    const config = {
        serviceUrl: "https://services3.arcgis.com/DAf01WuIltSLujAv/arcgis/rest/services/Portland_Meters/FeatureServer/0",
        fieldNames: {
            address: "address",
            account: "Account", 
            customer: "Customer",
            customerAccount: "customer_account_number",
            accountUpdate: "Account_Update",
            editDate: "EditDate",
            editor: "Editor",
            class: "Class",
            type: "Type"
        },
        colors: {
            needsUpdate: "#2247fe",
            updated: "#80c940", 
            selected: "#fb7f31"
        }
    };

    debugLog(`Service URL: ${config.serviceUrl}`, 'info');

    let map, view, featureLayer, selectedFeature, allFeatures = [];
    let highlightGraphic = null;

    debugLog('Starting initialization...', 'info');
    init();

    async function init() {
        try {
            debugLog('Init function called', 'info');
            showLoading(true);
            
            debugLog('Step 1: Initializing map...', 'info');
            await initMap();
            debugLog('Step 1: Map initialized successfully', 'success');
            
            debugLog('Step 2: Loading ALL features (no limit)...', 'info');
            await loadAllFeatures();
            debugLog('Step 2: Features loaded successfully', 'success');
            
            debugLog('Step 3: Initializing search...', 'info');
            initSearch();
            debugLog('Step 3: Search initialized successfully', 'success');
            
            debugLog('Step 4: Initializing event listeners...', 'info');
            initEventListeners();
            debugLog('Step 4: Event listeners initialized successfully', 'success');
            
            debugLog('Step 5: Updating statistics...', 'info');
            updateStats();
            debugLog('Step 5: Statistics updated successfully', 'success');
            
            showLoading(false);
            debugLog('APPLICATION INITIALIZED SUCCESSFULLY!', 'success');
            
        } catch (error) {
            debugLog(`INITIALIZATION ERROR: ${error.message}`, 'error');
            debugLog(`Error stack: ${error.stack}`, 'error');
            showToast("Failed to initialize application: " + error.message, "error");
            showLoading(false);
        }
    }

    async function initMap() {
        try {
            debugLog('Creating map object...', 'info');
            
            const viewDiv = document.getElementById('viewDiv');
            if (!viewDiv) {
                throw new Error('viewDiv element not found in DOM');
            }
            debugLog('viewDiv element found', 'success');

            map = new Map({
                basemap: "streets-navigation-vector"
            });
            debugLog('Map object created', 'success');

            debugLog('Creating MapView...', 'info');
            view = new MapView({
                container: "viewDiv",
                map: map,
                center: [-97.3238, 27.8772],
                zoom: 13
            });
            debugLog('MapView object created', 'success');

            debugLog(`Testing feature layer URL: ${config.serviceUrl}`, 'info');
            
            // Create proper renderer for symbology
            const renderer = createSymbologyRenderer();
            debugLog('Renderer created: Blue for empty Account_Update, Green for filled', 'success');

            featureLayer = new FeatureLayer({
                url: config.serviceUrl,
                renderer: renderer,
                popupEnabled: false,
                outFields: ["*"]
            });
            debugLog('FeatureLayer object created', 'success');

            map.add(featureLayer);
            debugLog('FeatureLayer added to map', 'success');

            // Add legend
            debugLog('Creating legend...', 'info');
            const legend = new Legend({
                view: view,
                style: { type: "card", layout: "side-by-side" }
            });

            const legendExpand = new Expand({
                view: view,
                content: legend,
                expanded: false,
                expandIconClass: "esri-icon-layer-list"
            });

            view.ui.add(legendExpand, "top-right");
            debugLog('Legend added', 'success');

            view.on("click", handleMapClick);
            debugLog('Click handler added', 'success');

            debugLog('Waiting for view to load...', 'info');
            await view.when();
            debugLog('View loaded successfully!', 'success');

        } catch (error) {
            debugLog(`MAP INITIALIZATION ERROR: ${error.message}`, 'error');
            throw error;
        }
    }

    function createSymbologyRenderer() {
        debugLog('Creating symbology renderer with proper blue/green logic...', 'info');
        return new UniqueValueRenderer({
            field: config.fieldNames.accountUpdate, // "Account_Update"
            defaultSymbol: new SimpleMarkerSymbol({
                color: config.colors.needsUpdate, // Blue for empty/null
                size: 10,
                outline: { color: "white", width: 2 }
            }),
            uniqueValueInfos: [
                {
                    value: null,
                    symbol: new SimpleMarkerSymbol({
                        color: config.colors.needsUpdate, // Blue
                        size: 10,
                        outline: { color: "white", width: 2 }
                    }),
                    label: "Needs Update"
                },
                {
                    value: "",
                    symbol: new SimpleMarkerSymbol({
                        color: config.colors.needsUpdate, // Blue
                        size: 10,
                        outline: { color: "white", width: 2 }
                    }),
                    label: "Needs Update"
                },
                {
                    value: " ",
                    symbol: new SimpleMarkerSymbol({
                        color: config.colors.needsUpdate, // Blue
                        size: 10,
                        outline: { color: "white", width: 2 }
                    }),
                    label: "Needs Update"
                }
            ]
        });
    }

    async function loadAllFeatures() {
        try {
            debugLog('Creating query to load ALL features...', 'info');
            
            // Remove the default 2000 limit by using multiple queries if needed
            let features = [];
            let offset = 0;
            const batchSize = 1000;
            let hasMoreResults = true;
            
            while (hasMoreResults) {
                const query = featureLayer.createQuery();
                query.where = "1=1";
                query.outFields = ["*"];
                query.returnGeometry = true;
                query.start = offset;
                query.num = batchSize;
                
                debugLog(`Fetching batch starting at ${offset}...`, 'info');
                const results = await featureLayer.queryFeatures(query);
                
                if (results.features.length === 0) {
                    hasMoreResults = false;
                } else {
                    features = features.concat(results.features);
                    offset += batchSize;
                    if (results.features.length < batchSize) {
                        hasMoreResults = false;
                    }
                }
            }
            
            // Store globally
            window.allFeatures = features;
            debugLog(`Successfully loaded ${features.length} features (all meters!)`, 'success');
            
            if (features.length === 0) {
                debugLog('WARNING: No features returned from query', 'warning');
            } else {
                const firstFeature = features[0];
                debugLog(`First feature attributes: ${JSON.stringify(Object.keys(firstFeature.attributes))}`, 'info');
            }

            updateRendererWithData(features);
        } catch (error) {
            debugLog(`FEATURE LOADING ERROR: ${error.message}`, 'error');
            throw error;
        }
    }

    function updateRendererWithData(features) {
        try {
            debugLog('Updating renderer with blue/green symbology based on Account_Update...', 'info');
            
            const uniqueValueInfos = [
                {
                    value: null,
                    symbol: new SimpleMarkerSymbol({
                        color: config.colors.needsUpdate, // Blue
                        size: 10,
                        outline: { color: "white", width: 2 }
                    }),
                    label: "Needs Update"
                },
                {
                    value: "",
                    symbol: new SimpleMarkerSymbol({
                        color: config.colors.needsUpdate, // Blue
                        size: 10,
                        outline: { color: "white", width: 2 }
                    }),
                    label: "Needs Update"
                },
                {
                    value: " ",
                    symbol: new SimpleMarkerSymbol({
                        color: config.colors.needsUpdate, // Blue
                        size: 10,
                        outline: { color: "white", width: 2 }
                    }),
                    label: "Needs Update"
                }
            ];

            // Find unique NON-EMPTY Account_Update values = GREEN (updated)
            const updatedValues = new Set();
            features.forEach(feature => {
                const value = feature.attributes[config.fieldNames.accountUpdate];
                if (value && value.toString().trim() !== "") {
                    updatedValues.add(value);
                }
            });

            debugLog(`Found ${updatedValues.size} unique updated values - these will be GREEN`, 'info');

            updatedValues.forEach(value => {
                uniqueValueInfos.push({
                    value: value,
                    symbol: new SimpleMarkerSymbol({
                        color: config.colors.updated, // Green
                        size: 10,
                        outline: { color: "white", width: 2 }
                    }),
                    label: "Updated"
                });
            });

            const newRenderer = new UniqueValueRenderer({
                field: config.fieldNames.accountUpdate, // "Account_Update"
                defaultSymbol: new SimpleMarkerSymbol({
                    color: config.colors.needsUpdate, // Blue for anything else
                    size: 10,
                    outline: { color: "white", width: 2 }
                }),
                uniqueValueInfos: uniqueValueInfos
            });

            featureLayer.renderer = newRenderer;
            debugLog('Renderer updated: Blue for empty Account_Update, Green for filled!', 'success');
            
        } catch (error) {
            debugLog(`RENDERER UPDATE ERROR: ${error.message}`, 'error');
        }
    }

    function initSearch() {
        try {
            debugLog('Initializing search...', 'info');
            const searchInput = document.getElementById('searchInput');
            const searchResults = document.getElementById('searchResults');
            if (!searchInput || !searchResults) {
                throw new Error('Search elements not found in DOM');
            }
            
            let searchTimeout;

            searchInput.addEventListener('input', (e) => {
                clearTimeout(searchTimeout);
                const query = e.target.value.trim();
                
                if (query.length < 2) {
                    searchResults.innerHTML = '';
                    searchResults.classList.add('hidden');
                    return;
                }

                searchTimeout = setTimeout(() => {
                    performSearch(query);
                }, 300);
            });

            document.getElementById('clearSearch').addEventListener('click', () => {
                searchInput.value = '';
                searchResults.innerHTML = '';
                searchResults.classList.add('hidden');
            });

            debugLog('Search initialized successfully', 'success');
        } catch (error) {
            debugLog(`SEARCH INITIALIZATION ERROR: ${error.message}`, 'error');
        }
    }

    function performSearch(query) {
        try {
            debugLog(`Performing search for: "${query}"`, 'info');
            const searchResults = document.getElementById('searchResults');
            if (!window.allFeatures || !window.allFeatures.length) {
                searchResults.innerHTML = '<div class="search-result-item">Loading data...</div>';
                searchResults.classList.remove('hidden');
                return;
            }

            const results = window.allFeatures.filter(feature => {
                const address = feature.attributes[config.fieldNames.address];
                const account = feature.attributes[config.fieldNames.account];
                
                return (
                    (address && address.toLowerCase().includes(query.toLowerCase())) ||
                    (account && account.toLowerCase().includes(query.toLowerCase()))
                );
            }).slice(0, 10);

            debugLog(`Search returned ${results.length} results`, 'info');

            if (results.length === 0) {
                searchResults.innerHTML = '<div class="search-result-item no-results">No meters found</div>';
            } else {
                searchResults.innerHTML = results.map(feature => {
                    const address = feature.attributes[config.fieldNames.address] || 'No address';
                    const account = feature.attributes[config.fieldNames.account] || 'No account';
                    const customer = feature.attributes[config.fieldNames.customer] || 'No customer';
                    
                    return `
                        <div class="search-result-item" data-objectid="${feature.attributes.OBJECTID}">
                            <div class="result-main">${address}</div>
                           Here is the full, corrected raw code for **app.js** that you can copy and replace in your project:

