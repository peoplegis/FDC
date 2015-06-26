MASSGIS.test = {};
MASSGIS.test.testSimpleLink = function() {
	asyncTest("UC 1 & 11 - Simple subset link", function() {
		$('#clear_button').trigger("click");
		$('#search_query').trigger("click");
		//MASSGIS.test.queryForAddress("11","railroad");
		MASSGIS.test.queryForAddress("11","1369");
		$($('#addr_query_res li')[0]).trigger("click");

		var pt = {
			"lon": MASSGIS.preSelectionLayer.features[0].geometry.components[0].x,
			"lat": MASSGIS.preSelectionLayer.features[0].geometry.components[0].y
		};
		MASSGIS.pointsSelected([MASSGIS.preSelectionLayer.features[0]], pt, 1);
		var pt = {
			"lon": MASSGIS.preSelectionLayer.features[0].geometry.components[0].x,
			"lat": MASSGIS.preSelectionLayer.features[0].geometry.components[0].y
		};
		MASSGIS.pointsSelected([MASSGIS.preSelectionLayer.features[0]], pt, 1);
		var pt = {
			"lon": MASSGIS.preSelectionLayer.features[0].geometry.components[0].x,
			"lat": MASSGIS.preSelectionLayer.features[0].geometry.components[0].y
		};
		MASSGIS.pointsSelected([MASSGIS.preSelectionLayer.features[0]], pt, 1);
		fixgeometry();

		MASSGIS.linkedAddressLayer.features[0].selStatus = 'selected';
		MASSGIS.renderLinkedAddresses();

		var startLength = MASSGIS.linkedAddressLayer.features.length;
		var addrPtId = MASSGIS.selectionLayer.features[0].attributes.ADDRESS_POINT_ID;

		// now link it
		$('#link_button').trigger("click");

		expect(5);
		window.setTimeout(function() {
			// now check the results
			equal(MASSGIS.linkedAddressLayer.features.length, startLength - 1);
			equal(MASSGIS.selectionLayer.features.length, 0);
			equal(MASSGIS.preSelectionLayer.features.length, 0);
			equal(MASSGIS.lyr_maf.getFeaturesByAttribute("ADDRESS_POINT_ID",addrPtId).length, 1);

			var colors = {};
			$.each(MASSGIS.undoStack.lyr_mafModified, function(idx, madRec) {
				colors[madRec.attributes.STATUS_COLOR] = true;
			});
			var aColors = [];
			$.map(colors, function(value, key) {
				aColors.push(key);
			});
			equal(aColors.length, 1, "All undo records should have status_color = 'red'.  Found colors " + aColors.join(","));
			start();
		}, 1000);
	});


	return;
	asyncTest("UC 1 & 11 - Simple subset link - undo", function() {

		// undo last change;
		$('#undo_button').trigger("click");

		expect(4);
		window.setTimeout(function() {
			// now check the results
			equal(MASSGIS.lyr_maf.getFeaturesByAttribute("ADDRESS_POINT_ID","M_271729_934239").length, 1);
			var countRedMadRecs = 0;
			$.each(MASSGIS.lyr_maf.getFeaturesByAttribute("ADDRESS_POINT_ID","M_271729_934239"), function(idx, madRec) {
				madRec.attributes.status_color == "RED" && countRedMadRecs++;
			});
			equal(countRedMadRecs, 15);

			equal(MASSGIS.lyr_address_points.getFeaturesByAttribute("ADDRESS_POINT_ID","M_271729_934239").length, 1);
			var pt = MASSGIS.lyr_address_points.getFeaturesByAttribute("ADDRESS_POINT_ID","M_271729_934239")[0];
			ok(pt.attributes.STATUS_COLOR == "RED");
			start();
		}, 1000);
	});
};

MASSGIS.test.testEditAddress = function() {
	asyncTest("UC 2 - Edit Point", function() {
		$('#clear_button').trigger("click");
		$('#search_query').trigger("click");
		//MASSGIS.test.queryForAddress("","railroad");
		MASSGIS.test.queryForAddress("","1369");

		$($('#addr_query_res li')[2]).trigger("click");
		$($('#linked_addrs li')[0]).find("div[data-action=click_to_edit]").trigger("click");
		$('#edit_FULL_NUMBER_STANDARDIZED').val("999");
		$('#edit_popup a[data-icon="check"]').trigger("click");

		// now check the results
		expect(2);
		window.setTimeout(function() {
			// now check the results
			var addr = MASSGIS.linkedAddressLayer.getFeatureById($($('#linked_addrs li')[0]).data('id'));
			equal(addr.attributes.STATUS_COLOR,'GREEN');
			equal(addr.attributes.EDIT_STATUS, "MODIFIED");
			start();
		}, 1000);
	});

	// no undo
};

