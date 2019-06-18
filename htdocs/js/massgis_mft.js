OpenLayers.Layer.Vector.prototype.moveTo = function(bounds, zoomChanged, dragging) {
	OpenLayers.Layer.prototype.moveTo.apply(this, arguments);

	var coordSysUnchanged = true;
	if (!dragging) {
		this.renderer.root.style.visibility = 'hidden';

		var viewSize = this.map.getSize(),
			viewWidth = viewSize.w,
			viewHeight = viewSize.h,
			offsetLeft = (viewWidth / 2 * this.ratio) - viewWidth / 2,
			offsetTop = (viewHeight / 2 * this.ratio) - viewHeight / 2;
		offsetLeft += parseInt(this.map.layerContainerDiv.style.left, 10);
		offsetLeft = -Math.round(offsetLeft);
		offsetTop += parseInt(this.map.layerContainerDiv.style.top, 10);
		offsetTop = -Math.round(offsetTop);

		this.div.style.left = offsetLeft + 'px';
		this.div.style.top = offsetTop + 'px';

		var extent = this.map.getExtent().scale(this.ratio);
		coordSysUnchanged = this.renderer.setExtent(extent, zoomChanged);

		this.renderer.root.style.visibility = 'visible';

		// Force a reflow on gecko based browsers to prevent jump/flicker.
		// This seems to happen on only certain configurations; it was originally
		// noticed in FF 2.0 and Linux.
		if (OpenLayers.IS_GECKO === true) {
			this.div.scrollLeft = this.div.scrollLeft;
		}

		if (!zoomChanged && coordSysUnchanged) {
			for (var i in this.unrenderedFeatures) {
				this.drawFeature(this.unrenderedFeatures[i]);
			}
		}
	}
	if (!this.drawn || zoomChanged || !coordSysUnchanged) {
		this.drawn = true;
		var feature;
		if (this.spatialIndex) {
			this.renderer.clear();
			var searchRect = {x:bounds.left, y:bounds.bottom, w: bounds.getWidth(), h: bounds.getHeight()};
			var featuresToDraw = this.spatialIndex.search(searchRect);
			for(var i=0, len=featuresToDraw.length; i<len; i++) {
				this.renderer.locked = (i !== (len - 1));
				feature = featuresToDraw[i];
				if (feature.geometry.bounds.intersectsBounds(bounds)) {
					this.drawFeature(feature);
				}
			}
		} else {
			for(var i=0, len=this.features.length; i<len; i++) {
				this.renderer.locked = (i !== (len - 1));
				feature = this.features[i];
				this.drawFeature(feature);
			}
		}
	}
};

var MASSGIS = MASSGIS || {};
var tiles = {};

OpenLayers.Layer.IndexedVector = OpenLayers.Class(OpenLayers.Layer.Vector, {
	CLASS_NAME: "OpenLayers.Layer.IndexedVector",

	reindex : function() {
		var that = this;
		this.indexes && $.each(this.indexes, function(attrname, oldIndex) {
			var index = {};
			$.each(that.features, function(idx, feature) {
				if (feature.attributes && feature.attributes[attrname]) {
					if (index[feature.attributes[attrname]]) {
						index[feature.attributes[attrname]].push(feature);
					} else {
						index[feature.attributes[attrname]] = [feature];
					}
				}
			});
			that.indexes[attrname] = index;
		});
	},
	initialize: function(name, options) {
		OpenLayers.Layer.Vector.prototype.initialize.apply(this, arguments);

		this.events.register("featuresadded",this,function(obj) {
			//console.log("features added to layer " + this.name + ".  Re-indexing layer");
			this.reindex();
		});

		this.events.register("featuresremoved",this,function(obj) {
			//console.log("features removed from layer " + this.name + ".  Re-indexing layer");
			this.reindex();
		});
	},

	getFeaturesByAttribute: function(attribute, value) {
		// search using index
		if (this.indexes && this.indexes[attribute]) {
			var list = this.indexes[attribute][value];
			if (!list) {
				return [];
			} else {
				return this.indexes[attribute][value];
			}
		}
		return OpenLayers.Layer.Vector.prototype.getFeaturesByAttribute.apply(this,[attribute, value]);
	}
});

OpenLayers.Layer.SpatialIndexedVector = OpenLayers.Class(OpenLayers.Layer.IndexedVector, {
	CLASS_NAME: "OpenLayers.Layer.SpatialIndexedVector",

	spatialIndex: null,

	reindex: function() {
		OpenLayers.Layer.IndexedVector.prototype.reindex.apply(this,[]);
		this.spatialIndex = new RTree();
		var that = this;
		$.each(this.features, function(idx, feature) {
			feature.geometry && feature.geometry.calculateBounds();
			if (feature.geometry && feature.geometry.getBounds()) {
				var bounds = feature.geometry.getBounds();
				that.spatialIndex.insert({x:bounds.left - 1, y:bounds.bottom - 1, w:bounds.getWidth() + 1, h:bounds.getHeight() + 1}, feature);
			}
		});
	},
	initialize: function(name, options) {
		OpenLayers.Layer.IndexedVector.prototype.initialize.apply(this, arguments);
		this.spatialIndex = new RTree();
		this.events.register("featureadded", this, function(obj) {
			if (obj.feature.geometry) {
				obj.feature.geometry.calculateBounds();
				var bounds = obj.feature.geometry.getBounds();
				bounds && this.spatialIndex.insert({x:bounds.left - 1, y:bounds.bottom - 1, w:bounds.getWidth() + 1, h:bounds.getHeight() + 1}, obj.feature);
			}
		});

		this.events.register("featuremodified", this, function(obj) {
			if (obj.feature.geometry) {
				obj.feature.geometry.calculateBounds();
				var bounds = obj.feature.geometry.getBounds();
				bounds && this.spatialIndex.remove({x:bounds.left - 1, y:bounds.bottom - 1, w:bounds.getWidth() + 1, h:bounds.getHeight() + 1}, obj.feature);
				bounds && this.spatialIndex.insert({x:bounds.left - 1, y:bounds.bottom - 1, w:bounds.getWidth() + 1, h:bounds.getHeight() + 1}, obj.feature);
			}
		});

		this.events.register("featureremoved", this, function(obj) {
			if (obj.feature.geometry) {
				obj.feature.geometry.calculateBounds();
				var bounds = obj.feature.geometry.getBounds();
				bounds && this.spatialIndex.remove({x:bounds.left - 1, y:bounds.bottom - 1, w:bounds.getWidth() + 1, h:bounds.getHeight() + 1}, obj.feature);
			}
		});
	}
});


