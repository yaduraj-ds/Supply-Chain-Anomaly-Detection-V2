// ---- Plotly Obsidian Ops Theme Config ----
const THEME = {
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor:  'rgba(0,0,0,0)',
    font: { family: 'DM Sans, sans-serif', color: '#8892A8', size: 11 },
    margin: { t: 10, b: 30, l: 40, r: 10 },
    colorway: ['#00D4FF','#7B61FF','#F43F5E','#00E5A0','#FFB547','#3B82F6'],
    xaxis: { gridcolor: 'rgba(255,255,255,0.05)', zerolinecolor: 'rgba(255,255,255,0.05)' },
    yaxis: { gridcolor: 'rgba(255,255,255,0.05)', zerolinecolor: 'rgba(255,255,255,0.05)' },
};

// ---- Empty placeholder charts on load ----
function renderEmptyCharts() {
    const ids = ['timeChart','mapChart','donutChart','barChart'];
    ids.forEach(id => {
        Plotly.newPlot(id, [], {
            ...THEME,
            margin: { t: 10, b: 30, l: 40, r: 10 },
            annotations: [{
                text: 'Awaiting Cloud Analysis...',
                showarrow: false,
                x: 0.5, y: 0.5,
                xref: 'paper', yref: 'paper',
                font: { color: '#5A6380', size: 12 }
            }]
        }, { responsive: true, displayModeBar: false });
    });
}
renderEmptyCharts();

// ---- Drag-and-drop & File Selection ----
const uploadBox = document.getElementById('uploadBox');
uploadBox.addEventListener('dragover', e => { e.preventDefault(); uploadBox.classList.add('drag-over'); });
uploadBox.addEventListener('dragleave', () => uploadBox.classList.remove('drag-over'));
uploadBox.addEventListener('drop', e => {
    e.preventDefault();
    uploadBox.classList.remove('drag-over');
    if (e.dataTransfer.files[0] && e.dataTransfer.files[0].name.endsWith('.csv')) {
        document.getElementById('csvFileInput').files = e.dataTransfer.files;
        updateFileName(e.dataTransfer.files[0]);
    }
});

document.getElementById('csvFileInput').addEventListener('change', e => {
    if (e.target.files[0]) updateFileName(e.target.files[0]);
});

function updateFileName(file) {
    const display = document.getElementById('fileNameDisplay');
    display.style.display = 'block';
    display.textContent = '📄 ' + file.name;
}

// ---- Analyze Button (Hits the Live Render Backend) ----
document.getElementById('analyzeBtn').addEventListener('click', async () => {
    const fileInput = document.getElementById('csvFileInput');
    if (!fileInput.files.length) {
        alert('Please upload a CSV file first.');
        return;
    }

    // Update UI State
    document.getElementById('statusIdle').style.display = 'none';
    document.getElementById('loadingIndicator').style.display = 'block';
    document.getElementById('successIndicator').style.display = 'none';

    const formData = new FormData();
    formData.append("file", fileInput.files[0]);

    try {
        // Connected to your actual FastAPI Python backend
        const response = await fetch("https://supply-chain-anomaly-detection-v2.onrender.com/analyze", {
            method: "POST",
            body: formData
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || "Server Error");
        }

        const data = await response.json();
        
        // Update Dashboard with Backend JSON
        updateKPIs(data);
        renderCharts(data.anomalies);
        renderTable(data.anomalies);

        // Success State
        document.getElementById('loadingIndicator').style.display = 'none';
        document.getElementById('successIndicator').style.display = 'block';

    } catch (error) {
        console.error("Analysis Failed:", error);
        alert("Backend connection failed. The free Render server might be waking up (takes ~30-50s). Please try clicking 'Run Analysis' again.");
        document.getElementById('loadingIndicator').style.display = 'none';
        document.getElementById('statusIdle').style.display = 'block';
    }
});

// ---- KPI Animation with Decimals & Formatting ----
function animateCount(id, target, decimals = 0, prefix = '', suffix = '') {
    const el = document.getElementById(id);
    if (!target && target !== 0) { el.textContent = prefix + "0" + suffix; return; }
    
    let start = 0; const duration = 800;
    const step = target / (duration / 16);
    
    const timer = setInterval(() => {
        start = Math.min(start + step, target);
        const formattedStr = start.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        el.textContent = prefix + formattedStr + suffix;
        if (start >= target) clearInterval(timer);
    }, 16);
}

