// Display file name when selected
document.getElementById('csvFileInput').addEventListener('change', function(e) {
    if(e.target.files.length > 0) {
        const fileName = e.target.files[0].name;
        document.getElementById('fileNameDisplay').innerText = `Selected: ${fileName}`;
        document.getElementById('fileNameDisplay').style.display = 'block';
    }
});

document.getElementById('analyzeBtn').addEventListener('click', async () => {
    const fileInput = document.getElementById('csvFileInput');
    const modelType = document.getElementById('modelSelect').value;

    if (!fileInput.files.length) {
        alert("Please select a CSV file first!");
        return;
    }

    // --- UI STATE: START ANALYSIS ---
    document.getElementById('analyzeBtn').disabled = true;
    document.getElementById('loadingIndicator').style.display = 'block';
    document.getElementById('successIndicator').style.display = 'none'; 

    const formData = new FormData();
    formData.append("file", fileInput.files[0]);
    formData.append("model_type", modelType);

    try {
        // Updated to your live Render Backend URL
        const response = await fetch("https://supply-chain-anomaly-detection-v2.onrender.com/analyze", {
            method: "POST",
            body: formData
        });

        if (!response.ok) {
            const err = await response.json();
            alert(`Error: ${err.detail}`);
            throw new Error(err.detail);
        }

        const data = await response.json();
        
        // Draw all the charts
        updateDashboard(data);

        // --- UI STATE: ANALYSIS COMPLETE ---
        document.getElementById('successIndicator').style.display = 'block';

    } catch (error) {
        console.error("Analysis Failed:", error);
        alert("Backend is waking up or connection failed. Please try again in 30 seconds.");
    } finally {
        // --- UI STATE: RESET ---
        document.getElementById('analyzeBtn').disabled = false;
        document.getElementById('loadingIndicator').style.display = 'none';
    }
});

