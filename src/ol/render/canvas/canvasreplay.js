// FIXME decide default snapToPixel behaviour
// FIXME add option to apply snapToPixel to all coordinates?
// FIXME can eliminate empty set styles and strokes (when all geoms skipped)

goog.provide('ol.render.canvas.ReplayGroup');

goog.require('goog.array');
goog.require('goog.asserts');
goog.require('goog.dom');
goog.require('goog.dom.TagName');
goog.require('goog.object');
goog.require('goog.vec.Mat4');
goog.require('ol.color');
goog.require('ol.extent');
goog.require('ol.geom.flat');
goog.require('ol.render.IRender');
goog.require('ol.render.IReplayGroup');
goog.require('ol.render.canvas');
goog.require('ol.vec.Mat4');


/**
 * @enum {number}
 */
ol.render.canvas.Instruction = {
  BEGIN_GEOMETRY: 0,
  BEGIN_PATH: 1,
  CLOSE_PATH: 2,
  DRAW_IMAGE: 3,
  END_GEOMETRY: 4,
  FILL: 5,
  MOVE_TO_LINE_TO: 6,
  SET_FILL_STYLE: 7,
  SET_STROKE_STYLE: 8,
  STROKE: 9
};



/**
 * @constructor
 * @implements {ol.render.IRender}
 * @protected
 */
ol.render.canvas.Replay = function() {

  /**
   * @protected
   * @type {Array.<*>}
   */
  this.instructions = [];

  /**
   * @protected
   * @type {Array.<number>}
   */
  this.coordinates = [];

  /**
   * @private
   * @type {goog.vec.Mat4.Number}
   */
  this.renderedTransform_ = goog.vec.Mat4.createNumber();

  /**
   * @private
   * @type {Array.<number>}
   */
  this.pixelCoordinates_ = [];

  /**
   * @private
   * @type {ol.Extent}
   */
  this.extent_ = ol.extent.createEmpty();

};


/**
 * @param {Array.<number>} flatCoordinates Flat coordinates.
 * @param {number} offset Offset.
 * @param {number} end End.
 * @param {number} stride Stride.
 * @param {boolean} close Close.
 * @protected
 * @return {number} My end.
 */
ol.render.canvas.Replay.prototype.appendFlatCoordinates =
    function(flatCoordinates, offset, end, stride, close) {
  var myEnd = this.coordinates.length;
  var i;
  for (i = offset; i < end; i += stride) {
    this.coordinates[myEnd++] = flatCoordinates[i];
    this.coordinates[myEnd++] = flatCoordinates[i + 1];
  }
  if (close) {
    this.coordinates[myEnd++] = flatCoordinates[offset];
    this.coordinates[myEnd++] = flatCoordinates[offset + 1];
  }
  return myEnd;
};


/**
 * @param {ol.geom.Geometry} geometry Geometry.
 * @protected
 * @return {Array} Begin geometry instruction.
 */
ol.render.canvas.Replay.prototype.beginGeometry = function(geometry) {
  var beginGeometryInstruction =
      [ol.render.canvas.Instruction.BEGIN_GEOMETRY, geometry, 0, 0];
  this.instructions.push(beginGeometryInstruction);
  return beginGeometryInstruction;
};


/**
 * @param {CanvasRenderingContext2D} context Context.
 * @param {goog.vec.Mat4.AnyType} transform Transform.
 * @param {function(ol.geom.Geometry): boolean} renderGeometryFunction Render
 *     geometry function.
 * @param {function(ol.geom.Geometry, Object)=} opt_callback Geometry callback.
 */
