// Copyright 2014 Flávio Ribeiro <flavio@bem.tv>.
// All rights reserved.
// Use of this source code is governed by Apache
// license that can be found in the LICENSE file.

var Settings = require('./settings')
var ResourceRequester = require('./resource_requester')
var UploadHandler = require('./upload_handler')
var PlaybackInfo = require('./playback_info')
var AdaptiveStreaming = require('./adaptive_streaming')
var Storage = require('./storage')
var log = require('./log').getInstance()
var JST = require('./jst')
var Browser = require('browser')
var Styler = require('./styler')
var HLS = require('hls')

class P2PHLS extends HLS {
  get name() { return 'p2phls' }
  get tagName() { return 'object' }
  get template() { return JST.p2phls }
  get attributes() {
    return {
      'data-p2phls': '',
      'type': 'application/x-shockwave-flash'
    }
  }

  constructor(options) {
    options.swfPath = "http://s.videos.globo.com/p3/plugins/assets/P2PHLSPlayer2.swf"
    Settings = _.extend(Settings, options.bemtv)
    this.resourceRequester = new ResourceRequester({swarm: btoa(options.src.split("?")[0]), tracker: options.tracker})
    this.uploadHandler = UploadHandler.getInstance()
    this.playbackInfo = PlaybackInfo.getInstance()
    this.storage = Storage.getInstance()
    this.CHUNK_SIZE = 65536
    super(options)
  }

  addListeners() {
    Clappr.Mediator.on(this.uniqueId + ':flashready', () => this.bootstrap())
    Clappr.Mediator.on(this.uniqueId + ':timeupdate', () => this.updateTime())
    Clappr.Mediator.on(this.uniqueId + ':playbackstate', (state) => this.setPlaybackState(state))
    Clappr.Mediator.on(this.uniqueId + ':highdefinition', (isHD) => this.updateHighDefinition(isHD))
    Clappr.Mediator.on(this.uniqueId + ':playbackerror', () => this.flashPlaybackError())
    Clappr.Mediator.on(this.uniqueId + ':requestresource', (url) => this.requestResource(url))
    Clappr.Mediator.on(this.uniqueId + ':decodeerror', () => this.onDecodeError())
    Clappr.Mediator.on(this.uniqueId + ':decodesuccess', () => this.onDecodeSuccess())
  }

  stopListening() {
    Clappr.Mediator.off(this.uniqueId + ':flashready')
    Clappr.Mediator.off(this.uniqueId + ':timeupdate')
    Clappr.Mediator.off(this.uniqueId + ':playbackstate')
    Clappr.Mediator.off(this.uniqueId + ':highdefinition')
    Clappr.Mediator.off(this.uniqueId + ':playbackerror')
    Clappr.Mediator.off(this.uniqueId + ':requestresource')
    Clappr.Mediator.off(this.uniqueId + ':decodeerror')
    Clappr.Mediator.off(this.uniqueId + ':decodesuccess')
  }

  bootstrap() {
    this.playbackInfo.setMain(this)
    this.adaptiveStreaming = new AdaptiveStreaming(this)
    this.el.playerSetminBufferLength(6)
    this.el.playerSetlowBufferLength(Settings.lowBufferLength)
    super()
  }

  setPlaybackState(state) {
    if (state === 'PLAYING' && this.resourceRequester.isInitialBuffer) {
      this.resourceRequester.isInitialBuffer = false
    }
    super(state)
  }

  onDecodeError() {
    log.warn("Error, decode error")
    this.resourceRequester.decodingError = true
    this.resourceRequester.requestResource(this.currentUrl, 0, (chunk, method) => this.resourceLoaded(chunk, method))
  }

  onDecodeSuccess() {
    if (this.currentUrl) {
      this.resourceRequester.decodingError = false
      this.storage.setItem(this.currentUrl, this.currentChunk)
      this.currentUrl = null
      this.currentChunk = null
    }
  }

  requestResource(url) {
    if (this.currentUrl) {
      log.warn("still processing the other chunk, wait :)")
    } else {
      this.currentUrl = url
      if (this.storage.contain(this.currentUrl)) {
        this.resourceLoaded(this.storage.getItem(this.currentUrl), "storage")
      } else {
        this.resourceRequester.requestResource(url, this.el.globoGetbufferLength(), (chunk, method) => this.resourceLoaded(chunk, method))
      }
    }
  }

  resourceLoaded(chunk, method) {
    if (this.currentUrl) {
      this.currentChunk = chunk
      this.readPosition = 0
      this.endPosition = 0
      this.currentChunkLength = this.currentChunk.length
      this.sendID = setInterval(function() { this.sendChunk() }.bind(this), 0);
      this.playbackInfo.updateChunkStats(method)
    }
  }

  sendChunk() {
    if (this.currentChunk === null) {
      clearInterval(this.sendID)
    } else if (this.currentChunkLength <= this.CHUNK_SIZE) {
      this.el.resourceLoaded(this.currentChunk)
      this.startDecoding()
    } else if (this.endPosition >= this.currentChunkLength) {
      this.startDecoding()
    } else {
      this.endPosition += this.CHUNK_SIZE
      this.el.resourceLoaded(this.currentChunk.slice(this.readPosition, this.endPosition))
      this.readPosition = this.endPosition
    }
  }

  startDecoding() {
    this.readPosition = 0
    this.endPosition = 0
    clearInterval(this.sendID)
    this.el.startDecoding()
  }

  seek(time) {
    this.resourceRequester.onDVR = time !== -1? true: false
    super(time)
  }

  render() {
    this.$el.html(this.template({cid: this.cid, swfPath: this.swfPath, playbackId: this.uniqueId}))
    if(Browser.isFirefox) {
      this.setupFirefox()
    }
    this.el.id = this.cid
    var style = Styler.getStyleFor(this.name)
    this.$el.append(style)
    return this
  }
}

P2PHLS.canPlay = function(resource) {
  return !!(window.webkitRTCPeerConnection || window.mozRTCPeerConnection) && !!resource.match(/^http(.*).m3u8/)
}

module.exports = window.P2PHLS = P2PHLS;