function updateDashboard(data) {
    // 1. Update KPIs
    document.getElementById('kpi-total').innerText = data.total_rows_analyzed.toLocaleString();
    document.getElementById('kpi-anomalies').innerText = data.total_anomalies_found.toLocaleString();
    document.getElementById('kpi-severity').innerText = data.high_severity_count.toLocaleString();
    document.getElementById('kpi-late').innerText = data.at_risk_count.toLocaleString();

    const anomalies = data.anomalies;

    // Enhanced Premium Dark Layout
    const darkLayout = {
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        font: { color: '#94A3B8', family: 'Inter, sans-serif' },
        margin: { t: 20, r: 20, l: 40, b: 40 },
        xaxis: { gridcolor: '#1E293B', zerolinecolor: '#1E293B' },
        yaxis: { gridcolor: '#1E293B', zerolinecolor: '#1E293B' }
    };

    // 2. Map Chart (Vibrant Heatmap style)
    const mapTrace = {
        type: 'scattergeo',
        lon: anomalies.map(a => a['Longitude']),
        lat: anomalies.map(a => a['Latitude']),
        mode: 'markers',
        marker: { 
            size: 8, 
            color: '#FF5722', 
            opacity: 0.8,
            line: { width: 1, color: '#ffffff' } 
        },
        text: anomalies.map(a => `${a['Order City']}, ${a['Order Country']}`)
    };
    const mapLayout = { ...darkLayout, geo: { bgcolor: 'rgba(0,0,0,0)', showland: true, landcolor: '#1A233A', showocean: true, oceancolor: '#0A0F1C', bordercolor: '#23304A' }, margin: { t: 0, r: 0, l: 0, b: 0 }};
    Plotly.newPlot('mapChart', [mapTrace], mapLayout, {displayModeBar: false});

    // 3. Donut Chart
    const statusCounts = {};
    anomalies.forEach(a => {
        statusCounts[a['Delivery Status']] = (statusCounts[a['Delivery Status']] || 0) + 1;
    });
    const donutTrace = {
        values: Object.values(statusCounts),
        labels: Object.keys(statusCounts),
        type: 'pie', hole: 0.65,
        marker: { 
            colors: ['#3B82F6', '#F59E0B', '#EF4444', '#10B981', '#14B8A6'],
            line: { color: '#131B2C', width: 2 } 
        },
        textinfo: 'percent', hoverinfo: 'label+value'
    };
    Plotly.newPlot('donutChart', [donutTrace], { ...darkLayout, margin: {t:10, b:10, l:10, r:10}}, {displayModeBar: false});

    // 4. Bar Chart (Top Cities)
    const cityCounts = {};
    anomalies.forEach(a => { cityCounts[a['Order City']] = (cityCounts[a['Order City']] || 0) + 1; });
    const sortedCities = Object.entries(cityCounts).sort((a,b) => b[1] - a[1]).slice(0, 5);
    
    const barTrace = {
        x: sortedCities.map(c => c[0]),
        y: sortedCities.map(c => c[1]),
        type: 'bar',
        marker: { 
            color: ['#EF4444', '#F97316', '#EAB308', '#3B82F6', '#10B981'] 
        }
    };
    Plotly.newPlot('barChart', [barTrace], darkLayout, {displayModeBar: false});

    // 5. Line Chart (Anomalies Over Time)
    const timeCounts = {};
    anomalies.forEach(a => { 
        let date = String(a['order date (DateOrders)']).split(' ')[0]; 
        timeCounts[date] = (timeCounts[date] || 0) + 1; 
    });
    const sortedDates = Object.keys(timeCounts).sort();
    const timeTrace = {
        x: sortedDates,
        y: sortedDates.map(d => timeCounts[d]),
        type: 'scatter', 
        mode: 'lines+markers',
        line: { 
            color: '#EF4444', 
            width: 3, 
            shape: 'spline' 
        },
        marker: { size: 6, color: '#FFFFFF', line: {color: '#EF4444', width: 2} },
        fill: 'tozeroy', 
        fillcolor: 'rgba(239, 68, 68, 0.1)' 
    };
    Plotly.newPlot('timeChart', [timeTrace], {...darkLayout, margin: {t:10, b:30, l:30, r:10}, xaxis: {showgrid: false, gridcolor: '#1E293B'}}, {displayModeBar: false});

    // 6. Quantity Chart (Green)
    const qtyCounts = {};
    anomalies.forEach(a => { qtyCounts[a['Order Item Quantity']] = (qtyCounts[a['Order Item Quantity']] || 0) + 1; });
    const sortedQty = Object.entries(qtyCounts).sort((a,b) => a[0] - b[0]); 
    
    const qtyTrace = {
        x: sortedQty.map(q => `Qty ${q[0]}`),
        y: sortedQty.map(q => q[1]),
        type: 'bar',
        marker: { color: '#10B981' } 
    };
    Plotly.newPlot('quantityChart', [qtyTrace], darkLayout, {displayModeBar: false});

    // 7. Scatter Plot (Financial Impact)
    const scatterTrace = {
        x: anomalies.map(a => a['Order Item Discount Rate']),
        y: anomalies.map(a => a['Order Item Profit Ratio']),
        mode: 'markers',
        type: 'scatter',
        marker: { 
            size: 8, 
            color: 'rgba(59, 130, 246, 0.7)', 
            line: { color: '#60A5FA', width: 1 } 
        },
        text: anomalies.map(a => `Discount: ${a['Order Item Discount Rate']}<br>Profit: ${a['Order Item Profit Ratio']}`)
    };
    const scatterLayout = { ...darkLayout, xaxis: {title: 'Discount Rate', gridcolor: '#1E293B'}, yaxis: {title: 'Profit Ratio', gridcolor: '#1E293B'}};
    Plotly.newPlot('scatterChart', [scatterTrace], scatterLayout, {displayModeBar: false});

    // 8. Update Data Table
    const tableBody = document.getElementById('tableBody');
    tableBody.innerHTML = '';
    anomalies.slice(0, 10).forEach(item => {
        let severityBadge = '';
        if (item.Severity === 'High') {
            severityBadge = '<span class="badge-severity-high">HIGH</span>';
        } else if (item.Severity === 'Medium') {
            severityBadge = '<span class="badge-severity-med">MED</span>';
        } else {
            severityBadge = '<span class="badge-severity-low">LOW</span>';
        }

        let row = `<tr>
            <td>${item['Order City']}</td>
            <td>${item['Order Country']}</td>
            <td>${item['Delivery Status']}</td>
            <td>${(item['Order Item Discount Rate'] * 100).toFixed(1)}%</td>
            <td class="${item['Order Item Profit Ratio'] < 0 ? 'red-text' : ''}">${item['Order Item Profit Ratio'].toFixed(2)}</td>
            <td>${severityBadge}</td>
        </tr>`;
        tableBody.innerHTML += row;
    });
}