ol.render.canvas.Replay.prototype.replay =
    function(context, transform, renderGeometryFunction, opt_callback) {
  var perGeometryMode = goog.isDef(opt_callback);
  var batchMode = !perGeometryMode;
  /** @type {Array.<number>} */
  var pixelCoordinates;
  if (ol.vec.Mat4.equals2D(transform, this.renderedTransform_)) {
    pixelCoordinates = this.pixelCoordinates_;
  } else {
    pixelCoordinates = ol.geom.flat.transform2D(
        this.coordinates, 2, transform, this.pixelCoordinates_);
    goog.vec.Mat4.setFromArray(this.renderedTransform_, transform);
    goog.asserts.assert(pixelCoordinates === this.pixelCoordinates_);
  }
  var instructions = this.instructions;
  var i = 0; // instruction index
  var ii = instructions.length; // end of instructions
  var d = 0; // data index
  var dd; // end of per-instruction data
  while (i < ii) {
    var instruction = instructions[i];
    var type = /** @type {ol.render.canvas.Instruction} */ (instruction[0]);
    var geometry;
    var executeInPerGeometryMode, executeInBatchMode;
    if (type == ol.render.canvas.Instruction.BEGIN_GEOMETRY) {
      geometry = /** @type {ol.geom.Geometry} */ (instruction[1]);
      if (renderGeometryFunction(geometry)) {
        ++i;
      } else {
        d = /** @type {number} */ (instruction[2]);
        i = /** @type {number} */ (instruction[3]);
      }
    } else if (type == ol.render.canvas.Instruction.BEGIN_PATH) {
      executeInPerGeometryMode = /** @type {boolean} */ (instruction[1]);
      executeInBatchMode = /** @type {boolean} */ (instruction[2]);
      if ((perGeometryMode && executeInPerGeometryMode) ||
          (batchMode && executeInBatchMode)) {
        context.beginPath();
      }
      ++i;
    } else if (type == ol.render.canvas.Instruction.CLOSE_PATH) {
      context.closePath();
      ++i;
    } else if (type == ol.render.canvas.Instruction.DRAW_IMAGE) {
      dd = /** @type {number} */ (instruction[1]);
      var anchorX = /** @type {number} */ (instruction[2]);
      var anchorY = /** @type {number} */ (instruction[3]);
      var width = /** @type {number} */ (instruction[4]);
      var height = /** @type {number} */ (instruction[5]);
      var image =  /** @type {HTMLCanvasElement|HTMLVideoElement|Image} */
          (instruction[6]);
      var snapToPixel = /** @type {boolean|undefined} */ (instruction[7]);
      for (; d < dd; d += 2) {
        var x = pixelCoordinates[d] - anchorX;
        var y = pixelCoordinates[d + 1] - anchorY;
        if (snapToPixel) {
          x = (x + 0.5) | 0;
          y = (y + 0.5) | 0;
        }
        context.drawImage(image, x, y, width, height);
      }
      ++i;
    } else if (type == ol.render.canvas.Instruction.END_GEOMETRY) {
      if (perGeometryMode) {
        goog.asserts.assert(goog.isDef(opt_callback));
        geometry = /** @type {ol.geom.Geometry} */ (instruction[1]);
        var data = /** @type {Object} */ (instruction[2]);
        opt_callback(geometry, data);
      }
      ++i;
    } else if (type == ol.render.canvas.Instruction.FILL) {
      context.fill();
      ++i;
    } else if (type == ol.render.canvas.Instruction.MOVE_TO_LINE_TO) {
      context.moveTo(pixelCoordinates[d], pixelCoordinates[d + 1]);
      goog.asserts.assert(goog.isNumber(instruction[1]));
      dd = /** @type {number} */ (instruction[1]);
      for (d += 2; d < dd; d += 2) {
        context.lineTo(pixelCoordinates[d], pixelCoordinates[d + 1]);
      }
      ++i;
    } else if (type == ol.render.canvas.Instruction.SET_FILL_STYLE) {
      goog.asserts.assert(goog.isString(instruction[1]));
      context.fillStyle = /** @type {string} */ (instruction[1]);
      ++i;
    } else if (type == ol.render.canvas.Instruction.SET_STROKE_STYLE) {
      goog.asserts.assert(goog.isString(instruction[1]));
      goog.asserts.assert(goog.isNumber(instruction[2]));
      goog.asserts.assert(goog.isString(instruction[3]));
      goog.asserts.assert(goog.isString(instruction[4]));
      goog.asserts.assert(goog.isNumber(instruction[5]));
      goog.asserts.assert(!goog.isNull(instruction[6]));
      context.strokeStyle = /** @type {string} */ (instruction[1]);
      context.lineWidth = /** @type {number} */ (instruction[2]);
      context.lineCap = /** @type {string} */ (instruction[3]);
      context.lineJoin = /** @type {string} */ (instruction[4]);
      context.miterLimit = /** @type {number} */ (instruction[5]);
      if (goog.isDef(context.setLineDash)) {
        context.setLineDash(/** @type {Array.<number>} */ (instruction[6]));
      }
      ++i;
    } else if (type == ol.render.canvas.Instruction.STROKE) {
      executeInPerGeometryMode = /** @type {boolean} */ (instruction[1]);
      executeInBatchMode = /** @type {boolean} */ (instruction[2]);
      if ((perGeometryMode && executeInPerGeometryMode) ||
          (batchMode && executeInBatchMode)) {
        context.stroke();
      }
      ++i;
    } else {
      goog.asserts.fail();
      ++i; // consume the instruction anyway, to avoid an infinite loop
    }
  }
  // assert that all data were consumed
  goog.asserts.assert(d == pixelCoordinates.length);
  // assert that all instructions were consumed
  goog.asserts.assert(i == instructions.length);
};


/**
 * @inheritDoc
 */
ol.render.canvas.Replay.prototype.drawFeature = goog.abstractMethod;


/**
 * @inheritDoc
 */
ol.render.canvas.Replay.prototype.drawLineStringGeometry = goog.abstractMethod;


/**
 * @inheritDoc
 */
ol.render.canvas.Replay.prototype.drawMultiLineStringGeometry =
    goog.abstractMethod;


/**
 * @inheritDoc
 */
ol.render.canvas.Replay.prototype.drawPointGeometry = goog.abstractMethod;


