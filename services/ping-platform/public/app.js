// ─── app.js — DNS Ping Platform Frontend ────────────────────────────────────
(function () {
  'use strict';

  // ─── State ──────────────────────────────────────────────────────────────────
  let allResults = [];
  let meta = {};
  let sortCol = 'latency';
  let sortDir = 1; // 1 = asc, -1 = desc
  let map, markerGroup, serverMarker;
  let charts = {};
  let activeChart = 'distribution';
  let selectedTimelineIds = new Set();
  let userLat = null, userLng = null, userApproximate = false;
  let userMarker = null, serverLine = null;
  let resolverMarkers = {}; // id → marker

  // ─── Map Init ───────────────────────────────────────────────────────────────
  function initMap() {
    map = L.map('map', {
      center: [38, -96],
      zoom: 4,
      zoomControl: true,
      attributionControl: false,
    });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 18,
    }).addTo(map);
    markerGroup = L.markerClusterGroup({
      maxClusterRadius: 40,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      iconCreateFunction: cluster => {
        const count = cluster.getChildCount();
        return L.divIcon({
          html: `<div style="background:var(--accent);color:#fff;border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;border:2px solid rgba(255,255,255,0.3)">${count}</div>`,
          className: '',
          iconSize: [36, 36],
        });
      },
    });
    map.addLayer(markerGroup);

    // Zoom to Me control
    const ZoomToMe = L.Control.extend({
      options: { position: 'topright' },
      onAdd: function () {
        const btn = L.DomUtil.create('div', 'zoom-to-me-btn');
        btn.innerHTML = '📍 Zoom to Me';
        btn.title = 'Zoom to your location';
        L.DomEvent.disableClickPropagation(btn);
        btn.addEventListener('click', () => {
          if (userLat !== null) map.setView([userLat, userLng], 6);
        });
        return btn;
      },
    });
    map.addControl(new ZoomToMe());

    // Get user location
    getUserLocation();
  }

  // ─── Haversine (client-side) ──────────────────────────────────────────────
  function haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function formatDistance(km) {
    return km.toLocaleString(undefined, { maximumFractionDigits: 0 }) + ' km';
  }

  function setUserLocation(lat, lng, approximate) {
    userLat = lat;
    userLng = lng;
    userApproximate = approximate;

    // Add user marker
    if (userMarker) map.removeLayer(userMarker);
    userMarker = L.marker([lat, lng], {
      icon: L.divIcon({
        className: '',
        html: '<div class="user-marker"></div>',
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      }),
      zIndexOffset: 2000,
    }).addTo(map).bindPopup(`<div class="popup-title">📍 YOU</div><div class="popup-provider">Your location${approximate ? ' (approximate)' : ''}</div>`);

    // Calculate zoom based on nearby resolvers
    let zoom = 5;
    if (allResults.length) {
      const nearby = allResults.filter(r => r.lat && r.lng && haversineKm(lat, lng, r.lat, r.lng) < 500).length;
      if (nearby > 10) zoom = 6;
      else if (nearby > 3) zoom = 5;
      else zoom = 4;
    }
    map.setView([lat, lng], zoom);

    // Draw line to server if available
    updateServerLine();
    // Update server popup with distance
    updateServerMarkerPopup();
  }

  function getUserLocation() {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => setUserLocation(pos.coords.latitude, pos.coords.longitude, false),
        () => fallbackIPLocation(),
        { timeout: 5000, maximumAge: 300000 }
      );
    } else {
      fallbackIPLocation();
    }
  }

  function fallbackIPLocation() {
    fetch('https://ip-api.com/json/?fields=lat,lon,status')
      .then(r => r.json())
      .then(data => {
        if (data.status === 'success') setUserLocation(data.lat, data.lon, true);
      })
      .catch(() => {}); // keep default view
  }

  function updateServerLine() {
    if (serverLine) { map.removeLayer(serverLine); serverLine = null; }
    if (userLat !== null && meta.serverLat) {
      serverLine = L.polyline([[userLat, userLng], [meta.serverLat, meta.serverLng]], {
        color: '#3b82f6',
        weight: 2,
        opacity: 0.5,
        dashArray: '8, 6',
      }).addTo(map);
    }
  }

  function updateServerMarkerPopup() {
    if (serverMarker && userLat !== null) {
      const dist = haversineKm(userLat, userLng, meta.serverLat, meta.serverLng);
      serverMarker.setPopupContent(`<div class="popup-title">🖥 Test Server</div><div class="popup-provider">${meta.serverCity || 'Unknown'} — ${formatDistance(dist)} from you</div>`);
    }
  }

  function latencyColor(ms) {
    if (ms === null || ms === undefined) return '#6b7280';
    if (ms < 10) return '#10b981';
    if (ms < 30) return '#f59e0b';
    if (ms < 80) return '#f97316';
    if (ms < 200) return '#ef4444';
    return '#6b7280';
  }

  function latencyClass(ms) {
    if (ms === null || ms === undefined) return 'grey';
    if (ms < 10) return 'green';
    if (ms < 30) return 'yellow';
    if (ms < 80) return 'orange';
    if (ms < 200) return 'red';
    return 'grey';
  }

  function updateMap(results) {
    markerGroup.clearLayers();
    resolverMarkers = {};

    // Server marker
    if (meta.serverLat && !serverMarker) {
      const distText = userLat !== null ? ` — ${formatDistance(haversineKm(userLat, userLng, meta.serverLat, meta.serverLng))} from you` : '';
      serverMarker = L.marker([meta.serverLat, meta.serverLng], {
        icon: L.divIcon({
          className: '',
          html: `<div class="server-marker-label" style="width:32px;height:32px">SRV</div>`,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        }),
        zIndexOffset: 1000,
      }).addTo(map).bindPopup(`<div class="popup-title">🖥 Test Server</div><div class="popup-provider">${meta.serverCity || 'Unknown'}${distText}</div>`);
      updateServerLine();
    }

    // Determine top 5 fastest for glow
    const onlineSorted = results.filter(r => r.status === 'online' && r.latency != null).sort((a, b) => a.latency - b.latency);
    const top5Ids = new Set(onlineSorted.slice(0, 5).map(r => r.id));

    results.forEach(r => {
      if (!r.lat || !r.lng) return;
      const color = latencyColor(r.latency);
      const isTop5 = top5Ids.has(r.id);
      // Scale radius: faster = slightly larger (5-9 range)
      let radius = 6;
      if (r.latency != null) {
        radius = r.latency < 10 ? 9 : r.latency < 30 ? 8 : r.latency < 80 ? 7 : r.latency < 200 ? 6 : 5;
      }
      const marker = L.circleMarker([r.lat, r.lng], {
        radius,
        fillColor: color,
        color: isTop5 ? '#10b981' : color,
        weight: isTop5 ? 2.5 : 1,
        opacity: isTop5 ? 1 : 0.8,
        fillOpacity: isTop5 ? 0.8 : 0.6,
        className: isTop5 ? 'resolver-glow' : '',
      });

      const sparkHtml = r.history && r.history.length > 1
        ? `<div class="popup-sparkline"><canvas id="spark-${r.id}" width="180" height="30"></canvas></div>` : '';

      marker.bindPopup(`
        <div class="popup-title">${r.name}</div>
        <div class="popup-provider">${r.provider} • ${r.city}, ${r.country} • ${r.protocol.toUpperCase()}</div>
        <div class="popup-stats">
          <div><span class="popup-stat-label">Latency</span><br><span class="popup-stat-value" style="color:${color}">${r.latency != null ? r.latency + ' ms' : '—'}</span></div>
          <div><span class="popup-stat-label">Min</span><br><span class="popup-stat-value">${r.min != null ? r.min + ' ms' : '—'}</span></div>
          <div><span class="popup-stat-label">Avg</span><br><span class="popup-stat-value">${r.avg != null ? r.avg + ' ms' : '—'}</span></div>
          <div><span class="popup-stat-label">P95</span><br><span class="popup-stat-value">${r.p95 != null ? r.p95 + ' ms' : '—'}</span></div>
        </div>
        ${sparkHtml}
      `);

      marker.on('popupopen', () => {
        if (r.history && r.history.length > 1) {
          setTimeout(() => drawPopupSparkline(r), 50);
        }
      });

      resolverMarkers[r.id] = marker;
      markerGroup.addLayer(marker);
    });
  }

  // Pan to resolver on table click
  function panToResolver(id) {
    const marker = resolverMarkers[id];
    if (!marker) return;
    markerGroup.zoomToShowLayer(marker, () => {
      marker.openPopup();
    });
  }

  function drawPopupSparkline(r) {
    const canvas = document.getElementById(`spark-${r.id}`);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const vals = r.history.map(h => h.v);
    const max = Math.max(...vals);
    const min = Math.min(...vals);
    const range = max - min || 1;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.beginPath();
    ctx.strokeStyle = latencyColor(r.latency);
    ctx.lineWidth = 1.5;
    vals.forEach((v, i) => {
      const x = (i / (vals.length - 1)) * w;
      const y = h - ((v - min) / range) * (h - 4) - 2;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  // ─── Summary Cards ──────────────────────────────────────────────────────────
  function updateSummary(results) {
    const online = results.filter(r => r.status === 'online');
    const fastest = online[0];

    document.getElementById('fastest-value').textContent = fastest ? fastest.latency + ' ms' : '—';
    document.getElementById('fastest-name').textContent = fastest ? `${fastest.provider} — ${fastest.name}` : '—';

    const avgAll = online.length ? (online.reduce((s, r) => s + r.latency, 0) / online.length).toFixed(1) : '—';
    document.getElementById('avg-value').textContent = avgAll !== '—' ? avgAll + ' ms' : '—';

    document.getElementById('online-value').textContent = online.length;
    document.getElementById('online-sub').textContent = `of ${results.length} total`;

    if (meta.lastScanTime) {
      const ago = Math.round((Date.now() - meta.lastScanTime) / 1000);
      document.getElementById('scan-value').textContent = ago < 60 ? `${ago}s ago` : `${Math.round(ago / 60)}m ago`;
      document.getElementById('scan-sub').textContent = `Scan #${meta.scanCount}`;
    }

    document.getElementById('resolver-count').textContent = results.length;
  }

  // ─── Leaderboard ────────────────────────────────────────────────────────────
  function updateLeaderboard(results) {
    const top10 = results.filter(r => r.status === 'online').slice(0, 10);
    const list = document.getElementById('lb-list');
    list.innerHTML = top10.map((r, i) => {
      const rankClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
      return `<div class="lb-item">
        <div class="lb-rank ${rankClass}">${i + 1}</div>
        <div class="lb-info">
          <div class="lb-name">${r.name}</div>
          <div class="lb-provider">${r.provider} • ${r.city}</div>
        </div>
        <div class="lb-latency" style="color:${latencyColor(r.latency)}">${r.latency} ms</div>
      </div>`;
    }).join('');
  }

  // ─── Charts ─────────────────────────────────────────────────────────────────
  function initCharts() {
    Chart.defaults.color = '#8b8d98';
    Chart.defaults.borderColor = 'rgba(42,45,58,0.5)';
    Chart.defaults.font.family = "'Inter', sans-serif";

    // Distribution histogram
    charts.distribution = new Chart(document.getElementById('chart-distribution'), {
      type: 'bar',
      data: { labels: [], datasets: [{ label: 'Resolvers', data: [], backgroundColor: '#3b82f6', borderRadius: 4 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { title: { display: true, text: 'Latency (ms)' }, grid: { display: false } },
          y: { title: { display: true, text: 'Count' }, beginAtZero: true },
        },
      },
    });

    // Top 20 bar
    charts.top20 = new Chart(document.getElementById('chart-top20'), {
      type: 'bar',
      data: { labels: [], datasets: [{ label: 'Latency (ms)', data: [], backgroundColor: [], borderRadius: 4 }] },
      options: {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { title: { display: true, text: 'Latency (ms)' }, beginAtZero: true },
          y: { grid: { display: false } },
        },
      },
    });

    // Timeline
    charts.timeline = new Chart(document.getElementById('chart-timeline'), {
      type: 'line',
      data: { labels: [], datasets: [] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top', labels: { boxWidth: 12 } } },
        scales: {
          x: { title: { display: true, text: 'Time' }, grid: { display: false } },
          y: { title: { display: true, text: 'Latency (ms)' }, beginAtZero: true },
        },
        interaction: { intersect: false, mode: 'index' },
      },
    });
  }

  function updateCharts(results) {
    const online = results.filter(r => r.status === 'online' && r.latency != null);

    // Distribution
    const buckets = { '0-5': 0, '5-10': 0, '10-20': 0, '20-30': 0, '30-50': 0, '50-80': 0, '80-120': 0, '120-200': 0, '200+': 0 };
    online.forEach(r => {
      const ms = r.latency;
      if (ms < 5) buckets['0-5']++;
      else if (ms < 10) buckets['5-10']++;
      else if (ms < 20) buckets['10-20']++;
      else if (ms < 30) buckets['20-30']++;
      else if (ms < 50) buckets['30-50']++;
      else if (ms < 80) buckets['50-80']++;
      else if (ms < 120) buckets['80-120']++;
      else if (ms < 200) buckets['120-200']++;
      else buckets['200+']++;
    });
    charts.distribution.data.labels = Object.keys(buckets);
    charts.distribution.data.datasets[0].data = Object.values(buckets);
    charts.distribution.update('none');

    // Top 20
    const top20 = online.slice(0, 20);
    charts.top20.data.labels = top20.map(r => r.name.length > 25 ? r.name.slice(0, 25) + '…' : r.name);
    charts.top20.data.datasets[0].data = top20.map(r => r.latency);
    charts.top20.data.datasets[0].backgroundColor = top20.map(r => latencyColor(r.latency));
    charts.top20.update('none');

    // Timeline — show top 5 by default or selected
    let timelineResolvers;
    if (selectedTimelineIds.size > 0) {
      timelineResolvers = results.filter(r => selectedTimelineIds.has(r.id));
    } else {
      timelineResolvers = online.slice(0, 5);
    }
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#a855f7', '#ec4899', '#14b8a6', '#f97316'];
    const datasets = timelineResolvers.filter(r => r.history && r.history.length > 1).map((r, i) => ({
      label: r.name.length > 20 ? r.name.slice(0, 20) + '…' : r.name,
      data: r.history.map(h => h.v),
      borderColor: colors[i % colors.length],
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      pointRadius: 0,
      tension: 0.3,
    }));
    if (datasets.length) {
      const maxLen = Math.max(...datasets.map(d => d.data.length));
      charts.timeline.data.labels = Array.from({ length: maxLen }, (_, i) => '');
      charts.timeline.data.datasets = datasets;
    }
    charts.timeline.update('none');
  }

  // Chart tab switching
  document.querySelectorAll('.chart-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.chart-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeChart = tab.dataset.chart;
      document.querySelectorAll('.chart-container canvas').forEach(c => c.style.display = 'none');
      document.getElementById(`chart-${activeChart}`).style.display = 'block';
    });
  });

  // ─── Table ──────────────────────────────────────────────────────────────────
  function getFilteredResults() {
    let filtered = [...allResults];
    const search = document.getElementById('search').value.toLowerCase();
    const provider = document.getElementById('filter-provider').value;
    const country = document.getElementById('filter-country').value;
    const protocol = document.getElementById('filter-protocol').value;
    const latRange = document.getElementById('filter-latency').value;

    if (search) filtered = filtered.filter(r => r.name.toLowerCase().includes(search) || r.provider.toLowerCase().includes(search) || r.city.toLowerCase().includes(search));
    if (provider) filtered = filtered.filter(r => r.provider === provider);
    if (country) filtered = filtered.filter(r => r.country === country);
    if (protocol) filtered = filtered.filter(r => r.protocol === protocol);
    if (latRange) {
      if (latRange === '200+') filtered = filtered.filter(r => r.latency != null && r.latency >= 200);
      else {
        const [lo, hi] = latRange.split('-').map(Number);
        filtered = filtered.filter(r => r.latency != null && r.latency >= lo && r.latency < hi);
      }
    }

    // Sort
    filtered.sort((a, b) => {
      let va = a[sortCol], vb = b[sortCol];
      if (sortCol === 'rank') { va = a.latency; vb = b.latency; }
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;
      if (typeof va === 'string') return va.localeCompare(vb) * sortDir;
      return (va - vb) * sortDir;
    });

    return filtered;
  }

  function drawMiniSparkline(canvas, history) {
    if (!canvas || !history || history.length < 2) return;
    const ctx = canvas.getContext('2d');
    const vals = history.map(h => h.v);
    const max = Math.max(...vals);
    const min = Math.min(...vals);
    const range = max - min || 1;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.beginPath();
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1;
    vals.forEach((v, i) => {
      const x = (i / (vals.length - 1)) * w;
      const y = h - ((v - min) / range) * (h - 2) - 1;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  function updateTable() {
    const filtered = getFilteredResults();
    const tbody = document.getElementById('table-body');
    tbody.innerHTML = filtered.map((r, i) => `<tr data-resolver-id="${r.id}">
      <td class="mono">${i + 1}</td>
      <td>${r.provider}</td>
      <td>${r.name}</td>
      <td>${r.city}, ${r.country}</td>
      <td><span class="protocol-badge ${r.protocol}">${r.protocol}</span></td>
      <td><span class="latency-badge ${latencyClass(r.latency)}">${r.latency != null ? r.latency + ' ms' : '—'}</span></td>
      <td class="mono text-muted">${r.min != null ? r.min : '—'}</td>
      <td class="mono text-muted">${r.avg != null ? r.avg : '—'}</td>
      <td class="mono text-muted">${r.p95 != null ? r.p95 : '—'}</td>
      <td><span class="status-icon">${r.status === 'online' ? '🟢' : r.status === 'timeout' ? '🟡' : r.status === 'error' ? '🔴' : '⚪'}</span></td>
      <td><canvas class="trend-spark" data-id="${r.id}" width="60" height="20"></canvas></td>
    </tr>`).join('');

    // Draw sparklines
    filtered.forEach(r => {
      const canvas = tbody.querySelector(`canvas[data-id="${r.id}"]`);
      drawMiniSparkline(canvas, r.history);
    });

    // Click to pan
    tbody.querySelectorAll('tr[data-resolver-id]').forEach(tr => {
      tr.addEventListener('click', () => panToResolver(parseInt(tr.dataset.resolverId)));
    });
  }

  // Sort handling
  document.querySelectorAll('#results-table thead th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.sort;
      if (sortCol === col) sortDir *= -1;
      else { sortCol = col; sortDir = 1; }
      document.querySelectorAll('#results-table thead th').forEach(t => t.classList.remove('sorted'));
      th.classList.add('sorted');
      updateTable();
    });
  });

  // Filter handling
  ['search', 'filter-provider', 'filter-country', 'filter-protocol', 'filter-latency'].forEach(id => {
    document.getElementById(id).addEventListener(id === 'search' ? 'input' : 'change', updateTable);
  });

  // ─── Populate Filters ───────────────────────────────────────────────────────
  function populateFilters(results) {
    const providers = [...new Set(results.map(r => r.provider))].sort();
    const countries = [...new Set(results.map(r => r.country))].sort();

    const provSel = document.getElementById('filter-provider');
    if (provSel.options.length <= 1) {
      providers.forEach(p => { const o = document.createElement('option'); o.value = p; o.textContent = p; provSel.appendChild(o); });
    }
    const countrySel = document.getElementById('filter-country');
    if (countrySel.options.length <= 1) {
      countries.forEach(c => { const o = document.createElement('option'); o.value = c; o.textContent = c; countrySel.appendChild(o); });
    }
  }

  // ─── Export CSV ─────────────────────────────────────────────────────────────
  window.exportCSV = function () {
    window.open('/api/export', '_blank');
  };

  // ─── WebSocket ──────────────────────────────────────────────────────────────
  function connectWS() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}`);

    ws.onopen = () => {
      document.getElementById('status-text').textContent = 'Live';
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'init' || msg.type === 'results') {
        allResults = msg.data;
        meta = msg.meta;
        populateFilters(allResults);
        updateSummary(allResults);
        updateLeaderboard(allResults);
        updateMap(allResults);
        updateCharts(allResults);
        updateTable();
      }
    };

    ws.onclose = () => {
      document.getElementById('status-text').textContent = 'Reconnecting…';
      setTimeout(connectWS, 3000);
    };

    ws.onerror = () => ws.close();
  }

  // ─── Init ───────────────────────────────────────────────────────────────────
  initMap();
  initCharts();
  connectWS();

  // Keep "last scan" timer fresh
  setInterval(() => {
    if (meta.lastScanTime) {
      const ago = Math.round((Date.now() - meta.lastScanTime) / 1000);
      document.getElementById('scan-value').textContent = ago < 60 ? `${ago}s ago` : `${Math.round(ago / 60)}m ago`;
    }
  }, 1000);
})();
