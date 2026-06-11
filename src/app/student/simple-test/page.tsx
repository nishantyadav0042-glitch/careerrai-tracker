'use client';

export default function SimpleTestPage() {
  return (
    <div style={{ padding: '40px', maxWidth: '600px', margin: '0 auto' }}>
      <h1>🧪 Ultra-Simple Test - NO React State</h1>
      <p style={{ color: '#666', marginBottom: '20px' }}>
        This uses ONLY plain HTML with no React state management whatsoever.
      </p>

      <div style={{
        backgroundColor: '#e3f2fd',
        border: '2px solid #2196f3',
        padding: '20px',
        borderRadius: '8px',
        marginBottom: '20px'
      }}>
        <h2>Test 1: Basic HTML Input (No JS at all)</h2>
        <label style={{ display: 'block', marginBottom: '10px', fontWeight: 'bold' }}>
          Type anything here:
        </label>
        <input
          type="text"
          defaultValue=""
          placeholder="Type 'hello' or '12345'..."
          style={{
            width: '100%',
            padding: '10px',
            fontSize: '16px',
            border: '1px solid #ccc',
            borderRadius: '4px',
            boxSizing: 'border-box'
          }}
        />
        <p style={{ marginTop: '10px', fontSize: '12px', color: '#666' }}>
          ℹ️ If you can type multiple characters here, React isn&apos;t the problem.
        </p>
      </div>

      <div style={{
        backgroundColor: '#f3e5f5',
        border: '2px solid #9c27b0',
        padding: '20px',
        borderRadius: '8px',
        marginBottom: '20px'
      }}>
        <h2>Test 2: Basic Number Input</h2>
        <label style={{ display: 'block', marginBottom: '10px', fontWeight: 'bold' }}>
          Type a number:
        </label>
        <input
          type="text"
          inputMode="numeric"
          defaultValue=""
          placeholder="Try typing '95' or '100'..."
          style={{
            width: '100%',
            padding: '10px',
            fontSize: '16px',
            border: '1px solid #ccc',
            borderRadius: '4px',
            boxSizing: 'border-box'
          }}
        />
        <p style={{ marginTop: '10px', fontSize: '12px', color: '#666' }}>
          ℹ️ If inputMode doesn&apos;t help, the browser might have a setting enabled.
        </p>
      </div>

      <div style={{
        backgroundColor: '#e8f5e9',
        border: '2px solid #4caf50',
        padding: '20px',
        borderRadius: '8px'
      }}>
        <h2>📋 What to Report Back</h2>
        <ul style={{ color: '#333', lineHeight: '1.8' }}>
          <li>Can you type more than 1 character in Test 1? YES / NO</li>
          <li>Can you type more than 1 character in Test 2? YES / NO</li>
          <li>Are you using a different browser? (Chrome, Firefox, Safari, Edge)</li>
          <li>Do you have any browser extensions that might interfere?</li>
        </ul>
      </div>
    </div>
  );
}