/**
 * @inheritDoc
 */
ol.render.canvas.Replay.prototype.drawMultiPointGeometry = goog.abstractMethod;


/**
 * @inheritDoc
 */
ol.render.canvas.Replay.prototype.drawPolygonGeometry = goog.abstractMethod;


/**
 * @inheritDoc
 */
ol.render.canvas.Replay.prototype.drawMultiPolygonGeometry =
    goog.abstractMethod;


/**
 * @param {ol.geom.Geometry} geometry Geometry.
 * @param {Array} beginGeometryInstruction Begin geometry instruction.
 * @param {Object} data Opaque data object.
 */
ol.render.canvas.Replay.prototype.endGeometry =
    function(geometry, beginGeometryInstruction, data) {
  beginGeometryInstruction[2] = this.coordinates.length;
  beginGeometryInstruction[3] = this.instructions.length;
  var endGeometryInstruction =
      [ol.render.canvas.Instruction.END_GEOMETRY, geometry, data];
  this.instructions.push(endGeometryInstruction);
};


/**
 * FIXME empty description for jsdoc
 */
ol.render.canvas.Replay.prototype.finish = goog.nullFunction;


/**
 * @return {ol.Extent} Extent.
 */
ol.render.canvas.Replay.prototype.getExtent = function() {
  return this.extent_;
};


/**
 * @inheritDoc
 */
ol.render.canvas.Replay.prototype.setFillStrokeStyle = goog.abstractMethod;


/**
 * @inheritDoc
 */
ol.render.canvas.Replay.prototype.setImageStyle = goog.abstractMethod;


/**
 * @inheritDoc
 */
ol.render.canvas.Replay.prototype.setTextStyle = goog.abstractMethod;



/**
 * @constructor
 * @extends {ol.render.canvas.Replay}
 * @protected
 */
ol.render.canvas.ImageReplay = function() {

  goog.base(this);

  /**
   * @private
   * @type {number|undefined}
   */
  this.anchorX_ = undefined;

  /**
   * @private
   * @type {number|undefined}
   */
  this.anchorY_ = undefined;

  /**
   * @private
   * @type {HTMLCanvasElement|HTMLVideoElement|Image}
   */
  this.image_ = null;

  /**
   * @private
   * @type {number|undefined}
   */
  this.height_ = undefined;

  /**
   * @private
   * @type {number|undefined}
   */
  this.width_ = undefined;

  /**
   * @private
   * @type {boolean|undefined}
   */
  this.snapToPixel_ = undefined;

};
goog.inherits(ol.render.canvas.ImageReplay, ol.render.canvas.Replay);


/**
 * @param {Array.<number>} flatCoordinates Flat coordinates.
 * @param {number} offset Offset.
 * @param {number} end End.
 * @param {number} stride Stride.
 * @private
 * @return {number} My end.
 */
ol.render.canvas.ImageReplay.prototype.drawCoordinates_ =
    function(flatCoordinates, offset, end, stride) {
  return this.appendFlatCoordinates(
      flatCoordinates, offset, end, stride, false);
};


/**
 * @inheritDoc
 */
ol.render.canvas.ImageReplay.prototype.drawPointGeometry =
    function(pointGeometry, data) {
  if (goog.isNull(this.image_)) {
    return;
  }
  goog.asserts.assert(goog.isDef(this.anchorX_));
  goog.asserts.assert(goog.isDef(this.anchorY_));
  goog.asserts.assert(goog.isDef(this.height_));
  goog.asserts.assert(goog.isDef(this.width_));
  ol.extent.extend(this.extent_, pointGeometry.getExtent());
  var beginGeometryInstruction = this.beginGeometry(pointGeometry);
  var flatCoordinates = pointGeometry.getFlatCoordinates();
  var stride = pointGeometry.getStride();
  var myEnd = this.drawCoordinates_(
      flatCoordinates, 0, flatCoordinates.length, stride);
  this.instructions.push([
    ol.render.canvas.Instruction.DRAW_IMAGE, myEnd,
    this.anchorX_, this.anchorY_, this.width_, this.height_,
    this.image_, this.snapToPixel_
  ]);
  this.endGeometry(pointGeometry, beginGeometryInstruction, data);
};


/**
 * @inheritDoc
 */
ol.render.canvas.ImageReplay.prototype.drawMultiPointGeometry =
    function(multiPointGeometry, data) {
  if (goog.isNull(this.image_)) {
    return;
  }
  goog.asserts.assert(goog.isDef(this.anchorX_));
  goog.asserts.assert(goog.isDef(this.anchorY_));
  goog.asserts.assert(goog.isDef(this.height_));
  goog.asserts.assert(goog.isDef(this.width_));
  ol.extent.extend(this.extent_, multiPointGeometry.getExtent());
  var beginGeometryInstruction = this.beginGeometry(multiPointGeometry);
  var flatCoordinates = multiPointGeometry.getFlatCoordinates();
  var stride = multiPointGeometry.getStride();
  var myEnd = this.drawCoordinates_(
      flatCoordinates, 0, flatCoordinates.length, stride);
  this.instructions.push([
    ol.render.canvas.Instruction.DRAW_IMAGE, myEnd,
    this.anchorX_, this.anchorY_, this.width_, this.height_,
    this.image_, this.snapToPixel_
  ]);
  this.endGeometry(multiPointGeometry, beginGeometryInstruction, data);
};


