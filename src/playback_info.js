// Copyright 2014 Flávio Ribeiro <flavio@bem.tv>.
// All rights reserved.
// Use of this source code is governed by a Apache
// license that can be found in the LICENSE file.

var BaseObject = require('base_object')
var _ = require('underscore')

class PlaybackInfo extends BaseObject {
  constructor() {
    this.data = {
      'chunks': {chunksFromCDN: 0, chunksFromP2P: 0, chunksSent: 0},
      'bufferLength': 0
    }
  }

  setMain(main) {
    this.main = main
    this.triggerStats({status: "on"})
    this.updateData({delay: this.main.el.getDelay()})
    this.data.delay = this.main.el.getDelay()
    this.addEventListeners()
  }

  updateData(metrics) {
    this.triggerStats(metrics)
    this.data = _.extend(this.data, metrics)
  }

  timeoutFor(command) {
    var segmentSize = this.data.segmentSize? this.data.segmentSize * 1000: 2000
    if (command === 'interested') {
      var timeout = segmentSize / 3
      return timeout > 2000? 2000: timeout
    } else if (command === 'request') {
      return segmentSize * 0.6
    }
  }

  addEventListeners() {
    this.listenTo(this.main.resourceRequester.p2pManager.swarm, "swarm:sizeupdate", (event) => this.updateData(event))
    this.listenTo(this.main.uploadHandler, 'uploadhandler:update', (event) => this.updateUploadSlots(event))
    Clappr.Mediator.on(this.main.uniqueId + ':fragmentloaded', () => this.onFragmentLoaded())
  }

  onFragmentLoaded() {
    var bitrate = Math.floor(this.main.getCurrentBitrate() / 1000)
    var bufferLength = this.main.el.globoGetbufferLength()
    bitrate =  !_.isNaN(bitrate) ? bitrate : 'UNKNOWN'
    bufferLength = !_.isNaN(bufferLength) ? bufferLength: 0
    var data = {state: this.main.currentState, currentBitrate: bitrate, bufferLength: bufferLength}
    this.updateData(data)
  }

  updateChunkStats(method=null) {
    if (method === "p2p") this.data.chunks.chunksFromP2P++
    else if (method === "cdn") this.data.chunks.chunksFromCDN++
    else if (method === "p2psent") this.data.chunks.chunksSent++
    this.triggerStats(this.data.chunks)
  }

  updateUploadSlots(metrics) {
    this.data.uploadSlots = metrics
    this.triggerStats(metrics)
  }

  triggerStats(metrics) {
    this.main.trigger('playback:p2phlsstats:add', metrics)
    this.main.trigger('playback:stats:add', metrics)
  }
}

PlaybackInfo.getInstance = function() {
  if (this._instance === undefined) {
    this._instance = new this()
  }
  return this._instance
}

module.exports = PlaybackInfo
