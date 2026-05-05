import sqlite3
from datetime import datetime

DB_FILE = "scout_history.db"

def init_db():
    """Creates the database and table if they don't exist."""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS analysis_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT,
            model_used TEXT,
            total_rows_scanned INTEGER,
            total_anomalies INTEGER,
            high_severity_anomalies INTEGER
        )
    ''')
    conn.commit()
    conn.close()
    print("✅ Database initialized successfully!")

def log_analysis(model_used, total_rows, total_anomalies, high_severity_anomalies):
    """Saves a record of the analysis run."""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO analysis_logs (timestamp, model_used, total_rows_scanned, total_anomalies, high_severity_anomalies)
        VALUES (?, ?, ?, ?, ?)
    ''', (
        datetime.now().strftime("%Y-%m-%d %H:%M:%S"), 
        model_used, 
        total_rows, 
        total_anomalies, 
        high_severity_anomalies
    ))
    conn.commit()
    conn.close()