/**
 * @inheritDoc
 */
ol.render.canvas.ImageReplay.prototype.finish = function() {
  // FIXME this doesn't really protect us against further calls to draw*Geometry
  this.anchorX_ = undefined;
  this.anchorY_ = undefined;
  this.image_ = null;
  this.height_ = undefined;
  this.width_ = undefined;
  this.snapToPixel_ = undefined;
};


/**
 * @inheritDoc
 */
ol.render.canvas.ImageReplay.prototype.setImageStyle = function(imageStyle) {
  goog.asserts.assert(!goog.isNull(imageStyle));
  goog.asserts.assert(!goog.isNull(imageStyle.anchor));
  goog.asserts.assert(goog.isDef(imageStyle.size));
  goog.asserts.assert(!goog.isNull(imageStyle.image));
  this.anchorX_ = imageStyle.anchor[0];
  this.anchorY_ = imageStyle.anchor[1];
  this.image_ = imageStyle.image;
  this.width_ = imageStyle.size[0];
  this.height_ = imageStyle.size[1];
  this.snapToPixel_ = imageStyle.snapToPixel;
};



/**
 * @constructor
 * @extends {ol.render.canvas.Replay}
 * @protected
 */
ol.render.canvas.LineStringReplay = function() {

  goog.base(this);

  /**
   * @private
   * @type {{currentStrokeStyle: (string|undefined),
   *         currentLineCap: (string|undefined),
   *         currentLineDash: Array.<number>,
   *         currentLineJoin: (string|undefined),
   *         currentLineWidth: (number|undefined),
   *         currentMiterLimit: (number|undefined),
   *         lastStroke: number,
   *         strokeStyle: (string|undefined),
   *         lineCap: (string|undefined),
   *         lineDash: Array.<number>,
   *         lineJoin: (string|undefined),
   *         lineWidth: (number|undefined),
   *         miterLimit: (number|undefined)}|null}
   */
  this.state_ = {
    currentStrokeStyle: undefined,
    currentLineCap: undefined,
    currentLineDash: null,
    currentLineJoin: undefined,
    currentLineWidth: undefined,
    currentMiterLimit: undefined,
    lastStroke: 0,
    strokeStyle: undefined,
    lineCap: undefined,
    lineDash: null,
    lineJoin: undefined,
    lineWidth: undefined,
    miterLimit: undefined
  };

};
goog.inherits(ol.render.canvas.LineStringReplay, ol.render.canvas.Replay);


/**
 * @param {Array.<number>} flatCoordinates Flat coordinates.
 * @param {number} offset Offset.
 * @param {number} end End.
 * @param {number} stride Stride.
 * @private
 * @return {number} end.
 */
ol.render.canvas.LineStringReplay.prototype.drawFlatCoordinates_ =
    function(flatCoordinates, offset, end, stride) {
  var myEnd = this.appendFlatCoordinates(
      flatCoordinates, offset, end, stride, false);
  this.instructions.push([ol.render.canvas.Instruction.MOVE_TO_LINE_TO, myEnd]);
  return end;
};


/**
 * @private
 */
ol.render.canvas.LineStringReplay.prototype.setStrokeStyle_ = function() {
  var state = this.state_;
  var strokeStyle = state.strokeStyle;
  var lineCap = state.lineCap;
  var lineDash = state.lineDash;
  var lineJoin = state.lineJoin;
  var lineWidth = state.lineWidth;
  var miterLimit = state.miterLimit;
  goog.asserts.assert(goog.isDef(strokeStyle));
  goog.asserts.assert(goog.isDef(lineCap));
  goog.asserts.assert(!goog.isNull(lineDash));
  goog.asserts.assert(goog.isDef(lineJoin));
  goog.asserts.assert(goog.isDef(lineWidth));
  goog.asserts.assert(goog.isDef(miterLimit));
  if (state.currentStrokeStyle != strokeStyle ||
      state.currentLineCap != lineCap ||
      state.currentLineDash != lineDash ||
      state.currentLineJoin != lineJoin ||
      state.currentLineWidth != lineWidth ||
      state.currentMiterLimit != miterLimit) {
    if (state.lastStroke != this.coordinates.length) {
      this.instructions.push(
          [ol.render.canvas.Instruction.STROKE, false, true]);
      state.lastStroke = this.coordinates.length;
    }
    this.instructions.push(
        [ol.render.canvas.Instruction.SET_STROKE_STYLE,
         strokeStyle, lineWidth, lineCap, lineJoin, miterLimit, lineDash],
        [ol.render.canvas.Instruction.BEGIN_PATH, false, true]);
    state.currentStrokeStyle = strokeStyle;
    state.currentLineCap = lineCap;
    state.currentLineDash = lineDash;
    state.currentLineJoin = lineJoin;
    state.currentLineWidth = lineWidth;
    state.currentMiterLimit = miterLimit;
  }
};


