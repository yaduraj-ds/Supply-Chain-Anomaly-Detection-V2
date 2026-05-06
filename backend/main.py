from fastapi import FastAPI, UploadFile, File, Form, HTTPException
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

MODEL_DIR = "models/"
try:
    print("Loading models into memory...")
    scaler = joblib.load(os.path.join(MODEL_DIR, "scaler.pkl"))
    iso_forest = joblib.load(os.path.join(MODEL_DIR, "isolation_forest.pkl"))
    lof = joblib.load(os.path.join(MODEL_DIR, "lof.pkl"))
    print("✅ Models loaded successfully!")
except FileNotFoundError:
    print("⚠️ WARNING: .pkl files not found.")

@app.post("/analyze")
async def analyze_data(
    file: UploadFile = File(...),
    model_type: str = Form(...)
):
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

    if model_type == "isolation_forest":
        df_clean['Anomaly'] = iso_forest.predict(X_scaled)
    elif model_type == "lof":
        df_clean['Anomaly'] = lof.predict(X_scaled)
    else:
        raise HTTPException(status_code=400, detail="Invalid model type.")

    anomalies = df_clean[df_clean['Anomaly'] == -1].copy()

    def assign_severity(profit):
        if profit < -0.5: return "High"
        elif profit < 0: return "Medium"
        else: return "Low"
    
    anomalies['Severity'] = anomalies['Order Item Profit Ratio'].apply(assign_severity)

    high_sev_count = int((anomalies['Severity'] == 'High').sum())
    total_anomalies_count = len(anomalies)
    total_rows = len(df_clean)

    log_analysis(model_type, total_rows, total_anomalies_count, high_sev_count)

    results = anomalies.fillna("").head(150).to_dict(orient="records")
    
    return {
        "model_used": model_type,
        "total_rows_analyzed": total_rows,
        "total_anomalies_found": total_anomalies_count,
        "high_severity_count": high_sev_count,
        "at_risk_count": int((anomalies['Delivery Status'] == 'Late delivery').sum()),
        "anomalies": results
    }