(function() {

MASSGIS.init_app = false;
MASSGIS.init_data = false;
MASSGIS.addr_candidates = {};
MASSGIS.site_candidates = {};
MASSGIS.active_point = false;
MASSGIS.pageinit = false;
MASSGIS.addressListMode = 'street';
MASSGIS.cachedTiles = {};
MASSGIS.undoStack = {};
MASSGIS.username;
MASSGIS.addressQueryResults = [];
MASSGIS.mapTypes = ['Road','Ortho 2013-14','Ortho 2014-15','Blank'];
MASSGIS.mapType = MASSGIS.mapTypes[0];


$(document).on("pageinit", function(evt) {
	if (MASSGIS.pageinit) return;

	MASSGIS.pageinit = true;

	// allow some navbar buttons to NOT stay pressed
	$(document).on('tap', function(e){
		$('.noActivePersist').removeClass($.mobile.activeBtnClass);
	});

	$(window).bind("orientationchange resize pageshow", fixgeometry);
	$('#mappage').on('pageshow',function(evt) {
		if (!MASSGIS.init_app) {
			MASSGIS.init_map();
			MASSGIS.init_ui();
			jQuery("#gps_controls").gps_map_controls({
				map: MASSGIS.map,
				pointRadius: MASSGIS.pointRadius,
				fillColor: MASSGIS.fillColor,
				strokeColor: MASSGIS.strokeColor,
				strokeWidth: MASSGIS.strokeWidth,
				fillOpacity: MASSGIS.fillOpacity
			});
			MASSGIS.init_app = true;
		}
		if (!MASSGIS.init_data) {
			MASSGIS.loadCachedTiles();
			MASSGIS.init_datastores();
		}
	});

	$(document).on('pagechange',function(evt, options) {
		if ($.mobile.activePage.attr('id') !== 'mappage' && !MASSGIS.init) {
			//location.href="/fdc";
			//return;
		}
	});
});

MASSGIS.loadCachedTiles = function() {
	//$.mobile.showPageLoadingMsg('b','Loading Stored Map Images (This may take a minute)','true');
	MASSGIS.showModalMessage('Loading Stored Map Images (This may take a minute)');
	var tileDb = openDatabase('tiledb','1.0','tiledb',1 * 1024 * 1024);
	tileDb.transaction(function(tx) {
		tx.executeSql("select * from osm",[],function(tx,results) {
			for (var i = 0 ; i < results.rows.length; i++) {
				MASSGIS.cachedTiles[results.rows.item(i).url.substring(9)] = results.rows.item(i).uri;
			}
		});
	});
};

MASSGIS.config = {
	// the tolerance (in pixels) around a point to search when tapping the map
	"tapTolerance" : 20
};

MASSGIS.init_ui = function() {
	$('#search_street').on("click",function() {
		$('#addr_query').css('display','none');
		$('#addr_list').css('display','block');
		MASSGIS.addressListMode = 'street';
		MASSGIS.renderAddressList();
	});

	$('#search_proximity').on("click",function() {
		$('#addr_query').css('display','none');
		$('#addr_list').css('display','block');
		MASSGIS.addressListMode = 'proximity';

		// Pull back everything w/i the map bbox.
		// Keep track of map center for sorting later on.
		var lonLat;
		var gps = jQuery("#gps_controls").gps_map_controls('getLastPosition');

		lonLat = MASSGIS.map.getCenter();

		var bbox = MASSGIS.map.getExtent();
		var searchRect = {
			x : bbox.left
			,y : bbox.bottom
			,w : bbox.right - bbox.left
			,h : bbox.top - bbox.bottom
		};
		var potentialSelAddrs = MASSGIS.lyr_address_points.spatialIndex.search(searchRect);
		while (potentialSelAddrs.length > 200) {
			console.log("shrinking bbox because we had too many results: " + potentialSelAddrs.length);
			bbox = bbox.scale(.75);
			searchRect = {
				x : bbox.left
				,y : bbox.bottom
				,w : bbox.right - bbox.left
				,h : bbox.top - bbox.bottom
			};
			potentialSelAddrs = MASSGIS.lyr_address_points.spatialIndex.search(searchRect);
		}
		console.log("shrunk bbox to garner # results: " + potentialSelAddrs.length);

		// Refine the results by looking at each distance from the center and put each hit
		// into a hash by distance.  It's possible, but unlikely, for > 1 addr to be equidistant
		// from the center point.
		var addrsByDistance = {};
		if (potentialSelAddrs.length !== 0) {
			var centerPoint = new OpenLayers.Geometry.Point(lonLat.lon,lonLat.lat);
			$.each(potentialSelAddrs, function(idx, mpt) {
				var pt = mpt.geometry.getCentroid();
				if (pt) {
					var d = pt.distanceTo(centerPoint);
					if (!addrsByDistance[d]) {
						addrsByDistance[d] = [];
					}
					addrsByDistance[d].push(mpt.attributes.address_point_id);
				}
			});
		}

		// Sort the distances.
		var distances = [];
		for (d in addrsByDistance) {
			distances.push(d);
		}
		distances.sort(function(a,b){return a-b});

		// Pull back the MAF hits ordered by distance.
		var sortedAddrsByDistance = [];
		for (var i = 0; i < distances.length; i++) {
			var a = addrsByDistance[distances[i]];
			for (var j = 0; j < a.length; j++) {
				var f = MASSGIS.lyr_maf.getFeaturesByAttribute("address_point_id",a[j]);
				for (var j = 0; j < f.length; j++) {
					if (f[j].attributes.address_status == 'DELETED') {
						continue;
					}
					sortedAddrsByDistance.push(f[j]);
				}
			}
		}
		MASSGIS.lyr_maf_constrained.removeFeatures(MASSGIS.lyr_maf_constrained.features);
		MASSGIS.lyr_maf_constrained.addFeatures(sortedAddrsByDistance);

		MASSGIS.renderAddressList();
				$('#addr_list > div').scrollTo(0);
	});

	$('#search_query').on("click",function() {
		$('#addr_list').css('display','none');
		$('#addr_query').css('display','block');
		$('#addr_query').height($('#addr_list').height());
		$('#addr_query_res').height($('#addr_list').height() - $('#addr_query_inputs').height() - $('#addr_query header').height());
		$('#clear_addr_query').on("click",function() {
			// Clear the search fields.
			$.each($("#addr_query input"), function(idx, elt) {
				$(elt).val('');
			});

			// Clear the results.
			MASSGIS.addressQueryResults = [];
			$('#addr_query ul').html('');
			$('#addr_query ul').listview('refresh');
		});
		$('#select_all_addr').on("click",function() {
				MASSGIS.showModalMessage('Working...',true);
// Give the loading message a chance to fire.
setTimeout(function() {
			_.each(MASSGIS.addressQueryResults,function(f) {
				var linkedAddr = MASSGIS.linkedAddressLayer.getFeatureByFid(f.fid);
				if (!linkedAddr) {
					var mafAddr = MASSGIS.lyr_maf.getFeatureByFid(f.fid);
					mafAddr.selStatus = 'pre_selected';
					MASSGIS.linkedAddressLayer.addFeatures([mafAddr]);

					var addr_pt = MASSGIS.lyr_address_points.getFeaturesByAttribute("address_point_id",mafAddr.attributes.address_point_id);
					$.each(addr_pt, function(idx, feature) {
						MASSGIS.preSelectionLayer.addFeatures([feature.clone()]);
					});
				}
			});
			MASSGIS.renderLinkedAddresses();
			MASSGIS.preSelectionLayer.redraw();
			MASSGIS.hideModalMessage();
},100);
		});
	});

	$('#search_status').on("click",function() {
		$('#addr_query').css('display','none');
		$('#addr_list').css('display','block');
		MASSGIS.addressListMode = 'status';
		MASSGIS.renderAddressList();
	});

	$('#addr_query').on("change","input", function(evt) {
		var aQueryTerms = [];
		$.each($("#addr_query input"), function(idx, elt) {
			jElt = $(elt);
			if (jElt.val()) {
				aQueryTerms.push({"attr": jElt.attr('id'), "val": jElt.val()});
			}
		});
		if (aQueryTerms.length == 0) {
			return;
		}

		MASSGIS.addressQueryResults = [];
		$.each(MASSGIS.lyr_maf.features, function(idx, feature) {
			var m = true;
			$.each(aQueryTerms, function(idx, term) {
				if (feature.attributes.address_status == 'DELETED') {
					m = false;
					return false;
				}
				if (
					!feature.attributes[term.attr]
					|| (term.attr == 'full_number_standardized' && feature.attributes[term.attr].toUpperCase() != term.val.toUpperCase())
					|| feature.attributes[term.attr].toUpperCase().indexOf(term.val.toUpperCase()) == -1
				) {
					m = false;
					return false;
				}
			});
			m && MASSGIS.addressQueryResults.push(feature);
		});

		//console.log(MASSGIS.addressQueryResults.length + " features found");
		if (MASSGIS.addressQueryResults.length == 0) {
			html = "<li style='color: #903'>No Matching Addresses Found</li>";
		} else {
			var html = $('#addressListTmpl').render(MASSGIS.addressQueryResults);
		}
		$('#addr_query ul').html(html);
		$('#addr_query ul').listview('refresh');
	});

	$('#settings_clear').on("click",function() {
		$('#linked_addrs_buttons #clear_button').trigger('click');

		MASSGIS.showModalMessage('Clearing Data from This Device',true);
		MASSGIS.lyr_address_points.saveDeferred = $.Deferred();
		MASSGIS.lyr_maf.saveDeferred = $.Deferred();

		$.when(MASSGIS.lyr_maf.saveDeferred,
			MASSGIS.lyr_address_points.saveDeferred).then(
				function() {
					MASSGIS.mafDrawOffset = 1;
					MASSGIS.linkAddressSpatial
					MASSGIS.renderAddressList();
					$('#addr_list > div').scrollTo(0);
					MASSGIS.hideModalMessage();
					MASSGIS.init_data = false;
				}
		);

		window.setTimeout( function() {
		if (MASSGIS.lyr_maf && MASSGIS.lyr_maf.features.length > 0) {
			$.each(MASSGIS.lyr_maf.features, function(idx, obj) {
				obj.state = OpenLayers.State.DELETE;
			});
			$('#settings_maf').html('');
			MASSGIS.lyr_maf.strategies[1].save();
			MASSGIS.lyr_maf.removeAllFeatures();
		} else {
			MASSGIS.lyr_maf.saveDeferred.resolve();
		}

		if (MASSGIS.lyr_address_points && MASSGIS.lyr_address_points.features.length > 0) {
			$.each(MASSGIS.lyr_address_points.features, function(idx, obj) {
				obj.state = OpenLayers.State.DELETE;
			});
			$('#settings_addrs').html('');
			MASSGIS.lyr_address_points.strategies[1].save();
			MASSGIS.lyr_address_points.removeAllFeatures();
		} else {
			MASSGIS.lyr_address_points.saveDeferred.resolve();
		}
		MASSGIS.settings_updateUI();
		},200);
	});

	$('#msag_community').on("change",function() {
		$('#settings_syncnow').attr('disabled',false).button('refresh');
	});

	$('#settings_syncnow').on("click",function() {
		if (MASSGIS.lyr_address_points.features.length > 0 || MASSGIS.lyr_maf.features.length > 0) {
			alert('Please clear records before downloading new records.');
			return;
		}
		MASSGIS.showModalMessage('Syncing Address Data from Server',true);
		window.setTimeout(function() {
			var mafDef = MASSGIS.sync_maf();
			var addrDef = MASSGIS.sync_address_points();
			MASSGIS.dataSyncStatus = 'in_process';
			$.when(mafDef, addrDef).done(
					function() {
						MASSGIS.mafDrawOffset = 1;
						MASSGIS.renderAddressList();
						$('#addr_list > div').scrollTo(0);
						MASSGIS.hideModalMessage();
						MASSGIS.init_data = false;
					}
				).fail(
					function() {
						mafDef.abort();
						mafDef.__ABORTED__ = true;
						addrDef.abort();
						addrDef.__ABORTED__ = true;
						MASSGIS.hideModalMessage();
						MASSGIS.init_data = false;
					}
				);
		},0);
	});

	$('#settings_sync_tiles').on("click",function() {
		MASSGIS.fetchTilesIntoDb();
	});

	$('#settings_upload').on("click",function() {

		var isDirty = false;
		$.each(MASSGIS.lyr_maf.features, function(idx, feature) {
			if (feature.attributes.__MODIFIED__) {
				isDirty = true;
				return false;
			}
		});
		!isDirty && $.each(MASSGIS.lyr_address_points.features, function(idx, feature) {
			if (feature.attributes.__MODIFIED__) {
				isDirty = true;
				return false;
			}
		});

		if (!isDirty) {
			alert("There are no changes to submit at this time");
			return;
		}

		$('#linked_addrs_buttons #clear_button').trigger('click');
		if (!MASSGIS.username) {
			$('#save_email_form').on("submit", function() {
				return false;
			});
			$('#login_popup a[data-icon="check"]').on("click",function(e) {
				MASSGIS.username = $('#login_username').val();
				MASSGIS.submit_address_points();
				MASSGIS.submit_maf_records();
			});
			$("#login_popup").popup().popup("open");
		}
		else {
			MASSGIS.submit_address_points();
			MASSGIS.submit_maf_records();
		}
	});

	$('#linked_addrs_buttons #clear_button').on("click",function() {
		MASSGIS.preSelectionLayer.removeAllFeatures();
		MASSGIS.selectionLayer.removeAllFeatures();
		MASSGIS.linkedAddressLayer.removeAllFeatures();
	});

	$('#linked_addrs_buttons #clear_addr_button').on("click",function() {
		MASSGIS.linkedAddressLayer.removeAllFeatures();
	});

	$('#linked_addrs_buttons #undo_button').on("click",function() {
		var nothing_to_undo = false;
		MASSGIS.showModalMessage('Working...',true);
// Give the loading message a chance to fire.
setTimeout(function() {
		if (MASSGIS.undoStack) {
//console.dir(MASSGIS.undoStack);
			if (MASSGIS.undoStack.action == 'click_to_delete') {
				MASSGIS.undoStack.f.attributes.address_point_id = MASSGIS.undoStack.address_point_id;
				MASSGIS.undoStack.f.attributes.edit_status = MASSGIS.undoStack.edit_status;
				MASSGIS.undoStack.f.attributes.status_color = MASSGIS.undoStack.status_color;
				MASSGIS.linkedAddressLayer.addFeatures([MASSGIS.undoStack.f]);

				// There is no more FULL_ADDR, so this doesn't really do anything useful other than
				// return the undo record.  Lucky for us, there is only one.
				var mafFeature = MASSGIS.lyr_maf.getFeaturesByAttribute('master_address_id',MASSGIS.undoStack.f.attributes.master_address_id)[0];
				mafFeature.attributes.edit_status = MASSGIS.undoStack.edit_status;
				mafFeature.state = OpenLayers.State.UPDATE;
				MASSGIS.lyr_maf.strategies[1].save();

				MASSGIS.renderLinkedAddresses();
				MASSGIS.renderAddressList();

				if (MASSGIS.undoStack.address_point) {
					var addrPt = MASSGIS.lyr_address_points.getFeaturesByAttribute("address_point_id",MASSGIS.undoStack.address_point_id)[0];
					addrPt.attributes.address_status = MASSGIS.undoStack.address_point.address_status;
					addrPt.attributes.status_color = MASSGIS.undoStack.address_point.status_color;
					addrPt.state = OpenLayers.State.UPDATE;
					MASSGIS.lyr_address_points.strategies[1].save();
					MASSGIS.lyr_address_points.reindex();
					MASSGIS.lyr_address_points.redraw();
				}
			}
			else if (MASSGIS.undoStack.action == 'delete_address_point') {
				for (var i = 0; i < MASSGIS.undoStack.f.length; i++) {
					var layer = MASSGIS.undoStack.f[i].layer;
					var f = layer.getFeatureByFid(MASSGIS.undoStack.f[i].fid);
					if (f) {
						f.state = OpenLayers.State.DELETE;
					}
					layer.addFeatures([MASSGIS.undoStack.f[i]]);
					MASSGIS.undoStack.f[i].state = OpenLayers.INSERT;
					layer.strategies && layer.strategies[1].save();
					layer.spatialIndex && layer.reindex();
					layer.redraw();
				}
			}
			else if (MASSGIS.undoStack.action == 'ignore_address_point') {

				// first, remove the split-off point (if it exists)
				if (MASSGIS.undoStack.newPoint) {
					MASSGIS.undoStack.newPoint.state = OpenLayers.State.DELETE;
					MASSGIS.lyr_address_points.strategies[1].save();
				}

				// next, delete out all the points that were modified by this operation
				// and re-add the undo-stack version of the point
				for (var i = 0; i < MASSGIS.undoStack.f.length; i++) {
					var layer = MASSGIS.undoStack.f[i].layer;
					var f = layer.getFeatureByFid(MASSGIS.undoStack.f[i].fid);
					if (f) {
						f.state = OpenLayers.State.DELETE;
					}
					layer.addFeatures([MASSGIS.undoStack.f[i]]);
					MASSGIS.undoStack.f[i].state = OpenLayers.State.INSERT;
					layer.strategies && layer.strategies[1].save();
					layer.spatialIndex && layer.reindex();
					layer.redraw();
				}

				// finally, go through each address point id that was modified (nulled, probably)
				// and re-set it back to it's original value
				var addrPtId = MASSGIS.undoStack.f[0].attributes.address_point_id;
				$.each(MASSGIS.undoStack.madRecIds, function(idx, madRec) {
					madRec.attributes.address_point_id = addrPtId;
				});
			}
			else if (MASSGIS.undoStack.action == 'link') {
				// Restore orignal address_point_id's to MAF(s) as well as any hidden ones that were processed.
				var modifiedFeatures = MASSGIS.undoStack.lyr_mafModified;
				for (var i = 0; i < modifiedFeatures.length; i++) {
					var f = MASSGIS.lyr_maf.getFeatureByFid(modifiedFeatures[i].fid);
					$.each(["address_point_id","status_color","address_status","edit_status'"], function(idx, prop) {
						f.attributes[prop] = modifiedFeatures[i].attributes[prop];
					});
					f.state = OpenLayers.State.UPDATE;
				}
				MASSGIS.lyr_maf.strategies[1].save();
				MASSGIS.lyr_maf.reindex();
				MASSGIS.renderAddressList();
				console.log("original address_point_id's restored");

				// Remove the entire MP(s) that may have been split to death.  Then put the original one(s) back in.
				var fidsAdded = {}; // Make sure not to add any MP's more than once.
				for (var i = 0; i < MASSGIS.undoStack.lyr_address_pointsModified.length; i++) {
					var f = MASSGIS.lyr_address_points.getFeatureByFid(MASSGIS.undoStack.lyr_address_pointsModified[i].fid);
					f.state = OpenLayers.State.DELETE;
					MASSGIS.lyr_address_points.strategies[1].save();
					//MASSGIS.lyr_address_points.removeFeatures([f]); // COMMENT
					if (!fidsAdded[MASSGIS.undoStack.lyr_address_pointsModified[i].fid]) {
						MASSGIS.lyr_address_points.addFeatures([MASSGIS.undoStack.lyr_address_pointsModified[i]]);
						MASSGIS.undoStack.lyr_address_pointsModified[i].state = OpenLayers.State.UPDATE;
						fidsAdded[MASSGIS.undoStack.lyr_address_pointsModified[i].fid] = true;
					}
				}
				console.log("original MP's restored");

				// Remove the new MP(s).
				$.each(MASSGIS.undoStack.lyr_address_pointsAdded, function(idx, addedPoint) {
					addedPoint.state = OpenLayers.State.DELETE;
					//MASSGIS.lyr_address_points.removeFeatures(addedPoint); // COMMENT
				});
				console.log("new MP removed");
				MASSGIS.lyr_address_points.strategies[1].save();
				MASSGIS.lyr_address_points.reindex();
				MASSGIS.lyr_address_points.redraw();

				MASSGIS.selectionLayer.removeAllFeatures();
				MASSGIS.selectionLayer.addFeatures(MASSGIS.undoStack.selectionLayer);
				console.log("selectionLayer restored");
				MASSGIS.selectionLayer.redraw();

				MASSGIS.linkedAddressLayer.addFeatures(MASSGIS.undoStack.linkedAddressLayer);
				console.log("linkedAddressLayer restored");
				MASSGIS.renderLinkedAddresses();
			}
			else if (MASSGIS.undoStack.action == 'new_address_point') {
				MASSGIS.lyr_address_points.removeFeatures(MASSGIS.undoStack.f);
				MASSGIS.lyr_address_points.strategies[1].save();
				MASSGIS.lyr_address_points.redraw();
			}
			else {
				nothing_to_undo = true;
			}
		}
		else {
			nothing_to_undo = true;
		}
		MASSGIS.undoStack = {};
			MASSGIS.hideModalMessage();
			if (nothing_to_undo) {
					alert('Nothing to undo!');
			}
		else {
			MASSGIS.map.pan(1,1); // This nudge takes care of Canvas labeling artifacts.
		}
},100);
	});

	$('#linked_addrs_buttons #link_button').on("click",function() {

		var allLinkedAddrsPreSelected = true;
		$.each(MASSGIS.linkedAddressLayer.features, function(idx, feature) {
			if (feature.selStatus == 'selected') {
				allLinkedAddrsPreSelected = false;
				return false;
			}
		});
		if (MASSGIS.preSelectionLayer.features.length == 1 && MASSGIS.selectionLayer.features.length < 1 && allLinkedAddrsPreSelected) {
			// This is the 'orange link'.  If only 1 MP (or point) is preSelected (i.e. orange), and everything
			// in the linked addr list is orange, then link that MP (or point) to everything in the linked addr list
			$.each(MASSGIS.preSelectionLayer.features[0].geometry.components, function(idx, component) {
				var f = MASSGIS.preSelectionLayer.features[0].clone();
				f.geometry.components = [component];
				MASSGIS.selectionLayer.addFeatures([f]);
			});
			MASSGIS.preSelectionLayer.removeAllFeatures();
			$.each(MASSGIS.linkedAddressLayer.features,function(idx,feature){
				feature.selStatus = 'selected';
			});
			MASSGIS.renderLinkedAddresses();
		}

		if (MASSGIS.selectionLayer.features.length < 1) {
			alert('Please select at least one point to link.');
			return;
		}

		var c = 0;
		$.each(MASSGIS.linkedAddressLayer.features,function(idx,linkedAddress) {
			c += linkedAddress.selStatus == 'selected' ? 1 : 0;
		});
		if (c < 1 && $('#linked_addrs_buttons #link_button span span').text() != 'Mark Primary') {
			alert('Please select at least one address to link.');
			return;
		}

		MASSGIS.showModalMessage('Working...',true);
// Give the loading message a chance to fire.
setTimeout(function() {
		MASSGIS.undoStack = {
			 action							: 'link'
			,lyr_address_pointsModified		: []
			,lyr_address_pointsAdded		: []
			,lyr_mafModified				: []
			,selectionLayer					: []
			,linkedAddressLayer				: []
		};

		var txId = MASSGIS.generateTXId();

		// First check for special cases:
		// 1.  Mark Primary Structure
		// 2.  "Orange Link" MP to many addresses

		// check for Marking Primary:
		if ($('#linked_addrs_buttons #link_button span span').text() == 'Mark Primary') {
			// Only one MP is preSelected and one of those points is selected.  Essentially perform an orange link
			// w/ only the one point.  Then go back and mark the newly linked point as primary and the orphaned points
			// as secondary as well as pointing the new orphans to the 'new' parent.
			MASSGIS.undoStack.selectionLayer = MASSGIS.selectionLayer.features;
			var origAddrPtId = MASSGIS.selectionLayer.features[0].attributes.address_point_id;
			var origAddrPt = MASSGIS.lyr_address_points.getFeaturesByAttribute("address_point_id",origAddrPtId)[0];
			if (origAddrPt.geometry.components.length == 1) {
				alert("No need to mark this point as primary, since there's just one part");
				return;
			}

			// first build the new "parent" point
			var newFeature = new OpenLayers.Feature.Vector(MASSGIS.selectionLayer.features[0].geometry.clone());
			$.each(origAddrPt.attributes, function(key, value) {
				newFeature.attributes[key] = origAddrPt.attributes[key];
			});
			newFeature.attributes.status_color = "GREEN";
			newFeature.attributes.geographic_edit_status = "MODIFIED";
			newFeature.attributes.structure_type = "P";
			newFeature.attributes.transaction_id = txId;
			newFeature.attributes.time_stamp = new Date().toTimeString().split(" ")[0];
			newFeature.state = OpenLayers.State.INSERT;
			newFeature.attributes.__MODIFIED__ = true;
			MASSGIS.lyr_address_points.addFeatures([newFeature]);
			MASSGIS.undoStack.lyr_address_pointsAdded.push(newFeature);

			// now edit the "old" point
			var pt = origAddrPt.clone();
			pt.fid = origAddrPt.fid;
			MASSGIS.undoStack.lyr_address_pointsModified.push(pt);
			$.each(origAddrPt.geometry.components,function(idx,origComponent) {
				if (newFeature.geometry.getBounds().equals(origComponent.getBounds())) {
					origAddrPt.geometry.removePoint(origComponent);
					return false;
				}
			});
			//origAddrPt.attributes.status_color = "???";
			origAddrPt.attributes.address_status = "UNLINKED";
			origAddrPt.attributes.geographic_edit_status = "SPLIT";
			origAddrPt.attributes.structure_type = "S";
			origAddrPt.attributes.parent_id = origAddrPtId;
			origAddrPt.attributes.transaction_id = txId;
			origAddrPt.attributes.time_stamp = new Date().toTimeString().split(" ")[0];
			origAddrPt.attributes.__MODIFIED__ = true;
			var centroid = origAddrPt.geometry.getCentroid().clone();
			centroid.transform("EPSG:900913","EPSG:26986");
			origAddrPt.attributes.address_point_id = "M_" + Math.round(centroid.x) + "_" + Math.round(centroid.y);

			origAddrPt.state = OpenLayers.State.UPDATE;

			MASSGIS.lyr_address_points.strategies[1].save();
			MASSGIS.lyr_address_points.reindex();
			MASSGIS.lyr_address_points.redraw();
			MASSGIS.hideModalMessage();

			MASSGIS.selectionLayer.removeAllFeatures();
			MASSGIS.selectionLayer.redraw();

			MASSGIS.undoStack.linkedAddressLayer = MASSGIS.linkedAddressLayer.features;
			MASSGIS.linkedAddressLayer.removeAllFeatures();
			MASSGIS.renderLinkedAddresses();

			return;

		}

		// Next let's figure out whether we're doing a split/merge, or just something simple.  Handle
		// the simple case with simple logic.
		var addrPointComponentCounts = {};
		$.each(MASSGIS.selectionLayer.features,function(idx,selectionPoint) {
			if (!addrPointComponentCounts[selectionPoint.attributes.address_point_id]) {
				addrPointComponentCounts[selectionPoint.attributes.address_point_id] = 1;
			} else {
				addrPointComponentCounts[selectionPoint.attributes.address_point_id]++;
			}
		});
		var uniqueAddrPtIds = $.map(addrPointComponentCounts,function(value, key) {return key;});
		var isMerge = uniqueAddrPtIds.length > 1;

		var isSplit = false;
		$.each(uniqueAddrPtIds,function(idx,addrPtId) {
			var origPoint = MASSGIS.lyr_address_points.getFeaturesByAttribute("address_point_id", addrPtId);
			if (origPoint.length > 1) {
				alert("Error:  Two Points in Address Point Database with address_point_id = " + addrPtId);
				throw {"error": "true", "msg" : "why are there two points in the db with address_point_id = " + addrPtId};
			}
			origPoint = origPoint[0];
			if (origPoint.geometry.components.length > addrPointComponentCounts[addrPtId]) {
				isSplit = true;
				return false;
			}
		});

		if (!isSplit && !isMerge) {
			//Ok, it's a "simple" linkage -- UC#11
			var origAddressPoint = MASSGIS.lyr_address_points.getFeaturesByAttribute("address_point_id", uniqueAddrPtIds[0])[0];
			var f = origAddressPoint.clone();
			f.fid = origAddressPoint.fid;
			MASSGIS.undoStack.lyr_address_pointsModified.push(f);
			origAddressPoint.attributes.status_color = "GREEN";
			origAddressPoint.attributes.address_status = "LINKED";
			origAddressPoint.attributes.transaction_id = txId;
			origAddressPoint.attributes.time_stamp = new Date().toTimeString().split(" ")[0];
			origAddressPoint.state = OpenLayers.State.UPDATE;
			origAddressPoint.attributes.__MODIFIED__ = true;

			// now go through the MAD records and null all records that have this addr point id
			MASSGIS.lyr_maf.reindex();
			var toBeRelabeled = [];
			$.each(MASSGIS.lyr_maf.getFeaturesByAttribute("address_point_id",uniqueAddrPtIds[0]), function(idx, madRec) {
				var f = madRec.clone();
				f.fid = madRec.fid;
				MASSGIS.undoStack.lyr_mafModified.push(f);
				madRec.attributes.status_color = "RED";
				toBeRelabeled.push(madRec.attributes.address_point_id);
				madRec.attributes.address_point_id = '';
				madRec.attributes.address_status = 'UNLINKED';
				madRec.attributes.edit_status = 'MODIFIED';
				madRec.attributes.transaction_id = txId;
				madRec.attributes.time_stamp = new Date().toTimeString().split(" ")[0];
				madRec.attributes.__MODIFIED__ = true;
				madRec.state = OpenLayers.State.UPDATE;
			});
			MASSGIS.lyr_maf.reindex();

			$.each(MASSGIS.linkedAddressLayer.features, function(idx, linkedRec) {
				if (linkedRec.selStatus != 'selected') {
					return;
				}
				var madRec = MASSGIS.lyr_maf.getFeaturesByAttribute("master_address_id",linkedRec.attributes.master_address_id)[0];
				madRec.attributes.address_point_id = origAddressPoint.attributes.address_point_id;
				madRec.attributes.status_color = "GREEN";
				madRec.attributes.address_status = 'LINKED';
				madRec.attributes.edit_status = 'MODIFIED';
				madRec.attributes.transaction_id = txId;
				madRec.attributes.time_stamp = new Date().toTimeString().split(" ")[0];
				madRec.state = OpenLayers.State.UPDATE;
				madRec.attributes.__MODIFIED__ = true;
			});

			MASSGIS.lyr_maf.strategies[1].save();
			MASSGIS.lyr_maf.reindex();
			MASSGIS.renderAddressList();

			origAddressPoint.attributes.label_text = MASSGIS.lyr_address_points.draw_linked_st_num(origAddressPoint);
			MASSGIS.lyr_address_points.strategies[1].save();
			$.each(toBeRelabeled, function(idx, addrPtId) {
				var fs = MASSGIS.lyr_address_points.getFeaturesByAttribute("address_point_id", addrPtId);
				$.each(fs, function(idx, addrPt) {
					addrPt.attributes.label_text = MASSGIS.lyr_address_points.draw_linked_st_num(addrPt);
				});
			});
			MASSGIS.lyr_address_points.reindex();
			MASSGIS.lyr_address_points.redraw();


			var forRemovalLinkedAddresses = [];
			$.each(MASSGIS.linkedAddressLayer.features,function(idx,linkedAddress) {
				if (linkedAddress.selStatus == 'selected') {
					forRemovalLinkedAddresses.push(linkedAddress);
					MASSGIS.undoStack.linkedAddressLayer.push(linkedAddress);
				}
			});
			MASSGIS.linkedAddressLayer.removeFeatures(forRemovalLinkedAddresses);
			MASSGIS.renderLinkedAddresses();

			MASSGIS.undoStack.selectionLayer = MASSGIS.selectionLayer.features;
			MASSGIS.selectionLayer.removeAllFeatures();
			MASSGIS.selectionLayer.redraw();

			MASSGIS.hideModalMessage();
			return;
		}


		var points = [];
		var addrpt_ids = [];
		var deleted = [];
		var toBeRelabeled = [];
		var pointTypes = [];
		// linking points procedure:
		// 1.  Gather each of the single-part MASSGIS.selectionLayer.features points
		//  1b.  As we're gathering them up, delete any identical MP parts from
		//		- MASSGIS.preSelectionLayer.features
		//		- MASSGIS.lyr_address_points.features
		// 2.  Create a new MP feature made up of all the points gathered in 1.
		// 3.  Assign that new MP feature a brand new address_point_id
		// 4.  Copy that address_point_id to all "selected" lyr_maf records
		$.each(MASSGIS.selectionLayer.features,function(idx,selectionPoint) {
			points.push(selectionPoint.geometry.components[0].clone());
			addrpt_ids.push(selectionPoint.attributes.address_point_id);
			pointTypes.push(selectionPoint.attributes.point_type);

			// Get address(es) whose address_point_id matches the selection point.
			$.each(MASSGIS.lyr_address_points.getFeaturesByAttribute("address_point_id",selectionPoint.attributes.address_point_id),function(idx,addressMultiPoint) {
				var addressMultiPointClone = addressMultiPoint.clone();
				addressMultiPointClone.fid = addressMultiPoint.fid;
				addressMultiPointClone.layer = addressMultiPoint.layer;

				// Go through each component of the geom.
				$.each(addressMultiPoint.geometry.components,function(idx,addressPoint) {

					// Check for 'addressPoint' in case this point was already deleted from an earlier iteration.  E.g. 2 points from the same MP.
					if (addressPoint && selectionPoint.geometry.getBounds().equals(addressPoint.getBounds())) {
						if (addressMultiPoint.geometry.components.length == 1) {
							// Nuke the whole thing if the addrMP only has 1 component.
							addressMultiPoint.attributes.status_color = 'NONE';
							addressMultiPoint.attributes.geographic_edit_status = 'DELETED';
							addressMultiPoint.attributes.transaction_id = txId;
							addressMultiPoint.attributes.time_stamp = new Date().toTimeString().split(" ")[0];
							addressMultiPoint.state = OpenLayers.State.UPDATE;
							// Keep track of the deleted points, so we can fix them up later
							deleted.push(addressMultiPoint);
							addressMultiPoint.attributes.__MODIFIED__ = true;
						} else {
							// Nuke the selected point(s).
							addressMultiPoint.geometry.removePoint(addressPoint);
							// Next line is commented out so non-modified components won't have their icon changed.
							toBeRelabeled.push(addressMultiPoint.attributes.address_point_id);
							addressMultiPoint.attributes.geographic_edit_status = 'MODIFIED';
							addressMultiPoint.attributes.address_status = 'SPLIT';
							addressMultiPoint.attributes.transaction_id = txId;
							addressMultiPoint.attributes.time_stamp = new Date().toTimeString().split(" ")[0];
							addressMultiPoint.state = OpenLayers.State.UPDATE;
							addressMultiPoint.attributes.__MODIFIED__ = true;
						}
					}
				});

				if (addressMultiPoint.state == OpenLayers.State.UPDATE) {
					MASSGIS.undoStack.lyr_address_pointsModified.push(addressMultiPointClone);
				}

			});

		});
		MASSGIS.lyr_address_points.strategies[1].save();
		MASSGIS.lyr_address_points.reindex();

		MASSGIS.undoStack.selectionLayer = MASSGIS.selectionLayer.features;
		MASSGIS.selectionLayer.removeAllFeatures();
		MASSGIS.selectionLayer.redraw();

		var bounds = new OpenLayers.Bounds();
		for (var i = 0; i < points.length; i++) {
			bounds.extend(points[i]);
		}
		var centerLonLat = bounds.transform(
			 MASSGIS.map.getProjectionObject()
			,new OpenLayers.Projection('EPSG:26986')
		).getCenterLonLat();
		var address_point_id = 'M_' + Math.round(centerLonLat.lon) + '_' + Math.round(centerLonLat.lat);
		var offset = 0;
		while (addrpt_ids.indexOf(address_point_id) !== -1) {
			offset++;
			address_point_id = 'M_' + Math.round(centerLonLat.lon) + '_' + (Math.round(centerLonLat.lat) + offset);
		}

		pointTypes = $.unique(pointTypes);
		var newPtType = false;
		if (pointTypes.length == 1 && pointTypes[0] == 'ABC') {
			newPtType = 'ABC';
		}
		var origAddressPoint = MASSGIS.lyr_address_points.getFeaturesByAttribute("address_point_id", uniqueAddrPtIds[0])[0];
		var newFeature = new OpenLayers.Feature.Vector(new OpenLayers.Geometry.MultiPoint(points));
		newFeature.attributes.address_point_id		= address_point_id;
		newFeature.attributes.address_status		= 'LINKED';
		newFeature.attributes.geographic_edit_status= 'ADDED';
		newFeature.attributes.status_color			= 'GREEN';
		newFeature.attributes.type_icon				= 'CIRCLE';
		newFeature.attributes.site_id				= origAddressPoint.attributes.site_id;
		newFeature.attributes.community_id			= origAddressPoint.attributes.community_id;
		newFeature.attributes.loc_id				= origAddressPoint.attributes.loc_id;
		newFeature.attributes.geographic_town_id	= origAddressPoint.attributes.geographic_town_id;
		newFeature.attributes.transaction_id = txId;
		newFeature.attributes.time_stamp = new Date().toTimeString().split(" ")[0];
		newPtType && (newFeature.attributes.point_type = newPtType);
		newFeature.state = OpenLayers.State.INSERT;
		newFeature.attributes.__MODIFIED__ = true;

		// Null out the original address point id on any delete points address_point_id maf records
		$.each(deleted, function(idx, deletedPoint) {
			$.each(MASSGIS.lyr_maf.getFeaturesByAttribute("address_point_id",deletedPoint.attributes.address_point_id), function(idx, madRec) {
				var f = madRec.clone();
				f.fid = madRec.fid;
				MASSGIS.undoStack.lyr_mafModified.push(f);
				madRec.attributes.address_point_id = null;
				madRec.attributes.status_color = "RED";
				madRec.attributes.address_status = "UNLINKED";
				madRec.attributes.transaction_id = txId;
				madRec.attributes.time_stamp = new Date().toTimeString().split(" ")[0];
				madRec.state = OpenLayers.State.UPDATE;
				madRec.attributes.__MODIFIED__ = true;
			});
		});

		var forRemovalLinkedAddresses = [];
		$.each(MASSGIS.linkedAddressLayer.features,function(idx,linkedAddress) {
			if (linkedAddress.selStatus == 'selected') {
				var f = MASSGIS.lyr_maf.getFeatureByFid(linkedAddress.fid);
				var fClone = f.clone();
				fClone.fid = f.fid;
				MASSGIS.undoStack.lyr_mafModified.push(fClone);
				f.attributes.address_point_id	= address_point_id;
				f.attributes.address_status		= 'LINKED';
				f.attributes.status_color		= 'GREEN';
				f.attributes.transaction_id		= txId;
				f.attributes.time_stamp			= new Date().toTimeString().split(" ")[0];
				f.state							= OpenLayers.State.UPDATE;
				f.attributes.__MODIFIED__		= true;
				forRemovalLinkedAddresses.push(linkedAddress);
				var f = linkedAddress.clone();
				f.fid = linkedAddress.fid;
				MASSGIS.undoStack.linkedAddressLayer.push(f);

			}
		});
		MASSGIS.linkedAddressLayer.removeFeatures(forRemovalLinkedAddresses);
		MASSGIS.renderLinkedAddresses();

		// now that our maf points are linked, update the label_text accordingly
		newFeature.attributes.label_text= MASSGIS.lyr_address_points.draw_linked_st_num(newFeature);
		MASSGIS.lyr_address_points.addFeatures([newFeature]);
		MASSGIS.undoStack.lyr_address_pointsAdded.push(newFeature);

		$.each(toBeRelabeled, function(idx, addrPtId) {
			var fs = MASSGIS.lyr_address_points.getFeaturesByAttribute("address_point_id", addrPtId);
			$.each(fs, function(idx, addrPt) {
				addrPt.attributes.label_text = MASSGIS.lyr_address_points.draw_linked_st_num(addrPt);
			});
		});
		MASSGIS.lyr_address_points.strategies[1].save();
		MASSGIS.lyr_address_points.reindex()
		MASSGIS.lyr_maf.strategies[1].save();;
		MASSGIS.lyr_maf.reindex();

		MASSGIS.lyr_address_points.redraw();
		MASSGIS.map.pan(1,1); // This nudge takes care of Canvas labeling artifacts.
		MASSGIS.hideModalMessage();
},100);
	});

	$('#addr_list > div').on('scroll', function() {
		if ($(this).scrollTop() === 0) {
			MASSGIS.mafDrawOffset = Math.max(1, MASSGIS.mafDrawOffset - 1);
			MASSGIS.renderAddressList();
			if (MASSGIS.mafDrawOffset === 1) {
				$('#addr_list > div').scrollTo(0);
			} else {
				$('#addr_list > div').scrollTo('50%');
			}
		}
		if ($(this).scrollTop() + $(this).innerHeight() >= $(this)[0].scrollHeight - 1) {
			MASSGIS.mafDrawOffset = Math.min(MASSGIS.mafDrawOffset + 1, Math.ceil(MASSGIS.lyr_maf.features.length / MASSGIS.mafDrawMultiple));
			MASSGIS.renderAddressList();
			if (MASSGIS.mafDrawOffset === Math.ceil(MASSGIS.lyr_maf.features.length / MASSGIS.mafDrawMultiple)) {
				$('#addr_list > div').scrollTo('100%');
			} else {
				$('#addr_list > div').scrollTo('50%');
			}
		}
	});

	$('#linked_addrs').on("click",".ui-btn-inner",function(e) {
		// this is the "button text".  Why it doesn't trigger the actual button totally beats me.  Manually force it there.
		$(this).parent().find('div[data-role="button"]').click();
	});

	$('#linked_addrs').on("click",'div[data-action="click_to_delete"]',function(e) {
		e.stopPropagation();
		var that = this;
		$('#confirm_address_delete_popup').popup().popup("open");
		$('#confirm_address_delete_popup a[data-icon=back]').on("click",function(e) {
			e.stopPropagation();
			$('#confirm_address_delete_popup a[data-icon=delete]').off("click");
			$('#confirm_address_delete_popup a[data-icon=back]').off("click");

			$('#confirm_address_delete_popup').popup().popup("close");
		});

		$('#confirm_address_delete_popup a[data-icon=delete]').on("click",function(e) {
			e.stopPropagation();
			$('#confirm_address_delete_popup a[data-icon=delete]').off("click");
			$('#confirm_address_delete_popup a[data-icon=back]').off("click");

			// remove from linked addrs
			var f = MASSGIS.linkedAddressLayer.getFeatureByFid($(that).data('fid'));
			MASSGIS.linkedAddressLayer.removeFeatures([f]);

			// remove address_point_id reference from MAF
			MASSGIS.undoStack = {
				"action"			: 'click_to_delete',
				"address_point_id"	: f.attributes.address_point_id,
				"edit_status"		: f.attributes.edit_status,
				"status_color"		: f.attributes.status_color
			};


			var txId = MASSGIS.generateTXId();

			// get the lyr_maf version of this feature
			if (f.attributes.master_address_id == 0) {
				// this isn't a point that the server even knows about yet.  No need to retain it going forward
				f = MASSGIS.lyr_maf.getFeatureByFid(f.fid);
				f.state = OpenLayers.State.DELETE;
				MASSGIS.undoStack.f = f;
			} else {
				f = MASSGIS.lyr_maf.getFeaturesByAttribute('master_address_id',f.attributes.master_address_id)[0];
				MASSGIS.undoStack.f = f;
				//edit_status changes
				//f.attributes.edit_status = 'DELETED';
				f.attributes.address_status = 'DELETED';
				// leave a "null" address_point_id as null, but tack "_D" onto any legit addrptids
				f.attributes.address_point_id = f.attributes.address_point_id ? f.attributes.address_point_id + "_D" : f.attributes.address_point_id;
				f.attributes.status_color = 'NONE';
				f.attributes.transaction_id = txId;
				f.attributes.time_stamp = new Date().toTimeString().split(" ")[0];
				f.state = OpenLayers.State.UPDATE;
				f.attributes.__MODIFIED__ = true;
			}

			MASSGIS.renderLinkedAddresses();
			MASSGIS.renderAddressList();
			MASSGIS.lyr_maf.strategies[1].save();
			MASSGIS.lyr_maf.reindex();

			if (!f.attributes.address_point_id) {
				return;
			}

			// we also need to mark a potentially affected address point as red, if it were orphaned
			addrPts = MASSGIS.lyr_address_points.getFeaturesByAttribute('address_point_id',MASSGIS.undoStack.address_point_id);
			if (addrPts.length > 0) {
				siblingMadRecs = MASSGIS.lyr_maf.getFeaturesByAttribute('address_point_id',MASSGIS.undoStack.address_point_id);
				if (siblingMadRecs.length === 0) {
					MASSGIS.undoStack.address_point = {
						"status_color" :	addrPts[0].attributes.status_color,
						"address_status" :	addrPts[0].attributes.address_status
					};
					addrPts[0].state = OpenLayers.State.UPDATE;
					addrPts[0].attributes.__MODIFIED__ = true;
					addrPts[0].attributes.status_color = "RED";
					addrPts[0].attributes.address_status = "UNLINKED";
					addrPts[0].attributes.label_text = MASSGIS.lyr_address_points.draw_linked_st_num(addrPts[0]);
					addrPts[0].attributes.transaction_id = txId;
					addrPts[0].attributes.time_stamp = new Date().toTimeString().split(" ")[0];
					MASSGIS.lyr_address_points.strategies[1].save();
					MASSGIS.lyr_address_points.reindex();
					MASSGIS.lyr_address_points.redraw();
				}
			}
		});
	});

	$('#linked_addrs_buttons #add_addr_button').on("click", function() {
		// add to MAF
		if (MASSGIS.lyr_maf.features.length === 0) {
			alert("please download data in your target community before adding an address");
			return;
		}
		var f = MASSGIS.lyr_maf.getFeatureByFid(MASSGIS.lyr_maf.features[0].fid).clone();
		f.state = OpenLayers.State.INSERT;
		f.attributes.address_point_id = '';
		f.attributes.address_status = 'ADDED';
		f.attributes.building_name = null;
		f.attributes.full_number_standardized = '';
		f.attributes.last_edit_by = null;
		f.attributes.last_edit_comments = null;
		f.attributes.last_edit_date = null;
		f.attributes.master_address_id = 'NEW-' + Math.random();
		f.attributes.multt_id = null;
		f.attributes.parent_address_id = null;
		f.attributes.rel_loc = null;
		f.attributes.site_id = null;
		f.attributes.site_name = null;
		f.attributes.status_color = 'RED';
		f.attributes.street_name = '';
		f.attributes.street_name_id = null;
		f.attributes.subsite = null;
		f.attributes.unit = null;
		f.attributes.address_class = null;
		//edit_status changes
		//f.attributes.address_status = 'UNASSIGNED';
		//f.attributes.edit_status = 'ADDED';
		f.attributes.transaction_id = MASSGIS.generateTXId();
		f.attributes.time_stamp = new Date().toTimeString().split(" ")[0];
		f.attributes.__MODIFIED__ = true;
		delete f.fid;
		MASSGIS.lyr_maf.addFeatures([f]);
		MASSGIS.lyr_maf.strategies[1].save();

		// add to linked addrs
		MASSGIS.linkedAddressLayer.addFeatures([f]);
		window.setTimeout(function() {
			MASSGIS.renderLinkedAddresses();
			MASSGIS.renderAddressList();
			MASSGIS.new_address_fid = f.fid;
			$('#linked_addrs div[data-action="click_to_edit"][data-fid=' + f.fid + ']').click();
		}, 100);

		MASSGIS.undoStack = {};
	});
	$('#linked_addrs').on("click",'div[data-action="click_to_copy"]',function(e) {
		e.stopPropagation();
		// add to MAF
		var f = MASSGIS.lyr_maf.getFeatureByFid($(this).data('fid')).clone();
		f.state = OpenLayers.State.INSERT;
		f.attributes.address_point_id = '';
		//f.attributes.master_address_id = 0;
		f.attributes.master_address_id = 'NEW-' + Math.random();
		f.attributes.status_color = 'RED';
		//edit_status changes
		//f.attributes.address_status = 'UNASSIGNED';
		//f.attributes.edit_status = 'ADDED';
		f.attributes.address_status = 'ADDED';
		f.attributes.transaction_id = MASSGIS.generateTXId();
		f.attributes.time_stamp = new Date().toTimeString().split(" ")[0];
		f.attributes.__MODIFIED__ = true;
		delete f.fid;
		MASSGIS.lyr_maf.addFeatures([f]);
		MASSGIS.lyr_maf.strategies[1].save();

		// add to linked addrs
		MASSGIS.linkedAddressLayer.addFeatures([f]);
		window.setTimeout(function() {
			MASSGIS.renderLinkedAddresses();
			MASSGIS.renderAddressList();
		}, 100);

		MASSGIS.undoStack = {};
	});

	$('#edit_popup a[data-icon="delete"]').on("click",function(e) {
		if (MASSGIS.new_address_fid) {
			var f = MASSGIS.linkedAddressLayer.getFeatureByFid(MASSGIS.new_address_fid);
			MASSGIS.linkedAddressLayer.removeFeatures([f]);

			var f = MASSGIS.lyr_maf.getFeatureByFid(MASSGIS.new_address_fid);
			if (f) {
				f.state = OpenLayers.State.DELETE;
				MASSGIS.lyr_maf.strategies[1].save();
			}
		}
	});

	$('#edit_popup a[data-icon="check"]').on("click",function(e) {
		// validation, need to enter a street name and number
		if ($('#edit_street_name').val() == '') {
			alert('please enter a street name');
			return false;
		}
		if ($('#edit_full_number_standardized').val() == '') {
			alert('please enter an address number');
			return false;
		}

		if (MASSGIS.new_address_fid) {
			MASSGIS.new_address_fid = null;
		}
		var f = MASSGIS.linkedAddressLayer.getFeatureByFid($('#edit_popup').data('fid'));
		var origSiteName = f.attributes.site_name;
		var newSiteName = $('#edit_site_name').val();
		if (origSiteName && origSiteName != newSiteName) {
			var changeOthers = confirm("You have updated the site name of this address.  By changing this site name, you will update this site name for EVERY ADDRESS with this site name.  Are you sure you wish to continue?  Click 'ok' to make this change for ALL ADDRESSES with this site name, or 'cancel' to cancel this change.");
			if (!changeOthers) {
				return;
			}
		}
		$.each(f.attributes, function(attr, value) {
			$('#edit_' + attr).length > 0 && (f.attributes[attr] = $('#edit_' + attr).val());
		});

		// Special case for address_class (Residential?)
		f.attributes.address_class = $('#edit_address_class').prop('checked') ? 'RES' : null;

//		edit_status changes
//		if (!f.attributes.edit_status || f.attributes.edit_status != "ADDED") {
//			f.attributes.edit_status = 'MODIFIED';
//		}
		if (!f.attributes.address_status || f.attributes.address_status != "ADDED") {
			f.attributes.address_status = 'MODIFIED';
		}
//		if (f.attributes.address_point_id) {
//			f.attributes.status_color = 'GREEN';
//		}
		if (!MASSGIS.streets_to_street_id_hash[f.attributes.street_name]) {
			//brand new street.  Give it a street_name_id of zero
			f.attributes.street_name_id = 0;
		} else if (f.attributes.street_name_id != MASSGIS.streets_to_street_id_hash[f.attributes.street_name]) {
			f.attributes.street_name_id = MASSGIS.streets_to_street_id_hash[f.attributes.street_name];
		}

		var txId = MASSGIS.generateTXId();
		var timestamp = new Date().toTimeString().split(" ")[0];

		// per dan's/mike's email on 9/25
		if (!origSiteName && !newSiteName) {
			// no changes to site_name_id, site_id or site_name
		} else if (origSiteName && !newSiteName) {
			// they blanked out the site name, so we'll do case C.
			f.attributes.site_name = '';

			if (f.attributes.site_id) {
				var others = MASSGIS.lyr_maf.getFeaturesByAttribute("site_id", f.attributes.site_id);
				if (others.length !== 0) {
					$.each(others, function(idx, feature) {
						feature.attributes.site_name = f.attributes.site_name;
						feature.attributes.site_name_id = newSiteNameId;
						if (feature.attributes.address_status != 'DELETED') {
							feature.attributes.address_status = 'MODIFIED';
						}
						feature.attributes.transaction_id = txId;
						feature.attributes.time_stamp = timestamp;
						feature.state = OpenLayers.State.UPDATE;
						feature.attributes.__MODIFIED__ = true;
					});
				}
			}

			var others = MASSGIS.lyr_maf.getFeaturesByAttribute("site_name", origSiteName);
			if (others.length !== 0) {
				$.each(others, function(idx, feature) {
					feature.attributes.site_name = f.attributes.site_name;
					feature.attributes.site_name_id = newSiteNameId;
					if (feature.attributes.address_status != 'DELETED') {
						feature.attributes.address_status = 'MODIFIED';
					}
					feature.attributes.transaction_id = txId;
					feature.attributes.time_stamp = timestamp;
					feature.state = OpenLayers.State.UPDATE;
					feature.attributes.__MODIFIED__ = true;
				});
			}

		} else if (origSiteName != f.attributes.site_name && newSiteName) {
			// This is both cases B and D
			// 1. - site_name_id is set to the existing site_name_id for the newSiteName, or else zero
			var newSiteNameId;
			if (origSiteName) {
				newSiteNameId = MASSGIS.sites_to_site_name_id_hash[newSiteName] || false;
			} else {
				newSiteNameId = MASSGIS.sites_to_site_name_id_hash[newSiteName] || 0;
			}
			newSiteNameId !== false && (f.attributes.site_name_id = newSiteNameId);

			// this is a legit site, so go and find all the matching site_ids in the maf table and update them
			if (f.attributes.site_id) {
				var others = MASSGIS.lyr_maf.getFeaturesByAttribute("site_id", f.attributes.site_id);
				if (others.length !== 0) {
					$.each(others, function(idx, feature) {
						feature.attributes.site_name = f.attributes.site_name;
						newSiteNameId !== false && (feature.attributes.site_name_id = newSiteNameId);
						if (feature.attributes.address_status != 'DELETED') {
							feature.attributes.address_status = 'MODIFIED';
						}
						feature.attributes.transaction_id = txId;
						feature.attributes.time_stamp = timestamp;
						feature.state = OpenLayers.State.UPDATE;
						feature.attributes.__MODIFIED__ = true;
					});
				}
			}

			if (origSiteName) {
				var others = MASSGIS.lyr_maf.getFeaturesByAttribute("site_name", origSiteName);
				if (others.length !== 0) {
					$.each(others, function(idx, feature) {
						feature.attributes.site_name = f.attributes.site_name;
						newSiteNameId !== false && (feature.attributes.site_name_id = newSiteNameId);
						if (feature.attributes.address_status != 'DELETED') {
							feature.attributes.address_status = 'MODIFIED';
						}
						feature.attributes.transaction_id = txId;
						feature.attributes.time_stamp = timestamp;
						feature.state = OpenLayers.State.UPDATE;
						feature.attributes.__MODIFIED__ = true;
					});
				}
			}

			if (f.attributes.site_id === null) {
				// If the user edits site_name for an address record where site_id is null, populate that site_name to all records with the same address_point_id.
				var others = MASSGIS.lyr_maf.getFeaturesByAttribute("address_point_id",f.attributes.address_point_id);
				$.each(others, function(idx, feature) {
					feature.attributes.site_name = f.attributes.site_name;
					newSiteNameId !== false && (feature.attributes.site_name_id = newSiteNameId);
					if (feature.attributes.address_status != 'DELETED') {
						feature.attributes.address_status = 'MODIFIED';
					}
					feature.attributes.transaction_id = txId;
					feature.attributes.time_stamp = timestamp;
					feature.state = OpenLayers.State.UPDATE;
					feature.attributes.__MODIFIED__ = true;
				});
			}

			// if (f.attributes.site_id === null && newSiteName !== '') {
			// 	// no site_id set,
			// 	if (MASSGIS.sites_to_site_id_hash[f.attributes.site_name]) {
			// 		// if they picked an existing site_name, update the site_id accordingly
			// 		f.attributes.site_id = MASSGIS.sites_to_site_id_hash[f.attributes.site_name];
			// 	} else {
			// 		// commented on purpose
			// 		//f.attributes.site_id = 0;
			// 	}
			// }
		}

		f.attributes.transaction_id = txId;
		f.attributes.time_stamp = timestamp;
		f.state = OpenLayers.State.UPDATE;
		f.attributes.__MODIFIED__ = true;
		MASSGIS.lyr_maf.strategies[1].save();

		MASSGIS.buildAddressAutocompletes();
		MASSGIS.renderLinkedAddresses();
		MASSGIS.renderAddressList();
	});
	$('#edit_popup input').on('keypress', function(evt) {
		// Trigger a save when a user presses ENTER.
		if (evt.which == 13) {
			$('#edit_popup a[data-icon="check"]').click();
		}
	});
	$('#linked_addrs').on("click",'div[data-action="click_to_hide"]',function(e) {
		var f = MASSGIS.linkedAddressLayer.getFeatureByFid($(this).data('fid'));
		MASSGIS.linkedAddressLayer.removeFeatures([f]);
	});
	$('#linked_addrs').on("click",'div[data-action="click_to_edit"]',function(e) {
		e.stopPropagation();
		var f = MASSGIS.linkedAddressLayer.getFeatureByFid($(this).data('fid'));
		$.each(f.attributes, function(attr, value) {
			$('#edit_' + attr) && $('#edit_' + attr).val(value);
		});

		// Special case for address_class (Residential?)
		$('#edit_address_class')
			.prop('checked', f.attributes.address_class == 'RES')
			.checkboxradio('refresh');

		// set up the autocomplete on the popup
		$('#edit_street_name').autocomplete({
			source: MASSGIS.streets_list
		});

		$('#edit_site_name').autocomplete({
			source: MASSGIS.sites_list
		});
		$("#edit_popup").data("fid",$(this).data('fid'));
		if (f.attributes.address_status == "GEOCODED" || f.attributes.address_status == "UNASSIGNED") {
			$('#edit_site_name').attr("readonly",true);
		} else {
			$('#edit_site_name').attr("readonly",false);
		}
		$("#edit_popup").popup().popup("open");
	});

	$('#linked_addrs').on("click",".full_addr",function(e) {
//		if (e.target !== this) {
//			return;
//		}
		var oMAFRec = MASSGIS.linkedAddressLayer.getFeatureById($(this).data('id'));
		if (!oMAFRec) {
			// this gets triggered spurriously when we click on the four "action" buttons
			return;
		}
		(!oMAFRec.selStatus || oMAFRec.selStatus == 'pre_selected') ? (oMAFRec.selStatus = 'selected') : (oMAFRec.selStatus = 'pre_selected');
		//MASSGIS.checkMarkPrimary();
		MASSGIS.renderLinkedAddresses();
	});

	$('#addr_list ul,#addr_query ul').on("click","li",function(e) {
		//MASSGIS.checkMarkPrimary();
		MASSGIS.map.setLayerZIndex(MASSGIS.preSelectionLayer, 6);
		MASSGIS.map.setLayerZIndex(MASSGIS.selectionLayer, 12);

		var linkedAddr = MASSGIS.linkedAddressLayer.getFeatureByFid($(this).data('fid'));
		if (linkedAddr) {
			alert('This address already appears in the linked addresses list.');
		} else {
			var mafAddr = MASSGIS.lyr_maf.getFeatureByFid($(this).data('fid'));
			mafAddr.selStatus = 'pre_selected';
			MASSGIS.linkedAddressLayer.addFeatures([mafAddr]);

			// also get the other addresses linked to this same address_point_id
			if (!mafAddr.attributes.address_point_id) {
console.log("no address_point_id on this maf record");
				return;
			}

			var otherMafAddrs = MASSGIS.lyr_maf.getFeaturesByAttribute("address_point_id",mafAddr.attributes.address_point_id);
			var cleanOtherMafAddrs = [];
			$.each(otherMafAddrs, function(idx, madRec) {
				if (madRec.fid == $(this).data('fid')) {
					return;
				}
				if (MASSGIS.linkedAddressLayer.getFeatureByFid(madRec.fid)) {
					return;
				}
				cleanOtherMafAddrs.push(madRec);
			});
			MASSGIS.linkedAddressLayer.addFeatures(cleanOtherMafAddrs);
			MASSGIS.renderLinkedAddresses();

			var zoomToAddr = true;
			if (MASSGIS.selectionLayer.features.length > 0 || MASSGIS.preSelectionLayer.features.length > 0) {
				zoomToAddr = false;
			}

console.log("searching for addrs with address point id " + mafAddr.attributes.address_point_id);
			var addr_pt = MASSGIS.lyr_address_points.getFeaturesByAttribute("address_point_id",mafAddr.attributes.address_point_id);
			$.each(addr_pt, function(idx, feature) {
				feature.attributes.point_type !== 'GC' && feature.attributes.geographic_edit_status !== 'DELETED' && MASSGIS.preSelectionLayer.addFeatures([feature.clone()]);
			});
			MASSGIS.preSelectionLayer.redraw();

			zoomToAddr && addr_pt.length > 0 && addr_pt[0].geometry.getBounds() && MASSGIS.map.zoomToExtent(addr_pt[0].geometry.getBounds());
		}
	});
};

MASSGIS.sort_maf_features_by_street = function(obj1, obj2) {
  var s1_num = obj1.attributes.full_number_standardized.match(/^\d*/)[0];
  var s1_xtra = '';
  if (s1_num != '') {
	s1_xtra = obj1.attributes.full_number_standardized.slice(s1_num.length);
	s1_num = s1_num * 1 + 1000000;
  }
  var s1 = obj1.attributes.street_name + s1_num + s1_xtra + obj1.attributes.unit + obj1.attributes.building_name;

  var s2_num = obj2.attributes.full_number_standardized.match(/^\d*/)[0];
  var s2_xtra = '';
  if (s2_num != '') {
	s2_xtra = obj2.attributes.full_number_standardized.slice(s2_num.length);
	s2_num = s2_num * 1 + 1000000;
  }
  var s2 = obj2.attributes.street_name + s2_num + s2_xtra + obj2.attributes.unit + obj2.attributes.building_name;

  return s1 > s2 ? 1 : s1 < s2 ? -1 : 0;
};

MASSGIS.init_datastores = function() {

	MASSGIS.showModalMessage('Loading Stored Data (This may take a minute)','true');
	MASSGIS.mafLoadDeferred = $.Deferred();
	MASSGIS.addrptLoadDeferred = $.Deferred();
	$.when(MASSGIS.mafLoadDeferred, MASSGIS.addrptLoadDeferred).then(
		function() {
			MASSGIS.hideModalMessage();
			MASSGIS.init_data = true;
			MASSGIS.init_mapExtent();
			if (MASSGIS.lyr_maf.features.length == 0) {
				$.mobile.showPageLoadingMsg('b','No addresses have been synced to this device.  Click on the Settings icon and download MSAG Community records.','true');
			}
		}
	);
	if (!MASSGIS.lyr_maf) {
		MASSGIS.lyr_maf = new OpenLayers.Layer.IndexedVector("Master Address File", {
			strategies: [ new OpenLayers.Strategy.Fixed(), new OpenLayers.Strategy.Save({auto: false}) ],
			eventListeners: {
				featureremoved: function(obj) {
					MASSGIS.settings_updateUI();
				},
				featureadded: function(obj) {
					//obj.feature.attributes.street_name = obj.feature.attributes.street_name_id + "";
					MASSGIS.settings_updateUI();
					delete obj.feature.data;
					obj.feature.data = obj.feature.attributes;
				},
				"loadstart":function() {
					console.log("started loading master address file");
				},
				"loadend": function() {
					console.log("finished loading master address file");
					MASSGIS.mafLoadDeferred.resolve();
					MASSGIS.lyr_maf.features = MASSGIS.lyr_maf.features.sort(MASSGIS.sort_maf_features_by_street);
					MASSGIS.renderAddressList();
					MASSGIS.buildAddressAutocompletes();
				}
			},
			indexes: {"address_point_id":{}},
			projection: MASSGIS.map.getProjection(),
			protocol: new OpenLayers.Protocol.SQL.WebSQL({databaseName: 'mgis_addrs', tableName: 'maf', initialSize: 1*1024*1024})
			,maxResolution : .001 // never draw this layer
		});
		MASSGIS.lyr_maf.strategies[1].events.on({
			"success": function() {
				MASSGIS.lyr_maf.features = MASSGIS.lyr_maf.features.sort(MASSGIS.sort_maf_features_by_street);
				MASSGIS.lyr_maf.saveDeferred.resolve();
			}
		});
		MASSGIS.map.addLayer(MASSGIS.lyr_maf);
		MASSGIS.lyr_maf.saveDeferred = $.Deferred();

		MASSGIS.lyr_maf_constrained = new OpenLayers.Layer.IndexedVector("Master Address File constrained by proximity or query");
	} else {
		window.setTimeout( function() {
			MASSGIS.lyr_maf.strategies[0].load();
		}, 200);
	}

	var style = new OpenLayers.Style(
		// the first argument is a base symbolizer
		// all other symbolizers in rules will extend this one
		{
			//"label" : "${ST_NUM}",
			//"label" : "${get_linked_st_num}",
			"label" : "${get_label}",
			"labelAlign" : "lm",
			"labelXOffset" : 0,
			"labelYOffset" : -10,
			"fontColor" : "#333",
			"labelOutlineColor" : "#fff",
			"labelOutlineWidth" : 5,
			"labelOutlineOpacity" : 0.7,
			"pointRadius" : 13,
			"externalGraphic" : "img/${status_color}_${type_icon}.PNG",
			"display" : "${get_display}"
		},
		// the second argument will include all rules
		{
			context: {
				get_label: function(f) {
					return f.attributes.label_text === null ? "" : f.attributes.label_text;
				},
				get_display : function(f) {
					return (f.attributes.status_color == 'NONE' || f.attributes.type_icon == 'NONE') ? 'none' : 'visible';
				}
			},
			rules: [
			]
		}
	);

	if (!MASSGIS.lyr_address_points) {
		MASSGIS.lyr_address_points = new OpenLayers.Layer.SpatialIndexedVector("Address Points", {
			strategies: [ new OpenLayers.Strategy.Fixed() , new OpenLayers.Strategy.Save({auto: false}) ]
			,eventListeners: {
				"featureremoved": function(obj) {
					MASSGIS.settings_updateUI();
				},
				"featureadded": function(obj) {
	//				if (obj.feature.attributes) {
	//					obj.feature.attributes['linked_st_num'] = MASSGIS.lyr_address_points.draw_linked_st_num;
	//				}
					MASSGIS.settings_updateUI();
				},
				"loadstart" : function() {
					console.log("start loading address points");
				},
				"loadend": function() {
					console.log("finished loading address points");
					MASSGIS.addrptLoadDeferred.resolve();
				}
			}
			,projection: "EPSG:900913"
			,protocol: new OpenLayers.Protocol.SQL.WebSQL({databaseName: 'mgis_addrs', tableName: 'address_points', initialSize: 1*1024*1024})
			,styleMap: new OpenLayers.StyleMap(style)
			,renderers: ['Canvas']
			,maxResolution : 2
			,draw_linked_st_num : function(f, p) {
				var features = MASSGIS.lyr_maf.getFeaturesByAttribute("address_point_id",f.attributes.address_point_id);
				if (features.length > 0) {
					var f = _.sortBy(features,function(f){return 1000000 + f.attributes.full_number_standardized * 1});
					var n = _.uniq(_.map(f,function(val,key){return val.attributes.full_number_standardized}));
					if (n.length == 1) {
						return n[0];
					}
					else {
						return n[0] + '-' + n[n.length - 1];
					}
				} else {
					return "";
				}
			}
			,indexes: {"address_point_id": {}}
			,spatialIndex: new RTree()
		});

		MASSGIS.lyr_address_points.strategies[1].events.on({
			"success": function() {
				MASSGIS.lyr_address_points.saveDeferred.resolve();
			}
		});

		MASSGIS.map.addLayer(MASSGIS.lyr_address_points);

		MASSGIS.lyr_address_points.saveDeferred = $.Deferred();
	} else {
		window.setTimeout( function() {
			MASSGIS.lyr_address_points.strategies[0].load();
		},200);
	}

	MASSGIS.settings_updateUI();
};

MASSGIS.addrptsWriter = new OpenLayers.Format.WFST.v1_0_0({
	"featureNS" : "http://massgis.state.ma.us/featuretype",
	//"featureNS" : "http://www.mapsonline.net/peopleforms",
	"featurePrefix" : "massgis",
	"featureType" : "MAD.MAD_ADDRESS_POINTM_CHANGES",
	"geometryName" : "shape"
});

MASSGIS.mafWriter = new OpenLayers.Format.WFST.v1_0_0({
	"featureNS" : "http://massgis.state.ma.us/featuretype",
	//"featureNS" : "http://www.mapsonline.net/peopleforms",
	"featurePrefix" : "massgis",
	"featureType" : "MAD.MAD_MASTER_ADDRESS_CHANGES",
	"geometryName" : "shape"
});

MASSGIS.wfstFilterGenerator = function(feature, options) {
	return new OpenLayers.Filter.Comparison(
		{
			type: OpenLayers.Filter.Comparison.EQUAL_TO,
			property:"address_point_id",
			value: feature.attributes.address_point_id
		}
	);
};

MASSGIS.check_recs_to_submit = function() {
	var mafSubmit = [];
	var edit_date = '';
	$.each(MASSGIS.lyr_maf.features, function(idx, feature) {
		if (feature.attributes.__MODIFIED__) {
			// insert the a/d/m records
			var f = feature.clone();
			f.state = OpenLayers.State.INSERT;
			if (f.attributes.address_status == 'DELETED') {
				f.attributes.address_point_id = f.attributes.address_point_id ? f.attributes.address_point_id.replace("_D","") : null;
			}
			f.attributes.last_edit_by = MASSGIS.username;
			f.attributes.last_edit_date = edit_date;

			delete f.attributes.__MODIFIED__;
			delete f.attributes.bbox;
			mafSubmit.push(f);
		}
	});

	var addrSubmit = [];
	$.each(MASSGIS.lyr_address_points.features, function(idx, feature) {
		if (feature.attributes.__MODIFIED__) {
			// insert the a/d/m records
			var f = feature.clone();
			f.state = OpenLayers.State.INSERT;
			f.attributes.last_edit_by = MASSGIS.username;
			f.attributes.last_edit_date = edit_date;

			delete f.attributes.__MODIFIED__;
			delete f.attributes.bbox;
			addrSubmit.push(f);
		}
	});

	console.log("MAF submissions", mafSubmit);
	console.log("ADDR_PT submissions", addrSubmit);
;}

MASSGIS.submit_maf_records = function() {
	//build a list of our modified lyr_maf data
	var d = new Date();
	var edit_date = d.getFullYear() + ("0" + (d.getMonth() + 1)).slice(-2) + ("0" + d.getDate()).slice(-2);
	mafSubmitFeatures = [];
	var bSaveChanges = false;
	$.each(MASSGIS.lyr_maf.features, function(idx, feature) {
		if (feature.attributes.__MODIFIED__) {
			if (!feature.attributes.ma_chng_uid) {
				//feature.attributes.ma_chng_uid = "ma_chng_uid_" + MASSGIS.generateTXId();
				feature.attributes.ma_chng_uid = feature.attributes.transaction_id + "_" + MASSGIS.generateTXId();
				feature.state = OpenLayers.State.UPDATE;
				bSaveChanges = true;
			}
			// insert the a/d/m records
			var f = feature.clone();
			f.state = OpenLayers.State.INSERT;
			if (f.attributes.address_status == 'DELETED') {
				f.attributes.address_point_id = f.attributes.address_point_id ? f.attributes.address_point_id.replace("_D","") : null;
			}
			if (("" + f.attributes.master_address_id).indexOf('NEW-') !== -1) {
				f.attributes.master_address_id = 0;
			}
			f.attributes.last_edit_by = MASSGIS.username;
			f.attributes.last_edit_date = edit_date;

			delete f.attributes.__MODIFIED__;
			delete f.attributes.bbox;
			mafSubmitFeatures.push(f);
		}
	});

	if (bSaveChanges) {
		MASSGIS.lyr_maf.strategies[1].save();
	}

	if (mafSubmitFeatures.length === 0) {
		return false;
	}


	var maf_wfstTransactionStr = MASSGIS.mafWriter.write(mafSubmitFeatures, { 'filterGenerator' : MASSGIS.wfstFilterGenerator });
	console.log(maf_wfstTransactionStr);

	MASSGIS.showModalMessage('Syncing Address Data to Server',true);
	var errorCount = 0;
	var sendUpdates = function() {
		if (errorCount > 5) {
			alert('After trying 5 times, the server was unable to accept your Master Address List updates.  Please contact Sienna Svob at sienna.svob@state.ma.us or (617) 388-5723.');
			MASSGIS.hideModalMessage();
			return;
		}
		$.ajax({
			type: "post",
			url: MASSGIS.proxy,
			//url: "/fdc/dummy_response.php",
			contentType: "text/xml",
			data: maf_wfstTransactionStr,
			dataType: "xml",
			processData: false,
			success: function( response ) {
				console.log(response);
				if (!response || response.getElementsByTagName("SUCCESS").length == 0) {
					// failed, wait and try again?
					$.mobile.showPageLoadingMsg('b','ArcSDE failure syncing address data.  Trying again.',true);
					errorCount++;
					//window.setTimeout(sendUpdates, 2500);
					MASSGIS.hideModalMessage();
					return;
				} else {
					MASSGIS.hideModalMessage();
					$.each(MASSGIS.lyr_maf.features, function(idx, feature) {
						if (feature.attributes.__MODIFIED__) {
							// clean up this record
							delete feature.attributes.__MODIFIED__;
							delete feature.attributes.ma_chng_uid;
							feature.state = OpenLayers.State.UPDATE;
						}
					});
					MASSGIS.lyr_maf.strategies[1].save();
				}
				// should we clear the data off of the unit now?
				//$('#settings_clear').click();
			},
			error: function () {
				$.mobile.showPageLoadingMsg('b','Server failure syncing address data (Try # ' + (errorCount + 1) + ').  Trying again.',true);
				errorCount++;
				//window.setTimeout(sendUpdates, 2500);
			}
		});
	};
	sendUpdates();

};

MASSGIS.webMerc = new OpenLayers.Projection("EPSG:900913");
MASSGIS.statePlane = new OpenLayers.Projection("EPSG:26986");
MASSGIS.submit_address_points = function() {
	//build a list of our modified lyr_address_points data
	var d = new Date();
	var edit_date = d.getFullYear() + ("0" + (d.getMonth() + 1)).slice(-2) + ("0" + d.getDate()).slice(-2);
	addrSubmitFeatures = [];
	var bSaveChanges = false;
	$.each(MASSGIS.lyr_address_points.features, function(idx, feature) {
		if (feature.attributes.__MODIFIED__) {
			if (!feature.attributes.ap_chng_uid) {
				//feature.attributes.ap_chng_uid = "ap_chng_uid_" + MASSGIS.generateTXId();
				feature.attributes.ap_chng_uid = feature.attributes.transaction_id + "_" + MASSGIS.generateTXId();
				feature.state = OpenLayers.State.UPDATE;
				bSaveChanges = true;
			}
		}
		if (feature.attributes.__MODIFIED__) {
			// insert the a/d/m records
			var f = feature.clone();

			f.geometry.transform(MASSGIS.webMerc, MASSGIS.statePlane);
			f.attributes.last_edit_by = MASSGIS.username;
			f.attributes.last_edit_date = edit_date;
			f.state = OpenLayers.State.INSERT;

			delete f.attributes.__MODIFIED__;
			delete f.attributes.bbox;
			addrSubmitFeatures.push(f);
		}
	});

	if (bSaveChanges) {
		MASSGIS.lyr_address_points.strategies[1].save();
	}

	if (addrSubmitFeatures.length === 0) {
		return;
	}

	var addr_wfstTransactionStr = MASSGIS.addrptsWriter.write(addrSubmitFeatures, { 'filterGenerator' : MASSGIS.wfstFilterGenerator });
	console.log(addr_wfstTransactionStr);

	MASSGIS.showModalMessage('Syncing Address Data to Server',true);
	var errorCount = 0;
	var sendUpdates = function() {
		if (errorCount > 5) {
			alert('After trying 5 times, the server was unable to accept your Address Point updates.  Please contact Sienna Svob at sienna.svob@state.ma.us or (617) 388-5723.');
			MASSGIS.hideModalMessage();
			return;
		}
		$.ajax({
			type: "post",
			url: MASSGIS.proxy,
			//url: "/fdc/dummy_response.php",
			contentType: "text/xml",
			data: addr_wfstTransactionStr,
			dataType: "xml",
			processData: false,
			success: function( response ) {
				console.log(response);
				if (!response || response.getElementsByTagName("SUCCESS").length == 0) {
					// failed, wait and try again?
					$.mobile.showPageLoadingMsg('b','ArcSDE failure syncing address data.  Trying again.',true);
					errorCount++;
					//window.setTimeout(sendUpdates, 2500);
					alert('Please update spreadsheet with submission time and wait to clear cache until cell turns green. If you have questions email Michael.Mulqueen@mass.gov');
					MASSGIS.hideModalMessage();
					return;
				} else {
					$.each(MASSGIS.lyr_address_points.features, function(idx, feature) {
						if (feature.attributes.__MODIFIED__) {
							// clean up this record
							delete feature.attributes.__MODIFIED__;
							delete feature.attributes.ap_chng_uid;
							feature.state = OpenLayers.State.UPDATE;
						}
					});
					MASSGIS.lyr_address_points.strategies[1].save();
					MASSGIS.hideModalMessage();
				}
				// should we clear the data off of the unit now?
				//$('#settings_clear').click();
			},
			error: function () {
				$.mobile.showPageLoadingMsg('b','Server failure syncing address data (Try # ' + (errorCount + 1) + ').  Trying again.',true);
				errorCount++;
				//window.setTimeout(sendUpdates, 2500);
			}
		});
	};
	sendUpdates();
};

MASSGIS.sync_address_points_fail_count = 0;
MASSGIS.sync_address_points = function() {
	$('#linked_addrs_buttons #clear_button').trigger('click');

	//load all data from WFS on server, store into WebSQL vector database
	return $.jsonp(
		{
			//url: "http://www.mapsonline.net/geoserver-2.1.1/wfs",
			//url: 'https://wsgw.mass.gov/geoserver/wfs',
		        //url: 'http://10.202.25.161:8080/geoserver/wfs',
		        url: 'https://gis-prod.digital.mass.gov/geoserver/wfs',
			//url: 'http://10.202.26.28/geoserver/wfs',
			data: {
				"request" : "getfeature",
				//"typename" : "massgis:massgis_rockportma_address_pointm",
				"typename": 'massgis:MAD.MAD_ADDRESS_POINTM',
				//"outputformat" : "json",
				"outputformat" : "text/javascript",
				"service" : "WFS",
				"version" : "1.0.0",
				"cql_filter" : "community_id = '" + $('#msag_community').val() + "'",
				"srsName" : "EPSG:900913"
			},
			callback: "_jqjsp_" + Math.round(Math.random() * 1000000),
			beforeSend: function( settings) {
				settings.data.callback = null;
				settings.data.format_options="CALLBACK:" + settings.callback;
			},
			success: function(data, xhr, statusText) {
				if (MASSGIS.dataSyncStatus == "failed") {
					console.log("abandoning address point data-load response");
					return;
				}
				if (data.features[0].id.indexOf("MAD.MAD_ADDRESS_POINTM") === -1) {
					console.log("mis-routed jsonp response");
					this.error();
					return;
				}
				var reader = new OpenLayers.Format.GeoJSON();
				var features = [];
				$.each(data.features, function(idx, obj) {
					var feature = reader.read(obj)[0];
					feature.state = OpenLayers.State.INSERT;
					delete feature.data;
					features.push(feature);
				});

				MASSGIS.lyr_address_points.addFeatures(features);
				MASSGIS.settings_updateUI();
				MASSGIS.lyr_address_points.strategies[1].save();
			},
			"error": function() {
				MASSGIS.dataSyncStatus = "failed";
				console.log("failed to load address points");
				alert("there was an error loading the address points for this area.  Please click the 'Clear Records from This Device' button, and re-download the records in this community");
			}
		}
	);

};

MASSGIS.sync_maf = function() {

	//load all data from WFS on server, store into WebSQL vector database
	return $.jsonp(
		{
			//url: "http://www.mapsonline.net/geoserver-2.1.1/wfs",
			//url: "https://wsgw.mass.gov/geoserver/wfs",
			//url: "http://10.202.25.161:8080/geoserver/wfs",
			url: "https://gis-prod.digital.mass.gov/geoserver/wfs",
                        //url: "http://10.202.26.28/geoserver/wfs",
			dataType: "jsonp",
			data: {
				"request" : "getfeature",
				//"typename" : "massgis:massgis_rockportma_maf_d",
				//"typename" : "massgis:MAD.MAD_MASTER_ADDRESS_STNAME_VIEW",
				"typename" : "massgis:MAD.MADV_MASTER_ADDRESS_STNAME",
				//"outputformat" : "json",
				"outputformat" : "text/javascript",
				"service" : "WFS",
				"cql_filter" : "community_id = '" + $('#msag_community').val() + "'",
				"version" : "1.0.0",
				"srsName" : "EPSG:900913"
			},
			callback: "_jqjsp_" + Math.round(Math.random() * 1000000),
			beforeSend: function(settings) {
				settings.data.callback = null;
				settings.data.format_options="CALLBACK:" + settings.callback;
			},
			"success" : function(data, xhr, statusText) {
				if (MASSGIS.dataSyncStatus == "failed") {
					console.log("abandoning maf data-load response");
					return;
				}
				if (data.features[0].id.indexOf("MAD.MADV_MASTER_ADDRESS_STNAME") === -1) {
					console.log("mis-routed jsonp response");
					this.error();
					return;
				}
				var reader = new OpenLayers.Format.GeoJSON();
				var features = [];
				$.each(data.features, function(idx, obj) {
					var feature = reader.read(obj)[0];
					feature.state = OpenLayers.State.INSERT;
					delete feature.data;
					features.push(feature);
				});

				MASSGIS.lyr_maf.addFeatures(features);
				MASSGIS.settings_updateUI();
				MASSGIS.lyr_maf.strategies[1].save();
				MASSGIS.lyr_maf.features = MASSGIS.lyr_maf.features.sort(MASSGIS.sort_maf_features_by_street);
			},
			"error" : function() {
				MASSGIS.dataSyncStatus = "failed";
				console.log("failed to load MAF records");
				alert("there was an error downloading the address records for this area.  Please click the 'Clear Records from This Device' button, and re-download the records in this community");
			}
		}
	);

};

MASSGIS.settings_updateUI = function() {
	// fix this to reflect changes to OpenLayers.STATE of each feature in the layers
	$('#settings_maf').html(MASSGIS.lyr_maf.features.length);
	$('#settings_addrs').html(MASSGIS.lyr_address_points.features.length);
};

MASSGIS.renderLinkedAddresses = function() {
	var addrs = [];
	var addrPtIds = [];

	addrs = MASSGIS.linkedAddressLayer.features;

	$.each(addrs, function(idx, addr) {
		addr['backgroundColor'] = (!addr['selStatus'] || addr['selStatus'] == 'pre_selected') ? '#eb0' : '#ee0';
	});
	html = $('#linkedAddressesTmpl').render(_.uniq(addrs.sort(MASSGIS.sort_maf_features_by_street)));
	$('#linked_addrs ul').html(html);
	$('#linked_addrs ul > li > span').controlgroup({mini: true, shadow: true, type: "horizontal", corners: true});
	$('#linked_addrs ul').listview('refresh');
	$('#linked_addrs ul > li > span div div').button();
};

MASSGIS.mafDrawOffset = 1;
MASSGIS.mafDrawMultiple = 35;
MASSGIS.buildAddressAutocompletes = function() {
	MASSGIS.streets_to_street_id_hash = {};
	MASSGIS.sites_to_site_id_hash = {};
	MASSGIS.sites_to_site_name_id_hash = {};

	$.each(MASSGIS.lyr_maf.features, function(idx, feature) {
		if (feature.attributes.street_name_id !== null && feature.attributes.street_name) {
			if (!MASSGIS.streets_to_street_id_hash[feature.attributes.street_name]) {
				MASSGIS.streets_to_street_id_hash[feature.attributes.street_name] = feature.attributes.street_name_id;
			}
		}

		if (feature.attributes.site_name) {
			if (!MASSGIS.sites_to_site_id_hash[feature.attributes.site_name]) {
				MASSGIS.sites_to_site_id_hash[feature.attributes.site_name] = feature.attributes.site_id;
			}
			if (!MASSGIS.sites_to_site_name_id_hash[feature.attributes.site_name]) {
				MASSGIS.sites_to_site_name_id_hash[feature.attributes.site_name] = feature.attributes.site_name_id;
			}
		}
	});
	MASSGIS.streets_list = Object.keys(MASSGIS.streets_to_street_id_hash);

	// $.each(MASSGIS.lyr_maf.features, function(idx, feature) {
	// 	if (feature.attributes.site_id !== null && feature.attributes.site_name) {
	// 		if (!MASSGIS.sites_to_site_id_hash[feature.attributes.site_name]) {
	// 			MASSGIS.sites_to_site_id_hash[feature.attributes.site_name] = feature.attributes.site_id;
	// 		}
	// 	}
	// });
	MASSGIS.sites_list = Object.keys(MASSGIS.sites_to_site_id_hash);
};

MASSGIS.renderAddressList = function() {
	var featuresToList = /street|status/.test(MASSGIS.addressListMode)
		? MASSGIS.lyr_maf.features.sort(MASSGIS.sort_maf_features_by_street)
		: MASSGIS.lyr_maf_constrained.features;
	var mafDrawAddrList = [];

	if (MASSGIS.addressListMode == 'status') {
		featuresToList = _.filter(featuresToList,function(o){return o.attributes.status_color == 'RED'});
	}

	//MASSGIS.lyr_maf.features = MASSGIS.lyr_maf.features.sort(MASSGIS.sort_maf_features_by_street);
	for (var i = Math.max(0,(MASSGIS.mafDrawOffset - 2)) * MASSGIS.mafDrawMultiple; i < Math.min(featuresToList.length, MASSGIS.mafDrawMultiple * MASSGIS.mafDrawOffset); i++) {
		if (
				(featuresToList[i].attributes.address_status && featuresToList[i].attributes.address_status == 'DELETED') ||
				(featuresToList[i].state && featuresToList[i].state == OpenLayers.State.DELETE)
			)
		{
			continue;
		}
		mafDrawAddrList.push(featuresToList[i]);
	}
	html = $('#addressListTmpl').render(mafDrawAddrList);
	$('#addr_list ul').html(html);
	$('#addr_list ul').listview('refresh');

	$('#street_name').trigger("change");
};

MASSGIS.loadAndCacheAGSLayer = function(opts) {
	var ret = $.Deferred();
	if (window.localStorage.getItem("ags_config_" + opts.url)) {
		data = JSON.parse(window.localStorage.getItem("ags_config_" + opts.url));
		opts.deferred = ret;
		MASSGIS.loadAndCacheAGSLayerResponse(data,opts);
		return ret;
	}

	$.jsonp(
		{
			url: opts.url,
			data: {
				f: "json"
			},
			callbackParameter: "callback",
			callback: "fn_" + Math.round(10000 * Math.random(),10)
		}
	).done(function(data) {
		opts.deferred = ret;
		MASSGIS.loadAndCacheAGSLayerResponse(data,opts);
	});

	return ret;
}

MASSGIS.loadAndCacheAGSLayerResponse = function(data,opts) {
	var layerInfo = data;
	window.localStorage.setItem("ags_config_" + opts.url,JSON.stringify(layerInfo));
	var layerMaxExtent = new OpenLayers.Bounds(
		layerInfo.fullExtent.xmin,
		layerInfo.fullExtent.ymin,
		layerInfo.fullExtent.xmax,
		layerInfo.fullExtent.ymax
	);

	var resolutions = [];
	for (var i=0; i<layerInfo.tileInfo.lods.length; i++) {
		resolutions.push(layerInfo.tileInfo.lods[i].resolution);
	}

	// MASSGIS[opts.layerId] = new OpenLayers.Layer.ArcGISCache(opts.layerName, layerInfo.tileServers,
	// {
	// 	isBaseLayer: opts.isBaseLayer,
	// 	resolutions: resolutions,
	// 	tileSize: new OpenLayers.Size(layerInfo.tileInfo.cols, layerInfo.tileInfo.rows),
	// 	tileOrigin: new OpenLayers.LonLat(layerInfo.tileInfo.origin.x , layerInfo.tileInfo.origin.y),
	// 	maxExtent: layerMaxExtent,
	// 	//projection: 'EPSG:' + layerInfo.spatialReference.wkid,
	// 	projection: 'EPSG:900913',
	// 	visibility: false,
	// 	tileOptions: {
	// 		crossOriginKeyword: "anonymous"
	// 	},
	// 	eventListeners: {
	// 		tileloaded: function(evt) {
	// 			if (evt && evt.tile.url.substr(0, 5) === "data:") {
	// 				//console.log('cache hit on old orthos basemap');
	// 			}
	// 			else {
	// 				//console.log('cache miss on old orthos basemap');
	// 			}
	// 		}
	// 	}
	// });
	var customRes = MASSGIS.osmLayer.resolutions.slice(0).splice(0,20); // MassGIS layers are tiled through level 19, but osm only gives resolutions to level 18
	opts.numZoomLevels && opts.numZoomLevels > 19 && customRes.push(0.2); // this gives the extra resolution level we need
	MASSGIS[opts.layerId] = new OpenLayers.Layer.ArcGISCache( opts.layerName, [opts.url], {
		isBaseLayer: opts.isBaseLayer,
		resolutions: customRes,
		numZoomLevels : opts.numZoomLevels || 19,
		tileSize: new OpenLayers.Size(256, 256),
		tileOrigin: new OpenLayers.LonLat(layerInfo.tileInfo.origin.x , layerInfo.tileInfo.origin.y),
		projection: 'EPSG:900913',
		tileOptions: {
			crossOriginKeyword: "anonymous"
		},
		visibility: false
		// eventListeners: {
		// 	tileloaded: function(evt) {
		// 		if (evt && evt.tile.url.substr(0, 5) === "data:") {
		// 			//console.log('cache hit on old orthos basemap');
		// 		}
		// 		else {
		// 			//console.log('cache miss on old orthos basemap');
		// 		}
		// 	}
		// }
	});
	MASSGIS.map.addLayer(MASSGIS[opts.layerId]);
	opts.deferred.resolve();
}


MASSGIS.init_map = function() {

	MASSGIS.map = new OpenLayers.Map(
		'map' ,
		{
			"controls": [
				new OpenLayers.Control.TouchNavigation(),
				new OpenLayers.Control.Navigation()
			],
			"projection" : "EPSG:900913"
		}
	);

	MASSGIS.osmLayer = new OpenLayers.Layer.OSM("OpenStreetMap", null, {
		numZoomLevels: 20,
		eventListeners: {
			tileloaded: function(evt) {
				if (evt && evt.tile.url.substr(0, 5) === "data:") {
					//console.log('cache hit on osm');
				}
				else {
					//console.log('cache miss on osm');
				}
			}
		}
	});
	MASSGIS.map.addLayer(MASSGIS.osmLayer);


	//http://tiles.arcgis.com/tiles/hGdibHYSPO59RG1h/arcgis/rest/services/MassGISBasemap_Topo_Detailed_L3/MapServer
	var topoLoaded = MASSGIS.loadAndCacheAGSLayer(
		{
			"layerId" : "topoBasemap",
			"layerName" : "Topo Basemap",
			"url" : "https://tiles.arcgis.com/tiles/hGdibHYSPO59RG1h/arcgis/rest/services/MassGISBasemap_Topo_Detailed_L3/MapServer",
			"isBaseLayer" : true
		});
	topoLoaded.done(function() {
		MASSGIS.map.removeLayer(MASSGIS.osmLayer);
		MASSGIS.map.setBaseLayer(MASSGIS.topoBasemap);

	});


	var msagLoaded = MASSGIS.loadAndCacheAGSLayer(
		{
			"layerId" : "msagOverlay",
			"layerName" : "MassGIS MSAG Overlay",
			"url" : "https://tiles.arcgis.com/tiles/hGdibHYSPO59RG1h/arcgis/rest/services/MSAG_Communities/MapServer",
			"isBaseLayer" : false
		});
	msagLoaded.done(function() {
		MASSGIS.msagOverlay.setVisibility(false);
		MASSGIS.map.events.on({
			"changebaselayer": function() {
				if (MASSGIS.map.baseLayer == MASSGIS.mgisOrthosStatewideLayer2014 || MASSGIS.map.baseLayer == MASSGIS.mgisOrthosStatewideLayer2015) {
					if (MASSGIS.map.getZoom() <= 12) {
						MASSGIS.msagOverlay.setVisibility(false);
					} else {
						MASSGIS.msagOverlay.setVisibility(true);
					}
					MASSGIS.map.baseLayer.setZIndex(6);
					MASSGIS.msagOverlay.setZIndex(10);
				} else {
					MASSGIS.msagOverlay.setVisibility(false);
				}
			},
			"zoomend" : function() {
				if (MASSGIS.map.baseLayer == MASSGIS.mgisOrthosStatewideLayer2014 || MASSGIS.map.baseLayer == MASSGIS.mgisOrthosStatewideLayer2015) {
					if (MASSGIS.map.getZoom() <= 12) {
						MASSGIS.msagOverlay.setVisibility(false);
					} else {
						MASSGIS.map.baseLayer.setZIndex(6);
						MASSGIS.msagOverlay.setVisibility(true);
					}
				}
			}
		});
	});

	var streetsLoaded = MASSGIS.loadAndCacheAGSLayer(
		{
			"layerId" : "streetsOverlay",
			"layerName" : "MassGIS Streets Overlay",
			//"url" : "http://gisprpxy.itd.state.ma.us/arcgisserver/rest/services/Basemaps/Base_Streets_with_Labels/MapServer",
			//"url" : "https://tiles.arcgis.com/tiles/hGdibHYSPO59RG1h/arcgis/rest/services/StreetsBasemap2/MapServer",
			"url" : "https://tiles.arcgis.com/tiles/hGdibHYSPO59RG1h/arcgis/rest/services/Base_Streets_with_Labels/MapServer",
			"isBaseLayer" : false,
			"numZoomLevels" : 20
		});
	streetsLoaded.done(function() {
		MASSGIS.streetsOverlay.setVisibility(false);
		MASSGIS.map.events.on({
			"changebaselayer": function() {
				if (MASSGIS.map.baseLayer == MASSGIS.mgisOrthosStatewideLayer2014 || MASSGIS.map.baseLayer == MASSGIS.mgisOrthosStatewideLayer2015) {
					if (MASSGIS.map.getZoom() <= 12) {
						MASSGIS.streetsOverlay.setVisibility(false);
					} else {
						MASSGIS.streetsOverlay.setVisibility(true);
					}
					MASSGIS.streetsOverlay.setZIndex(10);
				} else {
					MASSGIS.streetsOverlay.setVisibility(false);
				}
			},
			"zoomend" : function() {
				if (MASSGIS.map.baseLayer == MASSGIS.mgisOrthosStatewideLayer2014 || MASSGIS.map.baseLayer == MASSGIS.mgisOrthosStatewideLayer2015) {
					if (MASSGIS.map.getZoom() <= 12) {
						MASSGIS.streetsOverlay.setVisibility(false);
					} else {
						MASSGIS.streetsOverlay.setVisibility(true);
					}
				}
			}
		});
	});

	var statewideOrthosLoaded2014 = MASSGIS.loadAndCacheAGSLayer(
		{
			"layerId" : "mgisOrthosStatewideLayer2014",
			"layerName" : "MassGIS Statewide BaseMap",
			//"url" : "http://gisprpxy.itd.state.ma.us/arcgisserver/rest/services/Basemaps/Orthos_DigitalGlobe2011_2012/MapServer",
			//"url" : "https://tiles.arcgis.com/tiles/hGdibHYSPO59RG1h/arcgis/rest/services/DigitalGlobe_2011_2012/MapServer",
			"url" : "https://tiles.arcgis.com/tiles/hGdibHYSPO59RG1h/arcgis/rest/services/USGS_Orthos_2013_2014/MapServer",
			"isBaseLayer" : true
		});
	statewideOrthosLoaded2014.done(function() {
		MASSGIS.mgisOrthosStatewideLayer2014.setZIndex(6);
	});
	var wmts = {
		"Google 2014-2015 Orthoimagery": {
			"layer": "imagery",
			"matrix_ids": [
				"0to20:00",
				"0to20:01",
				"0to20:02",
				"0to20:03",
				"0to20:04",
				"0to20:05",
				"0to20:06",
				"0to20:07",
				"0to20:08",
				"0to20:09",
				"0to20:10",
				"0to20:11",
				"0to20:12",
				"0to20:13",
				"0to20:14",
				"0to20:15",
				"0to20:16",
				"0to20:17",
				"0to20:18",
				"0to20:19",
				"0to20:20"
			],
			"matrix_set": "0to20",
			"title": "Google_2014_2015_WMTS",
			"url": "https://orthos.massgis.state.ma.us/login/path/major-madam-cricket-caviar/wmts?"
		}
	};
	MASSGIS.mgisOrthosStatewideLayer2015 = new OpenLayers.Layer.WMTS({
		name:        'Google 2014-2015 Orthoimagery'
		,url:         wmts['Google 2014-2015 Orthoimagery'].url
		,layer:       wmts['Google 2014-2015 Orthoimagery'].layer
		,matrixSet:   wmts['Google 2014-2015 Orthoimagery'].matrix_set
		,matrixIds:   wmts['Google 2014-2015 Orthoimagery'].matrix_ids
		,format:      'image/png'
		,style:       '_null'
		,attribution: ''
		,projection:  'EPSG:900913'
		,numZoomLevels: wmts['Google 2014-2015 Orthoimagery'].matrix_ids.length
	});
	MASSGIS.map.addLayer(MASSGIS.mgisOrthosStatewideLayer2015);
	MASSGIS.mgisOrthosStatewideLayer2015.setZIndex(6);

	MASSGIS.blankBaseLayer = new OpenLayers.Layer.WMS("Blank",
		'img/white.png',
		{},
		{
			isBaseLayer : true,
			maxScale : 100,
			minScale : 5000000,
			projection : "EPSG:900913",
			units : 'm'
		}
	);
	MASSGIS.map.addLayer(MASSGIS.blankBaseLayer);

	$.when(msagLoaded,streetsLoaded).then(function() {
		MASSGIS.tilesDB = openDatabase('offline_tiles', '1.0', 'MassGIS Offline Tile Storage', 20 * 1024 * 1024);
		MASSGIS.tilesDB.transaction(function(tx) {
			tx.executeSql('CREATE TABLE IF NOT EXISTS tiles (url text unique, datauri text)');
		});
		var cacheRead = new OpenLayers.Control.CacheRead({
			autoActivate : true,
			layers : [MASSGIS.osmLayer,MASSGIS.mgisOrthosStatewideLayer2014,MASSGIS.mgisOrthosStatewideLayer2015,MASSGIS.streetsOverlay]
			,fetch: function(evt) {
				if (this.active && window.localStorage && evt.tile instanceof OpenLayers.Tile.Image) {
					var tile = evt.tile,
					url = tile.url;
					// deal with modified tile urls when both CacheWrite and CacheRead
					// are active
					if (!tile.layer.crossOriginKeyword && OpenLayers.ProxyHost && url.indexOf(OpenLayers.ProxyHost) === 0) {
						url = OpenLayers.Control.CacheWrite.urlMap[url];
					}
					var dataURI = window.localStorage.getItem("olCache_" + url);
					MASSGIS.tilesDB.transaction(function (tx) {
						tx.executeSql('SELECT * FROM tiles where url = ?', ["olCache_" + url], function (tx, results) {
							if (results.rows.length > 0) {
								//console.log("cache hit for tile " + url);
								tile.url = results.rows.item(0).url;
								if (evt.type === "tileerror") {
									//tile.setImgSrc(results.rows.item(0).datauri);
								}
							} else {
								//console.log("cache miss for tile " + url);
							}
						});
					});
//					if (dataURI) {
//						console.log("cache hit for tile " + url);
//						tile.url = dataURI;
//						if (evt.type === "tileerror") {
//							tile.setImgSrc(dataURI);
//						}
//					} else {
//						//console.log("cache miss for tile " + url);
//					}
				}
			}
		});
		//MASSGIS.map.addControl(cacheRead);

		MASSGIS.cacheWrite = new OpenLayers.Control.CacheWrite({
			autoActivate: true,
			imageFormat: "image/png",
			eventListeners: {
				cachefull: function() {
					console.log("Cache full!");
				}
			},
			cache: function(obj) {
				if (this.active && window.localStorage) {
					var tile = obj.tile;
					if (tile instanceof OpenLayers.Tile.Image &&
						tile.url.substr(0, 5) !== 'data:') {
						try {
							var canvasContext = tile.getCanvasContext();
							if (canvasContext) {
								var urlMap = OpenLayers.Control.CacheWrite.urlMap;
								var url = urlMap[tile.url] || tile.url;
/*
								window.localStorage.setItem(
									"olCache_" + url,
									canvasContext.canvas.toDataURL(this.imageFormat)
								);
*/
								MASSGIS.tilesDB.transaction(function (tx) {
									tx.executeSql('INSERT INTO tiles (url, datauri) VALUES (?,?)', ["olCache_" + url, canvasContext.canvas.toDataURL(this.imageFormat)]);
								});
								delete urlMap[tile.url];
//console.log("cached tile " + tile.url);
							}
						} catch(e) {
							// local storage full or CORS violation
							var reason = e.name || e.message;
							if (reason && this.quotaRegEx.test(reason)) {
								this.events.triggerEvent("cachefull", {tile: tile});
							} else {
								OpenLayers.Console.error(e.toString());
							}
						}
					}
				}
			}
		});
		//MASSGIS.map.addControl(MASSGIS.cacheWrite);
	});

	// Could be implemented much cheaper as a straight-up object/list
	MASSGIS.linkedAddressLayer = new OpenLayers.Layer.Vector("Linked Address Layer", {
		projection: "EPSG:900913",
		style: {
		},
		eventListeners: {
			featuresremoved: function(obj) {
				MASSGIS.renderLinkedAddresses();
			},
			featuresadded: function(obj) {
				MASSGIS.renderLinkedAddresses();
			}
		},
		renderers: ['Canvas']
	});
	MASSGIS.map.addLayer(MASSGIS.linkedAddressLayer);

	MASSGIS.preSelectionLayer = new OpenLayers.Layer.SpatialIndexedVector("Pre-Selection Layer", {
		projection: "EPSG:900913",
		style: {
			"pointRadius": 25,
			"fillColor": '#da0',
			"fillOpacity": .8
		},
		eventListeners: {
			featuresremoved: function(obj) {
				//MASSGIS.renderLinkedAddresses();
			},
			featuresadded: function(obj) {
				//MASSGIS.checkMarkPrimary();
				$.each(obj.features, function(idx, feature) {
					if (MASSGIS.linkedAddressLayer.getFeaturesByAttribute("address_point_id",feature.attributes.address_point_id).length > 0) {
						return;
					} else {
						var features = MASSGIS.lyr_maf.getFeaturesByAttribute("address_point_id",feature.attributes.address_point_id);
						$.each(features, function(idx, feature) {
							feature.selStatus = 'pre_selected';
						});
						MASSGIS.linkedAddressLayer.addFeatures(features);
					}
				});
				MASSGIS.renderLinkedAddresses();
			}
		},
		renderers: ['Canvas']
	});
	MASSGIS.map.addLayer(MASSGIS.preSelectionLayer);

	MASSGIS.checkMarkPrimary = function() {
		if (MASSGIS.preSelectionLayer.features.length == 1 && MASSGIS.selectionLayer.features.length == 1 && (MASSGIS.lyr_address_points.getFeaturesByAttribute("address_point_id",MASSGIS.selectionLayer.features[0].attributes.address_point_id)[0]).geometry.components.length > 1) {
			var isMarkPrimary = true;
			$.each(MASSGIS.linkedAddressLayer.features, function(idx, laRec) {
				if (laRec.selStatus == 'selected') {
					isMarkPrimary = false;
					return false;
				}
			});
			isMarkPrimary && $('#linked_addrs_buttons #link_button span span').text('Mark Primary');
			!isMarkPrimary && $('#linked_addrs_buttons #link_button span span').text('Link');
		}
		else {
			$('#linked_addrs_buttons #link_button span span').text('Link');
		}
	};
	MASSGIS.selectionLayer = new OpenLayers.Layer.SpatialIndexedVector("Selection Layer", {
		projection: "EPSG:900913",
		style: {
			"pointRadius": 25,
			"fillColor": '#ee0',
			"fillOpacity": .8
		},
		eventListeners: {
			featuresremoved: function(obj) {
				//MASSGIS.checkMarkPrimary();
				MASSGIS.renderLinkedAddresses();
			},
			featuresadded: function(obj) {
				//MASSGIS.checkMarkPrimary();
				MASSGIS.renderLinkedAddresses();
			}
		},
		renderers: ['Canvas']
	});
	MASSGIS.map.addLayer(MASSGIS.selectionLayer);

	MASSGIS.map.setCenter(
		new OpenLayers.LonLat( -71.9110107421875, 42.44778143462245).transform(
			new OpenLayers.Projection("EPSG:4326"),
			MASSGIS.map.getProjectionObject()
		), 9
	);

	var click = new OpenLayers.Control.Clickhold();
	click.events.register("click", {}, function(e) {

		var clickedPt = MASSGIS.map.getLonLatFromPixel(e.evt.xy);
		var buffer = MASSGIS.map.getResolution() * MASSGIS.config.tapTolerance;
		var searchRect = {x:clickedPt.lon - buffer, y:clickedPt.lat - buffer, w: buffer * 2, h: buffer * 2}
		var html = '';

		var selAddrs = [];
		var potentialSelAddrs = [];
		var targetPoint = false;
		if (MASSGIS.map.getResolution() < MASSGIS.lyr_address_points.maxResolution) {
			potentialSelAddrs = MASSGIS.lyr_address_points.spatialIndex.search(searchRect);
		} else {
			//console.log("completed addresses out of scale");
		}

		if (potentialSelAddrs.length !== 0) {
			$.each(potentialSelAddrs, function(idx, mpt) {
				if (mpt.attributes && mpt.attributes.geographic_edit_status == "DELETED") {
					return;
				}
				if (mpt.attributes && mpt.attributes.point_type == 'GC') {
					return;
				}
				if (mpt.attributes && mpt.attributes.type_icon == 'NONE' && mpt.attributes.status_color == 'NONE') {
					return;
				}
				if (mpt.geometry.components.length > 1) {
					$.each(mpt.geometry.components, function(idx, pt) {
						if (pt && pt.distanceTo(new OpenLayers.Geometry.Point(clickedPt.lon,clickedPt.lat)) < buffer) {
							selAddrs.push(mpt);
							return false;
						}
					});
				} else {
					if (mpt.geometry.components[0] && mpt.geometry.components[0].distanceTo(new OpenLayers.Geometry.Point(clickedPt.lon,clickedPt.lat)) < buffer) {
						selAddrs.push(mpt);
						return false;
					}
				}
			});
		}

		MASSGIS.pointsSelected(selAddrs, clickedPt, buffer);
		fixgeometry();
	});
	MASSGIS.wktReader = new OpenLayers.Format.WKT();
	click.events.register("clickhold", {}, function(e) {
		// no long-tap actions if we're over the max resolution of the address points layer
		if (MASSGIS.map.getResolution() > MASSGIS.lyr_address_points.maxResolution) {
			return;
		}

		// find all the points we long-tapped on
		var clickedPt = MASSGIS.map.getLonLatFromPixel(e.evt.xy);
		var buffer = MASSGIS.map.getResolution() * MASSGIS.config.tapTolerance;
		var searchRect = {x:clickedPt.lon - buffer, y:clickedPt.lat - buffer, w: buffer * 2, h: buffer * 2}

		var potentialPts = [];
		potentialPts = potentialPts.concat(MASSGIS.lyr_address_points.spatialIndex.search(searchRect));
		potentialPts = potentialPts.concat(MASSGIS.selectionLayer.spatialIndex.search(searchRect));
		potentialPts = potentialPts.concat(MASSGIS.preSelectionLayer.spatialIndex.search(searchRect));

		var vettedPotentialPts = [];

		$.each(potentialPts, function(idx, mpt) {
			if (mpt.attributes &&
				(
					mpt.attributes.point_type == 'GC' ||
					mpt.attributes.geographic_edit_status == 'DELETED' ||
					(mpt.attributes.type_icon == 'NONE' && mpt.attributes.status_color == 'NONE')
				)
			) {
				return;
			}
			vettedPotentialPts.push(mpt);
		});
		potentialPts = vettedPotentialPts;

		// Go through potentialPts and look at each one's component(s) to see if the tapped point is w/i a certain distance.
		// Don't want to click in a fair-game blank space in the middle of a MP and be unable to do anything.
		var pp = [];
		for (var i = 0; i < potentialPts.length; i++) {
			var pass_thru = true;
			var c = potentialPts[i].geometry.components;
			for (var j = 0; j < c.length; j++) {
				pass_thru = pass_thru && c[j].distanceTo(new OpenLayers.Geometry.Point(clickedPt.lon,clickedPt.lat)) > 15;
			}
			if (!pass_thru) {
				pp.push(potentialPts[i]);
			}
		}
		potentialPts = pp ? pp : potentialPts;

		var tappedOnAPoint = potentialPts.length > 0;

		if (!tappedOnAPoint && MASSGIS.preSelectionLayer.features.length === 1 && MASSGIS.selectionLayer.features.length === 0) {
			var conf = confirm("Add a new part to the selected Address Point?");
			if (!conf) {
				return;
			}
			var newFeature = MASSGIS.wktReader.read("MULTIPOINT(" + clickedPt.lon + " " + clickedPt.lat + ")");
			MASSGIS.preSelectionLayer.features[0].geometry.components.push(newFeature.geometry.components[0].clone());
			MASSGIS.preSelectionLayer.features[0].geometry.calculateBounds();
			MASSGIS.preSelectionLayer.events.triggerEvent(
				"featuremodified",
				{
					object:MASSGIS.preSelectionLayer,
					feature: MASSGIS.preSelectionLayer.features[0]
				}
			);

			var existingFeature = MASSGIS.lyr_address_points.getFeaturesByAttribute("address_point_id",MASSGIS.preSelectionLayer.features[0].attributes.address_point_id);
			existingFeature[0].geometry.components.push(newFeature.geometry.components[0].clone());
			existingFeature[0].geometry.calculateBounds();
			existingFeature[0].attributes.__MODIFIED__ = true;
			existingFeature[0].attributes.geographic_edit_status = 'MODIFIED';
			existingFeature[0].attributes.transaction_id = MASSGIS.generateTXId();
			existingFeature[0].attributes.time_stamp = new Date().toTimeString().split(" ")[0];
			existingFeature[0].state = OpenLayers.State.UPDATE;
			MASSGIS.lyr_address_points.strategies[1].save();
			MASSGIS.lyr_address_points.events.triggerEvent(
				"featuremodified",
				{
					object:MASSGIS.lyr_address_points,
					feature: existingFeature[0]
				}
			);

			MASSGIS.preSelectionLayer.redraw();
			MASSGIS.lyr_address_points.redraw();
		} else if (!tappedOnAPoint && MASSGIS.preSelectionLayer.features.length === 0 && MASSGIS.selectionLayer.features.length === 0) {
			var conf = confirm("Add a new Address Point at this location?");
			if (!conf) {
				return;
			}

			// Start w/ a clean undo stack.
			MASSGIS.undoStack = {
				action: 'new_address_point',
				f: []
			};

			// Create new address_point_id in MASSGIS-friendly projection coords.
			var newLonLat = new OpenLayers.LonLat(clickedPt.lon,clickedPt.lat).transform(
				 MASSGIS.map.getProjectionObject()
				,new OpenLayers.Projection('EPSG:26986')
			);

			var newFeature = MASSGIS.wktReader.read("MULTIPOINT(" + clickedPt.lon + " " + clickedPt.lat + ")");
			newFeature.attributes.address_point_id = 'M_' + Math.round(newLonLat.lon) + '_' + Math.round(newLonLat.lat);
			newFeature.attributes.status_color = "RED";
			newFeature.attributes.address_status = "UNLINKED";
			newFeature.attributes.geographic_edit_status = "ADDED";
			newFeature.attributes.structure_type = "M";
			newFeature.attributes.type_icon = "CIRCLE";
			newFeature.attributes.label_text = "";
			var communityId = $('#msag_community').val();
			if (!communityId || communityId == '') {
				if (!MASSGIS.lyr_address_points.features) {
					communityId = -1;
				} else {
					communityId = MASSGIS.lyr_address_points.features[0].attributes.community_id;
				}
				if (!communityId || communityId == '') {
					communityId = -1;
				}
			}
			if (communityId == -1) {
				alert("Unable to locate an MSAG community_id for your new address point.  The community_id will be assigned after the point is added to the database.");
			}

			//newFeature.attributes.community_id = $('#msag_community').val();
			newFeature.attributes.community_id = communityId;
			newFeature.attributes.point_type = "ABC";
			newFeature.attributes.time_stamp = new Date().toTimeString().split(" ")[0];
			//newFeature.attributes.geographic_town_id = MASSGIS.lyr_address_points.features[0].attributes.geographic_town_id;

			// Per discussion on 9/4, newly added points without connected addresses *should* be sent to server
			// if this is not desired, comment out next line
			newFeature.attributes.__MODIFIED__ = true;
			newFeature.state = OpenLayers.State.INSERT;

			// Add this new feature to the undo stack.
			MASSGIS.undoStack.f.push(newFeature);

			MASSGIS.lyr_address_points.addFeatures([newFeature]);
			MASSGIS.lyr_address_points.strategies[1].save();
			MASSGIS.lyr_address_points.redraw();
		} else if (tappedOnAPoint) {
			$('#delete_or_ignore_popup').popup().popup("open");
			$('#delete_or_ignore_popup a[data-icon=delete]').on("click",function(e) {
				$('#delete_or_ignore_popup a[data-icon=delete]').off("click");
				$('#delete_or_ignore_popup a[data-icon=minus]').off("click");
				MASSGIS.undoStack = {
					 action		: 'delete_address_point'
					,f			: []
				};
				var txId = MASSGIS.generateTXId();
				var deletedComponents = [];
				$.each(potentialPts, function(idx, targetMP) {
					if (targetMP.layer !== MASSGIS.lyr_address_points) return;

					var targetMPClone = targetMP.clone();
					targetMPClone.fid = targetMP.fid;
					targetMPClone.layer = targetMP.layer;
					$.each(targetMP.geometry.components, function(idx, component) {
						if (component && component.distanceTo(new OpenLayers.Geometry.Point(clickedPt.lon,clickedPt.lat)) < buffer) {
							var delPt = targetMP.geometry.components.splice(idx, 1);
							deletedComponents = deletedComponents.concat(delPt);
							targetMP.attributes.geographic_edit_status = 'MODIFIED';
							targetMP.attributes.__MODIFIED__ = true;
							targetMP.attributes.transaction_id = txId;
							targetMP.attributes.time_stamp = new Date().toTimeString().split(" ")[0];
							targetMP.state = OpenLayers.State.UPDATE;
						}
					});
					var fullDelete = false;
					if (targetMP.geometry.components.length === 0) {
						var fullDelete = true;
						// we deleted the entire geometry.  Mark the feature deleted
						targetMP.geometry.components = deletedComponents;
						targetMP.attributes.geographic_edit_status = 'DELETED';
						targetMP.attributes.status_color = 'NONE';
						targetMP.attributes.transaction_id = txId;
						targetMP.attributes.time_stamp = new Date().toTimeString().split(" ")[0];
						targetMP.state = OpenLayers.State.UPDATE;

						// we also need to mark any address records that were originally associated with this
						// point as address_point_id = null
						$.each(MASSGIS.lyr_maf.getFeaturesByAttribute("address_point_id",targetMP.attributes.address_point_id), function(idx, madRec) {
							madRec.attributes.status_color = 'RED';
							madRec.attributes.address_point_id = '';
							madRec.attributes.address_status = 'UNLINKED';
							madRec.attributes.__MODIFIED__ = true;
							madRec.attributes.transaction_id = txId;
							madRec.attributes.time_stamp = new Date().toTimeString().split(" ")[0];
							madRec.state = OpenLayers.State.UPDATE;
						});
						MASSGIS.lyr_maf.strategies[1].save();
						MASSGIS.renderAddressList();

					} else {
						// we deleted SOME of the components of this point.  We need to split the point out and create the corresponding point that has the deletes in it
						var delClone = targetMP.clone();
						delClone.fid = null;
						delClone.layer = targetMP.layer;
						delClone.geometry.components = deletedComponents;
						var newCentroid = delClone.geometry.getCentroid().clone().transform(
							 MASSGIS.map.getProjectionObject()
							,new OpenLayers.Projection('EPSG:26986')
						);
						delClone.attributes.address_point_id = "M_" + Math.round(newCentroid.x) + "_" + Math.round(newCentroid.y);
						delClone.attributes.status_color = 'NONE';
						delClone.attributes.geographic_edit_status = 'DELETED';
						delClone.attributes.__MODIFIED__ = true;
						delClone.attributes.transaction_id = txId;
						delClone.attributes.time_stamp = new Date().toTimeString().split(" ")[0];

						delClone.state = OpenLayers.State.INSERT;
						MASSGIS.lyr_address_points.addFeatures([delClone]);
						//MASSGIS.lyr_address_points.strategies[1].save();
						//MASSGIS.lyr_address_points.reindex();
					}
					if (targetMP.state == OpenLayers.State.UPDATE) {
						// only want to push the MP to the stack if it was modified
						MASSGIS.undoStack.f.push(targetMPClone);
					}

					// also clear out the pre-selected or selected version of this point
					var presel = MASSGIS.preSelectionLayer.getFeaturesByAttribute("address_point_id",targetMP.attributes.address_point_id);
					if (presel.length > 0 ) {
						MASSGIS.preSelectionLayer.removeFeatures(presel);
						if (!fullDelete) {
							MASSGIS.preSelectionLayer.addFeatures([targetMP.clone()]);
						}
					}

					var sel = MASSGIS.selectionLayer.getFeaturesByAttribute("address_point_id",targetMP.attributes.address_point_id);
					if (sel.length > 0) {
						MASSGIS.selectionLayer.removeFeatures(sel);
						// if (!fullDelete) {
						// 	MASSGIS.selectionLayer.addFeatures([targetMP.clone()]);
						// }
					}

					MASSGIS.preSelectionLayer.redraw();
					MASSGIS.selectionLayer.redraw();

					targetMP.layer.strategies && targetMP.layer.strategies[1].save();
					targetMP.layer.redraw();
					targetMP.layer.spatialIndex && targetMP.layer.reindex();
				});
			});

			$('#delete_or_ignore_popup a[data-icon=minus]').on("click",function(e) {
				$('#delete_or_ignore_popup a[data-icon=delete]').off("click");
				$('#delete_or_ignore_popup a[data-icon=minus]').off("click");
				MASSGIS.undoStack = {
					 action		: 'ignore_address_point'
					,f			: []
					,madRecIds	: []
				};
				var txId = MASSGIS.generateTXId();
				$.each(potentialPts, function(idx, targetMP) {
					var targetMPClone = targetMP.clone();
					targetMPClone.fid = targetMP.fid;
					targetMPClone.layer = targetMP.layer;
					var secondaryPointCoords = [];
					$.each(targetMP.geometry.components, function(idx, component) {
						if (component && component.distanceTo(new OpenLayers.Geometry.Point(clickedPt.lon,clickedPt.lat)) < buffer) {
							secondaryPointCoords.push(targetMP.geometry.components.splice(idx, 1)[0]);
							targetMP.attributes.geographic_edit_status = 'SPLIT';
							targetMP.attributes.transaction_id = txId;
							targetMP.attributes.time_stamp = new Date().toTimeString().split(" ")[0];
							targetMP.attributes.__MODIFIED__ = true;
							targetMP.state = OpenLayers.State.UPDATE;
						}
					});
					if (targetMP.geometry.components.length === 0) {
						if (targetMP.layer == MASSGIS.preSelectionLayer || targetMP.layer == MASSGIS.selectionLayer) {
							targetMP.layer.removeFeatures([targetMP]);
						} else {
							// we marked the entire geometry as SECONDARY, no need to do a split
							targetMP.attributes.geographic_edit_status = 'UNLINKED';
							targetMP.attributes.status_color = 'GRAY';
							targetMP.attributes.transaction_id = txId;
							targetMP.attributes.structure_status = 'S';
							targetMP.attributes.time_stamp = new Date().toTimeString().split(" ")[0];
							targetMP.attributes.__MODIFIED__ = true;
							targetMP.state = OpenLayers.State.UPDATE;
							targetMP.geometry.components = secondaryPointCoords;

							// we also need to mark any address records that were originally associated with this
							// point as address_point_id = null
							$.each(MASSGIS.lyr_maf.getFeaturesByAttribute("address_point_id",targetMP.attributes.address_point_id), function(idx, madRec) {
								madRec.attributes.status_color = 'RED';
								madRec.attributes.address_point_id = '';
								madRec.attributes.address_status = 'UNLINKED';
								madRec.attributes.transaction_id = txId;
								madRec.attributes.time_stamp = new Date().toTimeString().split(" ")[0];
								madRec.attributes.__MODIFIED__ = true;
								MASSGIS.undoStack.madRecIds.push(madRec.master_address_id);
							});
							MASSGIS.lyr_maf.strategies[1].save();
							MASSGIS.renderAddressList();
						}
					} else if (targetMP.layer == MASSGIS.lyr_address_points) {
						var newPoint = targetMP.clone();
						delete newPoint.fid;
						newPoint.geometry.components = secondaryPointCoords;
						var newCentroid = newPoint.geometry.getCentroid().clone().transform(
							 MASSGIS.map.getProjectionObject()
							,new OpenLayers.Projection('EPSG:26986')
						);
						newPoint.attributes.address_point_id = "M_" + Math.round(newCentroid.x) + "_" + Math.round(newCentroid.y);
						newPoint.attributes.status_color = "GRAY";
						newPoint.attributes.address_status = "UNLINKED";
						newPoint.attributes.geographic_edit_status = "SPLIT";
						newPoint.attributes.structure_status = "S";
						newPoint.attributes.label_text = "";
						newPoint.attributes.site_id	= targetMP.attributes.site_id;
						newPoint.attributes.community_id = targetMP.attributes.community_id;
						newPoint.attributes.loc_id = targetMP.attributes.loc_id;
						newPoint.attributes.geographic_town_id = targetMP.attributes.geographic_town_id;
						newPoint.attributes.transaction_id = txId;
						newPoint.attributes.time_stamp = new Date().toTimeString().split(" ")[0];
						newPoint.attributes.__MODIFIED__ = true;
						newPoint.state = OpenLayers.State.INSERT;

						MASSGIS.lyr_address_points.addFeatures([newPoint]);
						//MASSGIS.lyr_address_points.strategies[1].save();

						MASSGIS.undoStack.newPoint = newPoint;
					}
					if (targetMP.state == OpenLayers.State.UPDATE) {
						// only want to push the MP to the stack if it was modified
						MASSGIS.undoStack.f.push(targetMPClone);
					}
					targetMP.layer && targetMP.layer.strategies && targetMP.layer.strategies[1].save();
					targetMP.layer && targetMP.layer.redraw();
					targetMP.layer && targetMP.layer.spatialIndex && targetMP.layer.reindex();
				});
			});
		} else {
			alert("Please add any points you wish to add *before* selecting points for linking");
			return;
		}

	});

	MASSGIS.map.addControl(click);
	click.activate();

	$('#layer_switcher').on('click', function() {
		MASSGIS.mapType = MASSGIS.mapTypes[(_.indexOf(MASSGIS.mapTypes,MASSGIS.mapType) + 1) % MASSGIS.mapTypes.length];
		if (MASSGIS.mapType == 'Road') {
			//MASSGIS.map.setBaseLayer(MASSGIS.osmLayer);
			MASSGIS.map.setBaseLayer(MASSGIS.topoBasemap);
			jQuery('.ui-icon.ui-icon-shadow.ui-icon-mft-sattelite')
				.css('background-image','url("img/sattelite_icon.png")')
				.css('width','81px');
			jQuery('#layer_switcher .ui-btn-text').html('MassGIS');
		}
		else if (MASSGIS.mapType == 'Ortho 2013-14') {
			MASSGIS.map.setBaseLayer(MASSGIS.mgisOrthosStatewideLayer2014);
			jQuery('.ui-icon.ui-icon-shadow.ui-icon-mft-sattelite')
				.css('background-image','url("img/sattelite_icon.png")')
				.css('width','74px');
			jQuery('#layer_switcher .ui-btn-text').html('Google');
		}
		else if (MASSGIS.mapType == 'Ortho 2014-15') {
			MASSGIS.map.setBaseLayer(MASSGIS.mgisOrthosStatewideLayer2015);
			jQuery('.ui-icon.ui-icon-shadow.ui-icon-mft-sattelite')
				.css('background-image','url("img/blankBase_icon.png")')
				.css('text-color','black')
				.css('width','65px');
			jQuery('#layer_switcher .ui-btn-text').html('blank');
		} else if (MASSGIS.mapType == 'Blank') {
			MASSGIS.map.setBaseLayer(MASSGIS.blankBaseLayer);
			jQuery('.ui-icon.ui-icon-shadow.ui-icon-mft-sattelite').css('background-image','url("img/streets_icon.png")');
			jQuery('.ui-icon.ui-icon-shadow.ui-icon-mft-sattelite')
				.css('text-color','black')
				.css('width','74px');
			jQuery('#layer_switcher .ui-btn-text').html('streets');
		}
	});

	$('#zoom_out').on('click', function() {
		MASSGIS.map.zoomOut();
	});
	$('#zoom_in').on('click', function() {
		MASSGIS.map.zoomIn();
	});

	MASSGIS.map.events.register('moveend',this,function() {
		if ($('#search_proximity').hasClass('ui-btn-active')) {
			$('#search_proximity').trigger('click');
			$('#addr_list > div').scrollTo(0);
		}
		});
};

MASSGIS.pointsSelected = function(aFeatures, clickedPt, buffer) {
	if (!aFeatures) {
		return;
	}
	$.each(aFeatures, function(idx, oPoint) {
		var p = oPoint.clone();
		p.style = null;
		MASSGIS.map.setLayerZIndex(MASSGIS.preSelectionLayer, 6);
		MASSGIS.map.setLayerZIndex(MASSGIS.selectionLayer, 12);
		var preSelectionPt = MASSGIS.preSelectionLayer.getFeaturesByAttribute("address_point_id",oPoint.attributes.address_point_id);
		var potentialSelectionPts = MASSGIS.selectionLayer.getFeaturesByAttribute("address_point_id",oPoint.attributes.address_point_id);
		var selectionPts = [];
		// neeed to be more specific on the selectionPts part.  Did we actually CLICK on a selection point?
		$.each(potentialSelectionPts, function(idx, selPt) {
			if (selPt.geometry.components[0].distanceTo(new OpenLayers.Geometry.Point(clickedPt.lon,clickedPt.lat)) < buffer) {
				selectionPts.push(selPt);
			}
		});
		if (selectionPts.length > 0) {
			// we clicked on a selection point.  Put it "back" with its corresponding pre-selection point.
			MASSGIS.selectionLayer.removeFeatures(selectionPts);
			$.each(selectionPts, function(idx, selPt) {
				var preSelectionPt = MASSGIS.preSelectionLayer.getFeaturesByAttribute("address_point_id",selPt.attributes.address_point_id);
				if (preSelectionPt.length > 0) {
					// add this component back to its parent "pre-selection" point
					preSelectionPt[0].geometry.components = preSelectionPt[0].geometry.components.concat(selPt.geometry.components);
				} else {
					// just move it back over to the pre-selection layer
					selPt.style = null;
					MASSGIS.preSelectionLayer.addFeatures([selPt]);
				}
			});
			MASSGIS.preSelectionLayer.redraw();
		} else if (preSelectionPt.length > 0)  {
			// given a pre-selected point, promote any clicked components to the selection layer
			var preSelectionPtComponents = [];
			var selectionPtComponents = [];
			var point = preSelectionPt[0];
			MASSGIS.preSelectionLayer.removeFeatures([point]);

			// go through each component of this pre-selected point and decide which layer to put it into.
			$.each(point.geometry.components, function(idx, component) {
				if (component.distanceTo(new OpenLayers.Geometry.Point(clickedPt.lon,clickedPt.lat)) < buffer) {
					selectionPtComponents.push(point.geometry.components[idx]);
				} else {
					preSelectionPtComponents.push(point.geometry.components[idx]);
				}
			});

			if (preSelectionPtComponents.length > 0) {
				point.geometry.components = preSelectionPtComponents;
				MASSGIS.preSelectionLayer.addFeatures([point]);
			}
			if (selectionPtComponents.length > 0) {
				p.geometry.components = selectionPtComponents;
				MASSGIS.selectionLayer.addFeatures([p]);
			}
		} else {
			MASSGIS.preSelectionLayer.addFeatures([p]);
		}
	});
};

MASSGIS.init_mapExtent = function() {

	if (MASSGIS.lyr_address_points.features.length > 0) {
		var bounds = MASSGIS.lyr_address_points.getDataExtent();
		window.setTimeout(function() {
			MASSGIS.map.zoomToExtent(bounds, false);
		}, 500);
	}
};

$.views.tags({
	fields: function( object, prefix ) {
		if (!prefix) {
			prefix = '';
		}
		var key,
		ret = "";
		for ( key in object ) {
			if ( object.hasOwnProperty( key )) {
				// For each property/field, render the content of the {{fields object}} tag, with "~key" as template parameter
				var obj = {};
				obj[prefix + "_key"] = key;
				obj[prefix + "_data"] = object[key];
				ret += this.renderContent( object[ key ], obj);
			}
		}
		return ret;
	}
});

})();