/**
 * @inheritDoc
 */
ol.render.canvas.LineStringReplay.prototype.drawLineStringGeometry =
    function(lineStringGeometry, data) {
  var state = this.state_;
  goog.asserts.assert(!goog.isNull(state));
  var strokeStyle = state.strokeStyle;
  var lineWidth = state.lineWidth;
  if (!goog.isDef(strokeStyle) || !goog.isDef(lineWidth)) {
    return;
  }
  ol.extent.extend(this.extent_, lineStringGeometry.getExtent());
  this.setStrokeStyle_();
  var beginGeometryInstruction = this.beginGeometry(lineStringGeometry);
  this.instructions.push(
      [ol.render.canvas.Instruction.BEGIN_PATH, true, false]);
  var flatCoordinates = lineStringGeometry.getFlatCoordinates();
  var stride = lineStringGeometry.getStride();
  this.drawFlatCoordinates_(
      flatCoordinates, 0, flatCoordinates.length, stride);
  this.instructions.push([ol.render.canvas.Instruction.STROKE, true, false]);
  this.endGeometry(lineStringGeometry, beginGeometryInstruction, data);
};


/**
 * @inheritDoc
 */
ol.render.canvas.LineStringReplay.prototype.drawMultiLineStringGeometry =
    function(multiLineStringGeometry, data) {
  var state = this.state_;
  goog.asserts.assert(!goog.isNull(state));
  var strokeStyle = state.strokeStyle;
  var lineWidth = state.lineWidth;
  if (!goog.isDef(strokeStyle) || !goog.isDef(lineWidth)) {
    return;
  }
  ol.extent.extend(this.extent_, multiLineStringGeometry.getExtent());
  this.setStrokeStyle_();
  this.instructions.push([
    ol.render.canvas.Instruction.BEGIN_PATH, true, false]);
  var beginGeometryInstruction = this.beginGeometry(multiLineStringGeometry);
  var ends = multiLineStringGeometry.getEnds();
  var flatCoordinates = multiLineStringGeometry.getFlatCoordinates();
  var stride = multiLineStringGeometry.getStride();
  var offset = 0;
  var i, ii;
  for (i = 0, ii = ends.length; i < ii; ++i) {
    offset = this.drawFlatCoordinates_(
        flatCoordinates, offset, ends[i], stride);
  }
  this.instructions.push(
      [ol.render.canvas.Instruction.STROKE, true, false]);
  this.endGeometry(multiLineStringGeometry, beginGeometryInstruction, data);
};


/**
 * @inheritDoc
 */
ol.render.canvas.LineStringReplay.prototype.finish = function() {
  var state = this.state_;
  goog.asserts.assert(!goog.isNull(state));
  if (state.lastStroke != this.coordinates.length) {
    this.instructions.push([ol.render.canvas.Instruction.STROKE, false, true]);
  }
  this.state_ = null;
};


/**
 * @inheritDoc
 */
ol.render.canvas.LineStringReplay.prototype.setFillStrokeStyle =
    function(fillStyle, strokeStyle) {
  goog.asserts.assert(!goog.isNull(this.state_));
  goog.asserts.assert(goog.isNull(fillStyle));
  goog.asserts.assert(!goog.isNull(strokeStyle));
  this.state_.strokeStyle = ol.color.asString(!goog.isNull(strokeStyle.color) ?
      strokeStyle.color : ol.render.canvas.defaultStrokeStyle);
  this.state_.lineCap = goog.isDef(strokeStyle.lineCap) ?
      strokeStyle.lineCap : ol.render.canvas.defaultLineCap;
  this.state_.lineDash = !goog.isNull(strokeStyle.lineDash) ?
      strokeStyle.lineDash : ol.render.canvas.defaultLineDash;
  this.state_.lineJoin = goog.isDef(strokeStyle.lineJoin) ?
      strokeStyle.lineJoin : ol.render.canvas.defaultLineJoin;
  this.state_.lineWidth = goog.isDef(strokeStyle.width) ?
      strokeStyle.width : ol.render.canvas.defaultLineWidth;
  this.state_.miterLimit = goog.isDef(strokeStyle.miterLimit) ?
      strokeStyle.miterLimit : ol.render.canvas.defaultMiterLimit;
};



/**
 * @constructor
 * @extends {ol.render.canvas.Replay}
 * @protected
 */
