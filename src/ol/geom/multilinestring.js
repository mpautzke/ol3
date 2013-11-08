goog.provide('ol.geom.MultiLineString');

goog.require('goog.asserts');
goog.require('ol.extent');
goog.require('ol.geom.Geometry');



/**
 * @constructor
 * @extends {ol.geom.Geometry}
 * @param {Array.<Array.<ol.Coordinate>>} coordinatess Coordinatess.
 */
ol.geom.MultiLineString = function(coordinatess) {

  goog.base(this);

  /**
   * @private
   * @type {Array.<Array.<ol.Coordinate>>}
   */
  this.coordinatess_ = coordinatess;

};
goog.inherits(ol.geom.MultiLineString, ol.geom.Geometry);


/**
 * @return {Array.<Array.<ol.Coordinate>>} Coordinatess.
 */
ol.geom.MultiLineString.prototype.getCoordinatess = function() {
  return this.coordinatess_;
};


/**
 * @inheritDoc
 */
ol.geom.MultiLineString.prototype.getExtent = function(opt_extent) {
  if (this.extentRevision != this.revision) {
    this.extent = ol.extent.createOrUpdateEmpty(this.extent);
    var coordinatess = this.coordinatess_;
    var i, ii;
    for (i = 0, ii = coordinatess.length; i < ii; ++i) {
      this.extent = ol.extent.extendCoordinates(this.extent, coordinatess[i]);
    }
    this.extentRevision = this.revision;
  }
  goog.asserts.assert(goog.isDef(this.extent));
  return ol.extent.returnOrUpdate(this.extent, opt_extent);
};


/**
 * @inheritDoc
 */
ol.geom.MultiLineString.prototype.getType = function() {
  return ol.geom.GeometryType.MULTI_LINE_STRING;
};


/**
 * @param {Array.<Array.<ol.Coordinate>>} coordinatess Coordinatess.
 */
ol.geom.MultiLineString.prototype.setCoordinatess = function(coordinatess) {
  this.coordinatess_ = coordinatess;
};