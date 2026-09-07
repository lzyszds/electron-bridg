/**
 * WebViewJSBridge SDK 源码
 *
 * 1:1 移植自 Flutter 端 js_bridge_controller.dart 中通过 runJavaScript 注入的 SDK，
 * 协议字段、编码方式、事件派发与 Flutter webview 保持一致，
 * 保证 H5 镜像在 Electron 中无需改动即可跑通桥接。
 *
 * 通过 <webview>.executeJavaScript() 注入到 H5 主世界。
 */
export const webviewBridgeSdk = `(function () {
  function JSBridge() {
    var _handlers = {};
    var _callbacks = {};
    var _promises = {};
    var _id = 0;
    var _debug = false;
    var _channel = ['flutter'];

    function _log() {
      if (_debug) {
        var args = Array.prototype.slice.call(arguments);
        console.log.apply(null, args);
      }
    }

    function _isIframeChannel() {
      return _channel.indexOf('iframe') > -1;
    }

    function _isFlutterChannel() {
      return _channel.indexOf('flutter') > -1;
    }

    function _isReactNativeChannel() {
      return _channel.indexOf('reactnative') > -1;
    }

    function _init(config) {
      if (config) {
        if (config.debug) {
          _debug = !!config.debug;
        }
        if (config.channel && Object.prototype.toString.apply(config.channel) === '[object Array]') {
          _channel = config.channel;
          if (_isIframeChannel()) {
            window.addEventListener('message', (event) => {
              window.eval(event.data);
            });
          }
        }
      }

      _registerHandler('#evalJavaScript#', function (data, success, fail) {
        try {
          success(Function('"use strict";return (' + data.toString() + ')')());
        } catch (error) {
          _log(error);
          fail(error.toString());
        }
      });
      _callHandler('#jsbridgeReady#', {
        data: true,
        success: function (data) {
          _log('[#jsbridgeReady#] success response: ' + data);
        },
        fail: function (err) {
          _log('[#jsbridgeReady#] fail response: ' + err);
        }
      });
    }

    function _registerHandler(handlerName, handler) {
      _handlers[handlerName] = handler;
    }

    function _unregisterHandler(handlerName) {
      if (!_handlers[handlerName]) {
        return;
      }
      delete _handlers[handlerName];
    }

    function _callHandler(handlerName, payload) {
      return _receiverCall(handlerName, payload);
    }

    function _onMessageReceived(messageString) {
      var decodeString = decodeURIComponent(messageString);
      var jsonData = JSON.parse(decodeString);
      _log('[WebViewJSBridge receiveMessage]: ', jsonData);
      var message = jsonData;

      if (message.type === 'request') {
        _senderCall(message);
      }
      if (message.type === 'response') {
        _receiverCallResponse(message);
      }
    }

    function _postMessage(jsonData) {
      _log('[WebViewJSBridge postMessage]: ', jsonData);
      var jsonString = JSON.stringify(jsonData);
      var encodeString = encodeURIComponent(jsonString);
      if (_isIframeChannel()) {
        if (self != top) {
          window.parent.postMessage(encodeString, '*');
        }
      }
      if (_isFlutterChannel()) {
        window.FlutterWebView && window.FlutterWebView.postMessage(encodeString);
      }
      if (_isReactNativeChannel()) {
        window.ReactNativeWebView && window.ReactNativeWebView.postMessage(encodeString);
      }
    }

    function _receiverCall(handlerName, payload) {
      if (!handlerName) {
        throw Error('WebViewJSBridge: handler name can not be null!!!');
      }

      var message = {
        id: _id++,
        type: 'request',
        resolved: false,
        rejected: false
      };
      message.action = handlerName;
      if (payload) {
        if (payload.data) {
          message.data = payload.data;
        }

        if (payload.success) {
          if (!_callbacks[message.id]) {
            _callbacks[message.id] = {};
          }
          _callbacks[message.id].success = payload.success;
        }
        if (payload.fail) {
          if (!_callbacks[message.id]) {
            _callbacks[message.id] = {};
          }
          _callbacks[message.id].fail = payload.fail;
        }
      }

      _postMessage(message);

      if (!_callbacks[message.id]) {
        if (/native code/.test(Promise.toString()) && typeof Promise !== 'undefined') {
          return new Promise((resolve, reject) => _promises[message.id] = { resolve: resolve, reject: reject });
        }
      }
    }

    function _receiverCallResponse(message) {
      var id = message.id;
      var data = message.data;
      var isResolved = message.resolved;
      var isRejected = message.rejected;

      if (_callbacks[id]) {
        if (isResolved) {
          _callbacks[id].success && _callbacks[id].success(data);
        }
        if (isRejected) {
          _callbacks[id].fail && _callbacks[id].fail(data);
        }
        delete _callbacks[id];
      }
      if (_promises[id]) {
        if (isResolved) {
          _promises[id].resolve(data);
        }
        if (isRejected) {
          _promises[id].reject(data);
        }
        delete _promises[id];
      }
    }

    function _senderCall(message) {
      function _successResponse(data) {
        message = {
          action: message.action,
          data: data,
          id: message.id,
          type: 'response',
          resolved: true,
          rejected: false
        };
        _senderCallResponse(message);
      }

      function _failResponse(err) {
        message = {
          action: message.action,
          data: err,
          id: message.id,
          type: 'response',
          resolved: false,
          rejected: true
        };
        _senderCallResponse(message);
      }

      var handlerName = message.action;
      if (handlerName in _handlers) {
        var handler = _handlers[handlerName];
        var promise = handler(message.data, function (data) {
          _successResponse(data);
        }, function (err) {
          _failResponse(err);
        });
        if (Object.prototype.toString.call(promise) == '[object Promise]') {
          promise.then(function (data) {
            _successResponse(data);
          }).catch(function (err) {
            _failResponse(err.toString());
          });
        }
      } else {
        _failResponse('handler name -> ' + handlerName + " can't find!!!");
      }
    }

    function _senderCallResponse(message) {
      _postMessage(message);
    }

    return {
      init: _init,
      registerHandler: _registerHandler,
      unregisterHandler: _unregisterHandler,
      callHandler: _callHandler,
      onMessageReceived: function (messageString) {
        setTimeout(function () {
          _onMessageReceived(messageString);
        }, 0);
      }
    };
  }

  if (window.WebViewJSBridge) {
    return;
  }
  window.WebViewJSBridge = new JSBridge();

  setTimeout(() => {
    var doc = document;
    var readyEvent = doc.createEvent('Event');
    var jobs = window.WVJBCallbacks || [];
    readyEvent.initEvent('WebViewJSBridgeReady', true, false);
    readyEvent.bridge = WebViewJSBridge;
    delete window.WVJBCallbacks;
    for (var i = 0; i < jobs.length; i++) {
      var job = jobs[i];
      job(WebViewJSBridge);
    }
    doc.dispatchEvent(readyEvent);
  }, 0);
})();`

/**
 * H5 页面可能依赖的 ES 兼容 polyfill（还原 Flutter 端注入行为）
 */
export const webviewPolyfills = `(function () {
  if (typeof Object.hasOwn !== 'function') {
    Object.hasOwn = function (obj, prop) {
      return Object.prototype.hasOwnProperty.call(Object(obj), prop);
    };
  }

  if (typeof Array.prototype.at !== 'function') {
    Object.defineProperty(Array.prototype, 'at', {
      value: function (index) {
        var i = Number(index) || 0;
        if (i < 0) i += this.length;
        if (i < 0 || i >= this.length) return undefined;
        return this[i];
      },
      writable: true,
      enumerable: false,
      configurable: true
    });
  }

  if (typeof String.prototype.at !== 'function') {
    Object.defineProperty(String.prototype, 'at', {
      value: function (index) {
        var s = String(this);
        var i = Number(index) || 0;
        if (i < 0) i += s.length;
        if (i < 0 || i >= s.length) return undefined;
        return s.charAt(i);
      },
      writable: true,
      enumerable: false,
      configurable: true
    });
  }
})();`