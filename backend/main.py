from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import joblib
import io
import os
from database import init_db, log_analysis 

app = FastAPI(title="Supply Chain AI API - Inference Server")

# Keep this! It's what allows Vercel to talk to Render
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

init_db()

# --- MEMORY OPTIMIZATION ---
# Only load the scaler globally to save RAM.
MODEL_DIR = "models/"
try:
    print("Loading scaler into memory...")
    scaler = joblib.load(os.path.join(MODEL_DIR, "scaler.pkl"))
    print("✅ Scaler loaded successfully!")
except FileNotFoundError:
    print("⚠️ WARNING: scaler.pkl not found.")

@app.get("/")
async def root():
    return {"status": "Supply Chain AI Backend is Running"}

@app.post("/analyze")
async def analyze_data(file: UploadFile = File(...)): 
    
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Only CSV files allowed.")
    
    contents = await file.read()
    try:
        # We use latin1 encoding as it's common for this specific dataset
        df = pd.read_csv(io.BytesIO(contents), encoding='latin1')
        
        # CLEANUP: Remove any hidden spaces from column names
        df.columns = df.columns.str.strip()
    except Exception:
        raise HTTPException(status_code=400, detail="Error reading CSV file.")

    features = [
        'Days for shipping (real)', 'Order Item Profit Ratio', 
        'Order Item Discount Rate', 'Order Item Total', 'Order Item Quantity'
    ]
    
    visual_cols = [
        'Latitude', 'Longitude', 'order date (DateOrders)', 
        'Delivery Status', 'Order City', 'Order Country'
    ]

    all_required = features + visual_cols
    missing_cols = [col for col in all_required if col not in df.columns]
    
    if missing_cols:
        raise HTTPException(status_code=400, detail=f"Dataset error. Missing: {missing_cols}")

    df_clean = df.dropna(subset=features).copy()
    X_new = df_clean[features]
    X_scaled = scaler.transform(X_new)

    # --- MODEL INFERENCE ---
    iso_forest = joblib.load(os.path.join(MODEL_DIR, "isolation_forest.pkl"))
    df_clean['Anomaly'] = iso_forest.predict(X_scaled)

    anomalies = df_clean[df_clean['Anomaly'] == -1].copy()

    def assign_severity(profit):
        if profit < -0.5: return "High"
        elif profit < 0: return "Medium"
        else: return "Low"
    
    anomalies['Severity'] = anomalies['Order Item Profit Ratio'].apply(assign_severity)

    high_sev_count = int((anomalies['Severity'] == 'High').sum())
    total_anomalies_count = len(anomalies)
    total_rows = len(df_clean)

    # --- NEW KPI CALCULATIONS ---
    
    # 1. Avg Delay Days (Check if 'scheduled' column exists to find true delay, else fallback to 'real' days for late orders)
    if 'Days for shipping (scheduled)' in df.columns:
        late_orders = anomalies[anomalies['Delivery Status'] == 'Late delivery']
        delays = late_orders['Days for shipping (real)'] - late_orders['Days for shipping (scheduled)']
        raw_avg_delay = delays[delays > 0].mean()
    else:
        late_orders = anomalies[anomalies['Delivery Status'] == 'Late delivery']
        raw_avg_delay = late_orders['Days for shipping (real)'].mean()
        
    avg_delay_days = 0.0 if pd.isna(raw_avg_delay) else round(float(raw_avg_delay), 1)

    # 2. Revenue Loss (Calculate absolute lost money: Total Sales * Negative Profit Ratio)
    loss_df = anomalies[anomalies['Order Item Profit Ratio'] < 0]
    raw_revenue_loss = (loss_df['Order Item Total'] * loss_df['Order Item Profit Ratio']).sum()
    revenue_loss = round(float(abs(raw_revenue_loss)), 2)

    # 3. On-Time Delivery Rate (Across the entire scanned dataset)
    on_time_orders = df_clean[df_clean['Delivery Status'].isin(['Shipping on time', 'Advance shipping'])]
    on_time_delivery_rate = round(float((len(on_time_orders) / total_rows) * 100), 1) if total_rows > 0 else 0.0

    # Hardcoded "isolation_forest" since it's our sole model
    log_analysis("isolation_forest", total_rows, total_anomalies_count, high_sev_count)

    results = anomalies.fillna("").head(150).to_dict(orient="records")
    
    return {
        "model_used": "isolation_forest",
        "total_rows_analyzed": total_rows,
        "total_anomalies_found": total_anomalies_count,
        "high_severity_count": high_sev_count,
        "at_risk_count": int((anomalies['Delivery Status'] == 'Late delivery').sum()),
        
        # --- NEW JSON OUTPUTS ---
        "avg_delay_days": avg_delay_days,
        "revenue_loss": revenue_loss,
        "on_time_delivery_rate": on_time_delivery_rate,
        
        "anomalies": results
    }