/*!
 * (jQuery mobile) jQuery UI Widget-factory plugin boilerplate (for 1.8/9+)
 * as per http://addyosmani.com/resources/essentialjsdesignpatterns/book/#jquerypluginpatterns
 * Author: josh@peoplegis.com
 * Copyright (c) 2012 PeopleGIS, Inc.
 */

;(function ( $, window, document, undefined ) {

    //define a widget under a namespace of your choice
    //here 'mobile' has been used in the first parameter
    $.widget( "mobile.gps_map_controls", $.mobile.widget, {

        //Options to be used as defaults
        options: {
            map : null,
			pointRadius: "10", 
			fillColor: "#54AFFF",
			strokeColor: "#0026C3",
			strokeWidth: 2,
			fillOpacity: .7
        },

        _create: function() {
            // _create will automatically run the first time this 
            // widget is called. Put the initial widget set-up code 
            // here, then you can access the element on which 
            // the widget was called via this.element
            // The options defined above can be accessed via 
            // this.options

            //var m = this.element,
            //p = m.parents(":jqmData(role='page')"),
            //c = p.find(":jqmData(role='content')")
			
			// construct DOM
			var container = jQuery('<div class="gps_map_control_container">');
			var that = this;
			var szContentsHtml = '<div data-role="fieldcontain"> <fieldset data-role="controlgroup">'+
				'<input type="radio" name="gps_map_control" data-theme="b"  id="gps_map_control_1" value="show" />'+
				'<label for="gps_map_control_1">Show</label>'+
				'<input type="radio" name="gps_map_control" data-theme="b" id="gps_map_control_2" value="zoom"  />'+
				'<label for="gps_map_control_2">Zoom</label>'+
				'<input type="radio" name="gps_map_control" data-theme="b" id="gps_map_control_3" value="follow"  />'+
				'<label for="gps_map_control_3">Follow</label>'+
			'</fieldset></div>';
			container.append(szContentsHtml);
			this.element.append(container).trigger('create');
			
			// need to start with these elements inactive, turn active on gps available
			
			

			// init defaults
			this.current_watch_position_id = 'none';
			this.gps_mode = 'inactive';
			this.last_gps_mode = 'inactive';
			this.last_position = null;
			// make buttons work correctly
			container.find('input').on('click tap', function (ev) {
				if (jQuery(this).prop('value') == that.gps_mode) {
					ev.preventDefault();
					jQuery(this).attr('checked',false).checkboxradio('refresh');
					that.last_gps_mode	= that.gps_mode;
					that.gps_mode = 'inactive';
					that.last_position = null;
					that.gpsLayer.removeAllFeatures ();					
				} else {
					that.last_gps_mode	= that.gps_mode;
					that.gps_mode =  jQuery(this).prop('value');
					if (that.gps_mode == 'show') {that.gps_mode = 'show_initial';}
				}
				that._triggerGPSMode(ev);
			});
			
			
			// set up OL layer
			var map = this.options.map;
			var gpsPosition = this.gpsLayer = new OpenLayers.Layer.Vector("GPS Position", {
				styleMap :  new OpenLayers.StyleMap({
					"default": new OpenLayers.Style({
						pointRadius: this.options.pointRadius,
						fillColor: '#984ea3',
						strokeColor: '#2d1730',
						strokeWidth: this.options.strokeWidth,
						fillOpacity: this.options.fillOpacity,
						graphicZIndex: 1
					})
				})
			});
			map.addLayers([gpsPosition]);

			
		},

		_triggerGPSMode: function (ev) {
			var that = this;
			var mode = this.gps_mode;
			if (mode != 'inactive') {
				if (this.current_watch_position_id == 'none') {
					this.current_watch_position_id = navigator.geolocation.watchPosition(
						function (resp) {
							that.last_position = resp;
							that._triggerGPSMode(ev);
						}, function () {
							alert("The system could not locate you using the geo-location service.  Is your GPS enabled and do you have a good signal?");
							that.current_watch_position_id = 'none';
							that.mode = 'inactive';
						},
						{ 
							// this needs to be changed - false only for desktop testing
							enableHighAccuracy: true
						}
					);
				} else if (mode == 'zoom' && that.last_position !== null) {
					window.setTimeout(function () {
						jQuery("#gps_map_control_2").attr('checked',false);
						if (that.last_gps_mode == 'show'  ) {
							jQuery("#gps_map_control_1").attr('checked','checked');	
						} else if (that.last_gps_mode == 'follow' || that.last_gps_mode == 'inactive') {
							jQuery("#gps_map_control_3").attr('checked','checked');	
						}
						that._parseLocation(that.last_position);
						that.gps_mode = ( that.last_gps_mode == 'inactive' ? 'follow' :that.last_gps_mode)  ;
						jQuery("#gps_map_control_1,#gps_map_control_2,#gps_map_control_3").checkboxradio('refresh');	
						
					},0);
					ev.preventDefault();
				} else {
					that._parseLocation(that.last_position);
				}
			} else {
				navigator.geolocation.clearWatch(this.current_watch_position_id);
				this.current_watch_position_id = 'none';
			}
		},

		gpsBuffer : .10,
		generateBufferBounds : function () {
			var map = this.options.map;
			var mapBounds = map.getExtent();
			// left, bottom, right, top
			var dX = ( mapBounds.right-mapBounds.left ) * this.gpsBuffer;
			var dY = ( mapBounds.top-mapBounds.bottom ) * this.gpsBuffer;
			var gpsBufferBounds = new OpenLayers.Bounds( mapBounds.left+dX, mapBounds.bottom+dY, mapBounds.right-dX, mapBounds.top-dY);
			return gpsBufferBounds;
		},
		
		_parseLocation : function (data) {
			var mode = this.gps_mode;
			var that = this;
			if (!data) {
				alert("The system could not locate you using the geo-location service.  Is your GPS enabled and do you have a good signal?")
				return;
			}
			var coords = data.coords;
			var latitude = coords.latitude;
			var longitude = coords.longitude;
			var map = this.options.map;
			var newPosition = new OpenLayers.LonLat(longitude,latitude ).transform(
				new OpenLayers.Projection("EPSG:4326"), // transform from WGS 1984
				new OpenLayers.Projection("EPSG:900913") // to map Projection
			);	
			var newPositionPt = new OpenLayers.Geometry.Point(longitude,latitude).transform(
				new OpenLayers.Projection("EPSG:4326"), // transform from WGS 1984
				new OpenLayers.Projection("EPSG:900913") // to map Projection
			);
			
			newPositionPtFeature = new OpenLayers.Feature.Vector(newPositionPt);
			if (this.gpsLayer.features.length > 0) {
				this.gpsLayer.removeFeatures (this.gpsLayer.features[0]);
			}
			this.gpsLayer.addFeatures([newPositionPtFeature]);
			switch (mode) {
				case 'zoom':
					map.setCenter(newPosition);
					map.zoomTo( map.getNumZoomLevels() -2);
					break;
				
				case 'show_initial': 
					that.gps_mode = 'show';
				case 'follow':
					if (!this.generateBufferBounds().contains(newPositionPt.x,newPositionPt.y)) {
						map.setCenter(newPosition);
					}	
				case 'show':	
				
					window.setTimeout(function () {
						that._parseLocation(that.last_position);
					},1000);
					break;
				case 'inactive':
				
					break;
				default:
			
			}
			
		},

        // Public methods like these below can can be called 
                // externally: 
        // $("#myelem").foo( "enable", arguments );
		
		getLastPosition : function () {
			return this.last_position;
		},
        enable: function() {  },

        // Destroy an instantiated plugin and clean up modifications 
        // the widget has made to the DOM
        destroy: function () {
            //this.element.removeStuff();
            // For UI 1.8, destroy must be invoked from the 
            // base widget
            $.Widget.prototype.destroy.call(this);
            // For UI 1.9, define _destroy instead and don't 
            // worry about calling the base widget
        },


        //Respond to any changes the user makes to the option method
        _setOption: function ( key, value ) {
            switch (key) {
            case "someValue":
                //this.options.someValue = doSomethingWith( value );
                break;
            default:
                //this.options[ key ] = value;
                break;
            }

            // For UI 1.8, _setOption must be manually invoked from 
            // the base widget
            $.Widget.prototype._setOption.apply(this, arguments);
            // For UI 1.9 the _super method can be used instead
            // this._super( "_setOption", key, value );
        }
    });

})( jQuery, window, document );
