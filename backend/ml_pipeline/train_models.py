import pandas as pd
import joblib
import os
from sklearn.ensemble import IsolationForest
from sklearn.neighbors import LocalOutlierFactor
from sklearn.preprocessing import StandardScaler

# Define paths relative to this script
DATA_PATH = r"C:\Users\Yaduraj Chheniya\OneDrive\Documents\Supply-Chain-Anomaly-SaaS\data\DataCoSupplyChainDataset.csv"
MODEL_DIR = r"C:\Users\Yaduraj Chheniya\OneDrive\Documents\Supply-Chain-Anomaly-SaaS\backend\models"

def train_and_save_models():
    print("Loading historical dataset...")
    try:
        df = pd.read_csv(DATA_PATH, encoding='latin1')
    except FileNotFoundError:
        print(f"Error: Dataset not found at {DATA_PATH}.")
        print("Please ensure your CSV is inside the 'data' folder.")
        return

    # The core features the AI will learn from
    features = [
        'Days for shipping (real)', 'Order Item Profit Ratio', 
        'Order Item Discount Rate', 'Order Item Total', 'Order Item Quantity'
    ]

    print("Cleaning and preparing data...")
    df_clean = df.dropna(subset=features).copy()
    X = df_clean[features]

    print("Scaling features...")
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    # Ensure the models directory exists
    os.makedirs(MODEL_DIR, exist_ok=True)

    # 1. Save the Scaler (Crucial so new data is scaled exactly the same way)
    joblib.dump(scaler, os.path.join(MODEL_DIR, "scaler.pkl"))
    print("✅ Saved: scaler.pkl")

    # 2. Train and Save Isolation Forest
    print("Training Isolation Forest...")
    iso_forest = IsolationForest(contamination=0.05, random_state=42)
    iso_forest.fit(X_scaled)
    joblib.dump(iso_forest, os.path.join(MODEL_DIR, "isolation_forest.pkl"))
    print("✅ Saved: isolation_forest.pkl")

    # 3. Train and Save LOF
    print("Training Local Outlier Factor...")
    # NOTE: novelty=True is strictly required to use LOF for predicting new, unseen data later
    lof = LocalOutlierFactor(n_neighbors=20, contamination=0.05, novelty=True)
    lof.fit(X_scaled)
    joblib.dump(lof, os.path.join(MODEL_DIR, "lof.pkl"))
    print("✅ Saved: lof.pkl")

    print("\n🚀 Training complete! All .pkl files are stored in the 'models' folder.")

if __name__ == "__main__":
    train_and_save_models()