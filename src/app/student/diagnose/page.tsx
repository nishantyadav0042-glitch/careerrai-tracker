'use client';

import { useState } from 'react';

export default function DiagnosticsPage() {
  const [testValue, setTestValue] = useState('');
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (msg: string) => {
    console.log(msg);
    setLogs((prev) => [...prev, `${new Date().toLocaleTimeString()}: ${msg}`]);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    addLog(`onChange: e.target.value="${e.target.value}", length=${e.target.value.length}`);
    setTestValue(e.target.value);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    addLog(`onKeyDown: key="${e.key}", value="${(e.target as HTMLInputElement).value}"`);
  };

  const handleKeyUp = (e: React.KeyboardEvent<HTMLInputElement>) => {
    addLog(`onKeyUp: key="${e.key}", value="${(e.target as HTMLInputElement).value}"`);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pastedText = e.clipboardData?.getData('text');
    addLog(`onPaste: "${pastedText}"`);
  };

  const testInputDetection = () => {
    const input = document.querySelector('input[id="test-input"]') as HTMLInputElement;
    if (!input) {
      addLog('ERROR: Input element not found in DOM!');
      return;
    }
    addLog(`Input found: type="${input.type}", maxLength="${input.maxLength}"`);
    addLog(`Input value: "${input.value}"`);
    addLog(`Input width: ${input.offsetWidth}px`);
    addLog(`Input CSS display: ${getComputedStyle(input).display}`);
    addLog(`Input CSS visibility: ${getComputedStyle(input).visibility}`);
    addLog(`Input CSS pointerEvents: ${getComputedStyle(input).pointerEvents}`);
  };

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">🔍 Input Diagnostics</h1>

      <div className="space-y-6">
        {/* Test Input */}
        <div className="bg-blue-50 border-2 border-blue-300 p-6 rounded-lg">
          <h2 className="text-xl font-bold mb-3">Test Input Field</h2>
          <p className="text-sm text-stone-600 mb-3">Try typing &quot;hello&quot; or &quot;12345&quot; below:</p>
          <input
            id="test-input"
            type="text"
            value={testValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onKeyUp={handleKeyUp}
            onPaste={handlePaste}
            placeholder="Type here to test..."
            className="w-full px-4 py-3 border-2 border-stone-300 rounded-lg text-lg focus:outline-none focus:border-blue-500"
          />
          <p className="mt-3 text-sm font-mono bg-white p-2 rounded border">
            Current value: <span className="font-bold">&quot;{testValue}&quot;</span> (length: {testValue.length})
          </p>
          <button
            onClick={testInputDetection}
            className="mt-3 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Inspect Input Element
          </button>
        </div>

        {/* Logs */}
        <div className="bg-stone-50 border-2 border-stone-300 p-6 rounded-lg">
          <h2 className="text-xl font-bold mb-3">Event Logs</h2>
          <div className="bg-white border rounded p-3 font-mono text-sm space-y-1 max-h-60 overflow-y-auto">
            {logs.length === 0 ? (
              <p className="text-stone-400">No events yet. Try typing in the input above...</p>
            ) : (
              logs.map((log, i) => (
                <div key={i} className="text-stone-700">
                  {log}
                </div>
              ))
            )}
          </div>
          <button
            onClick={() => setLogs([])}
            className="mt-3 px-4 py-2 bg-stone-400 text-white rounded hover:bg-stone-500"
          >
            Clear Logs
          </button>
        </div>

        {/* Browser Info */}
        <div className="bg-green-50 border-2 border-green-300 p-6 rounded-lg">
          <h2 className="text-xl font-bold mb-3">Browser Information</h2>
          <div className="space-y-2 text-sm">
            <p><strong>User Agent:</strong> {typeof navigator !== 'undefined' ? navigator.userAgent : 'N/A'}</p>
            <p><strong>Page URL:</strong> {typeof window !== 'undefined' ? window.location.href : 'N/A'}</p>
            <p><strong>Timestamp:</strong> {new Date().toISOString()}</p>
          </div>
        </div>

        {/* Instructions */}
        <div className="bg-yellow-50 border-2 border-yellow-300 p-6 rounded-lg">
          <h2 className="text-xl font-bold mb-3">📋 What to Do</h2>
          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li>Type &quot;hello&quot; or &quot;12345&quot; in the test input above</li>
            <li>Watch the event logs - do you see onChange events for each character?</li>
            <li>Check if the value under the input updates correctly</li>
            <li>Click &quot;Inspect Input Element&quot; and check the output</li>
            <li><strong>Copy all the logs and send them to me</strong></li>
          </ol>
        </div>
      </div>
    </div>
  );
}
