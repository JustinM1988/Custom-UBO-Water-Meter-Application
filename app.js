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

    let map, view, featureLayer, selectedFeature, highlightGraphic = null;

    debugLog('Starting initialization...', 'info');
    init();

    async function init() {
        try {
            showLoading(true);
            await initMap();
            await loadAllFeatures();
            initSearch();
            initEventListeners();
            updateStats();
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
            const viewDiv = document.getElementById('viewDiv');
            if (!viewDiv) throw new Error('viewDiv element not found in DOM');
            map = new Map({ basemap: "streets-navigation-vector" });
            view = new MapView({
                container: "viewDiv",
                map: map,
                center: [-97.3238, 27.8772],
                zoom: 13
            });

            featureLayer = new FeatureLayer({
                url: config.serviceUrl,
                renderer: createSymbologyRenderer(),
                popupEnabled: false,
                outFields: ["*"]
            });

            map.add(featureLayer);

            // FIXED: Re-add legend
            const legend = new Legend({ 
                view: view, 
                style: { type: "card", layout: "side-by-side" },
                respectLayerVisibility: true
            });
            const legendExpand = new Expand({
                view: view,
                content: legend,
                expanded: false,
                expandIconClass: "esri-icon-layer-list",
                expandTooltip: "Show Legend"
            });
            view.ui.add(legendExpand, "top-right");
            debugLog('Legend added successfully', 'success');

            view.on("click", handleMapClick);
            await view.when();
        } catch (error) {
            debugLog(`MAP INITIALIZATION ERROR: ${error.message}`, 'error');
            throw error;
        }
    }

    function createSymbologyRenderer() {
        debugLog('Creating symbology renderer (blue+green)...', 'info');
        return new UniqueValueRenderer({
            field: config.fieldNames.accountUpdate,
            defaultSymbol: new SimpleMarkerSymbol({
                color: config.colors.needsUpdate,
                size: 8,
                outline: { color: "white", width: 1.5 }
            }),
            uniqueValueInfos: [
                { value: null, symbol: new SimpleMarkerSymbol({ color: config.colors.needsUpdate, size: 8, outline: { color: "white", width: 1.5 } }), label: "Needs Update" },
                { value: "",   symbol: new SimpleMarkerSymbol({ color: config.colors.needsUpdate, size: 8, outline: { color: "white", width: 1.5 } }), label: "Needs Update" },
                { value: " ",  symbol: new SimpleMarkerSymbol({ color: config.colors.needsUpdate, size: 8, outline: { color: "white", width: 1.5 } }), label: "Needs Update" }
            ]
        });
    }

    async function loadAllFeatures() {
        let features = [];
        let offset = 0, batchSize = 1000, hasMoreResults = true;
        while (hasMoreResults) {
            const query = featureLayer.createQuery();
            query.where = "1=1";
            query.outFields = ["*"];
            query.returnGeometry = true;
            query.start = offset;
            query.num = batchSize;
            debugLog(`Fetching batch starting at ${offset}...`, 'info');
            const results = await featureLayer.queryFeatures(query);
            features = features.concat(results.features);
            offset += batchSize;
            hasMoreResults = results.features.length === batchSize;
        }
        window.allFeatures = features;
        debugLog(`Successfully loaded ${features.length} features (all meters!)`, 'success');
        updateRendererWithData(features);
    }

    function updateRendererWithData(features) {
        debugLog('Updating renderer with blue/green symbology based on Account_Update...', 'info');
        const uniqueValueInfos = [
            { value: null, symbol: new SimpleMarkerSymbol({ color: config.colors.needsUpdate, size: 8, outline: { color: "white", width: 1.5 } }), label: "Needs Update" },
            { value: "",   symbol: new SimpleMarkerSymbol({ color: config.colors.needsUpdate, size: 8, outline: { color: "white", width: 1.5 } }), label: "Needs Update" },
            { value: " ",  symbol: new SimpleMarkerSymbol({ color: config.colors.needsUpdate, size: 8, outline: { color: "white", width: 1.5 } }), label: "Needs Update" }
        ];
        const updatedValues = new Set();
        features.forEach(f => {
            const value = f.attributes[config.fieldNames.accountUpdate];
            if (value && value.toString().trim() !== "") updatedValues.add(value);
        });
        updatedValues.forEach(value => {
            uniqueValueInfos.push({
                value: value,
                symbol: new SimpleMarkerSymbol({
                    color: config.colors.updated,
                    size: 8,
                    outline: { color: "white", width: 1.5 }
                }),
                label: "Updated"
            });
        });
        featureLayer.renderer = new UniqueValueRenderer({
            field: config.fieldNames.accountUpdate,
            defaultSymbol: new SimpleMarkerSymbol({
                color: config.colors.needsUpdate,
                size: 8,
                outline: { color: "white", width: 1.5 }
            }),
            uniqueValueInfos: uniqueValueInfos
        });
        debugLog('Renderer updated: Blue for empty Account_Update, Green for filled!', 'success');
    }

    function initSearch() {
        debugLog('Initializing search...', 'info');
        const searchInput = document.getElementById('searchInput');
        const searchResults = document.getElementById('searchResults');
        if (!searchInput || !searchResults) throw new Error('Search elements not found in DOM');
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
    }

    function performSearch(query) {
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
        }).slice(0, 8); // Fewer results for smaller panel
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
                        <div class="result-sub">Account: ${account}</div>
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
    }

    async function handleMapClick(event) {
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
    }

    function selectMeterByObjectId(objectId) {
        debugLog(`Selecting meter by ObjectID: ${objectId}`, 'info');
        const feature = window.allFeatures.find(f => f.attributes.OBJECTID === objectId);
        if (feature) {
            selectMeter(feature);
            view.goTo({ target: feature.geometry, zoom: 17 });
        } else {
            debugLog(`Feature with ObjectID ${objectId} not found`, 'warning');
        }
    }

    function selectMeter(feature) {
        debugLog('Selecting meter', 'info');
        selectedFeature = feature;
        if (highlightGraphic) view.graphics.remove(highlightGraphic);
        highlightGraphic = new Graphic({
            geometry: feature.geometry,
            symbol: new SimpleMarkerSymbol({
                color: config.colors.selected,
                size: 14,
                outline: { color: "white", width: 2.5 }
            })
        });
        view.graphics.add(highlightGraphic);
        showMeterDetails(feature);
        debugLog('Meter selected successfully', 'success');
    }

    function showMeterDetails(feature) {
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
                        <button id="saveChanges" class="btn btn-primary">💾 Save</button>
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
    }

    async function saveAccountUpdate() {
        // FIXED: Don't freeze on save
        const saveBtn = document.getElementById('saveChanges');
        const input = document.getElementById('accountUpdateInput');
        
        if (!selectedFeature || !saveBtn || !input) return;
        
        try {
            debugLog('Saving account update...', 'info');
            const newValue = input.value.trim();
            
            // Disable button to prevent double-clicks
            saveBtn.disabled = true;
            saveBtn.textContent = '💾 Saving...';
            
            // Clone the feature for editing
            const updatedFeature = selectedFeature.clone();
            updatedFeature.attributes[config.fieldNames.accountUpdate] = newValue;
            
            const edits = { updateFeatures: [updatedFeature] };
            
            debugLog('Applying edits to feature layer...', 'info');
            debugLog(`Updating OBJECTID ${updatedFeature.attributes.OBJECTID} with value: "${newValue}"`, 'info');
            
            const result = await featureLayer.applyEdits(edits);
            debugLog(`Edit result: ${JSON.stringify(result)}`, 'info');
            
            if (result.updateFeatureResults && result.updateFeatureResults.length > 0) {
                const updateResult = result.updateFeatureResults[0];
                debugLog(`Update result success: ${updateResult.success}`, 'info');
                debugLog(`Update result error: ${updateResult.error}`, 'info');
                
                // Success or null error (which still works)
                if (updateResult.success || updateResult.error === null) {
                    debugLog('Save successful!', 'success');
                    showToast('Account update saved successfully! ✅', 'success');
                    
                    // Update local data
                    const localFeature = window.allFeatures.find(f =>
                        f.attributes.OBJECTID === selectedFeature.attributes.OBJECTID
                    );
                    if (localFeature) {
                        localFeature.attributes[config.fieldNames.accountUpdate] = newValue;
                    }
                    selectedFeature.attributes[config.fieldNames.accountUpdate] = newValue;
                    
                    // Update renderer and stats
                    updateRendererWithData(window.allFeatures);
                    updateStats();
                    
                    // FIXED: Don't close panel, just reset button
                    saveBtn.disabled = false;
                    saveBtn.textContent = '💾 Save';
                    
                } else {
                    throw new Error(updateResult.error || 'Update failed');
                }
            } else {
                throw new Error('No update results returned');
            }
            
        } catch (error) {
            debugLog(`SAVE ERROR: ${error.message}`, 'error');
            showToast('Failed to save changes. Please try again. ❌', 'error');
            
            // Re-enable button
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.textContent = '💾 Save';
            }
        }
    }

    function closeMeterDetails() {
        debugLog('Closing meter details', 'info');
        const panel = document.getElementById('detailsPanel');
        const content = document.getElementById('detailsContent');
        
        // Show instructions again
        content.innerHTML = `
            <div class="details-section instruction-section">
                <h3 class="section-title">👆 Getting Started</h3>
                <div class="instruction-content">
                    <p><strong>Click on any meter</strong> (blue or green dot) on the map to view and edit its details.</p>
                    <div class="legend-guide">
                        <div class="legend-item">
                            <span class="legend-dot blue-dot"></span>
                            <span>Needs Account Update</span>
                        </div>
                        <div class="legend-item">
                            <span class="legend-dot green-dot"></span>
                            <span>Account Updated</span>
                        </div>
                    </div>
                    <p class="instruction-tip">💡 <strong>Tip:</strong> Use the search box to find specific addresses or account numbers.</p>
                </div>
            </div>
        `;
        
        panel.classList.remove('visible');
        if (highlightGraphic) view.graphics.remove(highlightGraphic);
        highlightGraphic = null;
        selectedFeature = null;
    }

    function initEventListeners() {
        debugLog('Initializing event listeners...', 'info');
        document.getElementById('closeDetails').addEventListener('click', closeMeterDetails);
        document.getElementById('resetView').addEventListener('click', () => {
            view.goTo({ center: [-97.3238, 27.8772], zoom: 13 });
        });
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.search-container')) {
                document.getElementById('searchResults').classList.add('hidden');
            }
        });
    }

    function updateStats() {
        const totalCount = window.allFeatures ? window.allFeatures.length : 0;
        const updatedCount = window.allFeatures ? window.allFeatures.filter(feature => {
            const value = feature.attributes[config.fieldNames.accountUpdate];
            return value && value.toString().trim() !== "";
        }).length : 0;
        document.getElementById('totalMeters').textContent = totalCount.toLocaleString();
        document.getElementById('updatedMeters').textContent = updatedCount.toLocaleString();
        debugLog(`Stats updated: ${totalCount} total, ${updatedCount} updated`, 'success');
    }

    function showLoading(show, message = 'Loading...') {
        const loading = document.getElementById('loadingIndicator');
        if (show) {
            loading.querySelector('.loading-text').textContent = message;
            loading.classList.remove('hidden');
        } else {
            loading.classList.add('hidden');
        }
    }

    function showToast(message, type = 'info') {
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
        }, 3000); // Shorter display time
    }

}, function(error) {
    debugLog(`MODULE LOADING ERROR: ${error.message}`, 'error');
    debugLog(`Failed modules: ${error.requireModules}`, 'error');
    debugLog('Check if feature service URL is accessible', 'warning');
});
