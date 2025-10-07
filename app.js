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

    // Global variables
    let map, view, featureLayer, selectedFeature, allFeatures = [];
    let highlightGraphic = null;

    // Initialize
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
            console.log("Application initialized successfully");
        } catch (error) {
            console.error("Initialization error:", error);
            showToast("Failed to initialize application: " + error.message, "error");
            showLoading(false);
        }
    }

    async function initMap() {
        try {
            // Create map
            map = new Map({
                basemap: "streets-navigation-vector"
            });

            // Create view
            view = new MapView({
                container: "viewDiv",
                map: map,
                center: [-97.3238, 27.8772],
                zoom: 13
            });

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

            featureLayer = new FeatureLayer({
                url: config.serviceUrl,
                renderer: renderer,
                popupEnabled: false,
                outFields: ["*"]
            });

            map.add(featureLayer);

            // Add legend
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

            // Map click handler
            view.on("click", handleMapClick);

            await view.when();
            console.log("Map initialized successfully");

        } catch (error) {
            console.error("Map initialization error:", error);
            throw new Error("Failed to initialize map: " + error.message);
        }
    }

    async function loadAllFeatures() {
        try {
            const query = featureLayer.createQuery();
            query.where = "1=1";
            query.outFields = ["*"];
            query.returnGeometry = true;

            const results = await featureLayer.queryFeatures(query);
            allFeatures = results.features;
            console.log(`Loaded ${allFeatures.length} features`);

            updateRenderer();
        } catch (error) {
            console.error("Error loading features:", error);
            throw error;
        }
    }

    function updateRenderer() {
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
    }

    function initSearch() {
        const searchInput = document.getElementById('searchInput');
        const searchResults = document.getElementById('searchResults');
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
    }

    async function handleMapClick(event) {
        try {
            const response = await view.hitTest(event);
            
            if (response.results.length > 0) {
                const graphic = response.results.find(result => 
                    result.graphic && result.graphic.layer === featureLayer
                );
                
                if (graphic) {
                    selectMeter(graphic.graphic);
                }
            }
        } catch (error) {
            console.error("Map click error:", error);
        }
    }

    function selectMeterByObjectId(objectId) {
        const feature = allFeatures.find(f => f.attributes.OBJECTID === objectId);
        if (feature) {
            selectMeter(feature);
            
            view.goTo({
                target: feature.geometry,
                zoom: 18
            });
        }
    }

    function selectMeter(feature) {
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
    }

    function showMeterDetails(feature) {
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
    }

    async function saveAccountUpdate() {
        if (!selectedFeature) return;
        
        const input = document.getElementById('accountUpdateInput');
        const newValue = input.value.trim();
        
        try {
            showLoading(true, 'Saving changes...');
            
            selectedFeature.attributes[config.fieldNames.accountUpdate] = newValue;
            
            const edits = {
                updateFeatures: [selectedFeature]
            };
            
            const result = await featureLayer.applyEdits(edits);
            
            if (result.updateFeatureResults && result.updateFeatureResults.length > 0) {
                const updateResult = result.updateFeatureResults[0];
                
                if (updateResult.success) {
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
                    throw new Error(updateResult.error || 'Update failed');
                }
            } else {
                throw new Error('No update results returned');
            }
            
        } catch (error) {
            console.error('Save error:', error);
            showToast('Failed to save changes. Please try again. ❌', 'error');
        } finally {
            showLoading(false);
        }
    }

    function closeMeterDetails() {
        const panel = document.getElementById('detailsPanel');
        panel.classList.remove('visible');
        
        if (highlightGraphic) {
            view.graphics.remove(highlightGraphic);
            highlightGraphic = null;
        }
        
        selectedFeature = null;
    }

    function initEventListeners() {
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
    }

    function updateStats() {
        const totalCount = allFeatures.length;
        const updatedCount = allFeatures.filter(feature => {
            const value = feature.attributes[config.fieldNames.accountUpdate];
            return value && value.trim() !== "";
        }).length;
        
        document.getElementById('totalMeters').textContent = totalCount.toLocaleString();
        document.getElementById('updatedMeters').textContent = updatedCount.toLocaleString();
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
        }, 4000);
    }

});
