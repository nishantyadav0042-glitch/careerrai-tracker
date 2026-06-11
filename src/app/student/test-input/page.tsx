'use client';
import { useState } from 'react';

export default function TestInputPage() {
  const [text, setText] = useState('');
  const [number, setNumber] = useState('');

  return (
    <div style={{ padding: '40px', fontFamily: 'Arial' }}>
      <h1>🧪 BARE INPUT TEST - NO LAYOUT</h1>
      <p style={{ color: '#666' }}>This page has NO parent layout, NO form, NO handlers. Just plain inputs.</p>

      <div style={{ marginBottom: '30px' }}>
        <h2>Test 1: Type &quot;hello&quot;</h2>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type here..."
          style={{
            fontSize: '16px',
            padding: '10px',
            width: '300px',
            border: '2px solid blue'
          }}
          autoFocus
        />
        <p>Value: {text}</p>
      </div>

      <div style={{ marginBottom: '30px' }}>
        <h2>Test 2: Type &quot;12345&quot;</h2>
        <input
          type="text"
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          placeholder="Type numbers..."
          style={{
            fontSize: '16px',
            padding: '10px',
            width: '300px',
            border: '2px solid green'
          }}
        />
        <p>Value: {number}</p>
      </div>

      <div style={{ marginTop: '40px', padding: '20px', backgroundColor: '#f0f0f0' }}>
        <h3>❓ Can you type multiple characters at once WITHOUT pressing Enter?</h3>
        <p style={{ fontSize: '18px', fontWeight: 'bold' }}>
          {text.length > 1 && number.length > 1 ? '✅ YES - FORM WORKS!' : '❌ NO - ISSUE EXISTS'}
        </p>
      </div>
    </div>
  );
}