ol.render.canvas.PolygonReplay = function() {

  goog.base(this);

  /**
   * @private
   * @type {{currentFillStyle: (string|undefined),
   *         currentStrokeStyle: (string|undefined),
   *         currentLineCap: (string|undefined),
   *         currentLineDash: Array.<number>,
   *         currentLineJoin: (string|undefined),
   *         currentLineWidth: (number|undefined),
   *         currentMiterLimit: (number|undefined),
   *         fillStyle: (string|undefined),
   *         strokeStyle: (string|undefined),
   *         lineCap: (string|undefined),
   *         lineDash: Array.<number>,
   *         lineJoin: (string|undefined),
   *         lineWidth: (number|undefined),
   *         miterLimit: (number|undefined)}|null}
   */
  this.state_ = {
    currentFillStyle: undefined,
    currentStrokeStyle: undefined,
    currentLineCap: undefined,
    currentLineDash: null,
    currentLineJoin: undefined,
    currentLineWidth: undefined,
    currentMiterLimit: undefined,
    fillStyle: undefined,
    strokeStyle: undefined,
    lineCap: undefined,
    lineDash: null,
    lineJoin: undefined,
    lineWidth: undefined,
    miterLimit: undefined
  };

};
goog.inherits(ol.render.canvas.PolygonReplay, ol.render.canvas.Replay);


/**
 * @param {Array.<number>} flatCoordinates Flat coordinates.
 * @param {number} offset Offset.
 * @param {Array.<number>} ends Ends.
 * @param {number} stride Stride.
 * @private
 * @return {number} End.
 */
ol.render.canvas.PolygonReplay.prototype.drawFlatCoordinatess_ =
    function(flatCoordinates, offset, ends, stride) {
  var state = this.state_;
  this.instructions.push(
      [ol.render.canvas.Instruction.BEGIN_PATH, true, true]);
  var i, ii;
  for (i = 0, ii = ends.length; i < ii; ++i) {
    var end = ends[i];
    var myEnd =
        this.appendFlatCoordinates(flatCoordinates, offset, end, stride, true);
    this.instructions.push(
        [ol.render.canvas.Instruction.MOVE_TO_LINE_TO, myEnd],
        [ol.render.canvas.Instruction.CLOSE_PATH]);
    offset = end;
  }
  // FIXME is it quicker to fill and stroke each polygon individually,
  // FIXME or all polygons together?
  if (goog.isDef(state.fillStyle)) {
    this.instructions.push([ol.render.canvas.Instruction.FILL]);
  }
  if (goog.isDef(state.strokeStyle)) {
    goog.asserts.assert(goog.isDef(state.lineWidth));
    this.instructions.push([ol.render.canvas.Instruction.STROKE, true, true]);
  }
  return offset;
};


/**
 * @inheritDoc
 */
ol.render.canvas.PolygonReplay.prototype.drawPolygonGeometry =
    function(polygonGeometry, data) {
  var state = this.state_;
  goog.asserts.assert(!goog.isNull(state));
  var fillStyle = state.fillStyle;
  var strokeStyle = state.strokeStyle;
  if (!goog.isDef(fillStyle) && !goog.isDef(strokeStyle)) {
    return;
  }
  if (goog.isDef(strokeStyle)) {
    goog.asserts.assert(goog.isDef(state.lineWidth));
  }
  ol.extent.extend(this.extent_, polygonGeometry.getExtent());
  this.setFillStrokeStyles_();
  var beginGeometryInstruction = this.beginGeometry(polygonGeometry);
  var ends = polygonGeometry.getEnds();
  var flatCoordinates = polygonGeometry.getFlatCoordinates();
  var stride = polygonGeometry.getStride();
  this.drawFlatCoordinatess_(flatCoordinates, 0, ends, stride);
  this.endGeometry(polygonGeometry, beginGeometryInstruction, data);
};


/**
 * @inheritDoc
 */
ol.render.canvas.PolygonReplay.prototype.drawMultiPolygonGeometry =
    function(multiPolygonGeometry, data) {
  var state = this.state_;
  goog.asserts.assert(!goog.isNull(state));
  var fillStyle = state.fillStyle;
  var strokeStyle = state.strokeStyle;
  if (!goog.isDef(fillStyle) && !goog.isDef(strokeStyle)) {
    return;
  }
  if (goog.isDef(strokeStyle)) {
    goog.asserts.assert(goog.isDef(state.lineWidth));
  }
  ol.extent.extend(this.extent_, multiPolygonGeometry.getExtent());
  this.setFillStrokeStyles_();
  var beginGeometryInstruction = this.beginGeometry(multiPolygonGeometry);
  var endss = multiPolygonGeometry.getEndss();
  var flatCoordinates = multiPolygonGeometry.getFlatCoordinates();
  var stride = multiPolygonGeometry.getStride();
  var offset = 0;
  var i, ii;
  for (i = 0, ii = endss.length; i < ii; ++i) {
    offset = this.drawFlatCoordinatess_(
        flatCoordinates, offset, endss[i], stride);
  }
  this.endGeometry(multiPolygonGeometry, beginGeometryInstruction, data);
};


