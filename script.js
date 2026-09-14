const ESP32_URL = 'http://10.174.205.197';
const API_URL = window.AGROVAULT_API_URL || 'http://localhost:8080/api';

const DEMO_DATA = {
    sensors: { temperature: 4.2, humidity: 78, temperatureStatus: 'Normal', humidityStatus: 'Normal' },
    energy: { solar: 2.8, battery: 86, thermal: 72, consumption: 1.9 },
    crops: [
        { name: 'Broccoli', quantity: 120, date: '2026-09-02', type: 'Vegetable', life: 10, icon: '🥦' },
        { name: 'Carrot', quantity: 80, date: '2026-09-04', type: 'Root crop', life: 18, icon: '🥕' }
    ],
    alerts: [
        { level: 'success', icon: '✓', title: 'Temperature stable', message: 'Storage temperature is within the safe range.' },
        { level: 'warning', icon: '!', title: 'Crop approaching expiry', message: 'Broccoli should be sold within 5 days.' }
    ]
};

const state = {
    sensors: DEMO_DATA.sensors,
    energy: DEMO_DATA.energy,
    crops: DEMO_DATA.crops.map((crop) => ({ ...crop })),
    alerts: DEMO_DATA.alerts.map((alert) => ({ ...alert })),
    connected: false,
    backendConnected: false,
    mode: 'demo',
    highTemperature: false
};

const $ = (selector) => document.querySelector(selector);
let alarmAudioContext;

function primeAlarmAudio() {
    if (!alarmAudioContext) alarmAudioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (alarmAudioContext.state === 'suspended') alarmAudioContext.resume();
}

function playHighTemperatureAlarm() {
    try {
        primeAlarmAudio();
        const start = alarmAudioContext.currentTime;
        [0, 0.28, 0.56].forEach((offset) => {
            const oscillator = alarmAudioContext.createOscillator();
            const gain = alarmAudioContext.createGain();
            oscillator.type = 'square';
            oscillator.frequency.value = 880;
            gain.gain.setValueAtTime(0.0001, start + offset);
            gain.gain.exponentialRampToValueAtTime(0.16, start + offset + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.2);
            oscillator.connect(gain);
            gain.connect(alarmAudioContext.destination);
            oscillator.start(start + offset);
            oscillator.stop(start + offset + 0.21);
        });
    } catch (error) {
        // Browsers can block audio until the user interacts with the page.
    }
}

