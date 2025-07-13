-- Database schema for AI Bot Blocker Tool
CREATE TABLE IF NOT EXISTS ScanResults (
    id SERIAL PRIMARY KEY,
    scan_id VARCHAR(50) NOT NULL,
    url TEXT NOT NULL,
    is_blocked BOOLEAN NOT NULL,
    blocking_method VARCHAR(100) NOT NULL,
    details TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(scan_id, url)
);

CREATE INDEX IF NOT EXISTS idx_scan_results_scan_id ON ScanResults(scan_id);
CREATE INDEX IF NOT EXISTS idx_scan_results_created_at ON ScanResults(created_at);