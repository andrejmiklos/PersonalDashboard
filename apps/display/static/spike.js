/* Compatibility spike for the tablet WebView. Plain ES5 on purpose: it must run before any build pipeline exists. */
(function () {
  'use strict';

  var FPS_DURATION_MS = 60000;
  var rows = [];

  function add(name, value) {
    rows.push({ name: name, value: value });
  }

  function safe(fn) {
    try {
      return fn();
    } catch (e) {
      return 'error: ' + e.message;
    }
  }

  function has(obj, prop) {
    return safe(function () {
      return obj != null && typeof obj[prop] !== 'undefined';
    });
  }

  function computed(el, prop) {
    return window.getComputedStyle(el).getPropertyValue(prop);
  }

  function styleAccepts(prop, value) {
    var el = document.createElement('div');
    el.style.cssText = prop + ':' + value;
    return el.style.length > 0;
  }

  function chromeVersion() {
    var m = navigator.userAgent.match(/Chrome\/(\d+)/);
    return m ? parseInt(m[1], 10) : null;
  }

  function testLocalStorage() {
    return safe(function () {
      var key = '__spike__';
      window.localStorage.setItem(key, '1');
      var ok = window.localStorage.getItem(key) === '1';
      window.localStorage.removeItem(key);
      return ok;
    });
  }

  function testIntl() {
    if (typeof Intl === 'undefined') {
      return false;
    }
    return safe(function () {
      var d = new Date(2026, 0, 15, 14, 5);
      var sk = new Intl.DateTimeFormat('sk', { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
      var tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      return 'sk: "' + sk + '", timeZone: ' + tz;
    });
  }

  function testGrid() {
    var el = document.querySelector('.grid-demo');
    return computed(el, 'display') === 'grid';
  }

  function testCssVariables() {
    var el = document.querySelector('.var-demo');
    var bg = computed(el, 'background-color').replace(/\s/g, '');
    return bg === 'rgb(34,170,119)';
  }

  function testSvg() {
    return safe(function () {
      var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      return typeof svg.createSVGRect === 'function';
    });
  }

  function testXhr(done) {
    var xhr = new XMLHttpRequest();
    var started = Date.now();
    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4) {
        done('status ' + xhr.status + ', ' + (Date.now() - started) + ' ms, body ' + xhr.responseText);
      }
    };
    xhr.open('GET', '/healthz?ts=' + started, true);
    xhr.send();
  }

  function collect() {
    var cv = chromeVersion();

    add('userAgent', navigator.userAgent);
    add('Chrome major (from UA)', cv);
    add('protocol (https = TLS ok)', location.protocol);
    add('screen', screen.width + '×' + screen.height + ' @ dpr ' + window.devicePixelRatio);
    add('viewport', window.innerWidth + '×' + window.innerHeight);
    add('device time', new Date().toString());
    add('timezone offset (min)', new Date().getTimezoneOffset());
    add('Fully Kiosk JS interface', typeof window.fully !== 'undefined');

    add('ES2015 syntax (arrow/let/class/template)', window.__spikeEs2015 === true);
    add('ES2017 syntax (async/await)', window.__spikeEs2017 === true);
    add('<script type=module>', window.__spikeModule === true);
    add('<script nomodule> executed', window.__spikeNoModule === true);

    add('Promise', typeof window.Promise === 'function');
    add('Promise.prototype.finally', has(window.Promise && window.Promise.prototype, 'finally'));
    add('fetch', typeof window.fetch === 'function');
    add('XMLHttpRequest', typeof window.XMLHttpRequest === 'function');
    add('EventSource', typeof window.EventSource === 'function');
    add('Symbol', typeof window.Symbol === 'function');
    add('Map / Set', typeof window.Map === 'function' && typeof window.Set === 'function');
    add('Object.assign', has(Object, 'assign'));
    add('Array.from', has(Array, 'from'));
    add('Array.prototype.includes', has(Array.prototype, 'includes'));
    add('String.prototype.padStart', has(String.prototype, 'padStart'));
    add(
      'URL constructor',
      safe(function () {
        return new URL('https://example.com/a?b=1').pathname === '/a';
      }),
    );
    add('URLSearchParams', typeof window.URLSearchParams === 'function');
    add('JSON', typeof window.JSON === 'object');
    add('Intl', testIntl());
    add(
      'Date#toLocaleDateString("sk")',
      safe(function () {
        return new Date(2026, 0, 15).toLocaleDateString('sk');
      }),
    );
    add('localStorage', testLocalStorage());
    add('history.replaceState', has(window.history, 'replaceState'));
    add('requestAnimationFrame', typeof window.requestAnimationFrame === 'function');
    add('performance.now', has(window.performance, 'now'));
    add(
      'performance.memory (MB used/limit)',
      safe(function () {
        var m = window.performance && window.performance.memory;
        return m
          ? Math.round(m.usedJSHeapSize / 1048576) + ' / ' + Math.round(m.jsHeapSizeLimit / 1048576)
          : false;
      }),
    );
    add('Page Visibility API', typeof document.hidden !== 'undefined');
    add('matchMedia', typeof window.matchMedia === 'function');
    add('touch events', 'ontouchstart' in window);
    add('pointer events', typeof window.PointerEvent === 'function');
    add('classList', has(document.documentElement, 'classList'));

    add('CSS flexbox (unprefixed)', computed(document.querySelector('.flex-row'), 'display') === 'flex');
    add('CSS Grid', testGrid());
    add('CSS variables', testCssVariables());
    add('CSS.supports', typeof window.CSS !== 'undefined' && has(window.CSS, 'supports'));
    add('flex gap', styleAccepts('gap', '4px'));
    add('position: sticky', styleAccepts('position', 'sticky') || styleAccepts('position', '-webkit-sticky'));
    add('calc()', styleAccepts('width', 'calc(10px + 1%)'));
    add('vw / vh units', styleAccepts('width', '10vw') && styleAccepts('height', '10vh'));
    add(
      'transform (unprefixed / -webkit-)',
      styleAccepts('transform', 'translateX(1px)') +
        ' / ' +
        styleAccepts('-webkit-transform', 'translateX(1px)'),
    );
    add('object-fit', styleAccepts('object-fit', 'cover'));
    add('inline SVG', testSvg());
    add('WOFF2 (inferred: Chrome ≥ 36)', cv === null ? 'unknown' : cv >= 36);
  }

  function render() {
    var tbody = document.getElementById('results');
    var failures = 0;
    tbody.innerHTML = '';
    for (var i = 0; i < rows.length; i++) {
      var tr = document.createElement('tr');
      var name = document.createElement('td');
      var value = document.createElement('td');
      var v = rows[i].value;
      name.className = 'name';
      name.textContent = rows[i].name;
      if (v === true || v === false) {
        value.className = v ? 'yes' : 'no';
        value.textContent = v ? 'yes' : 'NO';
        if (!v) {
          failures++;
        }
      } else {
        value.textContent = String(v);
      }
      tr.appendChild(name);
      tr.appendChild(value);
      tbody.appendChild(tr);
    }
    document.getElementById('summary').textContent =
      rows.length +
      ' checks, ' +
      failures +
      ' unsupported. Screenshot this page for docs/tablet-compat-results.md.';
  }

  function runFpsProbe(done) {
    var mover = document.getElementById('mover');
    var track = mover.parentNode;
    var raf = window.requestAnimationFrame || window.webkitRequestAnimationFrame;
    var start = Date.now();
    var frames = 0;
    var worst = 0;
    var last = start;
    var useTransform = styleAccepts('transform', 'translateX(1px)');

    function frame() {
      var now = Date.now();
      var elapsed = now - start;
      var x = Math.round(((elapsed % 2000) / 2000) * (track.clientWidth - mover.clientWidth));
      frames++;
      worst = Math.max(worst, now - last);
      last = now;
      if (useTransform) {
        mover.style.transform = 'translateX(' + x + 'px)';
      } else {
        mover.style.webkitTransform = 'translateX(' + x + 'px)';
      }
      if (elapsed < FPS_DURATION_MS) {
        document.getElementById('fps').textContent =
          Math.ceil((FPS_DURATION_MS - elapsed) / 1000) + ' s left, ' + frames + ' frames';
        schedule();
      } else {
        done(Math.round((frames / elapsed) * 10000) / 10 + ' avg fps, worst frame ' + worst + ' ms');
      }
    }

    function schedule() {
      if (raf) {
        raf.call(window, frame);
      } else {
        setTimeout(frame, 16);
      }
    }

    schedule();
  }

  window.onerror = function (message) {
    add('uncaught error', String(message));
    render();
  };

  // Module scripts are deferred, so wait for `load` before reading the probe flags.
  window.addEventListener('load', function () {
    collect();
    render();

    testXhr(function (result) {
      add('XHR GET /healthz', result);
      render();
    });

    runFpsProbe(function (result) {
      document.getElementById('fps').textContent = result;
      add('FPS probe (60 s, transform)', result);
      render();
    });
  });
})();