const showToast = (message) => {
    const toast = $('#toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    window.setTimeout(() => toast.classList.remove('show'), 2600);
};
const formatDate = (date) => new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
const daysRemaining = (crop) => Math.max(1, crop.life - Math.floor((Date.now() - new Date(`${crop.date}T00:00:00`)) / 86400000));
const qualityFor = (crop) => Math.max(55, Math.min(98, 96 - Math.max(0, crop.life - daysRemaining(crop)) * 1.1));
const normalizeCrop = (crop) => ({
    name: crop.name,
    quantity: Number(crop.quantity),
    date: crop.date || crop.storageDate,
    type: crop.type || 'Vegetable',
    life: Number(crop.life || crop.expectedShelfLife),
    icon: crop.icon || '🌿'
});

function renderEnergy() {
    if (!state.energy) return;
    const solar = Number(state.energy.solar || 0);
    const battery = Number(state.energy.battery || 0);
    const thermal = Number(state.energy.thermal || 0);
    if ($('#solar')) $('#solar').textContent = `${solar.toFixed(1)} kW`;
    if ($('#solarEnergy')) $('#solarEnergy').textContent = `${solar.toFixed(1)} kW`;
    if ($('#battery')) $('#battery').textContent = `${battery}%`;
    if ($('#batteryEnergy')) $('#batteryEnergy').textContent = `${battery}%`;
    if ($('#thermalEnergy')) $('#thermalEnergy').textContent = `${thermal}%`;
    if ($('#solarBar')) $('#solarBar').style.width = `${Math.min(100, solar / 4 * 100)}%`;
    if ($('#batteryBar')) $('#batteryBar').style.width = `${battery}%`;
    if ($('#thermalBar')) $('#thermalBar').style.width = `${thermal}%`;
}

function renderAll() {
    renderCrops();
    renderLegacyCrops();
    renderPredictions();
    renderLegacyPredictions();
    renderAlerts();
    renderEnergy();
    renderChart();
}

function setMode(mode) {
    state.mode = mode;
    document.querySelectorAll('.mode-button').forEach((button) => button.classList.toggle('active', button.dataset.mode === mode));
    if (mode === 'demo') {
        state.connected = false;
        state.backendConnected = false;
        state.sensors = DEMO_DATA.sensors;
        state.energy = DEMO_DATA.energy;
        state.crops = DEMO_DATA.crops.map((crop) => ({ ...crop }));
        state.alerts = DEMO_DATA.alerts.map((alert) => ({ ...alert }));
        state.highTemperature = false;
        renderAll();
        if ($('#connectionStatus')) $('#connectionStatus').textContent = '● Demo data';
        if ($('#liveStatus')) $('#liveStatus').textContent = '● DEMO';
        showToast('Demo mode enabled.');
        return;
    }
    state.sensors = null;
    state.energy = null;
    state.crops = [];
    state.alerts = [];
    renderAll();
    clearLiveData();
    if ($('#connectionStatus')) $('#connectionStatus').textContent = '● Connecting...';
    if ($('#liveStatus')) $('#liveStatus').textContent = '● CONNECTING';
    loadBackendData();
    loadESP32Data();
    showToast('Live mode enabled.');
}

function renderCrops() {
    const table = $('#cropTable');
    if (!table) return;
    table.innerHTML = state.crops.map((crop, index) => {
        const quality = Math.round(qualityFor(crop));
        const priority = daysRemaining(crop) <= 5 ? 'Sell soon' : 'On track';
        return `<tr><td><div class="crop-name"><span class="crop-dot">${crop.icon || '🌿'}</span><strong>${crop.name}</strong></div></td><td>${crop.quantity} kg</td><td>${formatDate(crop.date)}</td><td>${crop.type}</td><td><span class="quality">${quality}% quality</span><small>${daysRemaining(crop)} days left</small></td><td><button class="delete-crop" data-index="${index}" aria-label="Remove ${crop.name}">×</button></td></tr>`;
    }).join('');
    const total = state.crops.reduce((sum, crop) => sum + Number(crop.quantity), 0);
    if ($('#cropTotal')) $('#cropTotal').textContent = `${state.crops.length} crops · ${total} kg`;
    if ($('#usedCapacity')) $('#usedCapacity').textContent = `${total} kg`;
    if ($('#availableCapacity')) $('#availableCapacity').textContent = `${Math.max(0, 1000 - total)} kg`;
    if ($('#capacityPercent')) $('#capacityPercent').textContent = `${Math.round(total / 10)}%`;
    if ($('#capacityBar')) $('#capacityBar').style.width = `${Math.min(100, total / 10)}%`;
    table.querySelectorAll('.delete-crop').forEach((button) => button.addEventListener('click', () => {
        state.crops.splice(Number(button.dataset.index), 1);
        renderCrops();
        renderPredictions();
        showToast('Crop removed from inventory.');
    }));
}

function renderLegacyCrops() {
    const list = $('#cropList');
    if (!list || $('#cropTable')) return;
    list.innerHTML = state.crops.map((crop) => `<div class="crop-card"><div class="crop-image">${crop.icon || '🌿'}</div><div><h3>${crop.name}</h3><p>${crop.quantity} kg stored</p><span class="quality">Quality ${Math.round(qualityFor(crop))}% · ${daysRemaining(crop)} days left</span></div></div>`).join('');
}

function renderPredictions() {
    const grid = $('#predictionGrid');
    if (!grid) return;
    grid.innerHTML = state.crops.map((crop) => {
        const remaining = daysRemaining(crop);
        const quality = Math.round(qualityFor(crop));
        const sellingDate = new Date(Date.now() + remaining * 86400000).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
        const riskClass = remaining <= 5 ? 'risk-medium' : 'risk-low';
        const risk = remaining <= 5 ? 'Medium risk' : 'Low risk';
        return `<article class="ai-card"><div class="ai-main"><div class="ai-icon">${crop.icon || '🌿'}</div><div><h3>${crop.name}</h3><p>AI Prediction Demo · ${crop.type}</p></div></div><div class="prediction"><div><small>Remaining shelf life</small><strong>${remaining} days</strong></div><div><small>Quality</small><strong>${quality}%</strong></div><div><small>Sell by</small><strong>${sellingDate}</strong></div><span class="${riskClass}">${risk}</span></div></article>`;
    }).join('');
}

function renderLegacyPredictions() {
    const container = $('#ai');
    if (!container || $('#predictionGrid')) return;
    const cards = state.crops.map((crop) => {
        const remaining = daysRemaining(crop);
        const quality = Math.round(qualityFor(crop));
        const sellingDate = new Date(Date.now() + remaining * 86400000).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
        return `<div class="ai-card"><div class="ai-main"><div class="ai-icon">${crop.icon || '🌿'}</div><div><h3>${crop.name}</h3><p>AI demo based on storage conditions and crop age.</p></div></div><div class="prediction"><div><small>Remaining shelf life</small><strong>${remaining} Days</strong></div><div><small>Quality</small><strong>${quality}%</strong></div><div><small>Best selling</small><strong>${sellingDate}</strong></div></div></div>`;
    }).join('');
    const existing = container.querySelector('.ai-card');
    if (existing) existing.outerHTML = `<div id="legacyPredictions">${cards}</div>`;
}

function renderAlerts() {
    const list = $('#alertList');
    if (!list) return;
    list.innerHTML = state.alerts.map((alert) => `<div class="alert ${alert.level}"><span>${alert.icon}</span><div><strong>${alert.title}</strong><p>${alert.message}</p></div></div>`).join('');
    if ($('#alertCount')) $('#alertCount').textContent = state.alerts.length;
}

function updateSensors() {
    if (!state.sensors) return;
    const temp = state.sensors.temperature.toFixed(1);
    const humidity = Math.round(state.sensors.humidity);
    const highTemperature = Number(state.sensors.temperature) > 8;
    if ($('#temperature')) $('#temperature').textContent = `${temp}°C`;
    if ($('#humidity')) $('#humidity').textContent = `${humidity}%`;
    const tempStatus = $('#tempStatus');
    const humidityStatus = $('#humidityStatus');
    if (tempStatus) tempStatus.textContent = state.sensors.temperatureStatus || (state.sensors.temperature > 6 ? 'Warning' : 'Normal');
    if (humidityStatus) humidityStatus.textContent = state.sensors.humidityStatus || (state.sensors.humidity > 82 ? 'Warning' : 'Normal');
    if ($('#sensorTime')) $('#sensorTime').textContent = new Date().toLocaleTimeString('en-IN');
    if ($('#lastSync')) $('#lastSync').textContent = 'just now';
    if (highTemperature && !state.highTemperature) {
        state.alerts = state.alerts.filter((alert) => alert.id !== 'high-temperature');
        state.alerts.unshift({ id: 'high-temperature', level: 'warning', icon: '⚠️', title: 'High temperature', message: `Storage temperature is ${temp}°C. Check cooling immediately.` });
        renderAlerts();
        playHighTemperatureAlarm();
        showToast('High temperature alert.');
    } else if (!highTemperature && state.highTemperature) {
        state.alerts = state.alerts.filter((alert) => alert.id !== 'high-temperature');
        renderAlerts();
    }
    state.highTemperature = highTemperature;
}

async function loadBackendData() {
    if (state.mode !== 'live') return;
    try {
        const response = await fetch(`${API_URL}/dashboard`, { signal: AbortSignal.timeout(1500) });
        if (!response.ok) throw new Error('Backend unavailable');
        const data = await response.json();
        if (state.mode !== 'live') return;
        state.backendConnected = true;
        if (data.sensors) state.sensors = data.sensors;
        if (data.energy) state.energy = data.energy;
        if (Array.isArray(data.crops)) state.crops = data.crops.map(normalizeCrop);
        if (Array.isArray(data.alerts)) state.alerts = data.alerts;
        updateSensors();
        renderEnergy();
        renderCrops();
        renderLegacyCrops();
        renderPredictions();
        renderLegacyPredictions();
        renderAlerts();
        renderChart();
        if ($('#connectionStatus')) $('#connectionStatus').textContent = '● Backend connected';
        if ($('#liveStatus')) $('#liveStatus').textContent = '● BACKEND DATA';
        showToast('Backend connected. Showing dashboard data.');
    } catch (error) {
        if (state.mode !== 'live') return;
        state.backendConnected = false;
        if (!state.sensors) updateSensors();
        renderAll();
        clearLiveData();
    }
}

function clearLiveData() {
    ['temperature', 'humidity', 'battery', 'solar', 'solarEnergy', 'batteryEnergy', 'thermalEnergy'].forEach((id) => {
        if ($(`#${id}`)) $(`#${id}`).textContent = '--';
    });
    ['solarBar', 'batteryBar', 'thermalBar'].forEach((id) => {
        if ($(`#${id}`)) $(`#${id}`).style.width = '0%';
    });
    if ($('#tempStatus')) $('#tempStatus').textContent = 'Disconnected';
    if ($('#humidityStatus')) $('#humidityStatus').textContent = 'Disconnected';
    if ($('#connectionStatus')) $('#connectionStatus').textContent = '● ESP32 disconnected';
    if ($('#liveStatus')) $('#liveStatus').textContent = '● WAITING FOR ESP32';
    if ($('#bankCapacity')) $('#bankCapacity').textContent = '--';
    if ($('#bankAvailable')) $('#bankAvailable').textContent = '-- available';
    if ($('#alertList')) $('#alertList').innerHTML = '<div class="alert warning"><span>!</span><div><strong>ESP32 not connected</strong><p>Live sensor data will appear when the controller is online.</p></div></div>';
    if ($('#cropList')) $('#cropList').innerHTML = '<p class="muted">No crop data received from ESP32.</p>';
    if ($('#cropTable')) $('#cropTable').innerHTML = '<tr><td colspan="6">No crop data received from ESP32.</td></tr>';
    if ($('#predictionGrid')) $('#predictionGrid').innerHTML = '<p class="muted">AI predictions require live crop data.</p>';
    if ($('#legacyPredictions')) $('#legacyPredictions').innerHTML = '';
}

async function loadESP32Data() {
    if (state.mode !== 'live') return;
    try {
        const response = await fetch(`${ESP32_URL}/api/data`, { signal: AbortSignal.timeout(1500) });
        if (!response.ok) throw new Error('ESP32 unavailable');
        const sensors = await response.json();
        if (state.mode !== 'live') return;
        state.sensors = sensors;
        state.connected = true;
        updateSensors();
        if ($('#connectionStatus')) $('#connectionStatus').textContent = '● ESP32 connected';
        if ($('#liveStatus')) $('#liveStatus').textContent = '● LIVE';
        if ($('#alertList')) $('#alertList').innerHTML = '';
        showToast('Connected to ESP32. Showing live data.');
    } catch (error) {
        state.connected = false;
        if (!state.backendConnected) updateSensors();
    }
}

function renderChart() {
    const chart = $('#chartBars');
    if (!chart) return;
    chart.innerHTML = state.energy ? `<p class="muted">Solar generation ${Number(state.energy.solar || 0).toFixed(1)} kW · Consumption ${Number(state.energy.consumption || 0).toFixed(1)} kW</p>` : '<p class="muted">Waiting for energy data.</p>';
}

function init() {
    document.addEventListener('pointerdown', primeAlarmAudio, { once: true });
    renderAll();
    if ($('#connectionStatus')) $('#connectionStatus').textContent = '● Demo data';
    if ($('#liveStatus')) $('#liveStatus').textContent = '● DEMO';
    document.querySelectorAll('.mode-button').forEach((button) => button.addEventListener('click', () => setMode(button.dataset.mode)));
    $('#testAlarm')?.addEventListener('click', () => {
        playHighTemperatureAlarm();
        showToast('Demo high-temperature sound played.');
    });
    window.setInterval(loadESP32Data, 3000);

    document.querySelectorAll('[data-scroll]').forEach((button) => button.addEventListener('click', () => document.getElementById(button.dataset.scroll)?.scrollIntoView({ behavior: 'smooth' })));
    document.querySelectorAll('.nav-item').forEach((link) => link.addEventListener('click', () => { document.querySelectorAll('.nav-item').forEach((item) => item.classList.remove('active')); link.classList.add('active'); $('#sidebar')?.classList.remove('open'); }));
    $('#menuButton')?.addEventListener('click', () => $('#sidebar')?.classList.toggle('open'));
    $('#notifyButton')?.addEventListener('click', () => document.getElementById('alerts')?.scrollIntoView({ behavior: 'smooth' }));
    $('#toggleCropForm')?.addEventListener('click', () => $('#cropForm')?.classList.toggle('open'));
    $('#closeCropForm')?.addEventListener('click', () => $('#cropForm')?.classList.remove('open'));
    $('#cropForm')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const crop = { name: $('#cropName').value.trim(), quantity: Number($('#cropQuantity').value), date: $('#cropDate').value, type: $('#cropType').value, life: Number($('#cropLife').value), icon: '🌿' };
        if (!crop.name || !crop.quantity || !crop.date || !crop.life) return;
        await saveCrop(crop);
        event.target.reset();
        event.target.classList.remove('open');
        showToast(`${crop.name} added to cold storage.`);
    });
    $('#clearAlerts')?.addEventListener('click', () => { state.alerts = []; renderAlerts(); $('#notificationDot')?.remove(); showToast('All alerts marked as read.'); });
    $('#reserveButton')?.addEventListener('click', () => showToast('Storage request noted. A community coordinator will contact you.'));
    $('#saveSettings')?.addEventListener('click', () => { $('#saveMessage').textContent = 'Settings saved'; showToast('Settings saved locally.'); });
}

