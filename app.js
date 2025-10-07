// Add debug logging at the very start
function debugLog(message, type = 'info') {
    try {
        const debugDiv = document.getElementById('debugLog');
        if (debugDiv) {
            const timestamp = new Date().toLocaleTimeString();
            const logEntry = document.createElement('div');
            logEntry.className = `debug-${type}`;
            logEntry.innerHTML = `[${timestamp}] ${message}`;
            debugDiv.appendChild(logEntry);
            debugDiv.scrollTop = debugDiv.scrollHeight;
        }
        console.log(`[${type.toUpperCase()}] ${message}`);
    } catch (e) {
        console.error('Debug logging failed:', e);
    }
}

debugLog('app.js file loaded', 'success');

// Test if require function exists
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
    
    // Configuration
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

    // Global variables
    let map, view, featureLayer, selectedFeature, allFeatures = [];
    let highlightGraphic = null;

    // Initialize
    debugLog('Starting initialization...', 'info');
    init();

    async function init() {
        try {
            debugLog('Init function called', 'info');
            showLoading(true);
            
            debugLog('Step 1: Initializing map...', 'info');
            await initMap();
            debugLog('Step 1: Map initialized successfully', 'success');
            
            debugLog('Step 2: Loading features...', 'info');
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
            
            // Test if viewDiv exists
            const viewDiv = document.getElementById('viewDiv');
            if (!viewDiv) {
                throw new Error('viewDiv element not found in DOM');
            }
            debugLog('viewDiv element found', 'success');

            // Create map
            map = new Map({
                basemap: "streets-navigation-vector"
            });
            debugLog('Map object created', 'success');

            // Create view
            debugLog('Creating MapView...', 'info');
            view = new MapView({
                container: "viewDiv",
                map: map,
                center: [-97.3238, 27.8772],
                zoom: 13
            });
            debugLog('MapView object created', 'success');

            // Test feature layer URL
            debugLog(`Testing feature layer URL: ${config.serviceUrl}`, 'info');
            
            // Create feature layer with renderer
            const renderer = new UniqueValueRenderer({
                field: config.fieldNames.accountUpdate,
                defaultSymbol: new SimpleMarkerSymbol({
                    color: config.colors.needsUpdate,
                    size: 10,
                    outline: { color: "white", width: 2 }
                }),
                uniqueValueInfos: [{
                    value: null,
                    symbol: new SimpleMarkerSymbol({
                        color: config.colors.needsUpdate,
                        size: 10,
                        outline: { color: "white", width: 2 }
                    }),
                    label: "Needs Update"
                }]
            });
            debugLog('Renderer created', 'success');

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

            // Map click handler
            view.on("click", handleMapClick);
            debugLog('Click handler added', 'success');

            debugLog('Waiting for view to load...', 'info');
            await view.when();
            debugLog('View loaded successfully!', 'success');

        } catch (error) {
            debugLog(`MAP INITIALIZATION ERROR: ${error.message}`, 'error');
            debugLog(`Error details: ${JSON.stringify(error)}`, 'error');
            throw error;
        }
    }

    async function loadAllFeatures() {
        try {
            debugLog('Creating query...', 'info');
            const query = featureLayer.createQuery();
            query.where = "1=1";
            query.outFields = ["*"];
            query.returnGeometry = true;

            debugLog('Executing query...', 'info');
            const results = await featureLayer.queryFeatures(query);
            allFeatures = results.features;
            
            debugLog(`Successfully loaded ${allFeatures.length} features`, 'success');
            
            if (allFeatures.length === 0) {
                debugLog('WARNING: No features returned from query', 'warning');
            } else {
                // Log first feature details
                const firstFeature = allFeatures[0];
                debugLog(`First feature attributes: ${JSON.stringify(Object.keys(firstFeature.attributes))}`, 'info');
            }

            updateRenderer();
        } catch (error) {
            debugLog(`FEATURE LOADING ERROR: ${error.message}`, 'error');
            throw error;
        }
    }

    function updateRenderer() {
        try {
            debugLog('Updating renderer...', 'info');
            const uniqueValueInfos = [
                {
                    value: null,
                    symbol: new SimpleMarkerSymbol({
                        color: config.colors.needsUpdate,
                        size: 10,
                        outline: { color: "white", width: 2 }
                    }),
                    label: "Needs Update"
                },
                {
                    value: "",
                    symbol: new SimpleMarkerSymbol({
                        color: config.colors.needsUpdate,
                        size: 10,
                        outline: { color: "white", width: 2 }
                    }),
                    label: "Needs Update"
                }
            ];

            // Get updated values
            const updatedValues = new Set();
            allFeatures.forEach(feature => {
                const value = feature.attributes[config.fieldNames.accountUpdate];
                if (value && value.trim() !== "") {
                    updatedValues.add(value);
                }
            });

            debugLog(`Found ${updatedValues.size} unique updated values`, 'info');

            updatedValues.forEach(value => {
                uniqueValueInfos.push({
                    value: value,
                    symbol: new SimpleMarkerSymbol({
                        color: config.colors.updated,
                        size: 10,
                        outline: { color: "white", width: 2 }
                    }),
                    label: "Updated"
                });
            });

            const newRenderer = new UniqueValueRenderer({
                field: config.fieldNames.accountUpdate,
                defaultSymbol: new SimpleMarkerSymbol({
                    color: config.colors.updated,
                    size: 10,
                    outline: { color: "white", width: 2 }
                }),
                uniqueValueInfos: uniqueValueInfos
            });

            featureLayer.renderer = newRenderer;
            debugLog('Renderer updated successfully', 'success');
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
            
            if (!allFeatures.length) {
                searchResults.innerHTML = '<div class="search-result-item">Loading data...</div>';
                searchResults.classList.remove('hidden');
                return;
            }

            const results = allFeatures.filter(feature => {
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
                            <div class="result-sub">Account: ${account} | Customer: ${customer}</div>
                        </div>
                    `;
                }).join('');
                
                searchResults.querySelectorAll('.search-result-item').forEach(item => {
                    item.addEventListener('click', () => {
                        const objectId = item.getAttribute('data-objectid');
                        if (objectId) {
                            selectMeterByObjectId(parseInt(objectId));
                            searchResults.classList.add('hidden');
                        }
                    });
                });
            }
            
            searchResults.classList.remove('hidden');
        } catch (error) {
            debugLog(`SEARCH ERROR: ${error.message}`, 'error');
        }
    }

    async function handleMapClick(event) {
        try {
            debugLog('Map clicked', 'info');
            const response = await view.hitTest(event);
            
            if (response.results.length > 0) {
                const graphic = response.results.find(result => 
                    result.graphic && result.graphic.layer === featureLayer
                );
                
                if (graphic) {
                    debugLog('Feature clicked', 'info');
                    selectMeter(graphic.graphic);
                }
            }
        } catch (error) {
            debugLog(`MAP CLICK ERROR: ${error.message}`, 'error');
        }
    }

    function selectMeterByObjectId(objectId) {
        debugLog(`Selecting meter by ObjectID: ${objectId}`, 'info');
        const feature = allFeatures.find(f => f.attributes.OBJECTID === objectId);
        if (feature) {
            selectMeter(feature);
            
            view.goTo({
                target: feature.geometry,
                zoom: 18
            });
        } else {
            debugLog(`Feature with ObjectID ${objectId} not found`, 'warning');
        }
    }

    function selectMeter(feature) {
        try {
            debugLog('Selecting meter', 'info');
            selectedFeature = feature;
            
            if (highlightGraphic) {
                view.graphics.remove(highlightGraphic);
            }
            
            highlightGraphic = new Graphic({
                geometry: feature.geometry,
                symbol: new SimpleMarkerSymbol({
                    color: config.colors.selected,
                    size: 16,
                    outline: { color: "white", width: 3 }
                })
            });
            
            view.graphics.add(highlightGraphic);
            showMeterDetails(feature);
            debugLog('Meter selected successfully', 'success');
        } catch (error) {
            debugLog(`METER SELECTION ERROR: ${error.message}`, 'error');
        }
    }

    function showMeterDetails(feature) {
        try {
            debugLog('Showing meter details', 'info');
            const panel = document.getElementById('detailsPanel');
            const content = document.getElementById('detailsContent');
            const attrs = feature.attributes;
            
            content.innerHTML = `
                <div class="details-section">
                    <h3 class="section-title">📍 Location Information</h3>
                    <div class="detail-group priority">
                        <div class="detail-item">
                            <label>Address:</label>
                            <span class="detail-value address-highlight">${attrs[config.fieldNames.address] || 'Not specified'}</span>
                        </div>
                        <div class="detail-item">
                            <label>Account Number:</label>
                            <span class="detail-value account-highlight">${attrs[config.fieldNames.account] || 'Not specified'}</span>
                        </div>
                    </div>
                </div>
                <div class="details-section">
                    <h3 class="section-title">👤 Customer Information</h3>
                    <div class="detail-group">
                        <div class="detail-item">
                            <label>Customer Name:</label>
                            <span class="detail-value">${attrs[config.fieldNames.customer] || 'Not specified'}</span>
                        </div>
                        <div class="detail-item">
                            <label>Customer / Account:</label>
                            <span class="detail-value">${attrs[config.fieldNames.customerAccount] || 'Not specified'}</span>
                        </div>
                    </div>
                </div>
                <div class="details-section edit-section">
                    <h3 class="section-title">✏️ Account Update</h3>
                    <div class="detail-group">
                        <div class="detail-item">
                            <label for="accountUpdateInput">Account Update:</label>
                            <input type="text" 
                                   id="accountUpdateInput" 
                                   class="detail-input" 
                                   value="${attrs[config.fieldNames.accountUpdate] || ''}" 
                                   placeholder="Enter account update information">
                        </div>
                        <div class="edit-actions">
                            <button id="saveChanges" class="btn btn-primary">💾 Save Changes</button>
                            <button id="cancelEdit" class="btn btn-secondary">❌ Cancel</button>
                        </div>
                    </div>
                </div>
            `;
            
            content.scrollTop = 0;
            panel.classList.add('visible');
            
            document.getElementById('saveChanges').addEventListener('click', saveAccountUpdate);
            document.getElementById('cancelEdit').addEventListener('click', closeMeterDetails);
            
            debugLog('Meter details displayed', 'success');
        } catch (error) {
            debugLog(`SHOW DETAILS ERROR: ${error.message}`, 'error');
        }
    }

    async function saveAccountUpdate() {
        try {
            if (!selectedFeature) return;
            
            debugLog('Saving account update...', 'info');
            const input = document.getElementById('accountUpdateInput');
            const newValue = input.value.trim();
            
            showLoading(true, 'Saving changes...');
            
            selectedFeature.attributes[config.fieldNames.accountUpdate] = newValue;
            
            const edits = {
                updateFeatures: [selectedFeature]
            };
            
            debugLog('Applying edits to feature layer...', 'info');
            const result = await featureLayer.applyEdits(edits);
            
            if (result.updateFeatureResults && result.updateFeatureResults.length > 0) {
                const updateResult = result.updateFeatureResults[0];
                
                if (updateResult.success) {
                    debugLog('Save successful!', 'success');
                    showToast('Account update saved successfully! ✅', 'success');
                    
                    const localFeature = allFeatures.find(f => 
                        f.attributes.OBJECTID === selectedFeature.attributes.OBJECTID
                    );
                    if (localFeature) {
                        localFeature.attributes[config.fieldNames.accountUpdate] = newValue;
                    }
                    
                    updateRenderer();
                    updateStats();
                    closeMeterDetails();
                    
                } else {
                    debugLog(`Save failed: ${updateResult.error}`, 'error');
                    throw new Error(updateResult.error || 'Update failed');
                }
            } else {
                debugLog('No update results returned', 'error');
                throw new Error('No update results returned');
            }
            
        } catch (error) {
            debugLog(`SAVE ERROR: ${error.message}`, 'error');
            showToast('Failed to save changes. Please try again. ❌', 'error');
        } finally {
            showLoading(false);
        }
    }

    function closeMeterDetails() {
        debugLog('Closing meter details', 'info');
        const panel = document.getElementById('detailsPanel');
        panel.classList.remove('visible');
        
        if (highlightGraphic) {
            view.graphics.remove(highlightGraphic);
            highlightGraphic = null;
        }
        
        selectedFeature = null;
    }

    function initEventListeners() {
        try {
            debugLog('Initializing event listeners...', 'info');
            document.getElementById('closeDetails').addEventListener('click', closeMeterDetails);
            
            document.getElementById('resetView').addEventListener('click', () => {
                view.goTo({
                    center: [-97.3238, 27.8772],
                    zoom: 13
                });
            });
            
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.search-container')) {
                    document.getElementById('searchResults').classList.add('hidden');
                }
            });
            debugLog('Event listeners initialized', 'success');
        } catch (error) {
            debugLog(`EVENT LISTENERS ERROR: ${error.message}`, 'error');
        }
    }

    function updateStats() {
        try {
            const totalCount = allFeatures.length;
            const updatedCount = allFeatures.filter(feature => {
                const value = feature.attributes[config.fieldNames.accountUpdate];
                return value && value.trim() !== "";
            }).length;
            
            document.getElementById('totalMeters').textContent = totalCount.toLocaleString();
            document.getElementById('updatedMeters').textContent = updatedCount.toLocaleString();
            
            debugLog(`Stats updated: ${totalCount} total, ${updatedCount} updated`, 'success');
        } catch (error) {
            debugLog(`STATS UPDATE ERROR: ${error.message}`, 'error');
        }
    }

    function showLoading(show, message = 'Loading...') {
        try {
            const loading = document.getElementById('loadingIndicator');
            if (show) {
                loading.querySelector('.loading-text').textContent = message;
                loading.classList.remove('hidden');
            } else {
                loading.classList.add('hidden');
            }
        } catch (error) {
            debugLog(`LOADING INDICATOR ERROR: ${error.message}`, 'error');
        }
    }

    function showToast(message, type = 'info') {
        try {
            const toast = document.createElement('div');
            toast.className = `toast toast-${type}`;
            toast.innerHTML = `
                <div class="toast-content">
                    <span class="toast-icon">${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</span>
                    <span class="toast-message">${message}</span>
                </div>
            `;
            
            document.body.appendChild(toast);
            
            setTimeout(() => toast.classList.add('show'), 100);
            
            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => document.body.removeChild(toast), 300);
            }, 4000);
        } catch (error) {
            debugLog(`TOAST ERROR: ${error.message}`, 'error');
        }
    }

}, function(error) {
    // This catches module loading errors
    debugLog(`MODULE LOADING ERROR: ${error.message}`, 'error');
    debugLog(`Failed modules: ${error.requireModules}`, 'error');
    debugLog('Check if feature service URL is accessible', 'warning');
});
