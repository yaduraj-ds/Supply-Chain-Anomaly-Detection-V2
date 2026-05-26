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
    # Notice we removed model_type from the parameters here!
    
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
        # If missing, it's likely a naming mismatch. We show exactly what's missing.
        raise HTTPException(status_code=400, detail=f"Dataset error. Missing: {missing_cols}")

    df_clean = df.dropna(subset=features).copy()
    X_new = df_clean[features]
    X_scaled = scaler.transform(X_new)

    # --- MODEL INFERENCE ---
    # We now exclusively load and use Isolation Forest for maximum stability
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

    # Hardcoded "isolation_forest" since it's our sole model now
    log_analysis("isolation_forest", total_rows, total_anomalies_count, high_sev_count)

    results = anomalies.fillna("").head(150).to_dict(orient="records")
    
    return {
        "model_used": "isolation_forest",
        "total_rows_analyzed": total_rows,
        "total_anomalies_found": total_anomalies_count,
        "high_severity_count": high_sev_count,
        "at_risk_count": int((anomalies['Delivery Status'] == 'Late delivery').sum()),
        "anomalies": results
    }