MASSGIS.test.testDeleteAddress = function() {
	test("UC 3 - Delete Address", function() {
		$('#clear_button').trigger("click");
		$('#search_query').trigger("click");
		//MASSGIS.test.queryForAddress("","railroad");
		MASSGIS.test.queryForAddress("","1369");

		$($('#addr_query_res li')[1]).trigger("click");
		var addrPtId = MASSGIS.linkedAddressLayer.features[0].attributes.ADDRESS_POINT_ID;
		$($('#linked_addrs li')[0]).find("div[data-action=click_to_delete]").trigger("click");

		// now check the results
		var noAddr = MASSGIS.lyr_maf.getFeaturesByAttribute("ADDRESS_POINT_ID",addrPtId);
		equal(noAddr.length, 0);

		var addr = MASSGIS.lyr_maf.getFeaturesByAttribute("ADDRESS_POINT_ID",addrPtId + "_DELETED")[0];
		equal(addr.attributes.STATUS_COLOR,'NONE');
		equal(addr.attributes.EDIT_STATUS, "DELETED");

		// check the undo stack
		equal(MASSGIS.undoStack.action, "click_to_delete");
		equal(MASSGIS.undoStack.ADDRESS_POINT_ID, addrPtId);
	});

	asyncTest("UC 3 - Delete Address - Undo", function() {
		expect(7);
		notEqual(MASSGIS.undoStack.ADDRESS_POINT_ID, null);
		var addrPtId = MASSGIS.undoStack.ADDRESS_POINT_ID;
		var addrs = MASSGIS.lyr_address_points.getFeaturesByAttribute("ADDRESS_POINT_ID",addrPtId);
		equal(addrs.length, 1);
		var addrPt = addrs[0];
		equal(addrPt.attributes.STATUS_COLOR, "RED");
		equal(addrPt.attributes.ADDRESS_STATUS, "UNLINKED");

		// undo last change;
		$('#undo_button').trigger("click");

		// now check the results
		window.setTimeout(function() {
			// now check the results
			var addrs = MASSGIS.lyr_address_points.getFeaturesByAttribute("ADDRESS_POINT_ID",addrPtId);
			equal(addrs.length, 1);
			var addrPt = addrs[0];
			equal(addrPt.attributes.STATUS_COLOR, "BLUE");
			equal(addrPt.attributes.ADDRESS_STATUS, null);
			start();
		}, 200);
		
	});

};

MASSGIS.test.testMarkPrimaryAddress = function() {
	asyncTest("UC 5 - Mark Address Primary", function() {
		$('#clear_button').trigger("click");
		$('#search_query').trigger("click");
		//MASSGIS.test.queryForAddress("11","railroad");
		MASSGIS.test.queryForAddress("11","1369");
		$($('#addr_query_res li')[0]).trigger("click");

		var pt = {
			"lon": MASSGIS.preSelectionLayer.features[0].geometry.components[0].x,
			"lat": MASSGIS.preSelectionLayer.features[0].geometry.components[0].y
		};
		var addrPtId = MASSGIS.linkedAddressLayer.features[0].attributes.ADDRESS_POINT_ID;
		MASSGIS.pointsSelected([MASSGIS.preSelectionLayer.features[0]], pt, 1);
		$('#link_button').trigger("click");

		// now check the results
		expect(17);
		window.setTimeout(function() {
			var priAddr = MASSGIS.lyr_address_points.getFeaturesByAttribute("ADDRESS_POINT_ID",addrPtId)[0];
			equal(priAddr.attributes.STATUS_COLOR,'GREEN');
			equal(priAddr.attributes.GEOGRAPHIC_EDIT_STATUS, "MODIFIED");
			equal(priAddr.attributes.STRUCTURE_TYPE, "P");
			equal(priAddr.geometry.components.length, 1);

			// check the undo stack
			equal(MASSGIS.undoStack.action, "link");
			equal(MASSGIS.undoStack.lyr_address_pointsAdded.length, 1);
			equal(MASSGIS.undoStack.lyr_address_pointsAdded[0].attributes.ADDRESS_POINT_ID, addrPtId);
			equal(MASSGIS.undoStack.lyr_address_pointsAdded[0].geometry.components.length, 1);
			equal(MASSGIS.undoStack.lyr_address_pointsModified.length, 1);
			equal(MASSGIS.undoStack.lyr_address_pointsModified[0].attributes.ADDRESS_POINT_ID, addrPtId);
			equal(MASSGIS.undoStack.lyr_address_pointsModified[0].geometry.components.length, 3);

			var secAddr = MASSGIS.lyr_address_points.getFeaturesByAttribute("PARENT_ID",addrPtId);
			equal(secAddr.length, 1);
			secAddr = secAddr[0];
			notEqual(secAddr.attributes.ADDRESS_POINT_ID, addrPtId);
			equal(secAddr.attributes.STATUS_COLOR, MASSGIS.undoStack.lyr_address_pointsModified[0].attributes.STATUS_COLOR);
			equal(secAddr.attributes.GEOGRAPHIC_EDIT_STATUS, "SPLIT");
			equal(secAddr.attributes.ADDRESS_STATUS, "UNLINKED");
			equal(secAddr.geometry.components.length, 2);
			start();
		},200);
	});

	asyncTest("UC 5 - Mark Address Primary - Undo", function() {
		expect(7);
		var addrPtId = MASSGIS.undoStack.lyr_address_pointsAdded[0].attributes.ADDRESS_POINT_ID;
		var addrs = MASSGIS.lyr_address_points.getFeaturesByAttribute("ADDRESS_POINT_ID",addrPtId);
		equal(addrs.length, 1);
		var addrPt = addrs[0];
		equal(addrPt.attributes.STATUS_COLOR, "GREEN");
		equal(addrPt.attributes.STRUCTURE_TYPE, "P");
		equal(addrPt.geometry.components.length, 1);

		// undo last change;
		$('#undo_button').trigger("click");

		// now check the results
		window.setTimeout(function() {
			// now check the results
			var addrs = MASSGIS.lyr_address_points.getFeaturesByAttribute("ADDRESS_POINT_ID",addrPtId);
			equal(addrs.length, 1);
			var addrPt = addrs[0];
			notEqual(addrPt.attributes.STRUCTURE_TYPE, "P");
			equal(addrPt.geometry.components.length, 3);
			start();
		}, 200);
		
	});

};


MASSGIS.test.queryForAddress = function(num,street) {
	$('#FULL_NUMBER_STANDARDIZED').val(num);
	$('#STREET_NAME').val(street).trigger("change");
};
