'use client';

import { useState } from 'react';

interface ScanResult {
  url: string;
  status: 'pending' | 'completed' | 'error';
  isBlocked: boolean | null;
  blockingMethod: string;
  details: string;
}

export default function HomePage() {
  const [file, setFile] = useState<File | null>(null);
  const [results, setResults] = useState<ScanResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [pollingError, setPollingError] = useState<string | null>(null);
  const [scanCompleteMessage, setScanCompleteMessage] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFile(e.target.files[0]);
    }
  };

  const pollResults = (id: string) => {
    const interval = setInterval(async () => {
      try {
        const resultsResponse = await fetch(`/api/scan/results?scanId=${id}`);
        if (!resultsResponse.ok) throw new Error('Failed to fetch results');
        
        const { results: newResults, isComplete } = await resultsResponse.json();

        setResults(currentResults => {
          const updatedResults = [...currentResults];
          newResults.forEach((newRes: ScanResult) => {
            const index = updatedResults.findIndex(r => r.url === newRes.url);
            if (index !== -1) {
              updatedResults[index] = { ...newRes, status: 'completed' };
            }
          });
          return updatedResults;
        });

        if (isComplete) {
          clearInterval(interval);
          setIsLoading(false);
          setScanCompleteMessage('Scan Complete!');
          // alert('Scan Complete!'); // Replaced with state message
        }
      } catch (error) {
        console.error("Polling error:", error);
        setPollingError(`Polling failed: ${error instanceof Error ? error.message : "An unknown error occurred"}`);
        clearInterval(interval);
        setIsLoading(false);
      }
    }, 5000); // Poll every 5 seconds
  };

  const handleScan = async () => {
    if (!file) {
      alert('Please upload a CSV file first.'); // Simple alert for this specific validation is fine
      return;
    }
    setIsLoading(true);
    setResults([]);
    setPollingError(null); // Clear previous polling errors
    setScanCompleteMessage(null); // Clear previous completion message


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
        status: 'pending', 
        isBlocked: null, 
        blockingMethod: '...', 
        details: 'In queue...' 
      })));

      pollResults(scanId);

    } catch (error) {
      console.error(error);
      alert('An error occurred while starting the scan.');
      setIsLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center p-12 bg-gray-50">
      <div className="z-10 w-full max-w-5xl items-center justify-between font-mono text-sm">
        <h1 className="text-4xl font-bold mb-4 text-center text-gray-800">AI Bot Blocker Checker</h1>
        <p className="text-center text-gray-600 mb-8">Upload a CSV of URLs to see if they block common AI crawlers.</p>
        
        <div className="flex justify-center items-center gap-4 p-6 bg-white rounded-lg shadow-md border border-gray-200">
          <input 
            type="file" 
            accept=".csv" 
            onChange={handleFileChange} 
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
          <button 
            onClick={handleScan} 
            disabled={isLoading}
            className="px-6 py-2 text-white font-semibold bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? 'Scanning...' : 'Start Scan'}
          </button>
        </div>

        {pollingError && (
          <div className="mt-4 p-3 bg-red-100 text-red-700 border border-red-400 rounded-md text-center">
            <p><strong>Error:</strong> {pollingError}</p>
          </div>
        )}

        {scanCompleteMessage && !isLoading && (
           <div className="mt-4 p-3 bg-green-100 text-green-700 border border-green-400 rounded-md text-center">
            <p>{scanCompleteMessage}</p>
          </div>
        )}

        {results.length > 0 && (
          <div className="mt-6 w-full overflow-hidden rounded-lg shadow-lg">
            <table className="min-w-full bg-white">
              <thead className="bg-gray-800 text-white">
                <tr>
                  <th className="py-3 px-4 text-left">URL</th>
                  <th className="py-3 px-4 text-left">Blocked?</th>
                  <th className="py-3 px-4 text-left">Method</th>
                  <th className="py-3 px-4 text-left">Details</th>
                </tr>
              </thead>
              <tbody className="text-gray-700">
                {results.map((result) => (
                  <tr key={result.url} className="border-b border-gray-200 hover:bg-gray-100">
                    <td className="py-3 px-4 font-mono text-sm break-all">{result.url}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                        result.status !== 'completed' ? 'bg-yellow-200 text-yellow-800' :
                        result.isBlocked ? 'bg-red-200 text-red-800' : 'bg-green-200 text-green-800'
                      }`}>
                        {result.status !== 'completed' ? 'PENDING' : result.isBlocked ? 'YES' : 'NO'}
                      </span>
                    </td>
                    <td className="py-3 px-4">{result.blockingMethod}</td>
                    <td className="py-3 px-4 text-sm">{result.details}</td>
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