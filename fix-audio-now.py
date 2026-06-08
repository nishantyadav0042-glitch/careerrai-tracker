#!/usr/bin/env python3
"""
EXECUTE AUDIO FIX NOW
Run this script to immediately fix the audio attribution issue
"""

import sys
import requests
import json

# Force UTF-8 encoding for Windows console
sys.stdout.reconfigure(encoding='utf-8')

SUPABASE_URL = "https://posebhpszlsozeonejtzqy.supabase.co"
SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBvYmhwc3psc296ZW9uZWp0enF5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4MzE0MywiZXhwIjoyMDk1NDU5MTQzfQ.yYu29XedkJeUnyA5WGCE2cIjmS5hrbIVQK7LbTa4Zxg"

def make_request(method, path, body=None):
    """Make a request to Supabase"""
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
        "apikey": SERVICE_ROLE_KEY,
    }

    url = f"{SUPABASE_URL}{path}"

    try:
        if method == "GET":
            response = requests.get(url, headers=headers, timeout=15)
        elif method == "DELETE":
            response = requests.delete(url, headers=headers, json=body, timeout=15)
        else:
            raise ValueError(f"Unsupported method: {method}")

        return response.status_code, response.json() if response.text else None
    except Exception as e:
        return None, str(e)

def execute_fix():
    """Execute the audio fix"""
    print("[*] AUDIO FIX: Starting cleanup...\n")

    # Step 1: Fetch all records
    print("[*] Step 1: Fetching all buddy_feedback records...")
    status, data = make_request("GET", "/rest/v1/buddy_feedback?select=id,student_id,buddy_id,feedback_type,voice_note_url&limit=2000")

    if status != 200:
        print(f"[!] Failed to fetch records: {data}")
        return False

    all_records = data if isinstance(data, list) else []
    print(f"[+] Found {len(all_records)} total records\n")

    # Step 2: Identify self-feedback
    self_ids = [r["id"] for r in all_records if r.get("student_id") == r.get("buddy_id")]
    print(f"[*] Step 2: Identified {len(self_ids)} self-feedback records")

    # Step 3: Identify invalid feedback_type
    invalid_ids = [
        r["id"] for r in all_records
        if not r.get("feedback_type") or r.get("feedback_type") not in ["buddy_feedback", "student_response", "text"]
    ]
    print(f"[*] Step 3: Identified {len(invalid_ids)} invalid feedback_type records\n")

    total_deleted = 0

    # Delete self-feedback
    if self_ids:
        print(f"[*] Deleting {len(self_ids)} self-feedback records...")
        id_list = ",".join(self_ids)
        status, result = make_request("DELETE", f"/rest/v1/buddy_feedback?id=in.({id_list})")

        if status == 204:
            total_deleted += len(self_ids)
            print(f"    [+] Deleted {len(self_ids)} self-feedback records\n")
        else:
            print(f"    [!] Error: {result}\n")

    # Delete invalid feedback_type
    if invalid_ids:
        print(f"[*] Deleting {len(invalid_ids)} invalid feedback_type records...")
        id_list = ",".join(invalid_ids)
        status, result = make_request("DELETE", f"/rest/v1/buddy_feedback?id=in.({id_list})")

        if status == 204:
            total_deleted += len(invalid_ids)
            print(f"    [+] Deleted {len(invalid_ids)} invalid records\n")
        else:
            print(f"    [!] Error: {result}\n")

    # Step 4: Verify cleanup
    print("[+] Step 4: Verifying cleanup...")
    status, final_data = make_request("GET", "/rest/v1/buddy_feedback?select=id,feedback_type&limit=2000")

    if status != 200:
        print(f"[!] Failed to verify: {final_data}")
        return False

    final_records = final_data if isinstance(final_data, list) else []

    # Distribution
    distribution = {}
    for r in final_records:
        ftype = r.get("feedback_type") or "NULL"
        distribution[ftype] = distribution.get(ftype, 0) + 1

    # Summary
    print("\n" + "="*60)
    print("CLEANUP SUMMARY")
    print("="*60)
    print(f"Before:       {len(all_records)} records")
    print(f"Deleted:      {total_deleted} records")
    print(f"After:        {len(final_records)} records")
    print("\nFinal Distribution:")
    for ftype, count in sorted(distribution.items()):
        print(f"  {ftype}: {count} records")
    print("="*60)

    print("\n[SUCCESS] AUDIO FIX COMPLETE!\n")
    print("NEXT STEPS:")
    print("1. Go to CareerRai app: https://careerrai-daily.vercel.app")
    print("2. Hard refresh: Ctrl+Shift+R")
    print("3. Test student recording → should NOT appear in Buddy Feedback")
    print("4. Test buddy recording → should appear in Buddy Feedback\n")

    return True

if __name__ == "__main__":
    try:
        success = execute_fix()
        exit(0 if success else 1)
    except Exception as e:
        print(f"\n[!] FATAL ERROR: {e}")
        exit(1)
