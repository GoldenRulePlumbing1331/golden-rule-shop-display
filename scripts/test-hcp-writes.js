// Temporary diagnostic to verify HCP write capabilities before building
// the Weinstein automation. Tests:
//   1. PDF attachment upload to a job
//   2. Job input materials bulk update
// DELETE THIS FILE after verification.

import fs from "fs";

const HCP_BASE = "https://api.housecallpro.com";

function requireApiKey() {
  const key = process.env.HCP_API_KEY;
  if (!key) {
    throw new Error("HCP_API_KEY not set");
  }
  return key;
}

const TEST_JOB_ID = process.env.TEST_JOB_ID;
if (!TEST_JOB_ID) {
  console.error("Usage: TEST_JOB_ID=job_xxxxx npm run test-hcp-writes");
  process.exit(1);
}

function summarize(label, status, body) {
  console.log(`\n=== ${label} ===`);
  console.log(`Status: ${status}`);
  if (typeof body === "string") {
    console.log(`Body (first 800 chars): ${body.slice(0, 800)}`);
  } else {
    console.log("Body:", JSON.stringify(body, null, 2).slice(0, 2000));
  }
}

async function verifyJob() {
  console.log(`\n[step 1] Verifying test job exists: ${TEST_JOB_ID}`);
  const apiKey = requireApiKey();
  const res = await fetch(`${HCP_BASE}/jobs/${TEST_JOB_ID}`, {
    headers: {
      "Authorization": `Token ${apiKey}`,
      "Accept": "application/json",
    },
  });
  const text = await res.text();
  if (!res.ok) {
    summarize("Job lookup", res.status, text);
    throw new Error("Job not found — check TEST_JOB_ID");
  }
  const job = JSON.parse(text);
  console.log(`✓ Job exists. Customer: ${job.customer?.first_name || ""} ${job.customer?.last_name || ""}`);
  console.log(`  Status: ${job.work_status}, Description: ${(job.description || "").slice(0, 80)}`);
  return job;
}

async function testAttachmentUpload() {
  console.log(`\n[step 2] Testing PDF attachment upload...`);
  const apiKey = requireApiKey();

  const dummyPdfPath = "./output/test-attachment.pdf";
  if (!fs.existsSync("./output")) {
    fs.mkdirSync("./output", { recursive: true });
  }

  const dummyPdf = Buffer.from(
    "%PDF-1.4\n" +
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n" +
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n" +
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj\n" +
    "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n" +
    "5 0 obj << /Length 44 >> stream\n" +
    "BT /F1 24 Tf 100 700 Td (HCP API TEST) Tj ET\n" +
    "endstream endobj\n" +
    "xref\n0 6\n0000000000 65535 f\n0000000009 00000 n\n0000000056 00000 n\n0000000111 00000 n\n0000000212 00000 n\n0000000277 00000 n\n" +
    "trailer << /Size 6 /Root 1 0 R >>\n" +
    "startxref\n371\n%%EOF",
    "binary"
  );
  fs.writeFileSync(dummyPdfPath, dummyPdf);
  console.log(`  Wrote dummy PDF: ${dummyPdfPath} (${dummyPdf.length} bytes)`);

  const endpoints = [
    {
      label: "POST /jobs/{id}/attachments (multipart)",
      url: `${HCP_BASE}/jobs/${TEST_JOB_ID}/attachments`,
      method: "POST",
      bodyType: "multipart",
    },
    {
      label: "POST /attachments (with job_id in body)",
      url: `${HCP_BASE}/attachments`,
      method: "POST",
      bodyType: "multipart-with-job",
    },
  ];

  for (const endpoint of endpoints) {
    console.log(`\n  Trying: ${endpoint.label}`);
    try {
      const form = new FormData();
      const blob = new Blob([dummyPdf], { type: "application/pdf" });
      form.append("file", blob, "test-attachment.pdf");
      if (endpoint.bodyType === "multipart-with-job") {
        form.append("job_id", TEST_JOB_ID);
      }

      const res = await fetch(endpoint.url, {
        method: endpoint.method,
        headers: {
          "Authorization": `Token ${apiKey}`,
          "Accept": "application/json",
        },
        body: form,
      });
      const text = await res.text();
      summarize(endpoint.label, res.status, text);

      if (res.ok) {
        console.log(`  ✓ Attachment upload SUCCEEDED via ${endpoint.label}`);
        try {
          const data = JSON.parse(text);
          console.log(`  Attachment ID: ${data.id || data.attachment_id || "(see response above)"}`);
        } catch (e) {}
        return { success: true, endpoint: endpoint.label };
      }
    } catch (e) {
      console.log(`  ✗ Error: ${e.message}`);
    }
  }

  console.log(`\n  ✗ All attachment endpoints failed.`);
  return { success: false };
}

