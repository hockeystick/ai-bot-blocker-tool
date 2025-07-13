'use client';

import { useState, useRef } from 'react';

interface ScanResult {
  url: string;
  status: 'pending' | 'scanning' | 'completed' | 'error' | 'timeout';
  isBlocked: boolean | null;
  blockingMethod: string;
  details: string;
  scannedAt?: Date;
}

export default function HomePage() {
  const [file, setFile] = useState<File | null>(null);
  const [results, setResults] = useState<ScanResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [scanProgress, setScanProgress] = useState({ completed: 0, total: 0 });
  const [scanStartTime, setScanStartTime] = useState<Date | null>(null);
  const [currentScanId, setCurrentScanId] = useState<string | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const [estimatedTime, setEstimatedTime] = useState<string>('');
  const [urlCount, setUrlCount] = useState<number>(0);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      
      // Parse CSV to estimate time
      try {
        const text = await selectedFile.text();
        const lines = text.split('\n').filter(line => 
          line.trim() && line.trim().startsWith('http')
        );
        const count = lines.length;
        setUrlCount(count);
        
        // Estimate: ~30-45 seconds per URL (including queue time)
        const estimatedMinutes = Math.ceil((count * 35) / 60);
        const timeText = estimatedMinutes < 1 
          ? `${count * 35} seconds`
          : estimatedMinutes === 1 
            ? '1 minute' 
            : `${estimatedMinutes} minutes`;
        setEstimatedTime(timeText);
      } catch {
        setEstimatedTime('');
        setUrlCount(0);
      }
    }
  };

  const stopPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };

  const pollResults = (id: string) => {
    setScanStartTime(new Date());
    
    pollIntervalRef.current = setInterval(async () => {
      try {
        const resultsResponse = await fetch(`/api/scan/results?scanId=${id}`);
        if (!resultsResponse.ok) throw new Error('Failed to fetch results');
        
        const { results: newResults, isComplete } = await resultsResponse.json();

        setResults(currentResults => {
          const updatedResults = [...currentResults];
          let completedCount = 0;
          
          // Mark currently scanning items
          updatedResults.forEach(result => {
            if (result.status === 'pending') {
              result.status = 'scanning';
              result.details = 'Testing AI bot blocking...';
            }
          });
          
          // Update with new results
          newResults.forEach((newRes: ScanResult) => {
            const index = updatedResults.findIndex(r => r.url === newRes.url);
            if (index !== -1) {
              updatedResults[index] = { 
                ...newRes, 
                status: 'completed',
                scannedAt: new Date()
              };
            }
          });
          
          // Count completed items
          updatedResults.forEach(result => {
            if (result.status === 'completed') completedCount++;
          });
          
          setScanProgress({ completed: completedCount, total: updatedResults.length });
          return updatedResults;
        });

        if (isComplete) {
          stopPolling();
          setIsLoading(false);
          setScanProgress(prev => ({ ...prev, completed: prev.total }));
        }
      } catch (error) {
        console.error("Polling error:", error);
        stopPolling();
        setIsLoading(false);
        
        // Mark failed items as error
        setResults(currentResults => 
          currentResults.map(result => 
            result.status === 'pending' || result.status === 'scanning' 
              ? { ...result, status: 'error', details: 'Connection failed' }
              : result
          )
        );
      }
    }, 2000); // Poll every 2 seconds for better responsiveness
  };

  const cancelScan = () => {
    stopPolling();
    setIsLoading(false);
    setResults(currentResults => 
      currentResults.map(result => 
        result.status === 'pending' || result.status === 'scanning'
          ? { ...result, status: 'error', details: 'Cancelled by user' }
          : result
      )
    );
  };

  const handleScan = async () => {
    if (!file) {
      alert('Please upload a CSV file first.');
      return;
    }
    setIsLoading(true);
    setResults([]);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/scan/start', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Failed to start scan');

      const { scanId, initialUrls } = await response.json();

      setResults(initialUrls.map((url: string) => ({ 
        url, 
        status: 'pending' as const, 
        isBlocked: null, 
        blockingMethod: 'Queued', 
        details: 'Waiting in queue...' 
      })));
      
      setCurrentScanId(scanId);
      setScanProgress({ completed: 0, total: initialUrls.length });
      pollResults(scanId);

    } catch (error) {
      console.error(error);
      alert('An error occurred while starting the scan. Please check your file format.');
      setIsLoading(false);
      setScanProgress({ completed: 0, total: 0 });
    }
  };

  const formatElapsedTime = (startTime: Date) => {
    const elapsed = Math.floor((Date.now() - startTime.getTime()) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-gray-200 text-gray-800';
      case 'scanning': return 'bg-blue-200 text-blue-800 animate-pulse';
      case 'completed': return 'bg-green-200 text-green-800';
      case 'error': return 'bg-red-200 text-red-800';
      case 'timeout': return 'bg-orange-200 text-orange-800';
      default: return 'bg-gray-200 text-gray-800';
    }
  };

  const getStatusText = (result: ScanResult) => {
    switch (result.status) {
      case 'pending': return 'QUEUED';
      case 'scanning': return 'TESTING';
      case 'completed': return result.isBlocked ? 'BLOCKED' : 'ALLOWED';
      case 'error': return 'ERROR';
      case 'timeout': return 'TIMEOUT';
      default: return 'UNKNOWN';
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center p-12 bg-gray-50">
      <div className="z-10 w-full max-w-5xl items-center justify-between font-mono text-sm">
        <h1 className="text-4xl font-bold mb-4 text-center text-gray-800">AI Bot Blocker Checker</h1>
        <p className="text-center text-gray-600 mb-4">Upload a CSV of URLs to see if they block common AI crawlers.</p>
        
        <div className="mb-8 bg-yellow-50 border border-yellow-200 rounded-md p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800">What this tool tests</h3>
              <div className="mt-2 text-sm text-yellow-700">
                <p>• <strong>robots.txt blocking</strong> - Checks for AI bot restrictions</p>
                <p>• <strong>HTTP status responses</strong> - Tests with AI user agents (GPTBot, Google-Extended, etc.)</p>
                <p>• <strong>Content-based blocking</strong> - Scans for blocking messages in page content</p>
                <p className="mt-2 text-xs"><strong>Note:</strong> This tests basic blocking methods. Advanced bot detection systems may not be detected.</p>
              </div>
            </div>
          </div>
        </div>
        
        <div className="space-y-4">
          <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Upload CSV File with URLs
                </label>
                <input 
                  type="file" 
                  accept=".csv" 
                  onChange={handleFileChange} 
                  disabled={isLoading}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50"
                />
                <p className="mt-1 text-xs text-gray-500">
                  CSV should contain URLs in any column. Each URL will be tested for AI bot blocking.
                </p>
              </div>
              
              {file && urlCount > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-blue-800">
                        Ready to scan {urlCount} URL{urlCount !== 1 ? 's' : ''}
                      </h3>
                      <div className="mt-2 text-sm text-blue-700">
                        <p>• Estimated time: <strong>{estimatedTime}</strong></p>
                        <p>• Each URL will be tested with multiple AI bot user agents</p>
                        <p>• Results will appear in real-time as scanning progresses</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              <div className="flex gap-2">
                <button 
                  onClick={handleScan} 
                  disabled={isLoading || !file || urlCount === 0}
                  className="px-6 py-2 text-white font-semibold bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                  {isLoading ? 'Scanning...' : `Start Scan${urlCount > 0 ? ` (${urlCount} URLs)` : ''}`}
                </button>
                {isLoading && (
                  <button 
                    onClick={cancelScan}
                    className="px-4 py-2 text-red-600 font-semibold border border-red-600 rounded-md hover:bg-red-50 transition-colors"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </div>
          
          {isLoading && (
            <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-800">Scan Progress</h3>
                {scanStartTime && (
                  <div className="text-sm text-gray-600 text-right">
                    <div>Elapsed: {formatElapsedTime(scanStartTime)}</div>
                    {scanProgress.total > 0 && scanProgress.completed < scanProgress.total && (
                      <div className="text-xs">
                        Est. remaining: {Math.max(0, Math.ceil(((scanProgress.total - scanProgress.completed) * 35) / 60))}min
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              <div className="w-full bg-gray-200 rounded-full h-3 mb-4">
                <div 
                  className="bg-blue-600 h-3 rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${scanProgress.total > 0 ? (scanProgress.completed / scanProgress.total) * 100 : 0}%` }}
                ></div>
              </div>
              
              <div className="flex justify-between text-sm text-gray-600">
                <span>{scanProgress.completed} of {scanProgress.total} completed</span>
                <span>{scanProgress.total > 0 ? Math.round((scanProgress.completed / scanProgress.total) * 100) : 0}%</span>
              </div>
              
              <div className="mt-4 text-center">
                <div className="inline-flex items-center text-sm text-gray-600">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
                  Processing URLs...
                </div>
              </div>
            </div>
          )}
        </div>

        {results.length > 0 && (
          <div className="mt-10 w-full overflow-hidden rounded-lg shadow-lg">
            <table className="min-w-full bg-white">
              <thead className="bg-gray-800 text-white">
                <tr>
                  <th className="py-3 px-4 text-left">URL</th>
                  <th className="py-3 px-4 text-left">Status</th>
                  <th className="py-3 px-4 text-left">Method</th>
                  <th className="py-3 px-4 text-left">Details</th>
                  <th className="py-3 px-4 text-left">Time</th>
                </tr>
              </thead>
              <tbody className="text-gray-700">
                {results.map((result) => (
                  <tr key={result.url} className="border-b border-gray-200 hover:bg-gray-100">
                    <td className="py-3 px-4 font-mono text-sm break-all max-w-xs">
                      <div className="truncate" title={result.url}>
                        {result.url}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(result.status)}`}>
                        {getStatusText(result)}
                      </span>
                    </td>
                    <td className="py-3 px-4">{result.blockingMethod}</td>
                    <td className="py-3 px-4 text-sm max-w-xs">
                      <div className="truncate" title={result.details}>
                        {result.details}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-xs text-gray-500">
                      {result.scannedAt ? result.scannedAt.toLocaleTimeString() : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}