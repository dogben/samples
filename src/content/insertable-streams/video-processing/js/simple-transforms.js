/*
 *  Copyright (c) 2020 The WebRTC project authors. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree.
 */

'use strict';

/**
 * Does nothing.
 * @implements {FrameTransform} in pipeline.js
 */
class NullTransform { // eslint-disable-line no-unused-vars
  /** @override */
  async init() {}
  /** @override */
  async transform(frame, controller) {
    controller.enqueue(frame);
  }
  /** @override */
  destroy() {}
}

/**
 * Drops frames at random.
 * @implements {FrameTransform} in pipeline.js
 */
class DropTransform { // eslint-disable-line no-unused-vars
  /** @override */
  async init() {}
  /** @override */
  async transform(frame, controller) {
    if (Math.random() < 0.5) {
      controller.enqueue(frame);
    } else {
      frame.close();
    }
  }
  /** @override */
  destroy() {}
}

/**
 * Delays all frames by 100ms.
 * @implements {FrameTransform} in pipeline.js
 */
class DelayTransform { // eslint-disable-line no-unused-vars
  /** @override */
  async init() {}
  /** @override */
  async transform(frame, controller) {
    await new Promise(resolve => setTimeout(resolve, 100));
    controller.enqueue(frame);
  }
  /** @override */
  destroy() {}
}

/**
 * Crops the frame to half-size.
 * @implements {FrameTransform} in pipeline.js
 */
class CropTransform { // eslint-disable-line no-unused-vars
  constructor() {
    /** @private {?number} timestamp of first frame */
    this.firstTimestamp_ = null;
  }
  /** @override */
  async init() {}
  /** @override */
  async transform(frame, controller) {
    const timestamp = frame.timestamp;
    if (!this.firstTimestamp_) {
      this.firstTimestamp_ = timestamp;
    }
    // Cycle every 4 seconds.
    const loop = (timestamp - this.firstTimestamp_) / 4000000;
    const left = (Math.sin(Math.PI / 2 * loop) + 1) / 2 * frame.visibleRegion.width / 2;
    const top = (Math.cos(Math.PI / 2 * loop) + 1) / 2 * frame.visibleRegion.height / 2;
    const croppedFrame = new VideoFrame(frame, {visibleRegion: {left, top, width: frame.visibleRegion.width / 2, height: frame.visibleRegion.height / 2}});
    frame.close();
    controller.enqueue(croppedFrame);
  }
  /** @override */
  destroy() {}
}
