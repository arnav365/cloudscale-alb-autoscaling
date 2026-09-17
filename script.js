/* ==========================================================================
   CloudScale — Scalable Web Application with AWS ALB & Auto Scaling
   script.js — vanilla JavaScript, no dependencies, no backend.

   CONTENTS
   01. Helpers
   02. Simulation state (single source of truth)
   03. Rendering (hero, architecture, scalability, HA, dashboard, demo)
   04. Simulation actions (scale out / scale in / failure / reset)
   05. Monitoring charts + metric ticker
   06. Navigation (mobile menu, scrollspy, progress bar)
   07. Scroll reveal animations
   08. Architecture diagram interactions
   09. Boot

   NOTE: every metric shown on the page is generated here in the browser.
   Nothing in this file talks to AWS — it is a presentation simulation.
   ========================================================================== */
(function () {
  'use strict';

  /* ========================================================================
     01. HELPERS
     ==================================================================== */
  const $  = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));

  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  const randomBetween = (min, max) => Math.round(min + Math.random() * (max - min));

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** Write text into every matching element, flashing it when the value changes. */
  function setText(selector, value) {
    $$(selector).forEach(function (el) {
      const next = String(value);
      if (el.textContent === next) return;
      el.textContent = next;
      el.classList.remove('is-bumped');
      void el.offsetWidth;                  // restart the CSS animation
      el.classList.add('is-bumped');
    });
  }

  /** Count from the element's current number up/down to `to`. */
  function animateNumber(el, to, duration) {
    if (!el) return;
    const from = parseInt(el.textContent, 10) || 0;
    if (from === to || prefersReducedMotion) { el.textContent = String(to); return; }
    const ms = duration || 500;
    const start = performance.now();
    (function step(now) {
      const p = clamp((now - start) / ms, 0, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = String(Math.round(from + (to - from) * eased));
      if (p < 1) requestAnimationFrame(step);
    })(start);
  }

  /** Short visual acknowledgement that a button was pressed. */
  function pressFeedback(btn) {
    if (!btn) return;
    btn.classList.remove('is-pressed');
    void btn.offsetWidth;
    btn.classList.add('is-pressed');
  }

  /* ========================================================================
     02. SIMULATION STATE
     ==================================================================== */
  const MIN_CAPACITY = 2;
  const MAX_CAPACITY = 4;

  /* Traffic tiers drive capacity, the dashboard and the scalability stages. */
  const TRAFFIC_LEVELS = [
    { key: 'low',    label: 'Low',    desired: 2, rpm: [40, 110],   cpu: [12, 22], gauge: 15, stage: 1 },
    { key: 'normal', label: 'Normal', desired: 2, rpm: [150, 280],  cpu: [24, 38], gauge: 40, stage: 1 },
    { key: 'high',   label: 'High',   desired: 3, rpm: [340, 540],  cpu: [52, 68], gauge: 72, stage: 2 },
    { key: 'peak',   label: 'Peak',   desired: 4, rpm: [640, 920],  cpu: [74, 89], gauge: 96, stage: 3 }
  ];

  const AZS = ['ap-south-1a', 'ap-south-1b', 'ap-south-1a', 'ap-south-1b'];

  const state = {
    levelIndex: 1,          // index into TRAFFIC_LEVELS — starts at "Normal"
    instances: [],          // { id, ip, az, healthy }
    nextInstanceNumber: 3,  // EC2-01 and EC2-02 exist at boot
    requestHistory: [],     // rolling samples for the requests chart
    capacityHistory: [],    // rolling samples for the instance bar chart
    cpu: 28
  };

  const level = () => TRAFFIC_LEVELS[state.levelIndex];
  const healthyInstances = () => state.instances.filter((i) => i.healthy);
  const hasUnhealthy = () => state.instances.some((i) => !i.healthy);

  function makeInstance(number) {
    const n = String(number).padStart(2, '0');
    return {
      id: 'EC2-' + n,
      ip: '10.0.' + (((number - 1) % 2) + 1) + '.' + (20 + number * 7),
      az: AZS[(number - 1) % AZS.length],
      healthy: true
    };
  }

  function seedInstances() {
    state.instances = [makeInstance(1), makeInstance(2)];
    state.nextInstanceNumber = 3;
  }

  /* ========================================================================
     03. RENDERING
     ==================================================================== */
  const el = {
    heroFleet:      $('[data-hero-fleet]'),
    archFleet:      $('#archFleet'),
    splitWire:      $('.wire--split'),
    haTargets:      $('#haTargets'),
    haMessage:      $('#haMessage'),
    demoFleet:      $('#demoFleet'),
    demoMessage:    $('#demoMessage'),
    demoClock:      $('#demoClock'),
    eventLog:       $('#eventLog'),
    stages:         $$('#scaleStages .stage'),
    failureLabel:   $('#btnFailureLabel'),
    demoFailureLabel: $('#btnDemoFailureLabel'),
    btnFailureHA:   $('#btnSimulateFailure'),
    btnFailureDemo: $('#btnFailure'),
    btnIncrease:    $('#btnIncrease'),
    btnDecrease:    $('#btnDecrease'),
    gaugeFill:      $('#gaugeFill'),
    instanceBars:   $('#instanceBars'),
    reqLine:        $('#reqLine'),
    reqArea:        $('#reqArea')
  };

  /** Full re-render of every state-driven panel. */
  function render() {
    const lvl = level();
    const total = state.instances.length;
    const healthy = healthyInstances().length;
    const lbActive = healthy > 0;

    /* --- Hero status strip --- */
    setText('[data-hero-lb]', lbActive ? 'Active' : 'Degraded');
    setText('[data-hero-asg]', 'Enabled');
    setText('[data-hero-status]', hasUnhealthy() ? 'Degraded' : 'Operational');
    $$('[data-hero-status-dot]').forEach(function (dot) {
      dot.classList.toggle('status-dot--ok', !hasUnhealthy());
      dot.classList.toggle('status-dot--warn', hasUnhealthy());
    });
    animateNumber($('[data-hero-instances]'), total);
    setText('[data-hero-desired]', total);

    /* --- Hero mini topology --- */
    if (el.heroFleet) {
      el.heroFleet.innerHTML = '';
      state.instances.forEach(function (inst, i) {
        const node = document.createElement('div');
        node.className = 'mini-node mini-node--ec2' + (inst.healthy ? '' : ' is-unhealthy');
        node.style.animationDelay = (i * 60) + 'ms';
        node.textContent = inst.id;
        el.heroFleet.appendChild(node);
      });
    }

    /* --- Architecture diagram (health of the two documented instances) --- */
    $$('.arch-node--ec2').forEach(function (node) {
      const inst = state.instances.filter((i) => i.id === node.dataset.instance)[0];
      const isHealthy = inst ? inst.healthy : true;
      node.classList.toggle('is-healthy', isHealthy);
      node.classList.toggle('is-unhealthy', !isHealthy);
      const badge = $('[data-health]', node);
      if (badge) {
        badge.textContent = isHealthy ? 'HEALTHY' : 'UNHEALTHY';
        badge.classList.toggle('badge--ok', isHealthy);
        badge.classList.toggle('badge--bad', !isHealthy);
      }
    });
    if (el.splitWire) {
      const first = state.instances[0];
      const second = state.instances[1];
      el.splitWire.classList.toggle('is-left-down', !!first && !first.healthy);
      el.splitWire.classList.toggle('is-right-down', !!second && !second.healthy);
    }
    setText('[data-arch-desired]', total);
    $$('[data-arch-lb]').forEach(function (badge) {
      badge.textContent = lbActive ? 'ACTIVE' : 'NO TARGETS';
      badge.classList.toggle('badge--ok', lbActive);
      badge.classList.toggle('badge--bad', !lbActive);
    });

    /* --- Scalability stages --- */
    el.stages.forEach(function (stage) {
      stage.classList.toggle('is-active', Number(stage.dataset.stage) === lvl.stage);
    });

    /* --- Shared metric labels (scalability bar + demo panel) --- */
    setText('[data-traffic-label]', lvl.label.toUpperCase());
    $$('[data-instance-count]').forEach(function (node) { animateNumber(node, total); });

    /* --- High availability targets --- */
    renderHaTargets(healthy);
    setText('[data-ha-healthy-count]', healthy);

    /* --- Dashboard KPIs --- */
    setText('[data-kpi-healthy]', healthy);
    setText('[data-kpi-desired]', total);
    setText('[data-kpi-traffic]', lvl.label);
    setText('[data-chart-traffic]', lvl.label);
    $$('[data-kpi-lb]').forEach(function (node) {
      node.textContent = lbActive ? 'Active' : 'Degraded';
      node.classList.toggle('kpi__value--ok', lbActive);
      node.classList.toggle('kpi__value--bad', !lbActive);
    });
    if (el.gaugeFill) el.gaugeFill.style.width = lvl.gauge + '%';

    /* --- Demonstration panel --- */
    renderDemoFleet(healthy);
    $$('[data-demo-lb]').forEach(function (node) {
      node.textContent = lbActive ? 'ACTIVE' : 'DEGRADED';
      node.classList.toggle('demo__stat-value--ok', lbActive);
      node.classList.toggle('demo__stat-value--bad', !lbActive);
    });

    /* --- Failure button labels stay in sync with the fleet --- */
    const failLabel = hasUnhealthy() ? 'Restore Instance' : 'Simulate Instance Failure';
    if (el.failureLabel) el.failureLabel.textContent = failLabel;
    if (el.demoFailureLabel) {
      el.demoFailureLabel.textContent = hasUnhealthy() ? 'Restore Instance' : 'Simulate Failure';
    }

    /* --- Control availability --- */
    if (el.btnIncrease) el.btnIncrease.disabled = state.levelIndex >= TRAFFIC_LEVELS.length - 1;
    if (el.btnDecrease) el.btnDecrease.disabled = state.levelIndex <= 0;
  }

  /** The high-availability target list mirrors the first two instances. */
  function renderHaTargets(healthyCount) {
    if (!el.haTargets) return;
    const share = healthyCount > 0 ? Math.round(100 / healthyCount) : 0;

    el.haTargets.innerHTML = '';
    state.instances.forEach(function (inst) {
      const li = document.createElement('li');
      li.className = 'ha-target ' + (inst.healthy ? 'is-healthy' : 'is-unhealthy');
      li.dataset.instance = inst.id;
      li.innerHTML =
        '<span class="ha-target__pulse"></span>' +
        '<div class="ha-target__id"><b>' + inst.id + '</b><small>' + inst.ip + ' · ' + inst.az + '</small></div>' +
        '<div class="ha-target__meter"><span style="width:' + (inst.healthy ? share : 0) + '%"></span></div>' +
        '<span class="badge ' + (inst.healthy ? 'badge--ok' : 'badge--bad') + '">' +
        (inst.healthy ? 'Healthy' : 'Unhealthy') + '</span>';
      el.haTargets.appendChild(li);
    });
  }

  /** Instance cards inside the big demonstration panel. */
  function renderDemoFleet(healthyCount) {
    if (!el.demoFleet) return;
    const share = healthyCount > 0 ? Math.round(100 / healthyCount) : 0;
    const lvl = level();

    el.demoFleet.innerHTML = '';
    state.instances.forEach(function (inst, i) {
      const node = document.createElement('div');
      node.className = 'demo-node' + (inst.healthy ? '' : ' is-unhealthy');
      node.style.animationDelay = (i * 70) + 'ms';
      const load = inst.healthy ? clamp(Math.round(lvl.cpu[0] * (2 / Math.max(healthyCount, 1))), 8, 95) : 0;
      node.innerHTML =
        '<span class="demo-node__id">' + inst.id + '</span>' +
        '<span class="demo-node__meta">' + inst.az + ' · t2.micro</span>' +
        '<span class="demo-node__meta">' + (inst.healthy ? share + '% of traffic' : 'out of service') + '</span>' +
        '<span class="demo-node__load"><span style="width:' + load + '%"></span></span>';
      el.demoFleet.appendChild(node);
    });
  }

  /* --- Messages ------------------------------------------------------- */
  function setMessage(target, text, tone) {
    if (!target) return;
    target.textContent = text;
    target.classList.remove('is-alert', 'is-good');
    if (tone) target.classList.add(tone === 'alert' ? 'is-alert' : 'is-good');
  }

  function announce(text, tone) {
    setMessage(el.demoMessage, text, tone);
  }

  function announceHa(text, tone) {
    setMessage(el.haMessage, text, tone);
  }

  /** Append a line to the Auto Scaling activity log. */
  function logEvent(text, kind) {
    if (!el.eventLog) return;
    const li = document.createElement('li');
    if (kind) li.className = 'is-' + kind;
    const now = new Date();
    li.innerHTML = '<time>' + now.toLocaleTimeString([], { hour12: false }) + '</time><span>' + text + '</span>';
    el.eventLog.insertBefore(li, el.eventLog.firstChild);
    while (el.eventLog.children.length > 12) el.eventLog.removeChild(el.eventLog.lastChild);
  }

  /* ========================================================================
     04. SIMULATION ACTIONS
     ==================================================================== */

  /** Grow or shrink the fleet until it matches the desired capacity. */
  function reconcileCapacity(desired) {
    const target = clamp(desired, MIN_CAPACITY, MAX_CAPACITY);

    while (state.instances.length < target) {
      const inst = makeInstance(state.nextInstanceNumber++);
      state.instances.push(inst);
      logEvent('Scale-out: launching ' + inst.id + ' in ' + inst.az, 'scale-out');
    }

    while (state.instances.length > target) {
      /* Auto Scaling terminates unhealthy instances first, then the newest. */
      let index = state.instances.findIndex((i) => !i.healthy);
      if (index === -1) index = state.instances.length - 1;
      const removed = state.instances.splice(index, 1)[0];
      logEvent('Scale-in: terminating ' + removed.id + (removed.healthy ? '' : ' (unhealthy)'), 'scale-in');
    }
  }

  /** Move to another traffic tier and let capacity follow. */
  function setTrafficLevel(index, source) {
    const next = clamp(index, 0, TRAFFIC_LEVELS.length - 1);
    const previous = state.levelIndex;
    if (next === previous) return;

    state.levelIndex = next;
    const lvl = level();
    const before = state.instances.length;
    reconcileCapacity(lvl.desired);
    const after = state.instances.length;

    logEvent('Traffic level → ' + lvl.label.toUpperCase(), next > previous ? 'scale-out' : 'scale-in');

    if (after > before) {
      announce('Auto Scaling triggered — adding capacity. ' + (after - before) +
               ' new EC2 instance' + (after - before > 1 ? 's' : '') + ' launched (desired ' + before + ' → ' + after + ').', 'good');
    } else if (after < before) {
      announce('Traffic reduced — scaling in. ' + (before - after) +
               ' instance' + (before - after > 1 ? 's' : '') + ' terminated (desired ' + before + ' → ' + after + ').');
    } else if (next > previous) {
      announce('Traffic increased to ' + lvl.label.toUpperCase() + '. Existing capacity is still sufficient.');
    } else {
      announce('Traffic decreased to ' + lvl.label.toUpperCase() + '. Fleet is at the minimum capacity of ' + MIN_CAPACITY + '.');
    }

    /* Nudge the charts immediately so the change is visible straight away. */
    sampleMetrics();
    render();

    if (source === 'cycle') {
      // The scalability section button walks through every tier in order.
      announceHa(hasUnhealthy()
        ? 'Traffic redirected to the healthy targets only.'
        : 'All targets are passing health checks. Traffic is evenly distributed.',
        hasUnhealthy() ? 'alert' : null);
    }
  }

  /** Mark the first instance unhealthy, or bring everything back online. */
  function toggleFailure() {
    if (hasUnhealthy()) {
      state.instances.forEach((i) => { i.healthy = true; });
      logEvent('Health check passed — all targets back in service', 'ok');
      announce('All instances restored. The load balancer is using the full fleet again.', 'good');
      announceHa('All targets are passing health checks. Traffic is evenly distributed.', 'good');
    } else {
      const victim = state.instances[0];
      if (!victim) return;
      victim.healthy = false;
      logEvent('Health check failed on ' + victim.id + ' — target deregistered', 'alert');
      announce('Unhealthy instance detected (' + victim.id + '). Traffic redirected to the remaining healthy instance(s).', 'alert');
      announceHa('Unhealthy instance detected. Traffic redirected to ' +
                 healthyInstances().map((i) => i.id).join(', ') + '.', 'alert');
    }
    sampleMetrics();
    render();
  }

  /** Back to the documented baseline: normal traffic, 2 healthy instances. */
  function resetDemo() {
    state.levelIndex = 1;
    seedInstances();
    state.requestHistory = [];
    state.capacityHistory = [];
    if (el.eventLog) el.eventLog.innerHTML = '';
    logEvent('Demo reset — desired capacity 2, all targets healthy', 'ok');
    announce('System nominal — 2 healthy instances serving normal traffic.', 'good');
    announceHa('All targets are passing health checks. Traffic is evenly distributed.');
    seedCharts();
    render();
  }

  /* ========================================================================
     05. MONITORING CHARTS + TICKER
     ==================================================================== */
  const REQ_POINTS = 30;   // samples kept for the request line chart
  const BAR_POINTS = 24;   // bars in the capacity chart
  const SVG_W = 300, SVG_H = 110;

  function sampleMetrics() {
    const lvl = level();
    const healthy = Math.max(healthyInstances().length, 1);

    /* Requests scale with the traffic tier; a failed target trims throughput. */
    const penalty = hasUnhealthy() ? 0.82 : 1;
    const requests = Math.round(randomBetween(lvl.rpm[0], lvl.rpm[1]) * penalty);

    /* CPU per instance rises when fewer instances share the same traffic. */
    const spread = (state.instances.length || 1) / healthy;
    state.cpu = clamp(Math.round(randomBetween(lvl.cpu[0], lvl.cpu[1]) * spread), 5, 99);

    state.requestHistory.push(requests);
    while (state.requestHistory.length > REQ_POINTS) state.requestHistory.shift();

    state.capacityHistory.push(state.instances.length);
    while (state.capacityHistory.length > BAR_POINTS) state.capacityHistory.shift();

    drawCharts(requests);
  }

  function drawCharts(latestRequests) {
    /* --- Requests: SVG line + area --- */
    if (el.reqLine && state.requestHistory.length) {
      /* The Y axis follows the window's own peak so the line always fills
         the chart, whatever traffic tier the demo is currently in. */
      const peak = Math.max.apply(null, state.requestHistory);
      const ceiling = Math.max(120, Math.ceil((peak * 1.25) / 50) * 50);
      const pts = state.requestHistory.map(function (value, i) {
        const x = (i / (REQ_POINTS - 1)) * SVG_W;
        const y = SVG_H - 6 - (clamp(value, 0, ceiling) / ceiling) * (SVG_H - 16);
        return x.toFixed(1) + ',' + y.toFixed(1);
      });
      el.reqLine.setAttribute('points', pts.join(' '));
      if (el.reqArea) {
        const firstX = pts[0].split(',')[0];
        const lastX = pts[pts.length - 1].split(',')[0];
        el.reqArea.setAttribute('points', firstX + ',' + SVG_H + ' ' + pts.join(' ') + ' ' + lastX + ',' + SVG_H);
      }
    }
    setText('[data-chart-requests]', latestRequests != null ? latestRequests : 0);
    setText('[data-chart-cpu]', state.cpu + '%');

    /* --- Capacity: bar chart --- */
    if (el.instanceBars) {
      if (el.instanceBars.children.length !== BAR_POINTS) {
        el.instanceBars.innerHTML = '';
        for (let i = 0; i < BAR_POINTS; i++) el.instanceBars.appendChild(document.createElement('span'));
      }
      const bars = el.instanceBars.children;
      for (let i = 0; i < BAR_POINTS; i++) {
        const value = state.capacityHistory[i] || 0;
        bars[i].style.height = value ? Math.round((value / MAX_CAPACITY) * 100) + '%' : '4px';
        bars[i].classList.toggle('is-peak', value >= MAX_CAPACITY);
      }
    }
    setText('[data-chart-instances]', state.instances.length);
  }

  /** Pre-fill the charts so they never start empty. */
  function seedCharts() {
    for (let i = 0; i < REQ_POINTS; i++) sampleMetrics();
  }

  let tickerId = null;
  function startTicker() {
    stopTicker();
    tickerId = window.setInterval(sampleMetrics, 2200);
  }
  function stopTicker() {
    if (tickerId) { window.clearInterval(tickerId); tickerId = null; }
  }
  /* Pause the simulation when the tab is hidden — keeps the page light. */
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stopTicker(); else startTicker();
  });

  /* Demo panel clock */
  function startClock() {
    if (!el.demoClock) return;
    const tick = function () {
      el.demoClock.textContent = new Date().toLocaleTimeString([], { hour12: false }) + ' · local time';
    };
    tick();
    window.setInterval(tick, 1000);
  }

  /* ========================================================================
     06. NAVIGATION
     ==================================================================== */
  function initNavigation() {
    const nav = $('#nav');
    const toggle = $('#navToggle');
    const links = $('#navLinks');
    const progress = $('#navProgress');
    const navLinks = $$('.nav__link');
    const targets = navLinks
      .map(function (link) { return { link: link, section: $(link.getAttribute('href')) }; })
      .filter(function (entry) { return entry.section; });

    /* --- Mobile menu --- */
    function closeMenu() {
      if (!links || !toggle) return;
      links.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
    }

    if (toggle && links) {
      toggle.addEventListener('click', function () {
        const open = links.classList.toggle('is-open');
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      links.addEventListener('click', function (event) {
        if (event.target.closest('a')) closeMenu();
      });
      document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') closeMenu();
      });
      window.addEventListener('resize', function () {
        if (window.innerWidth > 960) closeMenu();
      });
    }

    /* --- Sticky styling, scroll progress and active link --- */
    function onScroll() {
      const y = window.scrollY || document.documentElement.scrollTop;

      if (nav) nav.classList.toggle('is-stuck', y > 12);

      if (progress) {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        progress.style.width = (max > 0 ? clamp((y / max) * 100, 0, 100) : 0) + '%';
      }

      /* The last nav section that starts above the viewport mid-line wins. */
      let activeIndex = 0;
      targets.forEach(function (entry, i) {
        if (entry.section.offsetTop - 140 <= y) activeIndex = i;
      });
      /* Snap to the final entry when the page is scrolled to the bottom. */
      if (window.innerHeight + y >= document.documentElement.scrollHeight - 8) {
        activeIndex = targets.length - 1;
      }
      navLinks.forEach(function (link) { link.classList.remove('is-active'); });
      if (targets[activeIndex]) targets[activeIndex].link.classList.add('is-active');
    }

    let ticking = false;
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () { onScroll(); ticking = false; });
    }, { passive: true });
    onScroll();

    /* --- Smooth scrolling fallback for browsers without CSS smooth scroll --- */
    const supportsSmooth = 'scrollBehavior' in document.documentElement.style;
    if (!supportsSmooth) {
      $$('a[href^="#"]').forEach(function (anchor) {
        anchor.addEventListener('click', function (event) {
          const target = $(anchor.getAttribute('href'));
          if (!target) return;
          event.preventDefault();
          window.scrollTo(0, target.offsetTop - 80);
        });
      });
    }
  }

  /* ========================================================================
     07. SCROLL REVEAL
     ==================================================================== */
  function initReveal() {
    const items = $$('.reveal');
    if (!('IntersectionObserver' in window) || prefersReducedMotion) {
      items.forEach(function (item) { item.classList.add('is-visible'); });
      return;
    }
    const observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);          // reveal once, then stop watching
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });

    items.forEach(function (item) { observer.observe(item); });
  }

  /* ========================================================================
     08. ARCHITECTURE DIAGRAM INTERACTIONS
     ==================================================================== */
  function initArchitecture() {
    const nodes = $$('.arch-node');
    const steps = $$('.flow__step');
    const title = $('#archInfoTitle');
    const desc = $('#archInfoDesc');
    if (!nodes.length) return;

    function showInfo(node) {
      if (title) title.textContent = node.dataset.title || '';
      if (desc) desc.textContent = node.dataset.desc || '';
      nodes.forEach(function (n) { n.classList.toggle('is-active', n === node); });
      steps.forEach(function (s) { s.classList.toggle('is-active', s.dataset.target === node.dataset.node); });
    }

    nodes.forEach(function (node) {
      node.addEventListener('mouseenter', function () { showInfo(node); });
      node.addEventListener('focus', function () { showInfo(node); });
      node.addEventListener('click', function () { showInfo(node); });
    });

    /* Hovering a request-flow step highlights the component it describes. */
    steps.forEach(function (step) {
      const highlight = function () {
        const key = step.dataset.target;
        const match = nodes.filter(function (n) { return n.dataset.node === key; })[0];
        if (match) showInfo(match);
        steps.forEach(function (s) { s.classList.toggle('is-active', s === step); });
      };
      step.addEventListener('mouseenter', highlight);
      step.addEventListener('click', highlight);
    });

    /* Clear highlighting when the pointer leaves the diagram entirely. */
    const diagram = $('#archDiagram');
    if (diagram) {
      diagram.addEventListener('mouseleave', function () {
        nodes.forEach(function (n) { n.classList.remove('is-active'); });
        steps.forEach(function (s) { s.classList.remove('is-active'); });
      });
    }
  }

  /* ========================================================================
     09. SCALABILITY STAGE ILLUSTRATIONS
     ==================================================================== */
  function buildStageServers() {
    $$('.stage__servers').forEach(function (holder) {
      const count = parseInt(holder.dataset.servers, 10) || 2;
      holder.innerHTML = '';
      for (let i = 0; i < count; i++) {
        const unit = document.createElement('span');
        unit.className = 'server-unit' + (i >= MIN_CAPACITY ? ' server-unit--ghost' : '');
        unit.style.animationDelay = (i * 70) + 'ms';
        holder.appendChild(unit);
      }
    });
  }

  /* ========================================================================
     10. CONTROL WIRING
     ==================================================================== */
  function initControls() {
    const cycle = $('#btnSimulateTraffic');
    if (cycle) {
      cycle.addEventListener('click', function () {
        pressFeedback(cycle);
        const next = (state.levelIndex + 1) % TRAFFIC_LEVELS.length;
        if (next === 0) {
          /* Wrapped past "Peak" — drop straight back to the lowest tier. */
          setTrafficLevel(0, 'cycle');
          logEvent('Traffic normalised — returning to baseline capacity', 'scale-in');
        } else {
          setTrafficLevel(next, 'cycle');
        }
      });
    }

    if (el.btnIncrease) {
      el.btnIncrease.addEventListener('click', function () {
        pressFeedback(el.btnIncrease);
        setTrafficLevel(state.levelIndex + 1);
      });
    }

    if (el.btnDecrease) {
      el.btnDecrease.addEventListener('click', function () {
        pressFeedback(el.btnDecrease);
        setTrafficLevel(state.levelIndex - 1);
      });
    }

    [el.btnFailureHA, el.btnFailureDemo].forEach(function (btn) {
      if (!btn) return;
      btn.addEventListener('click', function () {
        pressFeedback(btn);
        toggleFailure();
      });
    });

    const reset = $('#btnReset');
    if (reset) {
      reset.addEventListener('click', function () {
        pressFeedback(reset);
        resetDemo();
      });
    }
  }

  /* ========================================================================
     11. BOOT
     ==================================================================== */
  function init() {
    const year = $('#year');
    if (year) year.textContent = String(new Date().getFullYear());

    seedInstances();
    buildStageServers();
    initNavigation();
    initReveal();
    initArchitecture();
    initControls();

    seedCharts();
    render();
    announce('System nominal — ' + state.instances.length + ' healthy instances serving normal traffic.', 'good');
    announceHa('All targets are passing health checks. Traffic is evenly distributed.', 'good');

    logEvent('Auto Scaling group in service — desired capacity ' + state.instances.length, 'ok');
    logEvent('Target group healthy — ' + healthyInstances().length + ' of ' +
             state.instances.length + ' targets passing checks', 'ok');

    startClock();
    startTicker();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