async function getJobInputs() {
  console.log(`\n[step 3] Fetching current job inputs/materials...`);
  const apiKey = requireApiKey();

  const endpoints = [
    `${HCP_BASE}/jobs/${TEST_JOB_ID}/materials`,
    `${HCP_BASE}/jobs/${TEST_JOB_ID}/job_input_materials`,
    `${HCP_BASE}/jobs/${TEST_JOB_ID}/inputs/materials`,
    `${HCP_BASE}/jobs/${TEST_JOB_ID}/line_items`,
  ];

  for (const url of endpoints) {
    console.log(`  Trying: GET ${url.replace(HCP_BASE, "")}`);
    try {
      const res = await fetch(url, {
        headers: {
          "Authorization": `Token ${apiKey}`,
          "Accept": "application/json",
        },
      });
      const text = await res.text();
      if (res.ok) {
        console.log(`  ✓ Endpoint works: ${url}`);
        console.log(`    Response (first 500 chars):`);
        console.log(`    ${text.slice(0, 500)}`);
        return { url, body: text };
      } else {
        console.log(`    Status ${res.status}: ${text.slice(0, 200)}`);
      }
    } catch (e) {
      console.log(`    Error: ${e.message}`);
    }
  }
  return null;
}

async function testJobInputMaterial() {
  console.log(`\n[step 4] Testing job input material addition...`);
  const apiKey = requireApiKey();

  const attempts = [
    {
      label: "PATCH /jobs/{id}/materials/bulk_update",
      url: `${HCP_BASE}/jobs/${TEST_JOB_ID}/materials/bulk_update`,
      method: "PATCH",
      body: {
        materials: [{
          name: "HCP API TEST — Delete Me",
          quantity: 1,
          unit_price_cents: 100,
        }],
      },
    },
    {
      label: "POST /jobs/{id}/materials",
      url: `${HCP_BASE}/jobs/${TEST_JOB_ID}/materials`,
      method: "POST",
      body: {
        name: "HCP API TEST — Delete Me",
        quantity: 1,
        unit_price_cents: 100,
      },
    },
    {
      label: "POST /jobs/{id}/job_input_materials",
      url: `${HCP_BASE}/jobs/${TEST_JOB_ID}/job_input_materials`,
      method: "POST",
      body: {
        name: "HCP API TEST — Delete Me",
        quantity: 1,
        unit_price_cents: 100,
      },
    },
    {
      label: "PATCH /jobs/{id}/job_input_materials/bulk_update",
      url: `${HCP_BASE}/jobs/${TEST_JOB_ID}/job_input_materials/bulk_update`,
      method: "PATCH",
      body: {
        materials: [{
          name: "HCP API TEST — Delete Me",
          quantity: 1,
          unit_price_cents: 100,
        }],
      },
    },
  ];

  for (const attempt of attempts) {
    console.log(`\n  Trying: ${attempt.method} ${attempt.url.replace(HCP_BASE, "")}`);
    try {
      const res = await fetch(attempt.url, {
        method: attempt.method,
        headers: {
          "Authorization": `Token ${apiKey}`,
          "Accept": "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(attempt.body),
      });
      const text = await res.text();
      summarize(attempt.label, res.status, text);

      if (res.ok) {
        console.log(`  ✓ Job input material added via ${attempt.label}`);
        return { success: true, endpoint: attempt.label, response: text };
      }
    } catch (e) {
      console.log(`  ✗ Error: ${e.message}`);
    }
  }

  console.log(`\n  ✗ All job input material endpoints failed.`);
  return { success: false };
}

async function main() {
  console.log("HCP Write Capabilities Diagnostic");
  console.log("==================================");
  console.log(`Test job ID: ${TEST_JOB_ID}`);

  try {
    await verifyJob();
  } catch (e) {
    console.error(`\n✗ Cannot proceed: ${e.message}`);
    process.exit(1);
  }

  const attachResult = await testAttachmentUpload();
  const existingInputs = await getJobInputs();
  const inputResult = await testJobInputMaterial();

  console.log("\n\n========== SUMMARY ==========");
  console.log(`PDF attachment upload: ${attachResult.success ? "✓ WORKS via " + attachResult.endpoint : "✗ FAILED"}`);
  console.log(`Job inputs/materials lookup: ${existingInputs ? "✓ WORKS at " + existingInputs.url : "✗ NO WORKING ENDPOINT"}`);
  console.log(`Job input material write: ${inputResult.success ? "✓ WORKS via " + inputResult.endpoint : "✗ FAILED"}`);
  console.log("\n--- NEXT STEPS ---");
  console.log("1. Open the test job in HCP UI");
  console.log("2. Check the Attachments section — is 'test-attachment.pdf' there?");
  console.log("3. Check the Materials/Job Inputs section — is 'HCP API TEST — Delete Me' there?");
  console.log("4. Manually delete both test items from HCP UI");
}

main().catch(err => {
  console.error("FATAL:", err);
  process.exit(1);
});