document.addEventListener('DOMContentLoaded', init);

window.scrollToSection = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
window.openCropForm = () => {
    const form = $('#cropForm');
    if (form) form.style.display = form.style.display === 'block' ? 'none' : 'block';
};
window.addCrop = () => {
    const name = $('#cropName')?.value.trim();
    const quantity = Number($('#cropQuantity')?.value);
    const life = Number($('#cropLife')?.value);
    if (!name || !quantity || !life) {
        showToast('Enter a crop name, quantity and shelf life.');
        return;
    }
    saveCrop({ name, quantity, life, date: new Date().toISOString().slice(0, 10), type: 'Vegetable', icon: '🌿' });
    $('#cropForm').style.display = 'none';
    $('#cropName').value = '';
    $('#cropQuantity').value = '';
    $('#cropLife').value = '';
    showToast(`${name} added to cold storage.`);
};

async function saveCrop(crop) {
    if (state.mode === 'demo') {
        state.crops.push(crop);
        renderAll();
        return;
    }
    const backendCrop = {
        name: crop.name,
        quantity: crop.quantity,
        storageDate: crop.date,
        type: crop.type,
        expectedShelfLife: crop.life
    };
    try {
        const response = await fetch(`${API_URL}/crops`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(backendCrop),
            signal: AbortSignal.timeout(1500)
        });
        if (!response.ok) throw new Error('Crop could not be saved');
        state.backendConnected = true;
        state.crops.push(normalizeCrop(await response.json()));
    } catch (error) {
        state.crops.push(crop);
    }
    renderCrops();
    renderLegacyCrops();
    renderPredictions();
    renderLegacyPredictions();
}