MASSGIS.fetchTilesIntoDb = function() {
	var tilesToFetch = [];

	var dummyTileClass = OpenLayers.Class(OpenLayers.Tile, {
		"draw" : function (deferred) {
			//console.log("drawing tile ",this.layer.getURL(this.bounds));
			tilesToFetch.push(this.layer.getURL(this.bounds));
		}
	});
	var t = MASSGIS.map.layers[0].clone();
	t.tileClass = dummyTileClass;
	t.setMap(MASSGIS.map);
	t.fetchResolution = t.resolutions.indexOf(t.map.resolution);
	t.getServerResolution = function(resolution) {
		return this.resolutions[t.fetchResolution];
	};

	// fetch tile urls at level 12
	t.fetchResolution = MASSGIS.map.getZoom();
	t.initGriddedTiles(MASSGIS.map.getExtent());

	t.fetchResolution = MASSGIS.map.getZoom() + 1;
	t.initGriddedTiles(MASSGIS.map.getExtent());

	t.fetchResolution = MASSGIS.map.getZoom() + 2;
	t.initGriddedTiles(MASSGIS.map.getExtent());

//	t.fetchResolution = MASSGIS.map.getZoom() + 3;
//	t.initGriddedTiles(MASSGIS.map.getExtent());

	MASSGIS.showModalMessage('Fetching Map Tiles for Offline Use (this may take several minutes)','true');
	window.setTimeout(function() {
		$.ajax({
			type			: 'POST'
			,url			: 'tiles.php'
			,data			: JSON.stringify(tilesToFetch)
			,async			: false
			,contentType	: "application/json"
		}).done(function(tiles) {
			var tileDb = openDatabase('tiledb','1.0','tiledb',1 * 1024 * 1024);
			tileDb.transaction(function(tx) {
				tx.executeSql('create table if not exists osm (url text unique,uri text)');
				for (uri in tiles) {
					tx.executeSql("delete from osm where url = '" + uri + "'" );
					tx.executeSql("insert into osm values ('" + uri + "','" + tiles[uri] + "')");
				}
				MASSGIS.loadCachedTiles();
				MASSGIS.hideModalMessage();
			});
		});
	}, 100);
};