/**
 * @inheritDoc
 */
ol.render.canvas.PolygonReplay.prototype.finish = function() {
  goog.asserts.assert(!goog.isNull(this.state_));
  this.state_ = null;
};


/**
 * @inheritDoc
 */
ol.render.canvas.PolygonReplay.prototype.setFillStrokeStyle =
    function(fillStyle, strokeStyle) {
  goog.asserts.assert(!goog.isNull(this.state_));
  goog.asserts.assert(!goog.isNull(fillStyle) || !goog.isNull(strokeStyle));
  var state = this.state_;
  if (!goog.isNull(fillStyle)) {
    state.fillStyle = ol.color.asString(!goog.isNull(fillStyle.color) ?
        fillStyle.color : ol.render.canvas.defaultFillStyle);
  } else {
    state.fillStyle = undefined;
  }
  if (!goog.isNull(strokeStyle)) {
    state.strokeStyle = ol.color.asString(!goog.isNull(strokeStyle.color) ?
        strokeStyle.color : ol.render.canvas.defaultStrokeStyle);
    state.lineCap = goog.isDef(strokeStyle.lineCap) ?
        strokeStyle.lineCap : ol.render.canvas.defaultLineCap;
    state.lineDash = !goog.isNull(strokeStyle.lineDash) ?
        strokeStyle.lineDash : ol.render.canvas.defaultLineDash;
    state.lineJoin = goog.isDef(strokeStyle.lineJoin) ?
        strokeStyle.lineJoin : ol.render.canvas.defaultLineJoin;
    state.lineWidth = goog.isDef(strokeStyle.width) ?
        strokeStyle.width : ol.render.canvas.defaultLineWidth;
    state.miterLimit = goog.isDef(strokeStyle.miterLimit) ?
        strokeStyle.miterLimit : ol.render.canvas.defaultMiterLimit;
  } else {
    state.strokeStyle = undefined;
    state.lineCap = undefined;
    state.lineDash = null;
    state.lineJoin = undefined;
    state.lineWidth = undefined;
    state.miterLimit = undefined;
  }
};


/**
 * @private
 */
ol.render.canvas.PolygonReplay.prototype.setFillStrokeStyles_ = function() {
  var state = this.state_;
  var fillStyle = state.fillStyle;
  var strokeStyle = state.strokeStyle;
  var lineCap = state.lineCap;
  var lineDash = state.lineDash;
  var lineJoin = state.lineJoin;
  var lineWidth = state.lineWidth;
  var miterLimit = state.miterLimit;
  if (goog.isDef(fillStyle) && state.currentFillStyle != fillStyle) {
    this.instructions.push(
        [ol.render.canvas.Instruction.SET_FILL_STYLE, fillStyle]);
    state.currentFillStyle = state.fillStyle;
  }
  if (goog.isDef(strokeStyle)) {
    goog.asserts.assert(goog.isDef(lineCap));
    goog.asserts.assert(!goog.isNull(lineDash));
    goog.asserts.assert(goog.isDef(lineJoin));
    goog.asserts.assert(goog.isDef(lineWidth));
    goog.asserts.assert(goog.isDef(miterLimit));
    if (state.currentStrokeStyle != strokeStyle ||
        state.currentLineCap != lineCap ||
        state.currentLineDash != lineDash ||
        state.currentLineJoin != lineJoin ||
        state.currentLineWidth != lineWidth ||
        state.currentMiterLimit != miterLimit) {
      this.instructions.push(
          [ol.render.canvas.Instruction.SET_STROKE_STYLE,
           strokeStyle, lineWidth, lineCap, lineJoin, miterLimit, lineDash]);
      state.currentStrokeStyle = strokeStyle;
      state.currentLineCap = lineCap;
      state.currentLineDash = lineDash;
      state.currentLineJoin = lineJoin;
      state.currentLineWidth = lineWidth;
      state.currentMiterLimit = miterLimit;
    }
  }
};



/**
 * @constructor
 * @implements {ol.render.IReplayGroup}
 */
ol.render.canvas.ReplayGroup = function() {

  /**
   * @private
   * @type {Object.<string,
   *        Object.<ol.render.ReplayType, ol.render.canvas.Replay>>}
   */
  this.replayesByZIndex_ = {};

  /**
   * @type {HTMLCanvasElement}
   */
  var hitDetectionCanvas = /** @type {HTMLCanvasElement} */
      (goog.dom.createElement(goog.dom.TagName.CANVAS));
  hitDetectionCanvas.width = 1;
  hitDetectionCanvas.height = 1;

  /**
   * @private
   * @type {CanvasRenderingContext2D}
   */
  this.hitDetectionContext_ = /** @type {CanvasRenderingContext2D} */
      (hitDetectionCanvas.getContext('2d'));

  /**
   * @private
   * @type {!goog.vec.Mat4.Number}
   */
  this.hitDetectionTransform_ = goog.vec.Mat4.createNumber();

};


