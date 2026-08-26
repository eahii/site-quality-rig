/* Meridian Lift Services — progressive enhancement only.
   Loaded without defer so the `js` class lands before first paint: base CSS paints
   every reveal element, and only the `.js` branch starts them hidden. Without this
   file the site still renders complete. */
(function () {
  'use strict';

  var root = document.documentElement;
  root.classList.add('js');

  var reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

  function onQueryChange(query, handler) {
    if (typeof query.addEventListener === 'function') query.addEventListener('change', handler);
    else if (typeof query.addListener === 'function') query.addListener(handler);
  }

  function initNav() {
    var toggle = document.querySelector('.nav-toggle');
    var menu = document.getElementById('mobile-menu');
    if (!toggle || !menu) return;

    menu.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');

    function setOpen(open) {
      menu.hidden = !open;
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    toggle.addEventListener('click', function () {
      setOpen(toggle.getAttribute('aria-expanded') !== 'true');
    });

    menu.addEventListener('click', function (event) {
      if (event.target.closest('a')) setOpen(false);
    });

    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape' || menu.hidden) return;
      setOpen(false);
      toggle.focus();
    });

    var desktop = window.matchMedia('(min-width: 64rem)');
    onQueryChange(desktop, function () {
      setOpen(false);
    });
  }

  function initReveal() {
    var items = Array.prototype.slice.call(document.querySelectorAll('.rv'));
    if (!items.length) return;

    function revealAll() {
      items.forEach(function (el) {
        el.classList.add('rv-in');
      });
    }

    if (reduceQuery.matches || typeof IntersectionObserver !== 'function') {
      revealAll();
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('rv-in');
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0 });

    items.forEach(function (el) {
      observer.observe(el);
    });

    onQueryChange(reduceQuery, function (event) {
      if (event.matches) {
        observer.disconnect();
        revealAll();
      }
    });
  }

  function initHero() {
    var spacer = document.querySelector('.pin-spacer');
    var hero = document.getElementById('hero');
    var car = document.querySelector('.car');
    var marks = document.querySelector('.floor-marks');
    var rooftop = document.querySelector('.rooftop');
    var readout = document.getElementById('floor-readout');
    if (!spacer || !hero || !car || !marks || !readout) return;

    var FLOORS = ['G', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
    /* The top floor is reached at 94% of the scrub and held for the rest. Viewport
       height decides how much of the spacer is still scrollable at the bottom of the
       page, so without that dwell the final frame would depend on window size. */
    var ARRIVAL = 0.94;

    var travel = 0;
    var range = 0;
    var origin = 0;
    var queued = false;
    var scrubbing = false;

    function measure() {
      travel = marks.getBoundingClientRect().height;
      origin = spacer.getBoundingClientRect().top + window.pageYOffset;
      range = spacer.offsetHeight - hero.offsetHeight;
    }

    function paint(progress) {
      var p = progress / ARRIVAL;
      if (p > 1) p = 1;
      car.style.transform = 'translate(-50%, ' + (-travel * p).toFixed(2) + 'px)';
      rooftop.style.opacity = Math.max(0.22, Math.min(1, (p - 0.55) / 0.4)).toFixed(3);
      var text = 'Floor ' + FLOORS[Math.min(FLOORS.length - 1, Math.floor(p * FLOORS.length))];
      if (readout.textContent !== text) readout.textContent = text;
    }

    function update() {
      queued = false;
      if (range <= 0) return;
      var p = (window.pageYOffset - origin) / range;
      paint(p < 0 ? 0 : p > 1 ? 1 : p);
    }

    function request() {
      if (queued) return;
      queued = true;
      window.requestAnimationFrame(update);
    }

    function onResize() {
      measure();
      update();
    }

    function stopScrub() {
      if (!scrubbing) return;
      scrubbing = false;
      window.removeEventListener('scroll', request);
      window.removeEventListener('resize', onResize);
      car.style.transform = '';
      rooftop.style.opacity = '';
      readout.textContent = 'Floor ' + FLOORS[0];
    }

    function startScrub() {
      if (scrubbing) return;
      scrubbing = true;
      measure();
      update();
      window.addEventListener('scroll', request, { passive: true });
      window.addEventListener('resize', onResize);
    }

    if (!reduceQuery.matches) startScrub();
    onQueryChange(reduceQuery, function (event) {
      if (event.matches) stopScrub();
      else startScrub();
    });

    window.addEventListener('load', function () {
      if (scrubbing) onResize();
    });
  }

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  ready(function () {
    initNav();
    initReveal();
    initHero();
  });
})();
