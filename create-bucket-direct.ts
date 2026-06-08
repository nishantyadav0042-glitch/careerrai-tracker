import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://posebhpszlsozeonejtzqy.supabase.co";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBvYmhwc3psc296ZW9uZWp0enF5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4MzE0MywiZXhwIjoyMDk1NDU5MTQzfQ.yYu29XedkJeUnyA5WGCE2cIjmS5hrbIVQK7LbTa4Zxg";

async function createBucket() {
  try {
    console.log("🔧 Creating Supabase client with service role...");
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    console.log("📦 Creating voice-notes bucket...");
    const { data, error } = await supabase.storage.createBucket("voice-notes", {
      public: true,
      fileSizeLimit: 52428800,
      allowedMimeTypes: ["audio/webm", "audio/mpeg", "audio/wav", "audio/ogg"],
    });

    if (error && error.statusCode !== 409) {
      throw error;
    }

    console.log("✅ Bucket created successfully!");
    return true;
  } catch (err) {
    console.error("❌ Error:", err);
    return false;
  }
}

createBucket().then((success) => {
  process.exit(success ? 0 : 1);
});
