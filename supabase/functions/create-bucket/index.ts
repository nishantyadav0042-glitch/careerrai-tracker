import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Create bucket
    const { data, error } = await supabase.storage.createBucket("voice-notes", {
      public: true,
      fileSizeLimit: 52428800,
      allowedMimeTypes: ["audio/webm", "audio/mpeg", "audio/wav", "audio/ogg"],
    })

    if (error && (error as { statusCode?: number }).statusCode !== 409) {
      throw error
    }

    // Test bucket
    const testBlob = new Blob(["test"], { type: "audio/webm" })
    const testFile = new File([testBlob], "test.webm", { type: "audio/webm" })
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("voice-notes")
      .upload(`test-${Date.now()}.webm`, testFile, { upsert: true })

    if (uploadError) throw uploadError

    // Clean up
    await supabase.storage.from("voice-notes").remove([uploadData.path])

    return new Response(
      JSON.stringify({
        success: true,
        message: "✅ voice-notes bucket created and tested successfully!",
      }),
      { headers: { "Content-Type": "application/json" } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
})