MASSGIS.dummyTile = OpenLayers.Class(OpenLayers.Tile, {
	"draw" : function (deferred) {
		console.log("drawing tile ",this.layer.getURL(tile.bounds));
	}
});

MASSGIS.generateTXId = function() {
	var txId = Math.round(Math.random() * 1000000000);
	return txId;
};

MASSGIS.showModalMessage = function(msg) {
	$('.modalWindow').css('display','block');
	$.mobile.showPageLoadingMsg('b',msg,true);
};

MASSGIS.hideModalMessage = function() {
	$(".modalWindow").css('display','none');
	$.mobile.hidePageLoadingMsg();
};

MASSGIS.offsetLimit = 20;
$(document).ready(function() {
//alert("'by query' tab scroling v 2.5 enabled");
	var startPos, scrollStart;
	$('#addr_query ul').on('touchmove', function(evt, ui) {
		if (scrollStart === false) {
			scrollStart = evt.originalEvent.layerY;
		}
		var offset = scrollStart - evt.originalEvent.layerY;
		console.log("touchmove",evt.originalEvent.layerY,startPos, scrollStart, offset);
		if (offset !== 0) {
			if (/Android/.test(navigator.userAgent)) {
				offset = offset * -4;
			} else {
				offset = offset * 3
			}
			$('#addr_query_res').scrollTop(startPos + offset);
			startPos = startPos + offset;
			scrollStart = false;
		}
	});
	$('#addr_query ul').on('touchstart', function(evt, ui) {
		console.log("touchstart",evt);
		startPos = $('#addr_query_res').scrollTop();
		scrollStart = false;
	});
	$('#addr_query ul').on('touchend', function(evt, ui) {
		console.log("touchend",evt);
	});
});
