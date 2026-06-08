#!/usr/bin/env node

/**
 * STANDALONE AUDIO FIX SCRIPT
 * Run this with: node cleanup-audio-issue.js
 *
 * Fixes the audio ID swap issue by:
 * 1. Deleting all self-feedback records
 * 2. Deleting all invalid feedback_type records
 * 3. Verifying cleanup success
 */

import https from 'https';
import { URL } from 'url';

const SUPABASE_URL = 'https://posebhpszlsozeonejtzqy.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBvYmhwc3psc296ZW9uZWp0enF5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4MzE0MywiZXhwIjoyMDk1NDU5MTQzfQ.yYu29XedkJeUnyA5WGCE2cIjmS5hrbIVQK7LbTa4Zxg';

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(SUPABASE_URL);
    const options = {
      hostname: url.hostname,
      port: 443,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'apikey': SERVICE_ROLE_KEY,
      },
      timeout: 15000,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            body: JSON.parse(data),
          });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function cleanupAudio() {
  try {
    console.log('🔧 AUDIO FIX: Starting cleanup...\n');

    // Step 1: Get all records
    console.log('📊 Step 1: Fetching all buddy_feedback records...');
    const listRes = await makeRequest(
      'GET',
      '/rest/v1/buddy_feedback?select=id,student_id,buddy_id,feedback_type,voice_note_url&limit=1000'
    );

    if (listRes.status !== 200) {
      throw new Error(`Failed to fetch records: ${JSON.stringify(listRes)}`);
    }

    const allRecords = listRes.body;
    console.log(`✅ Found ${allRecords.length} total records\n`);

    // Step 2: Identify self-feedback
    const selfIds = allRecords
      .filter(r => r.student_id === r.buddy_id)
      .map(r => r.id);

    console.log(`🗑️ Step 2: Found ${selfIds.length} self-feedback records`);

    // Step 3: Identify invalid feedback_type
    const invalidIds = allRecords
      .filter(r => !['buddy_feedback', 'student_response', 'text'].includes(r.feedback_type) || r.feedback_type === null)
      .map(r => r.id);

    console.log(`🗑️ Step 3: Found ${invalidIds.length} invalid feedback_type records\n`);

    let totalDeleted = 0;

    // Delete self-feedback
    if (selfIds.length > 0) {
      console.log('🔨 Deleting self-feedback records...');
      const deleteRes = await makeRequest(
        'DELETE',
        `/rest/v1/buddy_feedback?id=in.(${selfIds.join(',')})`
      );
      if (deleteRes.status === 204) {
        console.log(`✅ Deleted ${selfIds.length} self-feedback records\n`);
        totalDeleted += selfIds.length;
      } else {
        console.log(`⚠️ Delete response: ${deleteRes.status}\n`);
      }
    }

    // Delete invalid feedback_type
    if (invalidIds.length > 0) {
      console.log('🔨 Deleting invalid feedback_type records...');
      const deleteRes = await makeRequest(
        'DELETE',
        `/rest/v1/buddy_feedback?id=in.(${invalidIds.join(',')})`
      );
      if (deleteRes.status === 204) {
        console.log(`✅ Deleted ${invalidIds.length} invalid records\n`);
        totalDeleted += invalidIds.length;
      } else {
        console.log(`⚠️ Delete response: ${deleteRes.status}\n`);
      }
    }

    // Verify final state
    console.log('✅ Step 4: Verifying cleanup...');
    const verifyRes = await makeRequest(
      'GET',
      '/rest/v1/buddy_feedback?select=id,feedback_type,voice_note_url&limit=1000'
    );

    const finalRecords = verifyRes.body;
    const distribution = {};
    finalRecords.forEach(r => {
      const type = r.feedback_type || 'NULL';
      if (!distribution[type]) distribution[type] = 0;
      distribution[type]++;
    });

    console.log(`\n📊 FINAL RESULTS:`);
    console.log(`   Before: ${allRecords.length} records`);
    console.log(`   Deleted: ${totalDeleted} records`);
    console.log(`   After: ${finalRecords.length} records`);
    console.log(`   Distribution:`, distribution);

    console.log('\n🎉 CLEANUP COMPLETE!\n');
    console.log('NEXT STEPS:');
    console.log('1. Hard refresh app: Ctrl+Shift+R');
    console.log('2. Clear browser cache or use Incognito');
    console.log('3. Test: Student record → should NOT show in Buddy Feedback');
    console.log('4. Test: Buddy record → should show in Buddy Feedback\n');

  } catch (error) {
    console.error('❌ ERROR:', error.message);
    console.log('\nNote: If network error, the Supabase firewall may be blocking this machine.');
    console.log('Alternative: Visit https://careerrai-daily.vercel.app/api/admin/fix-audio-issue in your browser');
    process.exit(1);
  }
}

cleanupAudio();