/**
 * @param {CanvasRenderingContext2D} context Context.
 * @param {ol.Extent} extent Extent.
 * @param {goog.vec.Mat4.AnyType} transform Transform.
 * @param {function(ol.geom.Geometry): boolean} renderGeometryFunction Render
 *     geometry function.
 * @param {function(ol.geom.Geometry, Object)=} opt_callback Geometry callback.
 */
ol.render.canvas.ReplayGroup.prototype.replay =
    function(context, extent, transform, renderGeometryFunction, opt_callback) {
  /** @type {Array.<number>} */
  var zs = goog.array.map(goog.object.getKeys(this.replayesByZIndex_), Number);
  goog.array.sort(zs);
  this.replay_(zs, context, extent, transform, renderGeometryFunction,
      opt_callback);
};


/**
 * @private
 * @param {Array.<number>} zs Z-indices array.
 * @param {CanvasRenderingContext2D} context Context.
 * @param {ol.Extent} extent Extent.
 * @param {goog.vec.Mat4.AnyType} transform Transform.
 * @param {function(ol.geom.Geometry): boolean} renderGeometryFunction Render
 *     geometry function.
 * @param {function(ol.geom.Geometry, Object)=} opt_callback Geometry callback.
 */
ol.render.canvas.ReplayGroup.prototype.replay_ =
    function(zs, context, extent, transform, renderGeometryFunction,
             opt_callback) {
  var i, ii;
  for (i = 0, ii = zs.length; i < ii; ++i) {
    var replayes = this.replayesByZIndex_[zs[i].toString()];
    var replayType;
    for (replayType in replayes) {
      var replay = replayes[replayType];
      if (ol.extent.intersects(extent, replay.getExtent())) {
        replay.replay(context, transform, renderGeometryFunction, opt_callback);
      }
    }
  }
};


/**
 * @param {ol.Extent} extent Extent.
 * @param {number} resolution Resolution.
 * @param {ol.Coordinate} coordinate Coordinate.
 * @param {function(ol.geom.Geometry): boolean} renderGeometryFunction Render
 *     geometry function.
 * @param {function(ol.geom.Geometry, Object)} callback Geometry callback.
 */
ol.render.canvas.ReplayGroup.prototype.forEachGeometryAtCoordinate =
    function(extent, resolution, coordinate, renderGeometryFunction, callback) {

  var transform = this.hitDetectionTransform_;
  ol.vec.Mat4.makeTransform2D(transform, 0.5, 0.5,
      1 / resolution, -1 / resolution, 0, -coordinate[0], -coordinate[1]);

  /** @type {Array.<number>} */
  var zs = goog.array.map(goog.object.getKeys(this.replayesByZIndex_), Number);
  goog.array.sort(zs, function(a, b) { return b - a; });

  var context = this.hitDetectionContext_;

  this.replay_(zs, context, extent, transform, renderGeometryFunction,
      /**
       * @param {ol.geom.Geometry} geometry Geometry.
       * @param {Object} data Opaque data object.
       */
      function(geometry, data) {
        var imageData = context.getImageData(0, 0, 1, 1).data;
        if (imageData[3] > 0) {
          callback(geometry, data);
          context.clearRect(0, 0, 1, 1);
        }
      });
};


/**
 * @inheritDoc
 */
ol.render.canvas.ReplayGroup.prototype.finish = function() {
  var zKey;
  for (zKey in this.replayesByZIndex_) {
    var replayes = this.replayesByZIndex_[zKey];
    var replayKey;
    for (replayKey in replayes) {
      replayes[replayKey].finish();
    }
  }
};


/**
 * @inheritDoc
 */
ol.render.canvas.ReplayGroup.prototype.getReplay =
    function(zIndex, replayType) {
  var zIndexKey = goog.isDef(zIndex) ? zIndex.toString() : '0';
  var replayes = this.replayesByZIndex_[zIndexKey];
  if (!goog.isDef(replayes)) {
    replayes = {};
    this.replayesByZIndex_[zIndexKey] = replayes;
  }
  var replay = replayes[replayType];
  if (!goog.isDef(replay)) {
    var constructor = ol.render.canvas.BATCH_CONSTRUCTORS_[replayType];
    goog.asserts.assert(goog.isDef(constructor));
    replay = new constructor();
    replayes[replayType] = replay;
  }
  return replay;
};


/**
 * @inheritDoc
 */
ol.render.canvas.ReplayGroup.prototype.isEmpty = function() {
  return goog.object.isEmpty(this.replayesByZIndex_);
};


/**
 * @const
 * @private
 * @type {Object.<ol.render.ReplayType, function(new: ol.render.canvas.Replay)>}
 */
ol.render.canvas.BATCH_CONSTRUCTORS_ = {
  'Image': ol.render.canvas.ImageReplay,
  'LineString': ol.render.canvas.LineStringReplay,
  'Polygon': ol.render.canvas.PolygonReplay
};