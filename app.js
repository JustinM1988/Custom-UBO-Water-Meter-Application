require([
    "esri/Map",
    "esri/views/MapView",
    "esri/layers/FeatureLayer",
    "esri/Graphic",
    "esri/geometry/Point",
    "esri/symbols/SimpleMarkerSymbol",
    "esri/PopupTemplate",
    "esri/core/reactiveUtils",
    "esri/renderers/SimpleRenderer",
    "esri/renderers/UniqueValueRenderer"
], (Map, MapView, FeatureLayer, Graphic, Point, SimpleMarkerSymbol, PopupTemplate, reactiveUtils, SimpleRenderer, UniqueValueRenderer) => {

    // Application state
    let map, view, featureLayer, selectedFeature, highlightGraphic;
    let searchTimeout;

    // Portland TX Configuration
    const config = {
        featureServiceUrl: "https://services3.arcgis.com/DAf01WuIltSLujAv/arcgis/rest/services/Portland_Meters/FeatureServer/0",
        mapCenter: [-97.133, 33.217],
        mapZoom: 12,
        colors: {
            blue: "#2247fe",
            green: "#80c940",
            orange: "#fb7f31"
        },
        symbols: {
            default: new SimpleMarkerSymbol({
                color: [34, 71, 254, 0.8],
                size: 12,
                outline: { color: [255, 255, 255], width: 2 },
                style: "circle"
            }),
            updated: new SimpleMarkerSymbol({
                color: [128, 201, 64, 0.9],
                size: 12,
                outline: { color: [255, 255, 255], width: 2 },
                style: "circle"
            }),
            selected: new SimpleMarkerSymbol({
                color: [251, 127, 49, 1],
                size: 16,
                outline: { color: [255, 255, 255], width: 3 },
                style: "circle"
            })
        }
    };

    // DOM elements
    const elements = {
        searchInput: document.getElementById('searchInput'),
        searchBtn: document.getElementById('searchBtn'),
        clearBtn: document.getElementById('clearSearch'),
        resetBtn: document.getElementById('resetMapBtn'),
        searchResults: document.getElementById('searchResults'),
        loadingIndicator: document.getElementById('loadingIndicator'),
        editModal: document.getElementById('editModal'),
        addressField: document.getElementById('addressField'),
        accountField: document.getElementById('accountField'),
        customerField: document.getElementById('customerField'),
        classField: document.getElementById('classField'),
        typeField: document.getElementById('typeField'),
        accountUpdateField: document.getElementById('accountUpdateField'),
        editDateField: document.getElementById('editDateField'),
        editorField: document.getElementById('editorField'),
        saveBtn: document.getElementById('saveBtn'),
        cancelBtn: document.getElementById('cancelBtn'),
        closeModal: document.getElementById('closeModal'),
        statusContainer: document.getElementById('statusContainer'),
        helpBtn: document.getElementById('helpBtn'),
        helpContent: document.getElementById('helpContent')
    };

    // Initialize the application
    function initializeApp() {
        console.log("Initializing Portland Water Meter App...");
        initializeMap();
        setupEventListeners();
        showStatus('Portland Water Meter Account Update loaded successfully', 'success');
    }

    // Initialize map and feature layer
    function initializeMap() {
        console.log("Initializing map...");
        
        // Create map
        map = new Map({
            basemap: "streets-navigation-vector"
        });

        // Create map view
        view = new MapView({
            container: "mapView",
            map: map,
            center: config.mapCenter,
            zoom: config.mapZoom,
            popup: {
                dockEnabled: false,
                dockOptions: {
                    position: "top-right",
                    breakpoint: false
                }
            }
        });

        // Create simple renderer - we'll update based on Account_Update field
        const renderer = new SimpleRenderer({
            symbol: config.symbols.default
        });

        // Create feature layer
        featureLayer = new FeatureLayer({
            url: config.featureServiceUrl,
            outFields: ["*"],
            renderer: renderer,
            popupEnabled: false
        });

        map.add(featureLayer);

        // Wait for layer to load
        view.when(() => {
            console.log("Map view ready");
            featureLayer.when(() => {
                console.log("Feature layer loaded successfully");
                showStatus('Water meter data loaded', 'success');
                
                // Get layer extent and zoom to it
                featureLayer.queryExtent().then(result => {
                    if (result.extent) {
                        view.goTo(result.extent.expand(1.5));
                        console.log("Zoomed to layer extent");
                    }
                }).catch(err => {
                    console.warn("Could not get layer extent:", err);
                });
                
                // Test basic connectivity
                testLayerConnection();
                
            }).catch(error => {
                console.error("Error loading feature layer:", error);
                showStatus('Error loading meter data. Please check your connection.', 'error');
            });
        });

        // Handle feature clicks with hit test
        view.on("click", handleMapClick);
    }

    // Test basic layer connectivity
    async function testLayerConnection() {
        try {
            console.log("Testing layer connectivity...");
            const result = await featureLayer.queryFeatures({
                where: "1=1",
                outFields: ["OBJECTID", "Address", "Customer_Account_Number_Account", "Account_Update"],
                returnGeometry: false,
                num: 5
            });
            
            console.log(`Layer connectivity test: Found ${result.features.length} features`);
            
            if (result.features.length > 0) {
                const sampleFeature = result.features[0];
                console.log("Sample feature fields:", Object.keys(sampleFeature.attributes));
                console.log("Sample feature attributes:", sampleFeature.attributes);
                
                // Update renderer based on actual data
                updateRendererWithData();
            }
            
        } catch (error) {
            console.error("Layer connectivity test failed:", error);
            showStatus('Limited functionality: Unable to access all meter data', 'error');
        }
    }

    // Update renderer to show different symbols based on Account_Update field
    function updateRendererWithData() {
        console.log("Updating renderer with data-driven symbology...");
        
        const renderer = new UniqueValueRenderer({
            field: "Account_Update",
            defaultSymbol: config.symbols.default,
            defaultLabel: "No Account Update",
            uniqueValueInfos: []
        });

        // Handle null and empty values
        renderer.addUniqueValueInfo({
            value: null,
            symbol: config.symbols.default,
            label: "No Account Update"
        });
        
        renderer.addUniqueValueInfo({
            value: "",
            symbol: config.symbols.default,
            label: "No Account Update"
        });

        // For any other value (non-null, non-empty), use updated symbol
        // We'll use a workaround since UniqueValueRenderer doesn't support wildcards
        featureLayer.queryFeatures({
            where: "Account_Update IS NOT NULL AND Account_Update <> ''",
            outFields: ["Account_Update"],
            returnGeometry: false,
            maxRecordCountFactor: 1
        }).then(result => {
            // Get unique non-null values
            const uniqueValues = [...new Set(result.features.map(f => f.attributes.Account_Update))];
            console.log(`Found ${uniqueValues.length} unique Account_Update values`);
            
            // Add unique value info for each non-empty value
            uniqueValues.forEach(value => {
                if (value && value.trim() !== '') {
                    renderer.addUniqueValueInfo({
                        value: value,
                        symbol: config.symbols.updated,
                        label: "Has Account Update"
                    });
                }
            });
            
            featureLayer.renderer = renderer;
            console.log("Renderer updated with data-driven symbology");
            
        }).catch(error => {
            console.warn("Could not query unique values for renderer:", error);
            // Fall back to simple renderer
            featureLayer.renderer = new SimpleRenderer({
                symbol: config.symbols.default
            });
        });
    }

    // Set up event listeners
    function setupEventListeners() {
        console.log("Setting up event listeners...");
        
        // Search functionality
        elements.searchInput.addEventListener('input', handleSearchInput);
        elements.searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                performSearch();
            }
        });
        elements.searchBtn.addEventListener('click', performSearch);
        elements.clearBtn.addEventListener('click', clearSearch);
        elements.resetBtn.addEventListener('click', resetMap);

        // Modal functionality
        elements.saveBtn.addEventListener('click', saveChanges);
        elements.cancelBtn.addEventListener('click', closeModal);
        elements.closeModal.addEventListener('click', closeModal);
        
        // Close modal when clicking backdrop
        elements.editModal.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-backdrop')) {
                closeModal();
            }
        });

        // Help functionality
        elements.helpBtn.addEventListener('click', toggleHelp);

        // Close search results when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.search-input-container')) {
                hideSearchResults();
            }
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (!elements.editModal.classList.contains('hidden')) {
                    closeModal();
                } else if (!elements.searchResults.classList.contains('hidden')) {
                    hideSearchResults();
                }
            }
        });
    }

    // Handle search input with debouncing
    function handleSearchInput() {
        const query = elements.searchInput.value.trim();
        
        if (searchTimeout) {
            clearTimeout(searchTimeout);
        }

        if (query.length > 1) {
            searchTimeout = setTimeout(() => {
                searchFeatures(query);
            }, 300);
        } else {
            hideSearchResults();
        }
    }

    // Search for features with improved error handling
    async function searchFeatures(query) {
        console.log(`Searching for: ${query}`);
        
        try {
            showLoading(true);
            
            // Simple approach - get all features and filter client-side for reliability
            const allFeaturesResult = await featureLayer.queryFeatures({
                where: "1=1",
                outFields: ["OBJECTID", "Address", "Customer_Account_Number_Account", "Customer", "Account_Update"],
                returnGeometry: true,
                maxRecordCountFactor: 2
            });

            console.log(`Retrieved ${allFeaturesResult.features.length} total features for search`);
            
            // Filter features on client side
            const searchLower = query.toLowerCase();
            const matchingFeatures = allFeaturesResult.features.filter(feature => {
                const attrs = feature.attributes;
                const address = (attrs.Address || '').toLowerCase();
                const account = (attrs.Customer_Account_Number_Account || '').toLowerCase();
                
                return address.includes(searchLower) || account.includes(searchLower);
            }).slice(0, 10); // Limit to 10 results
            
            console.log(`Found ${matchingFeatures.length} matching features`);
            displaySearchResults(matchingFeatures, query);
            
        } catch (error) {
            console.error("Search error:", error);
            showStatus('Search temporarily unavailable', 'error');
            elements.searchResults.innerHTML = '<div class="search-result-item">Search unavailable - please try clicking on meters directly</div>';
            elements.searchResults.classList.remove('hidden');
        } finally {
            showLoading(false);
        }
    }

    // Display search results
    function displaySearchResults(features, query) {
        if (features.length === 0) {
            elements.searchResults.innerHTML = '<div class="search-result-item">No meters found matching your search</div>';
            elements.searchResults.classList.remove('hidden');
            return;
        }

        const resultsHtml = features.map((feature) => {
            const attrs = feature.attributes;
            const address = attrs.Address || 'No address';
            const account = attrs.Customer_Account_Number_Account || 'N/A';
            
            return `
                <div class="search-result-item" data-objectid="${attrs.OBJECTID}" tabindex="0">
                    <strong>${address}</strong>
                    <small>Account: ${account}</small>
                </div>
            `;
        }).join('');

        elements.searchResults.innerHTML = resultsHtml;
        elements.searchResults.classList.remove('hidden');

        // Add click listeners to results
        elements.searchResults.querySelectorAll('.search-result-item').forEach(item => {
            item.addEventListener('click', () => {
                const objectId = item.dataset.objectid;
                if (objectId && objectId !== 'undefined') {
                    selectFeatureById(parseInt(objectId));
                    hideSearchResults();
                    elements.searchInput.value = item.querySelector('strong').textContent;
                }
            });
        });
    }

    // Perform search
    function performSearch() {
        const query = elements.searchInput.value.trim();
        if (query) {
            searchFeatures(query);
        } else {
            showStatus('Please enter a search term', 'info');
        }
    }

    // Clear search
    function clearSearch() {
        elements.searchInput.value = '';
        hideSearchResults();
        clearHighlight();
    }

    // Reset map
    function resetMap() {
        console.log("Resetting map...");
        if (featureLayer) {
            featureLayer.queryExtent().then(result => {
                if (result.extent) {
                    view.goTo(result.extent.expand(1.5));
                }
            }).catch(() => {
                view.goTo({
                    center: config.mapCenter,
                    zoom: config.mapZoom
                });
            });
        }
        clearHighlight();
        closeModal();
    }

    // Hide search results
    function hideSearchResults() {
        elements.searchResults.classList.add('hidden');
    }

    // Handle map clicks using hitTest
    async function handleMapClick(event) {
        console.log("Map clicked at:", event.mapPoint);
        
        try {
            showLoading(true);
            
            // Use hitTest to get features at click point
            const hitTestResult = await view.hitTest(event);
            console.log("Hit test result:", hitTestResult);
            
            // Check if we hit our feature layer
            const featureHits = hitTestResult.results.filter(result => 
                result.graphic && result.graphic.layer === featureLayer
            );
            
            if (featureHits.length > 0) {
                const graphic = featureHits[0].graphic;
                console.log("Hit feature with attributes:", graphic.attributes);
                
                // Query the full feature with all fields
                const objectId = graphic.attributes.OBJECTID;
                selectFeatureById(objectId);
                
            } else {
                console.log("No features hit, trying spatial query...");
                
                // Fallback: spatial query
                const queryResult = await featureLayer.queryFeatures({
                    geometry: event.mapPoint,
                    spatialRelationship: "intersects",
                    distance: 20,
                    units: "pixels",
                    outFields: ["*"],
                    returnGeometry: true
                });

                if (queryResult.features.length > 0) {
                    const feature = queryResult.features[0];
                    console.log("Found feature via spatial query:", feature.attributes);
                    selectFeature(feature);
                } else {
                    console.log("No features found at click location");
                }
            }
            
        } catch (error) {
            console.error("Error handling map click:", error);
            showStatus('Error selecting meter. Please try again.', 'error');
        } finally {
            showLoading(false);
        }
    }

    // Select feature by ID
    async function selectFeatureById(objectId) {
        console.log(`Selecting feature with OBJECTID: ${objectId}`);
        
        try {
            showLoading(true);
            
            const queryResult = await featureLayer.queryFeatures({
                where: `OBJECTID = ${objectId}`,
                outFields: ["*"],
                returnGeometry: true
            });

            if (queryResult.features.length > 0) {
                const feature = queryResult.features[0];
                console.log("Retrieved feature:", feature.attributes);
                selectFeature(feature);
            } else {
                showStatus('Could not find selected meter', 'error');
            }
        } catch (error) {
            console.error("Error selecting feature by ID:", error);
            showStatus('Error selecting meter', 'error');
        } finally {
            showLoading(false);
        }
    }

    // Select and highlight feature
    function selectFeature(feature) {
        console.log("Selecting feature:", feature.attributes);
        selectedFeature = feature;
        
        highlightFeature(feature);
        showEditModal(feature);
        
        // Center map on selected feature
        view.goTo({
            center: [feature.geometry.x, feature.geometry.y],
            zoom: Math.max(view.zoom, 17)
        }, {
            duration: 1000
        });
        
        showStatus('Meter selected - you can now edit the Account Update field', 'info');
    }

    // Highlight selected feature
    function highlightFeature(feature) {
        clearHighlight();
        
        const point = new Point({
            x: feature.geometry.x,
            y: feature.geometry.y,
            spatialReference: feature.geometry.spatialReference
        });

        highlightGraphic = new Graphic({
            geometry: point,
            symbol: config.symbols.selected
        });

        view.graphics.add(highlightGraphic);
    }

    // Clear feature highlight
    function clearHighlight() {
        if (highlightGraphic) {
            view.graphics.remove(highlightGraphic);
            highlightGraphic = null;
        }
    }

    // Show edit modal
    function showEditModal(feature) {
        console.log("Showing edit modal for feature:", feature.attributes);
        const attrs = feature.attributes;
        
        // Populate display fields (read-only)
        elements.addressField.value = attrs.Address || '';
        elements.accountField.value = attrs.Customer_Account_Number_Account || '';
        elements.customerField.value = attrs.Customer || '';
        elements.classField.value = attrs.Class || '';
        elements.typeField.value = attrs.Type || '';
        
        // Populate editable field
        elements.accountUpdateField.value = attrs.Account_Update || '';
        
        // Populate info fields
        if (attrs.EditDate) {
            try {
                const date = new Date(attrs.EditDate);
                elements.editDateField.value = date.toLocaleDateString();
            } catch (e) {
                elements.editDateField.value = attrs.EditDate;
            }
        } else {
            elements.editDateField.value = 'Never';
        }
        
        elements.editorField.value = attrs.Editor || 'Unknown';
        
        elements.editModal.classList.remove('hidden');
        
        // Focus on the editable field
        setTimeout(() => {
            elements.accountUpdateField.focus();
        }, 100);
    }

    // Close modal
    function closeModal() {
        console.log("Closing modal");
        elements.editModal.classList.add('hidden');
        clearHighlight();
        selectedFeature = null;
    }

    // Save changes
    async function saveChanges() {
        console.log("Saving changes...");
        
        if (!selectedFeature) {
            showStatus('No meter selected', 'error');
            return;
        }

        try {
            showLoading(true);
            
            // Create updated feature
            const featureToUpdate = selectedFeature.clone();
            const newAccountUpdate = elements.accountUpdateField.value.trim();
            
            featureToUpdate.attributes.Account_Update = newAccountUpdate || null;
            featureToUpdate.attributes.EditDate = Date.now();
            featureToUpdate.attributes.Editor = "Water Meter App User";
            
            console.log("Applying edits with attributes:", featureToUpdate.attributes);

            // Apply edits
            const editResult = await featureLayer.applyEdits({
                updateFeatures: [featureToUpdate]
            });

            console.log("Edit result:", editResult);

            if (editResult.updateFeatureResults && 
                editResult.updateFeatureResults.length > 0 && 
                editResult.updateFeatureResults[0].success) {
                
                showStatus('Water meter account information updated successfully!', 'success');
                closeModal();
                
                // Refresh layer to show updated symbology
                featureLayer.refresh();
                
            } else {
                const error = editResult.updateFeatureResults?.[0]?.error;
                console.error("Update failed:", error);
                throw new Error(error ? error.description : 'Failed to update meter information');
            }
        } catch (error) {
            console.error("Error saving changes:", error);
            showStatus(`Error saving changes: ${error.message}`, 'error');
        } finally {
            showLoading(false);
        }
    }

    // Show loading indicator
    function showLoading(show) {
        elements.loadingIndicator.classList.toggle('hidden', !show);
    }

    // Show status messages
    function showStatus(message, type = 'info') {
        console.log(`Status [${type}]: ${message}`);
        
        const statusEl = document.createElement('div');
        statusEl.className = `status-message ${type}`;
        statusEl.textContent = message;
        
        elements.statusContainer.appendChild(statusEl);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (statusEl.parentNode) {
                statusEl.parentNode.removeChild(statusEl);
            }
        }, 5000);
    }

    // Toggle help panel
    function toggleHelp() {
        elements.helpContent.classList.toggle('hidden');
    }

    // Initialize when ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeApp);
    } else {
        initializeApp();
    }
});