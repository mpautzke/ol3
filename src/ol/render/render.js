goog.provide('ol.render');

goog.require('goog.vec.Mat4');
goog.require('ol.geom.Geometry');


/**
 * @param {Array.<number>} flatCoordinates Flat coordinates.
 * @param {number} stride Stride.
 * @param {goog.vec.Mat4.AnyType} transform Transform.
 * @param {Array.<number>=} opt_dest Destination.
 * @return {Array.<number>} Transformed coordinates.
 */
ol.render.transformFlatCoordinates =
    function(flatCoordinates, stride, transform, opt_dest) {
  var m00 = goog.vec.Mat4.getElement(transform, 0, 0);
  var m10 = goog.vec.Mat4.getElement(transform, 1, 0);
  var m01 = goog.vec.Mat4.getElement(transform, 0, 1);
  var m11 = goog.vec.Mat4.getElement(transform, 1, 1);
  var m03 = goog.vec.Mat4.getElement(transform, 0, 3);
  var m13 = goog.vec.Mat4.getElement(transform, 1, 3);
  var dest = goog.isDef(opt_dest) ? opt_dest : [];
  var i = 0;
  var j, jj;
  for (j = 0, jj = flatCoordinates.length; j < jj; j += stride) {
    var x = flatCoordinates[j];
    var y = flatCoordinates[j + 1];
    dest[i++] = m00 * x + m01 * y + m03;
    dest[i++] = m10 * x + m11 * y + m13;
  }
  if (goog.isDef(opt_dest) && dest.length != i) {
    dest.length = i;
  }
  return dest;
};


/**
 * @param {ol.geom.Geometry} geometry Geometry.
 * @param {goog.vec.Mat4.AnyType} transform Transform.
 * @param {Array.<number>=} opt_dest Destination.
 * @return {Array.<number>} Transformed flat coordinates.
 */
ol.render.transformGeometry = function(geometry, transform, opt_dest) {
  var flatCoordinates = geometry.getFlatCoordinates();
  var stride = geometry.getStride();
  return ol.render.transformFlatCoordinates(
      flatCoordinates, stride, transform, opt_dest);
};