function updateKPIs(data) {
    // 4 Original KPIs
    animateCount('kpi-total', data.total_rows_analyzed);
    animateCount('kpi-anomalies', data.total_anomalies_found);
    animateCount('kpi-severity', data.high_severity_count);
    animateCount('kpi-late', data.at_risk_count);
    
    // 3 New KPIs powered by the updated Python backend
    animateCount('kpi-delay', data.avg_delay_days, 1);
    animateCount('kpi-revenue', data.revenue_loss, 2, '$');
    animateCount('kpi-ontime', data.on_time_delivery_rate, 1, '', '%');
}

// ---- Chart rendering (Using Backend Columns & Obsidian Theme) ----
function renderCharts(anomalies) {
    const cfg = { responsive: true, displayModeBar: false };

    // 1. Time chart (Anomalies over time)
    const dateCounts = {};
    anomalies.forEach(r => {
        const d = String(r['order date (DateOrders)']).split(' ')[0] || 'Unknown';
        dateCounts[d] = (dateCounts[d] || 0) + 1;
    });
    const dates = Object.keys(dateCounts).sort();
    Plotly.react('timeChart', [{
        x: dates, y: dates.map(d => dateCounts[d]),
        type: 'scatter', mode: 'lines+markers',
        line: { color: '#00D4FF', width: 2 },
        marker: { color: '#7B61FF', size: 5 },
        fill: 'tozeroy', fillcolor: 'rgba(0,212,255,0.08)',
    }], { ...THEME, xaxis: { ...THEME.xaxis, showgrid: false } }, cfg);

    // 2. Map (Choropleth Heatmap)
    const countryCounts = {};
    anomalies.forEach(r => { 
        const c = r['Order Country'] || 'Unknown'; 
        countryCounts[c] = (countryCounts[c]||0) + 1; 
    });
    Plotly.react('mapChart', [{
        type: 'choropleth', locationmode: 'country names',
        locations: Object.keys(countryCounts),
        z: Object.values(countryCounts),
        colorscale: [[0,'#111520'],[0.5,'#7B61FF'],[1,'#00D4FF']],
        showscale: false,
    }], {
        ...THEME,
        geo: { bgcolor: 'rgba(0,0,0,0)', showframe: false, showcoastlines: true, coastlinecolor: 'rgba(255,255,255,0.08)', landcolor: '#111520', showland: true }
    }, cfg);

    // 3. Donut (Delivery Status)
    const statusCounts = {};
    anomalies.forEach(r => { 
        const s = r['Delivery Status'] || 'Unknown'; 
        statusCounts[s] = (statusCounts[s]||0) + 1; 
    });
    Plotly.react('donutChart', [{
        type: 'pie', hole: 0.55,
        labels: Object.keys(statusCounts),
        values: Object.values(statusCounts),
        marker: { colors: ['#F43F5E','#FFB547','#00D4FF','#7B61FF','#00E5A0'] },
        textinfo: 'none',
    }], { ...THEME, showlegend: true, legend: { font: { size: 10, color: '#8892A8' }, bgcolor: 'rgba(0,0,0,0)' }, margin: { t:5, b:5, l:5, r:5 } }, cfg);

    // 4. Bar (Top Cities)
    const cityCounts = {};
    anomalies.forEach(r => { 
        const c = r['Order City'] || 'Unknown'; 
        cityCounts[c]=(cityCounts[c]||0) + 1; 
    });
    const topCities = Object.entries(cityCounts).sort((a,b)=>b[1]-a[1]).slice(0,8);
    Plotly.react('barChart', [{
        type: 'bar', orientation: 'h',
        y: topCities.map(c=>c[0]), x: topCities.map(c=>c[1]),
        marker: { color: '#7B61FF', opacity: 0.85 },
    }], { ...THEME, margin: { t:5, b:30, l:80, r:10 }, yaxis: { ...THEME.yaxis, autorange: 'reversed' } }, cfg);
}

// ---- Backend Rendered Table ----
function renderTable(anomalies) {
    // Show top 50 high severity logs
    const highSev = anomalies.filter(r => r.Severity === 'High').slice(0, 50);
    const tbody = document.getElementById('tableBody');
    if (!highSev.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:16px;">No high-severity anomalies detected.</td></tr>';
        return;
    }
    
    tbody.innerHTML = highSev.map(r => {
        const discount = r['Order Item Discount Rate'] * 100;
        const profit = r['Order Item Profit Ratio'];
        return `
            <tr>
                <td>${r['Order City']}</td>
                <td>${r['Order Country']}</td>
                <td>${r['Delivery Status']}</td>
                <td>${discount.toFixed(1)}%</td>
                <td style="color:${profit < 0 ? 'var(--crimson)' : 'var(--emerald)'}">${profit.toFixed(2)}</td>
                <td><span class="badge-severity-high">HIGH</span></td>
            </tr>
        `;
    }).join('');
}